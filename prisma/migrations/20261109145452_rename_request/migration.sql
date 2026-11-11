-- Rename the existing table without deleting requests or changing request data.
BEGIN;

ALTER TABLE "BorrowRequest" RENAME TO "Request";

-- Keep primary key, foreign key, and date constraint names aligned with the model.
ALTER TABLE "Request" RENAME CONSTRAINT "BorrowRequest_pkey" TO "Request_pkey";
ALTER TABLE "Request" RENAME CONSTRAINT "BorrowRequest_itemId_fkey" TO "Request_itemId_fkey";
ALTER TABLE "Request" RENAME CONSTRAINT "BorrowRequest_borrowerId_fkey" TO "Request_borrowerId_fkey";
ALTER TABLE "Request" RENAME CONSTRAINT "BorrowRequest_groupId_fkey" TO "Request_groupId_fkey";
ALTER TABLE "Request" RENAME CONSTRAINT "BorrowRequest_valid_date_range" TO "Request_valid_date_range";

-- Renaming preserves each index definition, including the APPROVED-only predicate.
ALTER INDEX "BorrowRequest_itemId_requestStatus_idx" RENAME TO "Request_itemId_requestStatus_idx";
ALTER INDEX "BorrowRequest_borrowerId_requestCreatedAt_idx" RENAME TO "Request_borrowerId_requestCreatedAt_idx";
ALTER INDEX "BorrowRequest_groupId_requestStatus_idx" RENAME TO "Request_groupId_requestStatus_idx";
ALTER INDEX "BorrowRequest_one_approved_per_item" RENAME TO "Request_one_approved_per_item";

COMMIT;