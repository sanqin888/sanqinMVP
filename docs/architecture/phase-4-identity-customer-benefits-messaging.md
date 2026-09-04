# Phase 4 — Identity / Customer / Benefits + Messaging Boundary Contraction

Start date: 2026-09-04  
Planning base: `origin/dev@3a20c8c5`

## Goal

Phase 4 contracts the remaining ownership and dependency debt around Identity,
Customer, Benefits, and Messaging after Phase 1-3 closure. The target is not a file
shuffle or repository-wide rewrite. Each slice must move one business capability to
its documented owner, expose the smallest stable public contract required by callers,
and reduce direct/internal cross-context imports without weakening current transaction,
security, messaging, payment, or external-provider behavior.

Identity / Customer / Benefits owns authentication/challenges, customer profile,
addresses, consent, points, balance, coupons/entitlements, and benefit reservations.
Messaging / Notifications owns rendering, routing, delivery providers, delivery
receipts, suppression and unsubscribe state. Admin, POS, Web, Payments, Orders and
external channels remain adapters/consumers rather than alternative owners.

## Entry state

Phase 1, Phase 2 and the approved Phase 3 scope are closed. Phase 3 Slice 2C remains
explicitly deferred because Benefits COMMIT plus Order creation currently share one
Prisma transaction and no safe Prisma-free transaction-scoped public capability has
been established.

The Phase 3 post-closeout governance tail is merged through PR #2160 / `3a20c8c5`.
Final PR head `27b57f99` passed GitHub Actions CI #5080. That tail moved the timed
Store temporary-close reason codec to Brand/Store and made direct-debt/SCC baselines
monotonic. Therefore the previously proposed Store pause-codec Phase 4 Slice 0 item is
already complete and is not part of this phase plan.

Current direct-import totals from `tools/architecture/context-baseline.json` are:

- identity-customer-benefits: **63**
- payments-clover: **60**
- external-channels: **44**
- commerce-orders-fulfillment: **35**
- store-operations-pos-print: **31**
- accounting-reporting-analytics: **25**
- messaging-notifications: **16**
- catalog-pricing-offers: **15**
- brand-store: **8**

The lower Orders/POS totals are stale-baseline normalization of already-contracted
source debt, not a new reason to reorder the owner phases. Identity/Customer/Benefits
remains the highest outgoing direct-debt source and a major inbound dependency target
for Payments, POS, Accounting, Orders, External Channels and Catalog.

## Legacy public-cycle baseline entering Phase 4

The contraction-only SCC introduced during Phase 3 Slice 6 still contains:

Contexts:

- Catalog / Pricing / Offers
- Commerce / Orders / Fulfillment
- Identity / Customer / Benefits
- Messaging / Notifications

Recorded public edges:

- `catalog-pricing-offers -> commerce-orders-fulfillment`
- `catalog-pricing-offers -> messaging-notifications`
- `commerce-orders-fulfillment -> catalog-pricing-offers`
- `identity-customer-benefits -> catalog-pricing-offers`
- `messaging-notifications -> identity-customer-benefits`

PR #2160 hardened the scanner so this SCC baseline must exactly match the current
component. Any removed context/edge must contract the baseline in the same change and
cannot later return under a stale superset allowance.

## Planned slices

### Slice 0A — Admin PromotionRule ownership contraction

Status: **PRODUCTION VERIFIED** via PR #2163 / `aa302629`.
Final head `849bdcfc` passed GitHub Actions CI #5092 before merge. On 2026-09-04 the user
actively exercised Admin PromotionRule create, edit, refresh and delete after deployment;
production persistence evidence showed the test rule created/updated and then soft-deleted
as `ENDED`, so the Admin management boundary is verified.

Audit findings on `origin/dev@83de9072`:

- production `PromotionRule` Prisma access exists in exactly two owner paths:
  `PromotionsService` performs the canonical active-rule read used by pricing, while
  `AdminPromotionsService` independently performs list/get/create/update/soft-delete;
  the latter is therefore a duplicate Admin persistence/business owner;
- `AdminPromotionsService` also owns all strict write policy: rule/status/stacking/channel
  validation, default priority/status/stacking/channels, calendar/minute/weekdays
  normalization, type-specific config normalization, BOGO overlap invariants and the
  delete -> `ENDED` soft-delete behavior;
- `AdminPromotionsController` imports Prisma-generated rule/status/stacking/channel
  types, and `AdminPromotionsModule` imports `PrismaModule`; Admin is therefore coupled
  to both persistence and Prisma-generated owner types;
