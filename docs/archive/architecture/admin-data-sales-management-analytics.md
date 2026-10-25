# Admin Data — Sales Analytics / Management P&L migration

Date: 2026-10-03  
Closed: 2026-10-04  
Source closure: PR #2677 / squash `86057bbf` after Sales commercial-item mix follow-up PR #2676 / squash `90308226`  
Current state: **PRODUCTION VERIFIED / CLOSED — Admin Sales Analytics + Admin Management P&L are the management-analysis surfaces; Accounting is contracted to Sales Accounting + canonical statements; no DATA-G is planned for this work package**

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

State: **MERGED / PR #2668 / SOURCE HEAD `6ef4d330` / SQUASH `37ac9c56` / CI #6822 GREEN / MIGRATION `7934d875` REVIEWED + APPLIED / PRODUCTION VERIFIED / NO NEW DEPENDENCY / NO GRAPH OR BASELINE CHANGE**.

Implementation:

- Reporting owns the Weather History application contract and orchestration; `WeatherHistoryService` depends only on Reporting-owned Store-location, weather-provider and weather-persistence ports;
- the existing Brand/Store public config reader is adapted at `ReportsModule` into a narrow Store location/jurisdiction context containing only `storeStableId`, timezone, latitude/longitude, country code and province;
- Meteostat is isolated behind an infrastructure adapter using the existing `@nestjs/axios` dependency and server-only `METEOSTAT_RAPIDAPI_KEY`; Weather persistence maps through a Reporting-owned DB port while the actual `PrismaService` binding remains only in the scanner-excluded `ReportsModule` composition root; no provider secret enters Web or a URL returned to the browser;
- DATA-B1 uses Meteostat **Hourly Point** and aggregates observations into Store-local daily facts so Store-local Today can be provisional rather than waiting for delayed Daily data;
- provider requests are chunked to the provider's 30-day hourly limit, while the public Reporting range is capped at 90 local calendar days;
- persisted `ReportingWeatherDailyFact` rows are keyed by `(storeStableId, localDate)` and snapshot timezone + coordinates used for that historical weather interpretation;
- persisted status is explicit: `HISTORICAL | PROVISIONAL | PARTIAL | UNAVAILABLE`; stable historical rows are reused, current/provisional/degraded rows use bounded refresh intervals, sparse cache gaps are refreshed as contiguous groups, and actual attempted provider failures remain negatively cached instead of retried on every page view;
- missing `METEOSTAT_RAPIDAPI_KEY` is treated as non-cacheable configuration unavailability: Reporting logs an explicit warning, returns fail-soft unavailable coverage, and does not persist synthetic `UNAVAILABLE` rows that would outlive a later configuration fix;
- additive `GET /reports/weather-history?storeStableId=&from=&to=` returns every requested date plus coverage/refresh/limitation metadata; provider/configuration/coordinate failure is fail-soft and never becomes Accounting authority;
- the response carries required source attribution: `Meteostat and its data providers`, `CC BY 4.0`, the CC BY 4.0 license URL and an explicit SanQ hourly-to-daily transformation note;
- production Compose passes only the optional server-side `METEOSTAT_RAPIDAPI_KEY` reference. The secret itself is not committed.

Persistence is additive but requires a user-generated migration. Suggested migration name:

```bash
pnpm --filter api exec prisma migrate dev --create-only --name add_reporting_weather_daily_facts
```

The user-generated migration `20261003185132_add_reporting_weather_daily_facts` is committed to `dev` as `7934d875`, reviewed as the expected additive-only CREATE TABLE + primary key + two indexes, and applied in production. It contains no DROP, ALTER, rename, backfill or existing-table mutation. The source/schema/history invariant is restored and Weather persistence/provider recovery is production verified.

### DATA-B2 — Calendar / Holiday Context foundation

State: **MERGED / PR #2669 / FINAL HEAD `3484dfe1` / CI #6826 GREEN / SQUASH `56f35b0c` / NO MIGRATION / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE**.

Implementation:

