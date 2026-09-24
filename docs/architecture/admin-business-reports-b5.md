# B5 — Admin Business Reports / Operating Monitoring

Date: 2026-09-24  
Implementation baseline: `dev@81784c85` (B5-C2 merged through PR #2515; final head `6f455230`; squash `dfa8e21c`; CI #6306 green; deployed in production `main@81784c85`)  
Current local work: **B5-D legacy report contraction + comparison-confidence UI polish — LOCAL SOURCE READY FOR REVIEW / HTTP CONTRACT CONTRACTION / NO MIGRATION / NO PACKAGE CHANGE / NO NEW GRAPH DIRECTION / POST-CONTRACTION PRODUCTION VERIFICATION PENDING**

## Product goal

B5 is a store operating-monitoring surface, not a second Accounting report.

The target page must help an operator detect meaningful changes early and explain
whether the movement comes from Order volume, average Order total, time-of-day,
channel, fulfillment, product mix or store execution.

Accounting remains the authority for canonical financial concepts such as Gross Sales,
discounts, Net Sales Revenue, output tax, tips, provider fees, tender mix, settlement
and P&L.

## Readiness conclusions

The production audit established that:

- recent Order history is sufficient for a rolling same-weekday operating baseline;
- the store's relatively low daily Order volume means percentage-only anomaly rules
  would be noisy and must later be combined with absolute-delta/sample guards;
- persisted Order timestamps are PostgreSQL timestamp-without-time-zone values that
  represent UTC; Reporting must resolve store-local buckets from actual instants rather
  than apply raw SQL timezone conversion incorrectly;
- stale historical `making` / `ready` rows make unbounded current-status queries
  unsuitable for live incident detection;
- `prepDurationMinutes` is not populated, while `makingAt -> readyAt` has strong
  coverage and is the correct owner fact for future prep p50/p90;
- commercial top-level OrderItem identity and immutable component snapshots support two
  distinct views: commercial product/package sales and actual production demand;
- historical category-at-sale identity is absent and must not be reconstructed from
  the current Catalog;
- payment decline, delivery, Web conversion and amendment occurrence-time coverage are
  not authoritative enough for B5 v1.

## B5-B1 — Orders operational facts

### Ownership

B5-B1 stays entirely inside the existing Orders owner/public boundary.

The new facts are additive capabilities on `ORDER_REPORTING_FACTS_READER`.
The legacy `readMetricsForRange()` and `readItemsForRange()` contracts remain
unchanged so the current `GET /reports` page and Homepage ranking behavior are not
modified by this slice.

### New store-scoped range contract

`OrderReportingOperationalRangeV1` requires:

- `storeStableId`;
- `fromInclusive`;
- `toExclusive`.

The half-open `[fromInclusive, toExclusive)` interval is intentional. It avoids
end-of-day millisecond contracts and gives the future Reporting layer a safe primitive
for store-local day/hour boundaries.

### New normalized Order facts

`readOperationalOrdersForRange()` publishes only reportable Orders in the established
population:

- `paid`;
- `making`;
- `ready`;
- `completed`.

`pending` and `refunded` remain outside this operating-sales population.

Each fact exposes only non-PII operational snapshots needed by Reporting:

- `orderStableId`;
- `storeStableId`;
- current reportable status;
- `createdAt`, `paidAt`, `makingAt`, `readyAt`;
- Order total / subtotal / Order tax snapshot / customer delivery fee;
- Order channel;
- primary Order payment method;
- fulfillment type.

It deliberately does not expose contact email/phone, user ID, raw promotion JSON or
other customer identity.

The monetary fields remain **Order operational snapshots**. Their presence does not
give Reporting authority to reinterpret them as Accounting revenue/tax.

### New normalized item facts

`readOperationalItemsForRange()` publishes:

- owning `orderStableId` and Order creation instant;
- top-level `productStableId`;
- immutable OrderItem display names;
- quantity;
- OrderItem unit-price snapshot;
- Daily Special applied flag;
- immutable normalized component snapshots.

This preserves two meanings for later Reporting projection:

1. top-level OrderItem -> commercial product/package demand;
2. component snapshot -> actual production demand.

The Orders owner remains responsible for decoding `componentsJson`; raw JSON does not
cross the public boundary.

### Architecture guard

The B5-B1 reader is explicitly guarded from reading `PosPrintJob` or importing POS
internals.

The architecture audit corrected an earlier assumption: POS/Print is a separate
`store-operations-pos-print` context. Print health must therefore be supplied later
through a POS/Print-owned public capability rather than by letting Orders read foreign
persistence.

Adding a Reporting -> POS/Print public direction would be a separate architecture
decision and is **not part of B5-B1**.

### Behavior intentionally unchanged

B5-B1 does not change:

- `GET /reports`;
- Admin Web UI;
- legacy float-dollar response shape;
- Homepage `REPORTING_TOP_ITEMS_QUERY`;
- legacy component-expanded Top Items behavior;
- current Reporting timezone logic;
- Accounting reports or Journals;
- Brand/Store configuration;
- database schema or migrations;
- package dependencies.

## B5-B1 delivery state

B5-B1 was merged through PR #2511 / squash `35ba5d52`; final head
`35e76d0f`; CI #6291 passed architecture, API/Web lint/build/strict declaration
checks and tests.

## B5-B2 — Store operating-context seam

The user explicitly authorized the new read-only Reporting -> Brand/Store architecture
direction on 2026-09-24.

The implementation keeps that knowledge inside the registered `ReportsModule`
composition root. Reporting business code consumes only its own
`REPORTING_STORE_OPERATING_CONTEXT_QUERY` contract.

The composition root adapts existing Store public capabilities:

- `BRAND_STORE_CONFIG_READER` for stable store identity, active state and timezone;
- `STORE_SCHEDULE_READER` for current configured business hours and holidays;
- `STORE_STATUS_READER` for effective current scheduled-open and temporary-close
  state.

The resulting Reporting contract exposes only:

- `storeStableId`;
- `timezone`;
- `isActive`;
- normalized business hours;
- normalized holidays;
- current effective schedule/temporary-close status;
- explicit `historyCoverage = CURRENT_CONFIGURATION_ONLY`.

The coverage marker is mandatory because current Store configuration is not a durable
historical schedule/closure ledger. B5-C1 must not use today's Store config to assert
why a historical zero-Order day occurred.

The seam deliberately does **not** expose Store contact fields, tax config,
auto-accept/allergen settings, delivery configuration or internal persistence metadata.

The public Store status contract does not expose an effective temporary-close reason.
B5-B2 therefore does not copy the raw config reason into Reporting because an expired
auto-pause can transiently leave raw config metadata behind while
`STORE_STATUS_READER` already reports the effective pause as false.

No Reporting runtime report currently consumes the new query. Therefore B5-B2 changes
the composition capability but does not change `GET /reports`, Admin UI, Homepage,
Accounting or current report arithmetic.

### Architecture-scanner treatment

`apps/api/src/reports/reports.module.ts` is already a registered excluded composition
root in `tools/architecture/context-baseline.json`. The new Store public imports are
therefore a deliberate composition dependency but do not require increasing a legacy
direct-import limit or adding a scanner exception/SCC allowance.

Architecture tests lock that:

- only the composition root imports `../store/public-api`;
- Reporting service/business contract does not import Store internals or Prisma;
- no broad `accounting-reporting-analytics -> brand-store` legacy direct-import
  allowance is added.

## B5-B2 delivery state

B5-B2 was merged through PR #2513 / squash `c64c07d3`; final head
`7a8b09eb`; CI #6298 passed architecture, API/Web lint/build/strict declaration
checks and tests. The only failed precursor run was limited to three Prettier findings
in the new architecture spec; the corrected final head passed the full suite.

## B5-C1 — Business Operations projection + anomaly engine

B5-C1 is additive. The legacy `GET /reports`, `ReportsService`, Homepage ranking
contract and existing Admin consumer remain unchanged.

The new endpoint is:

`GET /reports/business?storeStableId=...&from=YYYY-MM-DD&to=YYYY-MM-DD`

`storeStableId` is required. `from` / `to` are optional and default to the
selected store's current local date. Supplying only one date produces a single-day
report. Future dates and ranges longer than 90 inclusive local calendar days fail
closed.

### Reporting-owned Orders seam

B5-C1 introduces `REPORTING_BUSINESS_ORDER_FACTS_QUERY` as a Reporting-owned outbound
port. The registered `ReportsModule` composition root adapts the B5-B1
`ORDER_REPORTING_FACTS_READER` operational methods into this contract. The
`BusinessOperationsReportService` imports neither Orders nor Store public/internal
types; it depends only on Reporting-owned Orders and Store-context ports.

This adds no new context direction beyond the already established composition seams,
and it does not change scanner allowances or SCC state.

### Time and range semantics

All range interpretation is server-owned and uses the selected store timezone from
B5-B2. The engine never uses `process.env.TZ` for the new contract.

For a range ending today, the effective `toExclusive` is the current instant rather
than end-of-day. Historical same-weekday comparators for the current local day are cut
at the same wall-clock time. A 14:37 current view is therefore compared with prior
same-weekdays only through 14:37, never with their complete day.

For 7/28/90-day ranges, a comparator period preserves weekday structure by shifting
the complete selected range by 1..8 weeks. A comparator period is admitted only when
every selected date has coverage evidence. This is a rolling operational-monitoring
baseline, not an Accounting-style disjoint prior-period comparison; for long selected
ranges, shifted comparison windows can overlap the selected range while each comparison
date still precedes its corresponding evaluated date.

The Orders read extends four weeks earlier than the eight-week comparator window as a
coverage probe. The response distinguishes:

- `baselineProbeFrom`: the beginning of that bounded probe;
- `firstObservedOrderInProbe`: the first reportable Order found inside it.

Comparator dates before or on the first observed date in the bounded probe are not
treated as authoritative zero days. Once coverage is established, later zero-Order
comparator dates remain explicit zero samples; this prevents the engine from silently
dropping real closed/outage/zero-demand days.

### Baseline and anomaly policy

The initial inspectable policy is returned in every response rather than hidden in UI
code:

- baseline: previous 8 same-weekday/comparable weekly periods;
- minimum comparable periods: 4;
- minimum current prep samples before a prep p90 anomaly can fire: 3;
- robust center: median;
- robust variability: median absolute deviation (MAD);
- MAD qualification: 3× MAD when MAD is non-zero;
- relative materiality floor: 25%;
- absolute materiality floors:
  - Order count: 3 Orders;
  - Order total: 5,000 cents;
  - average Order total: 300 cents;
  - prep p90: 5 minutes.

An anomaly must clear minimum sample, absolute/relative materiality and robust
variability gates. Each emitted anomaly includes current/expected value, absolute delta,
percentage change, actual materiality floor, MAD, sample count, confidence, range
and top descriptive channel/fulfillment/hour contributors.

These thresholds are **v1 sensitivity policy**, not accounting truth or permanent
business constants; the API exposes them so later calibration can be explicit and
auditable.

Because Store operating history is still `CURRENT_CONFIGURATION_ONLY`, otherwise
well-sampled comparisons currently report `OPERATING_CONTEXT_PARTIAL`; insufficient
samples report `LOW_SAMPLE`. The engine may still surface a deterministic anomaly,
but the UI can show its confidence rather than implying historical closure/schedule
causality.

### Projection contents

`BusinessOperationsReportV1` contains only operational semantics:

- Order total, Order count, average Order total and customer delivery-fee snapshots;
- expected values and deltas;
- daily current/expected timeline;
- single-day cumulative hourly pace with zero-filled buckets;
- channel, primary Order payment method and fulfillment breakdowns;
- exact Order-total movement decomposition into volume effect + average-Order effect;
- top-level commercial item/package demand with Order penetration;
- component-expanded production demand, while standalone items remain their own
  production units;
- making -> ready prep p50/p90 using deterministic linear-interpolated percentiles,
  with current channel breakdown;
- a six-hour bounded current queue for `making` / `ready` only when the selected
  report is exactly today;
- deterministic anomalies for Order count, Order total, average Order total and prep
  p90;
- explicit coverage metadata.

The count/AOV decomposition uses symmetric count × average effects and assigns the
rounding remainder to the average-Order effect, so the two effects always reconcile
exactly to the observed Order-total change.

Commercial item money is not allocated to components. Historical Catalog category
membership is not reconstructed. Accounting revenue/tax/tender/settlement semantics
remain outside this contract.

### Current Store context presentation

The response exposes B5-B2 information under explicitly current labels:

- `storeContext.currentStatus`;
- `storeContext.currentConfiguration`;
- `coverage.storeOperatingContext = CURRENT_CONFIGURATION_ONLY`.

This prevents a historical report from presenting today's hours/pause state as if it
were historical evidence.

### POS/Print remains unavailable

C1 returns `coverage.printHealth = UNAVAILABLE`. It does not read `PosPrintJob`,
import POS internals or create a Reporting -> POS/Print dependency. Print health still
requires a separately reviewed public seam from `store-operations-pos-print`.

### B5-C1 delivery state

B5-C1 is **MERGED / CI GREEN** through PR #2514 / final head `d8f21ca6` /
squash `af57715f`; CI #6303 passed the repository architecture, API/Web lint/build,
strict declaration and test gates. The additive `GET /reports/business` contract is
therefore the source baseline for C2. Legacy `GET /reports` remains available and is
not contracted by C1 or C2.

### B5-C2 — Admin Today-first operating-monitoring UI

C2 stays inside the existing Web/Admin adapter boundary. It does not add a backend
module dependency, scanner allowance, database/schema change, migration or package
dependency.

The Admin `/admin/reports` route is reduced to an App Router composition wrapper and
the operating-monitoring behavior lives under
`apps/web/src/features/admin/business-reports/**`. The existing
`AdminStoreContextSelector` is reused with its `operations` context on Business
Reports, so the selected `storeStableId` is explicit in both the URL and the page
header. No implicit default Store is introduced.

The UI consumes only `GET /reports/business` and provides:

- Today by default plus Yesterday / 7d / 28d / 90d / custom (maximum 90 inclusive
  calendar days);
- an attention-first anomaly summary using C1 `anomalies[]`, including current,
  expected, delta, percentage change, sample count, confidence, materiality/MAD evidence
  and descriptive channel/fulfillment/hour contributors;
- core Order total, Order count, average Order total and prep p50/p90 cards with
  current/expected/delta presentation. Order total is explicitly described as an
  operating Order measure rather than Accounting Revenue;
- a Today cumulative pace chart with Order-count / Order-total toggle using C1
  `hourlyPace`. The browser does not recalculate elapsed-time comparability; it renders
  the server-owned same-elapsed-local-time projection. Multi-day selections fall back to
  the C1 daily timeline rather than manufacturing hourly semantics;
- exact Order-total change decomposition from C1 `volumeEffectCents` and
  `averageOrderEffectCents`, plus channel and fulfillment current/expected/delta
  evidence;
- separate Commercial items and Production items tabs. Component-expanded production
  demand has no allocated package revenue;
- execution health from making->ready prep timing plus the C1 today-only bounded recent
  queue. The UI never performs an unbounded status query or reconstructs stale
  historical `making` / `ready` state;
- explicit coverage/limitations for `LOW_SAMPLE`,
  `OPERATING_CONTEXT_PARTIAL`, `CURRENT_CONFIGURATION_ONLY` and
  `printHealth = UNAVAILABLE`, including the warning that current hours/pause status
  are not historical facts.

C2 intentionally does not add Gross Sales, Net Revenue, Tax, Tips, provider fees,
settlement, tender mix, P&L, account balances, payment decline rate, Web conversion,
delivery efficiency, historical category sales, promotion ROI or refund-occurrence
trend.

Source-level Web characterization records the endpoint cutover, Today-first evidence
sections, commercial/production separation, bounded queue/coverage limitations and
AdminShell Store-selector reuse. C2 merged through PR #2515 / final head `6f455230` /
squash `dfa8e21c`; CI #6306 passed. Production `main@81784c85` was redeployed on
2026-09-24 and the operator exercised Today, Yesterday, 7d, 28d and 90d. API request
logs recorded five successful `GET /api/v1/reports/business` responses (all HTTP 200)
for Store `4750_Yonge_Street`, while legacy `GET /api/v1/reports` recorded zero
requests. No Web ERROR was observed; the only API ERROR in the observation window was
an unrelated transient `/api/v1/auth/me` 401 followed by a normal 200. This satisfies
the C2 deployed-and-observed gate for B5-D.

### B5-D — legacy route contraction + closeout polish

B5-D may now contract the zero-consumer legacy report path. The local source change:

- removes root `GET /reports` while retaining `GET /reports/business`;
- removes the legacy mixed-KPI `ReportsService.getReport()` projection and its
  process-timezone/chart/payment/fulfillment characterization;
- removes `readMetricsForRange()` and its legacy metric DTOs from the Reporting-owned
  adapter and Orders `ORDER_REPORTING_FACTS_READER` public surface because no remaining
  production consumer exists;
- retains `ReportsService.getTopItemsForRange()`, `REPORTING_TOP_ITEMS_QUERY`,
  `readItemsForRange()` and immutable component expansion for Homepage weekly featured
  ranking;
- preserves B5 operational Order facts, Store operating-context seam, `GET
  /reports/business`, Accounting authority boundaries and Print `UNAVAILABLE` behavior;
- centralizes `OPERATING_CONTEXT_PARTIAL` explanation in Coverage instead of repeating
  “营业上下文有限” on each KPI/anomaly card. `LOW_SAMPLE` remains visible on affected
  cards; Coverage explains that Order history is usable while historical hours and
  temporary-closure configuration are not versioned.

This is an HTTP contract contraction but not a schema/persistence contraction. It adds
no migration, package dependency, context direction, scanner allowance or SCC.

Post-contraction production verification remains **PENDING** until this B5-D source is
merged and deployed. The closeout verification must confirm:

1. API startup maps `GET /api/v1/reports/business` and no longer maps root `GET
   /api/v1/reports`;
2. Admin Today / Yesterday / 7d / 28d / 90d load successfully for the selected Store
   with no API/Web runtime error;
3. store/timezone boundaries, expected/delta arithmetic, Commercial-vs-Production item
   semantics, prep p50/p90 and bounded recent-queue behavior remain intact;
4. Coverage is the single normal location for `OPERATING_CONTEXT_PARTIAL`, while
   `LOW_SAMPLE` remains prominent when history is actually insufficient;
5. Homepage automatic weekly featured-item ranking still resolves through
   `REPORTING_TOP_ITEMS_QUERY` after `readMetricsForRange()` removal;
6. post-deploy logs show no legacy `/reports` traffic. Only after these checks pass may
   B5 be marked **PRODUCTION VERIFIED / CLOSED**.
