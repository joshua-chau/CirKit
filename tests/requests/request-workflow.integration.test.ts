import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { Client } from "pg";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { RequestError } from "../../src/lib/requests/request-errors";
import type { RequestErrorCode } from "../../src/lib/requests/request-errors";
import type { ValidatedCreateRequestInput } from "../../src/lib/requests/request-types";

type RequestService = typeof import("../../src/lib/requests/request-service");

function makeInput(
  overrides: Partial<ValidatedCreateRequestInput> = {},
): ValidatedCreateRequestInput {
  const requestStartDate = new Date("2026-11-10T00:00:00.000Z");
  const requestEndDate = new Date("2026-11-12T00:00:00.000Z");
  const input: ValidatedCreateRequestInput = {
    itemId: "item",
    groupId: "group",
    requestStartDate: requestStartDate,
    requestEndDate: requestEndDate,
    ...overrides,
  };

  return input;
}

async function seedFixtures(database: PrismaClient) {
  await database.user.createMany({
    data: [
      { id: "owner", name: "Owner", email: "owner@example.invalid" },
      { id: "borrower", name: "Borrower", email: "borrower@example.invalid" },
      { id: "borrower2", name: "Borrower 2", email: "borrower2@example.invalid" },
      { id: "outsider", name: "Outsider", email: "outsider@example.invalid" },
    ],
  });
  await database.group.createMany({
    data: [
      { id: "group", name: "First group" },
      { id: "group2", name: "Second group" },
      { id: "unshared-group", name: "Unshared group" },
    ],
  });
  await database.groupMember.createMany({
    data: [
      { groupId: "group", userId: "owner", role: "OWNER" },
      { groupId: "group", userId: "borrower" },
      { groupId: "group", userId: "borrower2" },
      { groupId: "group2", userId: "borrower2", role: "OWNER" },
      { groupId: "unshared-group", userId: "borrower" },
    ],
  });
  await database.item.create({
    data: {
      itemId: "item",
      ownerId: "owner",
      itemName: "Drill",
      itemDescription: "Integration test fixture",
      itemCategory: "Tools",
      itemCondition: "Good",
    },
  });
  await database.itemAccess.createMany({
    data: [
      { itemId: "item", groupId: "group" },
      { itemId: "item", groupId: "group2" },
    ],
  });
}

