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

**PR/SHA:** PR #2145 / `6438f934`; verification fix PR #2148 / merge `bf82d40d`  
**State:** VERIFIED  
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
Active verification passed item permanent OFF/ON, temporary-today availability and
option OFF/ON with Uber HTTP 204 / SYNCED telemetry and no new OpsTicket. The final
ordinary item-edit check exposed a Web adapter tail: `handleSaveItem` serialized the
unchanged `isAvailable` value, so PR #2148 removed availability fields from ordinary
item PUT payloads and added a regression test. After deployment and hard refresh,
00:11:00/00:11:05 Toronto ordinary item PUTs returned 200 with zero
`uber.menu.item.availability.update` calls in the surrounding minute. Slice 5 is
production verified.  
**Next:** Slice 5B contracts Daily Special ownership from Catalog into Offers/Pricing
before Phase 3 closeout.  
**Details:** `docs/architecture/phase-3-catalog-pricing-offers.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/README.md`.

### 2026-09-04 — Phase 3 Slice 5B: Daily Special -> Offers ownership contraction

**PR/SHA:** PR #2153 / final CI head `71191389` / squash merge `d3316e45`  
**State:** PRODUCTION VERIFIED  
**Result:** Daily Special definition, persistence, store-time activation and effective
pricing move behind the narrow Offers-owned `DAILY_SPECIAL_OFFERS` capability, implemented
by the existing `PromotionsService` so the contraction adds no new Prisma direct edge.
`CatalogAdminService`, `PublicMenuService` and `OrdersService` no longer access the
`MenuDailySpecial` Prisma delegate; Catalog supplies only item stable-ID/base-price
facts, while an explicit `CatalogOffersMenuOrchestrationService` preserves the Admin
full-menu and Daily Special list/bulk-write contracts. Admin historical reads retain
base prices for soft-deleted items, while writes still validate only live Catalog
items. A dedicated `CatalogAdminModule` prevents the new HTTP-side Offers wiring from
expanding the Uber worker availability dependency surface. The central architecture
scanner now reserves `MenuDailySpecial` Prisma access exclusively for the Offers
service and prevents Daily Special policy from returning to Catalog or direct
persistence from returning to Public Menu/Orders. Catalog/Public Menu are also removed
from the Brand/Store migrated-config-consumer registry because StoreConfig timing now
belongs to `PromotionsService`, which remains registered there. No Prisma schema/migration, Admin
or Web transport contract, production Web Clover, or Uber runtime/wire behavior is
intentionally changed; direct dependency debt counts are expected to remain unchanged
because replacement traffic uses public owner/application surfaces.  
**CI evidence:** run #5055 passed Architecture, API/Web lint/build/strict/test gates on final head `71191389`.  
**Production verification:** on 2026-09-04, Admin Daily Special GET/bulk PUT returned 200, Public Menu regenerated and returned 200 with the expected special display, and checkout pricing quote returned 200 with the expected Daily Special price. The store was outside business hours, so a persisted order could not be created; the user explicitly accepted the successful checkout-pricing verification in place of an impossible off-hours order submission.  
**Next:** proceed to Slice 6 Phase 3 closeout.  
**Details:** `docs/architecture/phase-3-catalog-pricing-offers.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/README.md`.

### 2026-09-04 — Phase 3 Slice 6: public-contract cycle guard + contraction

**PR/SHA:** PR #2157; final PR head `8547b46c`; squash merge `b91afb6a`; guard commit `5ee0970d`  
**State:** PRODUCTION VERIFIED / CLOSED  
**Result:** Phase 3 closeout review found that the central scanner treated
`public-api`/`contracts`/`ports` traffic as approved but did not analyze those
approved edges as a directed graph. Static source inspection therefore exposed a
hidden `catalog-pricing-offers -> external-channels -> catalog-pricing-offers`
cycle across the Slice 5 availability orchestration and Uber Catalog reader wiring.
The scanner now builds the public-contract context graph and uses a Tarjan
strongly-connected-component check. Public pairs that still carry a registered
legacy direct-import allowance remain governed by the existing debt baseline;
otherwise public cycles are checked against the explicit contraction-only SCC
baseline, and removing a future direct allowance automatically brings that direction
under the cycle gate.
`--report` also exposes detected cycle components/edges. CI #5066's first Architecture
run then surfaced a pre-Slice-6 Catalog / Orders / Identity / Messaging public SCC.
That historical SCC is recorded in `legacyPublicCycleComponents` as explicit
contraction-only architecture debt rather than a compatibility waiver: its existing
members/edges may shrink, but any new member or internal edge fails the cycle gate.

The authorized contraction removes the reverse Uber -> Catalog edge instead of hiding
it. Catalog orchestration now passes publication intent and suspend-window facts into
the Uber public availability command; Uber menu wiring and both Uber runtime
compositions no longer import Catalog availability. Availability failure tickets
snapshot those facts for retries, while historical `{ isAvailable }` tickets retain
a narrow read-compat fallback. The source graph is therefore intended to retain only
`catalog-pricing-offers -> external-channels` for this availability coordination.
No dependency manifest, Prisma schema/migration, production Web Clover, Uber external
wire format, webhook/order state, or full-menu publication protocol is changed.  
**Validation:** local lint/build/test/scanner execution intentionally deferred under
repository workflow. GitHub Actions CI #5070 passed on final PR head `8547b46c`:
Architecture, API/Web lint/build, API/Web strict declaration checks, and API/Web tests
all passed. PR #2157 then merged to `dev` as `b91afb6a`. Post-deployment active
verification completed successfully for Uber-published item availability OFF -> ON,
temporary item suspension/recovery, and option availability OFF -> ON. Slice 6 is
therefore production verified and closed.  
**Details:** `docs/architecture/phase-3-catalog-pricing-offers.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/README.md`.

