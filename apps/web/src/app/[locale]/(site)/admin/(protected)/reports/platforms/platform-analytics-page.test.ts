import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');
const clientSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../../../features/admin/platform-analytics/PlatformAnalyticsPageClient.tsx',
  ),
  'utf8',
);
const modelSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../../../features/admin/platform-analytics/model.ts',
  ),
  'utf8',
);
const contractSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../../../lib/contracts/accounting-platform-analytics.ts',
  ),
  'utf8',
);
const adminShellSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../../../components/staff/AdminShell.tsx',
  ),
  'utf8',
);

describe('Admin Platform analytics UI contract', () => {
  it('adds a Store-scoped Platform analytics destination before Behavior analytics', () => {
    const platformStart = adminShellSource.indexOf(
      "href: `${adminRoot}/reports/platforms`",
    );
    const behaviorStart = adminShellSource.indexOf(
      "href: `${adminRoot}/analytics`",
      platformStart,
    );
    const platformItem = adminShellSource.slice(platformStart, behaviorStart);

    expect(pageSource).toContain('PlatformAnalyticsPageClient');
    expect(platformStart).toBeGreaterThan(-1);
    expect(behaviorStart).toBeGreaterThan(platformStart);
    expect(platformItem).toContain("labelEn: 'Platform analytics'");
    expect(platformItem).toContain('preserveStoreContext: true');
  });

  it('consumes only the Accounting-owned platform report', () => {
    expect(clientSource).toContain('/accounting/report/platforms?');
    expect(clientSource).toContain("searchParams.get('store')");
    expect(clientSource).not.toContain('/ubereats/');
    expect(clientSource).not.toContain('/orders');
    expect(clientSource).not.toContain('Prisma');
  });

  it('keeps financial classification and arithmetic out of the browser', () => {
    expect(contractSource).toContain('totalPlatformCostExTaxCents');
    expect(contractSource).toContain('shareOfSalesBps');
    expect(clientSource).not.toContain('AccountingFinancialTaxRole');
    expect(clientSource).not.toContain('PLATFORM_FEE_COMPONENTS');
    expect(clientSource).not.toContain('costImpactCents =');
    expect(modelSource).not.toContain('amountCents +');
    expect(modelSource).not.toContain('amountCents -');
  });

  it('shows explicit missing, ambiguous, or incomplete statement states instead of zero-filling history', () => {
    expect(contractSource).toContain(
      "'MISSING' | 'AMBIGUOUS' | 'INCOMPLETE'",
    );
    expect(clientSource).toContain('Confirmed statement missing');
    expect(clientSource).toContain('Multiple statements need review');
    expect(clientSource).toContain(
      'Statement details are incomplete; re-evaluate and confirm in Accounting',
    );
  });
});
