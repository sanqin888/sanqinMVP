-- Phase 9 Slice 7-B: preserve existing Accounting identity values while
-- contracting ambiguous persisted names to explicit actor/user-stable contracts.

-- AccountingAuditLog.operatorUserId already stores both authenticated userStableId
-- values and registered system:* actor keys, so preserve the column contents exactly.
ALTER TABLE "AccountingAuditLog"
RENAME COLUMN "operatorUserId" TO "operatorActorRef";

ALTER INDEX "AccountingAuditLog_operatorUserId_createdAt_idx"
RENAME TO "AccountingAuditLog_operatorActorRef_createdAt_idx";

-- Human-only stable user identity fields keep their existing values and constraints.
ALTER TABLE "AccountingExpenseDocument"
RENAME COLUMN "confirmedByUserId" TO "confirmedByUserStableId";

-- Journal actor fields legitimately contain either userStableId or system:* actor refs.
ALTER TABLE "AccountingJournalEntry"
RENAME COLUMN "createdByUserStableId" TO "createdByActorRef";

ALTER TABLE "AccountingJournalEntry"
RENAME COLUMN "updatedByUserStableId" TO "updatedByActorRef";

ALTER TABLE "AccountingPeriodClose"
RENAME COLUMN "closedByUserId" TO "closedByUserStableId";

ALTER TABLE "AccountingTransaction"
RENAME COLUMN "createdByUserId" TO "createdByUserStableId";

ALTER TABLE "AccountingTransaction"
RENAME COLUMN "updatedByUserId" TO "updatedByUserStableId";
