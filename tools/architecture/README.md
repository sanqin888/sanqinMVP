# Architecture scanner

Run from the repository root:

```bash
node tools/architecture/scan-architecture.mjs --check
node tools/architecture/scan-architecture.mjs --report
```

`--check` enforces:

- exactly 12 registered contexts;
- no unclassified production source roots;
- no new direct cross-context dependency pair;
- no increase **or stale overstatement** in a recorded direct-import allowance. When
  direct debt shrinks, the same PR must lower/remove its numeric baseline, so a retired
  direct edge cannot remain grandfathered and later return unnoticed;
- no new or expanded strongly connected cycle made from public-contract dependency
  pairs that are no longer grandfathered by a live legacy direct-import allowance.
  The cycle graph includes `public-api`, `contracts`, `ports`, and registered public
  aliases, so moving both directions behind public surfaces cannot hide an A -> B -> A
  dependency. Public SCCs that already existed when Slice 6 introduced cycle detection
  are recorded explicitly in `legacyPublicCycleComponents` as contraction-only debt.
  Those baselines must now match the exact current SCC membership and internal edge set:
  any contraction requires lowering/removing the baseline in the same PR, while a new
  member, restored edge, or new internal edge fails CI. This makes SCC debt monotonic
  instead of allowing a previously removed cycle edge to remain authorized by a stale
  historical superset;
- browser/server direct `fetch` only at canonical transports or explicitly
  recorded raw/protocol exceptions, with stale allowances rejected; POS
  session/login has no direct-fetch allowance after its canonical-client cutover,
  leaving Checkout as the only regular JSON browser compatibility debt;
- one App Router `/api/v1` JSON BFF instead of a duplicate Next rewrite;
- server-only Web API upstream configuration (`API_UPSTREAM`);
- `@shared/foundation` registered as the `architecture-foundation` public package,
  while architecture-foundation itself cannot depend on business public surfaces;
- StableId foundation primitives have exactly one implementation owner and are not
  re-exported from Menu/Order business packages;
- Brand/Store canonical configuration, configured stable store identity, and the
  Nest composition module are exposed through one registered `store/public-api.ts`
  surface; internal identity/contract/Prisma/module paths cannot be deep-imported
  across contexts, migrated consumers cannot regress to legacy `BusinessConfig`
  delegates or consumer-specific forbidden Prisma symbols; Orders and the POS
  connectivity watchdog are registered fully migrated readers. Admin Business is
  now a canonical reader/writer consumer: it must use the Brand/Store public writer
  boundary and cannot write `BusinessConfig`, `BrandConfig`, or `StoreConfig`
  through Prisma directly. Timed temporary-closure reason encoding is also owned by
  Brand/Store and exposed through `store/public-api.ts`; POS may consume that codec but
  must not implement a competing persistence format. The deleted `common/store-id.ts`
  path cannot return, and configured store identity has one implementation owner;
- Benefits coupon claims/triggers/admin issuance are exposed through
  `benefits/public-api.ts`; the legacy Coupons implementation module must remain
  non-global, concrete coupon benefit services cannot be deep-imported outside
  their implementation root, and migrated Identity consumers cannot regain a
  direct Catalog/Offers dependency;
- Unified payment preparation consumes points/balance and coupon HOLD/RELEASE only
  through the registered Benefits payment-reservation contracts/composition
  surface. `PaymentCheckoutAttemptService` and its POS composition module cannot
  deep-import Loyalty/Membership implementations again; lowering the matching
  `payments-clover -> identity-customer-benefits` allowance is part of the same
  contraction;
