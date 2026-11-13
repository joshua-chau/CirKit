-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('AVAILABLE', 'BORROWED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "Group" (
    "groupId" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "groupCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("groupId")
);

-- CreateTable
CREATE TABLE "GroupMembership" (
    "membershipId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "membershipRole" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "membershipCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "membershipUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupMembership_pkey" PRIMARY KEY ("membershipId")
);

-- CreateTable
CREATE TABLE "Item" (
    "itemId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemDescription" TEXT NOT NULL,
    "itemCategory" TEXT NOT NULL,
    "itemCondition" TEXT NOT NULL,
    "itemStatus" "ItemStatus" NOT NULL DEFAULT 'AVAILABLE',
    "itemArchivedAt" TIMESTAMP(3),
    "itemCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itemUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "ItemAccess" (
    "itemAccessId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "itemAccessCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemAccess_pkey" PRIMARY KEY ("itemAccessId")
);

-- CreateTable
CREATE TABLE "BorrowRequest" (
    "requestId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "requestStartDate" DATE NOT NULL,
    "requestEndDate" DATE NOT NULL,
    "requestStatus" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestUpdatedAt" TIMESTAMP(3) NOT NULL,
    "requestCompletedAt" TIMESTAMP(3),

    CONSTRAINT "BorrowRequest_pkey" PRIMARY KEY ("requestId")
);

-- CreateIndex
CREATE INDEX "GroupMembership_userId_idx" ON "GroupMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMembership_groupId_userId_key" ON "GroupMembership"("groupId", "userId");

-- CreateIndex
CREATE INDEX "Item_ownerId_idx" ON "Item"("ownerId");

-- CreateIndex
CREATE INDEX "ItemAccess_groupId_idx" ON "ItemAccess"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemAccess_itemId_groupId_key" ON "ItemAccess"("itemId", "groupId");

-- CreateIndex
CREATE INDEX "BorrowRequest_itemId_requestStatus_idx" ON "BorrowRequest"("itemId", "requestStatus");

-- CreateIndex
CREATE INDEX "BorrowRequest_borrowerId_requestCreatedAt_idx" ON "BorrowRequest"("borrowerId", "requestCreatedAt");

-- CreateIndex
CREATE INDEX "BorrowRequest_groupId_requestStatus_idx" ON "BorrowRequest"("groupId", "requestStatus");

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("groupId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemAccess" ADD CONSTRAINT "ItemAccess_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("itemId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemAccess" ADD CONSTRAINT "ItemAccess_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("groupId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("itemId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("groupId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 同一物品最多一笔 APPROVED；允许多笔 Pending 和历史申请。
CREATE UNIQUE INDEX "BorrowRequest_one_approved_per_item"
ON "BorrowRequest" ("itemId")
WHERE "requestStatus" = 'APPROVED';

-- 起止日期包含当天，同日借还为一天；禁止倒置日期。
ALTER TABLE "BorrowRequest"
ADD CONSTRAINT "BorrowRequest_valid_date_range"
CHECK ("requestEndDate" >= "requestStartDate");