### 2026-09-04 — Phase 3 post-closeout tail: monotonic cycle baseline + Store pause codec

**PR/SHA:** PR #2160; final head `27b57f99`; squash merge `3a20c8c5`  
**State:** CI / MERGED  
**Result:** completed the two small governance tails recorded after Slice 6 without
reopening the closed Phase 3 scope. Brand/Store now owns the timed temporary-closure
reason codec (`buildAutoPauseReason` / `parseAutoPauseReason`) and exposes it through
`store/public-api.ts`; POS consumes that public owner surface and `StoreStatusService`
no longer imports POS internals. The exact persisted `__AUTO_UNTIL__` representation,
expiry CAS, POS broadcast and Uber store-status behavior are intentionally unchanged,
with focused codec characterization coverage added. This contracts
`brand-store -> store-operations-pos-print` direct debt from `1 -> 0` and removes the
allowance from `context-baseline.json`.

The architecture scanner now makes debt baselines monotonic: any observed reduction in
a numeric direct-import allowance fails until the same change lowers/removes that
allowance, and every `legacyPublicCycleComponents` baseline must exactly match the
current detected SCC contexts/internal public edges. A shrunk, split or removed SCC
therefore forces baseline contraction instead of leaving an obsolete superset that
could later authorize a restored edge. `--report` exposes stale SCC baselines as well.
No package/lockfile, Prisma schema/migration, HTTP contract, Web Clover path or Uber
runtime/wire behavior is changed. Initial GitHub Actions CI #5078 failed exactly at the
new stale-baseline guard and exposed seven pre-existing numeric allowances that had
already contracted in source; the follow-up normalized those baselines to the observed
counts and final GitHub Actions CI #5080 passed before merge. Runtime smoke verification
of POS timed pause -> Uber status -> manual recovery has not yet been recorded, so the
entry remains at CI/MERGED rather than VERIFIED.  
**Details:** `docs/architecture/phase-3-catalog-pricing-offers.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/README.md`,
`tools/architecture/context-baseline.json`.

### 2026-09-04 — Phase 4 planning baseline synchronized

**PR/SHA:** PR #2161; final head `a2841f00`; squash merge `83de9072`  
**State:** CI / MERGED  
**Result:** GitHub Actions CI #5083 passed for API and Web before merge. Synchronized
the post-Phase-3 architecture state and recorded the next
formal phase as **Phase 4 — Identity / Customer / Benefits + Messaging Boundary
Contraction**. The plan removes the former Store pause-codec Slice 0 item because PR
#2160 already closed that ownership edge, keeps Admin PromotionRule ownership as the
immediate Slice 0A readiness audit, and promotes the Catalog -> Orders `Channel`
public-cycle contraction audit to Slice 0B. Mainline Phase 4 then proceeds through Email
Verification ownership, Messaging delivery boundaries, Customer profile/address/consent,
Admin Members/Staff adapter contraction, Benefits implementation ownership, and final
dependency/SCC closeout. The normalized direct-debt baseline now records Identity /
Customer / Benefits at 65, Orders at 35, and POS at 31; the lower Orders/POS counts are
stale-baseline corrections rather than a reason to change the selected next owner phase.  
**Details:** `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`,
`docs/architecture/phase-3-catalog-pricing-offers.md`.

### 2026-09-04 — Phase 4 Slice 0A: Admin PromotionRule ownership contraction

**PR/SHA:** PR #2163; final head `849bdcfc`; squash merge `aa302629`  
**State:** PRODUCTION VERIFIED  
**Result:** moved PromotionRule management ownership out of the Admin adapter and behind
Offers-owned `PROMOTION_RULE_MANAGEMENT`. `PromotionRuleManagementService` now owns the
existing validation/default/calendar/channel/BOGO policy without Prisma; raw
PromotionRule list/get/create/update/soft-delete persistence is centralized through the
already-existing `PromotionsService` Prisma entry. `AdminPromotionsService` is deleted,
Admin Promotions no longer imports Prisma/Prisma-generated rule types, and the central
scanner prevents either path from returning. Focused tests characterize management
normalization/not-found behavior and prove the Admin DTO excludes persistence metadata.
The user explicitly authorized contraction of unused Admin response fields, so DB `id`,
`createdAt`, `updatedAt`, and `deletedAt` no longer cross the Offers boundary; the audited
Admin Web consumer did not declare or read them. Initial CI #5088's architecture gate
measured the true direct-import count at `16`, so the monotonic baseline/docs were
corrected from the locally estimated `14`. Direct debt contracts
`identity-customer-benefits -> runtime-data-ci-ops 18 -> 16`; Catalog -> Runtime remains
`10`, and the legacy public SCC is unchanged. No dependency manifest, Prisma
schema/migration, Web Clover behavior, Uber runtime/wire behavior, or PromotionRule
persistence schema changes are included. Final GitHub Actions CI #5092 passed the
architecture gate, API lint/build/strict/test, shared strict checks, and Web
lint/build/strict/test before merge. On 2026-09-04 the user actively completed Admin
PromotionRule create, edit, refresh and delete; production persistence evidence confirmed
the test rule was created/updated and then soft-deleted as `ENDED`, so the original 0A
ownership slice is production VERIFIED.  
**Details:** `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`.

