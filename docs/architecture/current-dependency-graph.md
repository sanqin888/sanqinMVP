# Current 12-context dependency graph

Phase 3 is **PRODUCTION VERIFIED / CLOSED** for its approved scope as of 2026-09-04.
Slice 6 merged via PR #2157 with final PR head `8547b46c`, squash merge `b91afb6a`, and
CI #5070 green; focused Uber menu item availability OFF -> ON, temporary suspension /
recovery, and option availability OFF -> ON verification were completed successfully.
Slice 2C remains explicitly DEFERRED and is not represented as completed by this
closure.

This snapshot records the **remaining direct cross-context import debt** enforced
by `tools/architecture/context-baseline.json` after Phase 3 closure plus the merged
post-closeout ownership/scanner hardening tail in PR #2160. Test files and registered
composition roots are excluded. Imports through `public-api`, `contracts`, `ports`,
`@shared/foundation`, `@shared/menu`, or `@shared/order` are approved public-contract
traffic and do not consume the debt counts below.

The CI architecture scanner is authoritative for the exact source scan. This file is
the human-readable working snapshot and must be refreshed at every modularization
boundary change. PR #2160 merged to `dev` as `3a20c8c5`; GitHub Actions CI #5080 passed
on final PR head `27b57f99`. The timed Store pause codec change has not yet been recorded
as production smoke-verified, so this document claims merged/CI evidence only for that
tail.

## Phase 3 Slice 6 cycle audit and contraction

Static closeout review found one public-contract cycle that the previous scanner
could not reject because public imports were counted separately from direct debt:

`catalog-pricing-offers -> external-channels -> catalog-pricing-offers`

Slice 6 first adds a strongly-connected-component cycle gate over public dependency
pairs that are not still grandfathered by an explicit legacy direct-import allowance.
The same slice then contracts the exposed cycle at source: Catalog availability
orchestration now supplies publication and suspend-window facts to the Uber public
availability command, while Uber menu wiring/API/worker composition no longer imports
Catalog availability surfaces. The reverse `external-channels -> catalog-pricing-offers`
public edge is therefore removed in source; the intended remaining availability
coordination direction is `catalog-pricing-offers -> external-channels` through the
Uber public capability. The first remote cycle-gate run additionally surfaced a
pre-existing public SCC among Catalog / Orders / Identity / Messaging. Because those
edges predate Slice 6, they are now captured as `legacyPublicCycleComponents`
contraction-only debt: they may shrink but cannot gain a new context or internal edge.
GitHub Actions CI #5070 passed on final PR head `8547b46c`; the Architecture gate found
no new direct pair and no new/expanded public-contract cycle. PR #2157 merged to `dev`
as `b91afb6a`, and the affected Uber availability flows were then actively verified.
No local scanner execution is claimed here.

## Post-closeout tail — monotonic guards and Store temporary-closure ownership

PR #2160 is **MERGED / CI GREEN**. It contracts the remaining
`brand-store -> store-operations-pos-print` direct import from `1 -> 0`. The timed
`temporaryCloseReason` codec (`buildAutoPauseReason` / `parseAutoPauseReason`) is now
implemented once under Brand/Store and exposed through `store/public-api.ts`; POS uses
that owner surface instead of owning the persistence format, while `StoreStatusService`
no longer imports POS internals. Existing encoded values and pause/resume semantics are
unchanged, with focused codec characterization coverage added.

The architecture scanner is hardened at the same time so legacy debt can only move
monotonically downward. A direct-import allowance whose observed count falls below its
baseline now fails as stale until the same PR lowers/removes the allowance. Likewise a
`legacyPublicCycleComponents` entry must exactly match the currently detected SCC
contexts and internal public edges; if the SCC shrinks or disappears, the old superset
baseline fails as stale. This prevents a previously removed direct edge or public-cycle
edge from being re-authorized later by an obsolete baseline. Initial CI #5078 exercised
that guard and exposed seven stale numeric allowances; the follow-up normalized those
allowances to the observed source counts, and final CI #5080 passed on PR head
`27b57f99` before squash merge `3a20c8c5`. No local scanner/lint/build/test run is
claimed. A POS timed-pause -> Uber status -> manual recovery smoke verification remains
to be recorded separately if/when exercised.

## Context map

| # | Context | Current paths |
|---:|---|---|
| 1 | architecture-foundation | `apps/api/src/common`, `libs/foundation` (`@shared/foundation`) |
| 2 | brand-store | `homepage`, `location`, `store` |
| 3 | catalog-pricing-offers | `application/menu`, `coupons`, `menu`, `promotions`, `libs/shared` |
| 4 | identity-customer-benefits | `admin`, `auth`, `benefits`, `loyalty`, `membership`, `phone-verification` |
| 5 | commerce-orders-fulfillment | `deliveries`, `orders`, `libs/order` |
| 6 | payments-clover | `clover`, `orchestration`, `payments` |
| 7 | store-operations-pos-print | `pos`, `tools/printer-server` |
| 8 | external-channels | `integrations` |
| 9 | messaging-notifications | `email`, `messaging`, `notifications`, `sms` |
| 10 | accounting-reporting-analytics | `accounting`, `analytics`, `reports` |
| 11 | web-pwa | `apps/web/src` |
| 12 | runtime-data-ci-ops | Prisma, data retention, CI, ops and architecture tooling |

## Remaining direct-import debt

Counts are production import-statement occurrences. Absence from the table means
there is no recorded direct-import allowance for that source context; any new
pair fails CI.

| Source | Remaining direct targets |
|---|---|
| architecture-foundation | none |
| brand-store | accounting-reporting-analytics 2; architecture-foundation 2; runtime-data-ci-ops 4 |
| catalog-pricing-offers | architecture-foundation 2; identity-customer-benefits 3; runtime-data-ci-ops 10 |
| identity-customer-benefits | architecture-foundation 13; brand-store 4; commerce-orders-fulfillment 1; external-channels 1; runtime-data-ci-ops 10; store-operations-pos-print 4 |
| commerce-orders-fulfillment | architecture-foundation 8; brand-store 2; identity-customer-benefits 4; messaging-notifications 4; runtime-data-ci-ops 10; store-operations-pos-print 2 |
| payments-clover | architecture-foundation 15; commerce-orders-fulfillment 10; identity-customer-benefits 13; messaging-notifications 2; runtime-data-ci-ops 8; store-operations-pos-print 11 |
| store-operations-pos-print | architecture-foundation 7; brand-store 2; commerce-orders-fulfillment 2; external-channels 1; identity-customer-benefits 14; runtime-data-ci-ops 5 |
| external-channels | architecture-foundation 11; commerce-orders-fulfillment 1; identity-customer-benefits 6; runtime-data-ci-ops 24 |
| messaging-notifications | architecture-foundation 3; runtime-data-ci-ops 6; store-operations-pos-print 1 |
| accounting-reporting-analytics | architecture-foundation 3; commerce-orders-fulfillment 1; external-channels 1; identity-customer-benefits 11; runtime-data-ci-ops 9 |
| web-pwa | none; cross-context shared contracts use registered public aliases |
| runtime-data-ci-ops | none; registered composition-root wiring is excluded |