- repository route-consumer search finds the Admin Automatic Promotions Web page as the
  active source consumer. It uses list/create/update/delete and only the business
  stable-ID/rule fields. No API/Admin promotion characterization spec currently protects
  this management behavior; existing promotion tests cover runtime evaluation/adapter
  behavior instead;
- the current Admin responses are raw Prisma models and therefore also expose the
  internal PromotionRule DB UUID/persistence metadata even though the Web consumer does
  not use them. Removing that unused DB identity is owner-aligned, but it is a transport
  response contraction and requires explicit authorization rather than being hidden in
  an ownership refactor;
- the monotonic architecture baseline prevents a naive move to a new Offers Prisma
  service: `catalog-pricing-offers -> runtime-data-ci-ops` is currently `10` and may not
  increase. The implementation must reuse the existing Promotions owner Prisma import
  rather than add another direct runtime-data import.

Implemented source shape:

1. added an Offers-owned `PROMOTION_RULE_MANAGEMENT` public contract with non-Prisma
   input/output types;
2. moved the strict normalization/validation into `PromotionRuleManagementService`,
   which has focused characterization coverage and no Prisma dependency;
3. kept raw PromotionRule persistence behind the existing `PromotionsService` Prisma
   entry (same-context calls only), so Catalog -> Runtime remains `10` instead of
   introducing another Prisma import;
4. `AdminPromotionsController` now injects the Offers public management capability,
   `AdminPromotionsService` is deleted, `AdminPromotionsModule` no longer imports
   `PrismaModule`, and the controller no longer imports Prisma-generated rule types;
5. all existing `/admin/promotions/rules` routes, request semantics,
   validation/defaults, list ordering, not-found behavior, soft-delete semantics,
   persistence schema and runtime evaluation are preserved;
6. the authorized Admin response contraction now returns only the stable business rule
   DTO. Internal PromotionRule DB `id`, `createdAt`, `updatedAt`, and `deletedAt` no
   longer cross the Offers boundary. The audited Admin Web consumer never declared or
   read those fields, so existing cached bundles remain field-independent and no
   compatibility shim is introduced;
7. the central architecture scanner now reserves `promotionRule` Prisma access to the
   Offers persistence owner, requires the Prisma-free public management capability, and
   prevents the retired Admin Prisma/service path from returning.

Measured source debt contracts
`identity-customer-benefits -> runtime-data-ci-ops 18 -> 16` while
`catalog-pricing-offers -> runtime-data-ci-ops` remains `10`. The legacy public SCC is
unchanged by Slice 0A because the Admin -> Offers dependency remains public-contract
traffic and no SCC member/edge is added or removed.

#### Slice 0A verification hotfix — POS server-authoritative promotion pricing

Status: **PRODUCTION VERIFIED** via PR #2166 / `bb833550`.
Final head `567a1aba` passed GitHub Actions CI #5102 before merge. On 2026-09-04 the
post-deployment active POS check confirmed the configured same-item BOGO is reflected in
the server-authoritative checkout quote, the retained staff manual discount stacks as a
separate discount, and the completed order/payment amount remains consistent with the
checkout total.

The production verification pass exposed a separate pre-existing checkout gap: the active
same-item BOGO rule is correctly configured for `in_store` and the Orders/Offers pricing
engine already evaluates it, but the POS payment page previously calculated its displayed
subtotal, manual discount, tax and tender locally and did not request the canonical Orders
pricing quote before taking payment. That allowed the POS display/cash-change path to omit
automatic promotions even though order creation later re-evaluated them server-side.

The hotfix keeps ownership unchanged and adds no pricing rules to POS:

1. `POS_ORDER_OPERATIONS` exposes a narrow authenticated `quotePricingForStore` capability
   backed by the existing `OrdersService.quoteOrderPricing()` owner implementation;
2. `POST /pos/orders/pricing/quote` is protected by the existing POS session/role/device
   guards, accepts only `channel=in_store`, and forwards the authenticated store stable ID;
3. the POS payment page requests the server quote whenever fulfillment, member redemption
   or the existing staff manual discount changes, and treats that quote as authoritative
   for automatic promotions, tax and total;
4. the existing 5% / 10% / 15% / custom **POS manual discount remains intact** and is sent
   as the existing `POS_MANUAL_DISCOUNT` input. It remains independently visible from the
   automatic promotion amount and retains its existing calculation/stacking semantics;
5. cash collection, customer display, WeChat/Alipay conversion and Clover Terminal start
   all consume the same displayed server-authoritative total. In-store payment confirmation
   is disabled while the quote is refreshing or unavailable rather than falling back to a
   stale client-only amount;