### 2026-09-04 — Phase 4 Slice 0A verification hotfix: POS server-authoritative promotion pricing

**PR/SHA:** PR #2166; final head `567a1aba`; squash merge `bb833550`  
**State:** VERIFIED  
**Result:** active POS verification exposed a pre-existing pricing-preview gap: the Orders /
Offers engine already evaluated the active `in_store` same-item BOGO rule, but the POS
payment page displayed and collected against its own client-side subtotal/manual-discount/
tax calculation before order creation. Added an authenticated `POST /pos/orders/pricing/quote`
adapter through the existing `POS_ORDER_OPERATIONS` public boundary and made the POS
payment page consume the canonical Orders quote for automatic promotions, tax and order
total. The existing staff 5% / 10% / 15% / custom manual discount remains a separate
`POS_MANUAL_DISCOUNT`, keeps its current calculation/stacking behavior, and is included in
the same server quote. Cash collection/change, customer display, WeChat/Alipay conversion
and Clover Terminal start now share that displayed quote, and in-store confirmation is
blocked while pricing is refreshing or unavailable. By explicit follow-up authorization,
the POS payment adapter is also fixed to local `channel=in_store`: the staff UberEats
channel selector, local UberEats payment method, auto-switch effect and their conditional
legacy branches are removed; POS fulfillment remains `pickup` / `dine_in` while Uber orders
continue through the separate integration/import path. Focused tests cover same-item BOGO +
manual discount coexistence and authenticated store identity on the quote route. This adds
no new context edge or measured direct-import/SCC debt; Offers remains promotion-policy
owner and Orders remains order-pricing owner. No Prisma/dependency, Web Clover Ecommerce,
or Uber runtime/wire behavior change is included. Final GitHub Actions CI #5102 passed the
architecture gate, API lint/build/strict/test, shared strict checks, and Web
lint/build/strict/test before squash merge. On 2026-09-04 active production verification
confirmed the configured same-item BOGO appears in the POS server quote, the retained staff
manual discount stacks separately, and the completed order/payment amount matches the
checkout total. The hotfix is production VERIFIED.  
**Details:** `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`.

### 2026-09-04 — Phase 4 Slice 0B: PromotionRule channel ownership + Catalog -> Orders cycle contraction

**PR/SHA:** PR #2168; final head `739938c5`; squash merge `b2d42c32`  
**State:** VERIFIED  
**Result:** readiness audit confirmed the complete production Catalog/Offers -> Orders
public dependency was the two `@shared/order` `Channel` type imports used by PromotionRule
context selection. Promotion applicability is now owned by Offers as
`PromotionRuleChannel = 'web' | 'in_store'`; Orders exhaustively maps its broader order
channel set so Web/POS continue into PromotionRule context while `ubereats` maps to no
PromotionRule context. The authenticated Admin PromotionRule editor and owner validator
remove the historical Uber Eats applicability option. Before source changes, a read-only
production query found zero PromotionRule rows containing `ubereats`, so no data backfill,
Prisma schema change or migration is needed. Uber order ingestion remains separate and
continues to persist Uber-provided order amounts without invoking SanQ PromotionRule
pricing. Focused source tests characterize Web/In-store selection, reject the dead Admin
UberEats input, preserve existing POS BOGO + manual-discount coverage, and assert an
Orders UberEats quote does not call the PromotionRule reader. The two removed imports were
public traffic, so numeric direct-import debt remains unchanged; the public edge
`catalog-pricing-offers -> commerce-orders-fulfillment` disappears and the exact legacy
SCC contracts from Catalog/Orders/Identity/Messaging with five internal edges to
Catalog/Identity/Messaging with three. Orders -> Catalog remains as the intended one-way
pricing consumer dependency. Final GitHub Actions CI #5107 passed Architecture, API/Web
lint/build/strict/tests on final head `739938c5` before squash merge. On 2026-09-04 active
production verification confirmed: Admin exposes only Web/POS PromotionRule channels; POS
same-item BOGO and the retained manual discount both apply; Web PromotionRule pricing still
applies; and POS/Admin no longer expose UberEats PromotionRule selection. Slice 0B is
production VERIFIED. No local lint/build/test/scanner run is claimed under the repository
workflow.  
**Details:** `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`.

### 2026-09-04 — Phase 4 Slice 1: Email Verification ownership normalization

**PR/SHA:** PR #2171; final head `94955b27`; squash merge `afa1bff6`  
**State:** CI  
**Result:** moved email-verification challenge lifecycle, checkout proof-token handling and
verified `User.email` / `emailVerifiedAt` mutation from the Messaging `email/` area into an
Identity-owned `IDENTITY_EMAIL_VERIFICATION` capability. Messaging now exposes only the
narrow `EMAIL_VERIFICATION_DELIVERY` public capability backed by the existing EmailService
render/provider/MessagingSend path. The existing `/email/checkout/send-code` and
`/email/checkout/verify-code` routes are preserved under the Identity-owned controller.
Membership request/confirm now uses authenticated `userStableId` and no longer keeps email
verification inside the broad MembershipService; production Web Clover keeps the same
contact-proof decision but validates it through the Identity public contract rather than a
Messaging implementation. Payment amount/provider/order/reconciliation behavior is not
changed. The old Messaging verification service/controller are deleted, characterization
coverage moves with the owner and adds stable-ID member verification/account-mutation cases,
and the scanner prevents Messaging -> Identity imports or AuthChallenge/emailVerifiedAt
ownership from returning. Local monotonic baselines contract Identity -> Messaging `24 ->
22`, Identity -> Runtime `16 -> 15`, Payments -> Messaging `3 -> 2`, Messaging ->
Foundation `5 -> 4`, and Messaging -> Runtime `10 -> 9`; the final
Catalog/Identity/Messaging legacy public SCC is broken and
`legacyPublicCycleComponents` becomes empty. Final GitHub Actions CI #5116 passed the
architecture gate, API/Web lint/build/strict checks and tests before squash merge
`afa1bff6`. Per the Phase 4 rollout plan, deployment and active verification are deferred
to the consolidated Phase-end batch rollout.  
**Details:** `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`,
`tools/architecture/README.md`.