- Reporting adds deterministic authenticated `GET /reports/calendar-context?storeStableId=&from=&to=`, capped at the same 90 Store-local calendar days used by the Sales/Weather analysis surface;
- the projection reuses the existing Reporting Store-location/jurisdiction port only; no Prisma, HTTP provider, browser secret, package dependency or Store-schedule implementation import is introduced;
- v1 authority is explicitly **Ontario ESA public holidays**, versioned as `CA-ON-ESA-PUBLIC-HOLIDAYS / 2026-10-03-v1`, supported from `2008-01-01`;
- the nine Ontario ESA public holidays are New Year's Day, Family Day, Good Friday, Victoria Day, Canada Day, Labour Day, Thanksgiving Day, Christmas Day and Boxing Day;
- Civic Holiday, Easter Monday, National Day for Truth and Reconciliation and Remembrance Day are intentionally **not** classified as Ontario ESA public holidays in v1;
- fixed and variable-date rules are deterministic, including Family Day = third Monday in February, Good Friday = Friday before Easter, Victoria Day = Monday preceding May 25, Canada Day = July 1 except July 2 when July 1 is Sunday, Labour Day = first Monday in September and Thanksgiving = second Monday in October;
- long-weekend context is defined narrowly as a public holiday on Friday or Monday plus the adjacent Saturday/Sunday; all three dates receive the same long-weekend label and role, including cross-year spans such as a Monday New Year's Day;
- substitute holidays are not inferred without historical Store/employment evidence, and Calendar Context never claims that the Store was closed merely because a date is an ESA public holiday;
- unsupported Store jurisdictions return explicit `UNAVAILABLE / UNSUPPORTED_JURISDICTION` classification rather than silently treating unknown dates as non-holidays;
- the API carries Store-local date, weekday, bilingual holiday labels, jurisdiction/category and long-weekend start/end/role while remaining fully separate from mutable `StoreHoliday` operating-schedule rows, which retain `CURRENT_CONFIGURATION_ONLY` history coverage.

Official rule authorities are recorded in-band in the response contract using Ontario ESA public-holiday guidance, the Ontario Family Day proclamation and the Ontario ESA Policy and Interpretation Manual's public-holiday date rules. No persistence or migration is required.

### DATA-C — Admin Sales Analytics

State: **MERGED / PR #2670 / FINAL HEAD `ebe02b93` / CI #6829 GREEN / SQUASH `d748327f` / NO MIGRATION / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE**.

Implementation:

- adds Store-scoped `/admin/reports/sales` and updates Admin Data navigation to `Business overview / Sales analytics / Behavior analytics`; the Sales item uses existing `preserveStoreContext` behavior and existing Store selector, while Data as a whole remains not implicitly Store-scoped;
- extracts canonical Sales browser DTOs from the Accounting route subtree into shared Web contract `apps/web/src/lib/contracts/accounting-sales.ts`; existing Accounting consumers re-export the same types so the source-of-truth response shape is not duplicated between Admin and Accounting pages;
- Admin performs a presentation-only parallel join of owner contracts: canonical `/accounting/report/sales`, Reporting `/reports/business`, Weather `/reports/weather-history` and Calendar `/reports/calendar-context`; there is no new backend aggregate service and no Admin recomputation of Journal money;
- canonical Sales + Business Operations are required core evidence. Store, timezone and exact requested range are checked before joining; mismatch is fail-visible. Weather/Calendar provider/request failure is fail-soft and surfaces as unavailable context without invalidating canonical Sales;
- date controls are exactly 7d / 30d / 90d plus the approved `< MM/DD/YYYY >` single-day selector. The initial date comes from Business Operations Store-local Today rather than browser time. `<` moves one local calendar day backward and is bounded by Accounting coverage;
- `>` is disabled for future dates and otherwise performs an owner-backed probe of both canonical Sales Journal evidence and Business Orders evidence. It is enabled only when the next day has `journalEntryCount > 0` or `orderCount > 0`, which preserves External Sales-only dates while avoiding browser-clock/data-existence guesses;
- management KPIs keep **Previous equal period** financial comparison separate from the B5 **Same-weekday operating baseline**. The main chart shows canonical current Net Sales Revenue, canonical previous-period Net Sales Revenue and average temperature; public-holiday markers are explanatory only;
- daily explanatory context joins canonical Sales, Orders order count/AOV/operating expected Order total, Weather temperature/precipitation/snow and Calendar holiday/long-weekend labels. The UI explicitly states that operational Order totals are not Accounting revenue and contextual correlation is not proven causation;
- channel table uses canonical Journal amounts with descriptive channel attribution; commercial-item quantities/penetration come from Orders Reporting and do not recalculate revenue;
- coverage panel preserves provider financial coverage, Weather availability, Calendar availability, current-only Store operating-history limitation and Meteostat attribution/license;
- the original Accounting Sales presentation was intentionally retained through DATA-E; DATA-F now locally contracts it to the Sales Accounting reconciliation surface after production verification closed.

