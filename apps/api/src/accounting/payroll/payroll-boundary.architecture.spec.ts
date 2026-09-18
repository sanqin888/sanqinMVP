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

describe('Phase 9 Slice 8P-B1/B2/B3 Payroll ownership boundary', () => {
  const schema = read(PRISMA_SCHEMA);

  it('adds only the approved Payroll core persistence models', () => {
    const expectedModels = [
      'PayrollEmployer',
      'PayrollEmployerConfigVersion',
      'PayrollEmployee',
      'PayrollEmployeeConfigVersion',
      'PayrollEmployeeYearOpening',
      'PayrollRun',
    ];

    for (const model of expectedModels) {
      expect(schema).toContain(`model ${model} {`);
    }

    expect(schema).not.toContain('model PayrollEmployeePayment {');
    expect(schema).not.toContain('model PayrollCraRemittance {');
  });

  it('keeps Payroll cross-owner identities stable and scalar', () => {
    const employer = modelSource(schema, 'PayrollEmployer');
    const employee = modelSource(schema, 'PayrollEmployee');
    const run = modelSource(schema, 'PayrollRun');

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
  });

  it('keeps the statutory calculator/policy core framework-neutral and Prisma-neutral', () => {
    const calculatorCoreFiles = [
      'payroll-calculator-validation.ts',
      'payroll-calculator.contracts.ts',
      'payroll-calculator.ts',
      'payroll-contracts.ts',
      'payroll-income-tax-calculator.ts',
      'payroll-policy.ts',
      'payroll-schedule.ts',
      'payroll-statutory-math.ts',
      'payroll-statutory-policy.ts',
    ];

    const source = calculatorCoreFiles
      .map((name) => read(resolve(PAYROLL_ROOT, name)))
      .join('\n');

    expect(source).not.toContain('@prisma/client');
    expect(source).not.toContain('../prisma');
    expect(source).not.toContain('@nestjs/');
    expect(source).not.toContain('@Controller(');
    expect(source).not.toContain('@Injectable(');
  });

  it('allows B3 Payroll runtime transport without bypassing Accounting-owned financial writers', () => {
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

  it('registers Payroll as an explicit Journal source without enabling posting', () => {
    const contracts = read(resolve(ACCOUNTING_ROOT, 'accounting-contracts.ts'));

    expect(schema).toMatch(
      /enum AccountingJournalSource \{[\s\S]*?\bPAYROLL\b[\s\S]*?\}/,
    );
    expect(contracts).toContain("PAYROLL: 'PAYROLL'");
    expect(payrollProductionFiles()).not.toContain(
      'payroll-posting.service.ts',
    );
  });

  it('does not provision Payroll CoA or settlement persistence through B3', () => {
    const chart = read(
      resolve(ACCOUNTING_ROOT, 'accounting-chart-of-accounts.ts'),
    );

    expect(chart).not.toContain('account_payroll_');
    expect(schema).not.toContain('PayrollEmployeePayment');
    expect(schema).not.toContain('PayrollCraRemittance');
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
    const opening = modelSource(schema, 'PayrollEmployeeYearOpening');
    expect(opening).toContain('nonPeriodicCppBaseContributionYtdCents');
    expect(opening).toContain('nonPeriodicCppAdditionalDeductionYtdCents');
    expect(opening).toContain('nonPeriodicEiPremiumYtdCents');
    expect(run).toContain(
      '@@unique([employeeId, periodStart, periodEnd, payDate, correctionSequence])',
    );
  });
});
