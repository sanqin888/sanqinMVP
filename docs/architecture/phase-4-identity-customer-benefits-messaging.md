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

- identity-customer-benefits: **65**
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

Status: **READINESS AUDIT NEXT**.

Objective:

- confirm every PromotionRule read/write consumer, current Admin HTTP contract and
  characterization/test coverage;
- move PromotionRule management policy and persistence ownership behind the
  Catalog/Pricing/Offers public boundary;
- keep Admin as a guarded transport adapter rather than a second PromotionRule owner;
- preserve current routes, payload semantics, validation rules, soft-delete behavior,
  persistence schema and runtime promotion evaluation.

Known readiness signal at planning time: the Admin promotion service still directly
injects `PrismaService` and implements PromotionRule validation/CRUD, while runtime
promotion evaluation already reads `PromotionRule` from the Promotions/Offers owner.
The readiness audit must determine the smallest owner-side management contract before
any code change.

### Slice 0B — Catalog -> Orders public-cycle edge contraction

Status: **PLANNED AFTER 0A**.

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
