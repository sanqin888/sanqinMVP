# Admin Marketing Overview — Readiness Audit and Delivery Plan

Date: 2026-09-30  
Original baseline: `origin/dev@2d250360` after MKT-D merge  
MKT-E implementation baseline: `origin/dev@52dfced9`  
State: **MKT-A/B/C/D MERGED + CI GREEN / MKT-E PR #2643 / FIRST CI #6732 FAILED ON STALE TEST EXPECTATION / FIX INCLUDED / FINAL CI PENDING / NO MIGRATION / NO DEPENDENCY / PRODUCTION UI VERIFICATION NOT YET CLAIMED**

## 1. Product goal

Replace the current `/admin/promotions` navigation-only landing page with a useful
Marketing Overview. The overview should list campaigns that are operationally relevant
and summarize four store-local trailing time windows:

- Today;
- trailing 7 local calendar days, including Today;
- trailing 30 local calendar days, including Today;
- trailing 90 local calendar days, including Today.

The required first metric is campaign usage count. The data model must also support,
from the first backend slice:

- affected/discount-associated item quantity;
- actual discount amount;
- associated sales.

The additional metrics may remain hidden in the first UI cutover until their production
numbers have been reconciled.

## 2. Audit findings

### 2.1 Existing page is redundant

`/admin/promotions` currently links to Daily Specials, Coupons/Bundles and
Automatic/Loyalty promotions and still contains migration-era unified-engine wording.
Those destinations already exist in Admin secondary navigation, so the root page has no
independent operational value.

### 2.2 Authoritative activity definitions already exist

Ownership remains unchanged:

- Daily Special lifecycle/storage: Catalog/Pricing/Offers;
- PromotionRule lifecycle/storage: Catalog/Pricing/Offers;
- CouponTemplate/CouponProgram lifecycle/storage: Catalog/Pricing/Offers;
- paid Order and immutable/legacy sale evidence: Orders;
- Store timezone/current Store identity: Brand/Store;
- aggregate monitoring projection: Reporting;
- rendering/navigation: Web/PWA.

Daily Specials are Store scoped through MenuItem -> MenuCategory.storeStableId.
PromotionRule and CouponProgram are currently brand scoped.

### 2.3 Usage evidence already exists

Paid Orders persist Promotion Engine V1 adjustments with stable activity identity and
source. For current snapshots this provides:

- `promotionStableId`;
- source;
- actual `discountCents`;
- Daily Special quantity/base/effective price evidence;
- order-discount `targetLineKeys` and `applicableSubtotalCents`;
- Loyalty multiplier evidence.

Daily Special history predating Promotion Snapshot still retains
`OrderItem.isDailySpecialApplied + dailySpecialStableId + qty`, so use count and item
quantity can remain available for that history even when exact historical discount
evidence is unavailable.

CouponProgram.usedCount is **not authoritative**. Production inspection found real
program-issued Coupon redemption in `Coupon.usedAt + campaign` while persisted
`CouponProgram.usedCount` remained zero. Marketing must therefore attribute a used
Coupon instance back to its CouponProgram using stable business identities and must not
read `usedCount` as performance truth.

### 2.4 Current-quarter production evidence

Read-only production inspection on 2026-09-30 found:

- Automatic Promotion: 5 activity Orders, 5 affected-item units, $29.95 actual
  discount, $104.58 associated merchandise sales;
- Coupon: 3 activity Orders, 4 affected-item units, $11.00 actual discount,
  $35.65 associated merchandise sales;
- Daily Special: 170 activity Orders, 207 Daily-Special item units and $2,350.24
  associated merchandise sales.

Current-quarter Coupon usage is fully covered by matching Promotion Snapshot evidence.
Daily Special current-quarter history contains both snapshot-era and pre-snapshot rows:
usage count, item quantity and associated sales are available across the whole quarter,
but exact discount amount is only complete where immutable pricing evidence exists.

The Marketing read model must therefore carry per-metric evidence/coverage rather than
turning unknown history into zero.

## 3. Metric semantics

### 3.1 Usage count