- Admin menu CRUD/read-model decisions are owned by Catalog through
  `menu/public-api.ts`; `apps/api/src/admin/menu/**` cannot regain direct Prisma or
  Uber-provider ownership. Availability/provider coordination lives in the explicit
  `application/menu` orchestration boundary: Catalog reads its own publication and
  suspend-window facts and sends provider-neutral availability intent through the Uber
  public capability. Uber runtime composition must not reverse-query Catalog, while
  Uber availability persistence remains DB-only for Uber-owned store-mapping/OpsTicket
  facts. The retired Admin availability orchestrator cannot return, and the
  fixed-component Uber capability guard cannot move back into `CatalogAdminService`.
  Daily Special persistence, store-time activation and special
  pricing policy are owned by Offers through `DAILY_SPECIAL_OFFERS`; `MenuDailySpecial`
  Prisma access is exclusive to `PromotionsService`. Catalog exposes only item stable
  IDs/base-price facts, while Admin composition, Public Menu and Orders consume the
  Offers public capability. Because Catalog/Public Menu no longer read StoreConfig for
  Daily Special timing, they are no longer registered Brand/Store config consumers;
  `PromotionsService` remains registered there. The Catalog availability module reuses
  the narrow `CatalogAdminModule` so this HTTP-side Offers wiring does not expand the
  Uber worker runtime dependency surface. PromotionRule management is likewise owned by
  Offers through `PROMOTION_RULE_MANAGEMENT`: Admin Promotions must remain a thin public-
  capability adapter with no Prisma/generated-rule ownership, the retired
  `AdminPromotionsService` cannot return, and `promotionRule` Prisma delegate access is
  exclusive to the existing `PromotionsService` persistence entry;
- Email verification challenge lifecycle and verified-email account mutation belong to
  Identity through `IDENTITY_EMAIL_VERIFICATION`; Membership and Clover checkout consume
  that capability through `auth/public-api.ts`. Messaging exposes only
  `EMAIL_VERIFICATION_DELIVERY` through `email/public-api.ts`, and Messaging source may
  not import Identity or regain `AuthChallenge` / `emailVerifiedAt` ownership. The retired
  Messaging-owned verification service/controller must stay deleted;
- Auth challenge delivery uses the Messaging-owned `AUTH_CHALLENGE_DELIVERY` capability.
  Auth keeps challenge/session/MFA lifecycle and sends only contact, locale, code, TTL and
  stable user identity; concrete Email/SMS services, messaging configuration, template
  rendering and `MessagingTemplateType` must not return to Auth. Messaging owns the four
  distinct login-2FA/email-2FA/phone-enrollment/member-login delivery mappings, and SMS
  audit linkage must resolve users through `userStableId` rather than a cross-context DB UUID;
- Generic/customer phone verification delivery uses the separate Messaging-owned
  `PHONE_VERIFICATION_DELIVERY` capability. Phone Verification keeps `AuthChallenge`, non-zero OTP
  generation/hash, expiry/attempt/consume/token semantics and `sms_send_failed` handling, while shared
  cooldown/daily/IP policy is delegated to the Identity-owned DB-backed `OtpChallengePolicyService`.
  Process-local `Map`/timer throttling must not return. Messaging owns only OTP template/config/provider
  dispatch. The template purpose remains the historical fixed `verify`, while the caller purpose is
  preserved only as Messaging metadata and Identity challenge purpose;
