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

describe('Admin Marketing Overview MKT-C cutover', () => {
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

  it('keeps MKT-C presentation usage-first and defers performance metric display to MKT-D', () => {
    expect(clientSource).toContain('activity.metrics[key].uses');
    expect(clientSource).toContain('Campaign uses');
    expect(clientSource).not.toContain('discountCents');
    expect(clientSource).not.toContain('associatedSalesCents');
    expect(clientSource).not.toContain('affectedItemQuantity');
  });
});
