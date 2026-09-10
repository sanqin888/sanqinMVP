-- Phase 8 Slice 8.3C: remove the unused structured Uber cancellation persistence table.
-- Uber Eats is still pre-production and all current rows in this table are disposable Test Store data.
-- Durable provider evidence remains in UberWebhookInbox; canonical cancellation facts remain in
-- OrderAmendment + Order.status + the idempotent order.cancelled lifecycle event owned by Orders.
-- Apply before Uber Production traffic begins; otherwise stop and re-audit before dropping it.
-- Do not use CASCADE so any unexpected database dependency blocks deployment instead of being removed implicitly.
DROP TABLE "UberOrderCancellation";