- Admin staff invite and POS member-recharge email delivery use separate narrow Email public
  capabilities: `STAFF_INVITE_DELIVERY` and `MEMBER_RECHARGE_EMAIL_DELIVERY`. After Phase 4
  Slice 4A, Admin reaches Staff account/invite use cases only through the Identity-owned
  `STAFF_ADMINISTRATION` public port; internal `StaffAdministrationService` owns Staff state and
  delivery orchestration. Slice 4D-A puts the `pos-recharge` OTP/challenge/token lifecycle behind the
  Identity-owned `MEMBER_RECHARGE_VERIFICATION` capability, and 4D-H completes the policy hardening:
  Email and SMS recharge challenge creation/verification/token creation must both remain inside that
  owner. SMS may use Messaging `PHONE_VERIFICATION_DELIVERY` only for provider/template dispatch and
  must not delegate recharge challenge lifecycle back to `PhoneVerificationService`. Admin Members
  keeps only transport/error mapping plus the existing post-claim `LoyaltyService.applyTopup()`
  orchestration. Recharge sends are DB-limited per member across both channels to one code per 60
  seconds and five code challenges per rolling 24 hours; verification-token rows do not consume this
  budget. New recharge codes use only the `MEMBER_RECHARGE` secret kind backed by required production
  `MEMBER_RECHARGE_OTP_SECRET`, while non-zero six-digit generation must use `crypto.randomInt` rather
  than `Math.random`. POS must inspect the backend `{ ok, error }` result and cannot enter `code-sent`
  after `{ ok:false }`; cooldown/daily-limit responses remain explicit staff-facing states. The rollout
  intentionally has no legacy-secret fallback: POS recharge is paused during secret/API/Web cutover.
  Slice 4D-I generalizes OTP policy inside Identity: `email_verify` expires after 10 minutes, repeated
  Login 2FA / Phone Enrollment / Membership Login / Checkout / Email Verify / POS Recharge sends use the
  shared DB-backed policy, public membership-login/checkout flows have a 30/hour IP spray budget, and
  successful sends revoke superseded pending code rows only after provider success. Five failed code
  attempts revoke the active challenge where verification is code-based; failed provider delivery revokes
  only the new challenge. Generic Phone Verification must not restore process-local throttling;
- Phase 4 Slice 4B reserves Admin/member Customer/Security ownership behind two Identity-context
  capabilities. `CUSTOMER_ADMINISTRATION` is implemented by `CustomerService` and owns Admin profile
  mutation plus address reads while preserving the intentionally broader Admin birthday override.
  `ACCOUNT_SECURITY_ADMINISTRATION` owns stable-ID-scoped device/session management and
  ACTIVE/DISABLED status mutation through an Auth-internal Prisma boundary. Stage 2 adds
  `TrustedDevice.trustedDeviceStableId`, uses deterministic/idempotent backfill SQL, returns the stable
  ID through both the explicit `trustedDeviceStableId` field and the legacy browser/PWA `id` alias,
  and revokes trusted devices by stable ID. `MembershipService` and `AdminMembersService` cannot
  regain trusted-device/session persistence or expose the Prisma UUID through browser contracts;
- Phase 4 Slice 4C makes Orders own the Admin member order-history/top-item read models. The existing
  `/admin/members/:userStableId/orders` and `/top-items` route shapes remain, but their controller and
  Prisma queries live under Orders and use nullable `Order.userStableId`, not a User DB UUID. The
  additive migration deterministically backfills from the historical `Order.userId` mapping with
  count/mismatch/orphan checks and adds the `(userStableId, createdAt)` index. New member orders and
  Loyalty top-up synthetic orders dual-write both identities. The DB-ID-free
  `CUSTOMER_EXISTENCE_READER` preserves missing-member semantics without Orders reading User
  persistence, Admin cannot regain Order/OrderItem persistence, and the SCC guard must remain empty;
- Phase 4 Slice 5A persists nullable `LoyaltyLedger.orderStableId` beside the existing internal
  `orderId`. The 5A additive migration deterministically backfills through the existing
  `LoyaltyLedger.orderId -> Order.id -> Order.orderStableId` mapping and fails on incomplete,
  mismatched, orphan or impossible stable-without-DB-ID rows; it does not tighten the field to
  NOT NULL, make it unique, or add an Order FK. Every order-linked ledger write dual-writes both
  identities while manual no-order adjustments keep both absent. Admin and Membership ledger views
  delegate to `LOYALTY_LEDGER_READER`, whose public contract contains stable/business identity only
  and whose implementation reads `orderStableId` directly from Loyalty persistence without an Order
  enrichment query. Slice 5B then adds the first normal order-stable lookup through the Benefits-owned
  `LOYALTY_ORDER_USAGE_READER`, so a separate additive migration adds one **non-unique**
  `LoyaltyLedger(orderStableId)` query-support index. Orders order-detail/public-summary, legacy Web
  external-payment reconstruction, and POS/receipt print payloads must delegate usage reads by
  `orderStableId` and may not query the `loyaltyLedger` Prisma delegate directly. Loyalty Runtime
  access remains consolidated through `loyalty-prisma.ts`, and the existing
  `(orderId, type, sourceKey)` internal idempotency constraint remains unchanged;
