import { AccountingAccountClass } from '../accounting-contracts';
import { AccountingChartService } from '../accounting-chart.service';
import { AccountingJournalService } from '../accounting-journal.service';
import { AccountingPayrollPostingService } from './accounting-payroll-posting.service';
import {
  PAYROLL_ACCOUNT_IDS,
  type PayrollAccountFact,
} from './payroll-journal-write-authority';
import { PayrollRunStatus } from './payroll-contracts';
import { hashPayrollCalculationEvidence } from './payroll-calculation-evidence';

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

const runRow = (
  status: (typeof PayrollRunStatus)[keyof typeof PayrollRunStatus] = PayrollRunStatus.APPROVED,
) => {
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
    status,
    version: 4,
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
    postedJournalEntryStableId:
      status === PayrollRunStatus.POSTED ? 'journal_payroll_1' : null,
    postedAt:
      status === PayrollRunStatus.POSTED
        ? new Date('2026-09-18T13:05:00.000Z')
        : null,
    reversalJournalEntryStableId: null,
    reversedByActorRef: null,
    reversalReason: null,
    reversedAt: null,
    voidedAt: null,
    createdByActorRef: 'actor_1',
    updatedByActorRef: 'actor_approve',
    createdAt: new Date('2026-09-18T12:00:00.000Z'),
    updatedAt: new Date('2026-09-18T13:00:00.000Z'),
    employee: { employeeStableId: 'employee_1' },
    employer: { employerStableId: 'employer_1' },
    correctionOfRun: null,
  };
};

function makeService(status = PayrollRunStatus.APPROVED) {
  const existing = runRow(status);
  const tx = {
    payrollRun: {
      findUnique: jest.fn().mockResolvedValue(existing),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            ...existing,
            ...data,
            status: PayrollRunStatus.POSTED,
            postedJournalEntryStableId: 'journal_payroll_1',
            postedAt: new Date('2026-09-18T13:05:00.000Z'),
            version: existing.version + 1,
          }),
        ),
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
    createPayrollRunAccrualJournalInTx: jest
      .fn()
      .mockResolvedValue({ entryStableId: 'journal_payroll_1' }),
  };
  const service = new AccountingPayrollPostingService(
    prisma as never,
    chart as unknown as AccountingChartService,
    journal as unknown as AccountingJournalService,
  );
  return { service, tx, prisma, chart, journal };
}

describe('AccountingPayrollPostingService', () => {
  it('posts Journal and PayrollRun status in the same transaction callback', async () => {
    const { service, tx, journal } = makeService();

    const result = await service.postRunAccrual('payroll_run_1', 'actor_post');

    expect(journal.createPayrollRunAccrualJournalInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'payroll-run-accrual:payroll_run_1:v1',
        source: 'PAYROLL',
      }),
      'actor_post',
      expect.objectContaining({
        version: 1,
        role: 'RUN_ACCRUAL',
      }),
      tx,
    );
    expect(tx.payrollRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PayrollRunStatus.POSTED,
          postedJournalEntryStableId: 'journal_payroll_1',
          updatedByActorRef: 'actor_post',
        }) as unknown,
      }),
    );
    expect(tx.accountingAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PAYROLL_RUN_POST',
          entityType: 'PAYROLL_RUN',
          entityId: 'payroll_run_1',
          operatorActorRef: 'actor_post',
        }) as unknown,
      }),
    );
    expect(result.status).toBe(PayrollRunStatus.POSTED);
    expect(result.postedJournalEntryStableId).toBe('journal_payroll_1');
  });

  it('replays an already POSTED run through the same Journal idempotency authority', async () => {
    const { service, tx, journal } = makeService(PayrollRunStatus.POSTED);

    const result = await service.postRunAccrual('payroll_run_1', 'actor_post');

    expect(journal.createPayrollRunAccrualJournalInTx).toHaveBeenCalledTimes(1);
    expect(tx.payrollRun.update).not.toHaveBeenCalled();
    expect(tx.accountingAuditLog.create).not.toHaveBeenCalled();
    expect(result.status).toBe(PayrollRunStatus.POSTED);
    expect(result.postedJournalEntryStableId).toBe('journal_payroll_1');
  });

  it('fails closed before Journal mutation when Payroll CoA is incomplete', async () => {
    const { service, chart, journal } = makeService();
    chart.readAccountingAccountFacts.mockResolvedValue(
      accounts().filter(
        (item) => item.accountStableId !== PAYROLL_ACCOUNT_IDS.netPayPayable,
      ),
    );

    await expect(
      service.postRunAccrual('payroll_run_1', 'actor_post'),
    ).rejects.toThrow(
      'Payroll account prerequisite is not READY: account_payroll_net_pay_payable',
    );
    expect(journal.createPayrollRunAccrualJournalInTx).not.toHaveBeenCalled();
  });
});