### 2026-09-04 — Phase 4 Slice 2A: Auth Challenge Messaging boundary contraction

**PR/SHA:** PR #2172; final head `29bf23b7`; squash merge `c8e91303`  
**State:** CI  
**Result:** introduced the Messaging-owned `AUTH_CHALLENGE_DELIVERY` public capability with
four explicit delivery operations for login 2FA SMS/email, phone-enrollment SMS and
membership-login SMS. Auth keeps OTP generation/hash, `AuthChallenge` persistence,
rate-limit/expiry/attempt state and session/MFA mutation; Messaging now owns messaging
configuration, OTP template rendering, `MessagingTemplateType.OTP`, provider dispatch and
the historical `login_2fa` / `admin_login` / `verify` / `login` purpose metadata. Known
User sends cross the boundary with `userStableId`; `SmsService` now supports stable-ID
relation linkage instead of requiring the User DB UUID. `AuthService` drops concrete
Email/SMS/BusinessConfig/TemplateRenderer imports and `AuthModule` replaces Email/SMS /
Messaging module wiring with the public delivery module; the two Notification imports
remain for registration welcome notifications outside 2A. The central scanner reserves
this shape and the local direct-debt baseline contracts Identity -> Messaging **22 -> 15**,
reducing total Identity outgoing direct debt **60 -> 53**. No dependency, Prisma schema /
migration, route, OTP-policy, session/MFA, provider-wire or payment behavior is changed.
No local lint/build/test/scanner run is claimed under repository workflow. Final GitHub
Actions CI #5120 passed Architecture, API/Web lint/build/strict checks and tests on final
head `29bf23b7` before squash merge `c8e91303`. This slice is not deployed separately;
production verification is deferred to the Phase 4 batch rollout after source closeout.  
**Details:** `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`,
`tools/architecture/README.md`.

### 2026-09-04 — Phase 4 Slice 2B: Phone Verification Messaging boundary contraction

**PR/SHA:** PR #2173; final head `d63bc307`; squash merge `41428324`  
**State:** CI  
**Result:** introduced the Messaging-owned `PHONE_VERIFICATION_DELIVERY` public capability
for generic/customer phone-verification SMS delivery. `PhoneVerificationService` remains the
Identity owner of phone normalization, IP/daily rate limits, `NON_ZERO_SIX_DIGIT` OTP,
`PHONE_VERIFICATION` hashing, `AuthChallenge` persistence, 10-minute expiry,
attempt/revoke/consume state, verification-token validation, `messagingSendId` linkage and
`sms_send_failed` behavior. Messaging now owns only Brand/Store messaging snapshot reads,
OTP template rendering, `MessagingTemplateType.OTP`, provider dispatch and MessagingSend
recording. Historical purpose semantics are preserved exactly: the template variable remains
fixed to `verify`, while caller purpose remains the Identity challenge purpose and Messaging
metadata. Phone Verification drops three concrete service imports and two concrete module
imports in favor of the Messaging public capability, contracting Identity -> Messaging
**15 -> 10** and total Identity outgoing debt **53 -> 48**. HTTP routes, Clover phone-proof
validation and AdminMembers' current PhoneVerificationService dependency are unchanged.
Focused characterization plus the central scanner reserve this split. No local
lint/build/test/scanner run is claimed under repository workflow. Final GitHub Actions CI
#5123 passed Architecture, API/Web lint/build/strict checks and tests on final head
`d63bc307` before squash merge `41428324`. This slice will not be deployed separately before
the consolidated Phase 4 rollout.  
**Details:** `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`,
`tools/architecture/README.md`.

### 2026-09-04 — Phase 4 Slice 2C: Admin Messaging boundary contraction

**PR/SHA:** PR #2174; final head `2c18e3c5`; squash merge `e27489cf`  
**State:** CI  
**Result:** removed Admin's four concrete Email dependencies by introducing two independent
Email/Messaging public capabilities rather than a generic Admin mail facade.
`STAFF_INVITE_DELIVERY` keeps staff invite creation/resend/revoke state in Identity/Admin and
delegates the existing `EmailService.sendStaffInviteEmail()` behavior, preserving
`ADMIN` / `STAFF` / `ACCOUNTANT` role inputs and current email-role wording.
`MEMBER_RECHARGE_EMAIL_DELIVERY` keeps member-contact matching, OTP generation/hash,
`AuthChallenge`, recharge-token verification and `messagingSendId` linkage in Admin Members,
while Messaging owns the existing bilingual subject/text/html,
`MessagingTemplateType.OTP`, `pos_recharge_otp` tag and provider/MessagingSend call. Recharge
email user linkage now crosses the context boundary with `userStableId` rather than internal
User DB UUID; the Identity-owned challenge relation remains internal. `AdminStaffController`,
`AdminModule`, `AdminMembersService` and `AdminMembersModule` no longer import concrete
`EmailService` / `EmailModule`, contracting Identity -> Messaging **10 -> 6** and total
Identity outgoing direct debt **48 -> 44**. Focused characterization and a central scanner
guard reserve the two capabilities, stable-ID linkage, invite forwarding, bilingual recharge
content and `email_send_failed` fallback. No dependency, Prisma schema/migration, HTTP route,
staff-invite state machine, recharge amount/authorization or provider protocol is changed.
No local lint/build/test/scanner run is claimed under repository workflow. Final GitHub
Actions CI #5126 passed Architecture, API/Web lint/build/strict checks and tests on final head
`2c18e3c5` before squash merge `e27489cf`. This slice will not be deployed separately before
the consolidated Phase 4 rollout.  
**Details:** `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`,
`tools/architecture/README.md`.

