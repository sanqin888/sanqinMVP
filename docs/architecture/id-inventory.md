# Current ID inventory

Phase 9 Slice 8P-D2 working snapshot: `origin/dev@3bae5682` plus the local
employee net-pay settlement source/schema (2026-09-18). Current source of truth remains
`apps/api/prisma/schema.prisma`; schema/migration authority follows `AGENTS.md`.

The working schema contains **92 models**: 82 UUID-backed primary keys, six integer
primary keys, and four natural/stable-token primary keys. The merged Payroll foundation
through D1 remains in `dev`. D2 adds one Accounting/Payroll-owned UUID model,
`PayrollEmployeePayment`, with public `paymentStableId`, unique internal `runId`,
stable scalar `paymentAccountStableId` and stable scalar `journalEntryStableId`.
The D2 companion migration `20260918200458_phase9_slice8p_d2_payroll_employee_payment`
has been user-generated and reviewed as additive create-table/unique/index/FK-only SQL;
it remains pending merge into `dev` with PR #2392.

## Primary-key families

| Family | Models |
|---|---|
| UUID-backed (82) | UberRateLimitLease; User; UserSession; TrustedDevice; AuthChallenge; Store; StoreConfig; PosDevice; UserInvite; UserAddress; Order; PosPrintJob; Coupon; CouponTemplate; CouponProgram; PromotionRule; UserCoupon; OrderItem; UberWebhookInbox; UberOrderAction; OrderAmendment; OrderAmendmentItem; LoyaltyAccount; LoyaltyTenderReservation; LoyaltyLedger; CheckoutIntent; CloverMerchantAuthorization; PaymentTransaction; PaymentCheckoutAttempt; MessagingSuppression; MessagingSend; MessagingDeliveryEvent; MessagingWebhookEvent; RecipientFailureCounter; MenuCategory; MenuItem; MenuPackagingType; MenuItemPackaging; MenuItemComponent; MenuOptionGroupTemplate; MenuOptionTemplateChoice; MenuOptionChoiceLink; MenuItemOptionGroup; AccountingCategory; AccountingAccount; AccountingJournalEntry; AccountingJournalLine; PayrollEmployer; PayrollEmployerConfigVersion; PayrollEmployee; PayrollEmployeeConfigVersion; PayrollEmployeeYearOpening; PayrollRun; PayrollEmployeePayment; AccountingTransaction; AccountingExpenseDocument; AccountingExpensePaymentAllocation; AccountingSourceArtifact; AccountingArtifactBinaryRetention; AccountingParseRun; AccountingInboxItem; AccountingTrustedSender; AccountingProviderRecognitionRule; AccountingProviderFinancialDocument; AccountingProviderFinancialLine; AccountingProviderFinancialCoverage; UberFinancialReport; AccountingAuditLog; AccountingPeriodClose; AnalyticsEvent; OpsEvent; UberMerchantConnection; UberStoreMapping; UberItemChannelConfig; UberCategoryConfig; UberModifierGroupConfig; UberOptionItemConfig; UberOptionChildGroupBinding; UberMenuPublishVersion; UberPublishedMenuItem; UberReconciliationReport; UberOpsTicket |
| Integer (6) | BrandConfig singleton; LoyaltyProgramPolicy singleton; BusinessHour; Holiday; MenuDailySpecial; AccountingAutomationConfig singleton |
| Natural/stable-token (4) | UberRateLimitState.`partitionKey`; PosConnectivityReadModel.`storeStableId`; CloverOAuthStateRequest.`stateHash`; UberOAuthStateRequest.`nonce` |

## Stable business identities

