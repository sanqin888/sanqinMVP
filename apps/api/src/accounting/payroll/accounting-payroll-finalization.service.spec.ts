import { ConflictException } from '@nestjs/common';
import { AccountingPayrollFinalizationService } from './accounting-payroll-finalization.service';
import { emptyPayrollYtd } from './payroll-ytd';
import { PayrollRunStatus } from './payroll-contracts';
import { hashPayrollCalculationEvidence } from './payroll-calculation-evidence';
import * as calculationModule from './payroll-run-calculation';

const runRow = (status: PayrollRunStatus) => {
  const calculationInputJson = {
    payDate: '2026-09-18T00:00:00.000Z',
    ytd: emptyPayrollYtd(),
  };
  const calculationOutputJson = { ytdAfter: emptyPayrollYtd() };
  const calculationHash = hashPayrollCalculationEvidence({
    calculationEvidenceVersion: 1,
    employeeConfigStableId: 'employee_config_1',
    employerConfigStableId: 'employer_config_1',
    input: calculationInputJson,
    output: calculationOutputJson,
  });

  return {
    id: 'run-db-id',
    runStableId: 'run_stable_1',
    employerId: 'employer-db-id',
    employeeId: 'employee-db-id',
    employeeConfigStableId: 'employee_config_1',
    employerConfigStableId: 'employer_config_1',
    correctionOfRunId: null,
    correctionSequence: 0,
    status,
    version: 2,
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
    ytdBeforeJson: emptyPayrollYtd(),
    ytdAfterJson: emptyPayrollYtd(),
    payStatementTemplateVersion: null,
    approvedByActorRef: null,
    approvedAt: null,
    postedJournalEntryStableId: null,
    postedAt: null,
    reversalJournalEntryStableId: null,
    reversedByActorRef: null,
    reversalReason: null,
    reversedAt: null,
    voidedAt: null,
    createdByActorRef: 'actor_1',
    updatedByActorRef: 'actor_1',
    createdAt: new Date('2026-09-18T12:00:00.000Z'),
    updatedAt: new Date('2026-09-18T12:00:00.000Z'),
    employee: { employeeStableId: 'employee_stable_1' },
    employer: { employerStableId: 'employer_stable_1' },
  };
};

const makeService = () => {
  const tx = {
    payrollRun: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    accountingAuditLog: { create: jest.fn() },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };
  const ytd = {
    deriveForEmployeeId: jest.fn().mockResolvedValue(emptyPayrollYtd()),
  };
  return {
    service: new AccountingPayrollFinalizationService(
      prisma as never,
      ytd as never,
    ),
    tx,
    ytd,
  };
};

describe('Accounting Payroll finalization lifecycle', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects approval when current canonical inputs rebuild to a different hash', async () => {
    const { service, tx } = makeService();
    const existing = runRow(PayrollRunStatus.CALCULATED);
    tx.payrollRun.findUnique.mockResolvedValue(existing);

    jest
      .spyOn(calculationModule, 'buildPayrollRunCalculation')
      .mockResolvedValue({
        ok: true,
        calculation: {
          employeeConfigStableId: 'employee_config_1',
          employerConfigStableId: 'employer_config_1',
          input: {
            provinceOfEmployment: 'ON',
            calculationProfileVersion: 'ON_HOURLY_SIMPLE_V1',
            payDate: existing.payDate,
            payFrequency: 'BIWEEKLY',
            payPeriodsPerYear: 26,
            regularMinutes: 4_800,
            regularHourlyRateCents: 2_000,
            overtimeMinutes: 0,
            overtimeHourlyRateCents: 0,
            vacationTopUpCents: 0,
            federalTd1Mode: 'NO_FORM_DEFAULT',
            federalTd1TotalClaimCents: null,
            ontarioTd1Mode: 'NO_FORM_DEFAULT',
            ontarioTd1TotalClaimCents: null,
            incomeTaxTreatment: 'STANDARD',
            additionalTaxPerPayCents: 0,
            cppTreatment: 'STANDARD',
            eiTreatment: 'INSURABLE',
            eiEmployerMultiplierMicros: 1_400_000,
            vacationTreatment: 'ACCRUED',
            vacationRateBasisPoints: 400,
            ytd: emptyPayrollYtd(),
          },
          output: existing.calculationOutputJson as never,
          calculationHash: 'sha256:stale-different-hash',
        },
      });

    await expect(
      service.approveRun(existing.runStableId, 'actor_2'),
    ).rejects.toThrow(ConflictException);
    expect(tx.payrollRun.update).not.toHaveBeenCalled();
  });

  it('freezes the pay-statement template version when approval succeeds', async () => {
    const { service, tx } = makeService();
    const existing = runRow(PayrollRunStatus.CALCULATED);
    tx.payrollRun.findUnique.mockResolvedValue(existing);
    tx.payrollRun.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...existing,
        ...data,
        status: PayrollRunStatus.APPROVED,
        approvedAt: new Date('2026-09-18T13:00:00.000Z'),
        employee: existing.employee,
        employer: existing.employer,
      }),
    );

    jest
      .spyOn(calculationModule, 'buildPayrollRunCalculation')
      .mockResolvedValue({
        ok: true,
        calculation: {
          employeeConfigStableId: 'employee_config_1',
          employerConfigStableId: 'employer_config_1',
          input: existing.calculationInputJson as never,
          output: existing.calculationOutputJson as never,
          calculationHash: existing.calculationHash,
        },
      });

    await service.approveRun(existing.runStableId, 'actor_2');

    expect(tx.payrollRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PayrollRunStatus.APPROVED,
          payStatementTemplateVersion: 'PAY_STATEMENT_V1',
        }) as unknown,
      }),
    );
  });

  it('blocks voiding an approved run once a later finalized run exists', async () => {
    const { service, tx } = makeService();
    const existing = runRow(PayrollRunStatus.APPROVED);
    tx.payrollRun.findUnique.mockResolvedValue(existing);
    tx.payrollRun.findFirst.mockResolvedValue({
      runStableId: 'run_stable_later',
    });

    await expect(
      service.voidRun(existing.runStableId, 'actor_2'),
    ).rejects.toThrow(
      'Cannot void this run after a later Payroll run has been finalized',
    );
    expect(tx.payrollRun.update).not.toHaveBeenCalled();
  });
});