## Phase 4 planning baseline

The next formal modularization phase is **Phase 4 — Identity / Customer / Benefits +
Messaging Boundary Contraction**, tracked in
`docs/architecture/phase-4-identity-customer-benefits-messaging.md`.

The current local monotonic baseline after the Slice 5A Loyalty ledger identity source contraction
records these direct-debt totals. Slice 5A consolidates Loyalty Runtime composition through one
context-local Prisma boundary while preserving the established Staff/Customer/Security ownership
contractions:

- payments-clover: **59**
- external-channels: **42**
- identity-customer-benefits: **33**
- commerce-orders-fulfillment: **30**
- store-operations-pos-print: **31**
- accounting-reporting-analytics: **25**
- catalog-pricing-offers: **15**
- messaging-notifications: **10**
- brand-store: **8**

The reduction in Orders/POS counts is baseline normalization of source debt that had
already contracted; it does not reopen those contexts as the next primary owner phase.
After Slice 2E-B, Payments/Clover at **59** is numerically above Identity/Customer/Benefits
at **37**, but that does not change the active Phase 4 owner scope. Slice 2E-A reduced Messaging
from **14 -> 10** by retiring SNS/SQS infrastructure; Slice 2E-B then removes the final direct
Identity -> Messaging pair, returns OrderEventsBus ownership to Orders and eliminates Uber's
Messaging bridge without recreating a public SCC. Identity, Commerce and External outgoing debt
now contract to **37 / 31 / 42** respectively. Slice 2E-B is merged via PR #2177 after final head
`dc07e820` passed CI #5137 and squash-merged as `718b2133`.

Slice 3 then contracts the internal Customer ownership surface without changing those counts:
`CustomerService` owns onboarding/profile/address/marketing-consent behavior, the retired
`MembershipOnboardingService` is deleted, and broad Membership reads no longer perform implicit
User creation/profile/PHONE_VERIFY mutations. Existing member HTTP routes stay unchanged,
Identity -> Messaging direct debt remains **0**, and the public SCC baseline remains empty. Slice 3
merged through PR #2178 after final head `73f7d2e1` passed CI #5140 and squash-merged as
`e813d918`.

Slice 4A then moves Staff list/update/invite administration and the self/last-active-admin invariants
from the Admin transport adapter behind the Identity-owned `STAFF_ADMINISTRATION` public port, with
`StaffAdministrationService` as its internal implementation. `AdminStaffController` no longer imports
Prisma or Prisma-generated role/status types and no longer owns invite delivery; the Identity owner
coordinates the existing `STAFF_INVITE_DELIVERY` public capability while reusing AuthService's
existing invite lifecycle. `AdminModule` also drops its historical direct Prisma provider and Staff
invite delivery wiring. This contracts Identity -> Runtime **14 -> 12** and Identity total
**37 -> 35** without adding a new direct Identity -> Messaging debt or reopening the public SCC. The
existing non-atomic active-admin count/update semantics and current ADMIN/STAFF transport behavior are
intentionally preserved. Slice 4A merged through PR #2179 after final head `f235893e` passed CI #5144
and squash-merged as `f91a849e`.

Slice 4B contracts Admin/member Customer/Security ownership without changing the numeric context graph.
Stage 1 merged via PR #2180 as `252cd26f` after final head `a2f52ddf` passed CI #5150.
Stage 2 merged via PR #2181 as `060e9417` after final head `f2cbf835` passed CI #5153:
`CUSTOMER_ADMINISTRATION` makes CustomerService the owner of Admin profile mutation/address reads, while
`ACCOUNT_SECURITY_ADMINISTRATION` owns stable-ID-scoped session/trusted-device management and
ACTIVE/DISABLED account status. `TrustedDevice.trustedDeviceStableId` is added through the authorized
additive migration; the browser-facing legacy `id` alias now carries the same stable identity rather
than the Prisma UUID. Identity -> Architecture remains **13**, Identity -> Runtime **12**, Identity total
**35**, Identity -> Messaging **0**, and the public SCC baseline remains empty. The TrustedDevice
migration remains unapplied in production until the consolidated Phase 4 rollout.

Slice 4C is **MERGED / CI GREEN / AWAITING PHASE-END DEPLOYMENT** via PR #2182. Final head
`7cb071ad` passed GitHub Actions CI #5158 and squash-merged to `dev` as `3119ce76`. The approved
additive migration adds nullable `Order.userStableId`, deterministically backfills it from the existing
`Order.userId -> User.id` association with count/mismatch/orphan checks, and adds the
`(userStableId, createdAt)` index. The two existing `/admin/members/:userStableId/orders` and
`/top-items` transports move physically into Orders with the same guards/roles/response semantics;
Admin no longer queries Order/OrderItem persistence. Orders queries its own `userStableId` snapshot
and uses only the narrow Customer existence public capability to preserve `404 member not found`, so
no User DB UUID crosses the boundary and no Identity -> Orders public edge is introduced.
`OrdersModule` also switches its historical Membership module import to `membership/public-api`,
contracting Commerce -> Identity direct debt **5 -> 4** and Commerce outgoing total **31 -> 30** while
the public SCC baseline remains empty. The Order stable-ID migration is merged but remains unapplied
until the consolidated Phase 4 rollout.

Slice 4D-A is **MERGED / CI GREEN / AWAITING PHASE-END DEPLOYMENT** via PR #2183. Final head
`cec141ba` passed GitHub Actions CI #5162 and squash-merged to `dev` as `07dc1206`. The Identity-owned
`MEMBER_RECHARGE_VERIFICATION` public capability owns the existing `pos-recharge` member/contact
resolution, challenge/token lifecycle and Admin delegation boundary while `AdminMembersService` retains
the unchanged amount/token input validation and `LoyaltyService.applyTopup()` orchestration.

