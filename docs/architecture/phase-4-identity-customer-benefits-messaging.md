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

Status: **MERGED / CI GREEN / AWAITING PHASE-END DEPLOYMENT**. PR #2175 passed final
GitHub Actions CI #5130 on head `a0fa3f85` and squash-merged to `dev` as `0cb3ce11`.

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

The merged monotonic baseline contracts
`identity-customer-benefits -> messaging-notifications 6 -> 2`; all other direct pairs remain
unchanged. Identity total outgoing direct debt therefore contracts **44 -> 40**. The final two
Messaging direct imports are Loyalty's `OrderEventsBus` and `MessagingModule`. No dependency /
lockfile, Prisma schema/migration, HTTP route, registration/session behavior, marketing-consent
API, coupon issuance semantics, provider wire protocol or notification template meaning is
changed. 2D will not be deployed separately; production verification remains part of the
consolidated Phase 4 batch rollout.

Remaining Slice 2 work after 2D is expected to contract the final Loyalty messaging/event tail
without recreating a reverse Messaging -> Identity edge.

#### Slice 2E-A — Retire historical AWS SNS / SQS infrastructure

Status: **MERGED / CI GREEN / AWAITING PHASE-END DEPLOYMENT**. PR #2176 passed final
GitHub Actions CI #5132 on head `11f73e88` and squash-merged to `dev` as `7746402b`.

The user confirmed on 2026-09-04 that AWS SNS and SQS are retired historical infrastructure.
SQS had previously been used around the Clover Hosted Checkout era for traffic smoothing, but
that payment queue path is no longer present in current source. The only remaining SQS runtime
consumer was `SesEventProcessor`, which consumed SES bounce/complaint events; the only remaining
SNS HTTP surface was `/api/v1/webhooks/aws-sns`. Production read-only evidence showed no current
SNS/`ORDER_PAID` MessagingWebhookEvent rows and no API request hits for the SNS route in the
inspected logs beyond Nest route registration. Current production delivery is SendGrid email and
Twilio SMS.

The authorized contraction:

1. deletes `AwsSnsWebhookController` and `AwsSnsWebhookService`, removes the raw-body middleware
   for `/api/v1/webhooks/aws-sns`, and removes the SNS route from `MessagingModule`;
2. deletes `SesEventProcessor` and its SQS consumer wiring from `EmailModule`;
3. removes `SNS_TOPIC_ARN`, `SES_EVENTS_SQS_QUEUE_URL` and the historical
   `AWS_SES_CONFIGURATION_SET=\"sanq-events\"` compose wiring, plus the unused
   `PRINT_SNS_TOPIC_ARN` Orders field;
4. preserves `SesEmailProvider` and `AwsSmsProvider`. SES sending now includes a configuration set
   only when `AWS_SES_CONFIGURATION_SET` is explicitly configured, so AWS email remains usable
   without an implicit dependency on retired event infrastructure;
5. preserves SendGrid/Twilio webhook handling and shared Messaging audit/suppression tables. No
   Messaging persistence model is deleted because those models remain active for current
   providers;
6. does not add EventBridge or another SES feedback path. If AWS SES/SMS are activated later,
   feedback/event ingestion will be designed as a separate provider activation task;
7. leaves `@aws-sdk/client-sns`, `@aws-sdk/client-sqs` and `sqs-consumer` temporarily as
   manifest-only dead dependencies. Package/lockfile cleanup is intentionally deferred because
   dependency changes require their own authorized pnpm update and review.

The merged monotonic baseline contracts
`messaging-notifications -> architecture-foundation 4 -> 3` and
`messaging-notifications -> runtime-data-ci-ops 9 -> 6`; Messaging total outgoing direct debt
therefore contracts **14 -> 10**. The existing OrderEventsBus remains in Messaging temporarily;
its ownership move and the final Identity -> Messaging `2 -> 0` contraction belong to Slice 2E-B
so this retirement PR does not mix event-bus redesign with external infrastructure deletion.