One use is one distinct `(activity, Order)` pair.

Multiple adjustments for the same activity in one Order do not create multiple uses.

### 3.2 Affected item quantity

This means item units on lines associated with the accepted activity benefit.

- Daily Special: persisted Daily-Special OrderItem quantity;
- PromotionRule / Coupon order discount: quantity on accepted `targetLineKeys`;
- Loyalty multiplier: not applicable.

This is not a claim about causal incremental units and is not necessarily equal to the
number of free reward units in a BOGO rule.

### 3.3 Actual discount amount

Use the accepted sale-time adjustment amount, never the campaign's configured/theoretical
discount.

Historical Daily Special rows without sufficient original-price evidence remain
`UNAVAILABLE`; a Marketing-specific historical reconstruction must be separately
reviewed before it can change that coverage.

The Accounting-only approved historical Daily Special override is not reused as a
generic Marketing truth source.

### 3.4 Associated sales

Internal/API name: `associatedSalesCents`.

Definition: merchandise subtotal after order promotions/coupons/points, before tax,
customer delivery fee and card surcharge, for an Order that used the activity.

This is an association metric, not causal/incremental revenue. One Order may be
associated with multiple campaigns, so values across campaigns must not be added to
derive total business sales.

MKT-A reuses the Orders financial sale fact boundary for this amount and retains
`IMMUTABLE_SALE_SNAPSHOT | LEGACY_CURRENT_ORDER` evidence.

Refund-adjusted/net associated sales are explicitly out of scope for V1.

## 4. Time semantics

Reporting owns the displayed trailing windows using the selected Store timezone:

- Today: local 00:00 -> now;
- 7d: Today plus the prior six local calendar days;
- 30d: Today plus the prior 29 local calendar days;
- 90d: Today plus the prior 89 local calendar days.

The V1 HTTP payload now exposes only these four trailing windows. The previous calendar
`month` / `quarter` fields are removed as an explicitly authorized Admin contract cutover;
already-open Admin/PWA bundles may require a page refresh after deployment. The owner read
must start at the earliest boundary required by the returned windows rather than assuming a
calendar boundary is always the longest range.

Order activity time is the Orders sale occurrence time (`paidAt` / financial fact
`occurredAt`), not browser time and not Order creation time.

## 5. Approved architecture

The user approved this implementation direction on 2026-09-30.

### MKT-A — owner facts foundation

Catalog/Pricing/Offers exports a narrow campaign facts boundary:

- stable campaign identity and lifecycle/schedule metadata;
- Store-vs-brand scope;
- stable Coupon-instance -> CouponProgram attribution.

Daily Special Store/title enrichment must not read Catalog Prisma delegates from Offers.
MKT-A therefore uses a narrow Catalog-owned marketing-subject reader inside the same
catalog-pricing-offers context; Offers continues to read only Daily Special persistence
directly and composes itemStableId with the Catalog subject fact.

Orders exports a narrow marketing usage facts boundary:

- one normalized fact per accepted `(activity, Order)`;
- affected item quantity + evidence;
- actual discount + evidence;
- associated sales + sale-source evidence;
- no raw `promotionSnapshot` crosses the boundary.

MKT-A introduced no Reporting consumer and therefore no new context direction. It
merged through PR #2624 / CI #6675 / `77f4515e`. CI exposed and the final source
preserved two important architecture invariants: Offers does not read Catalog Prisma
delegates directly, and the Catalog marketing-subject seam reuses the existing
CatalogAdmin persistence owner rather than adding new Runtime debt.

### MKT-B — Reporting Marketing Overview projection

MKT-B merged through PR #2625 / CI #6678 / `5edbb9d2`. Reporting composes:

- Orders marketing usage facts;
- Offers campaign facts;
- existing Reporting Store operating-context/timezone seam.

This slice is authorized to add the narrow conceptual
`accounting-reporting-analytics -> catalog-pricing-offers` read direction through
public contracts/composition-root wiring only. It must not import Offers internals or
Prisma. Architecture scanner/SCC impact must be reviewed at implementation time.

