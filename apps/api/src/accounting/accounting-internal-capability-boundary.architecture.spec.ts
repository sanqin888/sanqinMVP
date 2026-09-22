import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCOUNTING_ROOT = resolve(__dirname);

function read(name: string): string {
  return readFileSync(resolve(ACCOUNTING_ROOT, name), 'utf8');
}

const CANONICAL_FINANCIAL_SERVICES = [
  'accounting-canonical-sale-posting.service.ts',
  'accounting-canonical-sale-replay.service.ts',
  'accounting-canonical-change-preview.service.ts',
  'accounting-canonical-change-execution.service.ts',
  'accounting-provider-settlement-preview.service.ts',
  'accounting-provider-settlement-execution.service.ts',
] as const;

describe('Accounting internal capability boundary', () => {
  it('keeps canonical financial services off the broad AccountingService facade', () => {
    for (const name of CANONICAL_FINANCIAL_SERVICES) {
      const source = read(name);
      expect(source).not.toContain("from './accounting.service'");
      expect(source).not.toContain('AccountingService');
    }
  });

  it('removes the AccountingOperationsService facade and keeps 8A-2 capabilities explicit', () => {
    expect(
      existsSync(resolve(ACCOUNTING_ROOT, 'accounting-operations.service.ts')),
    ).toBe(false);

    const module = read('accounting.module.ts');
    for (const capability of [
      'AccountingChartService',
      'AccountingExpenseService',
      'AccountingInboxService',
      'AccountingProviderSettlementQueryService',
      'AccountingFinancialReportsService',
    ]) {
      expect(module).toContain(capability);
    }
    expect(module).not.toContain('AccountingOperationsService');
  });

  it('routes 8A-2 operational consumers through the explicit narrow capabilities', () => {
    for (const name of [
      'accounting-inbox-acquisition.service.ts',
      'accounting-image-retention.service.ts',
      'accounting-gmail-ingest.service.ts',
      'accounting-provider-financial.service.ts',
    ]) {
      const source = read(name);
      expect(source).toContain('AccountingInboxService');
      expect(source).not.toContain('AccountingOperationsService');
      expect(source).not.toContain("from './accounting.service'");
    }

    const expense = read('accounting-expense.service.ts');
    expect(expense).toContain('AccountingPeriodService');
    expect(expense).not.toContain('AccountingOperationsService');
    expect(expense).not.toContain("from './accounting.service'");

    const settlement = read(
      'accounting-provider-settlement-preview.service.ts',
    );
    expect(settlement).toContain('AccountingProviderSettlementQueryService');
    expect(settlement).toContain('AccountingChartService');
    expect(settlement).not.toContain('AccountingOperationsService');
    expect(settlement).not.toContain("from './accounting.service'");
  });

  it('keeps Period and Journal ownership out of the remaining broad AccountingService', () => {
    const source = read('accounting.service.ts');

    expect(source).toContain('AccountingPeriodService');
    expect(source).not.toMatch(/\b(?:closeMonth|reopenMonth|closeYear)\s*\(/);
    expect(source).not.toMatch(/\bcreateJournalEntry\s*\(/);
    expect(source).not.toMatch(/\bcreateCanonicalChangeJournalEntry\s*\(/);
    expect(source).not.toMatch(
      /\bcreateProviderSettlementReplacementGroup\s*\(/,
    );
    expect(source).not.toMatch(/\.accountingJournal(?:Entry|Line)\./);
  });

  it('keeps 8A-4 canonical financial reports on the reports capability while dimension projection stays separate', () => {
    const broad = read('accounting.service.ts');
    const reports = read('accounting-financial-reports.service.ts');
    const controller = read('accounting-reports.controller.ts');

    for (const method of [
      'pnlReport',
      'exportTxCsv',
      'exportPnlTemplate',
      'exportPnlPdf',
      'accountBalanceReport',
      'annualReport',
      'cashflowOverview',
    ]) {
      expect(reports).toContain(`async ${method}(`);
      expect(broad).not.toContain(`async ${method}(`);
    }
    expect(reports).toContain('accountingJournalEntry.findMany');
    expect(reports).not.toContain('accountingTransaction.findMany');
    expect(reports).not.toContain(
      'accountingExpensePaymentAllocation.findMany',
    );
    expect(reports).not.toContain('ORDER_REPORTING_FACTS_READER');
    expect(broad).toContain('ORDER_REPORTING_FACTS_READER');
    expect(broad).toContain('readPaidTotalDimensionsForRange');
    expect(controller).toContain('this.reports.pnlReport');
    expect(controller).toContain('this.reports.accountBalanceReport');
    expect(controller).toContain('this.reports.cashflowOverview');
    expect(controller).toContain('this.accountingService.dimensionSlice');
  });

  it('shares the existing Prisma composition seam instead of widening Runtime/Data import debt', () => {
    const module = read('accounting.module.ts');
    const period = read('accounting-period.service.ts');
    const journal = read('accounting-journal.service.ts');
    const broad = read('accounting.service.ts');
    const chart = read('accounting-chart.service.ts');
    const expense = read('accounting-expense.service.ts');
    const reports = read('accounting-financial-reports.service.ts');
    const inbox = read('accounting-inbox.service.ts');
    const settlementQuery = read(
      'accounting-provider-settlement-query.service.ts',
    );

    expect(module).toContain(
      '{ provide: ACCOUNTING_DB, useExisting: PrismaService }',
    );
    for (const source of [
      period,
      journal,
      broad,
      chart,
      expense,
      reports,
      inbox,
      settlementQuery,
    ]) {
      expect(source).toContain('ACCOUNTING_DB');
      expect(source).not.toContain('../prisma/prisma.service');
    }
  });
});
