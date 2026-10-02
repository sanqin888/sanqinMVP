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
const campaignTableSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../../features/admin/marketing/MarketingOverviewCampaignTable.tsx',
  ),
  'utf8',
);
const overviewSource = `${clientSource}\n${campaignTableSource}`;

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
    expect(overviewSource).toContain("kind === 'DAILY_SPECIAL'");
    expect(overviewSource).toContain("kind === 'COUPON_PROGRAM'");
    expect(overviewSource).toContain('${base}/specials');
    expect(overviewSource).toContain('${base}/coupons');
    expect(overviewSource).toContain('${base}/automatic');
    expect(overviewSource).toContain('?store=${encodeURIComponent(storeStableId)}');
  });

  it('renders trailing Today/7d/30d/90d windows and performance metrics without collapsing evidence gaps into zero', () => {
    expect(overviewSource).toContain("'last30Days'");
    expect(overviewSource).toContain("'last90Days'");
    expect(overviewSource).toContain("'近 30 天'");
    expect(overviewSource).toContain("'近 90 天'");
    expect(overviewSource).not.toContain("'本月'");
    expect(overviewSource).not.toContain("'本季度'");
    expect(overviewSource).toContain('affectedItemQuantity');
    expect(overviewSource).toContain('discountCents');
    expect(overviewSource).toContain('associatedSalesCents');
    expect(overviewSource).toContain("metric.coverage === 'PARTIAL'");
    expect(overviewSource).toContain('coveredUses');
    expect(overviewSource).toContain('totalUses');
    expect(overviewSource).toContain('Covered subtotal, not full total');
    expect(clientSource).toContain('UNAVAILABLE is never treated as zero');
  });

  it('groups Daily Special into one top-level campaign with expandable weekday detail rows', () => {
    expect(campaignTableSource).toContain("activity.kind === 'DAILY_SPECIAL'");
    expect(campaignTableSource).toContain('aggregateDailySpecialWindow');
    expect(campaignTableSource).toContain('dailySpecialExpanded');
    expect(campaignTableSource).toContain('View daily details');
    expect(campaignTableSource).toContain('查看每日明细');
    expect(campaignTableSource).toContain('dailySpecialWeekdayLabel');
    expect(campaignTableSource).toContain('Current item:');
    expect(campaignTableSource).toContain('当前菜品：');
    expect(clientSource).toContain('topLevelCampaignCount');
  });

  it('keeps associated sales explicitly non-additive and surfaces legacy evidence', () => {
    expect(clientSource).toContain(
      'must not be summed across campaigns as business sales',
    );
    expect(overviewSource).toContain('INCLUDES_LEGACY_CURRENT_ORDER');
    expect(overviewSource).toContain('Includes legacy current-order evidence');
  });
});
