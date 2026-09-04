# SanQ modularization worklog

Created: 2026-09-03  
Scope: SanQ full-site modularization and directly related architecture-governance work.

This file is the chronological index for modularization work. It does not replace
phase documents, compatibility records, dependency snapshots, payment charters,
runbooks, or production-verification notes. Detailed technical reasoning stays in
those owner documents; this worklog records what batch happened, when it happened,
which PR/SHA carried it, what state was actually reached, and where to read more.

Unrelated feature work and ordinary defect fixes are omitted unless they directly
change a modularization boundary, migration gate, architecture guardrail, or the
verification state of a modularization slice.

## Status vocabulary

- `SOURCE`: implementation is present in source, but remote CI/deployment status is
  not claimed here.
- `CI`: the reviewed PR completed the required GitHub checks successfully.
- `DEPLOYED`: the relevant source was deployed, but required active verification is
  still pending.
- `VERIFIED`: required active/production verification was completed successfully.
- `CLOSED`: the migration/compatibility/work package met its exit criteria and its
  remaining compatibility was removed or formally closed.
- `LOCAL`: current workspace documentation/source state has not yet been pushed.

## Historical timeline

### 2026-08-29 — Modularization development standard established

**PR/SHA:** #1992 / `c91b46c1`  
**State:** CLOSED  
**Result:** Repository-wide modularization development rules were written into
`AGENTS.md`: modular-monolith direction, ownership/boundary discipline, stable-ID
rules, migration classes, CI/delivery workflow, architecture-change authorization,
and critical-path protections became explicit repository policy.  
**Details:** `AGENTS.md`.

### 2026-08-29 to 2026-08-30 — Pre-baseline safety and test foundations

**PR/SHA:** #2000 / `480c5e4f`; #2001 / `510cecd3`; #2004 / `b8413cd7`  
**State:** CLOSED  
**Result:** Web Jest/CI test foundation was added; OTP/phone verification secrets
were separated from OAuth state secrets with production fail-fast behavior; the
fixed-combo historical component compatibility was audited and contracted after
production dry-run found no remaining actionable rows.  
**Details:** full-site modularization audit, `docs/architecture/phase-1-closeout.md`,
`docs/architecture/active-compatibility-register.md`.

### 2026-08-30 — Phase 0 architecture baseline and CI guardrails

**PR/SHA:** #2009 / `d8a37912`  
**State:** CLOSED  
**Result:** The 12-context model, dependency baseline, architecture scanner, ID
inventory, active compatibility register and CI architecture gate were established.
This created the measurable baseline used by all later contraction work.  
**Details:** `docs/architecture/current-dependency-graph.md`,
`docs/architecture/id-inventory.md`, `docs/architecture/active-compatibility-register.md`,
`tools/architecture/README.md`.

### 2026-08-30 — Phase 1 Identity ChallengeEngine consolidation

**PR/SHA:** #2011 / `6766ac15`; #2013 / `8c6f623d`  
**State:** CLOSED  
**Result:** OTP behavior was first characterized, then Auth/Admin Members/Email/Phone
verification were consolidated behind the Identity-owned ChallengeEngine instead
of keeping four independent lifecycle implementations.  
**Details:** `docs/architecture/phase-1-closeout.md`.

### 2026-08-30 — Phase 1 low-risk contract and Web transport cleanup

**PR/SHA:** #2014 / `deb2c91d`; #2015 / `6edcfec3`; #2016 / `ed96cd4d`;
#2018 / `920d1faa`; #2019 / `d1980a16`; #2020 / `a050d8b2`  
**State:** CLOSED  
**Result:** PWA icon paths were corrected; Order contracts moved to `@shared/order`;
daily-special policy moved to Pricing ownership; Web JSON transport was consolidated
around the canonical API client/envelope; Membership callers were migrated; and the
App Router BFF/server API transport replaced the duplicate rewrite/ngrok-era path.  
**Details:** `docs/architecture/phase-1-closeout.md`.

### 2026-08-30 — Phase 1 closeout and neutral StableId foundation

**PR/SHA:** #2022 / `66f082e7`; #2023 / `7912deec`  
**State:** CLOSED  
**Result:** Stale generated artifacts and confirmed unused shells were removed,
Phase 1 records were reconciled, and StableId primitives were moved into neutral
architecture foundation ownership so `common` no longer depended on a business
contract package for that primitive.  
**Details:** `docs/architecture/phase-1-closeout.md`,
`docs/architecture/current-dependency-graph.md`.

### 2026-08-30 to 2026-08-31 — Phase 2 Brand/Store canonical read boundary