6. the POS payment adapter is now fixed to `channel=in_store`: the staff-facing UberEats
   channel selector, local UberEats payment method and their legacy channel/payment branches
   are removed. POS fulfillment remains only `pickup` / `dine_in`; Uber orders continue to
   enter through the separate Uber integration/import path, whose runtime behavior is
   unchanged;
7. focused API coverage locks same-item BOGO + manual discount coexistence and authenticated
   store identity for the POS pricing route.

This hotfix does not change PromotionRule configuration/evaluation semantics, Prisma schema,
dependencies, production Web Clover Ecommerce, Uber runtime/wire behavior, or the measured
architecture graph/baselines. The required post-deployment POS pricing/payment verification
completed successfully on 2026-09-04, so this hotfix is production VERIFIED.

### Slice 0B — Catalog -> Orders public-cycle edge contraction

Status: **PRODUCTION VERIFIED** via PR #2168 / `b2d42c32`.
Final head `739938c5` passed GitHub Actions CI #5107 before squash merge. On 2026-09-04 the
post-deployment active checks confirmed the Admin PromotionRule editor exposes only Web/POS,
the configured POS BOGO still combines with the retained manual discount, Web PromotionRule
pricing still applies through the `web -> web` boundary mapping, and the POS/Admin surfaces
remain isolated from UberEats PromotionRule selection. Uber ingestion/runtime/wire behavior
was not changed by this slice.

Readiness findings before implementation:

- the complete production `catalog-pricing-offers -> commerce-orders-fulfillment`
  dependency was exactly two type imports of Orders-owned `Channel`: one in
  `promotion-context.contract.ts` and one in `promotions.service.ts`; no other Offers /
  Menu / Coupons / Catalog production source imports `@shared/order` or Orders internals;
- Offers only needs a PromotionRule applicability dimension. It does not need Order
  lifecycle, fulfillment, payment or provider-wire semantics;
- Uber order ingestion is a separate External Channels -> Orders ingestion flow. It
  persists Uber-provided subtotal/discount/tax/delivery/total facts and does not call
  `PROMOTION_CONTEXT_READER` or the SanQ PromotionRule evaluator;
- the Admin PromotionRule editor nevertheless exposed an `Uber Eats` channel option even
  though no runtime flow consumed that configuration. A read-only production query found
  **0** `PromotionRule` rows whose `channels` array contained `ubereats`, so deleting the
  dead capability requires no data backfill, Prisma schema change or migration.

Implemented source shape:

1. `PromotionRuleChannel` is contracted to the Offers-owned applicability set
   `'web' | 'in_store'`; `PromotionContextReaderPort` and `PromotionsService` consume that
   owner type and no longer import `@shared/order`;
2. Orders owns the translation from its broader order-source channel set through an
   exhaustive mapping: `web -> web`, `in_store -> in_store`, `ubereats -> null`. A null
   mapping means the Orders pricing path supplies no PromotionRule context; it does not
   remove `Order Channel.ubereats` or alter provider order persistence;
3. the Admin automatic-promotion page now exposes only Web/POS applicability, and the
   Offers management validator explicitly rejects the historical dead `ubereats` input.
   No compatibility shim is kept because there is no persisted rule using the value and
   the only discovered source consumer is the same-repository authenticated Admin page;
4. focused characterization coverage locks Web/In-store owner queries, rejects UberEats
   PromotionRule management input, preserves the existing POS BOGO + manual-discount
   tests, and proves an Orders `ubereats` quote does not invoke PromotionRule context;
5. `tools/architecture/context-baseline.json` contracts the exact legacy SCC from four
   contexts/five internal edges to three contexts/three internal edges. Orders exits the
   SCC. `commerce-orders-fulfillment -> catalog-pricing-offers` remains as the correct
   one-way Orders consumer dependency, while the removed reverse edge is
   `catalog-pricing-offers -> commerce-orders-fulfillment`.

Measured numeric direct-import debt is unchanged because the removed `@shared/order`
imports were approved public traffic. The remaining legacy SCC is Catalog -> Messaging ->
Identity -> Catalog. No dependency/lockfile, Prisma schema/migration, Benefits COMMIT /
Order transaction boundary, Web Clover provider execution, POS manual-discount rule,
PromotionRule evaluation algorithm, or Uber runtime/wire behavior is intentionally
changed.