The projection queries one owner-usage range beginning at the earliest required returned
window and derives Today / 7d / 30d / 90d in memory. The prior Month / Quarter response
fields are removed by the authorized contract cutover. It exposes `GET /reports/marketing?storeStableId=`
and returns only campaigns whose lifecycle is ACTIVE and whose overall validity window
contains the current Store-local instant. Recurring weekday/minute schedules remain
metadata rather than causing an otherwise ongoing campaign to disappear between its
scheduled selling periods.

Coupon usage is normalized from Coupon instance stable IDs to CouponProgram stable IDs
before aggregation. Multiple owner facts that map to the same campaign + Order still
produce one use and one associated-sales amount. The response carries per-metric
`COMPLETE / PARTIAL / UNAVAILABLE / NOT_APPLICABLE` coverage plus an explicit
90-day count of unattributed Coupon uses.

MKT-B activates the already authorized conceptual
`accounting-reporting-analytics -> catalog-pricing-offers` read direction. Owner APIs
appear only in the registered `ReportsModule` composition root; the report service
depends only on Reporting-owned ports. The scanner direct-import baseline remains
unchanged because that composition root is already registered/excluded, and no SCC
allowance is added.

### MKT-C — Admin base cutover

MKT-C merged through PR #2626 / CI #6680 / `f06843b0`. `/admin/promotions` is cut over
from the redundant navigation/migration-era landing page to a Store-scoped Marketing
Overview client that consumes the MKT-B Reporting endpoint. Existing secondary navigation remains
the lifecycle-management surface for Item Specials, Coupons & Bundles and Automatic /
Loyalty campaigns.

The first UI deliberately emphasizes usage count only. It shows current campaigns and
Today / trailing 7 / trailing 30 / trailing 90 local-day use counts, preserves
selected Store context on management links, exposes loading/error/empty/unattributed-
Coupon states, and does not yet render affected-item quantity, actual discount or
associated sales. Those remain MKT-D presentation work after production reconciliation.

### MKT-D — performance metric presentation

MKT-D merged through PR #2627 / CI #6682 / `2d250360`. A fresh read-only production
reconciliation on 2026-09-30 re-confirmed the current-quarter source evidence before UI
exposure:

- Automatic Promotion: 5 uses / 5 affected units / $29.95 actual discount / $104.58
  associated sales;
- Coupon: 3 uses / 4 affected units / $11.00 actual discount / $35.65 associated sales;
- Daily Special: 170 uses / 207 affected units / $2,350.24 associated sales;
- Daily Special discount evidence covers only 1/170 uses and $1.50, so that amount is a
  covered subtotal, not a campaign-quarter discount total;
- Daily Special associated-sales evidence contains 40 immutable facts and 130 legacy
  current-order facts.

The UI therefore exposes affected item quantity, actual discount and associated sales
without changing the MKT-B contract. `COMPLETE / PARTIAL / UNAVAILABLE / NOT_APPLICABLE`
remain first-class display semantics: PARTIAL values explicitly state covered uses and
that the value is only a covered subtotal; UNAVAILABLE/NOT_APPLICABLE render as an em dash
with evidence text rather than zero. Associated sales carry immutable-vs-legacy evidence
and remain explicitly non-additive across campaigns.

## 6. MKT-A implementation contract

MKT-A is intentionally additive:

- no Prisma schema or migration;
- no package/dependency change;
- no HTTP route;
- no Admin/Web cutover;
- no Accounting Journal/report change;
- no provider/payment change;
- no new cross-context direction.

New owner boundaries:

- `MARKETING_CAMPAIGN_FACTS_READER` under Promotions public API;
- `ORDER_MARKETING_USAGE_FACTS_READER` under Orders public API.

The Orders boundary consumes the existing Orders-owned
`ORDER_FINANCIAL_FACTS_READER` internally so Marketing-associated merchandise sales do
not create a competing financial arithmetic definition.

## 7. MKT-B implementation contract

MKT-B remains additive and backend-only:

