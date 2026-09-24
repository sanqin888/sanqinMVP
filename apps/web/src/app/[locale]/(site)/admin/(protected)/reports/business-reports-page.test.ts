import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');
const clientSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../../features/admin/business-reports/BusinessReportsPageClient.tsx',
  ),
  'utf8',
);
const attentionSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../../features/admin/business-reports/AttentionAndMetrics.tsx',
  ),
  'utf8',
);
const attributionSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../../features/admin/business-reports/AttributionAndItems.tsx',
  ),
  'utf8',
);
const executionSource = readFileSync(
  resolve(
    __dirname,
    '../../../../../../features/admin/business-reports/ExecutionAndCoverage.tsx',
  ),
  'utf8',
);
const adminShellSource = readFileSync(
  resolve(__dirname, '../../../../../../components/staff/AdminShell.tsx'),
  'utf8',
);

describe('Admin Business Reports C2 UI contract', () => {
  it('uses the additive Business Operations projection and keeps the legacy report consumer out of the new page', () => {
    expect(pageSource).toContain('BusinessReportsPageClient');
    expect(clientSource).toContain('/reports/business?');
    expect(clientSource).toContain('storeStableId');
    expect(clientSource).not.toContain('apiFetch<ReportData>');
  });

  it('keeps the Today-first operating-monitoring evidence model visible', () => {
    expect(clientSource).toContain("'today'");
    expect(clientSource).toContain("'28d'");
    expect(clientSource).toContain("'90d'");
    expect(attentionSource).toContain('report.anomalies');
    expect(attentionSource).toContain(
      'Order total is an operating Order measure',
    );
    expect(attributionSource).toContain('volumeEffectCents');
    expect(attributionSource).toContain('averageOrderEffectCents');
    expect(attributionSource).toContain('report.byChannel');
    expect(attributionSource).toContain('report.byFulfillment');
    expect(attributionSource).toContain('report.commercialItems');
    expect(attributionSource).toContain('report.productionItems');
  });

  it('preserves bounded execution and coverage limitations instead of inventing new authority', () => {
    expect(executionSource).toContain('queue.windowHours');
    expect(executionSource).toContain(
      'report.coverage.storeOperatingContext',
    );
    expect(executionSource).toContain('report.coverage.printHealth');
    expect(executionSource).toContain(
      'C2 does not create a Reporting → POS/Print dependency',
    );
  });

  it('reuses the Admin store selector as an operations context on Business Reports', () => {
    expect(adminShellSource).toContain(
      "const isBusinessReportsPage = pathname.endsWith('/reports');",
    );
    expect(adminShellSource).toContain(
      'isPosDevicesPage || isBusinessReportsPage',
    );
  });
});
