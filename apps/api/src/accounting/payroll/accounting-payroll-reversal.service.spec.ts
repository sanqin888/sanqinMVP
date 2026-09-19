import { AccountingAccountClass } from '../accounting-contracts';
import { AccountingChartService } from '../accounting-chart.service';
import { AccountingJournalService } from '../accounting-journal.service';
import { AccountingPayrollReversalService } from './accounting-payroll-reversal.service';
import { PayrollRunStatus } from './payroll-contracts';
import { hashPayrollCalculationEvidence } from './payroll-calculation-evidence';
import {
  PAYROLL_ACCOUNT_IDS,
  type PayrollAccountFact,
} from './payroll-journal-write-authority';

const accounts = (): PayrollAccountFact[] => [
  {
    accountStableId: PAYROLL_ACCOUNT_IDS.wagesExpense,
    accountClass: AccountingAccountClass.EXPENSE,
    currency: 'CAD',
    isActive: true,
  },
  {
    accountStableId: PAYROLL_ACCOUNT_IDS.employerContributionsExpense,
    accountClass: AccountingAccountClass.EXPENSE,
    currency: 'CAD',
    isActive: true,
  },
  ...[
    PAYROLL_ACCOUNT_IDS.netPayPayable,
    PAYROLL_ACCOUNT_IDS.incomeTaxPayable,
    PAYROLL_ACCOUNT_IDS.cppPayable,
    PAYROLL_ACCOUNT_IDS.eiPayable,
    PAYROLL_ACCOUNT_IDS.vacationPayable,
  ].map((accountStableId) => ({
    accountStableId,
    accountClass: AccountingAccountClass.LIABILITY,
    currency: 'CAD',
    isActive: true,
  })),
];

const postedRun = () => {
  const calculationInputJson = { version: 1, payDate: '2026-09-18' };
  const calculationOutputJson = { version: 1, grossPayCents: 160_000 };
  const calculationHash = hashPayrollCalculationEvidence({
    calculationEvidenceVersion: 1,
    employeeConfigStableId: 'employee_config_1',
    employerConfigStableId: 'employer_config_1',
    input: calculationInputJson,
    output: calculationOutputJson,
  });

  return {
    id: '11111111-1111-4111-8111-111111111111',
    runStableId: 'payroll_run_1',
    employerId: '22222222-2222-4222-8222-222222222222',
    employeeId: '33333333-3333-4333-8333-333333333333',
    employeeConfigStableId: 'employee_config_1',
    employerConfigStableId: 'employer_config_1',
    correctionOfRunId: null,
    correctionSequence: 0,
    status: PayrollRunStatus.POSTED,
    version: 5,
    periodStart: new Date('2026-09-01T00:00:00.000Z'),
    periodEnd: new Date('2026-09-14T00:00:00.000Z'),
    payDate: new Date('2026-09-18T00:00:00.000Z'),
    storeStableId: '4750_Yonge_Street',
    statutoryPolicyVersion: 'CA-ON-2026-07',
    payPeriodsPerYear: 26,
    calculationProfileVersion: 'ON_HOURLY_SIMPLE_V1',
    regularMinutes: 4_800,
    regularHourlyRateCents: 2_000,
    overtimeMinutes: 0,
    overtimeHourlyRateCents: 0,
    vacationTopUpCents: 0,
    regularPayCents: 160_000,
    overtimePayCents: 0,
    vacationPayPaidCents: 0,
    vacationPayAccruedCents: 6_400,
    grossPayCents: 160_000,
    periodicTaxableEarningsCents: 160_000,
    nonPeriodicTaxableEarningsCents: 0,
    pensionableEarningsCents: 160_000,
    insurableEarningsCents: 160_000,
    incomeTaxCents: 20_000,
    employeeCppCents: 8_000,
    employeeCpp2Cents: 0,
    employeeEiCents: 2_000,
    employerCppCents: 8_000,
    employerCpp2Cents: 0,
    employerEiCents: 2_800,
    totalEmployeeDeductionsCents: 30_000,
    netPayCents: 130_000,
    craRemittanceCents: 40_800,
    compensationExpenseCents: 166_400,
    supportedEmployerPayrollCostCents: 177_200,
    calculationEvidenceVersion: 1,
    calculationInputJson,
    calculationOutputJson,
    calculationHash,
    ytdBeforeJson: { grossEarningsYtdCents: 0 },
    ytdAfterJson: { grossEarningsYtdCents: 160_000 },
    payStatementTemplateVersion: 'PAY_STATEMENT_V1',
    approvedByActorRef: 'actor_approve',
    approvedAt: new Date('2026-09-18T13:00:00.000Z'),
    postedJournalEntryStableId: 'journal_payroll_accrual_1',
    postedAt: new Date('2026-09-18T13:05:00.000Z'),
    reversalJournalEntryStableId: null as string | null,
    reversedByActorRef: null as string | null,
    reversalReason: null as string | null,
    reversedAt: null as Date | null,
    voidedAt: null,
    createdByActorRef: 'actor_1',
    updatedByActorRef: 'actor_post',
    createdAt: new Date('2026-09-18T12:00:00.000Z'),
    updatedAt: new Date('2026-09-18T13:05:00.000Z'),
    employee: { employeeStableId: 'employee_1' },
    employer: { employerStableId: 'employer_1' },
    employeePayment: null as null | { paymentStableId: string },
    craRemittanceEvidence: null as null | {
      remittance: { remittanceStableId: string };
    },
  };
};

