import "dotenv/config";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, cp, mkdir, mkdtemp, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";
import test from "node:test";
import { Client } from "pg";
import type { CreateRequestInput, RequestResponse } from "../../src/lib/requests/request-types";

type SingleBody = { data: RequestResponse };
type ListBody = { data: RequestResponse[] };
type CountBody = { data: { declinedCount: number } };
type ErrorBody = { error: { code: string; message: string } };
type AuthBody = { user: { id: string } };
type TestUser = { userId: string; cookie: string };

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Could not allocate a test port.");
  }

  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  return port;
}

async function stopServer(server: ChildProcess) {
  if (server.exitCode !== null || server.signalCode !== null || server.pid === undefined) {
    return;
  }

  const closed = new Promise<void>((resolve) => {
    server.once("close", () => {
      resolve();
    });
  });

  if (process.platform === "win32") {
    const processId = String(server.pid);
    await new Promise<void>((resolve, reject) => {
      // This PID comes from this test's live child process, never another app.
      execFile("taskkill", ["/PID", processId, "/T", "/F"], { windowsHide: true }, (error) => {
        if (error && server.exitCode === null && server.signalCode === null) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  } else {
    server.kill("SIGTERM");
  }

  await closed;
}

async function readJson<T>(response: Response, expectedStatus: number): Promise<T> {
  if (response.status !== expectedStatus) {
    const text = await response.text();
    const preview = text.slice(0, 500);
    throw new Error("Expected HTTP " + expectedStatus + ", received " + response.status + ": " + preview);
  }

  const contentType = response.headers.get("content-type");
  assert.ok(contentType);
  assert.ok(contentType.includes("application/json"));
  const body = await response.json();
  const typedBody = body as T;

  return typedBody;
}

test("Request Controllers over real Next.js HTTP and Better Auth cookies", { timeout: 300000 }, async (context) => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for HTTP integration tests.");
  }

  const repository = fileURLToPath(new URL("../../", import.meta.url));
  const token = randomUUID();
  const safeToken = token.replaceAll("-", "");
  const databaseName = "cirkit_http_test_" + safeToken;
  const allowedName = /^cirkit_http_test_[a-f0-9]{32}$/;

  if (!allowedName.test(databaseName)) {
    throw new Error("Unexpected test database name.");
  }

  const testUrl = new URL(databaseUrl);
  testUrl.pathname = "/" + databaseName;
  const testDatabaseUrl = testUrl.toString();
  const admin = new Client({ connectionString: databaseUrl });
  const database = new Client({ connectionString: testDatabaseUrl });
  const workspace = process.env.REQUEST_CONTROLLER_TEST_WORKSPACE;
  let testRoot = join(tmpdir(), "cirkit-controller-http");

  if (workspace !== undefined) {
    testRoot = workspace;
  }

  await mkdir(testRoot, { recursive: true });
  const app = await mkdtemp(join(testRoot, "run-"));
  const logPath = join(app, "next-test.log");
  let server: ChildProcess | undefined;
  let databaseCreated = false;
  let serverLog = "";
  await admin.connect();

  try {
    const createDatabaseSql = 'CREATE DATABASE "' + databaseName + '"';
    await admin.query(createDatabaseSql);
    databaseCreated = true;
    await database.connect();
    const migrations = join(repository, "prisma", "migrations");
    const entries = await readdir(migrations, { withFileTypes: true });
    const names: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        names.push(entry.name);
      }
    }

    names.sort();

    for (const name of names) {
      const sqlPath = join(migrations, name, "migration.sql");
      const sql = await readFile(sqlPath, "utf8");
      await database.query(sql);
    }

    // Copy source into a private test app; no routes are added to the real app yet.
    const sourceDirectory = join(repository, "src");
    const candidateSource = join(app, "src");
    await cp(sourceDirectory, candidateSource, { recursive: true });
    const stagedApi = process.env.REQUEST_CONTROLLER_CANDIDATE_DIRECTORY;

    if (stagedApi !== undefined) {
      const candidateApi = join(candidateSource, "app", "api");
      await cp(stagedApi, candidateApi, { recursive: true });
    }

    for (const filename of ["package.json", "tsconfig.json", "next.config.ts", "next-env.d.ts"]) {
      const source = join(repository, filename);

      if (existsSync(source)) {
        const destination = join(app, filename);
        await copyFile(source, destination);
      }
    }

    const dependencies = join(repository, "node_modules");
    const dependencyLink = join(app, "node_modules");
    await symlink(dependencies, dependencyLink, "junction");
    const port = await unusedPort();
    const origin = "http://127.0.0.1:" + port;
    const secretBytes = randomBytes(48);
    const secret = secretBytes.toString("base64");
    const nextCli = join(repository, "node_modules", "next", "dist", "bin", "next");
    server = spawn(process.execPath, [nextCli, "dev", app, "--hostname", "127.0.0.1", "--port", String(port), "--webpack"], {
      cwd: app,
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        BETTER_AUTH_URL: origin,
        BETTER_AUTH_SECRET: secret,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const spawnedServer = server;
    spawnedServer.stdout?.on("data", (chunk) => {
      serverLog += chunk.toString();
    });
    spawnedServer.stderr?.on("data", (chunk) => {
      serverLog += chunk.toString();
    });
    spawnedServer.on("error", (error) => {
      serverLog += error.message;
    });

    const deadline = Date.now() + 120000;
    let ready = false;

    while (Date.now() < deadline) {
      if (spawnedServer.exitCode !== null) {
        throw new Error("Next.js test server exited: " + serverLog);
      }

      try {
        const signal = AbortSignal.timeout(2000);
        const response = await fetch(origin + "/api/auth/get-session", { signal: signal });

        if (response.status === 200) {
          ready = true;
          break;
        }
      } catch {
        // Compilation may still be running. Retry until the bounded deadline.
      }

      await setTimeout(250);
    }

    assert.equal(ready, true, "Next.js must start successfully. Log: " + serverLog);

    async function callApi(path: string, method: string, cookie?: string, body?: string): Promise<Response> {
      const headers: Record<string, string> = {};

      if (cookie !== undefined) {
        headers.Cookie = cookie;
      }

      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      const signal = AbortSignal.timeout(60000);
      const response = await fetch(origin + path, {
        method: method,
        headers: headers,
        body: body,
        signal: signal,
      });

      return response;
    }

    function cookieFrom(response: Response): string {
      const setCookies = response.headers.getSetCookie();
      const parts: string[] = [];

      for (const setCookie of setCookies) {
        const segments = setCookie.split(";");
        parts.push(segments[0]);
      }

      const cookie = parts.join("; ");
      assert.ok(cookie.length > 0, "Authentication must issue a real session cookie.");

      return cookie;
    }

    async function signUp(label: string): Promise<TestUser> {
      const body = JSON.stringify({
        name: label,
        email: label + "@cirkit.test",
        password: "Test-password-12345",
      });
      const response = await fetch(origin + "/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: body,
      });
      const result = await readJson<AuthBody>(response, 200);
      const cookie = cookieFrom(response);
      const user = { userId: result.user.id, cookie: cookie };

      return user;
    }

    const owner = await signUp("owner");
    const borrower = await signUp("borrower");
    const borrower2 = await signUp("borrower2");
    const outsider = await signUp("outsider");
    await database.query(`INSERT INTO "group" ("id", "name", "updatedAt")
      VALUES ('group', 'First group', NOW()), ('group2', 'Second group', NOW())`);
    await database.query(`INSERT INTO "group_member"
      ("id", "groupId", "userId", "role", "joinedAt") VALUES
      ('owner-member', 'group', $1, 'OWNER', NOW()),
      ('borrower-member', 'group', $2, 'MEMBER', NOW()),
      ('borrower2-member', 'group', $3, 'MEMBER', NOW()),
      ('borrower2-owner', 'group2', $3, 'OWNER', NOW())`, [owner.userId, borrower.userId, borrower2.userId]);
    await database.query(`INSERT INTO "Item"
      ("itemId", "ownerId", "itemName", "itemDescription", "itemCategory", "itemCondition", "itemUpdatedAt") VALUES
      ('item', $1, 'Drill', 'Test drill', 'Tools', 'Good', NOW()),
      ('item2', $1, 'Ladder', 'Test ladder', 'Tools', 'Good', NOW()),
      ('archived-item', $1, 'Archived drill', 'Archived', 'Tools', 'Good', NOW()),
      ('unshared-item', $1, 'Private drill', 'Private', 'Tools', 'Good', NOW())`, [owner.userId]);
    await database.query(`UPDATE "Item" SET "itemArchivedAt" = NOW() WHERE "itemId" = 'archived-item'`);
    await database.query(`INSERT INTO "ItemAccess" ("itemAccessId", "itemId", "groupId") VALUES
      ('access-item-group', 'item', 'group'), ('access-item-group2', 'item', 'group2'),
      ('access-item2-group', 'item2', 'group'), ('access-archived-group', 'archived-item', 'group')`);

    const baseInput: CreateRequestInput = {
      itemId: "item",
      groupId: "group",
      requestStartDate: "2026-11-10",
      requestEndDate: "2026-11-12",
    };

    async function submit(cookie: string, overrides: Partial<CreateRequestInput> = {}, extra: Record<string, unknown> = {}): Promise<RequestResponse> {
      const input = { ...baseInput, ...overrides, ...extra };
      const json = JSON.stringify(input);
      const response = await callApi("/api/requests", "POST", cookie, json);
      const result = await readJson<SingleBody>(response, 201);

      return result.data;
    }

    async function expectError(response: Response, status: number, code: string) {
      const result = await readJson<ErrorBody>(response, status);
      assert.equal(result.error.code, code);
      assert.ok(result.error.message.length > 0);
      const cacheControl = response.headers.get("cache-control");
      assert.ok(cacheControl);
      assert.ok(cacheControl.includes("no-store"));
    }

    context.beforeEach(async () => {
      await database.query(`DELETE FROM "Request"`);
      await database.query(`UPDATE "Item" SET "itemStatus" = 'AVAILABLE', "itemArchivedAt" = NULL
        WHERE "itemId" IN ('item', 'item2', 'unshared-item')`);
    });

    await context.test("all eight Controllers reject requests without a real login cookie", async () => {
      const endpoints = [
        { path: "/api/requests", method: "POST" },
        { path: "/api/requests/my-request", method: "GET" },
        { path: "/api/items/item/requests", method: "GET" },
        { path: "/api/requests/missing/approve", method: "POST" },
        { path: "/api/requests/missing/decline", method: "POST" },
        { path: "/api/items/item/requests/decline-all", method: "POST" },
        { path: "/api/requests/missing/cancel", method: "POST" },
        { path: "/api/requests/missing/return", method: "POST" },
      ];

      for (const endpoint of endpoints) {
        const response = await callApi(endpoint.path, endpoint.method);
        await expectError(response, 401, "UNAUTHENTICATED");
      }
    });

    await context.test("authenticated empty queries return non-cached data lists", async () => {
      for (const path of ["/api/requests/my-request", "/api/items/item/requests"]) {
        const response = await callApi(path, "GET", owner.cookie);
        const result = await readJson<ListBody>(response, 200);
        assert.deepEqual(result, { data: [] });
        const cacheControl = response.headers.get("cache-control");
        assert.ok(cacheControl);
        assert.ok(cacheControl.includes("no-store"));
      }
    });

    await context.test("creation returns 201 and mapped dates and uses the session identity", async () => {
      const request = await submit(borrower.cookie, {}, { borrowerId: owner.userId, requestStatus: "APPROVED" });
      assert.equal(request.borrowerId, borrower.userId);
      assert.equal(request.requestStatus, "PENDING");
      assert.equal(request.requestStartDate, "2026-11-10");
      assert.equal(request.requestEndDate, "2026-11-12");
      assert.equal(request.requestCompletedAt, null);
      assert.ok(request.requestId);
      const saved = await database.query(`SELECT "borrowerId", "requestStatus" FROM "Request" WHERE "requestId" = $1`, [request.requestId]);
      assert.equal(saved.rows[0].borrowerId, borrower.userId);
      assert.equal(saved.rows[0].requestStatus, "PENDING");
    });

    await context.test("malformed JSON and invalid fields or dates return 400 without inserting", async () => {
      const invalidBodies = ["", "{", "null", "[]", "{}"];
      const badDate = JSON.stringify({ ...baseInput, requestEndDate: "2026-02-30" });
      const reversedDate = JSON.stringify({ ...baseInput, requestEndDate: "2026-11-09" });
      const wrongType = JSON.stringify({ ...baseInput, itemId: 123 });
      invalidBodies.push(badDate, reversedDate, wrongType);

      for (const body of invalidBodies) {
        const response = await callApi("/api/requests", "POST", borrower.cookie, body);
        await expectError(response, 400, "INVALID_INPUT");
      }

      const count = await database.query(`SELECT count(*)::int AS count FROM "Request"`);
      assert.equal(count.rows[0].count, 0);
    });

    await context.test("creation preserves Service permission, existence and availability errors", async () => {
      const cases = [
        { cookie: owner.cookie, itemId: "item", status: 403, code: "FORBIDDEN" },
        { cookie: outsider.cookie, itemId: "item", status: 403, code: "FORBIDDEN" },
        { cookie: borrower.cookie, itemId: "unshared-item", status: 403, code: "FORBIDDEN" },
        { cookie: borrower.cookie, itemId: "missing-item", status: 404, code: "NOT_FOUND" },
        { cookie: borrower.cookie, itemId: "archived-item", status: 409, code: "CONFLICT" },
      ];

      for (const entry of cases) {
        const body = JSON.stringify({ ...baseInput, itemId: entry.itemId });
        const response = await callApi("/api/requests", "POST", entry.cookie, body);
        await expectError(response, entry.status, entry.code);
      }
    });

    await context.test("my-request returns only the authenticated user's records", async () => {
      const own = await submit(borrower.cookie);
      await submit(borrower2.cookie);
      const response = await callApi("/api/requests/my-request?userId=" + borrower2.userId, "GET", borrower.cookie);
      const result = await readJson<ListBody>(response, 200);
      assert.equal(result.data.length, 1);
      assert.equal(result.data[0].requestId, own.requestId);
      const ownerResponse = await callApi("/api/requests/my-request", "GET", owner.cookie);
      const ownerResult = await readJson<ListBody>(ownerResponse, 200);
      assert.deepEqual(ownerResult.data, []);
    });

    await context.test("item query includes all source groups but only the owned target item", async () => {
      await submit(borrower.cookie);
      await submit(borrower2.cookie, { groupId: "group2" });
      await submit(borrower.cookie, { itemId: "item2" });
      const response = await callApi("/api/items/item/requests", "GET", owner.cookie);
      const result = await readJson<ListBody>(response, 200);
      assert.equal(result.data.length, 2);

      for (const request of result.data) {
        assert.equal(request.itemId, "item");
      }

      const forbidden = await callApi("/api/items/item/requests", "GET", borrower2.cookie);
      await expectError(forbidden, 403, "FORBIDDEN");
    });

    await context.test("approval updates the item and declines other groups; stale actions return 409", async () => {
      const selected = await submit(borrower.cookie);
      const other = await submit(borrower2.cookie, { groupId: "group2" });
      const path = "/api/requests/" + selected.requestId + "/approve";
      const forbidden = await callApi(path, "POST", borrower2.cookie);
      await expectError(forbidden, 403, "FORBIDDEN");
      const response = await callApi(path, "POST", owner.cookie);
      const result = await readJson<SingleBody>(response, 200);
      assert.equal(result.data.requestStatus, "APPROVED");
      const savedOther = await database.query(`SELECT "requestStatus" FROM "Request" WHERE "requestId" = $1`, [other.requestId]);
      assert.equal(savedOther.rows[0].requestStatus, "DECLINED");
      const item = await database.query(`SELECT "itemStatus" FROM "Item" WHERE "itemId" = 'item'`);
      assert.equal(item.rows[0].itemStatus, "BORROWED");
      const duplicate = await callApi(path, "POST", owner.cookie);
      await expectError(duplicate, 409, "CONFLICT");
      const body = JSON.stringify(baseInput);
      const blocked = await callApi("/api/requests", "POST", borrower2.cookie, body);
      await expectError(blocked, 409, "CONFLICT");
    });

    await context.test("single decline changes only its selected request", async () => {
      const selected = await submit(borrower.cookie);
      const other = await submit(borrower2.cookie);
      const path = "/api/requests/" + selected.requestId + "/decline";
      const forbidden = await callApi(path, "POST", borrower.cookie);
      await expectError(forbidden, 403, "FORBIDDEN");
      const response = await callApi(path, "POST", owner.cookie);
      const result = await readJson<SingleBody>(response, 200);
      assert.equal(result.data.requestStatus, "DECLINED");
      const savedOther = await database.query(`SELECT "requestStatus" FROM "Request" WHERE "requestId" = $1`, [other.requestId]);
      assert.equal(savedOther.rows[0].requestStatus, "PENDING");
    });

    await context.test("bulk decline returns the count and zero is still successful", async () => {
      await submit(borrower.cookie);
      await submit(borrower2.cookie, { groupId: "group2" });
      const path = "/api/items/item/requests/decline-all";
      const forbidden = await callApi(path, "POST", borrower2.cookie);
      await expectError(forbidden, 403, "FORBIDDEN");
      const response = await callApi(path, "POST", owner.cookie);
      const result = await readJson<CountBody>(response, 200);
      assert.deepEqual(result, { data: { declinedCount: 2 } });
      const repeated = await callApi(path, "POST", owner.cookie);
      const repeatedResult = await readJson<CountBody>(repeated, 200);
      assert.deepEqual(repeatedResult, { data: { declinedCount: 0 } });
    });

    await context.test("cancellation requires the borrower and Pending state", async () => {
      const selected = await submit(borrower.cookie);
      const path = "/api/requests/" + selected.requestId + "/cancel";

      for (const user of [owner, borrower2]) {
        const forbidden = await callApi(path, "POST", user.cookie);
        await expectError(forbidden, 403, "FORBIDDEN");
      }

      const response = await callApi(path, "POST", borrower.cookie);
      const result = await readJson<SingleBody>(response, 200);
      assert.equal(result.data.requestStatus, "CANCELLED");
      const repeated = await callApi(path, "POST", borrower.cookie);
      await expectError(repeated, 409, "CONFLICT");
    });

    await context.test("full HTTP loan cycle returns the item and accepts a fresh request", async () => {
      const selected = await submit(borrower.cookie);
      const approvalPath = "/api/requests/" + selected.requestId + "/approve";
      const approval = await callApi(approvalPath, "POST", owner.cookie);
      await readJson<SingleBody>(approval, 200);
      const cancellation = await callApi("/api/requests/" + selected.requestId + "/cancel", "POST", borrower.cookie);
      await expectError(cancellation, 409, "CONFLICT");
      const path = "/api/requests/" + selected.requestId + "/return";

      for (const user of [owner, borrower2]) {
        const forbidden = await callApi(path, "POST", user.cookie);
        await expectError(forbidden, 403, "FORBIDDEN");
      }

      const response = await callApi(path, "POST", borrower.cookie);
      const result = await readJson<SingleBody>(response, 200);
      assert.equal(result.data.requestStatus, "COMPLETED");
      assert.ok(result.data.requestCompletedAt);
      assert.match(result.data.requestCompletedAt, /Z$/);
      const item = await database.query(`SELECT "itemStatus" FROM "Item" WHERE "itemId" = 'item'`);
      assert.equal(item.rows[0].itemStatus, "AVAILABLE");
      const duplicate = await callApi(path, "POST", borrower.cookie);
      await expectError(duplicate, 409, "CONFLICT");
      const fresh = await submit(borrower2.cookie);
      assert.equal(fresh.requestStatus, "PENDING");
    });

    await context.test("missing resource IDs produce JSON 404 errors", async () => {
      const missingItem = await callApi("/api/items/missing/requests", "GET", owner.cookie);
      await expectError(missingItem, 404, "NOT_FOUND");
      const missingBulk = await callApi("/api/items/missing/requests/decline-all", "POST", owner.cookie);
      await expectError(missingBulk, 404, "NOT_FOUND");

      for (const action of ["approve", "decline", "cancel", "return"]) {
        const response = await callApi("/api/requests/missing/" + action, "POST", owner.cookie);
        await expectError(response, 404, "NOT_FOUND");
      }
    });

    await context.test("unsupported HTTP methods are rejected by Next.js", async () => {
      const response = await callApi("/api/requests", "GET", borrower.cookie);
      assert.equal(response.status, 405);
      const actionResponse = await callApi("/api/requests/missing/approve", "GET", owner.cookie);
      assert.equal(actionResponse.status, 405);
    });

    await context.test("email sign-in issues a real usable session cookie", async () => {
      const body = JSON.stringify({ email: "borrower@cirkit.test", password: "Test-password-12345" });
      const response = await fetch(origin + "/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: body,
      });
      await readJson<AuthBody>(response, 200);
      const cookie = cookieFrom(response);
      const query = await callApi("/api/requests/my-request", "GET", cookie);
      await readJson<ListBody>(query, 200);
    });

    await context.test("an expired database session is rejected despite retaining its browser cookie", async () => {
      const expiring = await signUp("expiring");
      const valid = await callApi("/api/requests/my-request", "GET", expiring.cookie);
      await readJson<ListBody>(valid, 200);
      await database.query(`UPDATE "session" SET "expiresAt" = NOW() - INTERVAL '1 day' WHERE "userId" = $1`, [expiring.userId]);
      const expired = await callApi("/api/requests/my-request", "GET", expiring.cookie);
      await expectError(expired, 401, "UNAUTHENTICATED");
    });

    await context.test("sign-out invalidates the session used by request Controllers", async () => {
      const signingOut = await signUp("signing-out");
      const response = await fetch(origin + "/api/auth/sign-out", {
        method: "POST",
        headers: { Cookie: signingOut.cookie, Origin: origin, "Content-Type": "application/json" },
        body: "{}",
      });
      assert.equal(response.status, 200);
      const expired = await callApi("/api/requests/my-request", "GET", signingOut.cookie);
      await expectError(expired, 401, "UNAUTHENTICATED");
    });

    await context.test("unexpected database failures produce generic JSON 500 and preserve data", async () => {
      await database.query(`CREATE FUNCTION test_http_failure() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private test database diagnostics'; END; $$`);
      await database.query(`CREATE TRIGGER test_http_failure BEFORE INSERT ON "Request"
        FOR EACH ROW EXECUTE FUNCTION test_http_failure()`);

      try {
        const body = JSON.stringify(baseInput);
        const response = await callApi("/api/requests", "POST", borrower.cookie, body);
        const result = await readJson<ErrorBody>(response, 500);
        assert.deepEqual(result, {
          error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
        });
        const count = await database.query(`SELECT count(*)::int AS count FROM "Request"`);
        assert.equal(count.rows[0].count, 0);
      } finally {
        await database.query(`DROP TRIGGER test_http_failure ON "Request"`);
        await database.query("DROP FUNCTION test_http_failure()");
      }
    });
  } finally {
    try {
      if (server !== undefined) {
        await stopServer(server);
      }
    } finally {
      await writeFile(logPath, serverLog, "utf8");
      await database.end();

      try {
        // Only this test's validated, randomly named database is removed.
        if (databaseCreated) {
          const dropDatabaseSql = 'DROP DATABASE "' + databaseName + '" WITH (FORCE)';
          await admin.query(dropDatabaseSql);
        }
      } finally {
        await admin.end();
      }
    }
  }
});