No Prisma schema/migration, SendGrid/Twilio provider behavior, current email/SMS routing, payment
transaction behavior, Uber wire protocol or active customer API is changed. Like Slice 1 onward,
2E-A will not be deployed separately; it remains part of the Phase 4 consolidated rollout.

#### Slice 2E-B — Orders event ownership + Loyalty paid-settlement inversion

Status: **MERGED / AWAITING PHASE-END DEPLOYMENT** via PR #2177. Final head
`dc07e820` passed GitHub Actions CI #5137 and squash-merged to `dev` as `718b2133`.

The readiness audit confirmed that moving `OrderEventsBus` to an Orders public API and keeping
Loyalty as a subscriber would recreate the Orders <-> Identity public SCC eliminated in Slice 1.
The approved design therefore keeps the in-memory bus private to Orders/Fulfillment and inverts
Loyalty settlement through the existing Orders -> Identity direction.

Implemented source shape:

1. Identity/Benefits owns the new narrow `LOYALTY_ORDER_PAID_SETTLEMENT` public capability. Its
   input is stable/business-only: `orderStableId`, reward subtotal cents, redeemed-value cents and
   promotion earn multiplier. It exposes no Order/User database UUID, Prisma shape or event bus;
2. `LoyaltyService` translates `orderStableId` to the existing internal Order/User database IDs
   inside the Loyalty persistence implementation and delegates to the established
   `settleOnPaid()` ledger transaction. Missing/anonymous orders and settlement failures preserve
   the historical best-effort/non-blocking side-effect semantics;
3. Orders computes the same reward subtotal it previously placed on `order.paid.verified`, derives
   the loyalty multiplier from the Orders-owned immutable promotion snapshot through the Offers
   public resolver, invokes the Loyalty capability with `void`, then still emits the local paid
   event for Fulfillment/Uber Direct dispatch;
4. `OrderEventsBus` moves from Messaging into a private Orders implementation. `OrdersModule`
   provides it locally; `OrdersService` and `FulfillmentProcessor` are its only production
   consumers. The bus is not exported from `orders/public-api.ts`, and Messaging no longer owns,
   provides or exports Order lifecycle semantics;
5. the old `LoyaltyEventProcessor` and its `MessagingModule` dependency are deleted. This removes
   the final two direct Identity -> Messaging imports without creating a reverse public edge;
6. `OrderIngestionService` drops the dead `emitPaidLifecycleEvent` policy and bus constructor
   dependency. The only production consumer, Uber order import, had always set that policy to
   `false`; Uber API composition therefore drops `MessagingModule`, and the dedicated worker no
   longer fabricates an `OrderEventsBus` provider merely to construct Orders ingestion;
7. the durable `OrderLifecycleOutboxProcessor`, its OpsEvent facts, database-lock replay and
   `FulfillmentProcessor.handleAcceptedLifecycle()` recovery path are intentionally unchanged.
   A central scanner guard now reserves both the private fast-path ownership and the durable
   replay path;
8. focused characterization covers stable-ID-to-internal-ID translation, settlement failure
   isolation, Orders stable settlement payload, retained paid-event emission and Uber composition
   without the retired Messaging bridge.

The local direct-import baseline contracts:

- `identity-customer-benefits -> messaging-notifications 2 -> 0`;
- `identity-customer-benefits -> runtime-data-ci-ops 15 -> 14`, taking total Identity outgoing
  direct debt **40 -> 37**;
- `commerce-orders-fulfillment -> messaging-notifications 8 -> 4`, taking total Commerce outgoing
  direct debt **35 -> 31**;
- `external-channels -> messaging-notifications 2 -> 0`, taking total External outgoing direct
  debt **44 -> 42**;
- Messaging remains at **10** outgoing direct imports, and Commerce -> Identity remains at **5**
  because the new symbols share Orders' existing Loyalty public-api import statement.

Deleting `LoyaltyEventProcessor` also removes one Loyalty import of the Offers public surface, but
that is a public-contract occurrence rather than a direct-debt baseline count. The central public
SCC baseline remains empty and no new public dependency direction is introduced.

