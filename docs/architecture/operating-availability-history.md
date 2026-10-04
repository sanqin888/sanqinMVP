# Operating / Availability History

Date: 2026-10-04  
Implementation base: `origin/dev@48e20534`  
State: **HIST-B MERGED / HIST-C MERGED / PR #2690 / CI #6892 GREEN / HIST-D LOCAL IMPLEMENTED / USER REVIEW PENDING / NO PRODUCTION DEPLOYMENT / NO LEGACY BACKFILL**

## Goal

Add owner-backed operational history needed by Admin **数据 -> 销售分析 / Sales Analytics** so the existing
daily explanatory table can show:

- **营业时间 / Actual operating time** for each Store-local date;
- **菜品下架 / unavailable items** as a distinct item count;
- an inline drill-down for each counted item showing its cumulative unavailable duration **inside actual operating intervals**.

This is a forward-only fact foundation. History before the new capture cutover is unknown and must not be
backfilled, inferred from current configuration, logs, Orders, or treated as zero.

No standalone Operational History page/card is planned. The facts exist to explain Sales/operations and may
later support owner-backed metrics such as sales per operating hour or availability ratios.

## 2026-10-04 focused readiness audit

The latest code confirms:

1. POS customer-ordering pause is a two-state UI. While accepting orders, the button exposes
   15/30/60/120/180-minute and until-tomorrow choices. While paused, the same button calls resume directly;
   the UI cannot extend a pause by selecting another duration.
2. The POS backend still accepts a second pause command while already paused. HIST-B must reject that state
   transition so backend semantics match the current POS UI and history cannot be silently rewritten.
3. Current Store schedule authority is mutable only:
   - `BusinessHour` is replaced with `deleteMany + createMany`;
   - `Holiday` is replaced the same way;
   - `StoreConfig.timezone` has only its current value;
   - Reporting therefore correctly exposes Store history as `CURRENT_CONFIGURATION_ONLY`.
4. Current temporary closure state is persisted in
   `StoreConfig.isTemporarilyClosed + temporaryCloseReason`, but no durable historical interval exists.
5. Current MenuItem availability is persisted in
   `MenuItem.isAvailable + tempUnavailableUntil`, but no durable historical interval exists.
6. The dedicated Item availability route is not the only mutation surface: generic
   `PUT /admin/menu/items/:itemStableId` still accepts `isAvailable` and `tempUnavailableUntil`.
   HIST-B must remove that bypass after confirming runtime consumers continue to use the dedicated availability route.
7. `TEMP_TODAY_OFF` still uses process-local `new Date().setHours(24, 0, 0, 0)`.
   Production currently sets `TZ=America/Toronto`, matching the Yonge Store, but that is not a valid
   multi-Store historical authority.
8. `GET /reports/business` is already the Reporting-owned Business Operations projection and Sales Analytics
   already consumes it. The existing Reporting -> Brand/Store composition seam and the already-authorized
   Reporting -> Catalog read direction are the correct consumers for the new history.
9. `ReportsModule` is already a registered scanner-excluded composition root. Owner implementation imports
   must remain confined there; Reporting services/contracts must not import Store/Catalog implementations or Prisma delegates.
10. Sales Analytics already has the daily explanatory table and the current operating-history coverage card,
    so no fifth request or standalone history widget is needed.

## Frozen metric semantics

### Actual operating time

For a Store-local date:

```text
historically effective Store schedule
minus temporary customer-ordering closure intervals
= actual operating intervals
```

The historically effective schedule uses the schedule version active at each instant. Operator-configured Holiday
rows override the normal weekday schedule exactly as current StoreStatus does.

For Store-local Today, future scheduled minutes after report generation time are not counted.

The UI label remains **营业时间 / Operating time**, with explanatory copy stating that this means scheduled
Store operating time after temporary customer-ordering pauses. It does not assert that the physical door was
locked or that POS staff could not create an in-store Order.

### Unavailable item count and duration

For each Store-local date:

```text
MenuItem unavailable interval
INTERSECT
actual operating intervals
= Sales-explanatory unavailable duration
```

The displayed count is the number of **distinct MenuItems** with a non-empty intersection. An item that was
unavailable before the date and remains unavailable during that date counts. An item that is unavailable only
while the Store is not operating does not count for that date.

