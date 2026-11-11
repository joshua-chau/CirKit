import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { Request as RequestRecord } from "../../src/generated/prisma/client";
import { AuthenticationError } from "../../src/lib/require-user";
import { RequestError } from "../../src/lib/requests/request-errors";

type MapperModule = typeof import("../../src/lib/requests/request-response-mapper");
type ErrorModule = typeof import("../../src/lib/requests/request-error-response");

function makeRecord(overrides: Partial<RequestRecord> = {}): RequestRecord {
  const startDate = new Date("2026-11-10T00:00:00.000Z");
  const endDate = new Date("2026-11-12T00:00:00.000Z");
  const createdAt = new Date("2026-11-09T03:04:05.123Z");
  const updatedAt = new Date("2026-11-09T04:05:06.234Z");
  const record: RequestRecord = {
    requestId: "request-1",
    itemId: "item-1",
    borrowerId: "borrower-1",
    groupId: "group-1",
    requestStartDate: startDate,
    requestEndDate: endDate,
    requestStatus: "PENDING",
    requestCreatedAt: createdAt,
    requestUpdatedAt: updatedAt,
    requestCompletedAt: null,
    ...overrides,
  };

  return record;
}

test("Controller response helpers", async (context) => {
  let mapperUrl = new URL("../../src/lib/requests/request-response-mapper.ts", import.meta.url);
  let errorUrl = new URL("../../src/lib/requests/request-error-response.ts", import.meta.url);
  const candidateDirectory = process.env.REQUEST_HELPERS_CANDIDATE_DIRECTORY;

  if (candidateDirectory !== undefined) {
    const directoryUrl = pathToFileURL(candidateDirectory + "/");
    mapperUrl = new URL("request-response-mapper.ts", directoryUrl);
    errorUrl = new URL("request-error-response.ts", directoryUrl);
  }

  const mapper: MapperModule = await import(mapperUrl.href);
  const errorResponses: ErrorModule = await import(errorUrl.href);

  await context.test("maps the exact response fields with date-only and ISO timestamp formats", () => {
    const record = makeRecord();
    const response = mapper.mapRequestRecordToResponse(record);
    assert.deepEqual(response, {
      requestId: "request-1",
      itemId: "item-1",
      borrowerId: "borrower-1",
      groupId: "group-1",
      requestStartDate: "2026-11-10",
      requestEndDate: "2026-11-12",
      requestStatus: "PENDING",
      requestCreatedAt: "2026-11-09T03:04:05.123Z",
      requestUpdatedAt: "2026-11-09T04:05:06.234Z",
      requestCompletedAt: null,
    });
  });

  await context.test("maps completed timestamps and preserves all five request statuses", () => {
    const completedAt = new Date("2026-11-13T01:02:03.456Z");
    const statuses = ["PENDING", "APPROVED", "DECLINED", "CANCELLED", "COMPLETED"] as const;

    for (const status of statuses) {
      const record = makeRecord({ requestStatus: status });

      if (status === "COMPLETED") {
        record.requestCompletedAt = completedAt;
      }

      const response = mapper.mapRequestRecordToResponse(record);
      assert.equal(response.requestStatus, status);

      if (status === "COMPLETED") {
        assert.equal(response.requestCompletedAt, "2026-11-13T01:02:03.456Z");
      } else {
        assert.equal(response.requestCompletedAt, null);
      }
    }
  });

  await context.test("does not expose extra record properties or mutate input", () => {
    const base = makeRecord();
    const record = { ...base, internalNote: "not part of the response" };
    const before = structuredClone(record);
    const response = mapper.mapRequestRecordToResponse(record);
    const hasInternalNote = Object.hasOwn(response, "internalNote");
    assert.equal(hasInternalNote, false);
    assert.deepEqual(record, before);
    assert.notEqual(response, record);
  });

  await context.test("maps lists without reordering or mutating records and handles empty lists", () => {
    const first = makeRecord({ requestId: "request-c" });
    const second = makeRecord({ requestId: "request-a" });
    const third = makeRecord({ requestId: "request-b" });
    const records = [first, second, third];
    const before = structuredClone(records);
    const responses = mapper.mapRequestRecordsToResponseList(records);
    const ids = responses.map((response) => {
      const requestId = response.requestId;

      return requestId;
    });
    assert.deepEqual(ids, ["request-c", "request-a", "request-b"]);
    assert.deepEqual(records, before);
    assert.notEqual(responses, records);
    const empty = mapper.mapRequestRecordsToResponseList([]);
    assert.deepEqual(empty, []);
  });

  await context.test("keeps calendar dates stable across host time zones", () => {
    const originalTimezone = process.env.TZ;
    const record = makeRecord();

    try {
      for (const timezone of ["America/Toronto", "America/Los_Angeles", "Asia/Shanghai", "Pacific/Kiritimati"]) {
        process.env.TZ = timezone;
        const response = mapper.mapRequestRecordToResponse(record);
        assert.equal(response.requestStartDate, "2026-11-10");
        assert.equal(response.requestEndDate, "2026-11-12");
      }
    } finally {
      if (originalTimezone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTimezone;
      }
    }
  });

  await context.test("returns JSON 401 for AuthenticationError without logging it as a system error", async (testContext) => {
    const log = testContext.mock.method(console, "error", () => {});
    const error = new AuthenticationError();
    const response = errorResponses.createRequestErrorResponse(error);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.deepEqual(body, {
      error: { code: "UNAUTHENTICATED", message: "You must sign in to continue." },
    });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("content-type"), "application/json");
    assert.equal(log.mock.calls.length, 0);
  });

  await context.test("maps the four expected business error categories and retains their messages", async (testContext) => {
    const log = testContext.mock.method(console, "error", () => {});
    const cases = [
      { code: "INVALID_INPUT", status: 400 },
      { code: "FORBIDDEN", status: 403 },
      { code: "NOT_FOUND", status: 404 },
      { code: "CONFLICT", status: 409 },
    ] as const;

    for (const entry of cases) {
      const message = "Specific reason for " + entry.code;
      const error = new RequestError(entry.code, message);
      const response = errorResponses.createRequestErrorResponse(error);
      assert.equal(response.status, entry.status);
      const body = await response.json();
      assert.deepEqual(body, { error: { code: entry.code, message: message } });
      assert.equal(response.headers.get("cache-control"), "private, no-store");
    }

    assert.equal(log.mock.calls.length, 0);
  });

  await context.test("logs unexpected errors and returns a generic non-cached 500 without technical details", async (testContext) => {
    const log = testContext.mock.method(console, "error", () => {});
    const databaseError = new Error("simulated private database diagnostics");
    const syntaxError = new SyntaxError("an internal syntax failure, not malformed request JSON");
    const unexpectedValues = [databaseError, syntaxError, null, "unexpected throw", { details: "internal details" }];
    let index = 0;

    for (const error of unexpectedValues) {
      const response = errorResponses.createRequestErrorResponse(error);
      assert.equal(response.status, 500);
      const body = await response.json();
      assert.deepEqual(body, {
        error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
      });
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const loggedArguments = log.mock.calls[index].arguments;
      assert.equal(loggedArguments[0], "Unexpected request API error:");
      assert.equal(loggedArguments[1], error);
      index += 1;
    }

    assert.equal(log.mock.calls.length, unexpectedValues.length);
  });
});