### 2026-09-04 — Phase 4 Slice 2D: Customer lifecycle notification boundary contraction

**PR/SHA:** PR #2175 / final head `a0fa3f85` / squash merge `0cb3ce11`  
**State:** CI GREEN / MERGED / AWAITING PHASE-END DEPLOYMENT  
**Result:** introduced the narrow Notifications-owned `CUSTOMER_LIFECYCLE_NOTIFICATION`
public capability for registration welcome and subscription welcome delivery. Auth keeps the
new-user decision, registration/session/account mutation and maps only stable customer facts;
Messaging no longer receives a Prisma `User` or User DB UUID for that path. Membership keeps
`marketingEmailOptIn` consent ownership and calls subscription delivery only after persisted
email + opt-in are both present; the existing `MARKETING_OPT_IN` coupon-program trigger still
runs afterward when welcome delivery is skipped. Messaging preserves registration `welcome`
template rendering, email-first/SMS fallback, `register_welcome` / `trigger=register` audit
metadata and the subscription `Subscription` / `SUBSCRIPTION_CONFIRM` mapping. Registration
email/SMS and subscription email now link MessagingSend by `userStableId`. Auth and Membership
services/modules use `notifications/public-api.ts`, contracting Identity -> Messaging
**6 -> 2** and total Identity outgoing direct debt **44 -> 40**. Focused characterization and
a central scanner guard reserve the stable-ID-only contract, fallback behavior and
Membership-owned consent gate. No dependency, Prisma schema/migration, HTTP route,
registration/session flow, marketing-consent API, coupon issuance behavior, provider wire or
notification-template meaning is changed. No local lint/build/test/scanner run is claimed
under repository workflow. Final GitHub Actions CI #5130 passed Architecture, API/Web
lint/build/strict checks and tests on final head `a0fa3f85` before squash merge `0cb3ce11`.
This slice will not be deployed separately before the consolidated Phase 4 rollout.  
**Details:** `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`,
`tools/architecture/README.md`.

### 2026-09-04 — Phase 4 Slice 2E-A: Retire historical AWS SNS / SQS infrastructure

**PR/SHA:** PR #2176 / final head `11f73e88` / squash merge `7746402b`  
**State:** CI GREEN / MERGED / AWAITING PHASE-END DEPLOYMENT  
**Result:** user-confirmed retired AWS SNS/SQS infrastructure is removed from runtime source.
The historical `/api/v1/webhooks/aws-sns` controller/service and raw-body route are deleted;
the remaining SES SQS bounce/complaint consumer is deleted from `EmailModule`; MessagingModule
no longer imports Prisma solely for the SNS webhook; compose removes `SNS_TOPIC_ARN`,
`SES_EVENTS_SQS_QUEUE_URL` and the historical `sanq-events` configuration-set binding; and the
unused `PRINT_SNS_TOPIC_ARN` Orders field is removed. `SesEmailProvider` and `AwsSmsProvider`
remain available, while SES configuration-set publishing becomes explicit opt-in. Current
SendGrid/Twilio webhook and suppression/audit persistence remain unchanged. Production read-only
evidence found no current SNS/`ORDER_PAID` MessagingWebhookEvent rows and no SNS API request hit
in the inspected logs beyond Nest route registration. The monotonic baseline contracts
Messaging -> Architecture **4 -> 3**, Messaging -> Runtime **9 -> 6**, and total Messaging
outgoing direct debt **14 -> 10**. A central retirement guard prevents the deleted SNS/SQS
runtime paths from returning. `@aws-sdk/client-sns`, `@aws-sdk/client-sqs` and `sqs-consumer`
remain temporarily as manifest-only dead dependencies because package/lockfile cleanup requires
a separate authorized pnpm update. EventBridge or another SES feedback channel is explicitly
deferred until AWS SES/SMS provider activation. No local lint/build/test/scanner run is claimed
under repository workflow. Final GitHub Actions CI #5132 passed Architecture, API/Web
lint/build/strict checks and tests on final head `11f73e88` before squash merge `7746402b`.
This slice will not be deployed separately before the Phase 4 consolidated rollout.  
**Details:** `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`,
`tools/architecture/README.md`.

### 2026-09-04 — Phase 4 Slice 2E-B: Orders event ownership + Loyalty paid-settlement inversion

