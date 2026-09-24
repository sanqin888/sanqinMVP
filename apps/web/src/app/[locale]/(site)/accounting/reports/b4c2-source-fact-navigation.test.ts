import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPORTS_ROOT = __dirname;
const ACCOUNTING_ROOT = resolve(REPORTS_ROOT, '..');

const drillSource = readFileSync(
  resolve(REPORTS_ROOT, 'statement-journal-drill-through.tsx'),
  'utf8',
);
const navigationSource = readFileSync(
  resolve(REPORTS_ROOT, 'source-fact-navigation.ts'),
  'utf8',
);
const expensePageSource = readFileSync(
  resolve(ACCOUNTING_ROOT, 'expenses', 'page.tsx'),
  'utf8',
);
const settlementsPageSource = readFileSync(
  resolve(ACCOUNTING_ROOT, 'settlements', 'page.tsx'),
  'utf8',
);
const payoutPanelSource = readFileSync(
  resolve(ACCOUNTING_ROOT, 'settlements', 'provider-payout-panel.tsx'),
  'utf8',
);
const payrollPageSource = readFileSync(
  resolve(ACCOUNTING_ROOT, 'payroll', 'page.tsx'),
  'utf8',
);

describe('B4-C2 Journal to source fact navigation', () => {
  it(
    'keeps the Journal drawer as a navigation adapter over C1 identity',
    () => {
      expect(drillSource).toContain('resolveAccountingSourceFactNavigation');
      expect(drillSource).toContain('href={navigation.href}');
      expect(drillSource).toContain('sourceFactType={entry.sourceFactType}');
      expect(drillSource).toContain(
        'sourceFactStableId={entry.sourceFactStableId}',
      );
    },
  );

  it(
    'does not fetch foreign owners or define a page-local financial DTO',
    () => {
      expect(navigationSource).not.toContain('apiFetch');
      expect(navigationSource).not.toContain('fetch(');
      expect(drillSource).not.toContain('/orders/');
      expect(drillSource).not.toContain('/provider-payouts/');
      expect(drillSource).not.toContain('/payroll/');
      expect(drillSource).not.toContain(
        'type AccountingStatementJournalDrillThrough =',
      );
    },
  );

  it('uses existing destinations plus minimal Accounting stable-ID locators', () => {
    expect(expensePageSource).toContain("query.set('documentStableId'");
    expect(settlementsPageSource).toContain(
      "inboxQuery.set('materializedEntityStableId'",
    );
    expect(payoutPanelSource).toContain("payoutQuery.set('payoutStableId'");
    expect(payoutPanelSource).toContain('payout.payoutStableId');
    expect(payrollPageSource).toContain("searchParams.get('runStableId')");
    expect(payrollPageSource).toContain(
      "'/accounting/payroll/runs/' + encodeURIComponent(linkedRunStableId)",
    );
  });
});