The existing `LoyaltyLedger.orderId` UUID persistence/idempotency key is **not** migrated in 2E-B.
The new cross-context capability uses `orderStableId`; Loyalty resolves the internal UUID only
inside its current persistence implementation. Converting that ledger identity would require a
separate schema/migration and broader refund/amendment/idempotency compatibility analysis, so it
remains explicit Benefits persistence debt for later consolidation.

No dependency/lockfile, Prisma schema/migration, payment state, Uber wire contract, provider
idempotency, external route, order-status transition, durable outbox ownership or print protocol
is changed. Per the Phase 4 rollout policy, 2E-B will not be deployed separately; production
verification remains part of the consolidated Phase 4 rollout.

### Slice 3 — Customer Profile / Address / Consent boundary

Status: **MERGED / CI GREEN / AWAITING PHASE-END DEPLOYMENT** via PR #2178. Final head
`73f7d2e1` passed CI #5140 and squash-merged to `dev` as `e813d918`.

The readiness audit rejected a mechanical three-service split because duplicating Nest/Prisma
entry points would increase Identity direct-import debt. The approved atomic owner contraction
instead replaces the old standalone `MembershipOnboardingService` with one coherent
`CustomerService` that owns onboarding, profile, address and marketing-consent behavior while the
legacy `MembershipService` retains member summary/read-model, device/session, loyalty/coupon and
payment-benefit reservation responsibilities.

Implemented source shape:

1. `CustomerService` owns onboarding status/finalization, profile updates, marketing consent and
   address CRUD/default selection under one existing Identity/Customer persistence entry point;
2. onboarding and profile now share one birthday eligibility invariant while preserving existing
   route semantics: integer year/month, year >= 1900, month 1-12, conservative minimum-age 13
   check, one-time completion for legacy partial birthdays and immutable already-complete
   birthdays;
3. customer consent remains Identity-owned. The false -> true marketing transition still invokes
   the Messaging-owned `CUSTOMER_LIFECYCLE_NOTIFICATION` delivery capability and the Benefits-owned
   `COUPON_PROGRAM_TRIGGER`; Messaging does not regain consent or customer persistence ownership;
4. address operations continue exposing/accepting `addressStableId` and scope every persistence
   lookup by the authenticated customer's stable identity -> internal user ID translation. First
   address/default switching/delete-default promotion and coordinate normalization are preserved;
5. the broad Membership read surface no longer creates/updates a User or consumes PHONE_VERIFY
   challenges as an incidental side effect. Summary/coupon/ledger reads now require an existing
   `userStableId`. Production readiness data showed 40/40 Users with non-null stable IDs and 2/2
   UserAddress rows with non-null address stable IDs, so no schema/backfill is required;
6. existing HTTP routes and request/response shapes remain unchanged. `MembershipController`
   delegates only the Customer-owned routes to `CustomerService`; Web membership and checkout
   consumers require no change;
7. the retired `membership-onboarding.service.ts` path is deleted and a central architecture guard
   prevents it, Customer-owned methods, AuthChallenge/PHONE_VERIFY mutation or implicit
   `user.create` behavior from returning to `MembershipService`;
8. focused characterization now covers onboarding/referral atomicity, profile/birthday behavior,
   consent transition/delivery/benefit triggering, address ownership/default behavior and the
   existing-user-only Membership summary boundary.

This slice intentionally leaves the numeric direct-import baseline unchanged: Identity remains at
**37** outgoing direct imports, Identity -> Messaging direct debt remains **0**, and the public SCC
baseline remains empty. No dependency/lockfile, Prisma schema/migration, HTTP route, Web contract,
payment, Orders, Uber or durable-outbox change is included. Per the Phase 4 rollout policy, Slice 3
will not be deployed separately; production verification remains part of the consolidated phase
rollout.

### Slice 4 — Admin Members / Staff adapter contraction