**PR/SHA:** #2024 / `5522b946`; #2025 / `4665dc23`; #2027 / `386866c1`;
#2028 / `50edc208`; #2044 / `6fb7d951`; #2045 / `fda5b080`;
#2046 / `c908bef8`; #2047 / `a7143846`  
**State:** CLOSED  
**Result:** Brand/Store gained the canonical configuration read boundary and low-risk
consumers were progressively moved to it: POS exchange-rate/store-status, Messaging,
Orders, Admin and Uber stopped owning independent configuration reads or creating
legacy configuration on read.  
**Details:** `docs/architecture/current-dependency-graph.md`.

### 2026-08-30 to 2026-09-01 — Benefits/Loyalty policy expand-contract migration

**PR/SHA:** #2029 / `a10a64b6`; #2031 / `f12d22c5`; #2033 / `053ffe80`;
#2035 / `89d1927f`; #2038 / `483f675f`; #2039 / `7043917a`;
#2062 / `87685c8e`; #2065 / `33b7e706`; #2078 / `6d537a20`;
#2095 / `8f5952d0`; #2097 / `dc68ee33`  
**State:** CLOSED  
**Result:** Loyalty policy ownership moved from duplicated Brand/Business config
storage into Benefits-owned `LoyaltyProgramPolicy` through read/write boundaries,
dedicated persistence, shadow parity, controlled read cutover and final persistence
contraction. Production verification covered Admin policy edits, POS policy load,
Web pure-points purchase/refund, membership rules and unrelated Store writes.  
**Details:** `docs/architecture/benefits-loyalty-policy-contraction-plan.md`,
`docs/architecture/active-compatibility-register.md`.

### 2026-08-31 — Phase 2 Brand/Store canonical writes and staff store scoping

**PR/SHA:** #2049 / `c06819a5`; #2067 / `70bbc827`; #2069 / `ac7c8703`;
#2070 / `443b1a5c`  
**State:** CLOSED  
**Result:** Admin and POS configuration writes were cut over to Brand/Store ownership;
staff Brand/Store contracts became explicitly store-scoped, and Admin UI/store
selection was prepared for explicit multi-store context instead of singular implicit
store access.  
**Details:** `docs/architecture/current-dependency-graph.md`.

### 2026-08-31 to 2026-09-01 — POS authenticated Store identity normalization

**PR/SHA:** #2071 / `48d9cd07`; #2073 / `a7145ddf`; #2074 / `e59da45e`;
#2075 / `b7c38683`; #2076 / `9e70d485`; #2079 / `de731193`;
#2080 / `e75e76b6`; #2083 / `412aaaa6`; #2084 / `8253eb16`  
**State:** CLOSED  
**Result:** POS device/admin/browser flows were moved from ambiguous DB IDs and
implicit configured-store behavior to authenticated `storeStableId`/`deviceStableId`
context. POS order creation, reads and summaries became scoped to the authenticated
store identity.  
**Details:** `docs/architecture/current-dependency-graph.md`,
`docs/architecture/active-compatibility-register.md`.

### 2026-09-01 — Orders ↔ POS boundary contraction

**PR/SHA:** #2085 / `c5165184`; #2087 / `c05c8aab`; #2093 / `331ebda3`  
**State:** VERIFIED  
**Result:** POS order reads/operations were pushed behind Orders-owned public
capabilities while StoreStatus became explicitly store-scoped. This reduced the
Orders/POS reverse-boundary problem without moving Order ownership into POS.  
**Details:** `docs/architecture/current-dependency-graph.md`.

### 2026-09-02 — BusinessConfig application and persistence contraction

**PR/SHA:** #2099 / `889ffcca`; #2101 / `277a5276`  
**State:** CLOSED  
**Result:** The Brand/Store compatibility mirror was first stopped, then the
`BusinessConfig` Prisma model/table and its synchronization trigger/function were
removed after zero-diff parity checks. Production verification confirmed canonical
Brand/Store rows, Admin write, POS pause/resume and Uber status synchronization all
remained healthy.  
**Details:** `docs/architecture/current-dependency-graph.md`,
`docs/architecture/active-compatibility-register.md`.

### 2026-09-02 — Store-context compatibility contractions

**PR/SHA:** #2103 / `faa59ff8`; #2105 / `fdd394e0`; #2107 / `bc8ff96f`;
#2109 / `16bbaec9`  
**State:** CLOSED  
**Result:** Orders historical NULL-store fallback was removed after production data
proved no remaining NULL rows; singular `/staff/store/*` routes and legacy
`/admin/business/*` Brand/Store transport were removed; remaining implicit store
configuration ownership was contracted.  
**Details:** `docs/architecture/current-dependency-graph.md`.