Slice 4D-H is **MERGED / CI GREEN / AWAITING PHASE-END DEPLOYMENT** via PR #2184. Final head
`4d850ba1` passed CI #5165 and squash-merged as `7853e4f9`. Recharge Email/SMS share one Identity-owned
challenge policy and DB-backed per-member send budget (one per 60 seconds, five per rolling 24 hours).
SMS uses Messaging `PHONE_VERIFICATION_DELIVERY` only for delivery rather than delegating its challenge
lifecycle to `PhoneVerificationService`. New recharge codes use required `MEMBER_RECHARGE_OTP_SECRET`,
and non-zero six-digit generation uses `crypto.randomInt`. POS rejects backend `{ ok:false }` sends
without entering `code-sent`; the approved rollout remains an atomic cutover with no legacy-secret fallback.

Slice 4D-I is **MERGED / CI GREEN / AWAITING PHASE-END DEPLOYMENT** via PR #2185. Final head
`d4b85e3a` passed GitHub Actions CI #5168 and squash-merged to `dev` as `b27ad8ce`. The new
Identity-internal `OtpChallengePolicyService` centralizes DB-backed cooldown/quota/supersession behavior
for Login 2FA, Phone Enrollment, Membership Login, Checkout, Email Verify, POS Recharge and generic Phone
Verification. `email_verify` contracts from 24 hours to 10 minutes; public membership-login/checkout flows
add a 30/hour IP spray budget; successful sends revoke older pending codes only after provider success;
failed provider sends revoke only the new challenge; and code-based verification consistently applies the
five-attempt revoke behavior. Generic Phone Verification no longer keeps process-local Map/timer rate-limit
state. Messaging remains delivery-only, with additive `ok/error` status on Auth challenge delivery.
No Prisma/dependency/context-import change is introduced. Expected numeric graph baselines remain
Identity -> Architecture **13**, Identity -> Runtime **12**, Identity total **35**, Identity -> Messaging
**0**, Commerce -> Identity **4**, with the public SCC baseline empty.

Slice 5A is **MERGED / CI GREEN / AWAITING PHASE-END DEPLOYMENT** via PR #2186. Final head
`3b904dd1` passed GitHub Actions CI #5171 and squash-merged to `dev` as `c28df1b5`. The authorized additive
migration adds nullable `LoyaltyLedger.orderStableId`, deterministically backfills the existing Order mapping
with count/mismatch/orphan checks, and deliberately leaves the existing `(orderId, type, sourceKey)` internal
idempotency key plus nullable `orderId` in place. All order-linked Loyalty ledger writes dual-write the stable
identity inside their existing transaction; manual no-order adjustments remain identity-null.
`LOYALTY_LEDGER_READER` now returns the persisted stable identity directly, so both Admin Members and Membership
stop performing `Order.id -> orderStableId` enrichment. The normal order-create path allocates its stable ID
before Loyalty writes, while payment/refund/amendment/top-up paths reuse their already-known stable identity.
Consolidating Loyalty Runtime imports through `loyalty-prisma.ts` contracts Identity -> Runtime **12 -> 10** and
Identity total **35 -> 33**. No new public dependency edge is introduced, so the public SCC baseline remains
empty. The migration remains unapplied in production.

### Phase 4 Slice 6 final dependency/SCC closeout — 2026-09-05

Final audit base is `origin/dev@0f58cf83` after Slice 5B merged through PR #2187. Final head `42891cf4` passed
CI #5174 and the merge SHA passed dev push CI #5175; both runs passed the Architecture baseline/SCC gate.

The final graph remains Payments/Clover **59**, External **42**, Identity/Customer/Benefits **33**, Store
Operations/POS/Print **31**, Commerce/Orders/Fulfillment **30**, Accounting **25**, Catalog/Offers **15**,
Messaging **10**, Brand/Store **8**. Slice 5B did not require a numeric allowance change because the new
`LOYALTY_ORDER_USAGE_READER` reused the already-existing Commerce -> Identity/Benefits direction.
`legacyPublicCycleComponents` remains empty and no reduced allowance is stale.

Slice 5B is **MERGED / CI GREEN / AWAITING PHASE-END DEPLOYMENT**. Orders detail/public-summary, legacy Web
external-payment reconstruction and POS/receipt/email print now delegate order usage to the Benefits-owned
stable-ID reader. Production-source search finds `this.prisma.loyaltyLedger` only under `apps/api/src/loyalty/**`;
`orderStableById` and `getSettledBalancePaymentCentsForOrder` have no remaining source matches. The non-unique
`LoyaltyLedger(orderStableId)` read index is present through the separate additive migration
`20260905204500_add_loyalty_ledger_order_stable_id_index`, while the 5A migration remains untouched.

Two visible debts are intentionally deferred rather than hidden to force a lower number. First,
`MembershipService.getMemberSummary()` still reads Order/OrderItem persistence and deep-imports the Orders-
internal `OrderItemOptionsSnapshot`; that remains the **Identity -> Commerce = 1** allowance. Replacing it with
an Orders public reader while Commerce already consumes Identity/Benefits would recreate a public SCC, so it
requires a later composite read-model/orchestration ownership design. Second, Phase 3 Slice 2C remains
transaction-sensitive: Points/Balance COMMIT, Coupon COMMIT and Order creation still share the same Prisma
transaction, and both Benefits COMMIT implementations consume the supplied transaction client. Closeout does
not split that atomicity or expose `Prisma.TransactionClient` across a public boundary.

Loyalty's paid-settlement Order lookup and UUID-based refund rollback also remain part of its intentionally
retained internal `LoyaltyLedger.orderId` idempotency/refund implementation from Slice 5A; they are not a
Commerce-side read-owner leak and are not silently reclassified as closed debt.

Production `_prisma_migrations` still has no applied row for any of the four accumulated Phase 4 migrations:
`20260905134000_add_trusted_device_stable_id`, `20260905145500_add_order_user_stable_id`,
`20260905193000_add_loyalty_ledger_order_stable_id`, and
`20260905204500_add_loyalty_ledger_order_stable_id_index`. All four are consolidated-rollout prerequisites and
must be applied before the new API source is activated. `MEMBER_RECHARGE_OTP_SECRET` remains a required rollout
prerequisite; secret presence was not inspected by this closeout audit.

No further safe Phase 4 dependency contraction is identified. The Phase 4 **source graph is closed**; the next
step is consolidated deployment readiness, migration/secret preflight, deployment, and focused active
verification.

Before the main Identity/Messaging slices, the planned cross-phase readiness/contraction
work is now complete and production verified:

1. **Slice 0A — Admin PromotionRule ownership contraction.** Merged via PR #2163 /
   `aa302629` after final GitHub Actions CI #5092 passed. PromotionRule management
   validation/CRUD sits behind the Offers-owned `PROMOTION_RULE_MANAGEMENT` capability;
   Admin no longer owns Prisma or Prisma-generated rule types. Raw persistence remains
   behind the existing `PromotionsService` Prisma entry, so Catalog -> Runtime stays at
   `10`. The retired Admin service is deleted, focused characterization/mapping tests are
   present, the central scanner reserves the delegate to Offers, and Identity -> Runtime
   contracts `18 -> 16`. The authorized Admin response contraction also removes unused
   DB `id`/`createdAt`/`updatedAt`/`deletedAt` fields while preserving all business fields,
   routes and request semantics. Active Admin create/edit/refresh/delete verification was
   completed on 2026-09-04, so the original 0A ownership slice is production VERIFIED.
2. **Slice 0A verification hotfix — POS server-authoritative promotion pricing.** PR #2166
   merged as `bb833550` after final head `567a1aba` passed CI #5102. It adds a narrow POS
   pricing quote to the existing Orders public capability so the POS adapter displays
   automatic promotions and the retained staff manual discount from the canonical server
   quote before taking payment. The POS payment adapter is also contracted to local
   `channel=in_store` only: the staff UberEats channel selector/payment method and their
   legacy branches are removed, while Uber webhook/import/runtime remains unchanged. Active
   production verification on 2026-09-04 confirmed same-item BOGO pricing appears in POS,
   the staff manual discount remains separate and stackable, and the completed order/payment
   amount matches the server-authoritative checkout total. The hotfix is therefore
   **PRODUCTION VERIFIED**. This is a method/transport expansion plus adapter cleanup on an
   already-existing POS -> Orders public boundary; it introduces no new context edge,
   direct-import debt, SCC member/edge, Prisma ownership, or baseline change. Offers still
   owns promotion policy and Orders still owns order pricing truth.
3. **Slice 0B — Catalog -> Orders public-cycle edge contraction.** PR #2168 merged as
   `b2d42c32` after final head `739938c5` passed GitHub Actions CI #5107. The reverse
   dependency was exactly the two Offers imports of Orders-owned `Channel`. Promotion
   applicability now uses the Offers-owned `PromotionRuleChannel = 'web' | 'in_store'`;
   Orders performs one exhaustive boundary mapping (`web -> web`, `in_store -> in_store`,
   `ubereats -> no PromotionRule context`). The authenticated Admin PromotionRule editor
   exposes only Web/POS channels, and the owner validator rejects the historical dead
   `ubereats` configuration value. Production data was read-only audited before
   implementation and contained **0** PromotionRule rows whose `channels` array included
   `ubereats`, so no schema/migration or data rewrite was required. Active production
   verification on 2026-09-04 confirmed the Admin channel contraction, Web PromotionRule
   pricing, POS BOGO/manual-discount behavior and Uber selection isolation; Slice 0B is
   therefore **PRODUCTION VERIFIED**. Uber order ingestion/runtime/wire behavior remains
   unchanged and continues to persist provider-supplied order amounts through the separate
   ingestion path rather than SanQ PromotionRule evaluation.

The prior Store temporary-close codec item is no longer a Phase 4 Slice 0 task because
PR #2160 already moved that persistence encoding to Brand/Store and removed the final
`brand-store -> store-operations-pos-print` direct edge.

Slice 0B removed the public edge
`catalog-pricing-offers -> commerce-orders-fulfillment`; Orders therefore left the legacy
SCC while `commerce-orders-fulfillment -> catalog-pricing-offers` remained the correct
one-way pricing-consumer dependency.

Phase 4 Slice 1 removes the remaining owner-reversed
`messaging-notifications -> identity-customer-benefits` public edge by moving email
verification challenge/account ownership to Identity and leaving Messaging with delivery
only. PR #2171 merged as `afa1bff6` after final head `94955b27` passed CI #5116. The former
three-context Catalog / Identity / Messaging component is no longer strongly connected:
`identity-customer-benefits -> catalog-pricing-offers` and
`catalog-pricing-offers -> messaging-notifications` may remain as forward consumer flows,
but there is no return path from Messaging to Identity. The
`legacyPublicCycleComponents` baseline is empty and the monotonic SCC guard rejects any
future public edge that recreates the cycle. Production deployment/verification is
intentionally deferred to the Phase 4 batch rollout.

Slice 2A contracts Auth challenge delivery behind the Messaging-owned
`AUTH_CHALLENGE_DELIVERY` public capability. Auth keeps challenge/session/MFA lifecycle;
Messaging owns OTP configuration/template/provider dispatch. Auth's seven concrete
Email/SMS/Messaging imports disappear while the welcome-notification pair remains, so
`identity-customer-benefits -> messaging-notifications` contracts **22 -> 15** and total
Identity outgoing direct debt contracts **60 -> 53**. Known-user delivery now crosses the
public boundary with `userStableId`, not the internal User DB UUID. PR #2172 merged as
`c8e91303` after final head `29bf23b7` passed CI #5120; deployment remains deferred to the
Phase 4 batch rollout.

Slice 2B contracts the five remaining Phone Verification Messaging implementation imports
behind the dedicated `PHONE_VERIFICATION_DELIVERY` public capability. Identity continues to
own phone normalization, IP/daily rate limits, non-zero OTP/hash policy, `AuthChallenge`,
10-minute expiry, attempts/consume/token validation and `sms_send_failed`; Messaging owns
only messaging snapshot/template/SMS provider dispatch. The historical OTP template purpose
stays fixed at `verify`, while caller purpose remains challenge metadata and Messaging
metadata. `identity-customer-benefits -> messaging-notifications` contracts **15 -> 10** and
total Identity outgoing direct debt contracts **53 -> 48**. PR #2173 merged as `41428324`
after final head `d63bc307` passed CI #5123; HTTP routes, Clover phone-proof validation and
AdminMembers' current PhoneVerificationService dependency remain unchanged. Deployment stays
deferred to the Phase 4 batch rollout.

Slice 2C contracts Admin's four concrete Email dependencies into two narrow Email public
capabilities. Staff invite create/resend/revoke state remains in Identity/Admin while
`STAFF_INVITE_DELIVERY` delegates the existing invite email path. POS member recharge email
OTP keeps contact/profile matching, challenge lifecycle and recharge-token semantics in
Identity, while `MEMBER_RECHARGE_EMAIL_DELIVERY` owns the bilingual message body,
`MessagingTemplateType.OTP`, `pos_recharge_otp` tag and provider dispatch. The delivery
boundary uses `userStableId` rather than the internal User DB UUID. Admin no longer imports
`EmailService` or `EmailModule`; `identity-customer-benefits -> messaging-notifications`
contracts **10 -> 6** and total Identity outgoing debt contracts **48 -> 44**. PR #2174 merged
as `e27489cf` after final head `2c18e3c5` passed CI #5126; deployment remains deferred to the
Phase 4 batch rollout.