Status: **4A + 4B + 4C + 4D-A MERGED / CI GREEN; 4D-H LOCAL SOURCE COMPLETE / REVIEW PENDING**.
The TrustedDevice Stage 2 and Slice 4C Order member stable-ID migrations are merged but remain unapplied
until the consolidated Phase 4 rollout. Slice 4D-A merged as the schema-free ownership contraction; 4D-H
is the separately reviewed security/UX behavior hardening and introduces one required production secret
configuration key without a Prisma migration.

#### Slice 4A — Staff Administration ownership contraction

Status: **MERGED / CI GREEN / AWAITING PHASE-END DEPLOYMENT** via PR #2179. Final head
`f235893e` passed GitHub Actions CI #5144 and squash-merged to `dev` as `f91a849e`.

The approved first sub-slice moves Staff administration persistence and business decisions from the
Admin transport adapter into the existing Auth/Identity owner without changing HTTP routes or Web
contracts:

1. framework/persistence-free `STAFF_ADMINISTRATION` public contract exposes only stable-ID Staff
   administration DTOs/use cases. Nest-import-free `StaffAdministrationService` inside Auth/Identity
   implements that port and owns the ADMIN/STAFF list read model, role/status mutation,
   self-modification protection and the existing last-active-admin invariant; Nest wiring and HTTP
   exception mapping remain outside the application owner;
2. Staff invite list/status, create/resend/revoke orchestration and the decision to call the narrow
   `STAFF_INVITE_DELIVERY` capability are Identity-owned. Messaging still owns only template/provider
   delivery; the Admin controller no longer injects the delivery port;
3. the Admin adapter passes `actorUserStableId` / target `userStableId` into the owner rather than
   passing an internal User DB UUID across the adapter/use-case boundary. Identity resolves the
   inviter DB ID internally only where the existing `UserInvite.invitedByUserId` persistence relation
   requires it;
4. `AdminStaffController` is reduced to guards, request parsing, delegation and the existing dev-only
   invite URL formatting. It no longer imports `PrismaService`, Prisma-generated role/status types or
   Messaging delivery capabilities;
5. `AdminModule` drops the historical direct `PrismaService` provider and
   `StaffInviteDeliveryModule` wiring; `AuthModule` composes the Staff invite delivery public module
   with the Identity owner instead;
6. the existing non-atomic `active ADMIN count -> update target` behavior is deliberately preserved.
   Serializing/locking that invariant is a separate transaction-semantics hardening task, not part of
   this ownership move;
7. the existing backend invite capability continues to accept the previously supported AuthService
   roles, including `ACCOUNTANT`. The current Staff Web UI still exposes only ADMIN/STAFF; 4A does not
   mix the separately planned Admin/Accounting/POS role/PWA work into modularization;
8. focused characterization covers staff-list mapping, self-modification rejection,
   last-active-admin protection, permitted demotion when another admin remains, invite delivery,
   invite status mapping and the existing 400/404 transport error mapping. The central scanner moves
   the Phase 2C Staff delivery consumer from Admin to Identity and prevents Prisma/invite-delivery
   ownership from returning to the Admin controller/module.

Static production-import accounting keeps Identity -> Architecture at **13**, contracts Identity ->
Runtime **14 -> 12**, and therefore contracts total Identity outgoing debt **37 -> 35**. Identity ->
Messaging direct debt remains **0** because Staff delivery is a registered public capability, and the
public SCC baseline remains empty. No dependency/lockfile,
Prisma schema/migration, HTTP route, Web, payment, Orders, Uber or durable-outbox change is included.
Per the Phase 4 rollout policy, Slice 4A will not be deployed separately.

#### Slice 4B — Customer + Security admin boundary

Status: **MERGED / CI GREEN / AWAITING PHASE-END DEPLOYMENT**.
Stage 1 merged via PR #2180 as `252cd26f` after final head `a2f52ddf` passed GitHub Actions CI #5150.
Stage 2 merged via PR #2181 as `060e9417` after final head `f2cbf835` passed GitHub Actions CI #5153;
the authorized TrustedDevice migration remains unapplied in production until the consolidated Phase 4 rollout.