### 2026-09-02 — Legacy POS transport, Admin device DB-ID and Web payload compatibility closed

**PR/SHA:** #2113 / `f1f88406`; #2114 / `3c51a0ce`; #2116 / `ce0a448b`  
**State:** CLOSED  
**Result:** Legacy POS `/orders/*` compatibility routes were deleted in favor of
canonical `/pos/orders/*`; Admin POS-device compatibility stopped accepting/exposing
DB UUID identities; Checkout's remaining direct-payload/browser-fetch compatibility
was contracted to the canonical Web API client.  
**Details:** `docs/architecture/active-compatibility-register.md`,
`docs/architecture/current-dependency-graph.md`.

### 2026-09-02 — UberEats structural freeze lifted with active verification gate

**PR/SHA:** #2117 / `ef1e7adc`  
**State:** CLOSED  
**Result:** UberEats stopped being a blanket structural freeze. Modularization work
was permitted before Production traffic, but every runtime-affecting Uber slice was
made subject to focused post-deployment active verification before moving to the
next slice.  
**Details:** `AGENTS.md`, Uber verification/progress documentation.

### 2026-09-02 — Uber Store identity normalization and persistence-default contraction

**PR/SHA:** #2119 / `7110dd46`; #2122 / `53688897`; #2124 / `0917f66c`  
**State:** CLOSED  
**Result:** Uber flows moved to explicit SanQ `storeStableId` context, Operations /
OpsTicket identity debt was contracted, and eight Uber persistence `storeId`
database defaults were removed while preserving historical Test Store/sandbox rows.
Active verification covered reconciliation persistence, POS pause/resume -> Uber,
item availability sync, zero new `default` Store writes and clean API/worker logs.  
**Details:** `docs/architecture/active-compatibility-register.md`,
`docs/architecture/current-dependency-graph.md`.

### 2026-09-02 — Phase 2 closeout

**PR/SHA:** #2126 / `3bcae16c`  
**State:** CLOSED  
**Result:** Phase 2 records were reconciled: Brand/Store configuration and Store
identity contractions, Benefits loyalty persistence, POS/Admin ID contraction and
Uber persistence default cleanup were marked closed with production evidence;
historical Uber sandbox data was explicitly deferred to Production Cutover Cleanup
rather than treated as remaining modularization debt.  
**Details:** `docs/architecture/current-dependency-graph.md`,
`docs/architecture/active-compatibility-register.md`.

### 2026-09-02 — Test/CI modularization-support performance contraction

**PR/SHA:** #2127 / `c5659ac6`; #2128 / `df69142f`; #2129 / `d7326ca3`  
**State:** CI  
**Result:** Repeated architecture/test overhead and duplicate lint/build work were
contracted and static validation was parallelized, reducing CI latency without
removing the architecture gates established by the modularization program.  
**Details:** Git history and CI workflow.

### 2026-09-03 — Pre-Phase-3 Uber ownership contractions

**PR/SHA:** #2130 / `32d3925f`; #2131 / `4b615f49`; #2132 / `0c0a678e`;
#2134 / `e69b913d`; #2137 / `c47c2ca5`  
**State:** VERIFIED  
**Result:** Uber Store Policy reads were moved behind Brand/Store ownership; SanQ
Store identity vs provider `uberStoreId` naming was made explicit; Orders ingestion
was exposed through an Orders public boundary instead of a concrete service import;
the pending-order Admin display contract was repaired with `orderStableId`,
`totalCents` and human-readable `pickupCode`; active verification covered immediate
and scheduled orders, manual/auto acceptance, cancel/refund, scheduled activation,
printing, Store identity persistence and clean worker behavior.  
**Details:** `docs/architecture/phase-3-catalog-pricing-offers.md`,
`docs/architecture/current-dependency-graph.md`.

### 2026-09-03 — Phase 3 Slice 1: Pricing public boundary

**PR/SHA:** #2135 / `8cc42340`  
**State:** CI  
**Result:** Pricing/Promotions exposed the narrow public capabilities required by
Orders and other contexts. Orders stopped importing Pricing internals directly;
`commerce-orders-fulfillment -> catalog-pricing-offers` measured direct-import debt
was reduced from 5 to 0 and the architecture allowance was removed.  
**Details:** `docs/architecture/phase-3-catalog-pricing-offers.md`,
`docs/architecture/current-dependency-graph.md`.

### 2026-09-03 — Phase 3 Slice 2: Offers / Benefits ownership normalization

