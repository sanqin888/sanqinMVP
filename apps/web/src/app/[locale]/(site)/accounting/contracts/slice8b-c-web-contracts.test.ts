import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCOUNTING_ROOT = resolve(__dirname, '..');

const reportsPageSource = readFileSync(
  resolve(ACCOUNTING_ROOT, 'reports', 'page.tsx'),
  'utf8',
);
const dashboardPageSource = readFileSync(
  resolve(ACCOUNTING_ROOT, 'dashboard', 'page.tsx'),
  'utf8',
);
const salesPageSource = readFileSync(
  resolve(ACCOUNTING_ROOT, 'sales', 'page.tsx'),
  'utf8',
);
const settingsPageSource = readFileSync(
  resolve(ACCOUNTING_ROOT, 'settings', 'page.tsx'),
  'utf8',
);
const providerRecognitionSource = readFileSync(
  resolve(ACCOUNTING_ROOT, 'settings', 'provider-recognition-rules.tsx'),
  'utf8',
);
const reportsContractSource = readFileSync(
  resolve(__dirname, 'reports.ts'),
  'utf8',
);
const automationPeriodContractSource = readFileSync(
  resolve(__dirname, 'automation-period.ts'),
  'utf8',
);

describe('Phase 9 Slice 8B-C Accounting Web vertical contracts', () => {
  it('consolidates Reports, Dashboard and Sales HTTP DTOs', () => {
    for (const source of [
      reportsPageSource,
      dashboardPageSource,
      salesPageSource,
    ]) {
      expect(source).toContain("from '../contracts/reports'");
    }

    expect(reportsPageSource).not.toContain('type PnlReport =');
    expect(reportsPageSource).not.toContain('type Cashflow =');
    expect(reportsPageSource).not.toContain('type AccountBalance =');
    expect(dashboardPageSource).not.toContain('type Dashboard =');
    expect(dashboardPageSource).not.toContain('type Slice =');
    expect(salesPageSource).not.toContain('type Slice =');
    expect(salesPageSource).not.toContain('type Pnl =');

    expect(reportsContractSource).toContain('transferCents: number');
    expect(reportsContractSource).toContain('closeStatus:');
    expect(reportsContractSource).toContain(
      'export type AccountingOrderDimensionSlice',
    );
  });

  it('makes Settings consume chart, automation and period wire contracts', () => {
    expect(settingsPageSource).toContain("from '../contracts/chart'");
    expect(settingsPageSource).toContain(
      "from '../contracts/automation-period'",
    );
    expect(settingsPageSource).not.toContain('type Category =');
    expect(settingsPageSource).not.toContain('type Account =');
    expect(settingsPageSource).not.toContain('type AutomationSettings =');
    expect(settingsPageSource).not.toContain('type AutomationResult =');
    expect(settingsPageSource).not.toContain('type PeriodClose =');

    expect(automationPeriodContractSource).toContain('startAt: string');
    expect(automationPeriodContractSource).toContain(
      'closedByUserStableId: string',
    );
  });

  it('keeps Provider Recognition on the Inbox-owned wire contract', () => {
    expect(providerRecognitionSource).toContain("from '../contracts/inbox'");
    expect(providerRecognitionSource).toContain("from '../contracts/core'");
    expect(providerRecognitionSource).not.toContain(
      'type ProviderRecognitionRule =',
    );
    expect(providerRecognitionSource).not.toContain("type Provider = '");
    expect(providerRecognitionSource).not.toContain("type MatchMode = '");
  });
});