Stage 1 established the Customer/Auth owner boundaries. Stage 2 closes the deferred TrustedDevice
identity tail without changing the existing browser route shapes:

1. Customer now exposes the framework/persistence-free `CUSTOMER_ADMINISTRATION` contract.
   `CustomerService` implements the capability and owns Admin profile mutation plus address reads;
   `AdminMembersService` delegates both instead of writing `User` / `UserAddress` itself;
2. the existing Admin birthday override remains deliberately distinct from customer self-service:
   Admin may overwrite an existing birthday, clear year/month together, and is not subject to the
   customer-facing minimum-age or one-time-completion restrictions. Existing year/month validation,
   email/phone uniqueness checks and phone-change verification reset semantics are preserved;
3. Auth exposes the separate framework/Prisma-generated-free `ACCOUNT_SECURITY_ADMINISTRATION`
   capability. Its internal service resolves `userStableId` to the User DB UUID inside Identity and
   owns Admin session listing/revocation plus ACTIVE/DISABLED account-status mutation;
4. Stage 2 adds required unique `TrustedDevice.trustedDeviceStableId @default(cuid())`. The authorized
   migration adds the column, deterministically/idempotently backfills existing rows as
   `c + substring(md5(id), 1, 23)`, checks for NULL/duplicate results, then tightens NOT NULL and adds
   the unique index. A 2026-09-05 read-only production precheck found **2** TrustedDevice rows and
   **2** distinct predicted backfill values;
5. `ACCOUNT_SECURITY_ADMINISTRATION` now owns the complete device-management read model, session
   revocation, trusted-device revocation and session-derived label lookup. The owner resolves
   `userStableId` to the User DB UUID internally and selects/revokes trusted devices only through
   `trustedDeviceStableId`; `MembershipService` no longer reads/writes `UserSession` or
   `TrustedDevice`, and Admin no longer performs the temporary Auth + Membership dual query;
6. the browser response exposes explicit `trustedDeviceStableId`. For cached Web/PWA bundle
   compatibility, the historical `id` field remains as an alias but carries the **same stable ID**,
   never the Prisma UUID. Existing `/membership/devices/trusted/:deviceId` and Admin route shapes are
   preserved; new Web code uses `trustedDeviceStableId` explicitly for React keys and revoke calls;
7. trusted-device token issuance/validation remains in the existing Auth owner and is not changed by
   the identity migration. Orders/top-items were deferred to 4C and recharge challenge/token lifecycle
   to 4D-A, both documented below; Benefits/coupon/loyalty implementation remains Slice 5. No
   dependency/lockfile, payment, Uber, provider or external-route change is included;
8. focused characterization now covers current-session dedupe, stable trusted-device projection,
   stable-ID-scoped trusted-device revoke, session-label lookup and existing account status behavior.
   The central scanner requires the schema/migration, Auth owner capability and Web stable-ID use,
   forbids device persistence from returning to Membership/Admin, and rejects nondeterministic
   TrustedDevice backfill SQL.

Static production-import debt remains **unchanged** at Identity -> Architecture **13**,
Identity -> Runtime **12**, total Identity outgoing **35**, Identity -> Messaging **0**, with the
public SCC baseline still empty. This is an ownership/data-contract contraction inside the existing
Identity / Customer / Benefits context, not a cross-context graph change. No local Prisma application,
lint/build/test/scanner run is claimed under repository workflow; remote CI remains deferred until user
review. The migration SQL is generated as a reviewed repository migration but is not applied to any
local or production database in this stage. At Phase-end rollout, `prisma migrate deploy` must complete
**before** the new API/Web image is activated because the owner read model selects the new column. The
post-migration verification must confirm TrustedDevice total = populated stable IDs = distinct stable
IDs, then exercise member device list/trust/revoke plus Admin device list/revoke before 4B is marked
production verified.

#### Slice 4C — Orders member read routes