**PR/SHA:** #2136 / `3c1bf057`  
**State:** CI  
**Result:** Benefits gained explicit coupon entitlement/claim/issuance contracts;
CouponTemplate/CouponProgram configuration stayed with Offers; Admin/Auth/Loyalty/
Membership consumers moved to public Benefits/Offers surfaces. The remaining
`identity-customer-benefits -> catalog-pricing-offers` direct-import allowance was
reduced from 7 to 0.  
**Details:** `docs/architecture/phase-3-catalog-pricing-offers.md`,
`docs/architecture/current-dependency-graph.md`.

### 2026-09-03 — Payments/Clover modularization governance revised

**PR/SHA:** current workspace `docs/payment-freeze-and-progress-policy`  
**State:** LOCAL  
**Result:** The whole-context Payments/Clover freeze was replaced by a
production-impact rule. POS Clover Terminal is now active pre-production
modularization work and may be structurally improved before real-device access is
restored. Production Web Clover Ecommerce is `guarded production`, not absolutely
frozen: if it becomes a documented critical modularization blocker, the smallest
necessary change may be made, but it requires impact/alternative/rollback recording,
focused regression coverage and a user-confirmed post-deployment active payment
verification checklist. Cutover, settlement proof and legacy deletion remain
separately gated.  
**Details:** `AGENTS.md`, `docs/payments/clover-pos-integration-charter.md`,
`docs/payments/clover-pos-phase-plan.md`, compatibility register.

### 2026-09-03 — Central modularization worklog established

**PR/SHA:** current workspace `docs/payment-freeze-and-progress-policy`  
**State:** LOCAL  
**Result:** This chronological worklog was created from the existing Git history,
phase documents, dependency graph and compatibility records. Going forward, every
modularization code batch must append one new entry as part of the same change,
rather than reconstructing the timeline later from scattered documents.  
**Details:** this file and `AGENTS.md` section 19.

### 2026-09-03 — Phase 3 Slice 2B: POS Payment Benefits reservation boundary contraction

**PR/SHA:** PR #2139 / merge `6a022c8c`  
**State:** MERGED / CI GREEN  
**Result:** Unified Payment preparation now uses Benefits-owned narrow Points/Balance
and Coupon reservation contracts for HOLD/RELEASE instead of directly injecting
`LoyaltyService` / `MembershipService`. POS payment composition also wires the
Benefits public reservation module rather than the concrete Loyalty/Membership
modules, and Coupon HOLD no longer receives the internal User DB UUID. The measured
`payments-clover -> identity-customer-benefits` direct-import debt contracts from
17 to 13 with a matching architecture-baseline/guard update. The existing
transaction-bound COMMIT + Order creation sequence, production Web Clover behavior,
feature flags and Prisma schema/migrations remain unchanged; transaction-bound
COMMIT contraction is recorded as Slice 2C follow-up.  
**Details:** `docs/architecture/phase-3-catalog-pricing-offers.md`,
`docs/architecture/current-dependency-graph.md`,
`docs/payments/clover-pos-integration-charter.md`,
`docs/payments/clover-pos-phase-plan.md`.

### 2026-09-03 — Phase 3 Slice 3: Admin Catalog ownership contraction

**PR/SHA:** PR #2141 / merge `a29aae1d` (reviewed head `0fb3db83`)  
**State:** CI  
**Result:** Admin menu CRUD/read-model/application decisions moved into Catalog-owned
`CatalogAdminService` exposed through `menu/public-api.ts`; the legacy
`AdminMenuService` was deleted. Admin menu composition no longer owns Prisma or
Brand/Store configuration reads. Availability-affecting item updates, explicit item
availability and option availability remain in a narrow Admin orchestration service
that persists through Catalog and calls only the Uber public availability capability;
this temporary coordination is explicitly assigned to Slice 5. Removing two Admin
Prisma imports contracts `identity-customer-benefits -> runtime-data-ci-ops` from 21
to 19. A redundant local Prisma provider/import was removed from `PromotionsModule`
so the new Catalog persistence implementation does not raise
`catalog-pricing-offers -> runtime-data-ci-ops` above 10. A permanent scanner guard
prevents Admin menu Prisma ownership, the retired service, or Uber coordination from
moving into Catalog. Slice 2B was also updated to PR #2139 / `6a022c8c`; Slice 2C is
marked DEFERRED after its atomic-transaction readiness audit.  
**Details:** `docs/architecture/phase-3-catalog-pricing-offers.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/README.md`.

### 2026-09-03 — Phase 3 Slice 4: Offers -> Messaging boundary

