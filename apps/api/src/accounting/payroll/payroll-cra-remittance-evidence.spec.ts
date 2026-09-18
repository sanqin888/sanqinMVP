import { PayrollRemitterType } from './payroll-contracts';
import {
  buildPayrollCraRemittancePreview,
  type PayrollCraRemittanceRunEvidenceV1,
} from './payroll-cra-remittance-evidence';

const run = (
  runStableId: string,
  overrides: Partial<PayrollCraRemittanceRunEvidenceV1> = {},
): PayrollCraRemittanceRunEvidenceV1 => ({
  runStableId,
  employerConfigStableId: 'employer_config_1',
  calculationHash: 'sha256:' + 'a'.repeat(64),
  postedAccrualJournalEntryStableId: 'journal_' + runStableId,
  payDate: '2026-09-18',
  incomeTaxCents: 20_000,
  employeeCppCents: 8_000,
  employeeCpp2Cents: 1_000,
  employerCppCents: 8_000,
  employerCpp2Cents: 1_000,
  employeeEiCents: 3_000,
  employerEiCents: 4_200,
  craRemittanceCents: 45_200,
  ...overrides,
});

const preview = (includedRuns: PayrollCraRemittanceRunEvidenceV1[]) =>
  buildPayrollCraRemittancePreview({
    employerStableId: 'employer_sanq',
    remitterType: PayrollRemitterType.REGULAR,
    remittancePolicyVersion: 'CA-CRA-REMIT-2026-V1',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    dueDate: '2026-10-15',
    includedRuns,
  });

describe('Payroll CRA remittance evidence', () => {
  it('sums frozen run components and sorts evidence deterministically', () => {
    const result = preview([
      run('run_b', {
        incomeTaxCents: 10_000,
        craRemittanceCents: 35_200,
      }),
      run('run_a'),
    ]);

    expect(result.includedRuns.map((item) => item.runStableId)).toEqual([
      'run_a',
      'run_b',
    ]);
    expect(result.incomeTaxCents).toBe(30_000);
    expect(result.employeeCppCents).toBe(16_000);
    expect(result.totalAmountCents).toBe(80_400);
    expect(result.currency).toBe('CAD');
    expect(result.evidenceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('produces the same evidence hash regardless of input run ordering', () => {
    expect(preview([run('run_b'), run('run_a')]).evidenceHash).toBe(
      preview([run('run_a'), run('run_b')]).evidenceHash,
    );
  });

  it('rejects a run whose frozen CRA total does not match its components', () => {
    expect(() =>
      preview([run('run_a', { craRemittanceCents: 45_199 })]),
    ).toThrow('do not match craRemittanceCents');
  });

  it('rejects duplicate run evidence', () => {
    expect(() => preview([run('run_a'), run('run_a')])).toThrow(
      'duplicate Payroll run',
    );
  });

  it('rejects a run outside the remittance period', () => {
    expect(() =>
      preview([run('run_a', { payDate: '2026-10-01' })]),
    ).toThrow('outside the CRA remittance period');
  });
});
