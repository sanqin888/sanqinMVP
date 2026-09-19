import { AccountingPayrollRunService } from './accounting-payroll-run.service';
import { PayrollRunStatus } from './payroll-contracts';

const parentRun = (
  status: (typeof PayrollRunStatus)[keyof typeof PayrollRunStatus] = PayrollRunStatus.REVERSED,
) => ({
  id: '11111111-1111-4111-8111-111111111111',
  runStableId: 'payroll_run_original',
  employerId: '22222222-2222-4222-8222-222222222222',
  employeeId: '33333333-3333-4333-8333-333333333333',
  employeeConfigStableId: 'employee_config_1',
  employerConfigStableId: 'employer_config_1',
  correctionOfRunId: null,
  correctionSequence: 0,
  status,
  version: 6,
  periodStart: new Date('2026-09-01T00:00:00.000Z'),
  periodEnd: new Date('2026-09-14T00:00:00.000Z'),
  payDate: new Date('2026-09-18T00:00:00.000Z'),
  storeStableId: '4750_Yonge_Street',
  statutoryPolicyVersion: 'CA-ON-2026-07',
  payPeriodsPerYear: 26,
  calculationProfileVersion: 'ON_HOURLY_SIMPLE_V1',
  regularMinutes: 4_800,
  regularHourlyRateCents: 2_000,
  overtimeMinutes: 120,
  overtimeHourlyRateCents: 3_000,
  vacationTopUpCents: 500,
  regularPayCents: 160_000,
  overtimePayCents: 6_000,
  vacationPayPaidCents: 500,
  vacationPayAccruedCents: 6_400,
  grossPayCents: 166_500,
  periodicTaxableEarningsCents: 166_000,
  nonPeriodicTaxableEarningsCents: 500,
  pensionableEarningsCents: 166_500,
  insurableEarningsCents: 166_500,
  incomeTaxCents: 20_000,
  employeeCppCents: 8_000,
  employeeCpp2Cents: 0,
  employeeEiCents: 2_000,
  employerCppCents: 8_000,
  employerCpp2Cents: 0,
  employerEiCents: 2_800,
  totalEmployeeDeductionsCents: 30_000,
  netPayCents: 136_500,
  craRemittanceCents: 40_800,
  compensationExpenseCents: 172_900,
  supportedEmployerPayrollCostCents: 183_700,
  calculationEvidenceVersion: 1,
  calculationInputJson: { version: 1 },
  calculationOutputJson: { version: 1 },
  calculationHash: 'sha256:' + 'a'.repeat(64),
  ytdBeforeJson: { grossEarningsYtdCents: 0 },
  ytdAfterJson: { grossEarningsYtdCents: 166_500 },
  payStatementTemplateVersion: 'PAY_STATEMENT_V1',
  approvedByActorRef: 'actor_approve',
  approvedAt: new Date('2026-09-18T13:00:00.000Z'),
  postedJournalEntryStableId: 'journal_accrual_1',
  postedAt: new Date('2026-09-18T13:05:00.000Z'),
  reversalJournalEntryStableId: 'journal_reversal_1',
  reversedByActorRef: 'actor_reverse',
  reversalReason: 'Incorrect hours',
  reversedAt: new Date('2026-09-18T14:00:00.000Z'),
  voidedAt: null,
  createdByActorRef: 'actor_create',
  updatedByActorRef: 'actor_reverse',
  createdAt: new Date('2026-09-18T12:00:00.000Z'),
  updatedAt: new Date('2026-09-18T14:00:00.000Z'),
  employee: { employeeStableId: 'employee_1' },
  employer: { employerStableId: 'employer_1' },
  correctionOfRun: null,
});