test("Request Services with PostgreSQL", async (context) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  if (!originalDatabaseUrl) {
    throw new Error("DATABASE_URL is required for integration tests.");
  }

  // Replay all migrations in a new isolated database, never the development DB.
  const token = randomUUID();
  const safeToken = token.replaceAll("-", "");
  const testDatabaseName = "cirkit_request_test_" + safeToken;
  const allowedName = /^cirkit_request_test_[a-f0-9]{32}$/;

  if (!allowedName.test(testDatabaseName)) {
    throw new Error("Unexpected test database name.");
  }

  const testUrl = new URL(originalDatabaseUrl);
  testUrl.pathname = "/" + testDatabaseName;
  const testConnectionString = testUrl.toString();
  const admin = new Client({ connectionString: originalDatabaseUrl });
  const migrationClient = new Client({ connectionString: testConnectionString });
  let databaseCreated = false;
  let database: PrismaClient | undefined;

  await admin.connect();

  try {
    const createSql = 'CREATE DATABASE "' + testDatabaseName + '"';
    await admin.query(createSql);
    databaseCreated = true;
    await migrationClient.connect();

    const migrationsUrl = new URL("../../prisma/migrations/", import.meta.url);
    const entries = await readdir(migrationsUrl, { withFileTypes: true });
    const migrationNames: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        migrationNames.push(entry.name);
      }
    }

    migrationNames.sort();

    for (const migrationName of migrationNames) {
      const sqlUrl = new URL(migrationName + "/migration.sql", migrationsUrl);
      const sql = await readFile(sqlUrl, "utf8");
      await migrationClient.query(sql);
    }

    // Import the real singleton and Service only after selecting the test DB.
    process.env.DATABASE_URL = testConnectionString;
    const databaseModule = await import("../../src/lib/prisma");
    const service: RequestService = await import("../../src/lib/requests/request-service");
    database = databaseModule.default;
    const testDatabase = database;
    await seedFixtures(testDatabase);

    context.beforeEach(async () => {
      await testDatabase.request.deleteMany();
      await testDatabase.item.update({
        where: { itemId: "item" },
        data: { itemStatus: "AVAILABLE", itemArchivedAt: null },
      });
    });

    async function expectFailure(
      userId: string,
      input: ValidatedCreateRequestInput,
      expectedCode: RequestErrorCode,
      expectedMessage: string,
    ) {
      const beforeCount = await testDatabase.request.count();
      const action = async () => {
        await service.createRequest(userId, input);
      };
      const matchesExpectedError = (error: unknown) => {
        if (!(error instanceof RequestError)) {
          return false;
        }

        assert.equal(error.code, expectedCode);
        assert.equal(error.message, expectedMessage);

        return true;
      };

      await assert.rejects(action, matchesExpectedError);
      const afterCount = await testDatabase.request.count();
      assert.equal(afterCount, beforeCount);
    }

    await context.test("creates the correct Pending record without borrowing the item", async () => {
      const input = makeInput();
      const request = await service.createRequest("borrower", input);
      assert.equal(request.itemId, "item");
      assert.equal(request.borrowerId, "borrower");
      assert.equal(request.groupId, "group");
      assert.equal(request.requestStatus, "PENDING");
      assert.equal(request.requestCompletedAt, null);
      assert.ok(request.requestId);
      const saved = await testDatabase.request.findUniqueOrThrow({
        where: { requestId: request.requestId },
      });
      const savedStart = saved.requestStartDate.toISOString();
      const savedEnd = saved.requestEndDate.toISOString();
      assert.equal(savedStart, "2026-11-10T00:00:00.000Z");
      assert.equal(savedEnd, "2026-11-12T00:00:00.000Z");
      const item = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      assert.equal(item.itemStatus, "AVAILABLE");
    });

    await context.test("rejects a missing item and binds SQL-looking IDs as data", async () => {
      for (const itemId of ["missing-item", "item' OR 1=1 --"]) {
        const input = makeInput({ itemId: itemId });
        await expectFailure("borrower", input, "NOT_FOUND", "The requested item was not found.");
      }
    });

    await context.test("rejects a missing source group", async () => {
      const input = makeInput({ groupId: "missing-group" });
      await expectFailure("borrower", input, "NOT_FOUND", "The selected group was not found.");
    });

    await context.test("rejects users outside the selected group", async () => {
      const input = makeInput();
      await expectFailure("outsider", input, "FORBIDDEN", "You must belong to this group to request an item.");
      const otherGroupInput = makeInput({ groupId: "group2" });
      await expectFailure("borrower", otherGroupInput, "FORBIDDEN", "You must belong to this group to request an item.");
    });

    await context.test("rejects access through a group where the item is not shared", async () => {
      const input = makeInput({ groupId: "unshared-group" });
      await expectFailure("borrower", input, "FORBIDDEN", "This item is not shared with the selected group.");
    });

    await context.test("rejects requesting one's own item", async () => {
      const input = makeInput();
      await expectFailure("owner", input, "FORBIDDEN", "You cannot request your own item.");
    });

    await context.test("rejects archived items", async () => {
      const archivedAt = new Date();
      await testDatabase.item.update({
        where: { itemId: "item" },
        data: { itemArchivedAt: archivedAt },
      });
      const input = makeInput();
      await expectFailure("borrower", input, "CONFLICT", "This item has been archived.");
    });

    await context.test("rejects borrowed items", async () => {
      await testDatabase.item.update({
        where: { itemId: "item" },
        data: { itemStatus: "BORROWED" },
      });
      const input = makeInput();
      await expectFailure("borrower", input, "CONFLICT", "This item is already borrowed.");
    });

    await context.test("allows Pending requests from different groups and group roles", async () => {
      const firstInput = makeInput();
      const secondInput = makeInput({ groupId: "group2" });
      await service.createRequest("borrower", firstInput);
      const second = await service.createRequest("borrower2", secondInput);
      assert.equal(second.groupId, "group2");
      assert.equal(second.requestStatus, "PENDING");
      const count = await testDatabase.request.count();
      assert.equal(count, 2);
    });

    await context.test("allows two concurrent Pending submissions for an available item", async () => {
      const input = makeInput();
      const first = service.createRequest("borrower", input);
      const second = service.createRequest("borrower2", input);
      const requests = await Promise.all([first, second]);
      assert.notEqual(requests[0].requestId, requests[1].requestId);

      for (const request of requests) {
        assert.equal(request.requestStatus, "PENDING");
      }

      const count = await testDatabase.request.count();
      assert.equal(count, 2);
    });

    await context.test("waits for the Item lock and rejects a newly borrowed item", async () => {
      const blocker = new Client({ connectionString: testConnectionString });
      await blocker.connect();
      await blocker.query("BEGIN");
      await blocker.query(`SELECT "itemId" FROM "Item" WHERE "itemId" = 'item' FOR UPDATE`);
      const input = makeInput();
      // Observe success and failure immediately to avoid unhandled rejections.
      const attempt = service.createRequest("borrower", input).then(
        (request) => {
          const outcome = { request: request, error: null };

          return outcome;
        },
        (error: unknown) => {
          const outcome = { request: null, error: error };

          return outcome;
        },
      );
      let transactionOpen = true;

      try {
        const deadline = Date.now() + 2000;
        let waiting = false;

        while (Date.now() < deadline) {
          const activity = await migrationClient.query(
            `SELECT 1 FROM pg_stat_activity WHERE datname = $1 AND wait_event_type = 'Lock'`,
            [testDatabaseName],
          );

          if (activity.rows.length > 0) {
            waiting = true;
            break;
          }

          await setTimeout(10);
        }

        assert.equal(waiting, true, "The Service must wait for the Item row lock.");
        await blocker.query(`UPDATE "Item" SET "itemStatus" = 'BORROWED' WHERE "itemId" = 'item'`);
        await blocker.query("COMMIT");
        transactionOpen = false;
        const outcome = await attempt;
        assert.equal(outcome.request, null);
        assert.ok(outcome.error instanceof RequestError);
        assert.equal(outcome.error.code, "CONFLICT");
        assert.equal(outcome.error.message, "This item is already borrowed.");
        const count = await testDatabase.request.count();
        assert.equal(count, 0);
      } finally {
        if (transactionOpen) {
          await blocker.query("ROLLBACK");
        }

        await attempt;
        await blocker.end();
      }
    });
    await context.test("getMyRequests returns an empty list without applications", async () => {
      const requests = await service.getMyRequests("outsider");
      assert.deepEqual(requests, []);
    });

    await context.test("getMyRequests excludes other borrowers and received applications", async () => {
      const input = makeInput();
      const own = await service.createRequest("borrower", input);
      await service.createRequest("borrower2", input);
      const requests = await service.getMyRequests("borrower");
      assert.equal(requests.length, 1);
      assert.equal(requests[0].requestId, own.requestId);
      assert.equal(requests[0].borrowerId, "borrower");
      const ownerRequests = await service.getMyRequests("owner");
      assert.deepEqual(ownerRequests, []);
    });

    await context.test("getMyRequests includes all statuses and source groups, newest first", async () => {
      const statuses = ["PENDING", "APPROVED", "DECLINED", "CANCELLED", "COMPLETED"] as const;
      const input = makeInput();
      let index = 0;

      for (const status of statuses) {
        index += 1;
        let groupId = "group";

        if (index % 2 === 0) {
          groupId = "group2";
        }

        const createdTimestamp = Date.UTC(2026, 10, index);
        const createdAt = new Date(createdTimestamp);
        let completedAt: Date | null = null;

        if (status === "COMPLETED") {
          completedAt = createdAt;
        }

        await testDatabase.request.create({
          data: {
            itemId: "item",
            borrowerId: "borrower",
            groupId: groupId,
            requestStartDate: input.requestStartDate,
            requestEndDate: input.requestEndDate,
            requestStatus: status,
            requestCreatedAt: createdAt,
            requestCompletedAt: completedAt,
          },
        });
      }

      const requests = await service.getMyRequests("borrower");
      const actualStatuses = requests.map((request) => {
        const status = request.requestStatus;

        return status;
      });
      assert.deepEqual(actualStatuses, ["COMPLETED", "CANCELLED", "DECLINED", "APPROVED", "PENDING"]);
      const actualGroups = new Set<string>();

      for (const request of requests) {
        actualGroups.add(request.groupId);
      }

      assert.equal(actualGroups.size, 2);
    });

    await context.test("getMyRequests orders identical timestamps by descending requestId", async () => {
      const input = makeInput();
      const createdAt = new Date("2026-11-01T00:00:00.000Z");

      for (const requestId of ["read-b", "read-c", "read-a"]) {
        await testDatabase.request.create({
          data: {
            requestId: requestId,
            itemId: "item",
            borrowerId: "borrower",
            groupId: "group",
            requestStartDate: input.requestStartDate,
            requestEndDate: input.requestEndDate,
            requestCreatedAt: createdAt,
          },
        });
      }

      const requests = await service.getMyRequests("borrower");
      const actualIds = requests.map((request) => {
        const requestId = request.requestId;

        return requestId;
      });
      assert.deepEqual(actualIds, ["read-c", "read-b", "read-a"]);
    });

    await context.test("getMyRequests preserves completed history after archiving and access revocation", async () => {
      const input = makeInput();
      const original = await service.createRequest("borrower", input);
      const completedAt = new Date();
      await testDatabase.request.update({
        where: { requestId: original.requestId },
        data: { requestStatus: "COMPLETED", requestCompletedAt: completedAt },
      });
      await testDatabase.item.update({
        where: { itemId: "item" },
        data: { itemArchivedAt: completedAt },
      });
      await testDatabase.itemAccess.deleteMany({
        where: { itemId: "item", groupId: "group" },
      });

      try {
        const requests = await service.getMyRequests("borrower");
        assert.equal(requests.length, 1);
        assert.equal(requests[0].requestId, original.requestId);
        assert.equal(requests[0].requestStatus, "COMPLETED");
        assert.equal(requests[0].groupId, "group");
      } finally {
        await testDatabase.itemAccess.create({
          data: { itemId: "item", groupId: "group" },
        });
      }
    });
    await context.test("getItemRequests returns an empty list for an owned item", async () => {
      const requests = await service.getItemRequests("owner", "item");
      assert.deepEqual(requests, []);
    });

    await context.test("getItemRequests rejects a missing item", async () => {
      const action = async () => {
        await service.getItemRequests("owner", "missing-item");
      };
      const expectedError = (error: unknown) => {
        assert.ok(error instanceof RequestError);
        assert.equal(error.code, "NOT_FOUND");
        assert.equal(error.message, "The requested item was not found.");

        return true;
      };
      await assert.rejects(action, expectedError);
    });

    await context.test("getItemRequests rejects non-owners including a group Owner", async () => {
      const input = makeInput();
      await service.createRequest("borrower", input);

      for (const userId of ["borrower", "borrower2", "outsider"]) {
        const action = async () => {
          await service.getItemRequests(userId, "item");
        };
        const expectedError = (error: unknown) => {
          assert.ok(error instanceof RequestError);
          assert.equal(error.code, "FORBIDDEN");
          assert.equal(error.message, "Only the item owner can view its received requests.");

          return true;
        };
        await assert.rejects(action, expectedError);
      }
    });

    await context.test("getItemRequests includes all statuses, borrowers and groups but only the requested item", async () => {
      const input = makeInput();
      const statuses = ["PENDING", "APPROVED", "DECLINED", "CANCELLED", "COMPLETED"] as const;
      let index = 0;

      for (const status of statuses) {
        index += 1;
        let borrowerId = "borrower";
        let groupId = "group";

        if (index % 2 === 0) {
          borrowerId = "borrower2";
          groupId = "group2";
        }

        const timestamp = Date.UTC(2026, 10, index);
        const createdAt = new Date(timestamp);
        let completedAt: Date | null = null;

        if (status === "COMPLETED") {
          completedAt = createdAt;
        }

        await testDatabase.request.create({
          data: {
            itemId: "item",
            borrowerId: borrowerId,
            groupId: groupId,
            requestStartDate: input.requestStartDate,
            requestEndDate: input.requestEndDate,
            requestStatus: status,
            requestCreatedAt: createdAt,
            requestCompletedAt: completedAt,
          },
        });
      }

      await testDatabase.item.create({
        data: {
          itemId: "other-item",
          ownerId: "owner",
          itemName: "Other tool",
          itemDescription: "Item filter fixture",
          itemCategory: "Tools",
          itemCondition: "Good",
        },
      });

      try {
        await testDatabase.request.create({
          data: {
            itemId: "other-item",
            borrowerId: "borrower",
            groupId: "group",
            requestStartDate: input.requestStartDate,
            requestEndDate: input.requestEndDate,
          },
        });
        const requests = await service.getItemRequests("owner", "item");
        const actualStatuses = requests.map((request) => {
          const status = request.requestStatus;

          return status;
        });
        assert.deepEqual(actualStatuses, ["COMPLETED", "CANCELLED", "DECLINED", "APPROVED", "PENDING"]);
        const borrowers = new Set<string>();
        const groups = new Set<string>();

        for (const request of requests) {
          assert.equal(request.itemId, "item");
          borrowers.add(request.borrowerId);
          groups.add(request.groupId);
        }

        assert.equal(borrowers.size, 2);
        assert.equal(groups.size, 2);
      } finally {
        await testDatabase.request.deleteMany({ where: { itemId: "other-item" } });
        await testDatabase.item.delete({ where: { itemId: "other-item" } });
      }
    });

    await context.test("getItemRequests orders equal timestamps deterministically", async () => {
      const input = makeInput();
      const createdAt = new Date("2026-11-01T00:00:00.000Z");

      for (const requestId of ["item-read-b", "item-read-c", "item-read-a"]) {
        await testDatabase.request.create({
          data: {
            requestId: requestId,
            itemId: "item",
            borrowerId: "borrower",
            groupId: "group",
            requestStartDate: input.requestStartDate,
            requestEndDate: input.requestEndDate,
            requestCreatedAt: createdAt,
          },
        });
      }

      const requests = await service.getItemRequests("owner", "item");
      const ids = requests.map((request) => {
        const requestId = request.requestId;

        return requestId;
      });
      assert.deepEqual(ids, ["item-read-c", "item-read-b", "item-read-a"]);
    });

    await context.test("getItemRequests retains history after item archiving and access revocation", async () => {
      const input = makeInput();
      const original = await service.createRequest("borrower", input);
      const completedAt = new Date();
      await testDatabase.request.update({
        where: { requestId: original.requestId },
        data: { requestStatus: "COMPLETED", requestCompletedAt: completedAt },
      });
      await testDatabase.item.update({
        where: { itemId: "item" },
        data: { itemArchivedAt: completedAt },
      });
      await testDatabase.itemAccess.deleteMany({
        where: { itemId: "item", groupId: "group" },
      });

      try {
        const requests = await service.getItemRequests("owner", "item");
        assert.equal(requests.length, 1);
        assert.equal(requests[0].requestId, original.requestId);
        assert.equal(requests[0].requestStatus, "COMPLETED");
      } finally {
        await testDatabase.itemAccess.create({
          data: { itemId: "item", groupId: "group" },
        });
      }
    });
    async function approvalSnapshot() {
      const requests = await testDatabase.request.findMany({ orderBy: { requestId: "asc" } });
      const item = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      const snapshot = { requests: requests, item: item };

      return snapshot;
    }

    async function expectApprovalFailure(
      userId: string,
      requestId: string,
      expectedCode: RequestErrorCode,
      expectedMessage: string,
    ) {
      const before = await approvalSnapshot();
      const action = async () => {
        await service.approveRequest(userId, requestId);
      };
      const expectedError = (error: unknown) => {
        assert.ok(error instanceof RequestError);
        assert.equal(error.code, expectedCode);
        assert.equal(error.message, expectedMessage);

        return true;
      };

      await assert.rejects(action, expectedError);
      const after = await approvalSnapshot();
      assert.deepEqual(after, before);
    }

    await context.test("approveRequest approves one and declines other groups regardless of date overlap", async () => {
      const firstInput = makeInput();
      const secondStart = new Date("2026-12-10T00:00:00.000Z");
      const secondEnd = new Date("2026-12-12T00:00:00.000Z");
      const secondInput = makeInput({
        groupId: "group2",
        requestStartDate: secondStart,
        requestEndDate: secondEnd,
      });
      const first = await service.createRequest("borrower", firstInput);
      const second = await service.createRequest("borrower2", secondInput);
      const approved = await service.approveRequest("owner", first.requestId);
      assert.equal(approved.requestId, first.requestId);
      assert.equal(approved.requestStatus, "APPROVED");
      assert.equal(approved.requestCompletedAt, null);
      const other = await testDatabase.request.findUniqueOrThrow({ where: { requestId: second.requestId } });
      assert.equal(other.requestStatus, "DECLINED");
      const item = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      assert.equal(item.itemStatus, "BORROWED");
      await expectFailure("borrower2", firstInput, "CONFLICT", "This item is already borrowed.");
    });

    await context.test("approveRequest rejects missing requests without changing data", async () => {
      await expectApprovalFailure("owner", "missing-request", "NOT_FOUND", "The request was not found.");
    });

    await context.test("approveRequest rejects borrowers, outsiders and group Owners who do not own the item", async () => {
      const input = makeInput();
      const request = await service.createRequest("borrower", input);

      for (const userId of ["borrower", "borrower2", "outsider"]) {
        await expectApprovalFailure(userId, request.requestId, "FORBIDDEN", "Only the item owner can approve its requests.");
      }
    });

    await context.test("approveRequest rejects every non-Pending state including repeated approval", async () => {
      const input = makeInput();
      const request = await service.createRequest("borrower", input);
      const statuses = ["APPROVED", "DECLINED", "CANCELLED", "COMPLETED"] as const;

      for (const status of statuses) {
        let itemStatus: "AVAILABLE" | "BORROWED" = "AVAILABLE";
        let completedAt: Date | null = null;

        if (status === "APPROVED") {
          itemStatus = "BORROWED";
        }

        if (status === "COMPLETED") {
          completedAt = new Date();
        }

        await testDatabase.request.update({
          where: { requestId: request.requestId },
          data: { requestStatus: status, requestCompletedAt: completedAt },
        });
        await testDatabase.item.update({ where: { itemId: "item" }, data: { itemStatus: itemStatus } });
        await expectApprovalFailure("owner", request.requestId, "CONFLICT", "This request is no longer pending.");
      }
    });

    await context.test("approveRequest rejects an item archived after submission", async () => {
      const input = makeInput();
      const request = await service.createRequest("borrower", input);
      const archivedAt = new Date();
      await testDatabase.item.update({ where: { itemId: "item" }, data: { itemArchivedAt: archivedAt } });
      await expectApprovalFailure("owner", request.requestId, "CONFLICT", "This item has been archived.");
    });

    await context.test("approveRequest rejects a Pending request while another approved loan occupies the item", async () => {
      const input = makeInput();
      const first = await service.createRequest("borrower", input);
      const second = await service.createRequest("borrower2", input);
      await testDatabase.request.update({ where: { requestId: first.requestId }, data: { requestStatus: "APPROVED" } });
      await testDatabase.item.update({ where: { itemId: "item" }, data: { itemStatus: "BORROWED" } });
      await expectApprovalFailure("owner", second.requestId, "CONFLICT", "This item is already borrowed.");
    });

    await context.test("approveRequest rejects revoked source access without partially approving", async () => {
      const input = makeInput();
      const request = await service.createRequest("borrower", input);
      // Deliberately simulate stale Pending data left by an incomplete access-revocation operation.
      await testDatabase.itemAccess.deleteMany({ where: { itemId: "item", groupId: "group" } });

      try {
        await expectApprovalFailure("owner", request.requestId, "FORBIDDEN", "This item is no longer shared with the request's source group.");
      } finally {
        await testDatabase.itemAccess.create({ data: { itemId: "item", groupId: "group" } });
      }
    });

    await context.test("approveRequest preserves historical states and requests for other items", async () => {
      const input = makeInput();
      const selected = await service.createRequest("borrower", input);
      const histories = ["DECLINED", "CANCELLED", "COMPLETED"] as const;
      const historyIds: string[] = [];

      for (const status of histories) {
        let completedAt: Date | null = null;

        if (status === "COMPLETED") {
          completedAt = new Date();
        }

        const history = await testDatabase.request.create({
          data: {
            itemId: "item",
            borrowerId: "borrower2",
            groupId: "group2",
            requestStartDate: input.requestStartDate,
            requestEndDate: input.requestEndDate,
            requestStatus: status,
            requestCompletedAt: completedAt,
          },
        });
        historyIds.push(history.requestId);
      }

      const historiesBefore = await testDatabase.request.findMany({
        where: { requestId: { in: historyIds } },
        orderBy: { requestId: "asc" },
      });
      await testDatabase.item.create({
        data: {
          itemId: "approve-other-item",
          ownerId: "owner",
          itemName: "Other item",
          itemDescription: "Approval isolation fixture",
          itemCategory: "Tools",
          itemCondition: "Good",
        },
      });

      try {
        const other = await testDatabase.request.create({
          data: {
            itemId: "approve-other-item",
            borrowerId: "borrower",
            groupId: "group",
            requestStartDate: input.requestStartDate,
            requestEndDate: input.requestEndDate,
          },
        });
        await service.approveRequest("owner", selected.requestId);
        const historiesAfter = await testDatabase.request.findMany({
          where: { requestId: { in: historyIds } },
          orderBy: { requestId: "asc" },
        });
        assert.deepEqual(historiesAfter, historiesBefore);
        const savedOther = await testDatabase.request.findUniqueOrThrow({ where: { requestId: other.requestId } });
        assert.deepEqual(savedOther, other);
        const otherItem = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "approve-other-item" } });
        assert.equal(otherItem.itemStatus, "AVAILABLE");
      } finally {
        await testDatabase.request.deleteMany({ where: { itemId: "approve-other-item" } });
        await testDatabase.item.delete({ where: { itemId: "approve-other-item" } });
      }
    });

    await context.test("approveRequest allows exactly one winner when different requests are approved concurrently", async () => {
      const input = makeInput();
      const first = await service.createRequest("borrower", input);
      const second = await service.createRequest("borrower2", input);
      const firstApproval = service.approveRequest("owner", first.requestId);
      const secondApproval = service.approveRequest("owner", second.requestId);
      const outcomes = await Promise.allSettled([firstApproval, secondApproval]);
      let successCount = 0;
      let conflictCount = 0;

      for (const outcome of outcomes) {
        if (outcome.status === "fulfilled") {
          successCount += 1;
          assert.equal(outcome.value.requestStatus, "APPROVED");
        } else {
          assert.ok(outcome.reason instanceof RequestError);
          assert.equal(outcome.reason.code, "CONFLICT");
          conflictCount += 1;
        }
      }

      assert.equal(successCount, 1);
      assert.equal(conflictCount, 1);
      const approvedCount = await testDatabase.request.count({ where: { requestStatus: "APPROVED" } });
      const declinedCount = await testDatabase.request.count({ where: { requestStatus: "DECLINED" } });
      assert.equal(approvedCount, 1);
      assert.equal(declinedCount, 1);
    });

    await context.test("approveRequest cannot approve the same request twice concurrently", async () => {
      const input = makeInput();
      const request = await service.createRequest("borrower", input);
      const firstApproval = service.approveRequest("owner", request.requestId);
      const secondApproval = service.approveRequest("owner", request.requestId);
      const outcomes = await Promise.allSettled([firstApproval, secondApproval]);
      let successCount = 0;
      let conflictCount = 0;

      for (const outcome of outcomes) {
        if (outcome.status === "fulfilled") {
          successCount += 1;
        } else {
          assert.ok(outcome.reason instanceof RequestError);
          assert.equal(outcome.reason.code, "CONFLICT");
          conflictCount += 1;
        }
      }

      assert.equal(successCount, 1);
      assert.equal(conflictCount, 1);
    });

    await context.test("approveRequest and createRequest leave no Pending request behind a successful approval", async () => {
      const input = makeInput();
      const selected = await service.createRequest("borrower", input);
      const approval = service.approveRequest("owner", selected.requestId);
      const creation = service.createRequest("borrower2", input);
      const outcomes = await Promise.allSettled([approval, creation]);
      assert.equal(outcomes[0].status, "fulfilled");
      const creationOutcome = outcomes[1];

      if (creationOutcome.status === "fulfilled") {
        const saved = await testDatabase.request.findUniqueOrThrow({ where: { requestId: creationOutcome.value.requestId } });
        assert.equal(saved.requestStatus, "DECLINED");
      } else {
        assert.ok(creationOutcome.reason instanceof RequestError);
        assert.equal(creationOutcome.reason.code, "CONFLICT");
      }

      const pendingCount = await testDatabase.request.count({ where: { requestStatus: "PENDING" } });
      assert.equal(pendingCount, 0);
    });

    await context.test("approveRequest rolls back approval and declines when the final Item update fails", async () => {
      const input = makeInput();
      const selected = await service.createRequest("borrower", input);
      await service.createRequest("borrower2", input);
      const before = await approvalSnapshot();
      // Force a real PostgreSQL write failure after the Request updates.
      // The function and trigger exist only inside this isolated test database.
      await migrationClient.query(`CREATE FUNCTION test_fail_item_update() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced item write failure'; END; $$`);
      await migrationClient.query(`CREATE TRIGGER test_item_write_failure BEFORE UPDATE ON "Item"
        FOR EACH ROW EXECUTE FUNCTION test_fail_item_update()`);

      try {
        const action = async () => {
          await service.approveRequest("owner", selected.requestId);
        };
        const expectedFailure = (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(error instanceof RequestError, false);
          assert.match(error.message, /forced item write failure/);

          return true;
        };
        await assert.rejects(action, expectedFailure);
        const after = await approvalSnapshot();
        assert.deepEqual(after, before);
      } finally {
        await migrationClient.query(`DROP TRIGGER test_item_write_failure ON "Item"`);
        await migrationClient.query("DROP FUNCTION test_fail_item_update()");
      }
    });


    async function expectDeclineFailure(
      userId: string,
      requestId: string,
      code: RequestErrorCode,
      message: string,
    ) {
      const before = await approvalSnapshot();
      const action = async () => {
        await service.declineRequest(userId, requestId);
      };
      const expectedError = (error: unknown) => {
        assert.ok(error instanceof RequestError);
        assert.equal(error.code, code);
        assert.equal(error.message, message);

        return true;
      };
      await assert.rejects(action, expectedError);
      const after = await approvalSnapshot();
      assert.deepEqual(after, before);
    }

    await context.test("declineRequest updates only the selected Pending request", async () => {
      const input = makeInput();
      const selected = await service.createRequest("borrower", input);
      const other = await service.createRequest("borrower2", input);
      const itemBefore = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      const declined = await service.declineRequest("owner", selected.requestId);
      assert.equal(declined.requestId, selected.requestId);
      assert.equal(declined.requestStatus, "DECLINED");
      assert.equal(declined.requestCompletedAt, null);
      assert.equal(declined.borrowerId, selected.borrowerId);
      const saved = await testDatabase.request.findUniqueOrThrow({ where: { requestId: selected.requestId } });
      assert.deepEqual(saved, declined);
      const savedOther = await testDatabase.request.findUniqueOrThrow({ where: { requestId: other.requestId } });
      assert.deepEqual(savedOther, other);
      const itemAfter = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      assert.deepEqual(itemAfter, itemBefore);
    });

    await context.test("declineRequest rejects missing requests without changing data", async () => {
      await expectDeclineFailure("owner", "missing-request", "NOT_FOUND", "The request was not found.");
    });

    await context.test("declineRequest rejects non-owners including a group Owner", async () => {
      const input = makeInput();
      const request = await service.createRequest("borrower", input);

      for (const userId of ["borrower", "borrower2", "outsider"]) {
        await expectDeclineFailure(userId, request.requestId, "FORBIDDEN", "Only the item owner can decline its requests.");
      }
    });

    await context.test("declineRequest rejects Approved, Declined, Cancelled and Completed requests", async () => {
      const input = makeInput();
      const request = await service.createRequest("borrower", input);
      const statuses = ["APPROVED", "DECLINED", "CANCELLED", "COMPLETED"] as const;

      for (const status of statuses) {
        let itemStatus: "AVAILABLE" | "BORROWED" = "AVAILABLE";
        let completedAt: Date | null = null;

        if (status === "APPROVED") {
          itemStatus = "BORROWED";
        }

        if (status === "COMPLETED") {
          completedAt = new Date();
        }

        await testDatabase.request.update({
          where: { requestId: request.requestId },
          data: { requestStatus: status, requestCompletedAt: completedAt },
        });
        await testDatabase.item.update({ where: { itemId: "item" }, data: { itemStatus: itemStatus } });
        await expectDeclineFailure("owner", request.requestId, "CONFLICT", "This request is no longer pending.");
      }
    });

    await context.test("declineRequest can close stale Pending requests without item availability or group access", async () => {
      const input = makeInput();
      const request = await service.createRequest("borrower", input);
      const archivedAt = new Date();
      // Simulate stale Pending data left by an incomplete external operation.
      await testDatabase.item.update({
        where: { itemId: "item" },
        data: { itemStatus: "BORROWED", itemArchivedAt: archivedAt },
      });
      await testDatabase.itemAccess.deleteMany({ where: { itemId: "item", groupId: "group" } });

      try {
        const itemBefore = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
        const declined = await service.declineRequest("owner", request.requestId);
        assert.equal(declined.requestStatus, "DECLINED");
        const itemAfter = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
        assert.deepEqual(itemAfter, itemBefore);
      } finally {
        await testDatabase.itemAccess.create({ data: { itemId: "item", groupId: "group" } });
      }
    });

    await context.test("declineRequest allows exactly one success for concurrent duplicate declines", async () => {
      const input = makeInput();
      const request = await service.createRequest("borrower", input);
      const itemBefore = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      const first = service.declineRequest("owner", request.requestId);
      const second = service.declineRequest("owner", request.requestId);
      const outcomes = await Promise.allSettled([first, second]);
      let successCount = 0;
      let conflictCount = 0;

      for (const outcome of outcomes) {
        if (outcome.status === "fulfilled") {
          successCount += 1;
          assert.equal(outcome.value.requestStatus, "DECLINED");
        } else {
          conflictCount += 1;
          assert.ok(outcome.reason instanceof RequestError);
          assert.equal(outcome.reason.code, "CONFLICT");
        }
      }

      assert.equal(successCount, 1);
      assert.equal(conflictCount, 1);
      const itemAfter = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      assert.deepEqual(itemAfter, itemBefore);
    });

    await context.test("declineRequest and approveRequest serialize conflicting decisions", async () => {
      const input = makeInput();

      for (const firstAction of ["approve", "decline"]) {
        await testDatabase.request.deleteMany();
        await testDatabase.item.update({ where: { itemId: "item" }, data: { itemStatus: "AVAILABLE" } });
        const request = await service.createRequest("borrower", input);
        let approval: Promise<unknown>;
        let decline: Promise<unknown>;

        if (firstAction === "approve") {
          approval = service.approveRequest("owner", request.requestId);
          decline = service.declineRequest("owner", request.requestId);
        } else {
          decline = service.declineRequest("owner", request.requestId);
          approval = service.approveRequest("owner", request.requestId);
        }

        const outcomes = await Promise.allSettled([approval, decline]);
        let successCount = 0;

        for (const outcome of outcomes) {
          if (outcome.status === "fulfilled") {
            successCount += 1;
          } else {
            assert.ok(outcome.reason instanceof RequestError);
            assert.equal(outcome.reason.code, "CONFLICT");
          }
        }

        assert.equal(successCount, 1);
        const saved = await testDatabase.request.findUniqueOrThrow({ where: { requestId: request.requestId } });
        const item = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });

        if (outcomes[0].status === "fulfilled") {
          assert.equal(saved.requestStatus, "APPROVED");
          assert.equal(item.itemStatus, "BORROWED");
        } else {
          assert.equal(saved.requestStatus, "DECLINED");
          assert.equal(item.itemStatus, "AVAILABLE");
        }
      }
    });

    await context.test("declineRequest preserves data and system errors when the update fails", async () => {
      const input = makeInput();
      const request = await service.createRequest("borrower", input);
      const before = await approvalSnapshot();
      await migrationClient.query(`CREATE FUNCTION test_fail_decline() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced decline write failure'; END; $$`);
      await migrationClient.query(`CREATE TRIGGER test_decline_write_failure BEFORE UPDATE ON "Request"
        FOR EACH ROW EXECUTE FUNCTION test_fail_decline()`);

      try {
        const action = async () => {
          await service.declineRequest("owner", request.requestId);
        };
        const expectedFailure = (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(error instanceof RequestError, false);
          assert.match(error.message, /forced decline write failure/);

          return true;
        };
        await assert.rejects(action, expectedFailure);
        const after = await approvalSnapshot();
        assert.deepEqual(after, before);
      } finally {
        await migrationClient.query(`DROP TRIGGER test_decline_write_failure ON "Request"`);
        await migrationClient.query("DROP FUNCTION test_fail_decline()");
      }
    });


    async function expectBulkDeclineFailure(
      userId: string,
      itemId: string,
      code: RequestErrorCode,
      message: string,
    ) {
      const before = await approvalSnapshot();
      const action = async () => {
        await service.declineAllPendingRequests(userId, itemId);
      };
      const expectedError = (error: unknown) => {
        assert.ok(error instanceof RequestError);
        assert.equal(error.code, code);
        assert.equal(error.message, message);

        return true;
      };
      await assert.rejects(action, expectedError);
      const after = await approvalSnapshot();
      assert.deepEqual(after, before);
    }

    await context.test("declineAllPendingRequests returns zero for no Pending requests", async () => {
      const before = await approvalSnapshot();
      const count = await service.declineAllPendingRequests("owner", "item");
      assert.equal(count, 0);
      const after = await approvalSnapshot();
      assert.deepEqual(after, before);
    });

    await context.test("declineAllPendingRequests declines across groups and permits later submissions", async () => {
      const input = makeInput();
      const otherInput = makeInput({ groupId: "group2" });
      await service.createRequest("borrower", input);
      await service.createRequest("borrower2", otherInput);
      const itemBefore = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      const count = await service.declineAllPendingRequests("owner", "item");
      assert.equal(count, 2);
      const requests = await testDatabase.request.findMany();

      for (const request of requests) {
        assert.equal(request.requestStatus, "DECLINED");
        assert.equal(request.requestCompletedAt, null);
      }

      const itemAfter = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      assert.deepEqual(itemAfter, itemBefore);
      const repeatCount = await service.declineAllPendingRequests("owner", "item");
      assert.equal(repeatCount, 0);
      const newRequest = await service.createRequest("borrower", input);
      assert.equal(newRequest.requestStatus, "PENDING");
    });

    await context.test("declineAllPendingRequests rejects missing items", async () => {
      await expectBulkDeclineFailure("owner", "missing-item", "NOT_FOUND", "The requested item was not found.");
    });

    await context.test("declineAllPendingRequests checks ownership even with zero Pending requests", async () => {
      for (const userId of ["borrower", "borrower2", "outsider"]) {
        await expectBulkDeclineFailure(userId, "item", "FORBIDDEN", "Only the item owner can decline its requests.");
      }

      const input = makeInput();
      await service.createRequest("borrower", input);
      await expectBulkDeclineFailure("borrower2", "item", "FORBIDDEN", "Only the item owner can decline its requests.");
    });

    await context.test("declineAllPendingRequests preserves non-Pending history and other items", async () => {
      const input = makeInput();
      await service.createRequest("borrower", input);
      const histories = ["APPROVED", "DECLINED", "CANCELLED", "COMPLETED"] as const;
      const historyIds: string[] = [];

      for (const status of histories) {
        let completedAt: Date | null = null;

        if (status === "COMPLETED") {
          completedAt = new Date();
        }

        const request = await testDatabase.request.create({
          data: {
            itemId: "item",
            borrowerId: "borrower2",
            groupId: "group2",
            requestStartDate: input.requestStartDate,
            requestEndDate: input.requestEndDate,
            requestStatus: status,
            requestCompletedAt: completedAt,
          },
        });
        historyIds.push(request.requestId);
      }

      await testDatabase.item.update({ where: { itemId: "item" }, data: { itemStatus: "BORROWED" } });
      const historiesBefore = await testDatabase.request.findMany({
        where: { requestId: { in: historyIds } },
        orderBy: { requestId: "asc" },
      });
      const itemBefore = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      await testDatabase.item.create({
        data: {
          itemId: "bulk-other-item",
          ownerId: "owner",
          itemName: "Other item",
          itemDescription: "Bulk isolation fixture",
          itemCategory: "Tools",
          itemCondition: "Good",
        },
      });

      try {
        const other = await testDatabase.request.create({
          data: {
            itemId: "bulk-other-item",
            borrowerId: "borrower",
            groupId: "group",
            requestStartDate: input.requestStartDate,
            requestEndDate: input.requestEndDate,
          },
        });
        const count = await service.declineAllPendingRequests("owner", "item");
        assert.equal(count, 1);
        const historiesAfter = await testDatabase.request.findMany({
          where: { requestId: { in: historyIds } },
          orderBy: { requestId: "asc" },
        });
        assert.deepEqual(historiesAfter, historiesBefore);
        const itemAfter = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
        assert.deepEqual(itemAfter, itemBefore);
        const savedOther = await testDatabase.request.findUniqueOrThrow({ where: { requestId: other.requestId } });
        assert.deepEqual(savedOther, other);
      } finally {
        await testDatabase.request.deleteMany({ where: { itemId: "bulk-other-item" } });
        await testDatabase.item.delete({ where: { itemId: "bulk-other-item" } });
      }
    });

    await context.test("declineAllPendingRequests can close stale Pending data after archive and access revocation", async () => {
      const input = makeInput();
      await service.createRequest("borrower", input);
      const archivedAt = new Date();
      await testDatabase.item.update({ where: { itemId: "item" }, data: { itemArchivedAt: archivedAt } });
      await testDatabase.itemAccess.deleteMany({ where: { itemId: "item", groupId: "group" } });

      try {
        const itemBefore = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
        const count = await service.declineAllPendingRequests("owner", "item");
        assert.equal(count, 1);
        const itemAfter = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
        assert.deepEqual(itemAfter, itemBefore);
      } finally {
        await testDatabase.itemAccess.create({ data: { itemId: "item", groupId: "group" } });
      }
    });

    await context.test("declineAllPendingRequests reports accurate counts for concurrent duplicate operations", async () => {
      const input = makeInput();
      await service.createRequest("borrower", input);
      await service.createRequest("borrower2", input);
      const first = service.declineAllPendingRequests("owner", "item");
      const second = service.declineAllPendingRequests("owner", "item");
      const counts = await Promise.all([first, second]);
      counts.sort();
      assert.deepEqual(counts, [0, 2]);
      const pendingCount = await testDatabase.request.count({ where: { requestStatus: "PENDING" } });
      assert.equal(pendingCount, 0);
    });

    await context.test("declineAllPendingRequests and approval serialize without overwriting an Approved loan", async () => {
      const input = makeInput();

      for (const firstAction of ["approve", "bulk"]) {
        await testDatabase.request.deleteMany();
        await testDatabase.item.update({ where: { itemId: "item" }, data: { itemStatus: "AVAILABLE" } });
        const selected = await service.createRequest("borrower", input);
        await service.createRequest("borrower2", input);
        let approval: Promise<unknown>;
        let bulk: Promise<number>;

        if (firstAction === "approve") {
          approval = service.approveRequest("owner", selected.requestId);
          bulk = service.declineAllPendingRequests("owner", "item");
        } else {
          bulk = service.declineAllPendingRequests("owner", "item");
          approval = service.approveRequest("owner", selected.requestId);
        }

        const outcomes = await Promise.allSettled([approval, bulk]);
        const bulkOutcome = outcomes[1];
        assert.equal(bulkOutcome.status, "fulfilled");

        if (bulkOutcome.status !== "fulfilled") {
          throw new Error("Bulk decline should complete even if no Pending requests remain.");
        }

        const item = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
        const selectedAfter = await testDatabase.request.findUniqueOrThrow({ where: { requestId: selected.requestId } });
        const approvalOutcome = outcomes[0];

        if (approvalOutcome.status === "fulfilled") {
          assert.equal(bulkOutcome.value, 0);
          assert.equal(selectedAfter.requestStatus, "APPROVED");
          assert.equal(item.itemStatus, "BORROWED");
        } else {
          assert.ok(approvalOutcome.reason instanceof RequestError);
          assert.equal(approvalOutcome.reason.code, "CONFLICT");
          assert.equal(bulkOutcome.value, 2);
          assert.equal(selectedAfter.requestStatus, "DECLINED");
          assert.equal(item.itemStatus, "AVAILABLE");
        }

        const pendingCount = await testDatabase.request.count({ where: { requestStatus: "PENDING" } });
        assert.equal(pendingCount, 0);
      }
    });

    await context.test("declineAllPendingRequests and new submissions have consistent counts", async () => {
      const input = makeInput();
      const original = await service.createRequest("borrower", input);
      const bulk = service.declineAllPendingRequests("owner", "item");
      const creation = service.createRequest("borrower2", input);
      const [count, created] = await Promise.all([bulk, creation]);
      assert.ok(count === 1 || count === 2);
      const originalAfter = await testDatabase.request.findUniqueOrThrow({ where: { requestId: original.requestId } });
      assert.equal(originalAfter.requestStatus, "DECLINED");
      const createdAfter = await testDatabase.request.findUniqueOrThrow({ where: { requestId: created.requestId } });

      if (count === 1) {
        assert.equal(createdAfter.requestStatus, "PENDING");
      } else {
        assert.equal(createdAfter.requestStatus, "DECLINED");
      }

      const declinedCount = await testDatabase.request.count({ where: { requestStatus: "DECLINED" } });
      assert.equal(declinedCount, count);
      const item = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      assert.equal(item.itemStatus, "AVAILABLE");
    });

    await context.test("declineAllPendingRequests rolls back the batch when a database write fails", async () => {
      const input = makeInput();
      await service.createRequest("borrower", input);
      await service.createRequest("borrower2", input);
      const before = await approvalSnapshot();
      // Fail after the UPDATE statement has processed its rows in the isolated DB.
      await migrationClient.query(`CREATE FUNCTION test_fail_bulk_decline() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced bulk decline failure'; END; $$`);
      await migrationClient.query(`CREATE TRIGGER test_bulk_decline_failure AFTER UPDATE ON "Request"
        FOR EACH STATEMENT EXECUTE FUNCTION test_fail_bulk_decline()`);

      try {
        const action = async () => {
          await service.declineAllPendingRequests("owner", "item");
        };
        const expectedFailure = (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(error instanceof RequestError, false);
          assert.match(error.message, /forced bulk decline failure/);

          return true;
        };
        await assert.rejects(action, expectedFailure);
        const after = await approvalSnapshot();
        assert.deepEqual(after, before);
      } finally {
        await migrationClient.query(`DROP TRIGGER test_bulk_decline_failure ON "Request"`);
        await migrationClient.query("DROP FUNCTION test_fail_bulk_decline()");
      }
    });


    type BorrowerOperation = (userId: string, requestId: string) => Promise<unknown>;

    async function expectBorrowerFailure(
      operation: BorrowerOperation,
      userId: string,
      requestId: string,
      code: RequestErrorCode,
      message: string,
    ) {
      const before = await approvalSnapshot();
      const action = async () => {
        await operation(userId, requestId);
      };
      const expectedError = (error: unknown) => {
        assert.ok(error instanceof RequestError);
        assert.equal(error.code, code);
        assert.equal(error.message, message);

        return true;
      };
      await assert.rejects(action, expectedError);
      const after = await approvalSnapshot();
      assert.deepEqual(after, before);
    }

    function assertSingleWinner(outcomes: PromiseSettledResult<unknown>[]) {
      let successes = 0;
      let conflicts = 0;

      for (const outcome of outcomes) {
        if (outcome.status === "fulfilled") {
          successes += 1;
        } else {
          assert.ok(outcome.reason instanceof RequestError);
          assert.equal(outcome.reason.code, "CONFLICT");
          conflicts += 1;
        }
      }

      assert.equal(successes, 1);
      assert.equal(conflicts, 1);
    }

    await context.test("cancelRequest cancels only the borrower's selected Pending request", async () => {
      const input = makeInput();
      const selected = await service.createRequest("borrower", input);
      const other = await service.createRequest("borrower2", input);
      const itemBefore = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      const cancelled = await service.cancelRequest("borrower", selected.requestId);
      assert.equal(cancelled.requestId, selected.requestId);
      assert.equal(cancelled.requestStatus, "CANCELLED");
      assert.equal(cancelled.requestCompletedAt, null);
      const saved = await testDatabase.request.findUniqueOrThrow({ where: { requestId: selected.requestId } });
      assert.deepEqual(saved, cancelled);
      const savedOther = await testDatabase.request.findUniqueOrThrow({ where: { requestId: other.requestId } });
      assert.deepEqual(savedOther, other);
      const itemAfter = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      assert.deepEqual(itemAfter, itemBefore);
    });

    await context.test("cancelRequest and returnItem reject missing requests", async () => {
      for (const operation of [service.cancelRequest, service.returnItem]) {
        await expectBorrowerFailure(operation, "borrower", "missing-request", "NOT_FOUND", "The request was not found.");
      }
    });

    await context.test("cancelRequest and returnItem reject the item Owner, group Owner and other users", async () => {
      const input = makeInput();
      const selected = await service.createRequest("borrower", input);

      for (const userId of ["owner", "borrower2", "outsider"]) {
        await expectBorrowerFailure(service.cancelRequest, userId, selected.requestId, "FORBIDDEN", "Only the borrower can cancel this request.");
      }

      await service.approveRequest("owner", selected.requestId);

      for (const userId of ["owner", "borrower2", "outsider"]) {
        await expectBorrowerFailure(service.returnItem, userId, selected.requestId, "FORBIDDEN", "Only the borrower can return this item.");
      }
    });

    await context.test("cancelRequest rejects every non-Pending status", async () => {
      const input = makeInput();
      const selected = await service.createRequest("borrower", input);
      const statuses = ["APPROVED", "DECLINED", "CANCELLED", "COMPLETED"] as const;

      for (const status of statuses) {
        let completedAt: Date | null = null;
        let itemStatus: "AVAILABLE" | "BORROWED" = "AVAILABLE";

        if (status === "COMPLETED") {
          completedAt = new Date();
        }

        if (status === "APPROVED") {
          itemStatus = "BORROWED";
        }

        await testDatabase.request.update({
          where: { requestId: selected.requestId },
          data: { requestStatus: status, requestCompletedAt: completedAt },
        });
        await testDatabase.item.update({ where: { itemId: "item" }, data: { itemStatus: itemStatus } });
        await expectBorrowerFailure(service.cancelRequest, "borrower", selected.requestId, "CONFLICT", "Only pending requests can be cancelled.");
      }
    });

    await context.test("returnItem rejects every non-Approved status", async () => {
      const input = makeInput();
      const selected = await service.createRequest("borrower", input);
      const statuses = ["PENDING", "DECLINED", "CANCELLED", "COMPLETED"] as const;

      for (const status of statuses) {
        let completedAt: Date | null = null;

        if (status === "COMPLETED") {
          completedAt = new Date();
        }

        await testDatabase.request.update({
          where: { requestId: selected.requestId },
          data: { requestStatus: status, requestCompletedAt: completedAt },
        });
        await expectBorrowerFailure(service.returnItem, "borrower", selected.requestId, "CONFLICT", "Only approved requests can be completed by returning the item.");
      }
    });

    await context.test("returnItem rejects inconsistent Approved data when the item is not Borrowed", async () => {
      const input = makeInput();
      const selected = await service.createRequest("borrower", input);
      await testDatabase.request.update({ where: { requestId: selected.requestId }, data: { requestStatus: "APPROVED" } });
      await expectBorrowerFailure(service.returnItem, "borrower", selected.requestId, "CONFLICT", "This item is not currently borrowed.");
    });

    await context.test("returnItem completes the full loan cycle and allows a fresh request", async () => {
      const input = makeInput();
      const selected = await service.createRequest("borrower", input);
      const other = await service.createRequest("borrower2", input);
      await service.approveRequest("owner", selected.requestId);
      const beforeReturnTime = Date.now();
      const completed = await service.returnItem("borrower", selected.requestId);
      const afterReturnTime = Date.now();
      assert.equal(completed.requestStatus, "COMPLETED");
      assert.ok(completed.requestCompletedAt instanceof Date);
      const completedTime = completed.requestCompletedAt.getTime();
      assert.ok(completedTime >= beforeReturnTime);
      assert.ok(completedTime <= afterReturnTime);
      const saved = await testDatabase.request.findUniqueOrThrow({ where: { requestId: selected.requestId } });
      assert.deepEqual(saved, completed);
      const item = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      assert.equal(item.itemStatus, "AVAILABLE");
      const oldOther = await testDatabase.request.findUniqueOrThrow({ where: { requestId: other.requestId } });
      assert.equal(oldOther.requestStatus, "DECLINED");
      const fresh = await service.createRequest("borrower2", input);
      assert.equal(fresh.requestStatus, "PENDING");
      assert.notEqual(fresh.requestId, other.requestId);
    });

    await context.test("borrowers can cancel or return after losing access without clearing the archive flag", async () => {
      const input = makeInput();

      for (const action of ["cancel", "return"]) {
        await testDatabase.request.deleteMany();
        await testDatabase.item.update({ where: { itemId: "item" }, data: { itemStatus: "AVAILABLE", itemArchivedAt: null } });
        const selected = await service.createRequest("borrower", input);

        if (action === "return") {
          await service.approveRequest("owner", selected.requestId);
        }

        const archivedAt = new Date();
        await testDatabase.item.update({ where: { itemId: "item" }, data: { itemArchivedAt: archivedAt } });
        // Simulate stale data from external group/access changes, not new group-management behavior.
        await testDatabase.itemAccess.deleteMany({ where: { itemId: "item", groupId: "group" } });
        await testDatabase.groupMember.deleteMany({ where: { groupId: "group", userId: "borrower" } });

        try {
          if (action === "cancel") {
            const cancelled = await service.cancelRequest("borrower", selected.requestId);
            assert.equal(cancelled.requestStatus, "CANCELLED");
          } else {
            const completed = await service.returnItem("borrower", selected.requestId);
            assert.equal(completed.requestStatus, "COMPLETED");
          }

          const item = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
          assert.equal(item.itemStatus, "AVAILABLE");
          assert.deepEqual(item.itemArchivedAt, archivedAt);
        } finally {
          await testDatabase.itemAccess.create({ data: { itemId: "item", groupId: "group" } });
          await testDatabase.groupMember.create({ data: { groupId: "group", userId: "borrower" } });
        }
      }
    });

    await context.test("cancelRequest allows only one successful concurrent cancellation", async () => {
      const input = makeInput();
      const selected = await service.createRequest("borrower", input);
      const itemBefore = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      const first = service.cancelRequest("borrower", selected.requestId);
      const second = service.cancelRequest("borrower", selected.requestId);
      const outcomes = await Promise.allSettled([first, second]);
      assertSingleWinner(outcomes);
      const itemAfter = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      assert.deepEqual(itemAfter, itemBefore);
    });

    await context.test("cancelRequest and approval allow one decision with consistent item state", async () => {
      const input = makeInput();

      for (const firstAction of ["cancel", "approve"]) {
        await testDatabase.request.deleteMany();
        await testDatabase.item.update({ where: { itemId: "item" }, data: { itemStatus: "AVAILABLE" } });
        const selected = await service.createRequest("borrower", input);
        let cancellation: Promise<unknown>;
        let approval: Promise<unknown>;

        if (firstAction === "cancel") {
          cancellation = service.cancelRequest("borrower", selected.requestId);
          approval = service.approveRequest("owner", selected.requestId);
        } else {
          approval = service.approveRequest("owner", selected.requestId);
          cancellation = service.cancelRequest("borrower", selected.requestId);
        }

        const outcomes = await Promise.allSettled([cancellation, approval]);
        assertSingleWinner(outcomes);
        const saved = await testDatabase.request.findUniqueOrThrow({ where: { requestId: selected.requestId } });
        const item = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });

        if (outcomes[0].status === "fulfilled") {
          assert.equal(saved.requestStatus, "CANCELLED");
          assert.equal(item.itemStatus, "AVAILABLE");
        } else {
          assert.equal(saved.requestStatus, "APPROVED");
          assert.equal(item.itemStatus, "BORROWED");
        }
      }
    });

    await context.test("cancelRequest and declineRequest cannot overwrite each other's decision", async () => {
      const input = makeInput();
      const selected = await service.createRequest("borrower", input);
      const cancellation = service.cancelRequest("borrower", selected.requestId);
      const decline = service.declineRequest("owner", selected.requestId);
      const outcomes = await Promise.allSettled([cancellation, decline]);
      assertSingleWinner(outcomes);
      const saved = await testDatabase.request.findUniqueOrThrow({ where: { requestId: selected.requestId } });

      if (outcomes[0].status === "fulfilled") {
        assert.equal(saved.requestStatus, "CANCELLED");
      } else {
        assert.equal(saved.requestStatus, "DECLINED");
      }

      const item = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      assert.equal(item.itemStatus, "AVAILABLE");
    });

    await context.test("returnItem allows one concurrent completion and preserves the completion timestamp", async () => {
      const input = makeInput();
      const selected = await service.createRequest("borrower", input);
      await service.approveRequest("owner", selected.requestId);
      const first = service.returnItem("borrower", selected.requestId);
      const second = service.returnItem("borrower", selected.requestId);
      const outcomes = await Promise.allSettled([first, second]);
      assertSingleWinner(outcomes);
      await expectBorrowerFailure(service.returnItem, "borrower", selected.requestId, "CONFLICT", "Only approved requests can be completed by returning the item.");
      const item = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      assert.equal(item.itemStatus, "AVAILABLE");
    });

    await context.test("returnItem and new submissions see a consistent availability state", async () => {
      const input = makeInput();
      const selected = await service.createRequest("borrower", input);
      await service.approveRequest("owner", selected.requestId);
      const returning = service.returnItem("borrower", selected.requestId);
      const creation = service.createRequest("borrower2", input);
      const outcomes = await Promise.allSettled([returning, creation]);
      assert.equal(outcomes[0].status, "fulfilled");
      const creationOutcome = outcomes[1];

      if (creationOutcome.status === "fulfilled") {
        assert.equal(creationOutcome.value.requestStatus, "PENDING");
      } else {
        assert.ok(creationOutcome.reason instanceof RequestError);
        assert.equal(creationOutcome.reason.code, "CONFLICT");
      }

      const saved = await testDatabase.request.findUniqueOrThrow({ where: { requestId: selected.requestId } });
      assert.equal(saved.requestStatus, "COMPLETED");
      const item = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      assert.equal(item.itemStatus, "AVAILABLE");
    });

    await context.test("returnItem does not enforce pickup, early-return or overdue date restrictions", async () => {
      for (const dateText of ["2020-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z"]) {
        await testDatabase.request.deleteMany();
        await testDatabase.item.update({ where: { itemId: "item" }, data: { itemStatus: "AVAILABLE" } });
        const date = new Date(dateText);
        const input = makeInput({ requestStartDate: date, requestEndDate: date });
        const selected = await service.createRequest("borrower", input);
        await service.approveRequest("owner", selected.requestId);
        const completed = await service.returnItem("borrower", selected.requestId);
        assert.equal(completed.requestStatus, "COMPLETED");
      }
    });

    await context.test("returnItem cannot release a later loan by returning an old completed request", async () => {
      const input = makeInput();
      const first = await service.createRequest("borrower", input);
      await service.approveRequest("owner", first.requestId);
      await service.returnItem("borrower", first.requestId);
      const second = await service.createRequest("borrower2", input);
      await service.approveRequest("owner", second.requestId);
      await expectBorrowerFailure(service.returnItem, "borrower", first.requestId, "CONFLICT", "Only approved requests can be completed by returning the item.");
      const item = await testDatabase.item.findUniqueOrThrow({ where: { itemId: "item" } });
      assert.equal(item.itemStatus, "BORROWED");
      const currentLoan = await testDatabase.request.findUniqueOrThrow({ where: { requestId: second.requestId } });
      assert.equal(currentLoan.requestStatus, "APPROVED");
    });

    await context.test("cancelRequest rolls back a failed write and preserves system errors", async () => {
      const input = makeInput();
      const selected = await service.createRequest("borrower", input);
      const before = await approvalSnapshot();
      await migrationClient.query(`CREATE FUNCTION test_fail_cancel() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced cancellation failure'; END; $$`);
      await migrationClient.query(`CREATE TRIGGER test_cancel_failure AFTER UPDATE ON "Request"
        FOR EACH STATEMENT EXECUTE FUNCTION test_fail_cancel()`);

      try {
        const action = async () => {
          await service.cancelRequest("borrower", selected.requestId);
        };
        const expectedFailure = (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(error instanceof RequestError, false);
          assert.match(error.message, /forced cancellation failure/);

          return true;
        };
        await assert.rejects(action, expectedFailure);
        const after = await approvalSnapshot();
        assert.deepEqual(after, before);
      } finally {
        await migrationClient.query(`DROP TRIGGER test_cancel_failure ON "Request"`);
        await migrationClient.query("DROP FUNCTION test_fail_cancel()");
      }
    });

    await context.test("returnItem rolls back completion and availability when the final Item update fails", async () => {
      const input = makeInput();
      const selected = await service.createRequest("borrower", input);
      await service.approveRequest("owner", selected.requestId);
      const before = await approvalSnapshot();
      await migrationClient.query(`CREATE FUNCTION test_fail_return() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced return item failure'; END; $$`);
      await migrationClient.query(`CREATE TRIGGER test_return_failure BEFORE UPDATE ON "Item"
        FOR EACH ROW EXECUTE FUNCTION test_fail_return()`);

      try {
        const action = async () => {
          await service.returnItem("borrower", selected.requestId);
        };
        const expectedFailure = (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(error instanceof RequestError, false);
          assert.match(error.message, /forced return item failure/);

          return true;
        };
        await assert.rejects(action, expectedFailure);
        const after = await approvalSnapshot();
        assert.deepEqual(after, before);
      } finally {
        await migrationClient.query(`DROP TRIGGER test_return_failure ON "Item"`);
        await migrationClient.query("DROP FUNCTION test_fail_return()");
      }
    });


  } finally {
    try {
      if (database !== undefined) {
        await database.$disconnect();
      }
    } finally {
      process.env.DATABASE_URL = originalDatabaseUrl;
      await migrationClient.end();

      try {
        // Only remove the randomly named database created by this test run.
        if (databaseCreated) {
          const dropSql = 'DROP DATABASE "' + testDatabaseName + '"';
          await admin.query(dropSql);
        }
      } finally {
        await admin.end();
      }
    }
  }
});