Because Orders pricing is shared by production Web/POS flows, production verification
explicitly covered `web -> web` PromotionRule pricing plus the existing `in_store`
BOGO/manual-discount behavior on 2026-09-04; both passed, so Slice 0B is production VERIFIED.

### Slice 1 — Email Verification ownership normalization

Status: **MERGED / CI GREEN / PHASE-END DEPLOYMENT PENDING**. PR #2171 merged to
`dev` as `afa1bff6` from final head `94955b27`; GitHub Actions CI #5116 passed.
Per the current Phase 4 rollout plan, this slice will be deployed and actively verified
with the rest of Phase 4 rather than as an individual production rollout.

Readiness findings on the post-Slice-0B `dev` baseline:

- `apps/api/src/email/email-verification.service.ts` was physically owned by Messaging
  but actually owned `AuthChallenge` creation/query/expiry/consumption, checkout proof
  token creation/validation and verified `User.email` / `emailVerifiedAt` mutation;
- the same service imported Identity `IDENTITY_CHALLENGE_ENGINE`, and `EmailModule`
  imported `IdentityChallengeModule`, making the remaining
  `messaging-notifications -> identity-customer-benefits` public edge concrete ownership
  debt rather than a delivery dependency;
- Membership performed the member-email uniqueness/already-verified checks and then
  passed an internal User DB UUID into the Messaging-owned verification service. A
  read-only production check on 2026-09-04 found 39 User rows and **0** missing/blank
  `userStableId` values, so moving the authenticated member boundary to stable identity
  needs no legacy-account fallback;
- production Web Clover used the same Messaging-owned service only to validate the
  checkout email proof. The payment amount/state/provider flow does not require
  Messaging ownership of that verification lifecycle;
- the existing characterization spec already locked checkout OTP format, rate limit,
  hash lookup, expiry and proof-token behavior, so the move can preserve those semantics
  without inventing a second implementation.

Implemented source shape:

1. `IDENTITY_EMAIL_VERIFICATION` and `IdentityEmailVerificationPort` now define the
   Identity-owned member/checkout verification capability; the implementation and the
   existing `/email/checkout/send-code` + `/email/checkout/verify-code` controller live
   under `auth/`, so the HTTP routes remain unchanged while ownership moves;
2. Identity now owns the full `AuthChallenge` lifecycle and verified-email account
   mutation. Member verification resolves the authenticated `userStableId` to the User
   DB identity inside the owner and preserves the previous normalized member-email
   address/send semantics;
3. Messaging exposes only `EMAIL_VERIFICATION_DELIVERY` through `email/public-api.ts`.
   The delivery capability delegates to the existing `EmailService` template/provider /
   `MessagingSend` implementation and does not own challenges or User mutation;
4. `MembershipController` consumes the Identity capability with `userStableId` and the
   broad `MembershipService` no longer owns/request/confirm email-verification logic.
   `MembershipModule` no longer imports `EmailModule` for this feature;
5. `CloverPayController` keeps its existing contact-proof decision but injects the
   Identity public capability instead of the Messaging implementation. The guarded Web
   Clover amount, intent, charge, provider, order and reconciliation paths are otherwise
   unchanged; composition only adds the Identity verification module;
6. the old Messaging-owned verification service/controller and their old-location spec
   are deleted. Characterization coverage moves with the owner and adds member stable-ID
   request plus verified-account mutation cases;
7. the central scanner now reserves email-verification lifecycle/account mutation to
   Identity, requires the narrow Messaging delivery contract, forbids any Messaging ->
   Identity import, prevents the retired paths from returning, and protects Membership /
   Clover from deep-importing the old implementation.

The merged monotonic baseline contracts
`identity-customer-benefits -> messaging-notifications 24 -> 22`,
`payments-clover -> messaging-notifications 3 -> 2`,
`messaging-notifications -> architecture-foundation 5 -> 4`, and
`messaging-notifications -> runtime-data-ci-ops 10 -> 9`. Identity -> Runtime contracts
`16 -> 15` while Identity -> Architecture remains `13`: AuthModule keeps its existing
Prisma provider registration, but AuthModule/AuthService/the verification module share the
local `identity-prisma.ts` infrastructure import; email normalization likewise has one
Identity-local boundary instead of duplicate cross-context imports.

Removing the owner-reversed `messaging-notifications -> identity-customer-benefits`
public edge breaks the final Catalog / Identity / Messaging SCC. CI #5116 accepted the
empty `legacyPublicCycleComponents` baseline, so the repository now rejects any return of
that legacy public cycle. Deployment and production verification remain intentionally
pending until the Phase 4 batch rollout.

