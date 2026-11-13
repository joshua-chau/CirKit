BEGIN;

-- 重命名组角色、表和字段，保留现有组和引用它们的借用记录。
ALTER TYPE "MembershipRole" RENAME TO "GroupRole";
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED');

ALTER TABLE "Group" RENAME TO "group";
ALTER TABLE "group" RENAME COLUMN "groupId" TO "id";
ALTER TABLE "group" RENAME COLUMN "groupName" TO "name";
ALTER TABLE "group" RENAME COLUMN "groupCreatedAt" TO "createdAt";
ALTER TABLE "group" RENAME COLUMN "groupUpdatedAt" TO "updatedAt";
ALTER TABLE "group" ADD COLUMN "description" TEXT;
ALTER TABLE "group" RENAME CONSTRAINT "Group_pkey" TO "group_pkey";

-- 保留成员 ID、角色和加入时间。新版模型移除成员最后更新时间。
ALTER TABLE "GroupMembership" RENAME TO "group_membership";
ALTER TABLE "group_membership" RENAME COLUMN "membershipId" TO "id";
ALTER TABLE "group_membership" RENAME COLUMN "membershipRole" TO "role";
ALTER TABLE "group_membership" RENAME COLUMN "membershipCreatedAt" TO "joinedAt";
ALTER TABLE "group_membership" DROP COLUMN "membershipUpdatedAt";
ALTER TABLE "group_membership" RENAME CONSTRAINT "GroupMembership_pkey" TO "group_membership_pkey";
ALTER INDEX "GroupMembership_userId_idx" RENAME TO "group_membership_userId_idx";
ALTER INDEX "GroupMembership_groupId_userId_key" RENAME TO "group_membership_groupId_userId_key";

-- 将成员关系的外键更新为新版 schema 定义的级联行为。
ALTER TABLE "group_membership"
  DROP CONSTRAINT "GroupMembership_groupId_fkey",
  DROP CONSTRAINT "GroupMembership_userId_fkey",
  ADD CONSTRAINT "group_membership_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "group"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "group_membership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 每次邀请保存独立记录。同一组可以多次邀请同一邮箱，令牌各自唯一。
CREATE TABLE "group_invitation" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "group_invitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "group_invitation_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "group"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "group_invitation_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "group_invitation_token_key" ON "group_invitation"("token");
CREATE INDEX "group_invitation_email_idx" ON "group_invitation"("email");

COMMIT;
