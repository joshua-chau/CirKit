BEGIN;

-- 重命名成员表及其约束和索引，保留现有成员记录。
ALTER TABLE "group_membership" RENAME TO "group_member";
ALTER TABLE "group_member" RENAME CONSTRAINT "group_membership_pkey" TO "group_member_pkey";
ALTER TABLE "group_member" RENAME CONSTRAINT "group_membership_groupId_fkey" TO "group_member_groupId_fkey";
ALTER TABLE "group_member" RENAME CONSTRAINT "group_membership_userId_fkey" TO "group_member_userId_fkey";
ALTER INDEX "group_membership_userId_idx" RENAME TO "group_member_userId_idx";
ALTER INDEX "group_membership_groupId_userId_key" RENAME TO "group_member_groupId_userId_key";

COMMIT;