function makeService() {
  let current = postedRun();
  const tx = {
    payrollRun: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(current)),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          current = {
            ...current,
            ...data,
            version:
              typeof data.version === 'object' && data.version !== null
                ? current.version + 1
                : current.version,
            updatedAt: new Date('2026-09-18T22:00:00.000Z'),
          } as typeof current;
          return Promise.resolve(current);
        }),
    },
    accountingAuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };
  const chart = {
    readAccountingAccountFacts: jest.fn().mockResolvedValue(accounts()),
  };
  const journal = {
    createPayrollRunReversalJournalInTx: jest
      .fn()
      .mockResolvedValue({ entryStableId: 'journal_payroll_reversal_1' }),
  };
  const service = new AccountingPayrollReversalService(
    prisma as never,
    chart as unknown as AccountingChartService,
    journal as unknown as AccountingJournalService,
  );

  return {
    service,
    tx,
    chart,
    journal,
    getCurrent: () => current,
    setCurrent: (value: ReturnType<typeof postedRun>) => {
      current = value;
    },
  };
}

describe('AccountingPayrollReversalService', () => {
  it('writes the inverse Journal and freezes POSTED -> REVERSED evidence atomically', async () => {
    const { service, tx, journal } = makeService();

    const result = await service.reverseRun(
      'payroll_run_1',
      { reason: 'Incorrect regular hours' },
      'actor_reverse',
    );

    expect(journal.createPayrollRunReversalJournalInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'payroll-run-reversal:payroll_run_1:v1',
        kind: 'STANDARD',
        source: 'PAYROLL',
        sourceFactType: 'payroll.run.reversal.v1',
        occurredAt: '2026-09-18',
      }),
      'actor_reverse',
      expect.objectContaining({
        version: 1,
        role: 'RUN_REVERSAL',
        fact: expect.objectContaining({
          postedAccrualJournalEntryStableId: 'journal_payroll_accrual_1',
          reversalReason: 'Incorrect regular hours',
        }) as unknown,
      }),
      tx,
    );
    expect(tx.payrollRun.update).toHaveBeenCalledTimes(2);
    expect(tx.payrollRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PayrollRunStatus.REVERSED,
          reversalJournalEntryStableId: 'journal_payroll_reversal_1',
          updatedByActorRef: 'actor_reverse',
        }) as unknown,
      }),
    );
    expect(tx.accountingAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PAYROLL_RUN_REVERSE',
          entityType: 'PAYROLL_RUN',
          entityId: 'payroll_run_1',
          operatorActorRef: 'actor_reverse',
        }) as unknown,
      }),
    );
    expect(result.status).toBe(PayrollRunStatus.REVERSED);
    expect(result.reversalJournalEntryStableId).toBe(
      'journal_payroll_reversal_1',
    );
  });

  it('blocks reversal after employee-payment settlement', async () => {
    const { service, setCurrent, journal } = makeService();
    setCurrent({
      ...postedRun(),
      employeePayment: { paymentStableId: 'payroll_payment_1' },
    });

    await expect(
      service.reverseRun(
        'payroll_run_1',
        { reason: 'Incorrect regular hours' },
        'actor_reverse',
      ),
    ).rejects.toThrow(
      'Payroll run already has an employee payment settlement and cannot be reversed',
    );
    expect(journal.createPayrollRunReversalJournalInTx).not.toHaveBeenCalled();
  });

  it('blocks reversal after CRA remittance settlement', async () => {
    const { service, setCurrent, journal } = makeService();
    setCurrent({
      ...postedRun(),
      craRemittanceEvidence: {
        remittance: { remittanceStableId: 'cra_remittance_1' },
      },
    });

    await expect(
      service.reverseRun(
        'payroll_run_1',
        { reason: 'Incorrect regular hours' },
        'actor_reverse',
      ),
    ).rejects.toThrow(
      'Payroll run is already included in a CRA remittance and cannot be reversed',
    );
    expect(journal.createPayrollRunReversalJournalInTx).not.toHaveBeenCalled();
  });

  it('blocks reversal when a later finalized Payroll run exists', async () => {
    const { service, tx, journal } = makeService();
    tx.payrollRun.findFirst.mockResolvedValue({
      runStableId: 'payroll_run_later',
    });

    await expect(
      service.reverseRun(
        'payroll_run_1',
        { reason: 'Incorrect regular hours' },
        'actor_reverse',
      ),
    ).rejects.toThrow(
      'Cannot reverse this run after a later Payroll run has been finalized',
    );
    expect(journal.createPayrollRunReversalJournalInTx).not.toHaveBeenCalled();
  });

  it('replays the same REVERSED fact through the same Journal authority', async () => {
    const { service, setCurrent, tx, journal } = makeService();
    setCurrent({
      ...postedRun(),
      status: PayrollRunStatus.REVERSED,
      reversalJournalEntryStableId: 'journal_payroll_reversal_1',
      reversedByActorRef: 'actor_reverse',
      reversalReason: 'Incorrect regular hours',
      reversedAt: new Date('2026-09-18T22:00:00.000Z'),
    });

    const result = await service.reverseRun(
      'payroll_run_1',
      { reason: 'Incorrect regular hours' },
      'actor_retry',
    );

    expect(journal.createPayrollRunReversalJournalInTx).toHaveBeenCalledTimes(
      1,
    );
    expect(tx.payrollRun.update).not.toHaveBeenCalled();
    expect(tx.accountingAuditLog.create).not.toHaveBeenCalled();
    expect(result.status).toBe(PayrollRunStatus.REVERSED);
    expect(result.reversalJournalEntryStableId).toBe(
      'journal_payroll_reversal_1',
    );
  });

  it('rejects a changed reason on a REVERSED replay', async () => {
    const { service, setCurrent, journal } = makeService();
    setCurrent({
      ...postedRun(),
      status: PayrollRunStatus.REVERSED,
      reversalJournalEntryStableId: 'journal_payroll_reversal_1',
      reversedByActorRef: 'actor_reverse',
      reversalReason: 'Incorrect regular hours',
      reversedAt: new Date('2026-09-18T22:00:00.000Z'),
    });

    await expect(
      service.reverseRun(
        'payroll_run_1',
        { reason: 'Different reason' },
        'actor_retry',
      ),
    ).rejects.toThrow(
      'Payroll run is already reversed with a different reason',
    );
    expect(journal.createPayrollRunReversalJournalInTx).not.toHaveBeenCalled();
  });
});