Slice 2D contracts Auth and Membership lifecycle notifications behind the narrow
`CUSTOMER_LIFECYCLE_NOTIFICATION` public capability. Auth retains the new-user decision and
maps only stable customer/contact/name/language facts for registration welcome delivery.
Membership retains the persisted marketing-consent decision and invokes subscription welcome
only after `email + marketingEmailOptIn` are true; the existing marketing opt-in coupon trigger
still runs afterward. Messaging retains template rendering, registration email-to-SMS fallback,
provider routing and audit metadata, but registration/subscription sends now link by
`userStableId` rather than the User DB UUID. `identity-customer-benefits ->
messaging-notifications` contracts **6 -> 2** and total Identity outgoing debt contracts
**44 -> 40**. PR #2175 merged as `0cb3ce11` after final head `a0fa3f85` passed CI #5130;
deployment remains deferred to the Phase 4 batch rollout.

Slice 2E-A retires the user-confirmed unused AWS SNS/SQS infrastructure. The SNS HTTP webhook
and SES SQS processor are deleted, MessagingModule no longer needs Prisma for SNS persistence,
and runtime SNS/SQS environment wiring is removed while AWS SES/SMS send providers remain
available. This contracts `messaging-notifications -> architecture-foundation` **4 -> 3**,
`messaging-notifications -> runtime-data-ci-ops` **9 -> 6**, and Messaging total outgoing direct
debt **14 -> 10**. PR #2176 merged as `7746402b` after final head `11f73e88` passed CI #5132;
deployment remains deferred to the Phase 4 batch rollout.

Slice 2E-B locally moves `OrderEventsBus` out of Messaging and makes it private Orders/Fulfillment
fast-path infrastructure while preserving the separate durable lifecycle outbox. Loyalty no longer
subscribes to that bus; Orders invokes the stable-ID-only `LOYALTY_ORDER_PAID_SETTLEMENT` public
capability in the existing Orders -> Identity direction, so the empty public SCC baseline remains
empty. The final direct Identity -> Messaging imports contract **2 -> 0**, Identity -> Runtime
contracts **15 -> 14**, Commerce -> Messaging contracts **8 -> 4**, and External -> Messaging
contracts **2 -> 0**. Totals become Identity **37**, Commerce **31**, External **42**, Messaging
**10**. Uber order ingestion drops its dead paid-lifecycle flag and no longer needs a Messaging
bridge in API or worker composition; Uber wire behavior remains unchanged. The existing internal
`LoyaltyLedger.orderId` UUID remains deferred persistence debt; the new public boundary carries
only `orderStableId`.

## Phase 1 boundary changes reflected here

- `@shared/order` now owns Order contracts directly; `@shared/menu` no longer
  re-exports Order contracts.
- Daily-special policy now belongs to Promotions/Pricing instead of `common`.
- StableId validation primitives now live in neutral `@shared/foundation`; API
  `common` re-exports that implementation for existing server callers and Web
  imports the foundation package directly. Menu/Order packages no longer own or
  re-export those primitives.
- Web regular JSON transport is guarded separately: one browser client, one
  App Router BFF, and one server-side API helper; raw/direct fetch exceptions are
  explicit architecture allowances.
- Existing cycles remain migration debt for later phases. Phase 1 did not create
  a new direct context pair; CI rejects any such regression.

## Phase 2 Brand/Store boundary closed

- `apps/api/src/store/public-api.ts` now defines the narrow canonical Brand/Store
  configuration read contract. It exposes stable store identity and canonical
  BrandConfig/StoreConfig facts, but not the Store database UUID and not Benefits
  policy fields that happen to be duplicated in `BrandConfig` during transition.
- `PrismaBrandStoreConfigReader` is the single registered Prisma reader for that
  snapshot. It reads `BrandConfig` plus `Store`/`StoreConfig`, fails closed when
  canonical rows are missing, and never creates fallback configuration.
- Configured store stable identity now belongs to the Brand/Store public surface
  as `resolveConfiguredStoreStableId()`. Existing Orders, Clover, POS, Admin and
  Uber callers were moved off `common/store-id.ts`, lowering direct
  architecture-foundation debt without changing the resolved store value.
- `StoreStatusService` no longer reads or creates `BusinessConfig`. Store schedule
  reads now go through the Brand/Store-owned `STORE_SCHEDULE_READER`, with
  `storeStableId` resolved to `storeDbId` only inside the Prisma adapter. The
  BusinessHour/Holiday hard-coded store UUID defaults are removed by the
  store-scope migration, and BusinessHour uniqueness is scoped to
  `(storeDbId, weekday)` instead of weekday globally.
- Accounting, Promotions, PublicMenu, AdminMenu, and Orders now read store-local
  timezone through the canonical Store snapshot. Public/Admin menu reads no longer
  create a default `BusinessConfig` row as a side effect; Orders also no longer
  creates `BusinessConfig` while resolving pricing or daily-special time.
- POS exchange-rate configuration now uses the combined Brand/Store snapshot:
  `StoreConfig.timezone` controls the store clock and
  `BrandConfig.wechatAlipayExchangeRate` supplies the existing manual fallback.
  The POS exchange-rate module no longer imports Prisma directly, while the
  externally visible fallback source label remains unchanged for compatibility.
- POS StoreStatus/Connectivity now uses the canonical Brand/Store boundary for both
  reads and writes. Timed-pause status/timezone reads, manual pause/resume, and the
  watchdog's recovery race re-check no longer query or mutate `BusinessConfig`.
  The guarded POS StoreStatus transport now carries its authenticated device
  `storeStableId` through reads, pause/resume writes, and timed-pause
  compare-and-set reconciliation instead of letting the Brand/Store owner infer a
  configured store. The deployment-scoped connectivity watchdog resolves its
  configured `storeStableId` once, scopes ACTIVE POS-device heartbeats to that
  Store relation, and passes the same explicit identity through StoreStatus and
  pause reconciliation. The public `/public/store-status` route keeps its existing
  deployment-store behavior but resolves that identity at the transport boundary.
  The timed auto-resume compare-and-set remains inside the Brand/Store writer so
  an outdated expiry task cannot clear a newer pause; each store CAS updates only
  its canonical StoreConfig because the former singleton BusinessConfig mirror has
  been fully removed. POS is architecture-gated against regressing to Prisma
  configuration delegates or implicit store selection.