Multiple unavailable intervals for the same item are summed. A continuous transition such as
`TEMP_TODAY_OFF -> PERMANENT_OFF` remains one continuous unavailable interval rather than an artificial
second outage.

Option/modifier availability is explicitly out of scope for this first work package.

### Duration formatting

Shared presentation semantics:

- 0-59 minutes: `X分钟`;
- 60 minutes: `1小时`;
- above 60 minutes: `X小时Y分钟`, omitting a zero-minute suffix.

## Ownership and persistence design

### Brand / Store owner

HIST-A adds additive schema foundations for:

- `StoreOperatingHistoryState`: per-Store forward-only capture start and schedule revision counter;
- `StoreScheduleVersion`: immutable full schedule snapshots with
  `effectiveFrom`, timezone, BusinessHour snapshot and Holiday snapshot;
- `StoreTemporaryClosureInterval`: actual/effective temporary customer-ordering closure intervals.

Schedule versions are full snapshots because BusinessHour/Holiday writes are already whole-set replacement
operations. A version becomes effective at its recorded `effectiveFrom`; historical projection must respect
mid-day configuration changes rather than applying the newest schedule to an entire historical date.

Store history uses internal `Store.id` only inside the Store persistence owner. Public read contracts expose
`storeStableId` and owner facts, never the DB UUID. The new Store-history foreign keys use delete-restrict
semantics so a Store cannot be hard-deleted while durable operating-history facts still depend on it.

### Catalog owner

HIST-A adds additive schema foundations for:

- `CatalogAvailabilityHistoryState`: per-Store forward-only Catalog availability capture start;
- `CatalogItemUnavailableInterval`: MenuItem unavailable intervals keyed by stable Store/Item identities and
  carrying bilingual name snapshots for historical display.

The interval intentionally has no MenuItem foreign key: the stable business identity + name snapshot preserves
the historical fact after later rename/soft-delete operations.

### Forward-only cutover / baseline

HIST-B initializes capture once per Store after the migration exists:

- Store baseline creation is owner-local and idempotent through the unique `StoreOperatingHistoryState.storeDbId`;
- Catalog baseline creation is owner-local and idempotent through the unique
  `CatalogAvailabilityHistoryState.storeStableId`;
- each Store baseline records `trackingStartedAt` and revision 1 as a complete timezone + BusinessHour + Holiday snapshot;
- an active Store closure at cutover is represented only from `trackingStartedAt`; an auto-pause whose planned end is already at/before cutover is not reconstructed;
- each actually unavailable MenuItem at cutover is represented only from `trackingStartedAt`; an expired
  `tempUnavailableUntil` is ignored;
- repeated API/bootstrap execution does not create a second baseline or revision 1.

This is **not historical backfill**. Facts before `trackingStartedAt` remain unknown.

A report date without full Store + Catalog coverage must surface PARTIAL/UNAVAILABLE coverage rather than
inventing zero minutes or zero unavailable items. The cutover date is normally partial unless capture began at
that Store-local day's start.

## Atomicity invariants for HIST-B

The following mutations must be committed atomically with their history facts:

- Store pause/resume/auto-resume <-> temporary closure interval;
- BusinessHour/Holiday/timezone change <-> schedule version;
- MenuItem availability change <-> unavailable interval.

No implementation may commit current state first and append history in a later transaction.

POS duplicate pause requests while already paused must fail rather than alter the active interval. Automatic
resume may be reconciled after its planned instant, but the effective interval must end at the planned resume
instant rather than at a delayed worker/read reconciliation timestamp.

## Timezone boundary decision

`TEMP_TODAY_OFF` must use the selected Store's canonical IANA timezone rather than process `TZ`.

The approved design is a narrow read seam at the existing
`CatalogUberAvailabilityOrchestrationModule` composition root:

```text
Catalog availability orchestration
        -> Brand / Store timezone public reader
        -> Catalog owner availability command
```

Catalog persistence itself must not import Store persistence/Prisma. This is an intentionally narrow
Catalog-orchestration -> Brand/Store read direction needed to make Store-local “today” correct for future
multi-Store operation. It must not introduce a scanner direct-import ceiling or SCC allowance.

## Reporting / Admin delivery

HIST-C will extend the existing `GET /reports/business` response with a dedicated
`operatingHistory` projection rather than overloading the existing Orders `timeline`.