- Reporting owns `REPORTING_MARKETING_CAMPAIGNS_QUERY` and
  `REPORTING_MARKETING_USAGE_QUERY`; the projection service imports only those
  Reporting contracts plus the existing Store operating-context port;
- `ReportsModule` is the only composition point that knows the MKT-A Orders/Offers
  public capabilities;
- `MarketingCampaignFactsModule` is a narrow public module that re-exports the existing
  PromotionsCore campaign-facts provider without moving persistence ownership;
- `GET /reports/marketing?storeStableId=` is additive; existing Business Reports and
  legacy report contracts are unchanged;
- one owner read begins at the earliest returned window boundary, preventing trailing
  windows from being truncated at a month/quarter rollover;
- Daily Special / PromotionRule validity dates retain the existing Store-local business
  calendar-date semantics, while CouponProgram validity retains its existing instant
  semantics;
- only overall ACTIVE/current-validity campaigns are returned; recurring weekday/minute
  schedules do not make a campaign disappear between selling periods;
- no Prisma/schema/migration, package/lockfile, Accounting revenue/Journal,
  refund-netting, payment or provider behavior changes in this slice.

## 8. MKT-C implementation contract

MKT-C is Web-only and keeps the backend/ownership model fixed:

- `/admin/promotions` delegates to a client Marketing Overview instead of duplicating the
  three existing management links;
- selected Store remains explicit through the AdminShell `?store=` context and the client
  passes only `storeStableId` to `/reports/marketing`;
- the overview renders use counts for the four MKT-B windows and keeps the Reporting
  caveat that one Order may be associated with more than one campaign;
- campaign lifecycle editing remains on the existing `/specials`, `/coupons` and
  `/automatic` pages, with Store context preserved on every management link;
- MKT-C initially kept MKT-D performance metrics hidden even though the backend payload
  already carried them; MKT-D exposes them only after the production reconciliation above;
- no new package, API, Prisma/schema/migration, context direction, scanner baseline,
  Accounting, payment, print or provider behavior is introduced.

## 9. MKT-E — trailing-window correction and Daily Special stable display identity

State: **LOCAL IMPLEMENTED / USER REVIEW PENDING / CI NOT RUN**.

Production read-only reconciliation on 2026-10-01 showed that historical Daily Special
usage already exists back to 2026-02-18 and that all 361 observed Daily-Special OrderItem
rows retain `dailySpecialStableId`. The apparent deployment-only coverage was instead a
Reporting range defect: MKT-B always started the owner read at the current-quarter boundary.
On 2026-10-01, the first day of Q4, that truncated the nominal trailing-7-day window to
Today, causing Today / 7d / Month / Quarter to present the same current-day facts.

MKT-E corrects that behavior without changing fact ownership:

- the current Admin presentation is Today / trailing 7 / trailing 30 / trailing 90 local
  calendar days;
- Reporting computes the earliest boundary across every returned V1 window before reading
  owner usage facts, so rollover boundaries cannot truncate a trailing window;
- `last30Days` and `last90Days` replace the previous `month` and `quarter` response fields;
  the old fields and their quarter-specific coverage field are deleted as an explicitly
  authorized Admin HTTP contract contraction. An already-open stale Admin/PWA page may need
  a refresh after deployment;
- unattributed Coupon coverage is exposed only for the displayed trailing 90-day window;
- a Daily Special row is presented by its stable weekday slot (for example, `周四特价` /
  `Thursday Daily Special`) rather than using the currently selected dish as the activity
  title. The current dish remains visible as secondary configuration text;
- the underlying activity identity remains `MenuDailySpecial.stableId`. The existing Admin
  specials editor preserves that stable ID when the selected item on an existing special is
  changed, so historical usage stays attached to the same activity while the current dish
  may change. Deleting and recreating a special intentionally creates a new activity
  identity.

This slice changes no Prisma schema, migration, dependency, owner boundary, Accounting
Journal logic, payment/provider flow, or architecture scanner allowance. Focused API
coverage adds an October 1 quarter-rollover regression case, and Web source-contract
coverage locks the 30/90-day labels plus weekday-slot Daily Special presentation.
