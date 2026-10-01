import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');
const clientSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../../features/admin/marketing/MarketingOverviewPageClient.tsx',
  ),
  'utf8',
);

describe('Admin Marketing Overview cutover and performance display', () => {
  it('replaces the old navigation landing page with the Marketing Overview client', () => {
    expect(pageSource).toContain('MarketingOverviewPageClient');
    expect(pageSource).not.toContain('Promotion Engine');
    expect(pageSource).not.toContain('Manage item specials while preserving');
  });

  it('loads the Reporting-owned Marketing endpoint with explicit Store context', () => {
    expect(clientSource).toContain("searchParams.get('store')");
    expect(clientSource).toContain('/reports/marketing?');
    expect(clientSource).toContain('new URLSearchParams({ storeStableId })');
    expect(clientSource).toContain('Select a store first');
  });

  it('keeps lifecycle management on the existing Marketing subpages and preserves Store context', () => {
    expect(clientSource).toContain("kind === 'DAILY_SPECIAL'");
    expect(clientSource).toContain("kind === 'COUPON_PROGRAM'");
    expect(clientSource).toContain('${base}/specials');
    expect(clientSource).toContain('${base}/coupons');
    expect(clientSource).toContain('${base}/automatic');
    expect(clientSource).toContain('?store=${encodeURIComponent(storeStableId)}');
  });

  it('renders trailing Today/7d/30d/90d windows and performance metrics without collapsing evidence gaps into zero', () => {
    expect(clientSource).toContain("'last30Days'");
    expect(clientSource).toContain("'last90Days'");
    expect(clientSource).toContain("'近 30 天'");
    expect(clientSource).toContain("'近 90 天'");
    expect(clientSource).not.toContain("'本月'");
    expect(clientSource).not.toContain("'本季度'");
    expect(clientSource).toContain('affectedItemQuantity');
    expect(clientSource).toContain('discountCents');
    expect(clientSource).toContain('associatedSalesCents');
    expect(clientSource).toContain("metric.coverage === 'PARTIAL'");
    expect(clientSource).toContain('coveredUses');
    expect(clientSource).toContain('totalUses');
    expect(clientSource).toContain('Covered subtotal, not full total');
    expect(clientSource).toContain('UNAVAILABLE is never treated as zero');
  });

  it('labels Daily Specials by stable weekday slot while showing the current configured item separately', () => {
    expect(clientSource).toContain("activity.kind === 'DAILY_SPECIAL'");
    expect(clientSource).toContain('dailySpecialWeekdayLabel');
    expect(clientSource).toContain('Current item:');
    expect(clientSource).toContain('当前菜品：');
  });

  it('keeps associated sales explicitly non-additive and surfaces legacy evidence', () => {
    expect(clientSource).toContain(
      'must not be summed across campaigns as business sales',
    );
    expect(clientSource).toContain('INCLUDES_LEGACY_CURRENT_ORDER');
    expect(clientSource).toContain('Includes legacy current-order evidence');
  });
});