Reporting will obtain Store/Catalog history only through owner public readers adapted in `ReportsModule`.
It computes Store-local schedule intervals, subtracts closure intervals, then intersects item-unavailable
intervals with the resulting actual-operating intervals.

HIST-D updates the existing Sales Analytics **逐日解释上下文 / Daily explanatory context** table:

```text
日期 | 节假日 | 净销售 | 订单 | AOV | 运营预期 | 营业时间 | 菜品下架 | 天气 | 降水/积雪
```

`菜品下架` displays a distinct count. A non-zero count expands inline to show item name and cumulative
operating-time-unavailable duration, sorted longest first. The existing operating-history Coverage card is
upgraded to Store schedule/pause + Catalog availability coverage; no standalone Operational History card is added.

## Delivery slices

### HIST-A — persistence/contracts foundation

- additive Prisma models only;
- owner read-contract types/symbols only;
- architecture/backlog/Admin Data records;
- no runtime capture, Reporting/UI change, bootstrap or migration generation.

**MIGRATION REQUIRED.** Per `AGENTS.md`, MCP does not create or edit
`apps/api/prisma/migrations/**`.

Suggested user-local command after HIST-A source/schema is reviewed and merged into `dev`:

```bash
pnpm --filter api exec prisma migrate dev --create-only --name add_operating_availability_history
```

Expected generated SQL is additive CREATE TABLE / FK / index work only. There is intentionally no historical
backfill, DROP, rename, existing-row rewrite, NOT NULL contraction on existing tables, or destructive operation.
Promotion to `main` / production is blocked until the user-generated migration is reviewed and merged back to
`dev`.

### HIST-B — owner atomic capture / cutover

**Merged through PR #2689 / squash `40fd2fd5`; CI #6888 green. No production deployment has been performed.**

Implemented owner invariants:

- BusinessHour/Holiday replacements compare normalized complete sets first; true no-op writes do not increment
  `scheduleRevision`. Real changes and the resulting full schedule snapshot commit in one Prisma transaction.
- `StoreConfig.timezone` changes version the full post-change schedule in the same transaction and use the actual
  mutation instant as `effectiveFrom`.
- POS pause uses an owner command that rejects an already-paused Store before mutation. Current Store state and
  the closure interval share one transaction.
- planned POS auto-resume is stored as the interval's effective end. Early manual resume shortens it; delayed
  reconciliation retains the planned end rather than scheduler delay. Forward-only cutover also permits clearing
  a stale pre-cutover expired pause without inventing an interval.
- Admin manual temporary closure remains open-ended (`endedAt=null`) until actual resume.
- MenuItem availability state and its history transition share one Catalog transaction. TEMP -> PERMANENT remains
  one interval by changing its end semantics; restore then later disable creates a new interval.
- MenuItem unavailable intervals snapshot `menuItemStableId + nameEn/nameZh`.
- generic Item create/update paths reject availability fields; new items are created available and later
  availability changes must use the dedicated route.
- Admin and POS MenuItem/option consumers were rechecked and use the dedicated `/availability` route.
- Store-local TEMP_TODAY_OFF is resolved with the Store IANA timezone through a narrow local port assembled only
  in the existing scanner-excluded `CatalogUberAvailabilityOrchestrationModule`; Catalog persistence does not
  import Store persistence/public implementation and no scanner allowance is added.

Focused regression source covers baseline idempotency/expired temp exclusion, schedule revision/full snapshot,
timezone versioning/no-op behavior, duplicate pause rejection, early resume, delayed reconciliation, Store-local
TEMP today, TEMP -> PERMANENT continuity, repeated same-item outages, generic availability bypass rejection and
current-state/history transaction failure propagation.

The required modularization worklog updates for HIST-B, HIST-C and HIST-D were attempted, but MCP rejected the
writes because the file would exceed its 1,000,000-character write limit. Per project instruction, these slices
do not bypass or rewrite that file through another mechanism; this limitation is recorded here for later
authorized maintenance.

### HIST-C — Reporting projection

**Merged through PR #2690 / squash `48e20534`; CI #6892 green. No production deployment has been performed.**

HIST-C adds only owner reads and Reporting projection:

- Brand/Store implements the existing `STORE_OPERATING_HISTORY_READER` contract over
  `StoreOperatingHistoryState`, `StoreScheduleVersion` and overlapping temporary-closure intervals;