**PR/SHA:** PR #2142 / merge `3629bc3b`  
**State:** CI  
**Result:** Coupon-triggered gift notification delivery now crosses the
Messaging/Notifications context only through `notifications/public-api.ts` and the
Messaging-owned `COUPON_ISSUED_NOTIFICATION` port. `CouponProgramTriggerService`
no longer injects the concrete `NotificationService` or passes Prisma User/
CouponProgram models across the boundary; it maps a narrow recipient/program
snapshot carrying only `userStableId` as user identity. Messaging resolves the
existing internal `MessagingSend.userId` audit relation from that stable identity
inside its own persistence boundary. `CouponsModule` likewise imports the
notification composition module only from the
public surface. The measured `catalog-pricing-offers -> messaging-notifications`
direct-import debt is contracted from 2 to 0 and its baseline allowance is removed,
so a future direct edge in that direction fails the central architecture gate. No
Prisma schema/migration, coupon issuance rules, notification timing/template/provider,
Web Clover or Uber runtime behavior is intentionally changed.  
**Details:** `docs/architecture/phase-3-catalog-pricing-offers.md`,
`docs/architecture/current-dependency-graph.md`.

### 2026-09-03 — Phase 3 Slice 5: Catalog availability / Uber orchestration contraction

**PR/SHA:** local branch `refactor/phase3-slice5-catalog-uber-availability`  
**State:** SOURCE  
**Result:** The temporary Admin-owned menu availability/Uber coordination from
Slice 3 is removed. Admin menu now consumes a public Catalog/Uber application
orchestration module instead of wiring `UberEatsModule` directly. Catalog owns a
narrow availability reader that projects menu-item publication intent,
suspend-until and fixed-component composition facts; Uber composition adapts that
reader into a narrow application query port, while Uber availability persistence no
longer reads `MenuItem` or `MenuOptionTemplateChoice` Prisma delegates and remains
DB-only for Uber store mappings / OpsTickets. The fixed-component Uber publication
capability guard moves out of `CatalogAdminService` into the orchestration layer,
while item/option availability persistence, best-effort Uber failure handling and
the Admin `storeId` compatibility response remain unchanged. Admin Web now uses the
public `SYNC_REQUESTED` status instead of stale internal `PENDING`. The central
scanner is tightened so the deleted Admin orchestration, direct Admin Uber wiring,
provider policy inside Catalog management, and direct Catalog Prisma reads from the
Uber availability adapter cannot return. Removing the old Admin logger import and
direct `UberEatsModule` wiring lowers `identity-customer-benefits ->
architecture-foundation` from 14 to 13 and `identity-customer-benefits ->
external-channels` from 2 to 1; replacement traffic uses public surfaces, so no new
debt pair is introduced. No Prisma schema/migration,
production Web Clover, Uber webhook/order state or wire-contract change is included.
Production verification remains pending after CI/deploy.  
**Next:** after Slice 5 active verification, perform Slice 5B to move Daily Special
management/persistence ownership from Catalog into Offers/Pricing before Phase 3
closeout.  
**Details:** `docs/architecture/phase-3-catalog-pricing-offers.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/README.md`.

## Current position

- Phase 1: closed.
- Phase 2: closed; historical Uber Test Store/sandbox cleanup is deferred to the
  separate Production Cutover Cleanup and is not Phase 2 debt.
- Phase 3: Slice 1, Slice 2, Slice 2B, Slice 3 and Slice 4 are merged; Slice 2C is
  **DEFERRED** after readiness review because the current Benefits COMMIT + Order
  creation atomic transaction has no safe Prisma-free cross-context replacement yet.
  Slice 5 is source-complete locally and pending user review/remote CI plus the
  required active Uber availability verification after deployment. Slice 5B is
  planned next to move Daily Special ownership from Catalog into Offers/Pricing
  before Slice 6 closeout.
- Payments/Clover: POS Terminal is pre-production and structurally available for
  modularization; production Web Ecommerce is guarded but may be touched when it is
  a documented critical blocker under the active-verification rule.

## Rule for future entries

For each modularization code batch, append exactly one chronological entry before
local review. The entry must include:

1. date;
2. Phase / Slice / work-package name;
3. PR number and reviewed SHA once available, otherwise the local branch/state;
4. concise description of the ownership/boundary/compatibility change;
5. measurable architecture effect when applicable (for example dependency debt or
   compatibility state change);
6. the highest status actually reached (`SOURCE`, `CI`, `DEPLOYED`, `VERIFIED`, or
   `CLOSED`);
7. links/paths to the detailed phase, dependency, compatibility, payment, migration,
   or verification documents.

When CI, deployment, or active verification happens after the source entry was
written, update that same entry's state/evidence rather than adding a misleading
second implementation entry. A later genuinely new slice gets a new entry.
