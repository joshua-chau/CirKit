import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { Client } from "pg";

// 使用保存点检查数据库错误，使一次预期失败不影响后续检查。
async function expectConstraint(
  client: Client,
  sql: string,
  parameters: string[],
  expectedCode: string,
  expectedConstraint: string,
) {
  await client.query("SAVEPOINT constraint_check");
  let actualCode: string | undefined;
  let actualConstraint: string | undefined;

  try {
    await client.query(sql, parameters);
  } catch (error) {
    const databaseError = error as { code?: string; constraint?: string };
    actualCode = databaseError.code;
    actualConstraint = databaseError.constraint;
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT constraint_check");
    await client.query("RELEASE SAVEPOINT constraint_check");
  }

  assert.equal(actualCode, expectedCode);
  assert.equal(actualConstraint, expectedConstraint);
}

test("借用模型的真实 PostgreSQL 约束", async (context) => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for schema integration tests.");
  }

  // 每次创建独立空库并重放迁移；不在开发库插入或删除测试记录。
  const databaseToken = randomUUID();
  const safeToken = databaseToken.replaceAll("-", "");
  const testDatabaseName = "cirkit_schema_test_" + safeToken;
  const validDatabaseName = /^cirkit_schema_test_[a-f0-9]{32}$/;

  if (!validDatabaseName.test(testDatabaseName)) {
    throw new Error("Unexpected test database name.");
  }

  const testDatabaseUrl = new URL(connectionString);
  testDatabaseUrl.pathname = "/" + testDatabaseName;
  const testConnectionString = testDatabaseUrl.toString();
  const admin = new Client({ connectionString });
  const client = new Client({ connectionString: testConnectionString });
  let databaseCreated = false;

  await admin.connect();

  try {
    const createDatabaseSql = 'CREATE DATABASE "' + testDatabaseName + '"';
    await admin.query(createDatabaseSql);
    databaseCreated = true;
    await client.connect();

    const migrationsUrl = new URL("../../prisma/migrations/", import.meta.url);
    const migrationEntries = await readdir(migrationsUrl, { withFileTypes: true });
    const migrationNames: string[] = [];

    for (const entry of migrationEntries) {
      if (entry.isDirectory()) {
        migrationNames.push(entry.name);
      }
    }

    migrationNames.sort();

    for (const migrationName of migrationNames) {
      const sqlUrl = new URL(migrationName + "/migration.sql", migrationsUrl);
      const migrationSql = await readFile(sqlUrl, "utf8");
      await client.query(migrationSql);
    }

    await client.query("BEGIN");
    await client.query(`INSERT INTO "user" ("id", "name", "email", "updatedAt")
      VALUES ('owner', 'Owner', 'owner@example.invalid', NOW()),
             ('borrower', 'Borrower', 'borrower@example.invalid', NOW())`);
    await client.query(`INSERT INTO "Group" ("groupId", "groupName", "groupUpdatedAt")
      VALUES ('group', 'Test group', NOW())`);
    await client.query(`INSERT INTO "GroupMembership"
      ("membershipId", "groupId", "userId", "membershipUpdatedAt")
      VALUES ('membership', 'group', 'borrower', NOW())`);
    await client.query(`INSERT INTO "Item"
      ("itemId", "ownerId", "itemName", "itemDescription", "itemCategory", "itemCondition", "itemUpdatedAt")
      VALUES ('item', 'owner', 'Drill', 'Test drill', 'Tools', 'Good', NOW())`);
    await client.query(`INSERT INTO "ItemAccess" ("itemAccessId", "itemId", "groupId")
      VALUES ('access', 'item', 'group')`);

    const insertRequestSql = `INSERT INTO "Request"
      ("requestId", "itemId", "borrowerId", "groupId", "requestStartDate", "requestEndDate", "requestUpdatedAt")
      VALUES ($1, 'item', 'borrower', 'group', $2, $3, NOW())`;

    await context.test("同日借还合法，且允许同一物品存在多笔 Pending", async () => {
      await client.query(insertRequestSql, ["request1", "2026-11-10", "2026-11-10"]);
      await client.query(insertRequestSql, ["request2", "2026-11-15", "2026-11-17"]);
      const result = await client.query(`SELECT "requestStatus", "requestCompletedAt"
        FROM "Request" ORDER BY "requestId"`);
      assert.equal(result.rowCount, 2);

      for (const row of result.rows) {
        assert.equal(row.requestStatus, "PENDING");
        assert.equal(row.requestCompletedAt, null);
      }

      const item = await client.query(`SELECT "itemStatus", "itemArchivedAt" FROM "Item"`);
      assert.equal(item.rows[0].itemStatus, "AVAILABLE");
      assert.equal(item.rows[0].itemArchivedAt, null);
    });

    await context.test("重复组成员关系被拒绝", async () => {
      const sql = `INSERT INTO "GroupMembership"
        ("membershipId", "groupId", "userId", "membershipUpdatedAt")
        VALUES ('duplicate', 'group', 'borrower', NOW())`;
      await expectConstraint(client, sql, [], "23505", "GroupMembership_groupId_userId_key");
    });

    await context.test("重复物品组访问关联被拒绝", async () => {
      const sql = `INSERT INTO "ItemAccess" ("itemAccessId", "itemId", "groupId")
        VALUES ('duplicate', 'item', 'group')`;
      await expectConstraint(client, sql, [], "23505", "ItemAccess_itemId_groupId_key");
    });

    await context.test("结束日期早于开始日期被拒绝", async () => {
      const parameters = ["bad-date", "2026-11-12", "2026-11-10"];
      await expectConstraint(client, insertRequestSql, parameters, "23514", "Request_valid_date_range");
    });

    await context.test("不同日期也不能同时存在两笔 Approved", async () => {
      await client.query(`UPDATE "Request" SET "requestStatus" = 'APPROVED' WHERE "requestId" = 'request1'`);
      const sql = `UPDATE "Request" SET "requestStatus" = 'APPROVED' WHERE "requestId" = 'request2'`;
      await expectConstraint(client, sql, [], "23505", "Request_one_approved_per_item");
    });

    await context.test("完成后可有下一笔 Approved，历史记录保留", async () => {
      await client.query(`UPDATE "Request" SET "requestStatus" = 'COMPLETED',
        "requestCompletedAt" = NOW() WHERE "requestId" = 'request1'`);
      await client.query(`UPDATE "Request" SET "requestStatus" = 'APPROVED' WHERE "requestId" = 'request2'`);
      const result = await client.query(`SELECT "requestStatus" FROM "Request" ORDER BY "requestId"`);
      assert.equal(result.rows[0].requestStatus, "COMPLETED");
      assert.equal(result.rows[1].requestStatus, "APPROVED");
    });

    await context.test("撤销访问关联不删除申请；物品外键保护历史", async () => {
      // 此处只验证数据库关联，不代表业务接口允许撤销正在借用的组访问。
      await client.query(`DELETE FROM "ItemAccess" WHERE "itemAccessId" = 'access'`);
      const requests = await client.query(`SELECT "groupId" FROM "Request"`);
      assert.equal(requests.rowCount, 2);
      await expectConstraint(client, `DELETE FROM "Item" WHERE "itemId" = 'item'`, [], "23001", "Request_itemId_fkey");
    });
  } finally {
    await client.end();

    try {
      // 仅清理本次成功创建、名称经过校验的临时库。
      if (databaseCreated) {
        const dropDatabaseSql = 'DROP DATABASE "' + testDatabaseName + '"';
        await admin.query(dropDatabaseSql);
      }
    } finally {
      await admin.end();
    }
  }
});