Focused date/model/source-characterization regressions are included. Per `AGENTS.md`, local lint/build/test are not run before user review; GitHub Actions remains the validation gate after remote authorization.

### DATA-D — Admin Management P&L

State: **MERGED / PR #2671 / FINAL HEAD `8b9d23b0` / CI #6832 GREEN / SQUASH `b5acbf09` / NO MIGRATION / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE**.

Readiness confirmed that the existing Accounting owner contracts are sufficient: `GET /accounting/report/pnl?from=&to=&groupBy=` and `GET /accounting/report/cashflow?from=&to=` are already authenticated for `ADMIN | ACCOUNTANT`, have no Store parameter, and project whole-business / whole-ledger Journal authority. Management CSV/PDF already calls the same Accounting P&L service, so DATA-D does not need a new backend projection.

Implementation:

- adds `/admin/reports/management` as the primary Admin Management P&L surface and inserts `Management P&L` into Data navigation between Sales Analytics and Behavior Analytics;
- the navigation item deliberately has no `preserveStoreContext`; the existing AdminShell logic therefore hides the Store selector on this page. A residual/manual `?store=` is ignored because the page neither reads it nor sends `storeStableId`;
- the Admin client calls only the existing Accounting P&L and Cash Movement endpoints. No Order, Expense, Journal persistence or duplicate financial projection is read or reconstructed in Admin;
- Management P&L / Cash Movement browser DTOs move to shared Web contract `apps/web/src/lib/contracts/accounting-management.ts`; the existing Accounting reports contract re-exports them so current Accounting consumers stay source-compatible and the API response shape is unchanged;
- the existing business-timezone-safe Accounting report date helper moves to `apps/web/src/lib/accounting-reporting-date.ts` with the old Accounting route helper retained as a re-export, allowing both surfaces to share This month / Last month / This quarter / This year semantics without Admin importing Accounting route implementation;
- the Admin surface preserves custom from/to, month/quarter/year grouping, Income, Expenses, Net adjustment effect, Net profit, Adjustment effect breakdown, P&L trend, Cash Movement buckets, Category summary, Source summary and existing Management PDF/CSV exports;
- whole-business / whole-ledger scope is explicit in both page introduction and report disclosure. Cash Movement remains explicitly labeled **Journal-only management aid; not a formal Statement of Cash Flows**;
- Accounting Reports Management P&L, Trial Balance and Balance Movement were retained through DATA-E. DATA-F now locally removes the duplicated Management presentation while preserving Trial Balance / Balance Movement.

Focused source-characterization regressions pin owner endpoints only, no Store query/scope, non-Store-scoped navigation, shared-contract compatibility, absence of Admin financial arithmetic/persistence coupling, scope/disclaimer text, export reuse and retention of the current Accounting views. Final head `8b9d23b0` passed CI #6832 across API/Web validation, Browser E2E, printer-agent and Windows workstation; an older Phase 9 source-characterization assertion was updated to follow the approved shared Management contract extraction rather than requiring those DTO fields to remain physically declared in the Accounting route subtree.

### DATA-E — Production verification