Status: **MERGED / CI GREEN / AWAITING PHASE-END DEPLOYMENT** via PR #2182. Final head
`7cb071ad` passed GitHub Actions CI #5158 and squash-merged to `dev` as `3119ce76`. The authorized
Order stable-ID migration remains unapplied until the consolidated Phase 4 rollout.

The approved implementation keeps the existing Admin/POS HTTP contract while moving the two
Orders-owned read models out of Identity/Admin:

1. `Order.userStableId String?` is added as an additive Orders-owned member business identity while
   the historical `Order.userId` field remains untouched. The authorized migration deterministically
   backfills `Order.userStableId` from the existing `Order.userId -> User.id` mapping, verifies member
   order count = populated stable IDs, rejects mismatched values and orphan User DB IDs, then adds
   `@@index([userStableId, createdAt])`. A 2026-09-05 production read-only precheck found **2459** total
   orders, **45** member-linked orders across **11** members, with **45/45** User mappings valid and
   **0** orphans;
2. normal Web/POS order creation and prepared-payment confirmation dual-write both `userId` and
   `userStableId`; the Loyalty top-up synthetic Order does the same. Uber ingestion remains guest /
   external-channel owned and does not fabricate a customer identity;
3. `/admin/members/:userStableId/orders` and `/top-items` keep their exact route shape and
   `SessionAuthGuard + AdminMfaGuard + RolesGuard`, `ADMIN|STAFF` authorization, but their controller
   and Prisma read model now live inside Orders. `AdminMembersController` / `AdminMembersService`
   no longer own those handlers or query `Order` / `OrderItem` persistence;
4. Orders reads only `Order.userStableId`. To preserve the historical `404 member not found` behavior
   for a real missing customer while still returning empty lists for an existing customer with no
   orders, Customer exposes the narrow DB-ID-free `CUSTOMER_EXISTENCE_READER` boolean capability;
   Orders does not query `User` persistence and no User DB UUID crosses the boundary;
5. list ordering, default/legacy limit parsing, top-items `1..50` clamp, qualifying statuses
   (`paid|making|ready|completed`), quantity aggregation and display-name fallback order remain
   unchanged. No Web route change is required;
6. `OrdersModule` now consumes `MembershipModule` through `membership/public-api`, contracting the
   direct Commerce -> Identity import allowance **5 -> 4** and Commerce outgoing direct debt
   **31 -> 30**. The new Orders/Customer read services share context-local `orders-prisma` /
   `membership-prisma` composition boundaries backed by the existing Runtime `PrismaModule`, so
   Commerce -> Runtime remains **10** and Identity -> Runtime remains **12** instead of raising either
   monotonic debt baseline. No Identity -> Orders public edge is added, so the public SCC baseline
   remains empty;
7. the central scanner permanently requires the schema/migration, stable-ID read model, Customer
   existence contract, Orders-owned transport, dual-write paths and Admin cleanup, while rejecting
   User persistence access or DB-ID-based member reads from the Orders read model.

No local migration application was performed. GitHub Actions CI #5158 is the authoritative validation
for the merged Slice 4C source. At Phase-end rollout the Order stable-ID migration must run before the
new API starts querying the column. Post-migration verification must confirm every non-null
`Order.userId` row has the matching `Order.userStableId`, then exercise Admin member orders / top-items
plus POS member order history.

#### Slice 4D-A — Recharge challenge ownership contraction

Status: **MERGED / CI GREEN / AWAITING PHASE-END DEPLOYMENT** via PR #2183. Final head
`cec141ba` passed GitHub Actions CI #5162 and squash-merged to `dev` as `07dc1206`.

The approved source contraction moves the existing POS member recharge verification lifecycle behind an
Identity/Auth public capability without changing the HTTP routes, OTP policy, provider delivery behavior
or Loyalty top-up semantics:

1. Auth exposes the framework/persistence-free `MEMBER_RECHARGE_VERIFICATION` contract with
   `sendCode`, `verifyCode` and `consumeVerificationToken`. Cross-boundary inputs use only
   `userStableId`, contact/locale/code facts and the opaque verification token; no User DB UUID,
   `AuthChallenge` persistence shape, Prisma type, provider service or Loyalty implementation is exposed;