| Area | Stable identities present |
|---|---|
| Identity and Store | `User.userStableId`, `Store.storeStableId`, `PosDevice.deviceStableId`, `UserInvite.inviteStableId`, `UserAddress.addressStableId` (canonical `c...` CUID; Slice 4C-A removes the historical application-only `a...` prefix rewrite) |
| Orders and Offers | `Order.orderStableId`, `Coupon.couponStableId`, `CouponTemplate.couponStableId`, `CouponProgram.programStableId`, `PromotionRule.stableId`, `OrderAmendment.amendmentStableId` |
| Catalog | `MenuCategory.stableId`, `MenuItem.stableId`, `MenuPackagingType.stableId`, `MenuDailySpecial.stableId`, `MenuOptionGroupTemplate.stableId`, `MenuOptionTemplateChoice.stableId` plus stable references for components/options |
| Payments and Loyalty | `PaymentTransaction.attemptId`, `PaymentCheckoutAttempt.attemptId`, `PaymentCheckoutAttempt.orderStableId`, `LoyaltyLedger.ledgerStableId` |
| Accounting / Payroll | `categoryStableId`, `accountStableId`, `entryStableId`, `txStableId`, `documentStableId`, `paymentAllocationStableId`, `artifactStableId`, `inboxItemStableId`, `trustedSenderStableId`, `ruleStableId`, `coverageStableId`, `reportStableId`; Payroll adds `employerStableId`, config `configStableId`, `employeeStableId`, `openingStableId`, `runStableId`, and D2 `paymentStableId` |
| Uber channel | `versionStableId`, `reportStableId`, `ticketStableId` and stable menu/category/template/choice references |

## External/provider identities

| Boundary | Fields |
|---|---|
| Uber orders/menu | `externalOrderId`, `externalDeliveryId`, `externalDisplayId`, `externalItemId`, `externalLineId`, `externalModifierId`, `externalCategoryId`, `externalModifierGroupId`, `uberStoreId` |
| Clover/payments | `merchantId`, `externalPaymentId`, `providerPaymentId`, `providerRefundId`, `providerOrderId`, `terminalId` |
| Messaging | `providerMessageId` |
| Accounting import | `importBatchId`, `externalRowId` |

## Ambiguous names requiring explicit treatment

| Field | Actual meaning now | Required direction |
|---|---|---|
| `StoreConfig.storeId` | Store database UUID and primary key | Rename/type as `StoreDbId` inside persistence boundaries |
| `Order.storeId` | Optional `Store.storeStableId` reference, despite the generic name | Expose as `storeStableId`; never treat as Store UUID |
| `PaymentCheckoutAttempt.storeId` | Stable business store identity (documented in schema) | Expose/type as `storeStableId` |
| `Order.userId` | Nullable internal User database identity, stored as PostgreSQL UUID after the Phase 4 rollout recovery | Keep repository/internal or rename/type as `UserDbId`; public contracts use stable identity |
| `UserAddress.addressStableId` | Public Customer address identity. Schema default is already `cuid()`, but the historical application generator rewrote `c...` to `a...`; production audit on 2026-09-06 found 2/2 rows in that legacy shape | New writes use the canonical shared `c...` generator. The two audited historical rows have been deterministically repaired in production by restoring the first character to `c`, and the saved-address resolution path is verified. Keep the global normalizer strict. |
| Accounting legacy Order linkage | **RESOLVED in Phase 9 Slice 6D-A / 7-A**: provider settlement `orderId` disappeared with `PlatformSettlementRecord`, and `AccountingTransaction.orderId` is contracted after production verified zero rows | Keep canonical Order identity in Orders-owned financial facts and Journal stable fact references; do not reintroduce an ambiguous scalar `orderId` into AccountingTransaction |
| Accounting actor / user audit identity | **RESOLVED in Phase 9 Slice 7-B / production-applied**: human-only persisted identities use explicit `*UserStableId`, while Journal/Audit actor fields use `*ActorRef` because production contains both authenticated user stable IDs and registered `system:*` actors | Corrected Class B rename migration is production-applied and preserves existing strings exactly; do not add a User DB FK or reinterpret system actors as users. The legacy Audit Web/PWA `operatorUserId` response/query label remains only until planned Slice 8B contract cleanup |
| Uber persistence `storeId` | Required SanQ store stable identity; Prisma no longer supplies an implicit `"default"` value | Every new write must pass explicit store identity. Do not backfill Test Store/sandbox history for this contraction; remove those verification-era rows selectively during Uber Production Cutover Cleanup after verification approval. |
| BusinessHour/Holiday `storeId` | Store DB UUID with legacy default UUID | Move public contracts to stable identity and keep conversion inside persistence |

## Rules for new work

- Public contracts name the identity space: `*StableId`, `*DbId`,
  `provider*Id`, or `external*Id`; a bare `id` is local only.
- Provider IDs never become SanQ aggregate IDs.
- Cross-context APIs do not expose Prisma-generated model types or raw DB UUIDs.
- Identity changes follow expand/backfill/cutover/contract and require separately
  authorized schema/migration work.