State: **PRODUCTION VERIFIED / CLOSED / DATA-F UNBLOCKED**. Readiness source was delivered through PR #2673 / merge `6877ce25`; final verification was completed against deployed `main@f91b4bce`.

Pre-promotion read-only readiness evidence recorded on 2026-10-03:

- production repository is clean on local checkout `main@db239d70`; the GitHub `main` ref is `ca632b0c`, but `db239d70 -> ca632b0c` has zero changed files and is history-only reconciliation, so the deployed production tree is content-equivalent to current GitHub main before Admin Data promotion;
- latest `origin/dev` is `a2fbda75`. The compare `b5acbf09 -> a2fbda75` also has zero changed files; `a2fbda75` is the merge-history reconciliation of current main into dev after DATA-D;
- open promotion PR #2672 is `dev@a2fbda75 -> main@ca632b0c`, is mergeable, and CI #6836 is green. Its actual file delta is exactly DATA-A, DATA-B1 source + reviewed Weather migration, DATA-B2, DATA-C and DATA-D; no unrelated post-main application change is bundled;
- current production Compose services `db / api / ubereats-worker / web` are all healthy;
- production `_prisma_migrations` has no applied row for `20261003185132_add_reporting_weather_daily_facts`, and `ReportingWeatherDailyFact` does not yet exist;
- the committed Weather migration was re-read and remains additive-only: one table, one composite primary key and two indexes, with no DROP, ALTER, rename or backfill;
- Store `4750_Yonge_Street` has the required Reporting location/jurisdiction metadata: `America/Toronto`, `43.760288/-79.412167`, `CA / ON`;
- DATA-D source is merged through PR #2671 / final head `8b9d23b0` / CI #6832 green / squash `b5acbf09`.

At readiness time these facts made DATA-E **ready for controlled promotion** but did not themselves constitute production verification. Promotion, production migration application and deployment were subsequently completed under the normal explicit operational gates.

Completed rollout order was:

1. after explicit promotion authorization, merge the already-open, CI-green PR #2672 (`dev@a2fbda75 -> main@ca632b0c`), or re-audit if either ref moves before merge;
2. before changing production state, reconfirm clean intended `main`, recent database backup, healthy baseline/runtime and absence of an unrelated deployment/provider/payment incident;
3. under separate explicit authorization, apply the committed production migration `20261003185132_add_reporting_weather_daily_facts` through the normal controlled Prisma migration gate;
4. deploy/rebuild the intended production `main` checkout using the established Compose deployment path;
5. require migration parity plus API/worker/Web/public readiness after deployment; container start alone is not deployment success;
6. execute the product verification matrix below and record evidence before DATA-E can be marked `PRODUCTION VERIFIED`.

Production product verification matrix:

- **Store scope / navigation:** Business overview and Sales Analytics preserve the selected Store; changing Store changes their Store-scoped requests. Management P&L shows no Store selector. A manually retained `?store=` on the Management route must not alter its values or Accounting requests.
- **Canonical Sales parity:** for the same Store and date range, Admin Sales financial totals must reconcile to the canonical Accounting Sales owner response; Orders Business Operations remain explanatory/operational values rather than replacement revenue.
- **Date controls:** verify 7/30/90-day ranges and the Store-local single-day selector. Previous-day navigation remains bounded by Accounting coverage; next-day navigation remains disabled for future/no-evidence dates and enabled only by canonical Journal or Orders owner evidence.
- **Weather:** after the migration, Weather History can persist/read the Store-local daily projection when provider data is available, retains Meteostat/CC BY attribution, and does not change canonical Sales authority. Do not deliberately damage production credentials or provider configuration merely to manufacture an outage; any naturally unavailable/degraded provider state must remain fail-soft while Sales stays usable.
- **Calendar:** verify a known Ontario ESA public-holiday/long-weekend range and confirm the historical calendar labels remain distinct from mutable Store holiday/opening exceptions and their `CURRENT_CONFIGURATION_ONLY` limitation.
- **Management P&L:** Admin values must match the existing Accounting Management P&L for the same date/grouping; scope remains whole-business / whole-ledger regardless of Store context. Cash Movement must retain the Journal-only / non-formal Statement of Cash Flows disclosure, and Management PDF/CSV exports must remain usable.
- **Compatibility/access:** existing Accounting Management P&L, Trial Balance and Balance Movement remain available during DATA-E. Existing ADMIN/ACCOUNTANT/Admin access boundaries must not be broadened by the new Admin presentation.
- **Runtime evidence:** record deployed commit, migration status, healthy Compose state, local/public readiness and bounded API/Web/worker logs with no migration/schema/restart-loop errors.

