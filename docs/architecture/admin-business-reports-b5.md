# B5 — Admin Business Reports / Operating Monitoring

Date: 2026-09-24  
Implementation baseline: `dev@35ba5d52` (B5-B1 merged through PR #2511; CI #6291 green)  
Current local work: **B5-B2 Store operating-context seam — LOCAL SOURCE READY FOR REVIEW / AUTHORIZED READ-ONLY COMPOSITION DIRECTION / NO MIGRATION / NO DEPENDENCY**

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

## B5-B2 verification state

Per repository workflow, no local lint/build/test/CI reproduction is run before user
review.

Source tests characterize:

- the three Store public reader injections;
- normalized timezone/business-hours/holiday/current-status mapping;
- `CURRENT_CONFIGURATION_ONLY` coverage;
- exclusion of unrelated Store configuration;
- confinement of the cross-context dependency to the registered composition root.

GitHub Actions remains the authoritative validation gate after user approval for remote
delivery.

### POS/Print follow-up

Print-health ownership must be redesigned as a separate public read capability from
`store-operations-pos-print`. It must not be folded into Orders merely because
`PosPrintJob` has an Order relation.

### B5-C1 / C2

After the owner facts and store context exist:

- Reporting builds `BusinessOperationsReportV1`;
- server-owned same-weekday and same-elapsed-time baselines;
- zero-filled time buckets;
- count × average-Order decomposition;
- channel / fulfillment / time / item diagnostics;
- prep p50/p90 and bounded recent queue logic;
- explicit coverage/confidence;
- Admin Today-first monitoring UI.

### B5-D

Only after the new consumer is deployed and observed:

- contract old `GET /reports`;
- close compatibility;
- production-verify store/timezone boundaries, comparison arithmetic, product semantics
  and operational health behavior.
