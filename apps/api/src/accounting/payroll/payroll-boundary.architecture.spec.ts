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

describe('Phase 9 Slice 8P-B1/B2/B3/C/D1/D2/D3-A/D3-B1 Payroll ownership boundary', () => {
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

  it('allows Payroll runtime transport through D3-B1 without bypassing Accounting-owned Journal persistence', () => {
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

  it('pins D3-B1 CRA persistence/preview while keeping the CRA Journal writer deferred', () => {
    const chart = read(
      resolve(ACCOUNTING_ROOT, 'accounting-chart-of-accounts.ts'),
    );

    expect(chart).toContain('account_payroll_wages_expense');
    expect(chart).toContain('account_payroll_employer_contributions_expense');
    expect(chart).toContain('account_payroll_net_pay_payable');
    expect(chart).toContain('account_payroll_income_tax_payable');
    expect(chart).toContain('account_payroll_cpp_payable');
    expect(chart).toContain('account_payroll_ei_payable');
    expect(chart).toContain('account_payroll_vacation_payable');
    expect(schema).toContain('PayrollEmployeePayment');
    expect(schema).toContain('PayrollCraRemittance');
    expect(schema).toContain('PayrollCraRemittanceRun');

    const controller = read(
      resolve(PAYROLL_ROOT, 'accounting-payroll.controller.ts'),
    );
    const preview = read(
      resolve(PAYROLL_ROOT, 'accounting-payroll-cra-remittance.service.ts'),
    );
    expect(controller).toContain('cra-remittances/preview');
    expect(preview).toContain('PayrollRunStatus.POSTED');
    expect(preview).toContain('craRemittanceEvidence: null');
    expect(preview).toContain('buildPayrollCraRemittancePreview');
    expect(preview).not.toContain('createPayrollCraRemittanceJournalInTx');
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
