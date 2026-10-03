# Admin Data — Sales Analytics / Management P&L migration

Date: 2026-10-03  
Baseline: `origin/dev@ff1d7a41` after DATA-A merge  
Current state: **DATA-A MERGED / CI #6817 GREEN / PR #2667 / MERGE `ff1d7a41`; DATA-B1 LOCAL IMPLEMENTED / USER REVIEW PENDING / MIGRATION REQUIRED / NO NEW DEPENDENCY / NO GRAPH OR BASELINE CHANGE**

## Product goal

Make Admin the primary management-analysis surface while keeping Accounting as the owner of
financial authority.

Target Admin Data navigation:

```text
Data
├─ Business overview        [Store-scoped]
├─ Sales analytics          [Store-scoped]
├─ Management P&L           [Whole-ledger / whole-business]
└─ Behavior analytics
```

Accounting remains the owner of canonical Sales, Management P&L projection, Journal,
provider coverage, settlement, tax, tender and formal accounting statements. Admin/Web
must not recompute Accounting money from Orders or Expense persistence.

## Scope and ownership decisions

### Store-scoped operational and Sales views

Business overview and the future Sales Analytics page are Store-scoped. They use the
selected Admin `storeStableId` and Store timezone.

Canonical Sales money remains produced by Accounting:

```text
Accounting Journal
      ↓
AccountingSalesAnalyticsService
      ↓
GET /accounting/report/sales
      ↓
Admin Sales Analytics presentation
```

Orders/Reporting may contribute operational Order count, AOV, item/channel/fulfillment and
baseline context, but those values do not replace Accounting revenue/tax/fee authority.

### Whole-business Management P&L

Management P&L remains an Accounting-owned whole-ledger projection. Moving its primary UI
to Admin later does not make it Store-scoped and does not move its arithmetic into Admin.

The future Admin Management P&L page must visibly identify its scope as whole business /
whole ledger and must not display the Store selector as though its result belonged only to
the selected Store.

### Weather

Historical weather is explanatory Reporting/Analytics context, not an Accounting fact.
Weather work starts in DATA-B1 and must fail independently from canonical Sales.

### Calendar / holiday context

Sales Analytics must also carry historical calendar context for public/statutory holidays
and long weekends. This is a Reporting/Analytics explanatory fact, not an Accounting fact
and not a Store-schedule authority.

The existing Brand/Store `StoreHoliday` rows are **not** sufficient as the historical
holiday-calendar authority. They are operator-maintained opening-hours exceptions and the
current Reporting contract correctly marks their history coverage as
`CURRENT_CONFIGURATION_ONLY`. Sales Analytics must therefore keep two concepts separate:

- **Calendar holiday context:** historical Canada/Ontario public/statutory-holiday and
  long-weekend labels derived from the Store's `countryCode`, province and timezone using
  versioned Reporting-owned calendar rules;
- **Store holiday schedule:** current operator-configured open/closed/special-hours
  exceptions, surfaced only with its existing coverage limitation.

Calendar v1 should at minimum expose Store-local `date`, holiday name, jurisdiction,
holiday/public-holiday classification and a long-weekend marker. It must be deterministic
for historical dates in the supported reporting range, require no browser/provider secret,
and remain usable when Weather data is unavailable.

Commercial/cultural event calendars such as Mother's Day, Lunar New Year, major local
events or nearby venue events are useful later explanatory inputs but are not silently
classified as statutory/public holidays in this first calendar contract.

## DATA-A — Store scope and Admin Data foundation

State: **MERGED / CI #6817 GREEN / PR #2667 / MERGE `ff1d7a41`**.

DATA-A is an additive compatibility-preserving source change:

1. `GET /accounting/report/sales` accepts optional `storeStableId`.
2. When supplied, Accounting resolves the Store through the existing
   `BRAND_STORE_CONFIG_READER.getStoreSnapshot(storeStableId)`.
3. When omitted or blank, the existing configured-Store behavior remains unchanged through
   `getConfiguredStoreSnapshot()`.
4. Journal money, source-fact authority, provider coverage, attribution policy, date
   semantics and the v1 response shape are unchanged.
5. Admin navigation adds explicit per-item `preserveStoreContext` metadata. The current
   Business Reports item is Store-scoped and exact-match; the Data category owns the
   `/admin/reports/**` route family without making every Data child Store-scoped.
6. This prepares Sales Analytics to preserve `?store=` while allowing the later
   Management P&L item to remain whole-business.

DATA-A does not add the new Sales page, Weather persistence/provider, Management P&L page,
Prisma schema, migration, package dependency or new context dependency.

## Approved Sales Analytics date UX

DATA-C must expose these Sales Analytics range controls:

- trailing 7 days;
- trailing 30 days;
- trailing 90 days;
- a single-day quick selector rendered as `<  MM/DD/YYYY  >`.

Single-day behavior:

- default date is the selected Store's local **Today**;
- `<` moves one local calendar day backward;
- `>` moves one local calendar day forward;
- `>` is disabled when the next date is in the future or when the next date has no
  relevant Sales/Order evidence;
- date semantics use the selected Store IANA timezone, never browser/VM default timezone;
- the UI must not label weather or other contextual correlation as proven causation.

The exact next-day availability probe belongs to DATA-C. It must use owner-backed report
evidence rather than infer data existence from the browser clock.

## Delivery sequence