This production matrix is now complete under the evidence recorded below and DATA-E is closed. DATA-F is therefore unblocked; Accounting presentation contraction begins only in the separate DATA-F source slice.

#### 2026-10-03 production follow-up — Weather recovery + Admin presentation polish

Production now has the Weather migration applied and the Reporting table active. Initial page use occurred before `METEOSTAT_RAPIDAPI_KEY` was configured, creating 30 persisted `UNAVAILABLE / observationHours=0` rows for 2026-09-04 through 2026-10-03. After the server-side key was configured, a 90-day request proved the provider path healthy by materializing 60 `HISTORICAL` days through 2026-09-03. The 30 pre-configuration rows were then explicitly removed under production authorization; the next 30-day request repopulated them as **29 HISTORICAL + 1 PROVISIONAL (Store-local Today)**, confirming Meteostat recovery.

Merged production polish PR #2674 / squash `f91b4bce` prevents recurrence by marking missing provider configuration non-cacheable while preserving bounded negative caching for actual attempted provider failures. It also moves Evidence Coverage directly below the Sales Analytics header, assigns distinct colors to current Sales / previous Sales / temperature / holiday chart series, formats chart-tooltip temperature to one decimal, shows Calendar weekday names on non-holiday days (retaining long-weekend context after the weekday when present), and assigns distinct Income / Expenses / Net Profit colors to the Management P&L trend. This is a Reporting policy + Web presentation follow-up only: no Prisma/schema/migration, package, Accounting arithmetic, owner authority, context direction, scanner allowance, SCC or architecture-baseline change.

Production verification after PR #2674 also confirmed the Admin Management P&L runtime against its Accounting owner contracts: whole-business / whole-ledger P&L and Cash Movement requests returned 200 without Store scope, date-range changes were exercised, PDF and CSV exports were manually verified as usable, and side-by-side Admin versus Accounting screenshots matched Income $45,428.39, Expenses $30,939.47, Net adjustment effect -$2,920.70 and Net profit $11,568.22 for 2026-01-01 through 2026-10-03 grouped by month. Management P&L is therefore **PRODUCTION VERIFIED**.

DATA-E is now **PRODUCTION VERIFIED / CLOSED**. The operator verified that Admin Sales and Accounting Sales match for 2026-09-27 through 2026-10-03 on Net Sales Revenue, Channel Contribution and Discounts. Production request logs independently show the Store-scoped Admin Sales request and the corresponding Accounting Sales request returning 200 for that exact range, alongside exercised Store-local single-day and 30-day paths; prior 90-day use was already exercised during Weather recovery. Store-switch verification is not applicable yet because production has exactly one active Store.

Calendar verification is accepted on deterministic evidence rather than an external-provider dependency: the deployed 30-day Calendar request for 2026-09-04 through 2026-10-03 returned 200 for Store `4750_Yonge_Street`, whose production jurisdiction is `CA/ON`; the deployed ruleset pins Labour Day to 2026-09-07 and its Friday/Monday long weekend to 2026-09-05 through 2026-09-07, and the Web rendering path labels supported holiday/long-weekend rows without consulting mutable Store closure state. Access compatibility also remains unchanged: Admin is still ADMIN-only, Accounting remains ADMIN/ACCOUNTANT, and production currently has no ACCOUNTANT user to perform a separate live wrong-surface login check, so that runtime sub-check is N/A while source/CI guard coverage remains authoritative. Production remains clean on `main@f91b4bce` with healthy db/api/web/worker containers and the Weather migration applied; one isolated DataRetention cleanup transaction timeout was observed after startup, with no migration/schema error or restart loop and no relationship to the Admin Data reporting paths.