Phase-end active verification must cover member email request/confirm plus guest checkout
email OTP through a real Web Clover payment, because the latter is guarded production
code even though Slice 1 changed only its verification dependency.

### Slice 2 — Messaging public delivery boundaries

Status: **IN PROGRESS**.

Replace cross-context imports of concrete Email/SMS/Notification/template services with
small business-purpose delivery capabilities. Public contracts should carry stable IDs,
contact/locale and message facts rather than Prisma `User` models or Messaging
infrastructure types. Do not create one generic all-purpose Messaging facade.

#### Slice 2A — Auth Challenge Messaging boundary contraction

Status: **MERGED / CI GREEN / PHASE-END DEPLOYMENT PENDING**. PR #2172 merged to
`dev` as `c8e91303` from final head `29bf23b7`; GitHub Actions CI #5120 passed.
Per the current Phase 4 rollout plan, this slice remains undeployed until the consolidated
Phase-end rollout.

Readiness audit of the merged Slice 1 baseline found **22** remaining direct
Identity -> Messaging imports, grouped as Auth 9, Phone Verification 5, Admin 4,
Membership 2 and Loyalty 2. Auth's nine imports were the smallest coherent first cut:
`AuthService` directly imported `EmailService`, `SmsService`, `BusinessConfigService`,
`TemplateRenderer` and `NotificationService`, while `AuthModule` imported `EmailModule`,
`SmsModule`, `MessagingModule` and `NotificationModule`. The Notification pair is used by
registration welcome notifications and is intentionally deferred; the other seven imports
all belong to OTP/challenge delivery.

Implemented source shape:

1. Messaging owns `AUTH_CHALLENGE_DELIVERY` with four explicit business methods for
   login 2FA SMS, login 2FA email, phone-enrollment SMS and membership-login SMS. It is an
   Auth-specific capability, not a generic `sendMessage(channel, template, vars)` facade;
2. Identity still owns code generation/hash, `AuthChallenge` persistence, rate limits,
   expiry/attempts/revoke/consume, session/MFA state and `messagingSendId` linkage;
3. Messaging now owns Brand/Store messaging snapshot reads, OTP template rendering,
   `MessagingTemplateType.OTP`, provider dispatch and the historical purpose/metadata
   mappings (`login_2fa`, `admin_login`, `verify`, `login`);
4. Auth passes only contact, locale, code, TTL and `userStableId` where a known User is
   involved. Login 2FA and phone-enrollment delivery no longer pass internal User DB UUIDs
   across the context boundary;
5. `SmsService` accepts optional `userStableId` and links `MessagingSend.user` through the
   stable identifier when supplied, matching the existing EmailService stable-ID path;
6. `AuthModule` replaces direct Email/SMS/Messaging module wiring with the Messaging
   public `AuthChallengeDeliveryModule`; `NotificationModule` remains because welcome
   notifications are outside 2A;
7. focused characterization coverage preserves zero-padded OTP generation plus the four
   delivery purpose/template/provider mappings, and the central scanner prevents concrete
   Email/SMS/template/config imports or DB-UUID delivery linkage from returning to Auth.

The merged monotonic baseline contracts
`identity-customer-benefits -> messaging-notifications 22 -> 15`; all other direct pairs
remain unchanged. Identity's total outgoing direct debt therefore contracts **60 -> 53**.
CI #5120 passed the architecture gate, API/Web lint/build/strict checks and tests on final
head `29bf23b7`. No dependency/lockfile, Prisma schema/migration, HTTP route, OTP policy,
provider wire, session/MFA state machine or payment behavior is changed. Per the Phase 4
rollout plan, 2A will not be deployed separately; production verification is deferred to
the final Phase 4 batch deployment.

#### Slice 2B — Phone Verification Messaging boundary contraction

Status: **MERGED / CI GREEN / PHASE-END DEPLOYMENT PENDING**. PR #2173 merged to
`dev` as `41428324` from final head `d63bc307`; GitHub Actions CI #5123 passed.
Per the current Phase 4 rollout plan, this slice remains undeployed until the consolidated
Phase-end rollout.

Readiness audit of merged Slice 2A confirmed the remaining **15** direct Identity ->
Messaging imports as Auth welcome notifications 2, Phone Verification 5, Admin 4,
Membership 2 and Loyalty 2. Phone Verification's five imports were exactly one delivery
concern: `PhoneVerificationService` directly imported `SmsService`, `BusinessConfigService`
and `TemplateRenderer`, while `PhoneVerificationModule` imported `SmsModule` and
`MessagingModule`.

