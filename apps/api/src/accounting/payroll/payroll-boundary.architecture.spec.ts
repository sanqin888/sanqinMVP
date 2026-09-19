import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCOUNTING_ROOT = resolve(__dirname, '..');
const PAYROLL_ROOT = resolve(__dirname);
const API_ROOT = resolve(ACCOUNTING_ROOT, '..', '..');
const PRISMA_SCHEMA = resolve(API_ROOT, 'prisma', 'schema.prisma');

const read = (path: string): string => readFileSync(path, 'utf8');

const payrollProductionFiles = (): string[] =>
  readdirSync(PAYROLL_ROOT)
    .filter(
      (name) =>
        name.endsWith('.ts') &&
        !name.endsWith('.spec.ts') &&
        !name.endsWith('.test.ts'),
    )
    .sort();

const modelSource = (schema: string, model: string): string => {
  const match = schema.match(
    new RegExp(`model ${model} \\{[\\s\\S]*?\\n\\}`, 'm'),
  );
  if (!match) {
    throw new Error(`missing Prisma model: ${model}`);
  }
  return match[0];
};

describe('Phase 9 Slice 8P-B1/B2/B3/C/D1/D2/D3-A/D3-B1/D3-B2/D4-B/D4-C/D4-D Payroll ownership boundary', () => {
  const schema = read(PRISMA_SCHEMA);

  it('adds only the approved Payroll core persistence models', () => {
    const expectedModels = [
      'PayrollEmployer',
      'PayrollEmployerConfigVersion',
      'PayrollEmployee',
      'PayrollEmployeeConfigVersion',
      'PayrollEmployeeYearOpening',
      'PayrollRun',
      'PayrollEmployeePayment',
      'PayrollCraRemittance',
      'PayrollCraRemittanceRun',
    ];

    for (const model of expectedModels) {
      expect(schema).toContain(`model ${model} {`);
    }

    expect(schema).toContain('model PayrollEmployeePayment {');
    expect(schema).toContain('model PayrollCraRemittance {');
    expect(schema).toContain('model PayrollCraRemittanceRun {');
  });

  it('keeps Payroll cross-owner identities stable and scalar', () => {
    const employer = modelSource(schema, 'PayrollEmployer');
    const employee = modelSource(schema, 'PayrollEmployee');
    const run = modelSource(schema, 'PayrollRun');
    const payment = modelSource(schema, 'PayrollEmployeePayment');
    const remittance = modelSource(schema, 'PayrollCraRemittance');
    const remittanceRun = modelSource(schema, 'PayrollCraRemittanceRun');

    expect(employer).toContain('employerStableId');
    expect(employer).toContain('defaultStoreStableId String?');
    expect(employer).not.toMatch(/\bStore\??\s+@relation/);
    expect(employer).not.toMatch(/\bBrandConfig\??\s+@relation/);

    expect(employee).toContain('employeeStableId');
    expect(employee).toContain('userStableId');
    expect(employee).toContain('storeStableId');
    expect(employee).not.toMatch(/\bUser\??\s+@relation/);
    expect(employee).not.toMatch(/\bStore\??\s+@relation/);

    expect(run).toContain('storeStableId');
    expect(run).toContain('postedJournalEntryStableId');
    expect(run).toMatch(/reversalJournalEntryStableId\s+String\?\s+@unique/);
    expect(run).toContain('reversedByActorRef');
    expect(run).toContain('reversalReason');
    expect(run).toContain('reversedAt');
    expect(run).not.toMatch(/AccountingJournalEntry\??\s+@relation/);

    expect(payment).toContain('paymentStableId');
    expect(payment).toContain('paymentAccountStableId');
    expect(payment).toContain('journalEntryStableId');
    expect(payment).toMatch(/runId\s+String\s+@unique\s+@db\.Uuid/);
    expect(payment).toMatch(/amountCents\s+Int/);
    expect(payment).not.toMatch(/AccountingAccount\??\s+@relation/);
    expect(payment).not.toMatch(/AccountingJournalEntry\??\s+@relation/);

    expect(remittance).toContain('remittanceStableId');
    expect(remittance).toMatch(/evidenceHash\s+String\s+@unique/);
    expect(remittance).toContain('paymentAccountStableId');
    expect(remittance).toContain('journalEntryStableId');
    expect(remittance).not.toMatch(/AccountingAccount\??\s+@relation/);
    expect(remittance).not.toMatch(/AccountingJournalEntry\??\s+@relation/);
    expect(remittanceRun).toMatch(/runId\s+String\s+@unique\s+@db\.Uuid/);
    expect(remittanceRun).toContain('employerConfigStableId');
    expect(remittanceRun).toContain('calculationHash');
    expect(remittanceRun).toContain('postedAccrualJournalEntryStableId');

    const lifecycleContracts = read(
      resolve(PAYROLL_ROOT, 'payroll-lifecycle.contracts.ts'),
    );
    const settlementInput =
      lifecycleContracts.match(
        /export type CreatePayrollEmployeePaymentInput = \{[\s\S]*?\n\};/,
      )?.[0] ?? '';
    expect(settlementInput).toContain('paymentAccountStableId');
    expect(settlementInput).toContain('paymentDate');
    expect(settlementInput).not.toContain('amountCents');
  });

  it('keeps the statutory/remittance policy core framework-neutral and Prisma-neutral', () => {
    const payrollPolicyCoreFiles = [
      'payroll-calculator-validation.ts',
      'payroll-calculator.contracts.ts',
      'payroll-calculator.ts',
      'payroll-contracts.ts',
      'payroll-income-tax-calculator.ts',
      'payroll-policy.ts',
      'payroll-remittance-policy.ts',
      'payroll-schedule.ts',
      'payroll-statutory-math.ts',
      'payroll-statutory-policy.ts',
    ];

    const source = payrollPolicyCoreFiles
      .map((name) => read(resolve(PAYROLL_ROOT, name)))
      .join('\n');

    expect(source).not.toContain('@prisma/client');
    expect(source).not.toContain('../prisma');
    expect(source).not.toContain('@nestjs/');
    expect(source).not.toContain('@Controller(');
    expect(source).not.toContain('@Injectable(');
  });

  it('allows Payroll runtime transport through D4-B without bypassing Accounting-owned Journal persistence', () => {
    const source = payrollProductionFiles()
      .map((name) => read(resolve(PAYROLL_ROOT, name)))
      .join('\n');
    const controller = read(
      resolve(PAYROLL_ROOT, 'accounting-payroll.controller.ts'),
    );

    expect(controller).toContain("@Controller('accounting')");
    expect(controller).not.toContain('@prisma/client');
    expect(controller).not.toContain('ACCOUNTING_DB');
    expect(source).not.toContain('@prisma/client');
    expect(source).not.toContain('../prisma');
    expect(source).not.toContain('.accountingTransaction.');
    expect(source).not.toContain('.accountingJournalEntry.');
    expect(source).not.toContain('.accountingJournalLine.');
  });

  it('registers Payroll as an explicit Journal source and enables only the D1 owner-specific accrual writer', () => {
    const contracts = read(resolve(ACCOUNTING_ROOT, 'accounting-contracts.ts'));
    const posting = read(
      resolve(PAYROLL_ROOT, 'accounting-payroll-posting.service.ts'),
    );
    const authority = read(
      resolve(PAYROLL_ROOT, 'payroll-journal-write-authority.ts'),
    );

    expect(schema).toMatch(
      /enum AccountingJournalSource \{[\s\S]*?\bPAYROLL\b[\s\S]*?\}/,
    );
    expect(contracts).toContain("PAYROLL: 'PAYROLL'");
    expect(posting).toContain('createPayrollRunAccrualJournalInTx');
    const payrollJournalWriterCallers = payrollProductionFiles().filter(
      (name) =>
        read(resolve(PAYROLL_ROOT, name)).includes(
          '.createPayrollRunAccrualJournalInTx(',
        ),
    );
    expect(payrollJournalWriterCallers).toEqual([
      'accounting-payroll-posting.service.ts',
    ]);
    expect(authority).toContain('payroll.run.accrual.v1');
    expect(authority).toContain('account_payroll_wages_expense');
    expect(authority).toContain('account_payroll_net_pay_payable');
    expect(posting).toContain(
      "accrualDate: run.periodEnd.toISOString().slice(0, 10)",
    );
    expect(authority).toContain('occurredAt: fact.accrualDate');
    expect(authority).not.toContain('occurredAt: fact.payDate');
  });

  it('enables only the D2 owner-specific employee-payment writer and keeps the source fact narrow', () => {
    const settlement = read(
      resolve(PAYROLL_ROOT, 'accounting-payroll-employee-payment.service.ts'),
    );
    const authority = read(
      resolve(PAYROLL_ROOT, 'payroll-employee-payment-journal-authority.ts'),
    );
    const callers = payrollProductionFiles().filter((name) =>
      read(resolve(PAYROLL_ROOT, name)).includes(
        '.createPayrollEmployeePaymentJournalInTx(',
      ),
    );

    expect(callers).toEqual(['accounting-payroll-employee-payment.service.ts']);
    expect(settlement).toContain('PayrollRunStatus.POSTED');
    expect(settlement).toContain('run.netPayCents');
    expect(authority).toContain('payroll.employee-payment.v1');
    expect(authority).toContain('PAYROLL_ACCOUNT_IDS.netPayPayable');
    expect(authority).toContain('AccountingAccountType.BANK');
    expect(authority).toContain('AccountingAccountType.CASH');
    expect(authority).not.toContain('wages_expense');
    expect(authority).not.toContain('expense_labor');
  });

  it('enables only the D3-B2 owner-specific CRA remittance writer and keeps settlement liability-only', () => {
    const chart = read(
      resolve(ACCOUNTING_ROOT, 'accounting-chart-of-accounts.ts'),
    );
    const controller = read(
      resolve(PAYROLL_ROOT, 'accounting-payroll.controller.ts'),
    );
    const settlement = read(
      resolve(PAYROLL_ROOT, 'accounting-payroll-cra-remittance.service.ts'),
    );
    const authority = read(
      resolve(PAYROLL_ROOT, 'payroll-cra-remittance-journal-authority.ts'),
    );
    const lifecycleContracts = read(
      resolve(PAYROLL_ROOT, 'payroll-lifecycle.contracts.ts'),
    );
    const remittanceInput =
      lifecycleContracts.match(
        /export type CreatePayrollCraRemittanceInput = \{[\s\S]*?\n\};/,
      )?.[0] ?? '';
    const callers = payrollProductionFiles().filter((name) =>
      read(resolve(PAYROLL_ROOT, name)).includes(
        '.createPayrollCraRemittanceJournalInTx(',
      ),
    );

    expect(chart).toContain('account_payroll_income_tax_payable');
    expect(chart).toContain('account_payroll_cpp_payable');
    expect(chart).toContain('account_payroll_ei_payable');
    expect(schema).toContain('PayrollCraRemittance');
    expect(schema).toContain('PayrollCraRemittanceRun');
    expect(controller).toContain('cra-remittances/preview');
    expect(controller).toContain(
      "@Post('payroll/employers/:employerStableId/cra-remittances')",
    );
    expect(settlement).toContain('PayrollRunStatus.POSTED');
    expect(settlement).toContain('craRemittanceEvidence: null');
    expect(settlement).toContain('buildPayrollCraRemittancePreview');
    expect(settlement).toContain('expectedEvidenceHash');
    expect(settlement).toContain('createPayrollCraRemittanceJournalInTx');
    expect(callers).toEqual(['accounting-payroll-cra-remittance.service.ts']);
    expect(authority).toContain('payroll.cra_remittance.v1');
    expect(authority).toContain('PAYROLL_ACCOUNT_IDS.incomeTaxPayable');
    expect(authority).toContain('PAYROLL_ACCOUNT_IDS.cppPayable');
    expect(authority).toContain('PAYROLL_ACCOUNT_IDS.eiPayable');
    expect(authority).toContain('AccountingAccountType.BANK');
    expect(authority).not.toContain('AccountingAccountType.CASH');
    expect(authority).not.toContain('expense_labor');
    expect(authority).toContain('storeStableId: null');
    expect(remittanceInput).toContain('expectedEvidenceHash');
    expect(remittanceInput).toContain('paymentAccountStableId');
    expect(remittanceInput).toContain('paymentDate');
    expect(remittanceInput).not.toContain('amountCents');
    expect(remittanceInput).not.toContain('incomeTaxCents');
    expect(remittanceInput).not.toContain('employeeCppCents');
  });

  it('enables D4-B reversal only through Payroll authority and preserves explicit inverse YTD semantics', () => {
    const controller = read(
      resolve(PAYROLL_ROOT, 'accounting-payroll.controller.ts'),
    );
    const reversal = read(
      resolve(PAYROLL_ROOT, 'accounting-payroll-reversal.service.ts'),
    );
    const authority = read(
      resolve(PAYROLL_ROOT, 'payroll-reversal-journal-authority.ts'),
    );
    const ytdService = read(
      resolve(PAYROLL_ROOT, 'accounting-payroll-ytd.service.ts'),
    );
    const ytd = read(resolve(PAYROLL_ROOT, 'payroll-ytd.ts'));
    const lifecycleContracts = read(
      resolve(PAYROLL_ROOT, 'payroll-lifecycle.contracts.ts'),
    );
    const reversalInput =
      lifecycleContracts.match(
        /export type ReversePayrollRunInput = \{[\s\S]*?\n\};/,
      )?.[0] ?? '';
    const callers = payrollProductionFiles().filter((name) =>
      read(resolve(PAYROLL_ROOT, name)).includes(
        '.createPayrollRunReversalJournalInTx(',
      ),
    );

    expect(controller).toContain("@Post('payroll/runs/:runStableId/reverse')");
    expect(callers).toEqual(['accounting-payroll-reversal.service.ts']);
    expect(reversal).toContain('PayrollRunStatus.POSTED');
    expect(reversal).toContain('existing.employeePayment');
    expect(reversal).toContain('existing.craRemittanceEvidence');
    expect(reversal).toContain('later Payroll run has been finalized');
    expect(authority).toContain('payroll.run.reversal.v1');
    expect(authority).toContain('AccountingJournalEntryKind.STANDARD');
    expect(authority).not.toContain('AccountingJournalEntryKind.ADJUSTMENT');
    expect(authority).toContain('PAYROLL_LABOR_CATEGORY_STABLE_ID');
    expect(reversal).toContain(
      "accrualDate: run.periodEnd.toISOString().slice(0, 10)",
    );
    expect(authority).toContain('occurredAt: fact.accrualDate');
    expect(authority).not.toContain('occurredAt: fact.payDate');
    expect(reversalInput).toContain('reason: string');
    expect(reversalInput).not.toContain('amountCents');
    expect(reversalInput).not.toContain('occurredAt');
    expect(ytdService).toContain('PayrollRunStatus.REVERSED');
    expect(ytd).toContain('applyRunEffect(row, 1)');
    expect(ytd).toContain('applyRunEffect(row, -1)');
  });

  it('keeps D4-C correction creation Payroll-owned, linear and stable-ID based', () => {
    const controller = read(
      resolve(PAYROLL_ROOT, 'accounting-payroll.controller.ts'),
    );
    const runs = read(
      resolve(PAYROLL_ROOT, 'accounting-payroll-run.service.ts'),
    );
    const presenter = read(resolve(PAYROLL_ROOT, 'payroll-run-presenter.ts'));

    expect(controller).toContain(
      "@Post('payroll/runs/:runStableId/corrections')",
    );
    expect(runs).toContain('PayrollRunStatus.REVERSED');
    expect(runs).toContain('correctionOfRunId: parent.id');
    expect(runs).toContain('parent.correctionSequence + 1');
    expect(runs).toContain(
      'Only the latest Payroll correction predecessor can create the next correction',
    );
    expect(runs).toContain(
      'Payroll correction identity fields cannot be changed',
    );
    expect(runs).not.toContain('CreatePayrollCorrectionInput');
    expect(presenter).toContain('correctionOfRunStableId');
    expect(presenter).not.toContain('correctionOfRunId:');
  });

  it('pins the approved PayrollRun evidence and correction shape', () => {
    const run = modelSource(schema, 'PayrollRun');

    expect(run).toContain('correctionOfRunId');
    expect(run).toContain('correctionSequence');
    expect(run).toContain('calculationEvidenceVersion');
    expect(run).toContain('calculationInputJson');
    expect(run).toContain('calculationOutputJson');
    expect(run).toContain('ytdBeforeJson');
    expect(run).toContain('ytdAfterJson');
    expect(run).toContain('payStatementTemplateVersion');
    const contracts = read(resolve(PAYROLL_ROOT, 'payroll-contracts.ts'));
    expect(contracts).toContain('PAY_STATEMENT_V1');
    const opening = modelSource(schema, 'PayrollEmployeeYearOpening');
    expect(opening).toContain('nonPeriodicCppBaseContributionYtdCents');
    expect(opening).toContain('nonPeriodicCppAdditionalDeductionYtdCents');
    expect(opening).toContain('nonPeriodicEiPremiumYtdCents');
    expect(run).toContain(
      '@@unique([employeeId, periodStart, periodEnd, payDate, correctionSequence])',
    );
  });
});