2. `MemberRechargeVerificationService` resolves `userStableId -> User.id` internally and owns the
   historical recharge contact selection, including email-first behavior when a profile email exists,
   contact mismatch errors and missing-contact errors. Email recharge continues using
   `NON_ZERO_SIX_DIGIT`, the existing `OTP` hash secret, 10-minute expiry, `EMAIL_VERIFY`,
   `purpose='pos-recharge'`, MessagingSend audit linkage and `email_send_failed` fallback;
3. SMS recharge still delegates `sendCode` / `verifyCode` to the existing `PhoneVerificationService`
   with `purpose='pos-recharge'`, preserving its existing phone normalization, rate limits, provider
   error behavior, `PHONE_VERIFY` challenge type and verification-token semantics. The same-context
   Phone Verification challenge imports now use `challenge-engine.port/module` directly instead of the
   Auth public barrel so exporting the new recharge module cannot create a runtime import cycle;
4. email code verification preserves latest-pending selection, expiry mutation, attempt increment /
   final revoke, successful code consumption plus creation of a PENDING verification-token challenge,
   and the rule that the token inherits the original code's expiry rather than receiving a fresh TTL;
5. final verification-token claim preserves the existing address/channel/type/purpose binding and
   atomic `updateMany(status=PENDING)` one-time consume guard. Expired tokens remain rejected without
   changing the historical status-mutation behavior, and a concurrent second claim still returns
   `verificationToken already used`;
6. `AdminMembersService` no longer imports or mutates `AuthChallenge`, `PhoneVerificationService`,
   `IDENTITY_CHALLENGE_ENGINE` or `MEMBER_RECHARGE_EMAIL_DELIVERY`. It delegates send/verify/claim to
   the owner, maps owner validation/member errors back to the existing 400/404 transport behavior,
   keeps the existing amount/token presence checks, generates the same idempotency key when absent,
   and calls `LoyaltyService.applyTopup()` only **after** the token owner confirms the atomic claim;
7. `AdminMembersModule` now composes only `MemberRechargeVerificationModule` for this concern. The old
   direct Phone Verification, recharge Email delivery and challenge-engine module wiring is removed;
8. focused characterization moves the OTP/challenge/token behavior to the Auth owner and leaves Admin
   tests for delegation/error mapping plus the required token-claim-before-top-up order. The central
   scanner reverses the old Phase 2C Admin-delivery guard and permanently forbids challenge/delivery
   ownership from returning to Admin or Loyalty top-up orchestration from moving into Auth.

Production read-only readiness evidence on 2026-09-05 found only **2** historical
`purpose='pos-recharge'` challenges, both `EMAIL_VERIFY/EMAIL/PENDING`, both with `userId`, both already
past `expiresAt`, and no pending recharge verification-token (`tokenHash`) rows. No schema/backfill or
production data cleanup is required for 4D-A. Numeric context debt is intentionally unchanged:
Identity -> Architecture **13**, Identity -> Runtime **12**, Identity total **35**, Identity -> Messaging
**0**, Commerce -> Identity **4**, with the public SCC baseline still empty.

No local lint/build/test/scanner run was used for 4D-A; GitHub Actions CI #5162 is the authoritative
validation for the merged source. No dependency/lockfile, Prisma schema/migration, route, Web/PWA,
Clover, Uber, Loyalty amount/bonus/idempotency or transaction-boundary change was included.

#### Slice 4D-H — Recharge verification security / UX hardening

Status: **LOCAL SOURCE COMPLETE / REVIEW PENDING** on
`hardening/phase4-slice4d-h-recharge-verification`.

The authorized hardening keeps the 4D-A public capability/routes and Loyalty top-up flow intact while
making recharge verification one owner-controlled policy across Email and SMS:

1. `MemberRechargeVerificationService` now owns both Email and SMS `pos-recharge` challenge creation,
   verification and verification-token creation. SMS no longer delegates challenge policy/lifecycle to
   `PhoneVerificationService`; it calls the existing Messaging-owned `PHONE_VERIFICATION_DELIVERY`
   capability only for provider/template delivery. Email continues using the separate
   `MEMBER_RECHARGE_EMAIL_DELIVERY` capability;
2. recharge sends use one DB-backed per-member budget across both channels: at most one code per
   60 seconds and at most five code challenges in the preceding 24 hours. Only `purpose='pos-recharge'`
   rows with a non-null `codeHash` count, so verification-token rows do not consume send budget. The
   limiter is stored in `AuthChallenge` facts rather than the optional process-local Phone Verification
   IP map;
3. new Email and SMS recharge codes are both hashed with the new `MEMBER_RECHARGE` challenge secret kind,
   resolved exclusively from the required production key `MEMBER_RECHARGE_OTP_SECRET`. `main.ts` fails
   production startup if the key is absent and the API service in `docker-compose.yml` requires it. No
   secret value is committed;
4. `NON_ZERO_SIX_DIGIT` generation now uses Node `crypto.randomInt(100000, 1_000_000)` rather than
   `Math.random()`. The visible format remains 100000-999999. Because this format is also used by the
   generic Phone Verification owner, that existing flow receives the same randomness hardening without a
   contract or format change;
5. the POS member-recharge UI now inspects the `{ ok, error }` response from `send-code`. It enters
   `code-sent` only on `ok=true`; provider failures stay on the current step, and the unified 60-second /
   daily-limit results receive explicit bilingual staff messages;
6. no legacy-secret verification fallback is introduced. The user explicitly chose a controlled atomic
   cutover: during Phase-end deployment the store must temporarily stop POS member recharge, configure
   `MEMBER_RECHARGE_OTP_SECRET`, activate the new API/Web version, and only then resume recharge. Any
   verification code issued by the old version is intentionally not supported across this cutover;
7. no Prisma schema/migration, dependency/lockfile, HTTP route, Loyalty amount/bonus/idempotency,
   verification-token atomic claim, Clover or Uber behavior changes are included. Focused API/Web tests
   and the architecture scanner reserve the recharge-specific secret, owner-side Email/SMS challenge
   lifecycle, DB-backed send limits, cryptographic generation and `{ ok:false }` POS handling.

Remote CI is not claimed at this local review stage. Production `.env` is not modified by this slice;
setting the new secret and executing the controlled rollout require separate deployment authorization.

Benefits/template coupon issuance remains Slice 5 scope rather than being moved into Customer merely
to empty Admin persistence.

### Slice 5 — Benefits implementation ownership consolidation

Status: **PLANNED / TRANSACTION-SENSITIVE**.

Continue the Offers/Benefits ownership normalization started in Phase 3 by moving safe
eligibility/claim/issue/trigger/entitlement implementation behind Benefits-owned
surfaces. Do not mechanically relocate code that currently depends on a cross-owner
Prisma transaction. Coupon program definition/use policy remains Offers-owned;
customer entitlement/reservation behavior remains Benefits-owned.

#### Slice 5A — Loyalty ledger order identity contraction

Treat the remaining Admin loyalty-ledger Order enrichment as Benefits/Loyalty debt, not
as a Slice 4C Orders read-model tail. `LoyaltyLedger` currently persists internal
`orderId` and Admin later performs an extra `Order.id -> Order.orderStableId` lookup
solely to present the browser-safe business identity. Slice 5A should evaluate an
additive nullable `LoyaltyLedger.orderStableId` expand-contract migration, deterministic
backfill from the existing `orderId -> Order.orderStableId` mapping, and transactional
dual-write of both identities on new order-related ledger entries. The intended exit
state is that the Benefits/Loyalty read model returns `orderStableId` directly, while
retaining `orderId` only where an internal same-owner relation/transaction still
requires it; Admin must no longer query Order persistence to enrich loyalty-ledger
responses. Do not solve this by moving the loyalty-ledger route into Orders or by
introducing a new Identity/Benefits -> Orders runtime dependency.

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
