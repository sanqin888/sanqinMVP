# Operating / Availability History

Date: 2026-10-04  
Audit base: `origin/dev@24545aba`  
State: **READINESS AUDIT COMPLETE / HIST-A LOCAL IMPLEMENTED / USER REVIEW PENDING / MIGRATION REQUIRED / NO LEGACY BACKFILL**

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

HIST-B will initialize capture once per Store after the migration exists:

- set the Store and Catalog `trackingStartedAt`;
- append the current complete Store schedule as the first schedule version;
- if the Store is paused at cutover, open/seed a closure interval only from `trackingStartedAt`;
- for MenuItems unavailable at cutover, open/seed item intervals only from `trackingStartedAt`.

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

- Store schedule/timezone version writes;
- Store pause/resume interval writes;
- Catalog unavailable interval writes;
- idempotent forward-only baseline initialization;
- remove generic MenuItem availability mutation bypass;
- reject duplicate POS pause while already paused;
- Store-timezone-aware `TEMP_TODAY_OFF`.

### HIST-C — Reporting projection

- narrow Store/Catalog historical readers;
- Reporting-owned adapter ports in `ReportsModule`;
- additive `/reports/business` operating-history projection;
- Store-local interval arithmetic and explicit coverage.

### HIST-D — Admin Sales Analytics UI

- daily Operating time column;
- unavailable-item count column + inline detail;
- shared hour/minute duration formatting;
- existing Coverage card upgrade.

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