Implemented source shape:

1. Messaging owns the dedicated `PHONE_VERIFICATION_DELIVERY` public capability with one
   explicit `sendVerificationSms` operation. It is separate from the Slice 2A Auth challenge
   capability and is not a generic message facade;
2. Phone Verification remains the Identity owner of phone normalization, IP and daily rate
   limits, `NON_ZERO_SIX_DIGIT` generation, `PHONE_VERIFICATION` hashing,
   `AuthChallenge` persistence, 10-minute expiry, attempts/revoke/consume, verification
   token creation/validation and `messagingSendId` linkage;
3. Messaging owns only Brand/Store messaging snapshot reads, OTP template rendering,
   `MessagingTemplateType.OTP`, SMS provider dispatch and `MessagingSend` recording;
4. historical purpose semantics are preserved exactly: the OTP template variable remains
   fixed as `purpose='verify'`, while caller purposes such as `checkout`,
   `membership-login`, `membership-bind` and `pos-recharge` remain Identity challenge facts
   and Messaging metadata;
5. provider delivery failures still return a send ID for challenge audit linkage, and the
   Identity owner preserves the public `{ ok: false, error: 'sms_send_failed' }` behavior;
6. `/auth/phone/send-code` and `/auth/phone/verify-code`, Clover phone-proof validation and
   AdminMembers' current PhoneVerificationService consumption are intentionally unchanged;
7. focused characterization covers owner-side OTP/rate-limit/failure semantics plus the
   Messaging template/metadata/provider mapping, and the central scanner prevents concrete
   SMS/template/config/module imports from returning to Phone Verification.

The merged monotonic baseline contracts
`identity-customer-benefits -> messaging-notifications 15 -> 10`; all other direct pairs
remain unchanged. Identity total outgoing direct debt therefore contracts **53 -> 48**.
CI #5123 passed the architecture gate, API/Web lint/build/strict checks and tests on final
head `d63bc307` before squash merge `41428324`. The remaining ten Messaging direct imports
are Auth welcome notifications 2, Admin 4, Membership 2 and Loyalty 2. No dependency/lockfile,
Prisma schema/migration, route, Clover payment/proof behavior or external provider protocol
is changed. 2B will not be deployed separately; production verification remains deferred to
the consolidated Phase 4 batch deployment.

#### Slice 2C — Admin Messaging boundary contraction

Status: **MERGED / CI GREEN / PHASE-END DEPLOYMENT PENDING**. PR #2174 merged to
`dev` as `e27489cf` from final head `2c18e3c5`; GitHub Actions CI #5126 passed.
Per the current Phase 4 rollout plan, this slice remains undeployed until the consolidated
Phase-end rollout.

Readiness audit of merged Slice 2B confirmed the remaining **10** direct Identity ->
Messaging imports as Auth welcome notifications 2, Admin 4, Membership 2 and Loyalty 2.
Admin's four imports split into two independent email delivery concerns rather than one
coherent generic Admin mail service: `AdminStaffController` / `AdminModule` directly used
`EmailService` / `EmailModule` for staff invites, while `AdminMembersService` /
`AdminMembersModule` directly used the same concrete email layer for POS member recharge
email OTP delivery.

Implemented source shape:

1. Email/Messaging owns the narrow `STAFF_INVITE_DELIVERY` capability. Admin Staff keeps
   invite creation/resend/revoke state, inviter lookup, request locale handling and dev-only
   invite URL response behavior; delivery delegates to the existing
   `EmailService.sendStaffInviteEmail()` implementation;
2. the staff delivery public contract carries only email/token/locale/inviter display facts
   plus the existing `ADMIN | STAFF | ACCOUNTANT` role values. It does not expose Prisma,
   `EmailService` or persistence IDs. Existing invite email role rendering is intentionally
   unchanged: `ADMIN` retains the Admin/管理员 label while non-Admin roles retain the existing
   Staff/普通员工 wording;
3. Email/Messaging separately owns `MEMBER_RECHARGE_EMAIL_DELIVERY`. Admin Members still
   owns contact/profile matching, `NON_ZERO_SIX_DIGIT` code generation, OTP hashing,
   `AuthChallenge` creation/verification/consume state, recharge verification-token handling
   and `messagingSendId` linkage;
4. the recharge delivery capability now owns the existing English/Chinese subject/text/html,
   `MessagingTemplateType.OTP`, `pos_recharge_otp` tag and provider/MessagingSend call.
   The cross-context user identity changes from internal `user.id` to `userStableId`; the
   Identity-owned `AuthChallenge.userId` relation remains internal and unchanged;
