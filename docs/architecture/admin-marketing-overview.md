# Admin Marketing Overview — Readiness Audit and Delivery Plan

Date: 2026-09-30  
Baseline: `origin/dev@3ffe7228` after Catalog Store Menu production closeout  
State: **MKT-A LOCAL / REVIEW PENDING / NO MIGRATION / NO DEPENDENCY / NO GRAPH CHANGE IN MKT-A**

## 1. Product goal

Replace the current `/admin/promotions` navigation-only landing page with a useful
Marketing Overview. The overview should list campaigns that are operationally relevant
and summarize four store-local time windows:

- Today;
- trailing 7 local calendar days, including Today;
- current calendar month;
- current calendar quarter.

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

Reporting will own the four windows using the selected Store timezone:

- Today: local 00:00 -> now;
- 7d: Today plus the prior six local calendar days;
- Month: local first day of current month -> now;
- Quarter: local first day of current quarter -> now.

Order activity time is the Orders sale occurrence time (`paidAt` / financial fact
`occurredAt`), not browser time and not Order creation time.

## 5. Approved architecture

The user approved this implementation direction on 2026-09-30.

### MKT-A — owner facts foundation

Catalog/Pricing/Offers exports a narrow campaign facts boundary:

- stable campaign identity and lifecycle/schedule metadata;
- Store-vs-brand scope;
- stable Coupon-instance -> CouponProgram attribution.

Orders exports a narrow marketing usage facts boundary:

- one normalized fact per accepted `(activity, Order)`;
- affected item quantity + evidence;
- actual discount + evidence;
- associated sales + sale-source evidence;
- no raw `promotionSnapshot` crosses the boundary.

MKT-A introduces no Reporting consumer and therefore no new context direction.

### MKT-B — Reporting Marketing Overview projection

Reporting will compose:

- Orders marketing usage facts;
- Offers campaign facts;
- existing Reporting Store operating-context/timezone seam.

This slice is authorized to add the narrow conceptual
`accounting-reporting-analytics -> catalog-pricing-offers` read direction through
public contracts/composition-root wiring only. It must not import Offers internals or
Prisma. Architecture scanner/SCC impact must be reviewed at implementation time.

The projection will query at most the current quarter once and derive Today / 7d /
Month / Quarter in memory.

### MKT-C — Admin base cutover

Replace the navigation-only root page with the activity monitoring view. Initial UI may
emphasize usage count while the full metric payload remains available for reconciliation.

### MKT-D — performance metric presentation

Expose affected item quantity, actual discount and associated sales after production
reconciliation. UI must show `COMPLETE / PARTIAL / UNAVAILABLE / NOT_APPLICABLE`
semantics instead of rendering unknown values as zero.

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
