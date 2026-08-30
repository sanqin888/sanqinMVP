# Current ID inventory

Phase 1 closeout snapshot: `origin/dev@a050d8b2` (2026-08-30). Source of truth:
`apps/api/prisma/schema.prisma`. Phase 1 made no Prisma schema changes, so the
model-family counts below remain unchanged from the initial baseline.

The schema contains **75 models**: 66 UUID-backed primary keys, six integer
primary keys, and three natural/token primary keys. This inventory describes
semantics; it does not authorize a schema or migration change.

## Primary-key families

| Family | Models |
|---|---|
| UUID-backed (66) | UberRateLimitLease; User; UserSession; TrustedDevice; AuthChallenge; Store; StoreConfig; PosDevice; UserInvite; UserAddress; Order; PosPrintJob; Coupon; CouponTemplate; CouponProgram; PromotionRule; UserCoupon; OrderItem; UberOrderItemModifier; UberWebhookInbox; UberOrderAction; UberOrderCancellation; OrderAmendment; OrderAmendmentItem; LoyaltyAccount; LoyaltyTenderReservation; LoyaltyLedger; CheckoutIntent; CloverMerchantAuthorization; PaymentTransaction; PaymentCheckoutAttempt; MessagingSuppression; MessagingSend; MessagingDeliveryEvent; MessagingWebhookEvent; RecipientFailureCounter; MenuCategory; MenuItem; MenuPackagingType; MenuItemPackaging; MenuItemComponent; MenuOptionGroupTemplate; MenuOptionTemplateChoice; MenuOptionChoiceLink; MenuItemOptionGroup; AccountingCategory; AccountingAccount; AccountingTransaction; AccountingExpenseDocument; PlatformSettlementRecord; UberFinancialReport; AccountingAuditLog; AccountingPeriodClose; AnalyticsEvent; OpsEvent; UberMerchantConnection; UberStoreMapping; UberItemChannelConfig; UberCategoryConfig; UberModifierGroupConfig; UberOptionItemConfig; UberOptionChildGroupBinding; UberMenuPublishVersion; UberPublishedMenuItem; UberReconciliationReport; UberOpsTicket |
| Integer (6) | BrandConfig singleton; BusinessConfig singleton; BusinessHour; Holiday; MenuDailySpecial; AccountingAutomationConfig singleton |
| Natural/token (3) | UberRateLimitState.`partitionKey`; CloverOAuthStateRequest.`stateHash`; UberOAuthStateRequest.`nonce` |

## Stable business identities

| Area | Stable identities present |
|---|---|
| Identity and Store | `User.userStableId`, `Store.storeStableId`, `PosDevice.deviceStableId`, `UserInvite.inviteStableId`, `UserAddress.addressStableId` |
| Orders and Offers | `Order.orderStableId`, `Coupon.couponStableId`, `CouponTemplate.couponStableId`, `CouponProgram.programStableId`, `PromotionRule.stableId`, `OrderAmendment.amendmentStableId` |
| Catalog | `MenuCategory.stableId`, `MenuItem.stableId`, `MenuPackagingType.stableId`, `MenuDailySpecial.stableId`, `MenuOptionGroupTemplate.stableId`, `MenuOptionTemplateChoice.stableId` plus stable references for components/options |
| Payments and Loyalty | `PaymentTransaction.attemptId`, `PaymentCheckoutAttempt.attemptId`, `PaymentCheckoutAttempt.orderStableId`, `LoyaltyLedger.ledgerStableId` |
| Accounting | `categoryStableId`, `accountStableId`, `txStableId`, `documentStableId`, `settlementStableId`, `reportStableId` |
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
| `Order.userId` | Optional user database UUID | Keep repository/internal or rename/type as `UserDbId`; public contracts use stable identity |
| `AccountingTransaction.orderId` and settlement `orderId` | Scalar string with no explicit identity space | Resolve owner and identity type before crossing a context boundary |
| Uber configuration `storeId @default("default")` | Implicit single-store compatibility identity | Backfill explicit `storeStableId`, measure fallback use, then remove the default |
| BusinessHour/Holiday `storeId` | Store DB UUID with legacy default UUID | Move public contracts to stable identity and keep conversion inside persistence |

## Rules for new work

- Public contracts name the identity space: `*StableId`, `*DbId`,
  `provider*Id`, or `external*Id`; a bare `id` is local only.
- Provider IDs never become SanQ aggregate IDs.
- Cross-context APIs do not expose Prisma-generated model types or raw DB UUIDs.
- Identity changes follow expand/backfill/cutover/contract and require separately
  authorized schema/migration work.
