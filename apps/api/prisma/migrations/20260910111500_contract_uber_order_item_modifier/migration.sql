-- Phase 8 Slice 8.3A0: remove the dead Uber modifier persistence table.
-- Uber Eats is still pre-production and all current rows in this table are disposable test data.
-- Apply before Uber Production traffic begins; otherwise stop and re-audit before dropping it.
-- The canonical modifier snapshot remains on OrderItem.optionsJson; do not use CASCADE so
-- any unexpected database dependency blocks deployment instead of being removed implicitly.
DROP TABLE "UberOrderItemModifier";