- POS Orders and Daily Summary browser timezone context now comes from the guarded
  `/pos/store-context` adapter. `PosDeviceGuard` supplies the authenticated device
  `storeStableId`, and the adapter requests that exact Store snapshot through
  `BRAND_STORE_CONFIG_READER`; the POS browser no longer uses the implicit
  `/staff/store/config` fallback for its own store context.
- Orders historical NULL-store compatibility is contracted in the current batch after
  direct production verification found `Order.storeId IS NULL = 0`. Store-scoped Orders
  and scheduled queries now match only the explicit canonical `storeStableId`; scheduled
  preparation no longer admits a NULL store row. Accepted, reprint, and amendment print
  dispatch now fail closed with a structured missing-store error instead of routing an
  unscoped order to `resolveConfiguredStoreStableId()`. Architecture scanning registers
  the affected Orders paths and rejects those NULL/configured-store fallbacks returning.
- Admin Brand/Store transport now uses only the owner-aligned staff contracts. Canonical
  staff Web Store consumers require an explicit `storeStableId` and use
  `/staff/stores/:storeStableId/*` adapters backed by `BRAND_STORE_CONFIG_READER/WRITER`
  and the Store schedule ports. The selector writes a valid `?store=` context before
  Store settings load. The singular `/staff/store/*` compatibility routes and the
  legacy `/admin/business/*` config/hours/holidays/temporary-close transport are both
  removed; the standalone legacy `BusinessHoursModule` is retired with that transport.
  Admin no longer writes `BusinessConfig`, `BrandConfig`, `StoreConfig`,
  `BusinessHour`, or `Holiday` through Prisma directly. The Brand/Store owner writer
  now writes only canonical `BrandConfig`/`StoreConfig` rows. Mirror-off production
  verification and the fail-closed destructive contraction are complete: the Prisma
  `BusinessConfig` model, physical table, sync trigger, and sync function are gone.
- Uber menu schedule/tax and store-status source reads now cross the Brand/Store
  boundary through an Uber application-owned `UBER_STORE_CONFIG_QUERY` port. The
  sole Uber composition root wires that port to `BRAND_STORE_CONFIG_READER` for
  both HTTP and dedicated-worker runtimes; Uber persistence no longer reads or
  creates `BusinessConfig`. Active Uber admin/source labels now identify
  `StoreConfig` as the canonical timezone/tax source; provider wire behavior is unchanged.
  Uber architecture CI now rejects any production `.businessConfig` regression.
- Messaging configuration now caches the canonical Brand/Store snapshot instead
  of a Prisma `BusinessConfig` model and no longer creates configuration on read.
  Brand support contact fields feed message templates, while Store name/address/
  phone feed invoice contact details so support and store-phone semantics are no
  longer conflated.
- `BrandStoreConfigModule` is exported through `store/public-api.ts`; its reader
  and writer tokens, identity/contract implementation, composition module, and
  shared Prisma implementation stay owner-internal. Cross-context consumers wire
  the public module and inject the public tokens instead of deep-importing internals.
- The architecture scanner protects the public surface from cross-context deep
  imports, prevents the canonical reader/writer from regressing to legacy persistence,
  requires canonical writes plus temporary-closure CAS, forbids any API runtime
  `.businessConfig` delegate, requires the Prisma `BusinessConfig` model to stay absent,
  and pins the registered contraction migration to atomic fail-closed parity/dependency
  checks with trigger → function → table DDL and no `CASCADE`. It also keeps POS
  Orders/Summary browser store context on the guarded POS endpoint and prevents
  canonical Admin Store clients/settings or the staff transport adapter from
  restoring implicit `/staff/store/*` routes or optional `storeStableId` contracts.
- Admin remains an Identity/Customer/Benefits adapter path for dependency-map
  accounting, but its Business configuration persistence now crosses the
  Brand/Store public writer boundary. No new direct context edge is introduced.
- Admin POS-device management crosses the Store Operations/POS `public-api.ts`
  management boundary. The former Admin Prisma device service and Prisma-generated
  status/store UUID DTO dependencies are removed, lowering Identity/Customer/Benefits
  runtime-data direct-import debt by five. Canonical Web requests use only
  `storeStableId`/`deviceStableId`; `pos-device.admin-db-id.v1` is now contracted,
  so unscoped list aliases, inbound Store/device DB UUID translation, the POS
  compatibility port/provider, and the Brand/Store legacy DB-ID resolver are absent.

## Phase 2 Benefits loyalty policy reader/writer boundary closed

- `apps/api/src/loyalty/public-api.ts` exposes narrow `LOYALTY_POLICY_READER` and
  `LOYALTY_POLICY_WRITER` contracts owned by Identity/Customer/Benefits. Loyalty
  earn/redeem/referral rates, tier multipliers, and tier thresholds remain
  explicitly excluded from the Brand/Store public configuration contract even
  though transitional columns currently live in `BrandConfig`.
- Membership program rules, Admin member tier-progress thresholds, and all
  LoyaltyService policy reads use the Benefits snapshot backed by transitional
  `BrandConfig` columns. Transaction-bound reads remain inside their existing
  Prisma transaction through `getLoyaltyPolicySnapshotWithTx(tx)`.
- Admin Members policy saves now use `/admin/benefits/loyalty-policy`, whose
  Benefits-owned writer preserves the established rounding/non-negative rules,
  while tightening `redeemDollarPerPoint` to the existing business invariant
  `> 0`; Phase B writes `LoyaltyProgramPolicy`, the `BusinessConfig` compatibility
  copy, and `BrandConfig` in one transaction. The compatibility copies are still
  required because the existing DB trigger is one-way (`BusinessConfig` -> canonical
  config); allowing either transitional copy to become stale could revert Benefits
  values on a later unrelated legacy config write.
- The general Admin Settings page no longer declares or resubmits Loyalty policy
  fields. During the Benefits transition, legacy `PATCH /admin/business/config` and
  `PUT /admin/business/temporary-close` rejected all ten Loyalty keys with HTTP 400;
  the later Brand/Store transport contraction now removes those routes entirely.
  `AdminBusinessService` still does not import or invoke Benefits policy readers or
  writers, and repository-wide Web code remains gated from restoring the retired
  `/admin/business/*` transport or routing Loyalty policy through it.
- Admin Members now reads editable settings from `GET /admin/benefits/loyalty-policy`
  through the Benefits settings reader, while POS payment reads the runtime policy
  from `GET /pos/loyalty-policy` through a POS adapter protected by the existing
  Session/Role/PosDevice guards. Both browser consumers use the centralized Web
  Loyalty API client rather than the legacy Admin Business response.