**PR/SHA:** PR #2177; final head `dc07e820`; squash merge `718b2133`  
**State:** MERGED / CI #5137 GREEN / AWAITING PHASE-END DEPLOYMENT  
**Result:** the final Identity -> Messaging event tail is contracted without creating a reverse
Orders public dependency. `LOYALTY_ORDER_PAID_SETTLEMENT` exposes only `orderStableId`, reward
subtotal/redeem cents and promotion earn multiplier; `LoyaltyService` translates that stable ID to
existing internal Order/User persistence IDs and delegates to the established idempotent
`settleOnPaid` ledger transaction with historical failure isolation. `OrderEventsBus` moves from
Messaging to a private Orders implementation and remains the same-process Fulfillment/Uber Direct
fast path; it is not exported publicly. The old `LoyaltyEventProcessor` is deleted, Loyalty and
Orders drop `MessagingModule`, and Uber API/worker composition no longer carries a Messaging bus
bridge. The dead `emitPaidLifecycleEvent` ingestion policy is removed because the only production
consumer, Uber order import, always set it to false. Durable `OrderLifecycleOutboxProcessor`
ownership/replay is unchanged and protected by the new scanner guard. Direct debt contracts
Identity -> Messaging **2 -> 0**, Identity -> Runtime **15 -> 14**, Commerce -> Messaging
**8 -> 4**, External -> Messaging **2 -> 0**; totals become Identity **37**, Commerce **31**,
External **42**, Messaging **10**, with the public SCC baseline still empty. The existing
`LoyaltyLedger.orderId` UUID remains internal/deferred persistence debt; no schema/migration is
introduced. Focused characterization covers stable-ID translation, failure isolation, Orders paid
settlement payload/event preservation and Uber composition. No local lint/build/test/scanner run
was claimed under repository workflow. Final GitHub Actions CI #5137 passed Architecture,
API/Web lint/build/strict checks and tests on final head `dc07e820` before squash merge `718b2133`.
This slice will not be deployed separately before the Phase 4 consolidated rollout.  
**Details:** `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`, `apps/api/src/integrations/ubereats/ARCHITECTURE.md`,
`tools/architecture/context-baseline.json`, `tools/architecture/README.md`.

### 2026-09-04 — Phase 4 Slice 3: Customer Profile / Address / Consent ownership contraction

**PR/SHA:** PR #2178 / final head `73f7d2e1` / squash merge `e813d918`  
**State:** CI GREEN / MERGED / AWAITING PHASE-END DEPLOYMENT  
**Result:** the broad Membership surface no longer owns customer profile, address or marketing
consent mutations. The old standalone `MembershipOnboardingService` is retired and replaced by one
coherent `CustomerService` that owns onboarding, profile, shared birthday eligibility, address
CRUD/default selection and consent transitions without multiplying Nest/Prisma owner entry points.
Existing `/membership/onboarding`, `/membership/profile`, `/membership/marketing-consent` and
`/membership/addresses*` transport contracts remain unchanged; the controller delegates those
use cases to CustomerService. Consent continues to call the Messaging public lifecycle-delivery
capability and Benefits program trigger only after Customer-owned state decisions. Address access
uses `userStableId` -> internal user ID translation and preserves `addressStableId` externally.
Membership summary/coupon/ledger reads now require an existing stable-ID customer and no longer
create/update Users, consume PHONE_VERIFY challenges or bind phones as incidental read side effects.
Readiness data found stable IDs populated for 40/40 Users and 2/2 UserAddress rows, so no schema,
migration or backfill is needed. A central scanner boundary keeps the retired onboarding path and
Customer mutations out of MembershipService. Focused characterization covers onboarding/referral,
profile/birthday, consent, address ownership/default behavior and the existing-user-only summary
boundary. Numeric direct-import debt intentionally remains unchanged at Identity **37** with
Identity -> Messaging direct debt **0** and an empty public SCC baseline. No local lint/build/test
or scanner run is claimed under repository workflow; remote CI is deferred until user review. This
slice will not be deployed separately before the Phase 4 consolidated rollout.  
**Details:** `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`,
`tools/architecture/README.md`.

### 2026-09-05 — Phase 4 Slice 4A: Staff Administration ownership contraction

**PR/SHA:** PR #2179; final head `f235893e`; squash merge `f91a849e`  
**State:** MERGED / CI GREEN / AWAITING PHASE-END DEPLOYMENT  
**Result:** Staff account and invite business decisions move from `AdminStaffController` behind the
Identity-owned `STAFF_ADMINISTRATION` public port. Its framework-free contract carries only stable-ID
Staff DTOs/use cases; internal `StaffAdministrationService` owns ADMIN/STAFF list mapping, role/status
mutation, self-modification rejection, the existing last-active-admin invariant,
invite list/status and create/resend/revoke delivery orchestration while reusing AuthService's
existing invite lifecycle. The Admin controller retains guards, transport parsing,
delegation and dev-only invite URL formatting only; it no longer imports Prisma, Prisma-generated
role/status types or `STAFF_INVITE_DELIVERY`. The adapter/use-case call now carries the actor and
target as stable business IDs; inviter DB UUID resolution stays internal to Identity where the legacy
`UserInvite.invitedByUserId` relation still requires it. `AdminModule` drops its obsolete direct
Prisma provider and Staff invite delivery wiring; `AuthModule` composes the existing public delivery
module instead. Existing route/response behavior, AuthService invite role support (including the
currently UI-hidden ACCOUNTANT capability) and the non-atomic active-admin count/update behavior are
preserved. Characterization locks staff list mapping, self/last-admin guards, allowed demotion, invite
delivery, invite status and the existing 400/404 transport error mapping. The central scanner moves
the Phase 2C Staff delivery consumer from Admin to Identity and forbids Staff Prisma/delivery
ownership from returning to the Admin adapter. Static
production-import accounting contracts Identity -> Runtime **14 -> 12** and total Identity outgoing
**37 -> 35** while Identity -> Messaging direct debt stays **0** and the public SCC baseline stays
empty. No local lint/build/test/scanner execution was claimed under repository workflow. Final
GitHub Actions CI #5144 passed Architecture, API/Web lint/build/strict checks and tests on final head
`f235893e` before squash merge `f91a849e`. This slice will not be deployed separately before Phase 4
closeout.  
**Details:** `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`,
`tools/architecture/README.md`.

