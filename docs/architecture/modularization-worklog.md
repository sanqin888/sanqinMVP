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
**State:** CI GREEN / MERGED; MIGRATION APPLIED / API ACTIVATION PENDING — CI #5153  
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
build, test or scanner execution was claimed during source delivery. During the consolidated Phase 4 rollout on
2026-09-05 this migration was successfully applied to production; read-only verification found **2/2** populated
and distinct stable IDs. The new API has not yet been activated because rollout paused on the following Order
migration.  
**Details:** `apps/api/prisma/schema.prisma`,
`apps/api/prisma/migrations/20260905134000_add_trusted_device_stable_id/migration.sql`,
`docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`,
`tools/architecture/README.md`.

### 2026-09-05 — Phase 4 Slice 4C: Orders member read boundary contraction

**PR/SHA:** PR #2182 / final head `7cb071ad` / squash merge `3119ce76`  
**State:** MERGED / CI GREEN; MIGRATION ATTEMPT FAILED / UUID RECOVERY PENDING — GitHub Actions CI #5158 passed  
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
**31 -> 30**; context-local `orders-prisma` / `membership-prisma` composition prevents the two new read
services from raising Commerce -> Runtime **10** or Identity -> Runtime **12**. No Identity -> Orders
public edge is introduced and the SCC baseline remains empty. The central scanner reserves the
migration/read-model/transport ownership and dual-write paths. The remaining
Admin loyalty-ledger `Order.id -> orderStableId` enrichment is explicitly deferred to **Slice 5A — Loyalty
ledger order identity contraction**, where Benefits/Loyalty should own a stable order identity snapshot
instead of extending Slice 4C. No local migration application was performed during source delivery; GitHub
Actions CI #5158 is the authoritative validation for the merged source. During the 2026-09-05 consolidated rollout,
the migration attempt failed and rolled back on the historical `Order.userId TEXT` / `User.id UUID` comparison;
the separate UUID-normalization recovery entry below records the approved remediation.  
**Details:** `apps/api/prisma/schema.prisma`,
`apps/api/prisma/migrations/20260905145500_add_order_user_stable_id/migration.sql`,
`docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`,
`tools/architecture/README.md`.

### 2026-09-05 — Phase 4 Slice 4D-A: Recharge challenge ownership contraction