#### 2026-10-03 follow-up — Sales commercial-item mix semantics

The Sales Analytics `销售商品结构 / Commercial item mix` follow-up is isolated from DATA-F because it changes Reporting/Catalog explanatory item metadata plus the Admin Sales presentation, while DATA-F is an Accounting presentation contraction.

Readiness found two distinct causes in the existing implementation: the Web table hard-capped `report.commercialItems.slice(0, 8)`, while Business Operations intentionally unions current and same-weekday-baseline item keys, so baseline-only rows can have current `quantity = 0`. The Sales table now selects every row with current `quantity > 0` and removes the fixed row cap while preserving the existing backend sort by current quantity descending.

The generic Catalog classification is used for drink exclusion. `MenuItem.itemKind = FOOD | BEVERAGE` is canonical Catalog product metadata; Uber `UberItemChannelConfig.preparationType = PREPARED | PREPACKAGED` remains provider/channel-specific and is deliberately not used as generic Sales Analytics authority. A bounded production read-only check on Store `4750_Yonge_Street` found exactly 2 current `BEVERAGE` items and exactly 2 `PREPACKAGED` Uber items, with zero mismatches in either direction, confirming the current operational set maps exactly while preserving the correct owner. Catalog exposes a narrow Store-scoped current-item classification reader, Reporting adapts it through a Reporting-owned port at `ReportsModule`, and additive `commercialItems.currentCatalogItemKind` is explicitly current Catalog configuration. Sales Analytics excludes known `BEVERAGE` rows; unknown/deleted historical item classifications remain visible rather than being silently discarded. Business Overview keeps consuming the full `commercialItems` projection unchanged.

This reuses the already-authorized `accounting-reporting-analytics -> catalog-pricing-offers` conceptual read direction established by MKT-B. Owner imports remain confined to the Reporting composition root; no new graph direction, scanner allowance/baseline, Prisma/schema/migration, package dependency, Accounting authority or Order historical snapshot is introduced.

The follow-up merged through PR #2676 / final head `51e8fb29` / CI #6849 green / squash `90308226`. After production deployment, the operator confirmed the Sales item-mix UI is normal with the new all-nonzero-food presentation and beverage exclusion. The deployed Reporting/Admin paths remained healthy with no new API/Web error evidence.

### DATA-F — Accounting UI contraction

State: **MERGED / PR #2677 / CI #6851 GREEN / SQUASH `86057bbf` / DEPLOYED / PRODUCTION VERIFIED / CLOSED / NO MIGRATION / NO DEPENDENCY / NO BACKEND CONTRACT OR GRAPH CHANGE**.

After DATA-E production verification closed the replacement-surface gate, DATA-F applies the approved presentation contraction only:

- Accounting `/sales` is renamed/reframed as **Sales Accounting**. It continues to read the unchanged canonical `/accounting/report/sales` owner contract and keeps accounting/reconciliation-oriented content: Gross Sales, Discounts, Net Sales Revenue, Output Tax, channel costs, channel/payment attribution, Tender mix, Provider financial coverage, source/adjustment visibility and detailed revenue/fee components;
- duplicated management-analysis presentation is removed from Accounting Sales: no equal-period comparison request/state, no Daily Sales trend chart, no Share percentage and no Channel Contribution presentation. Those management comparisons/trends remain in Admin Sales Analytics;
- the obsolete Accounting-only equal-period helper and its B4-D2 compatibility tests are retired because that behavior no longer has a runtime consumer; DATA-F adds a focused contraction regression instead;
- Accounting `/reports` becomes statement-only: **Trial Balance** is the default view, **Balance Movement** remains available, statement date presets/custom range, Journal drill-through and statement PDF/CSV exports remain intact;
- Management P&L/Cash Movement UI and Management export links are removed from Accounting Reports, but their Accounting-owned backend/read/export contracts remain unchanged because Admin Management P&L continues to consume them;
- the shared Management and Sales browser DTO contracts remain compatible. No Accounting arithmetic, Journal/posting authority, API authorization, role/surface matrix, Prisma/schema/migration, package/lockfile, scanner allowance, SCC or architecture baseline is changed. ACCOUNTANT therefore keeps the Accounting-only Sales Accounting and canonical statement surfaces; the Admin management-analysis replacements remain ADMIN-only under the existing frozen role matrix.