- Orders quote/create redemption conversion reads `redeemDollarPerPoint` through
  `LOYALTY_POLICY_READER`; the points/cents arithmetic remains characterized in an
  Orders-owned pure helper. Orders delivery pricing, sales tax, store coordinates,
  Uber Direct enablement, and daily-special store-local timezone now read through
  `BRAND_STORE_CONFIG_READER`; Orders no longer reads or creates `BusinessConfig`.
  The architecture scanner registers Orders as a migrated Brand/Store consumer and
  forbids reintroducing the `BusinessConfig` symbol or delegate there.
- `benefits.business-config-loyalty-policy.v1` is **closed**. Phase A expanded and
  backfilled `LoyaltyProgramPolicy`, Phase B established transitional triple-write/parity,
  Phase C cut runtime reads to the dedicated row, and Phase D completed the persistence
  contraction. Editable settings, runtime/transaction reads, and writes now use only
  `LoyaltyProgramPolicy`; `BrandConfig` and `BusinessConfig` no longer contain Loyalty
  policy columns; `syncBusinessConfigToCanonicalConfig()` contains no Loyalty propagation;
  and the architecture scanner rejects both application regression and reactivation of
  this persistence compatibility. Production direct verification covered Admin policy
  change/restore, POS policy load, Web pure-points order plus exact refund reversal,
  public membership rules, unrelated Store write/restore, database metadata, and the
  relevant error logs.
- `brand-store.business-config.v1` is **closed**. The application cutover and mirror-off
  production proof completed first, then migration
  `20260902044000_contract_brand_store_business_config` rechecked the 29 overlapping fields,
  expected trigger/function binding, row counts, and database dependencies under locks before
  dropping trigger → function → table without `CASCADE`. Post-deployment verification on
  2026-09-02 confirmed `BusinessConfig`, `BusinessConfig_sync_canonical_config`, and
  `syncBusinessConfigToCanonicalConfig()` are absent while `BrandConfig`, the configured
  Store, and `StoreConfig` remain intact. An Admin Brand PATCH persisted the new canonical
  exchange rate `5.2`; POS pause/resume both returned 200, Uber status sync succeeded in both
  directions, final StoreConfig state is open, and API/worker error scans were clean.

## Phase 3 Catalog / Pricing / Offers started

- Phase 3 Slice 1 is tracked in
  `docs/architecture/phase-3-catalog-pricing-offers.md`.
- Orders now consumes Pricing only through `apps/api/src/promotions/public-api.ts`.
  The public surface exposes the existing promotion evaluator/types plus a narrow
  `PROMOTION_CONTEXT_READER`; `OrdersService` no longer imports the Pricing
  service, evaluator, engine or coupon adapter internals directly.
- The corresponding architecture allowance
  `commerce-orders-fulfillment -> catalog-pricing-offers` is removed from the
  baseline, contracting that direct-import debt from 5 to 0.
- Loyalty's two promotion-engine imports and Admin's Promotions module wiring now
  use the same public surface, lowering
  `identity-customer-benefits -> catalog-pricing-offers` from 10 to 7 in Slice 1.
- Slice 2 adds an explicit `apps/api/src/benefits` owner root and Benefits-owned
  coupon claim/trigger/admin-issuance contracts. `CouponsModule` is no longer
  global and exports only those narrow tokens instead of concrete services.
- Auth, Loyalty, Membership, Promotions and Admin now consume coupon-entitlement
  behavior through `benefits/public-api.ts`; CouponTemplate/CouponProgram
  validation and CRUD are exposed through `coupons/public-api.ts`. The remaining
  `identity-customer-benefits -> catalog-pricing-offers` allowance is therefore
  removed, contracting that direct-import debt from 7 to 0. Removing Admin's two
  direct Prisma imports also contracts `identity-customer-benefits ->
  runtime-data-ci-ops` from 23 to 21.
- The legacy Coupon implementation stays physically under `coupons` until its
  Prisma/Messaging dependencies can be contracted without raising another debt
  allowance. Slice 2 itself left Payments-facing coupon HOLD/COMMIT/RELEASE unchanged.
- Slice 2B is **MERGED** via PR #2139 / `6a022c8c`. Unified Payment preparation now
  injects Benefits-owned Points/Balance and Coupon reservation ports, and the POS
  payment composition module imports the Benefits public reservation module instead
  of `LoyaltyModule` / `MembershipModule` directly. Coupon HOLD carries
  `userStableId` rather than the snapshot's internal User DB UUID. Four production
  deep imports disappeared, lowering `payments-clover -> identity-customer-benefits`
  from 17 to 13; CI architecture/lint/build/test gates were green before merge.
- Slice 2C is **DEFERRED** after a 2026-09-03 readiness audit. The transaction-bound
  COMMIT remains inside `OrdersService.createFromConfirmedPaymentSnapshot()` because
  Points/Balance COMMIT, Coupon COMMIT and Order creation currently protect one
  atomic Prisma transaction. Replacing only the two COMMIT calls would not remove
  the broader `OrdersService` Benefits dependency, while splitting the transaction
  or publishing `Prisma.TransactionClient` would violate the current transaction
  boundary rules. Revisit only after a safe transaction-scoped capability exists.
- Slice 3 is merged via PR #2141 / `a29aae1d`. Admin menu CRUD/read-model/application
  decisions now live in Catalog-owned `CatalogAdminService` exposed via
  `menu/public-api.ts`. The legacy `AdminMenuService` is deleted; Admin
  controller/module no longer own Prisma or Brand/Store configuration reads. The two
  removed Admin Prisma imports contract `identity-customer-benefits ->
  runtime-data-ci-ops` from 21 to 19. A new Catalog Prisma import is offset by
  deleting the redundant local `PrismaService` provider from `PromotionsModule`, so
  `catalog-pricing-offers -> runtime-data-ci-ops` remains 10 rather than increasing.
