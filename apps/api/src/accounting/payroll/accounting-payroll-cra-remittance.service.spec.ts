import { PayrollRemitterType, PayrollRunStatus } from './payroll-contracts';
import { AccountingPayrollCraRemittanceService } from './accounting-payroll-cra-remittance.service';

const frozenRun = (overrides: Record<string, unknown> = {}) => ({
  runStableId: 'run_regular',
  status: PayrollRunStatus.POSTED,
  payDate: new Date('2026-09-18T00:00:00.000Z'),
  employerConfigStableId: 'config_regular',
  calculationHash: 'sha256:' + 'a'.repeat(64),
  postedJournalEntryStableId: 'journal_run_regular',
  postedAt: new Date('2026-09-18T12:00:00.000Z'),
  incomeTaxCents: 20_000,
  employeeCppCents: 8_000,
  employeeCpp2Cents: 1_000,
  employerCppCents: 8_000,
  employerCpp2Cents: 1_000,
  employeeEiCents: 3_000,
  employerEiCents: 4_200,
  craRemittanceCents: 45_200,
  employerConfig: {
    configStableId: 'config_regular',
    remitterType: PayrollRemitterType.REGULAR,
  },
  ...overrides,
});

const setup = (runs = [frozenRun()]) => {
  const prisma = {
    payrollEmployer: {
      findUnique: jest.fn().mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        employerStableId: 'employer_sanq',
      }),
    },
    payrollEmployerConfigVersion: {
      findFirst: jest.fn().mockResolvedValue({
        configStableId: 'config_regular',
        remitterType: PayrollRemitterType.REGULAR,
      }),
    },
    payrollRun: {
      findMany: jest.fn().mockResolvedValue(runs),
    },
  };
  return {
    prisma,
    service: new AccountingPayrollCraRemittanceService(prisma as never),
  };
};

describe('AccountingPayrollCraRemittanceService preview', () => {
  it('builds an employer-level preview only from unremitted POSTED runs in the frozen remitter period', async () => {
    const otherType = frozenRun({
      runStableId: 'run_threshold',
      employerConfigStableId: 'config_threshold',
      employerConfig: {
        configStableId: 'config_threshold',
        remitterType: PayrollRemitterType.ACCELERATED_THRESHOLD_1,
      },
    });
    const { service } = setup([frozenRun(), otherType]);

    const result = await service.preview('employer_sanq', '2026-09-18');

    expect(result.periodStart).toBe('2026-09-01');
    expect(result.periodEnd).toBe('2026-09-30');
    expect(result.includedRuns.map((run) => run.runStableId)).toEqual([
      'run_regular',
    ]);
    expect(result.totalAmountCents).toBe(45_200);
  });

  it('returns an empty canonical preview when the period has no eligible runs', async () => {
    const { service } = setup([]);
    const result = await service.preview('employer_sanq', '2026-09-18');

    expect(result.includedRuns).toEqual([]);
    expect(result.totalAmountCents).toBe(0);
    expect(result.evidenceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('fails closed when a POSTED candidate is missing frozen accrual evidence', async () => {
    const { service } = setup([
      frozenRun({ postedJournalEntryStableId: null }),
    ]);

    await expect(
      service.preview('employer_sanq', '2026-09-18'),
    ).rejects.toThrow('missing frozen CRA remittance evidence');
  });
});