Final production verification on 2026-10-04 was completed after deployment containing both #2676 and #2677. The production checkout was clean on `main@0a184247`, which contains `90308226` and `86057bbf` as ancestors, while the active API/Web/worker release used the validated GHCR image SHA `e411863a7e4c262a6ae125e39bd781dda63527d9`. All four Compose services were healthy. The operator confirmed the relevant Admin Sales Analytics, Admin Management P&L, Sales Accounting and Accounting statement UIs were normal. Runtime logs independently showed Store-scoped canonical Sales requests returning 200, Accounting Sales Accounting requests returning 200, whole-ledger P&L/Cash Movement requests returning 200, and Trial Balance returning 200; no new API or Web errors appeared in the post-deploy verification window. Balance Movement remained mounted and the operator's UI check was successful.

The migration is therefore **PRODUCTION VERIFIED / CLOSED**. Admin is the primary management-analysis surface for Sales Analytics and Management P&L; Accounting remains the financial owner and now exposes the intentionally narrower Sales Accounting plus canonical statement surfaces. No DATA-G is planned under this work package. Any future enhancement should start from a new product requirement rather than reopening this migration.

## Architecture impact

DATA-A introduces no new 12-context dependency direction, scanner allowance, SCC,
dependency package or persistence model. It reuses the existing Accounting -> Brand/Store
public configuration seam and changes only an optional HTTP query plus Web/Admin navigation
composition metadata.

DATA-B1 also introduces no new 12-context direction: Reporting reuses the already-authorized
Brand/Store public config seam and owns its own read-model persistence/provider adapters.
It adds one Reporting-owned table and one additive authenticated Reporting HTTP read contract,
but no package dependency, scanner allowance, SCC or architecture-baseline change.

DATA-B2, DATA-C and DATA-D introduce no new backend context direction. DATA-B2 stays inside
Reporting over the existing Brand/Store jurisdiction seam. DATA-C is a Web/Admin adapter
composition of existing authenticated owner APIs plus a shared browser DTO contract. DATA-D
is likewise a Web/Admin adapter over existing Accounting P&L/Cash Movement owner contracts,
with shared browser DTO/date utilities only. None adds a Prisma model, migration, package
dependency, scanner allowance, SCC or architecture-baseline change.

B2 Canonical Sales Analytics and B5 Admin Business Reports remain closed; this work is a
post-modularization product/UI ownership refinement and does not reopen their financial or
operational authority.

## 2026-10-04 follow-up — Operating / availability history

A new product requirement now addresses the explicit `CURRENT_CONFIGURATION_ONLY` Store-history limitation
without reopening DATA-A-F. The focused audit at `origin/dev@24545aba` is recorded in
`docs/architecture/operating-availability-history.md`.

The approved Sales Analytics presentation change is narrow: the existing **逐日解释上下文 / Daily explanatory
context** table gains **营业时间 / Operating time** and **菜品下架 / unavailable items**. A non-zero item count
expands inline to item name plus cumulative unavailable duration inside actual operating intervals. No standalone
Operational History card/page is added.

The required authority is forward-only and owner-backed: Brand/Store versions schedule/timezone and temporary
customer-ordering closure intervals; Catalog records MenuItem unavailable intervals. Reporting later composes
those owner facts through existing public/composition seams and extends `GET /reports/business`. Historical
facts before capture start remain unknown and are never reconstructed or treated as zero. Accounting money,
Weather and Calendar authority are unchanged.