### 2026-09-05 — Phase 4 Slice 4B Stage 1: Customer + Security admin boundary contraction

**PR/SHA:** PR #2180 / merge `252cd26f` / final head `a2f52ddf`  
**State:** MERGED / CI GREEN / PHASE-END DEPLOYMENT PENDING — GitHub Actions CI #5150 passed  
**Result:** Customer/Admin profile mutation and address reads move behind the Customer-owned
`CUSTOMER_ADMINISTRATION` public contract implemented by the existing `CustomerService`; the broad
`AdminMembersService` no longer owns `UserAddress` reads or profile `User.update` persistence. The
historical Admin birthday override remains intentionally broader than customer self-service: Admin may
overwrite an existing birthday or clear year/month together without the customer minimum-age/
one-time-completion restriction, while existing year/month validation, contact uniqueness and phone-
verification reset behavior are preserved. Auth separately owns `ACCOUNT_SECURITY_ADMINISTRATION`, a
framework/Prisma-generated-free stable-ID capability whose internal service resolves the User DB UUID
inside Identity and performs Admin session list/revoke plus ACTIVE/DISABLED status mutation. The
combined Admin device response now takes sessions from that Auth owner while temporarily retaining the
legacy Membership trusted-device portion. `TrustedDevice.id` remains a browser-facing Prisma UUID and
is **not** added to the new Auth contract; its stable-ID expand-contract is deferred to 4B Stage 2 and
requires explicit schema/migration authorization. Orders/top-items remain 4C, recharge challenge/token
lifecycle remains 4D and Benefits/coupon/loyalty implementation remains Slice 5. Focused tests cover
Admin birthday override/clear, phone normalization/verification reset and stable-ID-scoped session/
status behavior. The central scanner reserves both owner contracts, prevents Customer profile/address
or Auth session/status persistence from returning to Admin, and prevents TrustedDevice from entering
the new account-security public boundary during Stage 1. Numeric direct-import debt is unchanged:
Identity -> Architecture **13**, Identity -> Runtime **12**, total Identity outgoing **35**, Identity ->
Messaging **0**, with an empty public SCC baseline. No local lint/build/test/scanner execution is
claimed under repository workflow; GitHub Actions remains deferred until user review.  
**Details:** `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`,
`tools/architecture/README.md`.

### 2026-09-05 — Phase 4 Slice 4B Stage 2: TrustedDevice stable-ID contraction

**PR/SHA:** PR #2181; final head `f2cbf835`; squash merge `060e9417`  
**State:** CI GREEN / MERGED / AWAITING PHASE-END DEPLOYMENT — CI #5153  
**Result:** `TrustedDevice` now owns required unique `trustedDeviceStableId @default(cuid())`. The new
additive migration deterministically/idempotently backfills legacy rows as
`c + substring(md5(id), 1, 23)`, checks NULL/duplicate discrepancies before tightening NOT NULL, and
adds the unique index. A read-only production precheck found **2** TrustedDevice rows and **2** distinct
predicted stable IDs. `ACCOUNT_SECURITY_ADMINISTRATION` now owns the complete member/Admin device
management read model, session revoke, stable-ID-scoped trusted-device revoke and session-derived label
lookup; `MembershipService` no longer accesses `UserSession`/`TrustedDevice`, and `AdminMembersService`
no longer performs the temporary Auth + Membership dual query. Browser/PWA responses expose explicit
`trustedDeviceStableId`; the historical `id` field remains as a compatibility alias carrying the same
stable ID, never the Prisma UUID, so cached bundles that read `id` remain compatible after refresh while
new Web code uses the explicit stable field. Existing HTTP route shapes are unchanged and Auth token
issuance/validation is not altered. The central architecture gate requires the stable field/migration,
owner delegation and Web stable-ID use, forbids device persistence from returning to Membership/Admin,
and rejects nondeterministic TrustedDevice backfill SQL. Numeric context debt remains unchanged at
Identity -> Architecture **13**, Identity -> Runtime **12**, Identity total **35**, Identity -> Messaging
**0**, with an empty public SCC baseline. No local migration application, Prisma validation, lint,
build, test or scanner execution is claimed under repository workflow; the migration SQL has not been
applied to any database.  
**Details:** `apps/api/prisma/schema.prisma`,
`apps/api/prisma/migrations/20260905134000_add_trusted_device_stable_id/migration.sql`,
`docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`,
`tools/architecture/README.md`.

### 2026-09-05 — Phase 4 Slice 4C: Orders member read boundary contraction

