import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');
const clientSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../../../features/admin/sales-analytics/SalesAnalyticsPageClient.tsx',
  ),
  'utf8',
);
const modelSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../../../features/admin/sales-analytics/model.ts',
  ),
  'utf8',
);
const dateRangeSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../../../features/admin/sales-analytics/date-range.ts',
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
const sharedSalesContractSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../../../lib/contracts/accounting-sales.ts',
  ),
  'utf8',
);

describe('Admin DATA-C Sales Analytics UI contract', () => {
  it('composes owner reports without introducing a duplicate financial projection', () => {
    expect(pageSource).toContain('SalesAnalyticsPageClient');
    expect(clientSource).toContain('/accounting/report/sales?');
    expect(clientSource).toContain('/reports/business');
    expect(clientSource).toContain('/reports/weather-history');
    expect(clientSource).toContain('/reports/calendar-context');
    expect(clientSource).not.toContain('/accounting/report/slice');
    expect(clientSource).not.toContain('/accounting/report/pnl');
    expect(sharedSalesContractSource).toContain(
      'export type AccountingSalesAnalyticsReport',
    );
  });

  it('keeps Store/timezone/range mismatches fail-visible before presentation joining', () => {
    expect(modelSource).toContain('assertCoreReportIdentity');
    expect(modelSource).toContain('Store identity mismatch');
    expect(modelSource).toContain('Timezone mismatch');
    expect(modelSource).toContain('Date range mismatch');
    expect(modelSource).toContain('assertContextReportIdentity');
    expect(modelSource).toContain('Context identity mismatch');
  });

  it('implements the approved 7/30/90 plus single-day arrow contract', () => {
    for (const token of ["'single'", "'7d'", "'30d'", "'90d'"]) {
      expect(dateRangeSource).toContain(token);
    }
    expect(dateRangeSource).toContain('formatMmDdYyyy');
    expect(clientSource).toContain('Previous day');
    expect(clientSource).toContain('Next day');
    expect(clientSource).toContain('nextDate > storeToday');
    expect(clientSource).toContain("nextDayState !== 'AVAILABLE'");
    expect(clientSource).toContain('Promise.allSettled');
  });

  it('uses canonical Journal or Orders owner evidence before enabling the next-day arrow', () => {
    expect(modelSource).toContain('sales.journalEntryCount > 0');
    expect(modelSource).toContain('business.summary.orderCount > 0');
    expect(clientSource).toContain(
      "salesResult.status !== 'fulfilled'",
    );
    expect(clientSource).toContain(
      "businessResult.status !== 'fulfilled'",
    );
    expect(clientSource).toContain('hasOwnerBackedEvidence(sales, business)');
  });

  it('keeps financial previous-period comparison distinct from the operating same-weekday baseline', () => {
    expect(clientSource).toContain('Previous equal period');
    expect(clientSource).toContain('Same-weekday operating baseline');
    expect(clientSource).toContain(
      'operational or explanatory context only',
    );
    expect(clientSource).toContain('do not prove causation');
  });

  it('adds a Store-scoped Sales Analytics destination without making Data globally Store-scoped', () => {
    expect(adminShellSource).toContain('/reports/sales');
    expect(adminShellSource).toContain("labelZh: '销售分析'");
    expect(adminShellSource).toContain("labelEn: 'Sales analytics'");
    expect(adminShellSource).toContain('preserveStoreContext: true');
    expect(adminShellSource).toContain(
      'activeNavigationItem?.preserveStoreContext === true',
    );
  });
});