const correctionRun = () => {
  const parent = parentRun();
  return {
    ...parent,
    id: '44444444-4444-4444-8444-444444444444',
    runStableId: 'payroll_run_correction_1',
    employeeConfigStableId: null,
    employerConfigStableId: null,
    correctionOfRunId: parent.id,
    correctionSequence: 1,
    status: PayrollRunStatus.DRAFT,
    version: 1,
    statutoryPolicyVersion: null,
    payPeriodsPerYear: null,
    calculationProfileVersion: null,
    regularPayCents: null,
    overtimePayCents: null,
    vacationPayPaidCents: null,
    vacationPayAccruedCents: null,
    grossPayCents: null,
    periodicTaxableEarningsCents: null,
    nonPeriodicTaxableEarningsCents: null,
    pensionableEarningsCents: null,
    insurableEarningsCents: null,
    incomeTaxCents: null,
    employeeCppCents: null,
    employeeCpp2Cents: null,
    employeeEiCents: null,
    employerCppCents: null,
    employerCpp2Cents: null,
    employerEiCents: null,
    totalEmployeeDeductionsCents: null,
    netPayCents: null,
    craRemittanceCents: null,
    compensationExpenseCents: null,
    supportedEmployerPayrollCostCents: null,
    calculationEvidenceVersion: null,
    calculationInputJson: null,
    calculationOutputJson: null,
    calculationHash: null,
    ytdBeforeJson: null,
    ytdAfterJson: null,
    payStatementTemplateVersion: null,
    approvedByActorRef: null,
    approvedAt: null,
    postedJournalEntryStableId: null,
    postedAt: null,
    reversalJournalEntryStableId: null,
    reversedByActorRef: null,
    reversalReason: null,
    reversedAt: null,
    createdByActorRef: 'actor_correct',
    updatedByActorRef: 'actor_correct',
    createdAt: new Date('2026-09-18T14:05:00.000Z'),
    updatedAt: new Date('2026-09-18T14:05:00.000Z'),
    correctionOfRun: { runStableId: parent.runStableId },
  };
};