**PR/SHA:** local branch `refactor/phase4-slice4c-orders-member-reads`  
**State:** LOCAL SOURCE COMPLETE / REVIEW PENDING — Order schema + migration explicitly authorized  
**Result:** Orders now owns the Admin member order-history and top-purchased-item read models while
preserving the existing `/admin/members/:userStableId/orders` and `/top-items` routes, guards, roles,
response shapes, ordering, limit parsing, qualifying statuses, aggregation and display-name fallback.
`AdminMembersController`/`AdminMembersService` no longer own those handlers or query Order/OrderItem
persistence. The authorized additive migration adds nullable `Order.userStableId`, deterministically
backfills the **45** existing member-linked orders from `Order.userId -> User.userStableId`, verifies
member/populated counts, mismatches and orphan DB IDs, and adds the `(userStableId, createdAt)` index.
Normal Web/POS order creation, prepared-payment confirmation and Loyalty top-up synthetic orders now
dual-write the stable member identity. A narrow DB-ID-free `CUSTOMER_EXISTENCE_READER` preserves the
historical `404 member not found` distinction without Orders reading User persistence or receiving a
User DB UUID. `OrdersModule` also switches the historical Membership module import to
`membership/public-api`, contracting Commerce -> Identity direct debt **5 -> 4** and Commerce outgoing
**31 -> 30**; no Identity -> Orders public edge is introduced and the SCC baseline remains empty. The
central scanner reserves the migration/read-model/transport ownership and dual-write paths. The remaining
Admin loyalty-ledger `Order.id -> orderStableId` enrichment is explicitly deferred to **Slice 5A — Loyalty
ledger order identity contraction**, where Benefits/Loyalty should own a stable order identity snapshot
instead of extending Slice 4C. No local migration application, lint/build/test/scanner run is claimed under
repository workflow.  
**Details:** `apps/api/prisma/schema.prisma`,
`apps/api/prisma/migrations/20260905145500_add_order_user_stable_id/migration.sql`,
`docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`,
`tools/architecture/README.md`.

## Current position

- Phase 1: closed.
- Phase 2: closed; historical Uber Test Store/sandbox cleanup is deferred to the
  separate Production Cutover Cleanup and is not Phase 2 debt.
- Phase 3: **PRODUCTION VERIFIED / CLOSED** for the approved scope on 2026-09-04.
  Slice 6 merged through PR #2157 as `b91afb6a`, passed final CI #5070, and completed
  active Uber availability verification. Slice 2C remains **DEFERRED** because the
  current Benefits COMMIT + Order creation atomic transaction has no safe Prisma-free
  cross-context replacement yet; Phase 3 closure does not reclassify that deferred debt.
- Phase 3 post-closeout governance tail: PR #2160 merged as `3a20c8c5` after CI #5080
  passed. Store temporary-close encoding ownership and monotonic baseline/SCC guards are
  in `dev`; runtime pause/Uber smoke verification has not yet been recorded.
- Phase 4: **SLICE 0A + 0A POS HOTFIX + SLICE 0B PRODUCTION VERIFIED; SLICE 1 + 2A + 2B + 2C
  + 2D + 2E-A + 2E-B + 3 + 4A + 4B MERGED/CI; SLICE 4C LOCAL** on 2026-09-05. Slice 0A merged via PR #2163 / `aa302629`
  after CI #5092 and passed active Admin PromotionRule verification. The POS pricing hotfix
  merged via PR #2166 / `bb833550` after CI #5102 and passed active BOGO/manual-discount
  verification. Slice 0B merged via PR #2168 / `b2d42c32` after CI #5107 and active checks.
  Slice 1 merged via PR #2171 as `afa1bff6` after final head `94955b27` passed CI #5116 and
  removes the final legacy public SCC. Slice 2A merged via PR #2172 as `c8e91303` after final
  head `29bf23b7` passed CI #5120, contracting Identity -> Messaging `22 -> 15`. Slice 2B
  merged via PR #2173 as `41428324` after final head `d63bc307` passed CI #5123, contracting
  the baseline `15 -> 10`. Slice 2C merged via PR #2174 as `e27489cf` after final head
  `2c18e3c5` passed CI #5126, contracting `10 -> 6`. Slice 2D merged via PR #2175 as
  `0cb3ce11` after final head `a0fa3f85` passed CI #5130, contracting `6 -> 2`. Slice 2E-A
  merged via PR #2176 as `7746402b` after final head `11f73e88` passed CI #5132, contracting
  Messaging total outgoing debt `14 -> 10`. Slice 2E-B merged via PR #2177 as `718b2133` after
  final head `dc07e820` passed CI #5137, contracting the final direct Identity -> Messaging
  `2 -> 0`, returning OrderEventsBus to private Orders ownership and removing Uber's obsolete
  Messaging bridge while preserving the durable outbox. Slice 3 merged via PR #2178 as `e813d918`
  after final head `73f7d2e1` passed CI #5140; CustomerService now owns
  onboarding/profile/address/marketing-consent while the broad Membership read surface no longer
  performs implicit User/PHONE_VERIFY mutation. Slice 4A merged via PR #2179 as `f91a849e` after
  final head `f235893e` passed CI #5144; Staff persistence, invite orchestration and staff-account
  invariants now belong to Auth/Identity, contracting Identity -> Runtime `14 -> 12` and total
  Identity outgoing `37 -> 35`. Slice 4B Stage 1 merged via PR #2180 as `252cd26f` after final head
  `a2f52ddf` passed CI #5150; Stage 2 merged via PR #2181 as `060e9417` after final head `f2cbf835`
  passed CI #5153. TrustedDevice now owns its stable business identity and member/Admin device
  management is fully behind the Auth owner without exposing the Prisma UUID. Slice 4C is locally
  source-complete, moving member order-history/top-item reads into Orders and contracting Commerce ->
  Identity direct debt `5 -> 4` without adding an Identity -> Orders public edge. Per the current rollout plan, Slice 1 onward are not
  individually deployed; the accumulated Phase 4 changes will be deployed and actively verified
  together after source closeout.
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