- Registration and marketing-opt-in welcome delivery use the Notifications-owned
  `CUSTOMER_LIFECYCLE_NOTIFICATION` capability. Auth keeps the new-user decision; Customer
  keeps persisted marketing-consent ownership. Neither consumer may deep-import
  `NotificationService`/`notification.module`, pass Prisma `User`/DB `userId`, or move consent
  into Messaging. Registration email/SMS fallback and subscription email delivery link audit
  records through `userStableId`;
- Customer profile/address/consent behavior is owned by `CustomerService`, which also absorbs the
  prior onboarding owner so birthday eligibility has one implementation. Existing membership
  routes remain transport adapters, address access crosses the public/business surface with
  `userStableId`/`addressStableId`, and the broad `MembershipService` may not regain profile,
  address, consent, `AuthChallenge`/`PHONE_VERIFY`, or implicit `User` creation behavior. The
  retired `MembershipOnboardingService` path must stay deleted;
- Historical AWS SNS/SQS infrastructure is retired. The architecture scanner reserves deletion
  of `/webhooks/aws-sns`, its controller/service and the SES SQS event processor, and prevents
  `SNS_TOPIC_ARN`, `SES_EVENTS_SQS_QUEUE_URL` or `PRINT_SNS_TOPIC_ARN` runtime wiring from
  returning. AWS SES/SMS send providers remain available; SES configuration-set publishing is
  explicit opt-in so provider activation does not silently recreate the retired event path;
- Order paid Loyalty settlement uses the Identity-owned `LOYALTY_ORDER_PAID_SETTLEMENT` public
  capability and crosses contexts only with `orderStableId` plus reward subtotal/redeem cents and
  earn multiplier. `OrderEventsBus` is private Orders/Fulfillment same-process fast-path
  infrastructure: Messaging, Loyalty and Uber cannot own/import it and Orders must not export it
  publicly. The durable `OrderLifecycleOutboxProcessor` remains the retry/replay owner and cannot
  be replaced by the in-memory bus;
- Benefits loyalty policy is exposed through `loyalty/public-api.ts`; all
  LoyaltyService policy readers must use transitional `BrandConfig` storage,
  transaction-bound reads must stay on the existing Prisma transaction client,
  migrated Admin readers cannot return to `BusinessConfig`; Admin Members read/write
  and POS payment policy reads must use the registered Benefits endpoints through
  the centralized Web Loyalty API client. Orders quote/create redemption conversion
  must read `redeemDollarPerPoint` through `LOYALTY_POLICY_READER`, keep its
  points/cents arithmetic in the registered characterized helper, and must not
  reintroduce a BusinessConfig/default redemption-rate fallback. The Benefits
  writer/settings reader must read the existing canonical config, must not invent
  runtime defaults or create missing config rows, and the writer must dual-write
  canonical plus registered compatibility storage in one transaction while the
  one-way legacy trigger remains active; general Admin Settings cannot declare or
  resubmit Loyalty policy fields. Repository-wide Web code cannot combine a legacy
  Admin Business route with a Loyalty policy field, new direct BusinessConfig
  Loyalty persistence consumers are forbidden, and the two remaining server-side
  Admin Business rollback adapters must stay explicitly registered until contract
  contraction.
  Legacy Loyalty reader
  helpers/types are forbidden, private policy implementations cannot be
  deep-imported outside the Loyalty owner, and policy fields cannot be added to the
  Brand/Store public config contract;
- unique, complete compatibility entries;
- no unregistered `@compat <compat_id>` annotation.

Imports through `public-api`, `contracts`, `ports`, and registered public
shared-package aliases are reported but do not consume legacy debt allowances.
When a PR removes direct imports, lower the matching value in
`context-baseline.json` in the same PR. Never raise a limit merely to make CI
green; either use a public contract/port or update the architecture decision and
compatibility plan explicitly.