### DATA-A — Store scope / Admin Data foundation

- optional explicit Store on canonical Sales;
- configured-Store compatibility fallback;
- Store-context-aware Admin Data navigation foundation.

### DATA-B1 — Weather History foundation

State: **LOCAL IMPLEMENTED / USER REVIEW PENDING / MIGRATION REQUIRED / NO NEW DEPENDENCY / NO GRAPH OR BASELINE CHANGE** on `feat/admin-data-weather-history-foundation` from `origin/dev@ff1d7a41`.

Implementation:

- Reporting owns the Weather History application contract and orchestration; `WeatherHistoryService` depends only on Reporting-owned Store-location, weather-provider and weather-persistence ports;
- the existing Brand/Store public config reader is adapted at `ReportsModule` into a narrow Store location/jurisdiction context containing only `storeStableId`, timezone, latitude/longitude, country code and province;
- Meteostat is isolated behind an infrastructure adapter using the existing `@nestjs/axios` dependency and server-only `METEOSTAT_RAPIDAPI_KEY`; Weather persistence maps through a Reporting-owned DB port while the actual `PrismaService` binding remains only in the scanner-excluded `ReportsModule` composition root; no provider secret enters Web or a URL returned to the browser;
- DATA-B1 uses Meteostat **Hourly Point** and aggregates observations into Store-local daily facts so Store-local Today can be provisional rather than waiting for delayed Daily data;
- provider requests are chunked to the provider's 30-day hourly limit, while the public Reporting range is capped at 90 local calendar days;
- persisted `ReportingWeatherDailyFact` rows are keyed by `(storeStableId, localDate)` and snapshot timezone + coordinates used for that historical weather interpretation;
- persisted status is explicit: `HISTORICAL | PROVISIONAL | PARTIAL | UNAVAILABLE`; stable historical rows are reused, current/provisional/degraded rows use bounded refresh intervals, sparse cache gaps are refreshed as contiguous groups, and provider failures are negatively cached instead of retried on every page view;
- additive `GET /reports/weather-history?storeStableId=&from=&to=` returns every requested date plus coverage/refresh/limitation metadata; provider/key/coordinate failure is fail-soft and never becomes Accounting authority;
- the response carries required source attribution: `Meteostat and its data providers`, `CC BY 4.0`, the CC BY 4.0 license URL and an explicit SanQ hourly-to-daily transformation note;
- production Compose passes only the optional server-side `METEOSTAT_RAPIDAPI_KEY` reference. The secret itself is not committed.

Persistence is additive but requires a user-generated migration. Suggested migration name:

```bash
pnpm --filter api exec prisma migrate dev --create-only --name add_reporting_weather_daily_facts
```

Expected SQL is create-table/index only. MCP must not generate or edit that migration. DATA-B1 cannot be promoted to `main` / production until the generated migration is reviewed, committed to `dev`, CI-green and applied through the normal deployment gate.

### DATA-B2 — Calendar / Holiday Context foundation

- Reporting-owned historical calendar projection keyed by Store jurisdiction + local date;
- versioned Canada/Ontario public/statutory-holiday rules plus long-weekend markers;
- no reuse of mutable Store holiday-opening configuration as historical holiday authority;
- no external browser API or provider secret;
- explicit contract separation between calendar holidays and current Store schedule
  exceptions.

### DATA-C — Admin Sales Analytics

- `/admin/reports/sales`;
- 7/30/90-day controls plus approved single-day selector;
- canonical Accounting Sales + Business Operations + Weather + Calendar presentation join;
- daily/table/chart context visibly marks holiday / long-weekend dates alongside weather;
- explicit Store/range/timezone identity checks;
- financial previous-period comparison remains distinct from B5 same-weekday operational
  baseline.

### DATA-D — Admin Management P&L

- primary Management P&L / management cash-movement UI moves to Admin;
- consumes existing Accounting-owned P&L/Cash Movement contracts;
- clearly marked whole-business scope;
- no Store selector and no Store-P&L claim.

### DATA-E — Production verification

Verify Store switching, canonical Sales parity, range/date controls, Weather degradation,
historical holiday/long-weekend labeling, separation from current Store holiday schedule,
Management whole-ledger scope and existing Accounting/Admin access behavior.

### DATA-F — Accounting UI contraction

Only after Admin replacement surfaces are verified:

- rename/reframe Accounting Sales as **Sales Accounting**;
- remove management-analysis presentation that has moved to Admin while retaining canonical
  Sales authority/read contracts;
- remove Management P&L presentation from Accounting Reports;
- keep Trial Balance / Balance Movement and later formal statements in Accounting.

## Architecture impact

DATA-A introduces no new 12-context dependency direction, scanner allowance, SCC,
dependency package or persistence model. It reuses the existing Accounting -> Brand/Store
public configuration seam and changes only an optional HTTP query plus Web/Admin navigation
composition metadata.

DATA-B1 also introduces no new 12-context direction: Reporting reuses the already-authorized
Brand/Store public config seam and owns its own read-model persistence/provider adapters.
It adds one Reporting-owned table and one additive authenticated Reporting HTTP read contract,
but no package dependency, scanner allowance, SCC or architecture-baseline change.

B2 Canonical Sales Analytics and B5 Admin Business Reports remain closed; this work is a
post-modularization product/UI ownership refinement and does not reopen their financial or
operational authority.