**PR/SHA:** PR #2183; final head `cec141ba`; squash merge `07dc1206`  
**State:** MERGED / CI GREEN / AWAITING PHASE-END DEPLOYMENT (GitHub Actions CI #5162)  
**Result:** Identity/Auth now exposes the framework/persistence-free
`MEMBER_RECHARGE_VERIFICATION` capability and owns the existing `pos-recharge` member/contact
resolution, email `AuthChallenge` create/verify/consume lifecycle, MessagingSend linkage, SMS
`PhoneVerificationService` delegation, verification-token creation and atomic one-time token claim.
`AdminMembersService` no longer imports or mutates AuthChallenge state, the challenge engine, recharge
Email delivery or Phone Verification internals; it keeps the historical amount/token presence checks,
idempotency-key generation and post-claim `LoyaltyService.applyTopup()` orchestration. Email-first
contact selection, `NON_ZERO_SIX_DIGIT`, 10-minute expiry, current `OTP`/Phone Verification secret
semantics, attempts/revoke behavior, token expiry inheritance, `email_send_failed`/SMS result behavior
and token-claim-before-top-up ordering are preserved. Phone Verification's same-context challenge
imports use `challenge-engine.port/module` directly to avoid an Auth public barrel cycle. Production
read-only readiness evidence found only **2** historical `pos-recharge` challenges, both expired
`EMAIL_VERIFY/EMAIL/PENDING` rows with `userId` and no pending tokenHash row, so no schema/backfill is
required. The central scanner reverses the old Admin delivery guard and reserves the new owner while
forbidding Loyalty top-up ownership from moving into Auth. Numeric graph baselines remain unchanged:
Identity -> Architecture **13**, Identity -> Runtime **12**, Identity total **35**, Identity -> Messaging
**0**, Commerce -> Identity **4**, public SCC empty. Email/SMS send-limit unification,
recharge-specific OTP secret/randomness and POS `{ ok:false }` send UX are explicitly deferred to
**4D-H**. No local lint/build/test/scanner run is claimed under repository workflow.  
**Details:** `apps/api/src/auth/member-recharge-verification.contract.ts`,
`apps/api/src/auth/member-recharge-verification.service.ts`,
`apps/api/src/auth/member-recharge-verification.module.ts`,
`apps/api/src/admin/members/admin-members.service.ts`,
`docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`,
`tools/architecture/scan-architecture.mjs`, `tools/architecture/README.md`.

### 2026-09-05 — Phase 4 Slice 4D-H: Recharge verification security / UX hardening

**PR/SHA:** PR #2184; final head `4d850ba1`; squash merge `7853e4f9`  
**State:** MERGED / CI GREEN / AWAITING PHASE-END DEPLOYMENT; GitHub Actions CI #5165  
**Result:** The 4D-A Identity owner now fully owns both Email and SMS `pos-recharge` challenge creation,
verification and verification-token creation. SMS uses Messaging `PHONE_VERIFICATION_DELIVERY` only for
provider/template delivery instead of delegating challenge policy to `PhoneVerificationService`.
Recharge sends share one DB-backed per-member budget across both channels: one code per 60 seconds and
five code challenges per rolling 24 hours; token rows do not count because the limiter requires non-null
`codeHash`. New recharge codes use the new `MEMBER_RECHARGE` secret kind backed only by required
production config `MEMBER_RECHARGE_OTP_SECRET`; `main.ts` and the API compose environment fail closed
when that key is absent, while no secret value is committed. `NON_ZERO_SIX_DIGIT` now uses
`crypto.randomInt(100000, 1_000_000)`, preserving the visible 100000-999999 format and also hardening the
generic Phone Verification consumer of that format. POS now inspects the `send-code` `{ ok, error }`
result and enters `code-sent` only on success; provider failure stays on the current step and cooldown /
daily-limit responses receive bilingual staff-facing messages. Per explicit user direction, there is no
legacy-secret fallback: Phase-end rollout must temporarily pause POS member recharge, configure the new
secret, activate the new API/Web version, and only then resume recharge. No Prisma schema/migration,
dependency/lockfile, HTTP route, Loyalty amount/bonus/idempotency, token-claim, Clover or Uber change is
included. Numeric graph values remain unchanged; CI #5165 is the authoritative merged-source validation.  
**Details:** `apps/api/src/auth/challenge-engine.port.ts`,
`apps/api/src/auth/challenge-engine.service.ts`, `apps/api/src/auth/member-recharge-verification.service.ts`,
`apps/api/src/auth/member-recharge-verification.module.ts`, `apps/api/src/main.ts`, `docker-compose.yml`,
`apps/web/src/app/[locale]/(device)/store/pos/membership/page.tsx`,
`apps/web/src/app/[locale]/(device)/store/pos/membership/recharge-verification-hardening.test.ts`,
`tools/architecture/context-baseline.json`, `tools/architecture/scan-architecture.mjs`,
`tools/architecture/README.md`, `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`.

### 2026-09-05 — Phase 4 Slice 4D-I: Shared OTP challenge policy hardening

**PR/SHA:** PR #2185; final head `d4b85e3a`; squash merge `b27ad8ce`  
**State:** MERGED / CI GREEN / AWAITING PHASE-END DEPLOYMENT — GitHub Actions CI #5168  
**Result:** Identity now owns a shared DB-backed `OtpChallengePolicyService` for Login 2FA, Phone
Enrollment, Membership Login, Checkout, Email Verify, POS Recharge and generic Phone Verification.
`email_verify` TTL contracts from 24 hours to 10 minutes. Existing purpose contracts remain intact, while
repeated send policy is normalized: 60-second cooldowns where applicable, per-user/per-address hourly or
daily budgets, and a 30/hour IP spray budget for public membership-login/checkout flows. Successful
provider delivery makes the new code canonical and revokes superseded pending code rows; failed delivery
revokes only the new challenge so an older delivered code stays valid. Code-based verification uses the
ChallengeEngine five-attempt revoke behavior consistently. Generic Phone Verification drops its
process-local `Map`/timer limiter and unused Throttler module wiring. Messaging remains delivery-only; the
Auth challenge delivery result adds `ok/error` so Identity can distinguish provider failure before
supersession. The generic Phone Verification purpose surface is deliberately not narrowed in this slice.
No Prisma schema/migration, dependency/lockfile, Loyalty/Clover/Uber/Benefits ownership or context-import
baseline change is included. Central scanner/baseline now reserves the shared DB-backed policy and rejects
restoring process-local Phone Verification throttling. Per repository workflow no local lint/build/test /
scanner run was claimed before delivery; GitHub Actions CI #5168 is the authoritative merged-source validation.  
**Details:** `apps/api/src/auth/otp-challenge-policy.service.ts`,
`apps/api/src/auth/otp-challenge-policy.module.ts`, `apps/api/src/auth/auth.service.ts`,
`apps/api/src/auth/email-verification.service.ts`, `apps/api/src/phone-verification/phone-verification.service.ts`,
`apps/api/src/auth/member-recharge-verification.service.ts`,
`apps/api/src/messaging/auth-challenge-delivery.service.ts`,
`apps/api/src/messaging/contracts/auth-challenge-delivery.contract.ts`,
`tools/architecture/context-baseline.json`, `tools/architecture/scan-architecture.mjs`,
`tools/architecture/README.md`, `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`.

### 2026-09-05 — Phase 4 Slice 5A: Loyalty ledger order identity contraction

**PR/SHA:** PR #2186 / final head `3b904dd1` / squash merge `c28df1b5`  
**State:** MERGED / CI GREEN / AWAITING PHASE-END DEPLOYMENT — GitHub Actions CI #5171  
**Result:** The authorized expand step adds nullable `LoyaltyLedger.orderStableId` beside the existing
internal UUID `orderId`. Production read-only readiness data contained **91** ledger rows: **89** order-linked
rows covering **44** Orders, with **0** orphan Order IDs and **0** stable-ID mapping mismatches; the remaining
**2** rows were legitimate manual no-order adjustments. Twenty-one Orders already had multiple ledger rows
(maximum six), so the stable identity is intentionally not unique. The migration deterministically backfills
`orderId -> Order.id -> Order.orderStableId` and fails on incomplete population, mismatches, orphan Order IDs
or stable-without-DB-ID anomalies; it adds no FK/index/NOT NULL/unique constraint and preserves the existing
`(orderId, type, sourceKey)` internal idempotency key. All order-linked ledger creates dual-write both
identities inside their existing transactions; the ordinary Web/POS create path preallocates the stable ID
before its Loyalty writes, while payment COMMIT, settlement, refund, amendment and top-up paths reuse their
already-known stable identity. `LOYALTY_LEDGER_READER` is now the Benefits/Loyalty-owned read surface and
returns persisted `orderStableId` directly. Admin Members and Membership delegate their existing ledger views
to that owner and no longer perform `Order.id -> orderStableId` enrichment. Loyalty Prisma composition is
collapsed through `loyalty-prisma.ts`, contracting Identity -> Runtime **12 -> 10** and total Identity direct
debt **35 -> 33** without introducing a new public edge; the public SCC baseline stays empty. The adjacent
Orders/print ledger-by-DB-ID reads are deliberately left for a later Benefits read-ownership contraction.
No dependency/lockfile, public route shape, payment amount/state, coupon COMMIT ownership, Clover/Uber wire,
order lifecycle or outbox behavior is changed. The migration remains unapplied in production. CI #5171 passed
Prisma generation, Architecture baseline/SCC gate, API/Web lint/build/strict checks and tests before merge.  
**Details:** `apps/api/prisma/schema.prisma`,
`apps/api/prisma/migrations/20260905193000_add_loyalty_ledger_order_stable_id/migration.sql`,
`apps/api/src/loyalty/loyalty-ledger-read.contract.ts`,
`apps/api/src/loyalty/loyalty-ledger-read.service.ts`, `apps/api/src/loyalty/loyalty-prisma.ts`,
`apps/api/src/loyalty/loyalty.service.ts`, `apps/api/src/orders/orders.service.ts`,
`apps/api/src/admin/members/admin-members.service.ts`, `apps/api/src/membership/membership.service.ts`,
`tools/architecture/context-baseline.json`, `tools/architecture/scan-architecture.mjs`,
`tools/architecture/README.md`, `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`.

### 2026-09-05 — Phase 4 Slice 6 readiness audit + Slice 5B identification

**PR/SHA:** local branch `audit/phase4-slice6-closeout` based on `origin/dev@c28df1b5`  
**State:** LOCAL / READINESS AUDIT COMPLETE / SOURCE CLOSEOUT NOT YET READY  
**Result:** Re-audited the final post-5A Phase 4 dependency and ownership state without changing application
source. Slice 5A's final head `3b904dd1` already passed CI #5171 including the monotonic Architecture gate, so
the current numeric baselines are exact and `legacyPublicCycleComponents` remains correctly empty. The former
Admin/Membership `LoyaltyLedger.orderId -> Order.id -> orderStableId` enrichment is fully gone. The audit found
exactly two remaining production `LoyaltyLedger` reads outside the Benefits owner: Orders order-detail/public-
summary loyalty usage and POS/receipt print balance-paid projection. Both are read-only post-order projections
and can safely move behind a stable-ID-only Benefits `LOYALTY_ORDER_USAGE_READER`; this is recorded as required
Slice 5B before source closeout. Because 5B introduces the first normal lookup by
`LoyaltyLedger.orderStableId`, a non-unique query-support index is now justified and must be added in a **new**
additive migration after fresh schema/migration authorization rather than rewriting the merged 5A migration.
The audit also records `MembershipService.getMemberSummary()` as explicit post-Phase-4 composite read-model debt:
it still reads Order/OrderItem persistence and deep-imports an Orders-internal type, but replacing that with a
new Identity -> Orders public reader while Commerce already consumes Identity would recreate a public SCC.
Phase 3 Slice 2C remains DEFERRED because Points/Balance COMMIT, Coupon COMMIT and Order creation still share one
Prisma transaction and the current Loyalty/Coupon commit implementations consume that transaction client.
Read-only production migration history confirms none of the three accumulated Phase 4 migrations (TrustedDevice,
Order.userStableId, LoyaltyLedger.orderStableId) has been applied yet. `MEMBER_RECHARGE_OTP_SECRET` remains a
rollout prerequisite; its secret value/presence was not inspected. This batch updates documentation only; no
schema, migration, scanner baseline, dependency, business source or runtime behavior is changed.  
**Details:** `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`, `docs/architecture/modularization-worklog.md`,
`tools/architecture/context-baseline.json`, `tools/architecture/scan-architecture.mjs`.

### 2026-09-05 — Phase 4 Slice 5B: Loyalty order-usage read ownership contraction

**PR/SHA:** PR #2187 / final head `42891cf4` / squash merge `0f58cf83`  
**State:** MERGED / CI GREEN / AWAITING PHASE-END DEPLOYMENT — PR CI #5174 + dev push CI #5175  
**Result:** Implemented the safe Benefits read tail identified by the Slice 6 readiness audit. Benefits/Loyalty
now exposes `LOYALTY_ORDER_USAGE_READER`, a framework/Prisma-free stable-ID contract that accepts only
`orderStableId` and returns `balancePaidCents` plus `pointsEarned`. Its owner implementation reads
`LoyaltyLedger.orderStableId` directly and preserves the existing balance/points projection semantics. Orders
order-detail/public-summary and POS/receipt/email print payloads no longer read `LoyaltyLedger` persistence or
translate the stable Order identity back to a DB UUID. Implementation review also found and contracted the
legacy Web external-payment reconstruction helper that passed `Order.id` to
`LoyaltyService.getSettledBalancePaymentCentsForOrder()`; that obsolete DB-ID read helper is deleted, while
refund rollback/idempotency mutation deliberately keeps its existing internal UUID path. The authorized Prisma
change adds non-unique `@@index([orderStableId])` through a new additive
`20260905204500_add_loyalty_ledger_order_stable_id_index` migration; 5A migration history is untouched and no
FK/NOT NULL/unique constraint is added. The scanner now requires the owner reader/index and forbids direct
LoyaltyLedger Prisma reads from Orders/Print. Production-source search finds LoyaltyLedger persistence access
only inside the Loyalty owner. Numeric context-import counts remain unchanged because Commerce already consumed
Loyalty's public direction. Final head CI #5174 and merged-dev CI #5175 both passed Prisma generation, the
Architecture baseline/SCC gate, API/Web lint/build/strict checks and tests; the public SCC baseline remains empty.
The migration remains unapplied in production.  
**Details:** `apps/api/src/loyalty/loyalty-order-usage-read.contract.ts`,
`apps/api/src/loyalty/loyalty-order-usage-read.service.ts`,
`apps/api/prisma/migrations/20260905204500_add_loyalty_ledger_order_stable_id_index/migration.sql`,
`apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/print-pos-payload.service.ts`,
`tools/architecture/context-baseline.json`, `tools/architecture/scan-architecture.mjs`,
`tools/architecture/README.md`, `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`.

### 2026-09-05 — Phase 4 Slice 6: final dependency/SCC source closeout

**PR/SHA:** PR #2188 / final head `3d9e6821` / squash merge `74188a5c`  
**State:** MERGED / CI GREEN — PHASE 4 SOURCE GRAPH CLOSED; CONSOLIDATED DEPLOYMENT STARTED — CI #5176  
**Result:** Re-audited the exact post-5B source after PR #2187. Final head `42891cf4` passed PR CI #5174 and
squash merge `0f58cf83` passed dev push CI #5175; both runs passed the monotonic Architecture baseline/SCC gate.
Final direct-debt totals remain Payments **59**, External **42**, Identity **33**, POS/Print **31**, Commerce
**30**, Accounting **25**, Catalog **15**, Messaging **10**, Brand/Store **8**, with
`legacyPublicCycleComponents: []`. Source search confirms all direct `LoyaltyLedger` Prisma reads are now inside
Loyalty and the retired `orderStableById` / `getSettledBalancePaymentCentsForOrder` DB-ID read paths are absent.
No additional safe Phase 4 contraction was identified. `MembershipService.getMemberSummary()` remains the visible
Identity -> Commerce = 1 composite read-model deferral because a new reverse Orders public edge would recreate an
SCC; Phase 3 Slice 2C remains transaction-deferred because Points/Balance COMMIT, Coupon COMMIT and Order creation
share one Prisma transaction; Loyalty paid-settlement/refund Order lookups remain part of the intentionally retained
internal DB-ID idempotency model. Production migration history still shows none of the four accumulated Phase 4
migrations applied, and `MEMBER_RECHARGE_OTP_SECRET` remains a rollout prerequisite whose presence was not
inspected. Slice 6 changes documentation only: no business code, schema, migration, scanner logic, dependency or
numeric allowance is changed. The next step after review/merge of this closeout record is consolidated Phase 4
deployment readiness, migration/secret preflight, deployment and active verification.  
**Details:** `docs/architecture/phase-4-identity-customer-benefits-messaging.md`,
`docs/architecture/current-dependency-graph.md`, `docs/architecture/modularization-worklog.md`,
`tools/architecture/context-baseline.json`, `tools/architecture/scan-architecture.mjs`.

### 2026-09-05 — Phase 4 rollout recovery: Order.userId UUID normalization

**PR/SHA:** PR #2190 / final head `8392e42f` / squash merge `ccf0aee9`  
**State:** PRODUCTION VERIFIED / CLOSED — PR CI #5182 + dev push CI #5183  
**Result:** Consolidated Phase 4 migration deploy successfully applied
`20260905134000_add_trusted_device_stable_id`, then failed on
`20260905145500_add_order_user_stable_id` with PostgreSQL `42883` because production stores the retained internal
`Order.userId` as `TEXT` while `User.id` is `UUID`. The failed migration transaction rolled back. Read-only
production checks found **45/45** non-null Order user IDs are canonical UUID text, all **45/45** map to `User.id`,
with **0** non-UUID and **0** unmatched values; TrustedDevice stable IDs are populated/unique **2/2**. Rather than
rewriting the failed migration history, this recovery adds ordered prerequisite
`20260905144000_normalize_order_user_id_uuid`, changes Prisma `Order.userId` to `String? @db.Uuid`, validates
existing text before converting with `USING "userId"::uuid`, and leaves the original 14:55 stable-ID migration
untouched. No FK, NOT NULL, delete behavior, public contract, order-write behavior, dependency direction or SCC
baseline changes are introduced. Characterization and architecture gates reserve the UUID storage contract and
the separate normalization migration. Production then marked the failed 14:55 attempt rolled back and successfully
applied 14:40 UUID normalization, retried 14:55 Order stable-ID backfill, 19:30 Loyalty stable-ID backfill and 20:45
Loyalty stable-ID index before activating the new API/Web/Uber worker. Read-only verification confirmed
`Order.userId` is UUID, **45/45** member Orders have matching `userStableId` with **0** orphan/mismatch, and
LoyaltyLedger has **89/89** order-linked stable IDs with **0** orphan/mismatch while **2** manual no-order rows remain
NULL.  
**Details:** `apps/api/prisma/schema.prisma`,
`apps/api/prisma/migrations/20260905144000_normalize_order_user_id_uuid/migration.sql`,
`apps/api/src/orders/order-user-stable-id.characterization.spec.ts`, `tools/architecture/context-baseline.json`,
`tools/architecture/scan-architecture.mjs`, `docs/architecture/id-inventory.md`,
`docs/architecture/phase-4-identity-customer-benefits-messaging.md`, `docs/architecture/current-dependency-graph.md`.

### 2026-09-05 — Post-Phase-4 POS Order Management historical-query hotfix

**PR/SHA:** local branch `fix/pos-order-management-history-query` from latest `origin/dev`  
**State:** LOCAL / SOURCE REVIEW PENDING  
**Result:** Phase 4 active verification exposed an unrelated POS Order Management defect: the page advertised
full historical filtering but loaded only `fetchRecentOrders(30)` and applied date/status/channel/fulfillment/amount
filters in the browser. Read-only production evidence showed **2469** store Orders still present; the 30th newest
Order was 2026-09-03 18:38 and the 31st was 18:26, exactly explaining why earlier history appeared missing. The
hotfix preserves `recent` and board semantics, adds an Orders-owned paginated `searchForStore` capability through
the existing `POS_ORDER_OPERATIONS` boundary, validates/query-pushes the existing filters server-side, and pages at
50 rows. The Web Order Management page now defaults/reset to the **current store-local day**, converts calendar-day
boundaries to UTC with DST-aware timezone logic, and lets staff page through full history or select a historical
date without downloading all Orders. No Prisma schema/migration, dependency, payment/refund rule, Uber wire flow,
context direction, numeric architecture baseline or SCC allowance changes.  
**Details:** `apps/api/src/orders/pos-order-operations.contract.ts`, `apps/api/src/orders/orders.service.ts`,
`apps/api/src/pos/pos-orders.controller.ts`, `apps/web/src/lib/api/pos.ts`,
`apps/web/src/app/[locale]/(device)/store/pos/orders/page.tsx`, `apps/web/src/lib/time/tz.ts`,
`docs/architecture/phase-4-identity-customer-benefits-messaging.md`, `docs/architecture/current-dependency-graph.md`.

### 2026-09-05 — Phase 5 Slice 0: Orders/Fulfillment readiness + characterization

**PR/SHA:** PR #2193; final head `a8be129b`; squash merge `07311f74`  
**State:** MERGED / CI GREEN — TEST/DOCS ONLY; NO RUNTIME BEHAVIOR MOVED. Merged dev CI #5194 passed.  
**Result:** Opened Phase 5 with a read-only ownership/event audit plus focused characterization before any
Commerce/Orders/Fulfillment implementation movement. Existing coverage already locks quote, Web/POS create,
status/ready notifications, full refund, preparation/outbox and most durable print behavior. Slice 0 adds direct
characterization for confirmed-payment finalization (Points/Balance COMMIT + Coupon COMMIT + `Order.create()` in the
same transaction, immutable prepared snapshot and idempotent existing-Order return), `createAmendment()` validation/
transactional item+total mutation, Uber Direct request/response mapping and DB-UUID rejection, the guarded
`paid -> making` private `prep_started` fast path, and exact sequential AUTO PrintJob deduplication behavior.
The production Orders tree is inventoried for direct persistence and concrete dependencies: cross-owner persistence
still reaches Catalog `MenuItem`, Customer `User`/`UserAddress`, Benefits `LoyaltyAccount`, payment/checkout
`CheckoutIntent`, provider `UberOrderItemModifier`, and the durable lifecycle's `PosPrintJob` existence probe;
`OrdersService` still imports concrete Loyalty, Membership, Uber Direct, Location, Notification and Email services,
with `FulfillmentProcessor` also importing Uber Direct directly. The event audit found no current source path that
intentionally sends one successful preparation transition through both the private fast path and durable outbox:
manual/POS making emits only the private bus, while durable accepted activation writes `making + prep_started` in
one transaction without emitting that bus, and durable print materialization requires no existing AUTO job. Two
later hardening debts are recorded without runtime changes: a theoretical concurrent `PosGateway.sendPrintJob()`
socket-emission race after the unique AUTO upsert, and Uber Direct provider-success/DB-write crash durability. Direct
debt counts and the empty SCC baseline are unchanged. No schema/migration, dependency, public contract,
active/closed compatibility path, architecture baseline or provider behavior changed; the compatibility review queue
only removes the now-resolved EventEmitter/outbox candidate without assigning a `compat_id`. No local lint/build/test
is claimed per repository workflow.  
**Details:** `docs/architecture/phase-5-commerce-orders-fulfillment.md`,
`docs/architecture/current-dependency-graph.md`, `docs/architecture/active-compatibility-register.json`,
`docs/architecture/active-compatibility-register.md`, `apps/api/src/orders/orders-payment-finalization.characterization.spec.ts`,
`apps/api/src/orders/orders-amendment.characterization.spec.ts`, `apps/api/src/deliveries/uber-direct.service.spec.ts`,
`apps/api/src/orders/orders.service.spec.ts`, `apps/api/src/pos/pos.gateway.spec.ts`.

### 2026-09-05 — Phase 5 Slice 1A: POS cash payment-summary snapshot readiness

**PR/SHA:** PR #2194; head `a6abb191`; merge `db7a1de9`  
**State:** MERGED / PR CI GREEN — CI #5195 passed; NO LIFECYCLE OR PRINT-TRIGGER CUTOVER IN 1A ITSELF  
**Result:** Post-Slice-0 tracing showed current POS first print is still triggered by the browser through `/pos/orders/:orderStableId/print`, which is semantically an `order.reprint` / `REPRINT:<timestamp>`, followed by a separate `advanceOrder()` to `making`. Before that path can converge on durable `order.accepted -> order.prep_started -> AUTO`, the cash receipt's `cashReceivedCents` / `cashChangeCents` must be recoverable without the browser. Slice 1A adds optional `cashReceivedCents` to the shared CreateOrder contract and sends it only on POS cash creation. Orders accepts it only for authenticated in-store CASH orders, validates the amount against the server-calculated remaining cash tender, preserves the existing POS upward-to-5-cent cash collection rule, derives change server-side, and stores only `{ cashReceivedCents, cashChangeCents }` in the existing `Order.paymentBreakdownJson`. It deliberately does not write in-store `externalCents`, so current Web external-payment/refund reconstruction and in-store refund semantics are unchanged. `Order.totalCents`, tax, promotions, Benefits settlement, Order status and paid/making transitions remain unchanged. `PrintPosPayloadService` now recovers those persisted cash receipt facts into the same top-level payload fields already understood by the Windows printer agent; the existing transient `/print` cash fields remain usable by older PWA bundles until Slice 1B removes the first-print browser orchestration. Focused tests cover server-derived change with an exact Order total that requires 5-cent cash rounding, insufficient-cash rejection, and persisted print-payload recovery. No Prisma schema/migration, dependency, architecture allowance/SCC, Clover/Web Ecommerce provider path, Uber runtime, PrintJob kind or printer protocol change is included. No local lint/build/test is claimed per repository workflow.  
**Details:** `libs/order/contracts.ts`, `apps/web/src/app/[locale]/(device)/store/pos/payment/page.tsx`, `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/print-pos-payload.service.ts`, `apps/api/src/pos/dto/print-pos-payload.dto.ts`, focused specs, `docs/architecture/phase-5-commerce-orders-fulfillment.md`, `docs/architecture/current-dependency-graph.md`.

### 2026-09-05 — Phase 5 Slice 1B: POS ordinary checkout durable lifecycle cutover

**PR/SHA:** PR #2195; final head `c8ed5579`; squash merge `e4a783a5`  
**State:** MERGED / PR CI GREEN — CI #5200 passed; CONTROLLED POS CUTOVER; RUNTIME VERIFICATION DEFERRED TO PHASE 5 CLOSEOUT  
**Result:** Replaced the ordinary in-store POS browser-owned first-print/status choreography with the existing durable Orders lifecycle. Authenticated `channel=in_store` creation now appends `orders.lifecycle/order.accepted` in the same Prisma transaction as the paid Order, using `order.accepted:<orderStableId>` with `skipDuplicates`. After that transaction returns, `PosOrderOperationsService` asks the existing `OrderLifecycleOutboxProcessor` to drain immediately; the normal 500 ms poll remains restart/failure recovery. The same consumer activates the Order through `OrderPreparationService`, which writes `status=making + durable order.prep_started` atomically, then durable Fulfillment materializes the unique `AUTO` PrintJob. `FulfillmentProcessor` distinguishes durable vs same-process origin so durable in-store prep can print while a non-durable in-store status event remains non-printing, preventing a second initial-print mechanism. The POS payment page no longer calls `printOrderCloud()` or `advanceOrder()` after creation; source regression coverage locks that contraction. If staff hit `/advance` during the brief `in_store + paid` window, POS routes that case through the same store-scoped durable preparation capability instead of the generic direct state transition; only later states such as `making -> ready` keep the normal advance path. Explicit operator reprint and later staff advancement remain available through their existing routes. The user explicitly authorized no old-PWA compatibility. Under the repository-wide verification cadence adopted on 2026-09-06, this Slice no longer carries a standalone production active-test gate; its POS lifecycle/printing/PWA behaviors are accumulated into the consolidated Phase 5 closeout verification plan. No active compatibility record, Prisma schema/migration, dependency, context graph/SCC allowance, Web Clover Ecommerce, POS Clover Terminal, Uber provider behavior, pricing, Benefits COMMIT or refund semantics changed.  
**Details:** `docs/architecture/phase-5-commerce-orders-fulfillment.md`, `docs/architecture/current-dependency-graph.md`, `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/pos-order-operations.service.ts`, `apps/api/src/orders/processors/order-lifecycle-outbox.processor.ts`, `apps/api/src/orders/processors/fulfillment.processor.ts`, focused API/Web specs, and the POS payment page.

### 2026-09-05 — Phase 5 Slice 1C: Web/local durable lifecycle convergence

**PR/SHA:** PR #2196; final head `3dc21e5d`; squash merge `61f5917d`  
**State:** MERGED / PR+DEV CI GREEN — PR CI #5204 and merged-dev CI #5205 passed; RUNTIME VERIFICATION DEFERRED TO PHASE 5 CLOSEOUT  
**Result:** Preserves Web payment success as `Order(status=paid)` with no automatic acceptance, and moves the existing store-side auto/manual acceptance decision behind a durable Orders lifecycle command. `PosOrdersService.advance()` now routes `channel=web + status=paid` to the narrow `PosOrderOperationsPort.acceptWebOrder()` capability. `OrderPreparationService.acceptWebOrderByStableId()` locks the store-scoped Web Order and appends idempotent `order.accepted`. For IMMEDIATE Web orders, after that acceptance transaction commits `PosOrderOperationsService` synchronously invokes the same idempotent store-scoped preparation materializer used by durable replay, so `making + order.prep_started` are committed before `/advance` rereads the Order; the accepted-event 500 ms scan remains crash/restart recovery if eager preparation is interrupted. Once prep_started exists, the lifecycle outbox is eagerly woken for AUTO materialization. SCHEDULED Web orders remain paid/accepted until the existing `prepStartAt` scheduler activates them and are not eagerly printed. The generic POS status route also redirects Web `paid -> making` and retained in-store `paid -> making` into their durable commands, preventing a transport bypass back to the memory prep fast path. `FulfillmentProcessor` now permits first AUTO printing for Web/in-store only from durable origin; same-process memory prep no longer prints those local channels. The private prep bus and `order.paid.verified` remain because provider/legacy and Uber Direct durability work are later slices. Existing Web create characterization still proves payment/create itself does not append accepted. No production Clover charge/session/finalization/refund behavior, Uber runtime, Prisma schema/migration, dependency manifest, PrintJob contract, architecture allowance, direct-debt count or SCC baseline changes. Under the 2026-09-06 Phase-level verification cadence, Web acceptance/scheduling/AUTO-print behavior is retained as Phase 5 closeout verification scope rather than a standalone Slice deployment gate. No local lint/build/test is claimed per repository workflow.  
**Details:** `docs/architecture/phase-5-commerce-orders-fulfillment.md`, `docs/architecture/current-dependency-graph.md`, `apps/api/src/orders/order-preparation.service.ts`, `apps/api/src/orders/pos-order-operations.contract.ts`, `apps/api/src/orders/pos-order-operations.service.ts`, `apps/api/src/pos/pos-orders.service.ts`, `apps/api/src/orders/processors/fulfillment.processor.ts`, focused specs and POS transport architecture coverage.

### 2026-09-06 — Modularization governance: Phase-level active verification cadence

**PR/SHA:** PR #2197; final head `04a4a5ed`; squash merge `9a338704`  
**State:** MERGED / PR+DEV CI GREEN — PR CI #5207 and merged-dev CI #5208 passed  
**Result:** The user replaced the default per-Slice deployment/active-test cadence with one consolidated active verification gate immediately before each Phase closeout. Normal modularization Slices must remain independently deployable, focused-test/architecture guarded and CI-green, and must record affected runtime/payment/provider/printing/PWA/reconciliation behaviors as Phase verification scope, but do not each require a production deployment/user test before the next source Slice. After all planned source Slices for a Phase are merged, perform a closeout readiness audit against the final merged state, produce one consolidated deployment + active-verification plan, execute it deliberately, forward-fix/retest any failure, and only then mark the Phase `PRODUCTION VERIFIED / CLOSED`. Earlier explicit gates still override for destructive migrations, compatibility/traffic cutovers, provider certification, settlement cycles, irreversible operations or observed regressions. UberEats and guarded production Web Clover governance were updated to follow the Phase-level cadence while retaining their independent provider/cutover/settlement hard gates.  
**Details:** `AGENTS.md`, `docs/architecture/active-compatibility-register.md`, `docs/architecture/active-compatibility-register.json`, `docs/payments/clover-pos-integration-charter.md`, `docs/architecture/phase-5-commerce-orders-fulfillment.md`, and this worklog.

### 2026-09-06 — Phase 5 Slice 1D: POS Clover Terminal durable lifecycle convergence

**PR/SHA:** PR #2197; final head `04a4a5ed`; squash merge `9a338704`  
**State:** MERGED / PR+DEV CI GREEN — PR CI #5207 and merged-dev CI #5208 passed; TERMINAL CONFIRMED-PAYMENT FINALIZATION CONVERGED ON DURABLE ACCEPTED/PREP_STARTED/AUTO  
**Result:** Preserves the existing confirmed-payment transaction and extends it atomically with the Orders-owned `order.accepted` fact: Benefits points/balance COMMIT, Coupon COMMIT, paid in-store Order creation and `order.accepted:<orderStableId>` now commit together without exporting `Prisma.TransactionClient`. The existing-order recovery branch intentionally does not synthesize accepted, protecting historical pre-1D Terminal prototype Orders from a new AUTO print on recovery. `PosCardPaymentOrchestrationService` removes `PrintPosPayloadService`, direct `PosGateway.sendPrintJob()` and `PAYMENT_CHECKOUT:<attemptId>` first-print ownership; successful new finalization and COMPLETED/order-bound recovery instead call the existing public `POS_ORDER_OPERATIONS.activateImmediatePreparation()` capability, whose accepted-fact-gated idempotent preparation writes `making + durable order.prep_started` and wakes the shared AUTO lifecycle. `PosGateway` remains only for best-effort card-payment realtime status publication. DECLINED/UNKNOWN/payment-fact guard paths remain non-finalizing/non-preparing. The `payments.pos-card-legacy.v1` flag/cutover compatibility is unchanged. Direct Payments/Clover -> Commerce debt contracts `10 -> 8`, reducing Payments/Clover total outgoing direct debt `59 -> 57`; the public SCC baseline remains empty. No Prisma schema/migration, dependency manifest, production Web Clover Ecommerce, provider payment-state/amount/surcharge truth, UNKNOWN/reconciliation, refund, pricing/promotion or Benefits COMMIT semantics change. Runtime verification scope is accumulated into the Phase 5 closeout gate under the 2026-09-06 cadence. No local lint/build/test is claimed per repository workflow.  
**Details:** `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/orders-payment-finalization.characterization.spec.ts`, `apps/api/src/orchestration/pos-card-payment-orchestration.service.ts`, `apps/api/src/orchestration/pos-card-payment-orchestration.service.spec.ts`, `apps/api/src/orchestration/pos-card-payment-orchestration.module.ts`, `apps/api/src/payments/payments-architecture.spec.ts`, `tools/architecture/context-baseline.json`, `docs/architecture/phase-5-commerce-orders-fulfillment.md`, and `docs/architecture/current-dependency-graph.md`.

### 2026-09-06 — Phase 5 Slice 1E: Uber durable preparation / first-print convergence

**PR/SHA:** PR #2198; final head `ef6fa962`; squash merge `39bfc09a`  
**State:** MERGED / PR+DEV CI GREEN — PR CI #5210 and merged-dev CI #5211 passed; UBER PAID PREPARATION BYPASSES CLOSED; INITIAL AUTO PRINT IS DURABLE-ONLY  
**Result:** Readiness audit found a narrow race after successful Uber ACCEPT: the durable worker already commits local `paid + order.accepted`, but a staff POS `/advance` or direct `/status -> making` arriving before the lifecycle consumer could still fall through to generic Orders mutation and depend on the private same-process prep event. Slice 1E redirects both Uber paid entry points through existing store-scoped Orders preparation capabilities, resolving IMMEDIATE vs SCHEDULED from the Orders-owned timing snapshot. IMMEDIATE uses `activateImmediatePreparation`; SCHEDULED explicit early-start uses `activateScheduledPreparation`, preserving early-start semantics while requiring the accepted fact and atomically writing `making + durable order.prep_started`. With Web, in-store, Terminal and Uber now converged, repository-wide production-call search shows no legitimate same-process prep first-print consumer, so `OrderEventsBus` drops accepted/prep_started emit/listener APIs and `FulfillmentProcessor` drops its memory-origin branch. `OrderEventsBus` remains solely for `order.paid.verified`, preserving the separately deferred Uber Direct provider-dispatch path. Uber wire schema, webhook, action-worker lease/idempotency, provider truth, READY sync, Prisma schema, dependency manifests, Web Clover, Benefits/pricing/refund behavior and compatibility state are unchanged. No cross-context edge or baseline changes; totals remain Payments/Clover 57, External 42, Commerce 30, POS/Print 31 and the public SCC baseline remains empty. The existing 500 ms lifecycle poll is retained because dedicated Uber worker acceptance cannot safely in-process-wake the API lifecycle consumer. Affected Uber acceptance/preparation/AUTO/replay behavior is accumulated into the consolidated Phase 5 closeout verification plan under the repository-wide cadence. No local lint/build/test is claimed per repository workflow.  
**Details:** `apps/api/src/pos/pos-orders.service.ts`, `apps/api/src/orders/pos-order-operations.service.ts`, `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/order-events.bus.ts`, `apps/api/src/orders/processors/fulfillment.processor.ts`, `apps/api/src/orders/processors/order-lifecycle-outbox.processor.ts`, focused specs, `apps/api/src/integrations/ubereats/uber-order-lifecycle-boundary-architecture.spec.ts`, `apps/api/src/integrations/ubereats/ARCHITECTURE.md`, `docs/architecture/phase-5-commerce-orders-fulfillment.md`, and `docs/architecture/current-dependency-graph.md`.

### 2026-09-06 — Phase 5 Slice 2: Print handoff / dispatch idempotency + POS amendment printing

**PR/SHA:** PR #2199; final head `fb8110b3`; squash merge `515be0a6`  
**State:** MERGED / PR CI GREEN — CI #5215 passed; PRINT OWNS JOB IDENTITY/ROUTING/DISPATCH/ACK; ORDERS PRINT-PERSISTENCE PROBE REMOVED; POS AMENDMENT KITCHEN/LABEL/CUSTOMER PRINTING REPAIRED  
**Result:** Orders/Fulfillment now exposes only `INITIAL | REPRINT | AMENDMENT` print intent; the POS/Print owner derives `AUTO`, fresh `REPRINT:<uuid>` and `AMENDMENT:<uuid>` identities plus target routing. The durable initial-print consumer no longer probes `PosPrintJob`; after a successful INITIAL handoff it records Orders-owned `orders.lifecycle/order.initial_print_handoff`, so replay after a crash between Print job creation and checkpointing remains idempotent through the existing unique AUTO key. `PosGateway` serializes each target with `PosPrintJob ... FOR UPDATE`, claims `PENDING/FAILED -> DELIVERED` before socket emission, protects COMPLETED from late failure/timeout regression, and recovers stale DELIVERED rows after restart/reconnect. The unchanged Windows printer wire protocol gains local persistent/in-flight `jobId + target` dedupe in `printer-server.js`, with bounded completion history and temp-file replacement. Existing POS amendment behavior is repaired: VOID/ADD/SWAP now produces a kitchen difference ticket, ADD/SWAP label output is the positive before/after label-plan delta, combo kitchen components come from immutable pre/post OrderItem snapshots, and any amount or payment-method change independently creates a customer-only full latest receipt. Payment-method-only RETENDER is accepted only when the method actually changes. Normal order creation and amendment ADD/SWAP now share the Orders-internal `OrderItemSnapshotBuilder` for canonical `optionsJson + componentsJson`; pricing/Daily Special/promotion remain in `calculateLineItems`, and amendment does not call pricing policy. No Prisma schema/migration, package/lockfile, Web Clover, Uber provider wire, Benefits transaction, scanner allowance or context-edge count changes; totals remain Payments/Clover 57, External 42, Identity/Customer/Benefits 33, POS/Print 31, Commerce 30 and public SCC empty. Affected initial-print concurrency/restart, agent dedupe and amendment print behaviors are accumulated into the consolidated Phase 5 closeout verification scope. No local lint/build/test is claimed per repository workflow.  
**Details:** `apps/api/src/orders/order-item-snapshot.builder.ts`, `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/processors/order-lifecycle-outbox.processor.ts`, `apps/api/src/orders/processors/fulfillment.processor.ts`, `apps/api/src/orders/pos-print-dispatch.contract.ts`, `apps/api/src/pos/pos-print-dispatch.listener.ts`, `apps/api/src/pos/pos.gateway.ts`, `apps/api/src/pos/pos-orders.controller.ts`, `tools/printer-server/printer-server.js`, focused specs/architecture guards, `docs/architecture/phase-5-commerce-orders-fulfillment.md`, and `docs/architecture/current-dependency-graph.md`.

### 2026-09-06 — Phase 5 pre-Slice 3: Uber Direct dispatch-failure operations alert

**PR/SHA:** PR #2200; final head `0feb44fa`; squash merge `f9e0014b`  
**State:** MERGED / PR CI GREEN — CI #5220 passed; ACTIVE UBER DIRECT FAILURE PATH REQUESTS ADMIN ALERT; EMAIL FIRST, SMS FALLBACK; RUNTIME VERIFICATION DEFERRED TO PHASE 5 CLOSEOUT  
**Result:** The Slice 3 audit found that the existing `OrdersService.notifyDeliveryDispatchFailureAlert()` helper had no caller and sat beside a separate uncalled priority-delivery tail, while the active `FulfillmentProcessor -> UberDirectService.createDelivery()` path merely logged failures. The active catch now requests an operations alert after an Uber Direct delivery-creation error, and the obsolete uncalled OrdersService alert helper is removed rather than adapted to the new contract. Identity exposes active Admin recipients through the new stable-ID-only `OPERATIONS_ALERT_RECIPIENTS` capability; Commerce does not query User persistence for notification routing. Messaging exposes `DELIVERY_DISPATCH_FAILURE_NOTIFICATION`, renders bilingual email/SMS templates and applies the requested email-first policy, falling back to SMS only when email is absent or fails. Alert failure is best-effort and does not roll back the paid Order. If Uber Direct already returned a delivery ID but local `externalDeliveryId` persistence then fails, the flow emits a separate structured error and does not send the "new delivery creation failed" alert, avoiding a manual redispatch that could duplicate the provider delivery. `OrdersModule` now imports Notification composition through `../notifications/public-api`, contracting Commerce -> Messaging direct debt **4 -> 3** and Commerce total outgoing direct debt **30 -> 29**; the monotonic scanner baseline is tightened and the public SCC remains empty. No Prisma schema/migration, dependency, route, Uber provider request/response, payment or lifecycle contract changes. Focused tests are added for stable Admin recipient mapping, active provider-failure routing, successful-email/no-SMS, and failed-email/SMS fallback; per repository workflow no local lint/build/test is claimed before user review.  
**Details:** `apps/api/src/orders/processors/fulfillment.processor.ts`, `apps/api/src/auth/operations-alert-recipient.*`, `apps/api/src/notifications/contracts/delivery-dispatch-failure-notification.contract.ts`, `apps/api/src/notifications/notification.service.ts`, bilingual Messaging templates, `tools/architecture/context-baseline.json`, `docs/architecture/phase-5-commerce-orders-fulfillment.md`, and `docs/architecture/current-dependency-graph.md`.

### 2026-09-06 — Phase 5 Slice 3: Orders -> Messaging public boundary contraction

**PR/SHA:** PR #2201 / final head `90cddfd0` / merge `62790355`  
**State:** MERGED / PR CI GREEN — CI #5225 PASSED; ORDERS ORDER-READY + INVOICE DELIVERY USE MESSAGING PUBLIC CAPABILITIES; COMMERCE -> MESSAGING 3 -> 0; MESSAGING -> POS 1 -> 0; RUNTIME VERIFICATION DEFERRED TO PHASE 5 CLOSEOUT  
**Result:** Replaces the remaining concrete `NotificationService` / `EmailService` imports in `OrdersService` with the Messaging-owned `ORDER_READY_NOTIFICATION` and `ORDER_INVOICE_DELIVERY` public ports and removes `EmailModule` from Orders composition. Commerce keeps order-ready eligibility, trusted-contact precedence, locale/order presentation and receipt snapshot construction; Messaging keeps template/provider/channel delivery. Order-ready persistence now crosses the boundary with `userStableId`, using the existing member lookup as a historical stable-ID fallback without another query. Invoice delivery receives a neutral Messaging-owned `OrderInvoicePayload` instead of the POS `PrintPosPayloadDto`, so Email rendering also stops importing POS internals. The monotonic baseline removes the now-zero `commerce-orders-fulfillment -> messaging-notifications` edge (**3 -> 0**, Commerce total **29 -> 26**) and `messaging-notifications -> store-operations-pos-print` (**1 -> 0**, Messaging total **10 -> 9**); public SCC remains empty. Scanner guards lock both public contracts against Prisma/provider/DB-ID/Commerce/POS leakage and prevent Orders from regaining concrete Messaging imports. No Prisma schema/migration, dependency/lockfile, HTTP route, payment/pricing/refund/lifecycle, compatibility or provider-wire change. Focused source tests cover stable-ID order-ready delivery, historical member fallback, invoice boundary mapping and Messaging invoice delegation; PR CI #5225 passed before merge.  
**Details:** `apps/api/src/notifications/contracts/order-ready-notification.contract.ts`, `apps/api/src/notifications/contracts/order-invoice-delivery.contract.ts`, `apps/api/src/notifications/notification.service.ts`, `apps/api/src/email/email.service.ts`, `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/orders.module.ts`, `tools/architecture/context-baseline.json`, `tools/architecture/scan-architecture.mjs`, `docs/architecture/phase-5-commerce-orders-fulfillment.md`, and `docs/architecture/current-dependency-graph.md`.

### 2026-09-06 — Phase 5 Slice 4A: low-risk direct-edge + dead-code contraction

**PR/SHA:** PR #2202 / final head `09cdd74d` / merge `6e2da654`  
**State:** MERGED / CI GREEN — RERUN CI #5228 PASSED; COMMERCE -> BRAND/STORE 2 -> 0; COMMERCE -> IDENTITY 4 -> 2; COMMERCE TOTAL 26 -> 22; RUNTIME VERIFICATION DEFERRED TO PHASE 5 CLOSEOUT  
**Result:** Orders transport imports `SessionAuthGuard` and `OptionalSessionAuthGuard` through `auth/public-api.ts`; Auth now exports the optional guard. Brand/Store Location exposes `LOCATION_GEOCODER` / `LocationGeocoderPort` through `location/public-api.ts`, with `LocationService` retained as the internal Google Maps HTTP implementation and `LocationModule` exporting only the token-backed capability. OrdersService consumes that public token for the existing quote/create geocoding calls. Verified uncalled `OrdersService` methods `ensureLoyaltyAccountWithTx`, `normalizeDropoff`, `buildUberPickupOverride`, and `dispatchPriorityDelivery` are deleted together with the obsolete `OrdersService -> UberDirectService` injection. The active Uber Direct dispatch remains `FulfillmentProcessor -> UberDirectService`; provider semantics and the deferred provider-success/local-persistence durability gap are unchanged. The monotonic baseline contracts Commerce -> Brand/Store **2 -> 0** and Commerce -> Identity/Customer/Benefits **4 -> 2**, reducing Commerce outgoing direct debt **26 -> 22**; public SCC remains empty. Scanner guards prevent the old Auth/Location deep imports and retired OrdersService tails from returning. No Prisma schema/migration, dependency/lockfile, route, Web Clover, Uber wire/provider, pricing, refund, lifecycle or Benefits COMMIT semantics change. Initial CI #5227 failed only two Prettier rules; formatting-only follow-up `09cdd74d` passed rerun CI #5228 before merge.  
**Details:** `apps/api/src/auth/public-api.ts`, `apps/api/src/location/location-geocoding.contract.ts`, `apps/api/src/location/location.service.ts`, `apps/api/src/location/location.module.ts`, `apps/api/src/location/public-api.ts`, `apps/api/src/orders/orders.controller.ts`, `apps/api/src/orders/orders.module.ts`, `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/orders.service.spec.ts`, `tools/architecture/context-baseline.json`, `tools/architecture/scan-architecture.mjs`, `docs/architecture/phase-5-commerce-orders-fulfillment.md`, and `docs/architecture/current-dependency-graph.md`.

### 2026-09-06 — Phase 5 Slice 4B: Catalog persistence contraction

**PR/SHA:** PR #2203 / final head `7f8c0c9f` / merge `b8f838ff`  
**State:** MERGED / CI GREEN — PR CI #5232 AND MERGED-DEV CI #5233 PASSED; NON-OWNER MENUITEM PERSISTENCE = 0; SCANNER REJECTS ANY PROTECTED `.menuItem.` DELEGATE; COMMERCE DIRECT-DEBT BASELINE REMAINS 22; RUNTIME VERIFICATION DEFERRED TO PHASE 5 CLOSEOUT  
**Result:** Adds the Catalog-owned `CATALOG_ORDER_FACTS_READER` public capability for hidden-menu facts, immutable OrderItem materialization facts and current label/packaging configuration. The existing `CatalogAdminService` implements the port and is exposed through a token alias with `useExisting`, so Catalog retains one Prisma-backed owner and its Runtime direct debt does not increase. `OrdersService` preserves the existing Web-hidden/POS-allowed policy while replacing its direct `MenuItem` query. `OrderItemSnapshotBuilder` preserves canonical `optionsJson + componentsJson`, fixed/selectable component validation and amendment parity while removing Prisma/Catalog generated types and direct MenuItem reads. Its unreachable MenuItem/option DB-UUID fallback is not exported; legitimate create/amendment paths already use business stable IDs. `OrderLabelPlanService` preserves existing packaging/A-B/ALWAYS/AUTO decisions while reading current config through Catalog and replacing an ephemeral packaging-row UUID key with `packagingType.stableId`. Scanner guards prevent direct MenuItem persistence from returning and keep the public contract Prisma/concrete-service/DB-ID free. The direct-import numeric graph remains Commerce **22**, Catalog **15**, public SCC empty; this slice contracts persistence ownership rather than a counted legacy import edge. No Prisma schema/migration, dependency/lockfile, route, pricing/promotion, payment/refund, Benefits COMMIT transaction, lifecycle or provider-wire behavior changes. Focused tests are updated for hidden Web/POS policy, canonical item snapshots and existing label rules, with Catalog owner projection tests added; per repository workflow no local lint/build/test is claimed before user review.  
**Details:** `apps/api/src/menu/catalog-order-facts-reader.contract.ts`, `apps/api/src/menu/catalog-order-facts.module.ts`, `apps/api/src/menu/catalog-admin.service.ts`, `apps/api/src/menu/public-api.ts`, `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/order-item-snapshot.builder.ts`, `apps/api/src/orders/order-label-plan.service.ts`, focused specs, `tools/architecture/context-baseline.json`, `tools/architecture/scan-architecture.mjs`, `docs/architecture/phase-5-commerce-orders-fulfillment.md`, and `docs/architecture/current-dependency-graph.md`.

### 2026-09-06 — Phase 5 Slice 4C: Customer runtime read contraction

**PR/SHA:** PR #2204 / final head `3efd8930` / squash merge `1f58f1a3`  
**State:** MERGED / CI GREEN — PR CI #5236 PASSED; ORDERS `User` / `UserAddress` PERSISTENCE READS = 0; CUSTOMER PUBLIC RUNTIME CONTEXT ADDED; COMMERCE DIRECT-DEBT BASELINE REMAINS 22; RUNTIME VERIFICATION DEFERRED TO PHASE 5 CLOSEOUT  
**Result:** Adds stable-ID-only `CUSTOMER_ORDER_CONTEXT_READER` to the existing Customer owner. `CustomerService` resolves verified email/phone, language and saved-address facts internally, including internal User DB identity needed to join `UserAddress`, while the public contract exposes only `userStableId` / `addressStableId` and neutral facts. Orders uses this capability for ready-notification member fallback and delivery customer facts, and `getByStableIdWithOwner()` now uses persisted `Order.userStableId` directly rather than re-reading User by internal UUID. Phase 4 production evidence already proved 45/45 member-linked Orders have matching stable identity with 0 orphan/mismatch and current member Order writes dual-write it. Scanner guards prevent User/UserAddress persistence from returning to Orders and keep the Customer contract Prisma/concrete-service/DB-ID free. Numeric Commerce -> Identity remains **2** because the remaining counted debt is concrete `LoyaltyService` + `MembershipService`, deferred to Slice 4D. No schema/migration, dependency/lockfile, route, Web Clover, pricing, refund, lifecycle, provider-wire or Benefits COMMIT semantics change. A separate pre-existing saved-address bug was discovered read-only: both current production `UserAddress.addressStableId` rows use `a...`, while Orders' existing generic CUID normalizer accepts only `c...`; 4C records that debt but does not fix it.  
**Details:** `apps/api/src/membership/customer-order-context.contract.ts`, `apps/api/src/membership/customer.service.ts`, `apps/api/src/membership/membership.module.ts`, `apps/api/src/membership/public-api.ts`, `apps/api/src/membership/customer-order-context.service.spec.ts`, `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/orders.service.spec.ts`, `apps/api/src/orders/order-user-stable-id.characterization.spec.ts`, `tools/architecture/context-baseline.json`, `tools/architecture/scan-architecture.mjs`, `docs/architecture/phase-5-commerce-orders-fulfillment.md`, and `docs/architecture/current-dependency-graph.md`.

### 2026-09-06 — Phase 5 Slice 4C-A: UserAddress canonical StableId repair

**PR/SHA:** PR #2205 / final head `227643935d6c8ad02e39ef1b91fff176c49bb204` / squash merge `c02c3bac`  
**State:** MERGED / CI GREEN / PRODUCTION REPAIRED / VERIFIED — PR CI #5238 PASSED; TWO HISTORICAL USERADDRESS STABLE IDS REPAIRED TO CANONICAL `c...` VALUES  
**Result:** Fixes the pre-existing Customer address identity mismatch discovered during Slice 4C. `CustomerService.createAddress()` no longer rewrites the first character of a generated CUID to `a`; it now writes the canonical `c...` value produced by the shared `generateStableId()`. Focused address coverage asserts the generated identifier is accepted by the same shared `normalizeStableId()` consumed by Orders, and Customer order-context fixtures now use canonical address IDs. Orders validation remains strict and is not widened to accept historical `a...` values. Read-only production audit found exactly **2** `UserAddress` rows, both in the legacy `a + 24` shape; no other typed `addressStableId` column exists, all **12** current `CheckoutIntent.metadataJson` rows contain no `addressStableId` key, and none references either current address ID. The production correction has now been completed by restoring each historical ID's first character from `a` to `c`, and the closeout saved-address resolution check is verified. No Prisma schema/migration, dependency/lockfile, route, context edge, scanner allowance, payment/provider, pricing, lifecycle, or Benefits transaction semantics change.  
**Details:** `apps/api/src/membership/customer.service.ts`, `apps/api/src/membership/customer-address.service.spec.ts`, `apps/api/src/membership/customer-order-context.service.spec.ts`, `docs/architecture/phase-5-commerce-orders-fulfillment.md`, `docs/architecture/current-dependency-graph.md`, and `docs/architecture/id-inventory.md`.

### 2026-09-06 — Phase 5 Slice 4D: Benefits runtime read contraction

**PR/SHA:** PR #2206 / final head `4c6795de89e775dffd3228d8c9d34f617bf1c936` / squash merge `a88d82f7b5dd9917dd4789e965fa252e1b3fda7d`  
**State:** MERGED / CI GREEN — FINAL PR CI #5242 PASSED API AND WEB; ORDERS BENEFITS RUNTIME READS USE THE STABLE-ID PUBLIC CAPABILITY; DIRECT `LoyaltyAccount` PERSISTENCE READ REMOVED; COMMERCE DIRECT-DEBT BASELINE REMAINS 22  
**Result:** Adds Benefits-owned `ORDER_BENEFITS_READER` for coupon-for-order projection, available Points/Balance tender facts and loyalty-only redeem capacity without exposing User/Coupon DB UUIDs, Prisma types or concrete Loyalty/Membership services. Member existence remains Customer ownership and Orders reuses the existing `CUSTOMER_EXISTENCE_READER` to preserve the historical `member not found` behavior. Orders quote pricing, Web stored-balance validation and loyalty-only eligibility consume those stable-ID public owner capabilities, and `createLoyaltyOnlyOrder()` no longer reads `prisma.loyaltyAccount`. Normal checkout tender still excludes active payment holds, while loyalty-only eligibility deliberately preserves the old raw-account-points capacity check. Commerce still owns pricing, promotion eligibility/stacking, requested redemption and insufficient-balance decisions. The concrete `LoyaltyService` / `MembershipService` imports deliberately remain for the transaction-/mutation-sensitive seam: prepared-payment internal identity, confirmed-payment Tender/Coupon COMMIT in the Order transaction, transactional normal-order coupon/Loyalty reserve/deduct, and refund/amendment/paid-side-effect mutations. The scanner prevents read-side regression and DB-ID leakage while allowing at most the two existing concrete member-resolution/coupon-read preparation/transaction call sites. Therefore `commerce-orders-fulfillment -> identity-customer-benefits` remains **2**, Commerce remains **22**, and public SCC remains empty. No Prisma schema/migration, dependency/lockfile, route, payment/refund, pricing, lifecycle, provider wire or Benefits COMMIT semantics change. During CI, the initial top-level Benefits module re-export exposed an Auth/Loyalty/Promotions eager module-loading cycle; the final design keeps the contract on `benefits/public-api.ts` while composing the Nest module through the dedicated subpath, and the scanner now locks that rule.  
**Details:** `apps/api/src/benefits/contracts/order-benefits-read.contract.ts`, `apps/api/src/benefits/order-benefits-read.service.ts`, `apps/api/src/benefits/order-benefits-read.service.spec.ts`, `apps/api/src/benefits/public-api/order-benefits-read.module.ts`, `apps/api/src/benefits/public-api.ts`, `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/orders.service.spec.ts`, `apps/api/src/orders/orders.module.ts`, `tools/architecture/context-baseline.json`, `tools/architecture/scan-architecture.mjs`, `tools/architecture/README.md`, `docs/architecture/phase-5-commerce-orders-fulfillment.md`, and `docs/architecture/current-dependency-graph.md`.

### 2026-09-06 — Phase 5 Slice 4E: Uber Direct provider implementation contraction

**PR/SHA:** PR #2207 / final head `4cc113e6b47bf95ac4a72a6a34c87eabe0143c1a` / squash merge `24e7976d1851788a3d80cae37f95f92b0d5ffb6f`  
**State:** MERGED / CI GREEN — FINAL PR CI #5245 PASSED API AND WEB AFTER LINT-ONLY CI #5244 FOLLOW-UP; `FulfillmentProcessor` NO LONGER IMPORTS `UberDirectService`; COMMERCE DIRECT-DEBT BASELINE REMAINS 22  
**Result:** Adds the Deliveries-owned `UBER_DIRECT_DELIVERY_DISPATCHER` contract and public surface. `UberDirectService` remains the sole HTTP/auth/provider-payload/response-normalization implementation but now implements the dispatcher port internally; `DeliveriesModule` binds the token with `useExisting` and exports only that token. `FulfillmentProcessor` injects `UberDirectDeliveryDispatcherPort` and keeps the existing Uber-delivery eligibility, stable `orderRef`, pickup code, manifest, destination, pickup-ready, dispatch-failure alert and returned-`deliveryId` persistence behavior. Provider-success followed by local `externalDeliveryId` persistence failure remains log-only and is not reclassified as a provider-create failure; the wider in-memory `order.paid.verified` durability/idempotency gap remains deferred. `OrdersModule` composes Deliveries through `deliveries/public-api.ts`. Scanner guards forbid concrete Uber Direct imports/deep module composition from Orders and keep the public dispatch contract framework/Prisma/Http/concrete-service/internal-Order-ID free. Because Deliveries and Orders are both mapped to Commerce, the numeric graph remains Commerce **22** and public SCC empty. No schema/migration, dependency/lockfile, route, payment/refund, lifecycle or provider-wire behavior changes.  
**Details:** `apps/api/src/deliveries/uber-direct-dispatch.contract.ts`, `apps/api/src/deliveries/public-api.ts`, `apps/api/src/deliveries/deliveries.module.ts`, `apps/api/src/deliveries/deliveries.module.spec.ts`, `apps/api/src/deliveries/uber-direct.service.ts`, `apps/api/src/orders/processors/fulfillment.processor.ts`, `apps/api/src/orders/processors/fulfillment.processor.spec.ts`, `apps/api/src/orders/orders.module.ts`, `tools/architecture/context-baseline.json`, `tools/architecture/scan-architecture.mjs`, `tools/architecture/README.md`, `docs/architecture/phase-5-commerce-orders-fulfillment.md`, and `docs/architecture/current-dependency-graph.md`.

### 2026-09-06 — Phase 5 Slice 4F: Fulfillment / Print payload boundary contraction

**PR/SHA:** PR #2208 / final head `f6ca667c46d3a0e4783c6354ac9bdaea9f68569c` / squash merge `3cc775f141ab08180e8d8751a519dc89ea173a93`  
**State:** MERGED / CI GREEN — PR CI #5247 PASSED API AND WEB; COMMERCE -> STORE OPERATIONS 2 -> 0; STORE OPERATIONS -> COMMERCE 2 -> 0; COMMERCE TOTAL 20; STORE OPERATIONS TOTAL 29  
**Result:** Moves the existing receipt/kitchen payload shape from the POS DTO tree into the Orders-owned `order-print-payload.contract.ts`, keeping the same business fields while removing Prisma/POS implementation types from the public contract. `PrintPosPayloadService` implements `OrderPrintPayloadReaderPort`; `OrdersModule` binds and exports `ORDER_PRINT_PAYLOAD_READER` instead of exporting the concrete service. `FulfillmentProcessor` uses the local Orders contract, while the POS print-payload route injects the public reader token and preserves the same store-scope check/response shape. The former POS `print-pos-payload.dto.ts` is deleted, removing its reverse Orders deep import. The two zero direct edges are removed from the monotonic baseline; scanner and focused architecture coverage prevent concrete DTO/service deep imports from returning. PrintJob identity, dispatch target routing, socket/agent payload, ACK/retry, lifecycle and physical printing behavior remain unchanged.  
**Details:** `apps/api/src/orders/order-print-payload.contract.ts`, `apps/api/src/orders/print-pos-payload.service.ts`, `apps/api/src/orders/orders.module.ts`, `apps/api/src/orders/public-api.ts`, `apps/api/src/orders/processors/fulfillment.processor.ts`, `apps/api/src/pos/pos-orders.controller.ts`, deleted `apps/api/src/pos/dto/print-pos-payload.dto.ts`, `apps/api/src/pos/pos-orders-transport-boundary.architecture.spec.ts`, `tools/architecture/context-baseline.json`, `tools/architecture/scan-architecture.mjs`, `tools/architecture/README.md`, `docs/architecture/phase-5-commerce-orders-fulfillment.md`, and `docs/architecture/current-dependency-graph.md`.

### 2026-09-06 — Phase 5 Slice 5A: Order invoice use-case decomposition

**PR/SHA:** PR #2209 / final head `7346ec58f66b03c38738a700edcee090f24c36df` / squash merge `3a37a6251ad5fde63dcd3f8275277cd1a8d9ae43`  
**State:** MERGED / CI GREEN — FINAL PR CI #5255 PASSED API AND WEB; INVOICE ROUTES CALL `OrderInvoiceUseCase`; `OrdersService` NO LONGER OWNS INVOICE DELIVERY OR CONCRETE PRINT-PAYLOAD DEPENDENCIES; COMMERCE TOTAL REMAINS 20  
**Result:** Extracts the invoice-delivery leaf from `OrdersService` into `OrderInvoiceUseCase`. The use case keeps the existing email normalization/validation, reads the Orders-owned receipt projection through `ORDER_PRINT_PAYLOAD_READER`, preserves fulfillment mapping and delegates the same payload to Notifications via `ORDER_INVOICE_DELIVERY`. Both invoice HTTP routes call the use case directly. `OrdersService` drops `ORDER_INVOICE_DELIVERY`, `OrderInvoiceDeliveryPort`, `OrderInvoicePayload`, concrete `PrintPosPayloadService` and its invoice methods. Focused tests move invoice characterization out of the broad service spec and add fail-fast invalid-email coverage. Scanner guards keep the use case internal and prevent the removed invoice leaf/dependencies from returning to `OrdersService`. No schema/migration, dependency, route, payment/refund, lifecycle, PrintJob or transaction semantics change.  
**Details:** `apps/api/src/orders/order-invoice.use-case.ts`, `apps/api/src/orders/order-invoice.use-case.spec.ts`, `apps/api/src/orders/orders.controller.ts`, `apps/api/src/orders/orders.controller.spec.ts`, `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/orders.service.spec.ts`, `apps/api/src/orders/orders.module.ts`, `tools/architecture/context-baseline.json`, `tools/architecture/scan-architecture.mjs`, `tools/architecture/README.md`, `docs/architecture/phase-5-commerce-orders-fulfillment.md`, and `docs/architecture/current-dependency-graph.md`.

### 2026-09-06 — Phase 5 Slice 5B: Ready-notification use-case decomposition

**PR/SHA:** local branch `refactor/phase5-orders-usecase-decomposition-b` / base `origin/dev@3a37a625`  
**State:** SOURCE / LOCAL REVIEW PENDING — SUCCESSFUL `ready` STATUS WRITES DELEGATE NON-BLOCKING NOTIFICATION ORCHESTRATION TO INTERNAL `OrderReadyNotificationUseCase`; `OrdersService` RETAINS STATUS TRANSITIONS AND PAID/REFUNDED SIDE EFFECTS; COMMERCE TOTAL REMAINS 20; COMMERCE -> RUNTIME REMAINS 10; NO LOCAL LINT/BUILD/TEST RUN PER REPOSITORY WORKFLOW  
**Result:** Moves the complete post-`ready` contact/locale/notification/logging leaf out of `OrdersService`. The new use case preserves delivery-order suppression, `clientRequestId ?? orderStableId`, checkout verified-contact precedence, member fallback, Uber-only external-contact fallback, locale precedence, Notifications-owned `ORDER_READY_NOTIFICATION`, structured result logging and PII redaction. It uses the existing Orders-local `orders-prisma` facade so decomposition does not add a new Commerce -> Runtime source edge, and it keeps the original Promise `.then(...).catch(...)` non-blocking shape. Existing ready-notification regression tests continue to exercise the behavior through the new use case. Scanner guards prevent ready policy, notification capabilities, deep Notification/Email/Prisma imports or redaction helpers from returning to `OrdersService`, and keep the use case internal to Orders composition. No schema/migration, dependency, route, status-transition, payment/refund, provider, notification payload or transaction semantics change.  
**Details:** `apps/api/src/orders/order-ready-notification.use-case.ts`, `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/orders.service.spec.ts`, `apps/api/src/orders/orders.module.ts`, `tools/architecture/context-baseline.json`, `tools/architecture/scan-architecture.mjs`, `tools/architecture/README.md`, `docs/architecture/phase-5-commerce-orders-fulfillment.md`, and `docs/architecture/current-dependency-graph.md`.

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
- Phase 4: **PRODUCTION VERIFIED / CLOSED** on 2026-09-05. All approved slices through Slice 6 are
  merged/CI-green, the consolidated migration recovery and deployment completed, and active verification passed.
  Slice 0A merged via PR #2163 / `aa302629`
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
  management is fully behind the Auth owner without exposing the Prisma UUID. Slice 4C merged via PR
  #2182 as `3119ce76` after final head `7cb071ad` passed CI #5158, moving member order-history/top-item
  reads into Orders and contracting Commerce -> Identity direct debt `5 -> 4` without adding an
  Identity -> Orders public edge. Slice 4D-A merged via PR #2183 as `07dc1206` after final head
  `cec141ba` passed CI #5162, moving the `pos-recharge` challenge/token lifecycle behind the Auth owner
  while keeping Loyalty top-up orchestration in Admin. Slice 4D-H merged via PR #2184 as `7853e4f9` after
  final head `4d850ba1` passed CI #5165, adding the unified recharge limiter, dedicated secret,
  cryptographic OTP generation and POS failure UX. Slice 4D-I merged via PR #2185 as `b27ad8ce` after
  final head `d4b85e3a` passed CI #5168, adding shared DB-backed OTP policy, 10-minute `email_verify`,
  public IP spray budgets, single-active-code supersession and consistent failed-attempt revoke semantics.
  Slice 5A merged via PR #2186 as `c28df1b5` after final head `3b904dd1` passed CI #5171; LoyaltyLedger
  owns nullable `orderStableId`, Admin/Membership consume the Loyalty-owned ledger reader, Identity -> Runtime
  is now `10`, total Identity outgoing is `33`, and the empty SCC baseline is CI-confirmed. Slice 5B merged via
  PR #2187 as `0f58cf83` after final head `42891cf4` passed PR CI #5174; the merged dev source then passed CI
  #5175. Orders detail/public summary, old-Web external-payment reconstruction and POS/receipt print now use the
  stable-ID-only Benefits reader, with the non-unique `LoyaltyLedger(orderStableId)` query index in its separate
  additive migration. Slice 6 final audit finds no further safe Phase 4 contraction and closes the source graph
  with the existing numeric baseline and empty public SCC. `MembershipService.getMemberSummary()` remains an
  explicit post-Phase-4 composite read-model/SCC deferral, and Phase 3 Slice 2C remains the transaction-sensitive
  COMMIT deferral. Consolidated rollout is complete: TrustedDevice **2/2** stable IDs are populated/unique;
  `Order.userId` is UUID and **45/45** member Orders have matching `userStableId` with **0** orphan/mismatch;
  LoyaltyLedger has **89/89** order-linked stable IDs with **0** orphan/mismatch while **2** manual no-order rows
  remain NULL. Active member/Admin/OTP/points/balance/receipt/refund/POS-recharge checks completed without relevant
  5xx/Prisma/OTP anomalies. Recharge SMS is N/A under the current email-first account mix; SMS Login 2FA negative,
  cooldown and success behavior was verified separately. The POS Order Management 30-row historical-query defect
  found during verification is a separate post-Phase-4 hotfix and does not reopen the closed phase.
- Phase 5: Slice 0 is **MERGED / CI GREEN** via PR #2193 / `07311f74`, including merged dev CI #5194. Slice 1A is
  **MERGED / PR CI GREEN** via PR #2194 / `db7a1de9`, with CI #5195 passing. Slice 1B is **MERGED / PR CI GREEN**
  via PR #2195 / `e4a783a5`, final head `c8ed5579`, CI #5200 passing: ordinary in-store POS creation owns durable
  `order.accepted`, durable `prep_started` materializes the sole AUTO first print, and the POS payment page no longer
  performs first `printOrderCloud()` / `advanceOrder()`. Slice 1C is **MERGED / PR+DEV CI GREEN** via PR #2196 /
  `61f5917d`, final head `3dc21e5d`; PR CI #5204 and merged-dev CI #5205 passed. Web payment still creates only a paid
  Order, while store-side auto/manual acceptance writes durable `order.accepted`; immediate Web acceptance reuses the
  idempotent preparation materializer to write `making + order.prep_started`, scheduled Web acceptance waits for the
  existing prepStartAt scheduler, and Web/in-store first AUTO printing is durable-origin only. Slice 1D is **MERGED /
  PR+DEV CI GREEN** via PR #2197 / `9a338704`, final head `04a4a5ed`; PR CI #5207 and merged-dev CI #5208 passed.
  Terminal confirmed-payment creation atomically adds durable `order.accepted`, direct `PAYMENT_CHECKOUT:*` first-print
  ownership is removed, and finalization/recovery reuse the public durable preparation capability. Payments/Clover ->
  Commerce direct debt is `8`, so Payments/Clover total outgoing direct debt is **57**. Slice 1E is **MERGED / PR+DEV
  CI GREEN** via PR #2198 / `39bfc09a`, final head `ef6fa962`; PR CI #5210 and merged-dev CI #5211 passed. Uber paid
  IMMEDIATE/SCHEDULED staff preparation uses accepted-fact-gated durable commands, and the obsolete same-process prep
  first-print event is removed while `order.paid.verified` remains for deferred Uber Direct work. Slice 2 is **MERGED /
  PR CI GREEN** via PR #2199 / `515be0a6`, final head `fb8110b3`; CI #5215 passed: Print owns job identity/routing,
  row-lock dispatch claim and ACK/retry; the Windows agent dedupes `jobId + target`; Orders no longer reads Print
  persistence; and POS amendment kitchen/label/customer reprints are restored through the shared canonical OrderItem
  snapshot builder. The pre-Slice-3 Uber Direct alert hardening is **MERGED / PR CI GREEN** via PR #2200 / `f9e0014b`,
  final head `0feb44fa`, with CI #5220 passing: active delivery-create failure requests an Admin alert through public
  Identity/Messaging capabilities with email-first/SMS-fallback routing, and Commerce -> Messaging direct debt is
  tightened `4 -> 3` (Commerce total **29**). Slice 3 is **MERGED / PR CI GREEN** via PR #2201 / `62790355`,
  final head `90cddfd0`, with CI #5225 passing: Order-ready and invoice delivery use Messaging public ports,
  Commerce -> Messaging is `0` (Commerce total **26**) and Messaging -> POS is `0` (Messaging total **9**) while
  the public SCC baseline remains empty. Slice 4A is **MERGED / CI GREEN** via PR #2202 / `6e2da654`, final head
  `09cdd74d`, with rerun CI #5228 passing: Orders Auth/Location access uses owner public surfaces, the obsolete
  OrdersService Uber Direct/Loyalty tail is removed, Commerce -> Brand/Store is `0`, Commerce -> Identity/Customer/Benefits
  is `2`, and Commerce total is **22**. Slice 4B is **MERGED / CI GREEN** via PR #2203 / `b8f838ff`, final head
  `7f8c0c9f`; PR CI #5232 and merged-dev CI #5233 passed, direct MenuItem persistence in `orders/**` is zero, and the
  scanner rejects any protected `.menuItem.` delegate. Slice 4C is **MERGED / CI GREEN** via PR #2204 / `1f58f1a3`, final head `3efd8930`, with PR CI #5236 passing: Orders User/UserAddress persistence reads are zero and Customer runtime facts now cross only the stable-ID public capability while Commerce remains **22**. Slice 4C-A is **MERGED / CI GREEN / PRODUCTION REPAIRED / VERIFIED** via PR #2205 / `c02c3bac`, final head `227643935d6c8ad02e39ef1b91fff176c49bb204`, with CI #5238 passing; new Customer addresses use canonical `c...` StableIds and the two historical production `a...` rows have been repaired to canonical `c...` values. Slice 4D is **MERGED / CI GREEN** via PR #2206 / `a88d82f7`, final head `4c6795de`, with CI #5242 passing: Orders runtime Benefits reads use the stable-ID public reader and direct LoyaltyAccount persistence is removed while the intentionally preserved transaction/mutation seam keeps Commerce -> Identity at `2` and Commerce total at **22**. Slice 4E is **MERGED / CI GREEN** via PR #2207 / `24e7976d`, final head `4cc113e6`, with CI #5245 passing: Fulfillment consumes Uber Direct through the token-backed Deliveries public dispatcher and no longer imports the concrete provider service; Commerce remains **22** because both modules are in the same context. Slice 4F is **MERGED / CI GREEN** via PR #2208 / `3cc775f1`, final head `f6ca667c`, with CI #5247 passing: Orders owns the print payload public contract, POS consumes the token-backed reader, Commerce -> Store Operations is `0`, Store Operations -> Commerce is `0`, Commerce total is **20**, and Store Operations total is **29**. Slice 5A is **MERGED / CI GREEN** via PR #2209 / `3a37a625`: invoice delivery is extracted into `OrderInvoiceUseCase`. Slice 5B is **MERGED / CI GREEN** via PR #2210 / `b7ecc00f`: post-ready contact/locale/notification orchestration is extracted into `OrderReadyNotificationUseCase`. Slice 5C is **MERGED / CI GREEN** via PR #2211 / `8e90a89f`, final head `00fe37c7`, with CI #5261 passing after architecture-guard alignment and formatting follow-ups: paid-order Uber Direct dispatch preparation/provider invocation/local delivery-id persistence/failure-alert policy now live in internal `OrderDeliveryDispatchUseCase`, while `FulfillmentProcessor` remains the lifecycle adapter. Slice 5D is **MERGED / CI GREEN** via PR #2212 / `82c9d18f`, final head `0219d601`, with CI #5264 passing: the read-only one-hour average preparation-time query now lives in internal `OrderPrepTimeQueryUseCase`, preserving the historical 15-minute fallback and 5-minute minimum. Slice 5E is **MERGED / CI GREEN** via PR #2213 / `a69f27b4`, final head `fcd3cb4d`, with CI #5266 passing: the public thank-you/order-summary projection now lives in internal `OrderPublicSummaryQueryUseCase`, including summary-only discount display, checkout-intent surcharge metadata, Loyalty usage and line-item projection while payment/refund write paths stay untouched. Slice 5F is **MERGED / CI GREEN** via PR #2214 / `a96214f9`, final head `3450449e`, with CI #5271 passing: POS `recent` / `searchForStore` / `board` reads now live in internal `OrderManagementQueryUseCase`, while shared store scoping and DTO projection live in `order-query-projection.ts`; `getByStableId*`, payment, refund/amendment and lifecycle writes remain in `OrdersService`. Commerce direct debt remains **20**, Store Operations **29**, Commerce -> Runtime **10**, and public SCC remains empty.
  Under the 2026-09-06 repository-wide cadence, Phase 5 runtime verification is performed once against the final merged
  Phase state immediately before closeout rather than after each Slice.
- Payments/Clover: POS Terminal is pre-production and structurally available for
  modularization; production Web Ecommerce is guarded but may be touched when it is
  a documented critical blocker under the active-verification rule.

### 2026-09-07 — Phase 5 closeout regression: POS pure-loyalty zero-external tender routing

**PR/SHA:** PR #2216 / squash merge `81b79148`  
**State:** VERIFIED — merged/CI-green and production re-test passed  
**Result:** Phase 5 production verification found that a POS member order fully covered by loyalty points correctly displayed `0` due but remained browser-classified as CASH. The old full-benefits predicate required `totalAfterPointsCents > 0`, so the pure-points case (`totalAfterPointsCents === 0`) opened the cash-received dialog with zero and then failed its positive-cash validation. The merged fix classifies zero remaining tender covered by loyalty points and/or Store Balance as the existing internal-benefits flow, preserving the canonical unified-payment path. That path already finalizes `externalAmountCents === 0` without starting a Clover provider sale and keeps Benefits COMMIT + Order creation on the immutable prepared-payment transaction boundary. Production re-test confirmed zero due, no cash dialog/Clover sale, one Order, committed points, durable lifecycle, AUTO customer/kitchen/label printing and ready notification. No API/public contract, Prisma schema/migration, Clover provider behavior, pricing/promotion policy, refund semantics, dependency or architecture-edge change.  
**Details:** `docs/architecture/phase-5-commerce-orders-fulfillment.md`.

### 2026-09-07 — Phase 5 closeout regression: POS full-refund kitchen cancellation print

**PR/SHA:** replacement PR #2221 / final head `46a589ac` / squash merge `554a586d` after failed PR #2220  
**State:** MERGED / CI GREEN / PRODUCTION VERIFIED — PR CI #5293 passed API and Web; durable cancellation behavior re-verified in production  
**Result:** Closeout testing confirmed a POS in-store full refund moved the Order to `refunded` and persisted a confirmed `FULL_REFUND` amendment, but produced no kitchen cancellation print after the original INITIAL customer/kitchen job. The first hotfix added kitchen-only `CANCELLATION` printing and the centered label pickup code, but production re-test of an Uber scheduled cancellation exposed that API-local EventEmitter delivery does not cross the `ubereats-worker` process boundary. The follow-up moves confirmed cancellation onto the existing durable `orders.lifecycle` OpsEvent path: internal full refunds and Uber cancellations append idempotent `order.cancelled` in the same transaction that sets `Order.status=refunded`; API `OrderLifecycleOutboxProcessor` requires persisted refunded state plus an existing `order.initial_print_handoff`, creates the kitchen-only cancellation job, then checkpoints `order.cancellation_print_handoff`. Refunded orders are excluded from later INITIAL replay and Print retains stable `kind=CANCELLATION` idempotency. CI #5290 initially rejected a direct Uber -> Orders internal import because legacy direct-import debt would rise from 1 to 2; the correction exports the lifecycle symbols through `apps/api/src/orders/public-api.ts` and has Uber consume that public boundary instead, so the architecture baseline is not increased. No schema/migration, dependency, Clover protocol, pricing/refund semantics or scanner-baseline relaxation is introduced.  
**Details:** `apps/api/src/orchestration/pos-full-refund-orchestration.service.ts`, `apps/api/src/orders/processors/fulfillment.processor.ts`, `apps/api/src/orders/pos-print-dispatch.contract.ts`, `apps/api/src/pos/pos.gateway.ts`, `docs/architecture/phase-5-commerce-orders-fulfillment.md`.

### 2026-09-07 — Phase 5 closeout adjunct: member marketing-subscription prompt

**PR/SHA:** PR #2222 / final head `00f0b2cd` / squash merge `5abcdb9d`  
**State:** MERGED / CI GREEN — final PR CI #5296 passed API and Web after a formatting-only API lint follow-up  
**Result:** Added a customer-site login/session prompt for unsubscribed members without changing Customer or Benefits persistence. Customer remains the owner of `marketingEmailOptIn`; Benefits exposes a new read-only public capability that previews the currently eligible `MARKETING_OPT_IN` automatic program. Coupon quantity is derived from active program item quantities and reward value is read from the backend program `giftValue`; Web contains no hard-coded coupon count or reward amount. Opt-in still uses the existing Customer consent command and existing Benefits trigger/issuance path. The prompt is excluded from Admin/Accounting and incomplete MFA/login routes; dismissal behavior was subsequently simplified in PR #2226 and then refined to a browser-local daily suppression in the follow-up below.  
**Architecture effect:** adds one explicit Benefits public read port; no deep import, direct persistence read from Web/Customer, scanner allowance, dependency manifest, or schema change.  
**Details:** `apps/api/src/benefits/contracts/coupon-program.contract.ts`, `apps/api/src/membership/membership.controller.ts`, `apps/web/src/components/site/MarketingSubscriptionPrompt.tsx`.

### 2026-09-07 — Member marketing-subscription prompt dismissal simplification

**PR/SHA:** PR #2226 / squash merge `51c1ed6c`  
**State:** MERGED / CI GREEN  
**Result:** Removed the browser-local 30-day dismissal cooldown from `MarketingSubscriptionPrompt`. Dismissal became render-local only as an intermediate behavior; a later full reload or fresh mount could prompt again while the authenticated CUSTOMER remained unsubscribed and Benefits still returned an eligible offer. Marketing consent semantics, Customer ownership, Benefits eligibility/issuance, login/MFA behavior, Prisma schema/migrations, dependencies, and scanner allowances were unchanged.  
**Details:** `apps/web/src/components/site/MarketingSubscriptionPrompt.tsx`, `docs/architecture/phase-5-commerce-orders-fulfillment.md`.

### 2026-09-07 — Member marketing-subscription prompt daily suppression

**State:** LOCAL / REVIEW PENDING  
**Result:** Refined the post-#2226 render-local dismissal into browser-local, per-user, local-calendar-day suppression. Closing the prompt records only the current local date; later reloads or fresh customer-site mounts on the same day remain quiet, while a later local date can prompt again if the CUSTOMER is still unsubscribed and Benefits still reports an eligible offer. Existing pre-#2226 timestamp values do not match the new `YYYY-MM-DD` value and therefore self-heal on the next dismissal. No Prisma schema/migration, dependency, consent, eligibility, issuance, login/MFA, or scanner-boundary change is introduced.  
**Details:** `apps/web/src/components/site/MarketingSubscriptionPrompt.tsx`, `docs/architecture/phase-5-commerce-orders-fulfillment.md`.

### 2026-09-07 — Phase 5 closeout

**PR/SHA:** final merged closeout source includes PR #2216 / `81b79148`, PR #2221 / `554a586d`, and PR #2222 / `5abcdb9d`  
**State:** PRODUCTION VERIFIED / CLOSED  
**Result:** Phase 5 closeout is complete. The consolidated production pass and follow-up fixes are resolved: pure-loyalty zero-external POS checkout is production re-verified, the two historical `UserAddress.addressStableId` rows have been repaired to canonical `c...` values and saved-address resolution is verified, and the durable full-refund/Uber cancellation print boundary is production verified across the API / `ubereats-worker` process split. The member marketing-subscription prompt is merged and CI-green as a closeout adjunct and does not alter Commerce/Orders/Fulfillment ownership. Remaining payment/pricing/refund transaction seams documented by Phase 5 are intentionally retained atomicity boundaries rather than unfinished closeout work. Public SCC remains empty; the final measured direct-debt totals remain Commerce **20**, Store Operations **29**, Commerce -> Runtime **10**.  
**Details:** `docs/architecture/phase-5-commerce-orders-fulfillment.md`, `docs/architecture/current-dependency-graph.md`, `docs/architecture/modularization-worklog.md`.

### 2026-09-07 — Phase 6 Slice 1: POS refund + reverse-sync Orders public-boundary contraction

**PR/SHA:** PR #2231 / final head `f3550efd` / squash merge `1ad42319`  
**State:** MERGED / CI GREEN — PR CI #5318 passed API and Web  
**Result:** Contracts the remaining POS refund/reverse-sync orchestration access to Orders internals without changing payment/refund behavior. `PosCardRefundOrchestrationService` replaces direct `OrderDto` / `OrdersService` imports with the existing Orders public `POS_ORDER_OPERATIONS`, `PosOrderDto` and `PosOrderOperationsPort`; its store-scoped read and public `createFullRefund()` calls retain the same semantics. `PaymentReverseSyncOrchestrationService` injects the same public port and replaces generic `getByStableId(orderStableId)` reads with `getByStableIdForStore(orderStableId, checkout.storeId)`, using the store identity already carried by the prepared checkout; full-refund finalization remains on public `createFullRefund()`. Both focused specs use the public Orders contract, and `payments-architecture.spec.ts` rejects a return to `../orders/orders.service` or `../orders/dto/*` for these two orchestration files. Three production deep imports disappear, so the monotonic `payments-clover -> commerce-orders-fulfillment` allowance contracts **8 -> 5** and Payments/Clover total outgoing direct debt **57 -> 54**; public SCC remains empty. No Orders public API expansion, payment preparation, prepared snapshot, confirmed-payment transaction, `PosGateway`, Web Clover, provider/reconciliation semantics, schema/migration or dependency change is included.  
**Details:** `docs/architecture/phase-6-payments-pos-closeout.md`, `docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`, `apps/api/src/payments/payments-architecture.spec.ts`.

### 2026-09-07 — Phase 6 readiness audit baseline refresh

**PR/SHA:** PR #2232 / final head `f35bcd5f` / squash merge `94cff60f`  
**State:** MERGED / CI GREEN — PR CI #5321 passed API and Web  
**Result:** Normalizes the standalone Phase 6 readiness audit into the canonical Phase 6 architecture document and reconciles it with the merged Slice 1 state, avoiding parallel status files drifting apart. The refresh preserves the original identity/atomicity findings: `PreparedPaymentOrderSnapshot.userId` is an internal User DB identity and the current snapshot must not be directly exported as a cross-context public contract; confirmed-payment Benefits Tender/Coupon COMMIT + Order creation remains a high-sensitivity atomic transaction seam. A local, unpushed preparation-boundary draft that violated the snapshot identity guard was rejected and was not delivered. The next candidate is therefore payment-preparation contract normalization before any stable-ID-only public preparation boundary. No production source, architecture allowance, schema/migration, dependency, route, payment/provider behavior or Web Clover behavior changed in this docs-only refresh.  
**Details:** `docs/architecture/phase-6-payments-pos-closeout.md`, `docs/architecture/current-dependency-graph.md`, `docs/architecture/modularization-worklog.md`.

### 2026-09-07 — Phase 6 Slice 1B: prepared-payment V2 stable-identity normalization

**PR/SHA:** PR #2233 / final head `0a2a01d8` / squash merge `be21c8c5`  
**State:** MERGED / CI GREEN — PR CI #5326 passed API and Web  
**Result:** Normalizes the POS Terminal unified-payment prepared snapshot to V2 before exposing any Orders public preparation capability. V2 removes persisted `User.id`, `Coupon.id`, pre-generated `OrderItem.id`, and `UserCoupon.id`; renames snapshot `storeId` to `storeStableId`; narrows the persisted order payload to finalization facts; and carries assigned-coupon selection only as `reserveAssignedCoupon` while Benefits resolves its own `UserCoupon` through `(userStableId, couponStableId)`. Unified-payment idempotency hashing no longer depends on internal `selectedUserCouponId` or `checkoutIntentId`; the assigned-coupon choice is represented only by the same boolean business intent. Confirmed-payment finalization late-resolves `Order.userId`, obtains `Order.couponId` from the already-held coupon inside the existing atomic transaction, verifies the committed coupon stable ID against the prepared snapshot, and lets the DB generate OrderItem UUIDs during Order creation. Preparation-side coupon/member validation also stays on the existing stable-ID `ORDER_BENEFITS_READER` public read, with Benefits serializing `expiresAt` into the order-facing snapshot while keeping DB identities internal. The user explicitly selected a V2-only non-business-hours cutover; read-only production audit immediately before implementation found `PaymentCheckoutAttempt = 0`, so no V1 adapter/data migration is retained and non-V2 rows fail explicitly. The existing Benefits Tender/Coupon COMMIT + Order creation + durable `order.accepted` Prisma transaction is not split; Web Clover/provider/refund/reconciliation/pricing/POS transport/schema/dependencies remain unchanged. This slice changes no direct-import allowance: Payments -> Commerce remains **5**, Payments total **54**, public SCC remains empty.  
**Details:** `apps/api/src/orders/orders.service.ts`, `apps/api/src/orchestration/payment-checkout-attempt.service.ts`, `apps/api/src/benefits/contracts/payment-benefit-reservation.contract.ts`, `apps/api/src/membership/membership.service.ts`, focused characterization specs, `apps/api/src/payments/payments-architecture.spec.ts`, `docs/architecture/phase-6-payments-pos-closeout.md`, `docs/architecture/current-dependency-graph.md`.

### 2026-09-07 — Phase 6 Slice 1C: stable-ID-only Orders public payment-preparation boundary

**PR/SHA:** PR #2234 / final head `a042ea10` / squash merge `bf95051f`  
**State:** MERGED / CI GREEN — PR CI #5329 passed API and Web  
**Result:** Moves the already-normalized V2 payment-preparation capability behind an Orders-owned public port without changing the persisted payment draft or payment behavior. `payment-order-preparation.contract.ts` now owns `PAYMENT_ORDER_PREPARATION`, `PaymentOrderPreparationPort` and the V2 snapshot/pricing/tender/item types previously declared in `orders.service.ts`; `OrdersService` implements that port and `OrdersModule` exposes it with `useExisting` so no duplicate Orders service instance is created. `PaymentCheckoutAttemptService` injects the public token and no longer deep-imports `orders.service`; its focused spec mocks the public port, while `payments-architecture.spec.ts` requires the public import/token and `useExisting` binding and forbids the concrete preparation import from returning. The monotonic direct-import baseline contracts `payments-clover -> commerce-orders-fulfillment` **5 -> 4**, reducing Payments/Clover total outgoing direct debt **54 -> 53**; CI #5329 confirmed the architecture baseline and public SCC remained empty. Confirmed-payment finalization, the two OrdersModule composition imports, production Web Clover legacy controller, V2 persisted JSON, Benefits HOLD/COMMIT/RELEASE behavior, provider/reconciliation/refund behavior, Prisma schema/migrations and dependencies are explicitly unchanged.  
**Details:** `apps/api/src/orders/payment-order-preparation.contract.ts`, `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/orders.module.ts`, `apps/api/src/orders/public-api.ts`, `apps/api/src/orchestration/payment-checkout-attempt.service.ts`, `apps/api/src/payments/payments-architecture.spec.ts`, `tools/architecture/context-baseline.json`, `docs/architecture/phase-6-payments-pos-closeout.md`, `docs/architecture/current-dependency-graph.md`.

### 2026-09-08 — Phase 6 Slice 2A: POS payment realtime public-boundary contraction

**PR/SHA:** PR #2235 / final head `6169d4dd` / squash merge `b1051c24`  
**State:** MERGED / CI GREEN — PR CI #5332 passed API and Web  
**Result:** Contracts the two Payment orchestration dependencies on concrete `PosGateway` behind a POS-owned `POS_PAYMENT_REALTIME` / `PosPaymentRealtimePort` capability. The new `pos-payment-realtime.contract.ts` contains only the status/reverse-sync fields actually emitted by the existing Socket.IO methods; it does not import Payments or Clover and does not take ownership of payment truth. `PosGateway` implements the port, `PosDeviceModule` exposes it with `useExisting`, and `pos/public-api.ts` publishes the token/port/message types. `PosCardPaymentOrchestrationService` and `PaymentReverseSyncOrchestrationService` now inject the public token while retaining their existing best-effort realtime `try/catch`, so publication failure remains advisory and cannot change persisted Payment/Checkout/Order truth. Socket.IO event names and payloads are unchanged, as are `PosCardPaymentFeatureConfig`, `PosDeviceGuard`, full-refund `PosOrdersService`, module composition, confirmed-payment atomicity, provider/reconciliation/refund/surcharge behavior, Web Clover, schema/migrations and dependencies. Focused specs mock the public port and `payments-architecture.spec.ts` prevents regression to `pos.gateway` while guarding the `useExisting` binding and no POS -> Payments/Clover contract dependency. The monotonic baseline contracts `payments-clover -> store-operations-pos-print` **11 -> 9**, reducing Payments/Clover total direct debt **53 -> 51**; CI #5332 confirmed the architecture baseline and public SCC remained empty.  
**Details:** `apps/api/src/pos/pos-payment-realtime.contract.ts`, `apps/api/src/pos/pos.gateway.ts`, `apps/api/src/pos/pos-device.module.ts`, `apps/api/src/pos/public-api.ts`, `apps/api/src/orchestration/pos-card-payment-orchestration.service.ts`, `apps/api/src/orchestration/payment-reverse-sync-orchestration.service.ts`, focused specs, `apps/api/src/payments/payments-architecture.spec.ts`, `tools/architecture/context-baseline.json`, `docs/architecture/phase-6-payments-pos-closeout.md`, `docs/architecture/current-dependency-graph.md`, `docs/payments/clover-pos-integration-charter.md`.

### 2026-09-08 — Phase 6 Slice 2B: POS transport / composition public-surface contraction

**PR/SHA:** PR #2236 / final head `db442930` / squash merge `e2d72e17`  
**State:** MERGED / CI GREEN — CI #5335 passed API and Web after the initial CI #5334 barrel failure  
**Result:** Safely contracts four Payments -> POS implementation-path imports without changing ownership or runtime behavior. `pos/public-api.ts` exports the existing `PosDeviceGuard` alongside the already-public `PosDeviceModule`; the three Payment/POS controllers consume `PosDeviceGuard` from that public surface, and `PosCardPaymentOrchestrationModule` consumes `PosDeviceModule` from the same surface. The initial reviewed attempt also re-exported `PosModule`, which architecture/lint/build/strict accepted, but API CI exposed broad runtime circular initialization: 52 suites failed while loading modules with `ZodValidationPipe is not a constructor` or invalid Nest guard decorators. The remediation therefore removes `PosModule` from the lightweight barrel and retains the existing direct `PosModule` Nest composition import, consistent with the rule that legal composition should not be hidden behind a facade merely to reduce counts. `payments-architecture.spec.ts` guards the three controller edges and `PosDeviceModule` public import and prevents `PosModule` from returning to that barrel. The monotonic baseline contracts `payments-clover -> store-operations-pos-print` **9 -> 5**, reducing Payments/Clover total direct debt **51 -> 47**; CI #5335 confirmed the architecture baseline and public SCC remained empty. `PosCardPaymentFeatureConfig`, the legal `PosModule` composition edge, full-refund `PosOrdersService`/`PosCreateFullRefundInput`, refund policy, confirmed-payment atomicity, provider/reconciliation/refund truth, Prisma schema/migrations, dependencies and Web Clover remain unchanged.  
**Details:** `apps/api/src/pos/public-api.ts`, `apps/api/src/orchestration/pos-card-payment.controller.ts`, `apps/api/src/orchestration/pos-card-refund.controller.ts`, `apps/api/src/orchestration/pos-full-refund.controller.ts`, `apps/api/src/orchestration/pos-card-payment-orchestration.module.ts`, `apps/api/src/payments/payments-architecture.spec.ts`, `tools/architecture/context-baseline.json`, `docs/architecture/phase-6-payments-pos-closeout.md`, `docs/architecture/current-dependency-graph.md`.

### 2026-09-08 — Phase 6 Slice 2C: POS full-refund management public-capability contraction

**PR/SHA:** PR #2237 / final head `e76c5087` / squash merge `51dd19ec`  
**State:** MERGED / CI GREEN — PR CI #5338 passed API and Web  
**Result:** Replaces the three remaining Payments -> POS full-refund implementation-path imports with a narrow POS-owned `POS_FULL_REFUND_MANAGEMENT` capability. `pos-full-refund-management.contract.ts` contains only the stable store/order identities, existing manual full-refund request facts and historical result shape; it uses shared order payment-method types and a type-only Orders public DTO, with no Prisma, Payments or Clover dependency. Existing `PosOrdersService.createFullRefund()` remains the implementation and retains all Store Operations policy: store-scoped order lookup, Web external-payment gate, Uber manual-flow exclusion, amendable-status checks, operator/reason validation and audit decoration. `PosModule` binds the token with `useExisting: PosOrdersService`, exports the token instead of the concrete service, and internal POS controllers still receive the same service instance. `PosFullRefundOrchestrationService` injects the public port while preserving managed refund semantics: only `LEGACY_MANUAL_REQUIRED` uses POS management; managed success, uncertainty/reconciliation and definitive failure behavior are unchanged. `PosFullRefundController` consumes the public input contract with the same route/Zod payload. Focused tests mock the public port, and `payments-architecture.spec.ts` locks the public import, `useExisting` binding, concrete-service non-export and no Prisma/Payments/Clover leakage. The monotonic baseline contracts `payments-clover -> store-operations-pos-print` **5 -> 2**, reducing Payments/Clover total direct debt **47 -> 44**; PR CI #5338 confirmed the architecture gate and public SCC remained empty. The remaining pair is `PosModule` legal Nest composition plus `PosCardPaymentFeatureConfig`.  
**Details:** `apps/api/src/pos/pos-full-refund-management.contract.ts`, `apps/api/src/pos/pos-orders.service.ts`, `apps/api/src/pos/pos.module.ts`, `apps/api/src/pos/public-api.ts`, `apps/api/src/orchestration/pos-full-refund-orchestration.service.ts`, `apps/api/src/orchestration/pos-full-refund.controller.ts`, `apps/api/src/orchestration/pos-full-refund-orchestration.service.spec.ts`, `apps/api/src/payments/payments-architecture.spec.ts`, `tools/architecture/context-baseline.json`, `docs/architecture/phase-6-payments-pos-closeout.md`, `docs/architecture/current-dependency-graph.md`, `docs/payments/clover-pos-integration-charter.md`.

### 2026-09-08 — Phase 6 Slice 2D: POS CARD legacy rollout seam quarantine / terminal-cutover ownership decision

**PR/SHA:** PR #2238 / final head `5e35bd7f` / squash merge `37f3e939`  
**State:** MERGED / CI GREEN — CI #5340 passed API and Web  
**Result:** Records the terminal end-state explicitly instead of promoting the migration flag into permanent architecture. `PosCardPaymentFeatureConfig` remains temporary implementation of registered compatibility `payments.pos-card-legacy.v1`; it is neither exported as a new POS public feature-policy capability nor moved into Payments. While legacy direct-paid CARD and Unified Payment Core + Clover Terminal coexist, the existing flag remains only for controlled rollout/cutback. After POS ↔ Clover Terminal realtime synchronization/recovery is complete, real-device acceptance passes, one settlement cycle reconciles, the production stability window is clean and legacy invocation reaches zero, the legacy direct-paid CARD route, route-choice branches, `PosCardPaymentFeatureConfig`, `POS_CLOVER_TERMINAL_PAYMENT_ENABLED` and legacy refund compatibility are deleted together in the dedicated Phase J contraction. The target CARD architecture therefore has no lasting route-choice policy: POS always enters Unified Payment Core and every new CARD Order must ultimately be traceable to canonical PaymentTransaction truth. Dependency counts intentionally stay unchanged at Payments -> POS **2** and Payments total **44**; the other retained pair edge remains legal `PosModule` Nest composition.  
**Details:** `docs/architecture/phase-6-payments-pos-closeout.md`, `docs/architecture/current-dependency-graph.md`, `docs/architecture/active-compatibility-register.json`, `docs/architecture/active-compatibility-register.md`, `docs/payments/clover-pos-phase-plan.md`, `docs/payments/clover-pos-integration-charter.md`.

### 2026-09-08 — Phase 6 Slice 3A: Confirmed-payment Order identity normalization

**PR/SHA:** PR #2239 / final head `782da646` / squash merge `239d8f74`  
**State:** MERGED / CI GREEN — PR CI #5343 passed API and Web  
**Result:** Removes Orders-owned UUID plumbing from the pre-production Unified Payment checkout before creating a future public finalization boundary. A fresh read-only production audit immediately before implementation found `PaymentCheckoutAttempt = 0` and `PaymentTransaction = 0`. `PaymentCheckoutAttempt.plannedOrderId/orderId` are removed with a user-authorized fail-closed contraction migration; checkout persistence/recovery now carries only `orderStableId`. `OrdersService.createFromConfirmedPaymentSnapshot()` no longer accepts/returns `internalOrderId`: the paid Order is created first inside the existing Orders-owned Prisma transaction so Prisma/DB owns `Order.id`, then Points/Balance and Coupon/UserCoupon holds COMMIT against that internal UUID, the coupon relation is bound, and durable `order.accepted` is written before the same transaction commits. Any COMMIT/validation failure therefore rolls the Order creation back as before. POS managed refund no longer requires or passes an Order UUID to `RefundPaymentService`; newly created POS Terminal refund/void PaymentTransactions retain `orderId = null`. `PaymentTransaction.orderId` itself deliberately remains nullable and unchanged; before Web Unified Payment migration, Payments will separately decide the long-term stable Order reference rather than widening Slice 3A. Architecture guards prevent checkout `plannedOrderId/orderId`, confirmed-payment `internalOrderId` plumbing and POS refund Order-UUID coupling from returning. Direct-import counts intentionally remain `payments-clover -> commerce-orders-fulfillment = 4` and Payments total **44**; Slice 3B will perform the public-boundary contraction. No local lint/build/test/scanner execution or migration application is claimed per repository workflow.  
**Details:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260908155000_contract_payment_checkout_order_db_ids/migration.sql`, `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/orders-payment-finalization.characterization.spec.ts`, `apps/api/src/orchestration/payment-checkout-attempt.service.ts`, `apps/api/src/orchestration/payment-checkout-attempt.service.spec.ts`, `apps/api/src/orchestration/pos-card-payment-orchestration.service.ts`, `apps/api/src/orchestration/pos-card-payment-orchestration.service.spec.ts`, `apps/api/src/orchestration/pos-card-refund-orchestration.service.ts`, `apps/api/src/orchestration/pos-card-refund-orchestration.service.spec.ts`, `apps/api/src/orchestration/payment-reverse-sync-orchestration.service.spec.ts`, `apps/api/src/payments/application/refund-payment.service.ts`, `apps/api/src/payments/application/refund-payment.service.spec.ts`, `apps/api/src/payments/payments-architecture.spec.ts`, `docs/architecture/phase-6-payments-pos-closeout.md`, `docs/architecture/current-dependency-graph.md`, `docs/payments/clover-pos-integration-charter.md`, `docs/payments/clover-pos-phase-plan.md`.

### 2026-09-08 — Phase 6 Slice 3B: Confirmed-payment finalization public-boundary contraction

**PR/SHA:** PR #2240 / final head `6eb4b38c` / squash merge `893fde49`  
**State:** MERGED / CI GREEN — CI #5346 passed API and Web  
**Result:** Replaces the remaining Unified POS CARD confirmed-payment `PosCardPaymentOrchestrationService -> OrdersService` business dependency with an Orders-owned `PAYMENT_ORDER_FINALIZATION` public capability. `payment-order-finalization.contract.ts` reuses the V2 prepared snapshot and exposes only stable/business finalization input plus `orderStableId`, `orderNumber` and `pickupCode`; it contains no Prisma type, transaction client, internal DB UUID, Payments/Clover dependency or full `OrderDto`. Existing `OrdersService` implements the port and remains the single finalization implementation via `useExisting`; its Prisma transaction still owns paid Order creation, Points/Balance and Coupon/UserCoupon COMMIT, coupon binding and durable `order.accepted`, with post-commit paid side effects unchanged. `PosCardPaymentOrchestrationService` injects the public token and reuses `POS_ORDER_OPERATIONS.getByStableIdForStore()` for completed-checkout recovery, so no extra read facade is created. Architecture/focused tests lock the public binding, stable-only result and no concrete OrdersService regression. The monotonic baseline contracts `payments-clover -> commerce-orders-fulfillment` **4 -> 3**, reducing Payments/Clover total direct debt **44 -> 43**; the remaining pair consists of the protected Web Clover controller and two explicit OrdersModule composition imports. No Prisma/schema, provider, surcharge, UNKNOWN/reconciliation, refund, Terminal feature, printing or production Web Clover behavior is changed. No local lint/build/test/scanner run is claimed per repository workflow.  
**Details:** `apps/api/src/orders/payment-order-finalization.contract.ts`, `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/orders.module.ts`, `apps/api/src/orders/public-api.ts`, `apps/api/src/orders/orders-payment-finalization.characterization.spec.ts`, `apps/api/src/orchestration/pos-card-payment-orchestration.service.ts`, `apps/api/src/orchestration/pos-card-payment-orchestration.service.spec.ts`, `apps/api/src/payments/payments-architecture.spec.ts`, `tools/architecture/context-baseline.json`, `docs/architecture/phase-6-payments-pos-closeout.md`, `docs/architecture/current-dependency-graph.md`, `docs/payments/clover-pos-integration-charter.md`, `docs/payments/clover-pos-phase-plan.md`.

### 2026-09-08 — Phase 6 Slice 4A: Payments orchestration composition cleanup

**PR/SHA:** PR #2241 / final head `d38dce42` / squash merge `00768897`  
**State:** MERGED / CI GREEN — PR CI #5348 passed API and Web  
**Result:** Normalizes the two remaining Orders Nest composition edges without changing payment behavior. `clover-web-checkout-orchestration.module.ts` and `pos-card-payment-orchestration.module.ts` now import the existing `OrdersModule` class through `../orders/public-api` instead of the implementation path `../orders/orders.module`; their Nest imports/controllers/providers remain unchanged, `orders/public-api.ts` is not widened, and no wrapper/facade module is introduced. The established Orders barrel is already consumed by `AppModule` and `PosModule`, and readiness review found no Orders -> Payments reverse runtime/public import that would turn this into the failed Slice 2B `PosModule` eager-cycle pattern. `payments-architecture.spec.ts` adds a source-specific guard preventing either module from regressing to the deep path, and `orders-public-composition.smoke.spec.ts` imports both orchestration modules so CI exercises the new barrel at runtime and catches eager initialization/cycle failures. Scanner semantics remain explicit: the Payments -> Orders dependency still exists as public composition traffic, while implementation-path debt contracts `payments-clover -> commerce-orders-fulfillment` **3 -> 1** and Payments/Clover total direct debt **43 -> 41**. The sole remaining direct Orders edge is the protected production Web `clover-pay.controller.ts -> OrdersService` compatibility seam. Production Web Clover checkout/validation/surcharge/reconciliation/finalization/refund behavior, POS Terminal flow, Orders transaction boundaries, Benefits reservation semantics, Prisma/schema, dependencies and provider protocols are unchanged.  
**Details:** `apps/api/src/orchestration/clover-web-checkout-orchestration.module.ts`, `apps/api/src/orchestration/pos-card-payment-orchestration.module.ts`, `apps/api/src/orchestration/orders-public-composition.smoke.spec.ts`, `apps/api/src/payments/payments-architecture.spec.ts`, `tools/architecture/context-baseline.json`, `docs/architecture/phase-6-payments-pos-closeout.md`, `docs/architecture/current-dependency-graph.md`.

### 2026-09-08 — Phase 6 post-4A Clover sandbox/config sequencing decision

**PR/SHA:** PR #2242 / final head `deb2e8c6` / squash merge `e12217a3`  
**State:** MERGED / CI GREEN — CI #5350 passed API and Web; docs/governance only  
**Result:** Records the approved Phase 6 execution sequence after 4A. Slice 4B remains the next implementation and is restricted to the completed readiness scope: relocate `CloverPlatformPaymentsGateway` plus Platform v3 canonical HTTP/raw mapping into `payments/infrastructure/clover/platform/**`, remove unused `PaymentsModule` exports, and add infrastructure-leakage guards while preserving Web Ecommerce, OAuth, Terminal, webhook and Prisma behavior. Slice 4C then introduces fail-closed configuration isolation between live Web Ecommerce production config, new `CLOVER_UNIFIED_*` merchant/OAuth/Platform config, and Terminal-only device/REST Pay config; no Unified/Terminal path may fall back to the live Web merchant/token/base URL. Slice 4D converges Platform/Terminal access-token use on the database-backed `CloverMerchantAccessTokenService` and removes the static Terminal OAuth token path. Test Merchant OAuth, Platform v3 read, Cloud Pay Display/device availability and controlled sandbox financial verification follow 4D; Web Unified Payment readiness/migration stays later. The decision intentionally adds no Prisma migration: one runtime/store keeps one active Unified merchant binding, and a future production binding requires deliberate sandbox revoke/unbind. The dependency graph/baseline is unchanged by this docs-only planning batch.  
**Details:** `docs/architecture/phase-6-payments-pos-closeout.md`, `docs/architecture/current-dependency-graph.md`, `docs/payments/clover-pos-phase-plan.md`, `docs/payments/clover-pos-integration-charter.md`.

### 2026-09-08 — Phase 6 Slice 4B: Clover provider internal capability cleanup

**PR/SHA:** PR #2243 / squash merge `aa765f9d`  
**State:** MERGED / CI GREEN — merged-dev CI #5354 passed API and Web  
**Result:** Moves the existing `CloverPlatformPaymentsGateway` and its Platform v3 canonical payment/reversal mapping, HTTP read, timeout and OAuth-refresh retry logic out of `clover-payment-provider.adapter.ts` into `payments/infrastructure/clover/platform/clover-platform-payments.gateway.ts` without changing provider result/status semantics. `CloverPaymentProviderAdapter` continues to inject the same gateway and preserves Web Ecommerce/Terminal routing, canonicalization ordering and observation merge behavior; `CloverProviderInfrastructureModule` provides the relocated gateway as before. `PaymentsModule` stops exporting `PAYMENT_PROVIDER` and `CreatePaymentAttemptUseCase`, while both remain internal bindings. Existing provider tests retain the same behavior coverage with only the gateway import path changed. Architecture guards require the gateway implementation to stay under Platform infrastructure, forbid Platform HTTP/raw mapping from returning to the adapter, keep concrete Platform infrastructure unavailable to orchestration/POS/Orders, and lock the two removed module exports. This is intra-context cleanup only: `context-baseline.json` remains unchanged, `payments-clover -> commerce-orders-fulfillment = 1`, Payments/Clover direct debt remains **41**, and no new public SCC/context edge is introduced. Production Web `CloverPayController -> CloverService -> CloverEcommerceTransport`, `/v1/charges`, surcharge/validation/finalization/refund behavior, OAuth/credential semantics, Terminal protocol, webhook behavior, Prisma/schema, deployment config and rollout flags are unchanged. No local lint/build/test/scanner execution is claimed per repository workflow.  
**Details:** `apps/api/src/payments/infrastructure/clover/platform/clover-platform-payments.gateway.ts`, `apps/api/src/payments/infrastructure/clover/clover-payment-provider.adapter.ts`, `apps/api/src/payments/infrastructure/clover/clover-provider-infrastructure.module.ts`, `apps/api/src/payments/infrastructure/clover/clover-payment-provider.adapter.spec.ts`, `apps/api/src/payments/payments.module.ts`, `apps/api/src/payments/payments-architecture.spec.ts`, `docs/architecture/phase-6-payments-pos-closeout.md`, `docs/architecture/current-dependency-graph.md`, `docs/payments/clover-pos-phase-plan.md`.

### 2026-09-08 — Phase 6 Slice 4C: Unified/Sandbox configuration isolation

**PR/SHA:** PR #2244 / final head `31efc862` / squash merge `bc96c706`  
**State:** MERGED / CI GREEN — PR CI #5358 and merged-dev CI #5359 passed API and Web  
**Result:** Separates Clover runtime configuration into three explicit purposes without cutting payment traffic. The guarded live Web Ecommerce path continues using `CLOVER_BASE`, `CLOVER_MERCHANT_ID`, `CLOVER_ACCESS_TOKEN` and the existing browser `NEXT_PUBLIC_CLOVER_*` wiring. Unified merchant identity, Store mapping, Platform v3 and OAuth now consume only `CLOVER_UNIFIED_*`; missing Unified merchant/base/OAuth endpoints or Store mapping fails closed before credential/provider traffic and no longer defaults to production Clover endpoints. Terminal REST Pay now requires its own API base, device ID, Remote App ID and valid 10-300 second timeout, with the pre-4D `CLOVER_TERMINAL_OAUTH_TOKEN` remaining temporary; missing/invalid Terminal configuration reports `MISCONFIGURED` and does not inherit the Web base/token. Production webhook ingress remains bound to the live Web merchant/auth scope. `docker-compose.yml` adds only operator-injected Unified/Terminal placeholders, and focused config/OAuth/Platform/Terminal tests plus architecture guards lock the no-fallback rule. No Prisma/schema, dependency, route, provider wire shape, persisted payment fact, `POS_CLOVER_TERMINAL_PAYMENT_ENABLED` behavior or Web `/v1/charges` execution changes. This is intra-context configuration isolation only: `payments-clover -> commerce-orders-fulfillment` remains **1**, Payments/Clover direct debt remains **41**, and the public SCC/context graph is unchanged. Per repository workflow, no local lint/build/test/scanner execution was claimed; remote validation later passed through PR CI #5358 and merged-dev CI #5359.  
**Details:** `apps/api/src/payments/infrastructure/clover/clover-provider.config.ts`, `apps/api/src/payments/infrastructure/clover/clover-provider.config.spec.ts`, `apps/api/src/payments/infrastructure/clover/ecommerce/clover-ecommerce.transport.ts`, `apps/api/src/payments/infrastructure/clover/platform/**`, `apps/api/src/payments/infrastructure/clover/oauth/**`, `apps/api/src/payments/infrastructure/clover/terminal/clover-terminal.transport.ts`, `apps/api/src/payments/infrastructure/clover/webhook/clover-payment-webhook-ingress.adapter.ts`, `apps/api/src/payments/payments-architecture.spec.ts`, `docker-compose.yml`, `apps/api/README.md`, `docs/architecture/phase-6-payments-pos-closeout.md`, `docs/architecture/current-dependency-graph.md`, `docs/payments/clover-pos-phase-plan.md`, `docs/payments/clover-pos-integration-charter.md`.

### 2026-09-08 — Phase 6 Slice 4D: Unified Clover OAuth credential convergence

**PR/SHA:** PR #2245 / final head `c665b469` / squash merge `1cc4a829`  
**State:** MERGED / CI GREEN / DEPLOYED / NON-DEVICE CLOVER SANDBOX VERIFIED — PR CI #5361 and post-merge CI #5362 passed API and Web  
**Result:** Removes the Terminal prototype static-token path without changing payment routing. `CloverProviderConfig` no longer exposes `terminalAccessToken`, `docker-compose.yml` no longer accepts `CLOVER_TERMINAL_OAUTH_TOKEN`, and `CloverTerminalTransport` now resolves `CLOVER_UNIFIED_MERCHANT_ID` through the existing database-backed `CloverMerchantAccessTokenService` used by Platform v3. Terminal static device/base/RAID/timeout configuration remains synchronous and internal; credential resolution occurs immediately before outbound HTTP. HTTP 401 triggers one forced credential refresh and one retry using the same idempotency key. Pre-send credential unavailability is reported separately from network uncertainty so Sale/Refund/Void fail closed with no provider request when no usable Unified authorization exists, while actual socket/timeout loss after an outbound request remains `UNKNOWN` for reconciliation. Focused tests cover Unified-token Authorization, 401 refresh/retry, no Web `CLOVER_ACCESS_TOKEN` fallback, `fetch=0` credential failure, and existing network-loss semantics. The merged source is deployed on the production SanQ runtime with Terminal routing still disabled. Test Merchant OAuth now persists an `ACTIVE` authorization for `4750_Yonge_Street`; the verified sandbox app permissions are Merchant READ + Payments READ + Orders READ with Ecommerce enabled and no write permissions. A first canonical Platform v3 read returned 403 while Orders READ was absent because the payment expansion includes `order`; after Test App permission update, reinstall and reauthorization, the same deliberate nonexistent-payment query returned HTTP 200 and `CLOVER_PLATFORM_PAYMENT_NOT_FOUND`. Natural access-token expiry then verified database-backed refresh/rotation (`tokenVersion 2 -> 3`, `refreshedAt` set, access/refresh expiries advanced), and an API recreate successfully reloaded the credential key ring, decrypted the rotated database credential and repeated the Platform read without another refresh. The exceptional 401 force-refresh retry remains covered by automated tests rather than by corrupting a valid deployed credential. No Prisma/schema, package dependency, public Payments/POS contract, provider wire shape, rollout flag, Web `/v1/charges`, production webhook scope, graph allowance, or context SCC changes result from 4D or this non-device verification. Cloud Pay Display/device availability and Terminal Sale/reconciliation/refund/recovery/full POS acceptance remain pending a Clover Dev Kit and explicit test window.  
**Details:** `apps/api/src/payments/infrastructure/clover/clover-provider.config.ts`, `apps/api/src/payments/infrastructure/clover/clover-provider.config.spec.ts`, `apps/api/src/payments/infrastructure/clover/terminal/clover-terminal.transport.ts`, `apps/api/src/payments/infrastructure/clover/clover-payment-provider.adapter.spec.ts`, `apps/api/src/payments/payments-architecture.spec.ts`, `docker-compose.yml`, `apps/api/README.md`, `docs/architecture/phase-6-payments-pos-closeout.md`, `docs/architecture/current-dependency-graph.md`, `docs/payments/clover-pos-phase-plan.md`, `docs/payments/clover-pos-integration-charter.md`.

### 2026-09-09 — Phase 6 Web Clover cutover readiness audit / payment freeze decision

**PR/SHA:** PR #2248 / final head `c71efbf1` / squash merge `fcc0b7c1`  
**State:** MERGED / CI GREEN — PR CI #5369 passed API and Web  
**Result:** Records the completed read-only Web Clover cutover readiness audit against the latest Phase 6/Test Merchant baseline. The audit classifies Ecommerce `POST /v1/charges` as the protected Web execution path and Platform REST v3 as the future canonical payment/refund truth, but finds that a safe Web migration cannot be reduced to swapping status transports: Web v1-success/v3-not-yet-visible must become `UNKNOWN/RECONCILING`, current Orders payment preparation/finalization remains `in_store`-only, and `CheckoutIntent` still owns active Web session/contact/locale/delivery/3DS context. Read-only production evidence at audit time found 11 CheckoutIntents (5 pending / 3 failed / 3 completed), 6 with Clover payment/external IDs, no recorded positive surcharge metadata, 41 Web CARD Orders with no positive persisted card surcharge, and one historical refunded Web CARD Order without a linked CheckoutIntent. The active Unified OAuth binding still targets the Test Merchant, so production Web payment IDs cannot provide meaningful v3 shadow parity there. By operator decision, Web Unified Payment migration, production v3 shadow reads, Web refund migration and legacy cleanup are deferred until Test App/device acceptance is complete and the app is installed/authorized against the operating production Clover merchant; a fresh production-merchant readiness/correlation audit is required before Phase G resumes. This docs-only governance batch changes no production source, Prisma/schema/migration, dependency, route, payment/provider behavior, persisted fact, scanner allowance or architecture baseline: `payments-clover -> commerce-orders-fulfillment` remains **1**, Payments/Clover direct debt remains **41**, and public SCC remains empty.  
**Details:** `docs/architecture/phase-6-payments-pos-closeout.md`, `docs/architecture/current-dependency-graph.md`, `docs/payments/clover-pos-phase-plan.md`, `docs/payments/clover-pos-integration-charter.md`, `docs/architecture/modularization-worklog.md`.

### 2026-09-09 — Phase 6 modularization source / architecture closeout

**PR/SHA:** PR #2249 / final head `3a5619ee` / squash merge `376a7c37`  
**State:** MERGED / CI GREEN — PR CI #5371 passed API and Web  
**Result:** Closes the Phase 6 modularization source/architecture scope without misrepresenting the deferred Clover provider gates as production acceptance. Payments/Clover direct source debt has contracted **57 -> 41**, public SCC remains empty, the stable-ID-only prepared-payment and confirmed-payment finalization boundaries are established, Clover Platform/Terminal infrastructure ownership and credential configuration are explicit, and the sole remaining direct Payments -> Orders implementation seam is the intentionally protected production Web compatibility path. Terminal device financial acceptance remains under `payments.pos-card-legacy.v1`; Web Unified Payment migration remains under `payments.web-checkout-v1.v1` and is explicitly frozen until Test App/device acceptance plus operating-production-merchant install/OAuth and a fresh correlation audit. The compatibility register is refreshed to remove the obsolete `Before Phase 5B exit` deadline and make those continuation gates authoritative. Phase 6 is therefore marked `MODULARIZATION SOURCE / ARCHITECTURE CLOSEOUT COMPLETE`, not `PRODUCTION VERIFIED / CLOSED`, and non-payment bounded-context work may proceed without reopening payment seams. No production source, route, payment/provider behavior, Prisma/schema/migration, dependency, persisted fact, scanner allowance or dependency count changes in this docs-only closeout.  
**Details:** `docs/architecture/phase-6-payments-pos-closeout.md`, `docs/architecture/active-compatibility-register.md`, `docs/architecture/active-compatibility-register.json`, `docs/architecture/current-dependency-graph.md`, `docs/architecture/modularization-worklog.md`.

### 2026-09-09 — Phase 7 Slice 1: POS staff-auth public-boundary contraction

**PR/SHA:** PR #2250 / final head `4b44debc` / squash merge `66f29561`  
**State:** MERGED / CI GREEN — final PR CI #5374 passed API and Web; initial #5373 failed only Prettier formatting in the new architecture assertions before the formatting-only final head  
**Result:** Contracts the Store Operations / POS staff-auth transport dependency onto the already-existing Identity public surface without changing runtime authorization behavior. `pos-orders.controller.ts`, `pos-store-status.controller.ts`, `pos-summary.controller.ts`, and `pos-exchange-rate.controller.ts` now import `SessionAuthGuard`, `RolesGuard`, and `Roles` from `auth/public-api.ts`; `pos.module.ts` imports `RolesGuard` from the same public surface while intentionally retaining the direct `AuthModule` Nest composition import. The POS device-management architecture spec guards the four controllers against returning to Identity guard/decorator implementation paths, verifies the required Identity public exports, and pins the retained direct seam to `PosModule -> AuthModule`. The monotonic scanner allowance contracts `store-operations-pos-print -> identity-customer-benefits` **14 -> 1**, reducing Store Operations / POS / Print total direct debt **29 -> 16** while public SCC remains empty. No route, guard ordering/role semantics, POS device credential behavior, Orders/Payments/Clover/Uber/printing behavior, Prisma/schema/migration, dependency manifest/lockfile, or compatibility path changes.  
**Details:** `docs/architecture/phase-7-store-operations-pos-print.md`, `docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`, `apps/api/src/pos/pos-device-management.architecture.spec.ts`, `docs/architecture/modularization-worklog.md`.

### 2026-09-09 — Phase 7 Slice 2: Brand/Store status read-capability contraction

**PR/SHA:** PR #2251 / final head `424d06fa` / squash merge `8f78f0b5`  
**State:** MERGED / CI GREEN — final PR CI #5378 passed API and Web after two Prettier-only lint follow-ups  
**Result:** Contracts the two remaining Store Operations / POS / Print -> Brand/Store implementation imports without changing store-status or watchdog behavior. Brand/Store now owns a narrow `STORE_STATUS_READER` / `StoreStatusReaderPort` capability with only `isOpenBySchedule`, `isTemporarilyClosed`, `timezone`, and `today.date/closeMinutes`; `StoreStatusModule` binds it to the existing `StoreStatusService` through `useExisting` and exports the token while `store/public-api.ts` exposes the token/port/snapshot and module but not the concrete service. `StoreStatusService` stops re-importing `./public-api` and consumes its own config/schedule contracts directly so the new public module export does not create a barrel runtime cycle. `PosConnectivityWatchdogService` injects the public port and `PosModule` consumes `StoreStatusModule` through `store/public-api`. Architecture guards lock the narrow public surface, token binding and no-cycle rule. The monotonic `store-operations-pos-print -> brand-store` allowance is removed **2 -> 0**, reducing Store Operations / POS / Print total direct debt **16 -> 14**; final CI confirmed the architecture baseline and public SCC remained empty. No route, persisted store fact, schedule/temporary-close calculation, watchdog threshold/retry, Uber pause/resume, Orders/Payments/Clover/printing behavior, Prisma/schema/migration, dependency manifest/lockfile, or compatibility path changes.  
**Details:** `docs/architecture/phase-7-store-operations-pos-print.md`, `docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`, `apps/api/src/store/store-status.contract.ts`, `apps/api/src/store/public-api.ts`, `apps/api/src/store/store-status.module.ts`, `apps/api/src/store/store-status.service.ts`, `apps/api/src/pos/pos-connectivity-watchdog.service.ts`, `apps/api/src/pos/pos.module.ts`, `apps/api/src/pos/pos-device-management.architecture.spec.ts`.

### 2026-09-09 — Phase 7 Slice 3: API Foundation public-surface contraction

**PR/SHA:** PR #2252 / final head `fedeb9fe` / squash merge `d3b7996b`  
**State:** MERGED / CI GREEN — final PR CI #5382 passed Architecture, API/Web lint/build/strict checks and tests; CI #5380 failed only Prettier formatting and source/formatting head `e0112d3f` then passed CI #5381 before the final docs-only evidence head  
**Result:** Contracts only neutral Store Operations / POS / Print -> Foundation implementation paths without hiding the unresolved POS-connectivity ownership seam. A new `apps/api/src/common/public-api.ts` exposes `AppLogger`, `StableIdPipe`, and `ZodValidationPipe`; the three POS logger consumers and `pos-orders.controller.ts` use that public surface, while `pos/public-api.ts` stops re-exporting Foundation-owned pipes. `common/pos-connectivity.ts` deliberately stays out of the Foundation public barrel, and architecture guards pin the two explicit POS imports so heartbeat/status semantics are not normalized as generic infrastructure by accident. The monotonic baseline contracts `store-operations-pos-print -> architecture-foundation` **7 -> 2**, reducing Store Operations / POS / Print total direct debt **14 -> 9**. No logger/validation/connectivity behavior, route, DTO, POS auth/device behavior, Uber provider behavior, Orders/Payments/Clover/printing behavior, Prisma/schema/migration, dependency manifest/lockfile, or compatibility path changes.  
**Details:** `apps/api/src/common/public-api.ts`, `apps/api/src/pos/pos-connectivity-watchdog.service.ts`, `apps/api/src/pos/pos-exchange-rate.service.ts`, `apps/api/src/pos/pos-store-status.service.ts`, `apps/api/src/pos/pos-orders.controller.ts`, `apps/api/src/pos/public-api.ts`, `apps/api/src/pos/pos-device-management.architecture.spec.ts`, `tools/architecture/context-baseline.json`, `docs/architecture/phase-7-store-operations-pos-print.md`, `docs/architecture/current-dependency-graph.md`.

### 2026-09-09 — Phase 7 Slice 4: POS connectivity -> Uber Store Status ownership contraction

**PR/SHA:** PR #2253 / final head `f2ad198a` / squash merge `af8b4d63`  
**State:** MERGED / CI GREEN — final PR CI #5387 and resulting `dev` push CI #5388 passed Architecture, API/Web lint/build/strict checks and tests; initial #5385 failed only Prettier formatting and source/formatting head `bb6b6595` passed #5386 before the final docs evidence head  
**Result:** Removes the POS watchdog's direct read of Uber-owned `UberStoreMapping` persistence without changing provider status semantics. `PosConnectivityWatchdogService` continues reading POS-owned `PosDevice` heartbeat persistence but now sends only SanQ `storeStableId`, ONLINE/PAUSED intent, reason and `pauseUntil` through `UBER_EATS_STORE_STATUS_SYNC`. The Uber public contract adds `syncStoreStatusForStore()` and removes provider `uberStoreId` from its cross-context store-status target; the concrete Uber use case keeps provider targeting internally for Uber-owned Ops/retry flows. `UberStoreMappingRepositoryPort` / `UberStoreMappingPrismaAdapter` resolve provisioned mappings by `storeStableId` inside External Channels and reuse the existing provider sync path sequentially, preserving OFFLINE/ONLINE payloads, idempotency, telemetry/alerts, no-mapping skip behavior and fail-fast on the first `FAILED` provider result. Focused POS/Uber characterization and architecture guards pin the new ownership boundary. This Slice intentionally makes **no dependency-count/baseline change**: Phase 7 direct debt remains **9** (`architecture-foundation 2`, `external-channels 1`, `identity-customer-benefits 1`, `runtime-data-ci-ops 5`) and public SCC remains empty. Uber L3 Phase-closeout verification must cover POS offline -> Uber pause-to-close, stable recovery -> ONLINE, employee-pause preservation, successful telemetry and absence of new mapping/retry errors. No Prisma schema/migration, dependency manifest/lockfile, provider wire/idempotency contract, Orders/Payments/Clover, print protocol or compatibility-register change.  
**Details:** `apps/api/src/pos/pos-connectivity-watchdog.service.ts`, `apps/api/src/pos/pos-connectivity-watchdog.service.spec.ts`, `apps/api/src/pos/pos-device-management.architecture.spec.ts`, `apps/api/src/integrations/ubereats/public-api.ts`, `apps/api/src/integrations/ubereats/application/merchant/uber-merchant-persistence.ports.ts`, `apps/api/src/integrations/ubereats/application/merchant/uber-merchant-provisioning.service.ts`, `apps/api/src/integrations/ubereats/application/merchant/uber-merchant-gateway.use-cases.spec.ts`, `apps/api/src/integrations/ubereats/infrastructure/persistence/uber-merchant-persistence.adapter.ts`, `docs/architecture/phase-7-store-operations-pos-print.md`, `docs/architecture/current-dependency-graph.md`, `docs/architecture/modularization-worklog.md`.

### 2026-09-09 — Phase 7 Slice 5A: POS connectivity purpose-built read-model expand + shadow parity

**PR/SHA:** PR #2254 / final head `7a670b46` / squash merge `8abf3162`  
**State:** MERGED / CI GREEN / DEPLOYED / ACTIVE VERIFIED (Uber Test Store) — exact final PR-head CI #5393 and post-merge #5394/#5395 passed; additive migration deployed; deliberate verification completed 2026-09-09  
**Result:** Implements the authorized additive half of the Phase 7 closeout blocker without changing Uber admission connectivity source. Prisma adds POS-owned `PosConnectivityReadModel`, keyed only by `storeStableId`, with heartbeat-capable-device presence, latest heartbeat and derived `validUntil`; migration `20260909173000_expand_pos_connectivity_read_model` only creates the table and performs no destructive change/backfill. `PosDeviceService` remains the POS writer and maintains the projection from existing heartbeat-capable ACTIVE device activity plus device lifecycle recomputation, while projection failures remain non-authoritative/log-only before Slice 5B. `UberOrderImportPrismaAdapter` keeps the legacy `PosDevice` + `common/pos-connectivity` result as the returned truth under compatibility `pos-connectivity.read-model-shadow.v1`, reads the projection only for `uber_pos_connectivity_read_model_shadow_compare`, and logs shadow failures without changing connectivity-source authority. Architecture guards prohibit Uber writes to the read model and prohibit a reverse `Uber -> POS` source/public dependency. Active verification confirmed real Test Store ONLINE `matched=true` parity, OFFLINE watchdog -> Uber Store unavailable with provider success, explicit UNKNOWN projection when all heartbeat-capable devices were disabled while printer-server remained non-capable, UNKNOWN -> fresh ONLINE recovery, and zero projection/shadow failure logs. This expand slice leaves Phase 7 Store Operations direct debt at **9** and public SCC empty.  
**Details:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260909173000_expand_pos_connectivity_read_model/migration.sql`, `apps/api/src/pos/pos-device.service.ts`, `apps/api/src/pos/pos-device.service.spec.ts`, `apps/api/src/pos/pos-device-management.architecture.spec.ts`, `apps/api/src/integrations/ubereats/infrastructure/persistence/uber-order-import-prisma.adapter.ts`, `apps/api/src/integrations/ubereats/infrastructure/persistence/uber-order-import-prisma.adapter.connectivity.spec.ts`, `docs/architecture/active-compatibility-register.json`, `docs/architecture/active-compatibility-register.md`, `docs/architecture/phase-7-store-operations-pos-print.md`, `docs/architecture/current-dependency-graph.md`, `docs/architecture/modularization-worklog.md`.

### 2026-09-09 — Phase 7 Slice 5A.1: projection authority hardening + UNKNOWN safety finalization

**PR/SHA:** PR #2256 / final head `873da579` / squash merge `ee727ef2`  
**State:** MERGED / CI GREEN / DEPLOYED / ACTIVE VERIFIED (Uber Test Store) — exact final PR-head CI #5401 and post-merge dev CI #5402 passed; production verification completed 2026-09-09  
**Result:** Hardens the existing `pos-connectivity.read-model-shadow.v1` path before Slice 5B without changing connectivity-source authority or Prisma schema. Heartbeat-capable authenticated activity now advances the POS-owned projection only monotonically, using conditional `updateMany` plus duplicate-safe create/retry so older concurrent requests cannot overwrite a newer heartbeat lease. Credential activity records `lastSeenAt` only while the device is still `ACTIVE`, then performs a post-projection status recheck; if the device became inactive in that window the request is rejected and the projection is recomputed from current POS truth. `PosDeviceService` exposes an internal repair operation and the POS watchdog invokes it during connectivity polling; when heartbeat-capable ACTIVE POS truth exists the repair is monotonic and cannot regress a newer lease, while the absence of any such POS converges the projection to UNKNOWN. The rollout-era `UNKNOWN` fail-open behavior is intentionally retired by user authorization: no active order-receiving POS now causes the watchdog to make Uber unavailable and produces a distinct `pos_connectivity_unknown` diagnostic; Uber admission independently denies UNKNOWN through the existing `POS_OFFLINE` reason-code contract, so no new provider wire reason is introduced. Compatibility verification wording is corrected to reflect the real topology: ONLINE uses real admission shadow parity, while OFFLINE/UNKNOWN use projection + watchdog/provider/device-lifecycle evidence because store availability prevents a fresh provider order from reaching admission. Direct-debt baseline remains **9** and public SCC remains expected empty; legacy Uber `PosDevice`/`common/pos-connectivity` reads remain until Slice 5B. Deployment verification then passed: production emitted `pos_connectivity_unknown` at 16:43:17 followed by Uber store-status HTTP 200 / `SUCCEEDED`; while the front POS was disabled, heartbeat/order-board requests were rejected with HTTP 401; after restore, Uber store-status again returned HTTP 200 / `SUCCEEDED` and `pos_connectivity_restored` reported ONLINE at 16:46:18. Projection write/refresh/shadow failures and Uber worker error/failed/connectivity logs were zero in the verification window.  
**Details:** `apps/api/src/pos/pos-device.service.ts`, `apps/api/src/pos/pos-device.service.spec.ts`, `apps/api/src/pos/pos-connectivity-watchdog.service.ts`, `apps/api/src/pos/pos-connectivity-watchdog.service.spec.ts`, `apps/api/src/pos/pos-device-management.architecture.spec.ts`, `apps/api/src/common/pos-connectivity.spec.ts`, `apps/api/src/integrations/ubereats/domain/orders/uber-order-admission.policy.ts`, `apps/api/src/integrations/ubereats/domain/orders/uber-order-admission.policy.spec.ts`, `apps/api/src/integrations/ubereats/application/orders/uber-order-admission.service.spec.ts`, `docs/architecture/active-compatibility-register.json`, `docs/architecture/active-compatibility-register.md`, `docs/architecture/phase-7-store-operations-pos-print.md`, `docs/architecture/current-dependency-graph.md`, this worklog.

### 2026-09-09 — Phase 7 Slice 5B: POS connectivity authoritative read-model contraction

**PR/SHA:** PR #2258 / final head `09ddc06c` / squash merge `d1c7d7b3`  
**State:** MERGED / CI GREEN — final PR CI #5408 passed  
**Result:** Completes the contraction side after the Slice 5A.1 production gate passed. External Channels owns the required `UberPosConnectivityQueryPort` / `UBER_POS_CONNECTIVITY_QUERY` application contract; `UberOrderImportRepositoryPort` no longer has optional `getPosStoreConnectivity`, so missing connectivity wiring cannot silently fail open as UNKNOWN. The existing `UberOrderImportPrismaAdapter` implements both separate interfaces and is bound with `useExisting`, avoiding a second Prisma adapter/runtime-data edge. Connectivity admission reads only POS-owned `PosConnectivityReadModel` keyed by mapped `storeStableId`; the configured-default-store guard, direct `prisma.posDevice` read, `common/pos-connectivity` import, shadow comparison/failure logs and compatibility annotation are removed. Projection read failures propagate to the existing durable Uber webhook inbox, whose unknown-error path is retryable. The connectivity helper/policy moved physically from Foundation `common` into `apps/api/src/pos`, while POS public API remained unchanged and Uber gained no reverse POS public/source dependency. Compatibility `pos-connectivity.read-model-shadow.v1` was removed from the active register. The monotonic baseline reduced `store-operations-pos-print -> architecture-foundation 2 -> 0` and `external-channels -> architecture-foundation 11 -> 10`; Store Operations direct debt contracted **9 -> 7**, `external-channels -> runtime-data-ci-ops` stayed **24**, and final CI confirmed the public SCC baseline remained empty. No Prisma schema/migration, package dependency/lockfile, provider wire contract, Orders/Payments/Clover or printing protocol change.  
**Details:** `apps/api/src/pos/pos-connectivity.ts`, `apps/api/src/pos/pos-connectivity.spec.ts`, `apps/api/src/pos/pos-device.service.ts`, `apps/api/src/pos/pos-connectivity-watchdog.service.ts`, `apps/api/src/pos/pos-device-management.architecture.spec.ts`, `apps/api/src/integrations/ubereats/application/orders/uber-order.ports.ts`, `apps/api/src/integrations/ubereats/application/orders/uber-order-admission.service.ts`, `apps/api/src/integrations/ubereats/application/orders/uber-order.use-cases.ts`, focused Uber order/admission specs, `apps/api/src/integrations/ubereats/infrastructure/nest/orders.wiring.ts`, `apps/api/src/integrations/ubereats/infrastructure/persistence/uber-order-import-prisma.adapter.ts`, `apps/api/src/integrations/ubereats/infrastructure/persistence/uber-order-import-prisma.adapter.connectivity.spec.ts`, `tools/architecture/context-baseline.json`, `docs/architecture/active-compatibility-register.json`, `docs/architecture/active-compatibility-register.md`, `docs/architecture/phase-7-store-operations-pos-print.md`, `docs/architecture/current-dependency-graph.md`, this worklog.

### 2026-09-09 — Phase 8 Slice 8.1: External Channels public-boundary hygiene contraction

**PR/SHA:** PR #2260 / final head `8efeb5e6` / squash merge `fc9bfc01`  
**State:** MERGED / CI GREEN — final PR CI #5414 passed; no local lint/build/test/scanner run per requested workflow  
**Result:** Contracts only implementation-path imports that already have an approved owner public surface. Uber admin-access decorators now consume `AdminMfaGuard`, `Roles`, `RolesGuard` and `SessionAuthGuard` from `auth/public-api.ts`; six API/infrastructure `AppLogger` consumers use `common/public-api.ts`. The two merchant application services retain direct `AppLogger` because the existing `UberTelemetryPort` would filter the current store-context diagnostics or add persistence side effects, so no fake logging facade is introduced. `SESSION_COOKIE_NAME`, legal `AuthModule` composition, `getLogContext()`, `getUploadsAccountingDir()`, the Orders acceptance atomic seam, Runtime/Prisma imports and inbound Uber module composition remain intentionally unchanged. The baseline contracts `external-channels -> identity-customer-benefits` **6 -> 2** and `external-channels -> architecture-foundation` **10 -> 4**, reducing External outgoing direct debt **41 -> 31** while Orders remains **1** and Runtime remains **24**. A focused Uber architecture assertion pins the completed public-path contractions; final CI #5414 confirmed the public SCC remains empty before merge.  
**Details:** `docs/architecture/phase-8-external-channels.md`, `docs/architecture/current-dependency-graph.md`, `tools/architecture/context-baseline.json`, `apps/api/src/integrations/ubereats/uber-service-architecture.spec.ts`, this worklog.

### 2026-09-09 — Phase 8 Slice 8.2A: Store schedule read ownership contraction

**PR/SHA:** PR #2261 / final head `ce47baf1` / squash merge `87ebad20`  
**State:** MERGED / CI GREEN — final PR CI #5418 passed; no local lint/build/test/scanner run per repository workflow  
**Result:** The Slice 8.2 semantic audit first classifies Runtime/Data/Ops **24** as structurally expected rather than a blanket contraction target, then isolates Store schedule as the safe first semantic-ownership slice. Existing Uber `UBER_BUSINESS_SCHEDULE_QUERY_PORT` is now provided only at `ubereats.module.ts`, composing `UBER_STORE_CONFIG_QUERY` with Store-owned `STORE_SCHEDULE_READER`; API and dedicated worker continue to reuse the same Uber composition provider graph. `UberMenuSupportingQueriesPrismaAdapter`, `UberMenuDraftReadPrismaAdapter`, and the menu repository scope no longer query `BusinessHour` directly; the transaction-backed menu scope delegates schedule reads through a non-Prisma `UberBusinessScheduleRepositoryAdapter`. The schedule query's non-null return type reflects actual existing behavior. Focused composition/delegation coverage and an architecture invariant pin zero production Uber persistence `.businessHour` access. No Store public API expansion, Prisma schema/migration, provider-wire, menu payload, POS connectivity, Orders, Payments/Clover or compatibility cutover is introduced. Direct-import/public-cycle baselines remain unchanged: Runtime **24**, Orders **1**, Identity **2**, Foundation **4**; machine baseline is intentionally untouched. Phase-closeout verification must exercise Admin Uber draft/load and publish schedule/timezone/tax behavior plus worker provider resolution. The audit also records Catalog menu facts for a later public-contract design and expands Slice 8.3 to cover both Orders acceptance and cancellation atomic ownership seams.  
**Details:** `apps/api/src/integrations/ubereats/ubereats.module.ts`, `apps/api/src/integrations/ubereats/application/menu/uber-menu-draft.ports.ts`, `apps/api/src/integrations/ubereats/infrastructure/nest/menu.wiring.ts`, `apps/api/src/integrations/ubereats/infrastructure/persistence/uber-menu-supporting-queries-prisma.adapter.ts`, `apps/api/src/integrations/ubereats/infrastructure/persistence/uber-menu-draft-read-prisma.adapter.ts`, `apps/api/src/integrations/ubereats/infrastructure/persistence/uber-menu-draft.repositories.ts`, focused specs, `docs/architecture/phase-8-external-channels.md`, `docs/architecture/current-dependency-graph.md`, this worklog.

### 2026-09-09 — Phase 8 Slice 8.2B: Catalog read-boundary contraction

**PR/SHA:** PR #2262 / final head `05291115` / squash merge `00561c82`  
**State:** MERGED / CI GREEN — final PR CI #5427 passed; no local lint/build/test/scanner run per repository workflow  
**Result:** After explicit architecture authorization, the Slice 8.2B design is implemented in two steps on merged `dev@87ebad20`. 8.2B.1 introduces Catalog-owned `CATALOG_EXTERNAL_AVAILABILITY_SYNC`; `CatalogUberAvailabilityOrchestrationService` no longer imports Uber, while `catalog-uber-availability-orchestration.module.ts` remains the sole composition binding to `UBER_EATS_MENU_AVAILABILITY`, preserving the current synchronous best-effort availability and Admin `uberSync` behavior. 8.2B.2 introduces Catalog-owned `CATALOG_EXTERNAL_MENU_FACTS_READER` / dedicated module and exposes it through `menu/public-api.ts`; the module reuses the existing Prisma-owning `CatalogAdminService` via `useExisting`, matching the established Catalog reader pattern and avoiding any increase in Catalog -> Runtime direct-import debt, while the contract maps relations to stable business IDs and dates to ISO strings rather than exposing DB UUIDs or Prisma shapes. The Uber composition root adapts this owner capability to Uber-owned `UBER_CATALOG_MENU_FACTS_QUERY` for both API and worker. **15 of 17** audited Catalog delegate reads are removed from Uber persistence, covering draft/publish source graphs, mutation defaults, existence checks, imported-order modifier snapshots and OpsTicket validation. The remaining **2** restore-source-price reads were deferred for a separate transaction-semantics review; subsequent readiness audit confirmed those operations use ordinary `read committed` transactions with no Catalog row lock rather than the earlier-documented Serializable assumption. Architecture coverage pins the residual set, forbids Uber persistence from importing Catalog directly, and verifies Catalog availability business code no longer imports External Channels. `legacyPublicCycleComponents=[]` remains valid and deep-import counters remain Runtime **24**, Orders **1**, Identity **2**, Foundation **4**; no machine baseline edit is required. No Prisma schema/migration, provider-wire payload, webhook/idempotency, Orders lifecycle, POS connectivity or production Web Clover behavior is changed.  
**Details:** `apps/api/src/application/menu/catalog-external-availability-sync.port.ts`, Catalog availability orchestration service/module/specs, `apps/api/src/menu/catalog-external-menu-facts-*`, `apps/api/src/menu/public-api.ts`, `apps/api/src/integrations/ubereats/application/shared/uber-catalog-menu-facts.port.ts`, `apps/api/src/integrations/ubereats/ubereats.module.ts`, affected Uber persistence adapters/specs, architecture specs, `docs/architecture/phase-8-external-channels.md`, `docs/architecture/current-dependency-graph.md`, this worklog.

### 2026-09-10 — Phase 8 Slice 8.2B.3: restore-source-price Catalog ownership tail

**PR/SHA:** PR #2263 / final head `f001d37a` / squash merge `f7b8710a`  
**State:** MERGED / CI GREEN — final PR CI #5432 passed; no local lint/build/test/scanner run per repository workflow  
**Result:** Readiness audit on merged `dev@00561c82` confirmed the two deferred restore-source-price paths do not hold a Serializable or row-locked Catalog snapshot; production PostgreSQL reports `read committed`. The existing Catalog owner reader already exposes exactly the required stable-ID item/option source facts, so no new public contract or transaction-aware Prisma API is needed. `UberMenuConfigImportPrismaAdapter.restoreItemPrice()` and `restoreOptionPrice()` now call Uber-owned `UBER_CATALOG_MENU_FACTS_QUERY` inside the existing operation transaction callback before any Uber write; only the Uber config upsert plus `ubereats_menu_price_restored` audit event participate in that local transaction. Existing not-found errors and write suppression are characterized. The architecture invariant now requires **zero** production Uber persistence access to Catalog delegates `MenuCategory`, `MenuItem`, `MenuOptionGroupTemplate`, and `MenuOptionTemplateChoice`, completing the audited contraction **17 -> 15 -> 0**. Runtime **24**, Orders **1**, Identity **2**, Foundation **4** and the machine baseline remain unchanged. No schema/migration, dependency, provider wire, webhook/idempotency, Orders lifecycle, POS connectivity or Web Clover behavior is changed. Phase-closeout active verification must exercise both Admin item/option restore-source-price actions and confirm draft reload reflects Catalog truth without unrelated menu changes.  
**Details:** `apps/api/src/integrations/ubereats/infrastructure/persistence/uber-menu-config-import-prisma.adapter.ts`, its focused spec, `apps/api/src/integrations/ubereats/uber-store-identity-architecture.spec.ts`, `docs/architecture/phase-8-external-channels.md`, `docs/architecture/current-dependency-graph.md`, this worklog.

### 2026-09-10 — Phase 8 Slice 8.3A0: remove test-era Uber modifier persistence

**PR/SHA:** PR #2264 / source head `18034f19` / squash merge `2589225d`  
**State:** PRODUCTION VERIFIED — PR CI #5435 passed; destructive migration applied; active Test Store modifier/order/print/action verification passed  
**Result:** Readiness audit on merged `dev@f7b8710a` identified the remaining reverse Orders -> External persistence write: `OrderIngestionService` was the only production writer of `UberOrderItemModifier`, and production-source search found no reader. The active modifier representation already persists canonically through `ParsedUberModifier[] -> modifierSnapshots() -> NormalizedOrderItem.options -> OrderItem.optionsJson`; pre-migration DB inventory found 17 modifier rows across 12 OrderItems / 11 Uber orders and zero non-Uber rows. The user confirmed all current Uber Eats integration data is test-only and explicitly authorized deleting the obsolete model/table and generating the destructive migration. The slice removes `NormalizedOrderItem.external.modifiers`, the ingestion `uberOrderItemModifier.createMany()` write, the Uber importer flattening payload, `OrderItem.uberModifiers`, and Prisma model `UberOrderItemModifier`; migration `20260910111500_contract_uber_order_item_modifier` drops the table without `CASCADE`. Focused regression keeps canonical `optionsJson` mapping and an architecture guard rejects reintroducing the provider delegate/model. No provider wire, webhook/idempotency, order state transition, POS/Print behavior, Payments/Clover behavior, dependency manifest, or machine import baseline changes. `external-channels -> commerce-orders-fulfillment` remains **1** until later 8.3B transition ownership contraction, while the reverse semantic persistence write is removed. Post-merge readiness on `dev@2589225d` plans 8.3A as an Orders-owned stable-ID external-order facts reader, 8.3B as the atomic ACCEPT/READY/CANCEL/DENY transition ownership move, and 8.3C as the cancellation amendment/refund/lifecycle ownership move with a separate decision on the write-only `UberOrderCancellation` persistence.  
**Migration/verification:** Current test-era modifier rows are intentionally not preserved. The deployed database records migration `20260910111500_contract_uber_order_item_modifier` as applied and not rolled back, `UberOrderItemModifier` is absent, and API/DB/Uber worker/Web are healthy. Active verification passed with Test Store order `82A94`: one local order was created, canonical `OrderItem.optionsJson` retained the selected modifier snapshot, POS receipt/kitchen printing rendered the options correctly, ACCEPT succeeded with Uber HTTP 200, and the later cancellation also succeeded with the canonical order reaching `refunded`. The inspected API/worker log window contains no legacy-table or missing-table error.  
**Details:** `apps/api/src/orders/order-ingestion.contract.ts`, `apps/api/src/orders/order-ingestion.service.ts`, its spec, `apps/api/src/integrations/ubereats/infrastructure/persistence/uber-order-import-prisma.adapter.ts`, its spec, `apps/api/src/integrations/ubereats/uber-order-ingestion-boundary-architecture.spec.ts`, `apps/api/prisma/schema.prisma`, migration `apps/api/prisma/migrations/20260910111500_contract_uber_order_item_modifier/migration.sql`, `docs/architecture/phase-8-external-channels.md`, `docs/architecture/current-dependency-graph.md`, `docs/architecture/phase-5-commerce-orders-fulfillment.md`, `docs/architecture/id-inventory.md`, this worklog.

### 2026-09-10 — Phase 8 Slice 8.3A: canonical Order read ownership contraction

**PR/SHA:** PR `#2267`; final head `9b996892`; squash merge `51bf9091`  
**State:** MERGED / CI GREEN — PR CI `#5445` and merged-head CI `#5446` both passed API + Web; Phase-level active verification remains pending  
**Result:** After explicit architecture authorization, Orders owns a new provider-neutral `ORDER_EXTERNAL_FACTS_READER` with a narrow `OrderExternalFactsModule`. Its public contract accepts `channel + externalOrderId` or `orderStableId`, emits only stable business identity and ISO timestamps, and exposes no Prisma type or `Order.id`. The Uber composition root adapts the owner reader to Uber-owned action facts, sync and operations ports for API and dedicated worker; the worker imports the narrow reader module rather than `OrdersModule`. The nine pure canonical Order read operations in the audited four persistence areas moved behind this owner boundary. Exactly three transaction-coupled reads remained at merge time: two inside `UberOrderActionPrismaAdapter.complete()` and one inside cancellation persistence. Those transactions and their lease/fence/status/amendment/lifecycle writes were otherwise unchanged, preserving the 8.3B/8.3C atomicity gate. Existing-order import/cancellation application contracts now carry `orderStableId`; cancellation resolves the internal UUID only inside its unchanged transaction. Removing the old sync Prisma repository contracted External -> Runtime **24 -> 23** and External total **31 -> 30**; External -> Orders remained **1**, Identity **2**, Foundation **4**, with no new public SCC or Commerce -> Runtime allowance. No schema/migration, package dependency, provider wire, webhook inbox, action command, POS/Print or Payments/Clover behavior changed.  
**Tests:** Orders reader characterization, Uber composition mapping and read-ownership architecture guards, plus adjusted action/import/scheduled/cancellation characterization all passed in CI `#5445`; merged-head CI `#5446` independently reconfirmed architecture/lint/build/strict/test.  
**Details:** `apps/api/src/orders/order-external-facts-*`, Orders public API, Uber canonical facts port/composition, affected Uber adapters/wiring/specs, `apps/api/src/integrations/ubereats/ARCHITECTURE.md`, `tools/architecture/context-baseline.json`, `docs/architecture/phase-8-external-channels.md`, `docs/architecture/current-dependency-graph.md`, this worklog.

### 2026-09-10 — Phase 8 Slice 8.3B: provider-confirmed canonical transition ownership

**PR/SHA:** local branch `refactor/phase8-8-3b-order-transition-ownership` from `origin/dev@51bf9091`; PR not created  
**State:** LOCAL SOURCE / USER REVIEW PENDING — no local lint/build/test/scanner run per repository workflow  
**Result:** After explicit L3 architecture authorization, Orders owns a new `ORDER_EXTERNAL_TRANSITION_COORDINATOR` with narrow `OrderExternalTransitionModule`. The coordinator owns the single shared transaction, invokes an opaque same-transaction External extension before any canonical mutation, then owns conditional `Order.status` transition, race re-read, `makingAt` / `readyAt`, and idempotent `order.accepted`. The Orders public contract exposes no Prisma type, DB UUID, `clientRequestId` encoding, or Uber DTO. `UberOrderActionPrismaAdapter.completeWithinTransaction()` now owns only the provider action claimed-row check, exact lease fence, success HTTP status persistence, lease cleanup, and completion facts. `ubereats.module.ts` is the sole composition binding for `UBER_ORDER_ACTION_REPOSITORY`, combining the Uber persistence adapter with the Orders coordinator for both API and dedicated worker; the worker imports only the narrow transition module and remains free of `OrdersModule`. The old deep `orders/order-lifecycle` import plus all canonical `tx.order.*` / `tx.opsEvent.*` accesses are removed from the Uber action adapter. Static source inventory therefore supports External -> Orders direct debt **1 -> 0** and External total **30 -> 29**, with Runtime **23** unchanged and no new public SCC. The separate 8.3C cancellation-webhook transaction remains unchanged. No schema/migration, dependency manifest, provider wire, webhook protocol, POS/Print, or Payments/Clover change is introduced.  
**Tests:** Added Orders transition coordinator characterization for exact fence-null behavior, ACCEPT lifecycle, READY timestamp, target-state replay, conditional-update race and rollback propagation; Uber persistence tests now pin only claimed/fence behavior; composition and architecture guards require Orders transaction ownership, opaque public contract, sole root binding and no worker `OrdersModule`. Remote CI is pending.  
**Verification scope:** Phase 8 closeout must actively exercise immediate ACCEPT, scheduled ACCEPT, READY_FOR_PICKUP, merchant CANCEL/DENY where available, duplicate/replay/lease behavior, and sanitized DB/log reconciliation before Phase 8 can be marked verified.  
**Details:** `apps/api/src/orders/order-external-transition.*`, Orders public API, `apps/api/src/integrations/ubereats/ubereats.module.ts`, `uber-order-action-prisma.adapter.*`, order lifecycle/read ownership architecture specs, `apps/api/src/integrations/ubereats/ARCHITECTURE.md`, `tools/architecture/context-baseline.json`, `docs/architecture/phase-8-external-channels.md`, `docs/architecture/current-dependency-graph.md`, this worklog.

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
second implementation entry. A later genuinely new slice gets a new entry. Under
the 2026-09-06 verification cadence, a normal modularization Slice may stop at
`MERGED / CI GREEN` without its own production active-test cycle; record the affected
runtime behaviors as Phase-level verification scope. Immediately before Phase closeout,
add/update the Phase closeout entry with the consolidated deployment/active-verification
plan and evidence, and only mark the Phase `PRODUCTION VERIFIED / CLOSED` after it passes.