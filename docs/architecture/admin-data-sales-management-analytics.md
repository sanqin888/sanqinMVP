# Admin Data — Sales Analytics / Management P&L migration

Date: 2026-10-03  
Baseline: latest `origin/dev@a2fbda75` after DATA-D merge and main-history reconciliation  
Current state: **DATA-A MERGED / CI #6817 GREEN; DATA-B1 SOURCE + MIGRATION ALIGNED ON DEV / PRODUCTION APPLY PENDING; DATA-B2 MERGED / PR #2669 / FINAL HEAD `3484dfe1` / CI #6826 GREEN / SQUASH `56f35b0c`; DATA-C MERGED / PR #2670 / FINAL HEAD `ebe02b93` / CI #6829 GREEN / SQUASH `d748327f`; DATA-D MERGED / PR #2671 / FINAL HEAD `8b9d23b0` / CI #6832 GREEN / SQUASH `b5acbf09`; DATA-E READINESS AUDIT COMPLETE / PROMOTION PR #2672 CI #6836 GREEN / MAIN MERGE + PRODUCTION DEPLOYMENT + WEATHER MIGRATION APPLY PENDING**

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

State: **SOURCE MERGED / PR #2668 / SOURCE HEAD `6ef4d330` / SQUASH `37ac9c56` / CI #6822 GREEN / MIGRATION `7934d875` REVIEWED ADDITIVE / DEV HISTORY ALIGNED / PRODUCTION APPLY PENDING / NO NEW DEPENDENCY / NO GRAPH OR BASELINE CHANGE**.

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

The user-generated migration `20261003185132_add_reporting_weather_daily_facts` is now committed to `dev` as `7934d875` and has been reviewed as the expected additive-only CREATE TABLE + primary key + two indexes. It contains no DROP, ALTER, rename, backfill or existing-table mutation. The source/schema/history invariant is therefore restored on `dev`; production promotion/application remains gated on the normal deployment flow.

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
- existing Accounting Sales presentation is intentionally retained until DATA-E production verification and later DATA-F presentation contraction.

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
- current Accounting Reports Management P&L, Trial Balance and Balance Movement remain present. Their removal/reframing stays deferred to DATA-F after DATA-E production verification.

Focused source-characterization regressions pin owner endpoints only, no Store query/scope, non-Store-scoped navigation, shared-contract compatibility, absence of Admin financial arithmetic/persistence coupling, scope/disclaimer text, export reuse and retention of the current Accounting views. Final head `8b9d23b0` passed CI #6832 across API/Web validation, Browser E2E, printer-agent and Windows workstation; an older Phase 9 source-characterization assertion was updated to follow the approved shared Management contract extraction rather than requiring those DTO fields to remain physically declared in the Accounting route subtree.

### DATA-E — Production verification

State: **READINESS AUDIT COMPLETE / PROMOTION PR #2672 CI #6836 GREEN / MAIN MERGE + PRODUCTION DEPLOYMENT PENDING / DATA-B1 PRODUCTION MIGRATION APPLY PENDING / NO PRODUCTION MUTATION PERFORMED**. Local readiness branch `chore/admin-data-production-verification` was created from DATA-D squash `b5acbf09`; latest `origin/dev@a2fbda75` has no file-tree difference from `b5acbf09` and only reconciles current `main` history.

Read-only production readiness evidence on 2026-10-03:

- production repository is clean on local checkout `main@db239d70`; the GitHub `main` ref is `ca632b0c`, but `db239d70 -> ca632b0c` has zero changed files and is history-only reconciliation, so the deployed production tree is content-equivalent to current GitHub main before Admin Data promotion;
- latest `origin/dev` is `a2fbda75`. The compare `b5acbf09 -> a2fbda75` also has zero changed files; `a2fbda75` is the merge-history reconciliation of current main into dev after DATA-D;
- open promotion PR #2672 is `dev@a2fbda75 -> main@ca632b0c`, is mergeable, and CI #6836 is green. Its actual file delta is exactly DATA-A, DATA-B1 source + reviewed Weather migration, DATA-B2, DATA-C and DATA-D; no unrelated post-main application change is bundled;
- current production Compose services `db / api / ubereats-worker / web` are all healthy;
- production `_prisma_migrations` has no applied row for `20261003185132_add_reporting_weather_daily_facts`, and `ReportingWeatherDailyFact` does not yet exist;
- the committed Weather migration was re-read and remains additive-only: one table, one composite primary key and two indexes, with no DROP, ALTER, rename or backfill;
- Store `4750_Yonge_Street` has the required Reporting location/jurisdiction metadata: `America/Toronto`, `43.760288/-79.412167`, `CA / ON`;
- DATA-D source is merged through PR #2671 / final head `8b9d23b0` / CI #6832 green / squash `b5acbf09`.

These facts make DATA-E **ready for controlled promotion**, but they are not production verification. Production promotion/deployment and the production Prisma migration application remain separate operational gates. In particular, repository rules require explicit production authorization before `prisma migrate deploy` or any equivalent database mutation.

Required rollout order:

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

DATA-F remains blocked until this matrix is completed against the deployed production version. No Accounting presentation is removed merely because DATA-D is merged.

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

DATA-B2, DATA-C and DATA-D introduce no new backend context direction. DATA-B2 stays inside
Reporting over the existing Brand/Store jurisdiction seam. DATA-C is a Web/Admin adapter
composition of existing authenticated owner APIs plus a shared browser DTO contract. DATA-D
is likewise a Web/Admin adapter over existing Accounting P&L/Cash Movement owner contracts,
with shared browser DTO/date utilities only. None adds a Prisma model, migration, package
dependency, scanner allowance, SCC or architecture-baseline change.

B2 Canonical Sales Analytics and B5 Admin Business Reports remain closed; this work is a
post-modularization product/UI ownership refinement and does not reopen their financial or
operational authority.
