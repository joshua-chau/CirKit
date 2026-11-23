-- Notify the item owner when the borrower cancels a request or returns the item.
ALTER TYPE "NotificationType" ADD VALUE 'REQUEST_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE 'ITEM_RETURNED';