function makeService() {
  const tx = {
    payrollRun: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    payrollEmployee: {
      findUnique: jest.fn(),
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
  const service = new AccountingPayrollRunService(prisma as never);
  return { service, tx, prisma };
}

describe('AccountingPayrollRunService correction chain', () => {
  it('creates the next DRAFT as an immutable-identity child of the latest REVERSED predecessor', async () => {
    const { service, tx } = makeService();
    const parent = parentRun();
    const child = correctionRun();
    tx.payrollRun.findUnique.mockResolvedValue(parent);
    tx.payrollRun.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: parent.id,
      runStableId: parent.runStableId,
      correctionSequence: 0,
    });
    tx.payrollRun.create.mockResolvedValue(child);

    const result = await service.createCorrection(
      parent.runStableId,
      'actor_correct',
    );

    expect(tx.payrollRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employerId: parent.employerId,
          employeeId: parent.employeeId,
          correctionOfRunId: parent.id,
          correctionSequence: 1,
          periodStart: parent.periodStart,
          periodEnd: parent.periodEnd,
          payDate: parent.payDate,
          storeStableId: parent.storeStableId,
          regularMinutes: parent.regularMinutes,
          regularHourlyRateCents: parent.regularHourlyRateCents,
          overtimeMinutes: parent.overtimeMinutes,
          overtimeHourlyRateCents: parent.overtimeHourlyRateCents,
          vacationTopUpCents: parent.vacationTopUpCents,
          createdByActorRef: 'actor_correct',
          updatedByActorRef: 'actor_correct',
        }) as unknown,
      }),
    );
    expect(tx.accountingAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PAYROLL_RUN_CORRECTION_CREATE',
          entityType: 'PAYROLL_RUN',
          entityId: child.runStableId,
          operatorActorRef: 'actor_correct',
        }) as unknown,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        runStableId: child.runStableId,
        correctionOfRunStableId: parent.runStableId,
        correctionSequence: 1,
        status: PayrollRunStatus.DRAFT,
      }),
    );
  });

  it('replays an existing canonical direct child instead of branching the chain', async () => {
    const { service, tx } = makeService();
    const parent = parentRun();
    const child = correctionRun();
    tx.payrollRun.findUnique.mockResolvedValue(parent);
    tx.payrollRun.findFirst.mockResolvedValue(child);

    const result = await service.createCorrection(
      parent.runStableId,
      'actor_retry',
    );

    expect(tx.payrollRun.create).not.toHaveBeenCalled();
    expect(tx.accountingAuditLog.create).not.toHaveBeenCalled();
    expect(result.runStableId).toBe(child.runStableId);
    expect(result.correctionOfRunStableId).toBe(parent.runStableId);
  });

  it('rejects a correction from a non-REVERSED predecessor', async () => {
    const { service, tx } = makeService();
    tx.payrollRun.findUnique.mockResolvedValue(
      parentRun(PayrollRunStatus.POSTED),
    );

    await expect(
      service.createCorrection('payroll_run_original', 'actor_correct'),
    ).rejects.toThrow('Only REVERSED Payroll runs can create a correction');
    expect(tx.payrollRun.create).not.toHaveBeenCalled();
  });

  it('rejects a predecessor that is no longer the latest correction in the payroll fact chain', async () => {
    const { service, tx } = makeService();
    const parent = parentRun();
    tx.payrollRun.findUnique.mockResolvedValue(parent);
    tx.payrollRun.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: '55555555-5555-4555-8555-555555555555',
      runStableId: 'payroll_run_newer',
      correctionSequence: 1,
    });

    await expect(
      service.createCorrection(parent.runStableId, 'actor_correct'),
    ).rejects.toThrow(
      'Only the latest Payroll correction predecessor can create the next correction',
    );
    expect(tx.payrollRun.create).not.toHaveBeenCalled();
  });

  it('converges after a concurrent unique conflict when the winning child becomes visible', async () => {
    const { service, tx, prisma } = makeService();
    const parent = parentRun();
    const child = correctionRun();
    tx.payrollRun.findUnique.mockResolvedValue(parent);
    tx.payrollRun.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: parent.id,
        runStableId: parent.runStableId,
        correctionSequence: 0,
      })
      .mockResolvedValueOnce(child);
    tx.payrollRun.create.mockRejectedValueOnce({ code: 'P2002' });

    const result = await service.createCorrection(
      parent.runStableId,
      'actor_correct',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.payrollRun.create).toHaveBeenCalledTimes(1);
    expect(result.runStableId).toBe(child.runStableId);
  });

  it('freezes period/pay-date/store identity for correction drafts', async () => {
    const { service, tx } = makeService();
    const child = correctionRun();
    tx.payrollRun.findUnique.mockResolvedValue(child);

    await expect(
      service.updateDraft(
        child.runStableId,
        { payDate: '2026-09-19' },
        'actor_edit',
      ),
    ).rejects.toThrow('Payroll correction identity fields cannot be changed');
    expect(tx.payrollEmployee.findUnique).not.toHaveBeenCalled();
    expect(tx.payrollRun.update).not.toHaveBeenCalled();
  });

  it('allows correction input edits while preserving the correction identity', async () => {
    const { service, tx } = makeService();
    const child = correctionRun();
    const updated = {
      ...child,
      regularMinutes: 4_860,
      regularHourlyRateCents: 2_100,
      version: 2,
      updatedByActorRef: 'actor_edit',
      updatedAt: new Date('2026-09-18T14:10:00.000Z'),
    };
    tx.payrollRun.findUnique.mockResolvedValue(child);
    tx.payrollEmployee.findUnique.mockResolvedValue({
      employmentStartDate: new Date('2026-01-01T00:00:00.000Z'),
      employmentEndDate: null,
    });
    tx.payrollRun.update.mockResolvedValue(updated);

    const result = await service.updateDraft(
      child.runStableId,
      {
        regularMinutes: 4_860,
        regularHourlyRateCents: 2_100,
      },
      'actor_edit',
    );

    expect(tx.payrollRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          correctionSequence: 1,
          periodStart: child.periodStart,
          periodEnd: child.periodEnd,
          payDate: child.payDate,
          storeStableId: child.storeStableId,
          regularMinutes: 4_860,
          regularHourlyRateCents: 2_100,
          status: PayrollRunStatus.DRAFT,
          updatedByActorRef: 'actor_edit',
        }) as unknown,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        correctionOfRunStableId: 'payroll_run_original',
        correctionSequence: 1,
        regularMinutes: 4_860,
        regularHourlyRateCents: 2_100,
      }),
    );
  });
});
