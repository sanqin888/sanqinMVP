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

Status: **SOURCE / LOCAL REVIEW COMPLETE** on
`fix/phase4-slice0a-pos-promotion-pricing`, based on `origin/dev@3acb7fe5`.

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
6. focused API coverage locks same-item BOGO + manual discount coexistence and authenticated
   store identity for the POS pricing route.

This hotfix does not change PromotionRule configuration/evaluation semantics, Prisma schema,
dependencies, production Web Clover Ecommerce, Uber runtime/wire behavior, or the measured
architecture graph/baselines. Post-deployment active payment verification is required before
the hotfix can be marked VERIFIED.

### Slice 0B — Catalog -> Orders public-cycle edge contraction

Status: **PLANNED AFTER 0A VERIFICATION HOTFIX**.

Objective:

- audit the current Pricing/Offers dependency on `Channel` from `@shared/order`;
- determine whether that is the complete `catalog-pricing-offers ->
  commerce-orders-fulfillment` public edge;
- prefer a provider-neutral Pricing/Offers channel input contract with one boundary
  mapping from Orders rather than moving business-specific channel semantics into
  Architecture Foundation solely to break a cycle;
- lower the exact SCC baseline in the same change if the edge disappears.

### Slice 1 — Email Verification ownership normalization

Status: **PLANNED**.

Move email-verification challenge lifecycle and verified-email account mutation to the
Identity owner. Messaging should provide only the narrow delivery capability needed to
send the verification message. Keep existing HTTP routes/consumer behavior stable and
do not duplicate challenge or user mutation logic.

### Slice 2 — Messaging public delivery boundaries

Status: **PLANNED**.

Replace cross-context imports of concrete Email/SMS/Notification/template services with
small business-purpose delivery capabilities. Public contracts should carry stable IDs,
contact/locale and message facts rather than Prisma `User` models or Messaging
infrastructure types. Do not create one generic all-purpose Messaging facade.

Primary architecture target is to contract the current
`identity-customer-benefits -> messaging-notifications` direct debt of **24** and remove
the reverse Messaging -> Identity ownership edge where verification lifecycle currently
resides.

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
  removed if Slice 0B confirms `Channel` is the only required reverse semantic edge.
- Email verification challenge/account mutation belongs to Identity; Messaging owns
  delivery only.
- Identity/Customer/Benefits cross-context callers use narrow Messaging public
  capabilities instead of concrete delivery services.
- Membership no longer acts as one mixed Customer + Benefits + Messaging god service.
- Admin Members/Staff business persistence/invariants move behind owner boundaries.
- Safe coupon/benefit entitlement implementations no longer remain physically under
  Offers merely because of historical layout; transaction-sensitive pieces remain
  deferred rather than being moved unsafely.
- The Catalog/Orders/Identity/Messaging legacy SCC materially shrinks and ideally
  disappears; any remaining component must be exact, documented contraction-only debt.

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
all required checks are green. Runtime-sensitive payment/Uber/Store behavior must not be
marked VERIFIED until its required active verification is actually completed.