- Slice 3's temporary Admin availability/provider coordination is contracted by
  Slice 5. `AdminMenuAvailabilityOrchestrationService` is deleted; Admin menu now
  consumes a public application orchestration surface and no longer wires
  `UberEatsModule` directly. Catalog availability facts are exposed through a narrow
  public reader that Uber composition adapts into an application query port;
  `UberMenuAvailabilityPrismaAdapter` no longer reads Catalog `MenuItem` /
  `MenuOptionTemplateChoice` Prisma delegates and stays DB-only for Uber mapping /
  OpsTicket facts. The fixed-component
  `publishToUberEats` provider-capability restriction now lives in orchestration
  rather than `CatalogAdminService`. Removing the old Admin service's foundation
  logger import and Admin module's direct `UberEatsModule` wiring lowers
  `identity-customer-benefits -> architecture-foundation` from 14 to 13 and
  `identity-customer-benefits -> external-channels` from 2 to 1. The replacement
  cross-context calls use public surfaces, so no new debt pair is introduced. The
  scanner is tightened to prevent the old Admin/provider and Uber/Catalog persistence
  paths from returning. Production Web Clover, Prisma schema/migrations and Uber
  wire contracts remain unchanged. Active verification passed item permanent OFF/ON,
  temporary-today availability and option OFF/ON. PR #2148 removed the stale
  `isAvailable` field from ordinary Admin item saves; after hard refresh, final
  verification at 00:11:00/00:11:05 Toronto observed two normal item PUT 200s and zero
  Uber availability updates in the surrounding minute. Slice 5 is production verified.
- Slice 5B locally contracts Daily Special ownership into Offers. The existing
  `PromotionsService` implements the new `DAILY_SPECIAL_OFFERS` capability and remains
  the sole `MenuDailySpecial` persistence owner for store-time activation/effective
  pricing without adding a new Prisma direct edge. Catalog supplies only item stable-ID/base-
  price facts; Admin full-menu/list/bulk-write composition lives in `application/menu`,
  and Public Menu / Orders consume the Offers public capability rather than the
  `menuDailySpecial` Prisma delegate. `CatalogAdminModule` isolates the reusable Catalog
  owner provider so Uber worker availability composition does not inherit HTTP-side
  Daily Special/StoreConfig wiring. The central scanner now reserves
  `MenuDailySpecial` Prisma access exclusively for the Offers service. No direct debt
  pair/count is expected to change because replacement traffic uses public surfaces.
- Slice 4 is merged via PR #2142 / `3629bc3b`; coupon-issued notification requests
  now cross the Messaging public boundary. `CouponProgramTriggerService` injects the
  `COUPON_ISSUED_NOTIFICATION` port from `notifications/public-api.ts`, maps the
  current User/CouponProgram records into a narrow snapshot, and no longer imports
  `NotificationService`. `CouponsModule` also imports `NotificationModule` only via
  the public surface. Only `userStableId` crosses the public boundary; `EmailService`
  resolves the existing internal `MessagingSend.userId` relation inside Messaging
  persistence. Removing both former deep imports contracts
  `catalog-pricing-offers -> messaging-notifications` from 2 to 0, and the baseline
  allowance is deleted so any direct edge in that direction now fails CI.
- Pre-Phase-3 Uber boundary hardening is now **PRODUCTION VERIFIED** (2026-09-03):
  - PR #2130 / `32d3925f` contracted Uber Store Policy ownership so order admission
    reads auto-accept/allergen policy through `UBER_STORE_CONFIG_QUERY` ->
    `BRAND_STORE_CONFIG_READER` instead of persistence-adapter policy methods.
  - PR #2131 / `4b615f49` contracted Uber store identity naming: SanQ store context
    is explicitly `storeStableId`, provider identity remains `uberStoreId`, and
    persistence still writes the SanQ stable ID into `Order.storeId`.
  - PR #2132 / `0c0a678e` exposed Orders ingestion through the public
    `ORDER_INGESTION` boundary, removed Uber's concrete `OrderIngestionService`
    dependency, preserved the same-transaction Uber action/cancellation callback,
    and lowered `external-channels -> commerce-orders-fulfillment` from 5 to 1.
  - Active production/sandbox verification covered auto-accept ON, auto-accept OFF
    with manual acceptance, immediate order completion, Uber cancel/refund, and a
    scheduled order moving from scheduled queue into active preparation. The
    scheduled activation produced one print job with kitchen/customer delivery
    ACKs; three test orders persisted under `4750_Yonge_Street`, no duplicate
    ingestion was found, webhook processing completed on first attempt, and the
    Uber worker error/warn/failure scan was clean.
  - The allergen DENY_LIST case is recorded as **N/A (Uber Test Store limitation)**
    because the sandbox customer flow does not expose an allergen-entry control;
    it is not a failed verification item.
- PR #2134 / `e69b913d` fixed the Admin Uber pending-order read contract/UI mismatch:
  `orderStableId` and `totalCents` are returned again, `pickupCode` is exposed, and
  the table now shows a human-readable pickup code while truncating the two long
  IDs. CI is green; production UI re-verification remains pending the next deploy.

## Carried debt outside Phase 3 Slice 2

- `web.api-envelope-direct-payload.v1` was closed on 2026-09-02. Checkout now has
  zero regular JSON browser direct fetches, and the architecture scanner no longer
  carries a Checkout allowance.
- Payments/Clover is no longer frozen as one context. The dependency counts above
  are unchanged by this documentation-only policy revision. POS Clover Terminal is
  active pre-production modularization work and may be structurally contracted
  before real-device access returns when production Web Ecommerce behavior is
  unchanged. The current Web Clover path remains guarded production; a Web-impacting
  modularization change is allowed only when it is a documented critical blocker
  and must carry focused regression coverage plus post-deployment active payment
  verification before being marked production verified.
- A central chronological modularization index now lives at
  `docs/architecture/modularization-worklog.md`. Creating the worklog and making it
  a required per-slice progress record is documentation governance only and does
  not change the dependency counts or architecture baseline in this snapshot.
- Phase 2 Brand/Store identity and configuration contraction is **CLOSED** at
  `origin/dev@0917f66c`. `brand-store.business-config.v1`,
  `benefits.business-config-loyalty-policy.v1`, `pos-device.admin-db-id.v1`, and
  `brand-store.default-store-identity.v1` are all closed. The final Uber persistence
  migration removed the eight implicit `storeId` database defaults while preserving
  historical Test Store/sandbox rows exactly as-is. Post-deploy verification proved
  explicit `4750_Yonge_Street` Reconciliation persistence, successful POS pause/resume
  Uber status sync, successful published-item availability sync, zero new
  `storeId='default'` persistence, and clean API/worker error scans. Historical Uber
  verification records remain scheduled for the separate Uber Production Cutover
  Cleanup after verification approval and are not modularization debt or a Phase 2
  closure blocker.

## Reading the graph

- A count is debt, not permission to add more coupling.
- When a PR removes a direct import, lower/remove the matching baseline in the
  same PR so the dependency cannot return.
- New cross-context work must target the owner's `public-api`, `contracts`, or
  `ports` surface.
- Recompute this snapshot at every phase boundary; a new cycle, new direct pair,
  or ambiguous identity field blocks phase closure.