5. Admin Staff and Admin Members modules now import only their respective `email/public-api`
   delivery modules. Concrete `EmailService`, `EmailModule` and Admin-owned
   `MessagingTemplateType` usage cannot return under the new central scanner guard;
6. focused characterization preserves staff invite forwarding (including `ACCOUNTANT`),
   recharge OTP bilingual content/stable-user linkage, `messagingSendId` audit linkage and
   the existing `email_send_failed` fallback behavior.

The merged monotonic baseline contracts
`identity-customer-benefits -> messaging-notifications 10 -> 6`; all other direct pairs
remain unchanged. Identity total outgoing direct debt therefore contracts **48 -> 44**.
CI #5126 passed the architecture gate, API/Web lint/build/strict checks and tests on final
head `2c18e3c5` before squash merge `e27489cf`. The remaining six Messaging direct imports
are Auth welcome notifications 2, Membership 2 and Loyalty 2. No dependency/lockfile,
Prisma schema/migration, HTTP route, staff invite state machine, recharge authorization/amount
behavior, payment provider behavior or external wire protocol is changed. 2C will not be
deployed separately; production verification stays part of the consolidated Phase 4 batch
rollout.

#### Slice 2D — Customer lifecycle notification boundary contraction

Status: **LOCAL SOURCE COMPLETE / REVIEW PENDING** on
`refactor/phase4-slice2d-customer-lifecycle-notifications`.

Readiness audit of merged Slice 2C confirmed the remaining **6** direct Identity ->
Messaging imports as Auth registration-welcome notifications 2, Membership subscription-
welcome notifications 2 and Loyalty messaging/event wiring 2. Auth and Membership share one
coherent Customer lifecycle delivery concern: Identity decides that a new registration or
marketing opt-in happened, while Messaging owns template rendering, channel routing, provider
delivery and MessagingSend audit linkage.

Implemented source shape:

1. Notifications exposes the narrow `CUSTOMER_LIFECYCLE_NOTIFICATION` capability with two
   explicit operations: `notifyRegistrationWelcome` and `notifySubscriptionWelcome`. It is
   not a generic notification facade;
2. the public contract accepts only `userStableId`, contact/name/language facts required for
   delivery. It does not expose Prisma `User`, internal `userId`, provider services or customer
   consent fields;
3. Auth keeps the `isNewUser` decision and registration/session/account mutation. Both new-user
   entry paths map the Identity-owned User to stable customer facts before invoking Messaging;
4. Membership keeps the `marketingEmailOptIn` consent decision. The subscription welcome is
   invoked only when the persisted user has both email and marketing opt-in, while the existing
   `MARKETING_OPT_IN` coupon-program trigger still runs afterward even when welcome delivery is
   skipped;
5. Messaging preserves the historical registration `welcome` template, email-first/SMS-fallback
   routing, `register_welcome` tag, `trigger=register` metadata and subscription `Subscription`
   template / `SUBSCRIPTION_CONFIRM` mapping. Registration email/SMS and subscription email now
   link MessagingSend by `userStableId` instead of crossing the User DB UUID;
6. Auth and Membership service/module imports now use `notifications/public-api.ts`; direct
   `NotificationService` / `notification.module` imports cannot return under the central
   scanner guard. Focused characterization locks stable-ID mapping, fallback behavior and the
   Membership-owned consent gate.

The local monotonic baseline contracts
`identity-customer-benefits -> messaging-notifications 6 -> 2`; all other direct pairs remain
unchanged. Identity total outgoing direct debt therefore contracts **44 -> 40**. The final two
Messaging direct imports are Loyalty's `OrderEventsBus` and `MessagingModule`. No dependency /
lockfile, Prisma schema/migration, HTTP route, registration/session behavior, marketing-consent
API, coupon issuance semantics, provider wire protocol or notification template meaning is
changed. 2D will not be deployed separately; production verification remains part of the
consolidated Phase 4 batch rollout.

Remaining Slice 2 work after 2D is expected to contract the final Loyalty messaging/event tail
without recreating a reverse Messaging -> Identity edge.

### Slice 3 — Customer Profile / Address / Consent boundary

Status: **PLANNED**.

Split customer-owned profile, address and consent use cases out of the legacy broad
Membership service surface while preserving current member APIs and authentication
semantics. Avoid mechanical file splitting; extract only coherent owner capabilities
with real callers and tests.

### Slice 4 — Admin Members / Staff adapter contraction