- Catalog implements the existing `CATALOG_AVAILABILITY_HISTORY_READER` contract over forward-only coverage
  state and overlapping MenuItem unavailable intervals;
- `ReportsModule` adapts both owner readers into Reporting-local ports. `BusinessOperationsReportService`
  imports neither Store/Catalog implementations nor Prisma;
- `GET /reports/business` gains an additive `operatingHistory` projection. The existing order baseline,
  anomaly calculation and current `storeContext` semantics are unchanged;
- each report day exposes explicit `AVAILABLE / PARTIAL / UNAVAILABLE` history coverage. A date without full
  Store coverage returns null operating metrics rather than a manufactured zero; a date with Store coverage but
  incomplete Catalog coverage may expose trustworthy Store operating minutes while item count/duration remain
  null;
- schedule versions are applied at their real `effectiveFrom`, including mid-day changes. Each version uses its
  own historical timezone, BusinessHour snapshot and Holiday override;
- actual operating intervals are scheduled intervals minus overlapping Store temporary closures. Closure minutes
  outside scheduled time do not count;
- MenuItem unavailable intervals are intersected only with actual operating intervals. Multiple intervals for
  the same item are merged before duration is calculated, so overlapping/repeated evidence cannot double-count
  minutes. The additive projection also exposes the effective Store-pause intervals and each item's effective
  unavailable intervals so HIST-D can render concrete Store-local segments such as `13:00-18:00` and
  `20:00-21:00` without reimplementing interval arithmetic in the browser;
- item unavailability entirely outside actual operating time is excluded from the distinct unavailable-item count;
- the forward-only cutover day remains PARTIAL unless both Store and Catalog capture began at/before that report
  day boundary.

Focused regression source covers owner overlap reads/null coverage, Reporting composition adapters, mid-day
schedule changes, Store closure subtraction, Holiday override, unavailable-item intersection and cutover-day
fail-closed coverage.

HIST-C does **not** modify Admin Sales Analytics UI, duration formatting, Accounting authority, schema/migrations,
capture state machines or production runtime. Those remain HIST-D/HIST-E work.

### HIST-D — Admin Sales Analytics UI

**Local implementation complete; user review pending. No remote submission or production deployment has been performed.**

The existing **逐日解释上下文 / Daily explanatory context** table now consumes the HIST-C
`operatingHistory` projection directly:

- adds **营业时间 / Operating time** using owner-backed actual operating minutes;
- when Store pause time is non-zero, the operating-time cell expands to show total paused duration and a second-level
  Store-local interval list such as `13:00–18:00`, `20:00–21:00`;
- adds **菜品下架 / Unavailable items** as a distinct-item count; a non-zero count expands to item name + cumulative
  unavailable duration, then a second-level Store-local list of each effective unavailable segment;
- duration display follows the frozen minute/hour rules; interval display uses the report Store timezone and 24-hour
  `HH:mm–HH:mm` semantics;
- PARTIAL/UNAVAILABLE facts remain fail-visible as `—`; the UI does not convert missing historical evidence to zero;
- the existing **营业历史 / Operating history** Coverage card now reports combined Store + Catalog history coverage
  and separately states Store schedule/pause and Catalog availability coverage;
- the browser performs no interval arithmetic. It only joins daily owner-backed facts and formats the exact effective
  intervals already projected by HIST-C.

HIST-D does not add a fifth request or standalone history widget, and does not modify API calculation semantics,
schema/migrations, Accounting authority or architecture boundaries.

### HIST-E — production verification

After migration + trusted-image deployment:

1. verify capture-start/baseline markers;
2. scheduled pause + early manual resume;
3. scheduled pause + automatic resume;
4. same MenuItem unavailable twice in one day;
5. TEMP -> PERMANENT continuous interval;
6. Store pause overlapping MenuItem unavailability;
7. Holiday/special-hours date;
8. Store-local day boundary;
9. pre-cutover range returns PARTIAL/UNAVAILABLE rather than zero;
10. healthy API/Web/worker logs and migration parity.

## Architecture status

This is a new post-modularization product/reliability work package; it does **not** reopen closed B5 or DATA-A-F.
Accounting money authority remains unchanged.

HIST-A persistence stays inside Brand/Store and Catalog ownership. HIST-C reuses already-authorized
Reporting read directions through public contracts/composition roots. The only newly authorized conceptual
read is the narrow Catalog availability-orchestration -> Brand/Store timezone seam described above.