Status: **PLANNED**.

Move member/staff business rules and persistence decisions behind Identity/Customer /
Benefits owner use cases. Admin controllers/services should remain authorization and
transport adapters. Staff invitation, account state and invariants such as protection
of the last active admin must remain owner-side business rules rather than controller
logic.

### Slice 5 — Benefits implementation ownership consolidation

Status: **PLANNED / TRANSACTION-SENSITIVE**.

Continue the Offers/Benefits ownership normalization started in Phase 3 by moving safe
eligibility/claim/issue/trigger/entitlement implementation behind Benefits-owned
surfaces. Do not mechanically relocate code that currently depends on a cross-owner
Prisma transaction. Coupon program definition/use policy remains Offers-owned;
customer entitlement/reservation behavior remains Benefits-owned.

The Phase 3 Slice 2C transaction-bound COMMIT remains deferred unless a design can
preserve atomic Points/Balance COMMIT + Coupon COMMIT + Order creation without:

- splitting the atomic transaction;
- publishing `Prisma.TransactionClient` as an ordinary public cross-context contract;
- moving Benefits persistence ownership into Orders.

### Slice 6 — Phase 4 dependency/SCC closeout

Status: **PLANNED**.

Re-run the ownership/dependency audit against the final Phase 4 source graph, contract
all reduced numeric baselines in the same PR, contract/remove legacy SCC entries as
required by the monotonic scanner, and update the phase document, current dependency
graph and modularization worklog with actual CI/deployment/verification evidence.

## Phase 4 target outcomes

Targets are directional exit criteria, not permission to weaken behavior to hit a
number:

- Admin PromotionRule management has one Offers owner; Admin has no duplicate Prisma /
  business-rule implementation for it.
- `catalog-pricing-offers -> commerce-orders-fulfillment` public-cycle dependency is
  removed at source by Slice 0B after confirming `Channel` was the only reverse semantic
  edge; PR #2168 / CI #5107 merged the contraction and the 2026-09-04 active Web/POS/Admin
  checks completed successfully, so Slice 0B is production VERIFIED.
- Email verification challenge/account mutation belongs to Identity; Messaging owns
  delivery only.
- Identity/Customer/Benefits cross-context callers use narrow Messaging public
  capabilities instead of concrete delivery services.
- Membership no longer acts as one mixed Customer + Benefits + Messaging god service.
- Admin Members/Staff business persistence/invariants move behind owner boundaries.
- Safe coupon/benefit entitlement implementations no longer remain physically under
  Offers merely because of historical layout; transaction-sensitive pieces remain
  deferred rather than being moved unsafely.
- The legacy public SCC is eliminated in Slice 1 source after Slice 0B removed Orders and
  Slice 1 removed the Messaging -> Identity return edge; the empty baseline must remain
  protected by the central cycle guard through remote validation and later slices.

## Guardrails and explicit deferrals

- Production Web Clover remains guarded. Do not touch it for routine Phase 4 work. If
  it becomes a documented critical modularization blocker, make the smallest change and
  require focused regression plus post-deployment active payment verification.
- POS Clover Terminal remains pre-production and may be structurally modularized in a
  separate work package when live Web Ecommerce behavior is unchanged.
- Historical Uber sandbox `@compat brand-store.default-store-identity.v1` cleanup stays
  deferred to Uber Production Cutover Cleanup; do not combine it with Phase 4 slices.
- Do not remove the in-memory Orders event bus or alter durable outbox ownership as a
  Phase 4 shortcut. That requires a separate Orders/Fulfillment readiness audit.
- No dependency changes, Prisma schema/migration changes, public transport breaking
  changes, provider wire changes or transaction-boundary changes are implied by this
  planning document. Any such need discovered by a readiness audit must follow the
  repository authorization gates before implementation.

## Documentation and delivery rule

Every Phase 4 code slice must update, in the same local change:

1. this phase document;
2. `docs/architecture/current-dependency-graph.md`;
3. `docs/architecture/modularization-worklog.md`;
4. compatibility/owner/payment documents when the slice changes those governed facts.

Local implementation stops after diff/status review. Remote delivery is through a
feature PR targeting `dev`; GitHub Actions is authoritative, and merge occurs only after
all required checks are green. The current rollout plan keeps intermediate Phase 4 slices
merged/CI-green without individual production deployment; after Phase 4 source closeout,
the accumulated phase changes are deployed together and verified with one consolidated
active test pass. No slice may be marked DEPLOYED/VERIFIED before that batch rollout and
its required active verification is actually completed.
