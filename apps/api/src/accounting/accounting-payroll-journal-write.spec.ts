import {
  AccountingAccountClass,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingPeriodService } from './accounting-period.service';
import {
  buildPayrollRunAccrualWritePlan,
  PAYROLL_ACCOUNT_IDS,
  type PayrollAccountFact,
  type PayrollRunAccrualFactV1,
} from './payroll/payroll-journal-write-authority';

const accountFacts = (): PayrollAccountFact[] => [
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

const payrollFact = (): PayrollRunAccrualFactV1 => ({
  runStableId: 'payroll_run_1',
  calculationHash: 'sha256:' + 'a'.repeat(64),
  approvedAt: '2026-09-18T13:00:00.000Z',
  storeStableId: '4750_Yonge_Street',
  payDate: '2026-07-03',
  accrualDate: '2026-06-30',
  grossPayCents: 160_000,
  totalEmployeeDeductionsCents: 30_000,
  netPayCents: 130_000,
  incomeTaxCents: 20_000,
  employeeCppCents: 8_000,
  employeeCpp2Cents: 0,
  employeeEiCents: 2_000,
  employerCppCents: 8_000,
  employerCpp2Cents: 0,
  employerEiCents: 2_800,
  vacationPayAccruedCents: 6_400,
  compensationExpenseCents: 166_400,
  craRemittanceCents: 40_800,
  supportedEmployerPayrollCostCents: 177_200,
});

function makeService() {
  const facts = accountFacts();
  const fact = payrollFact();
  const plan = buildPayrollRunAccrualWritePlan({
    fact,
    accountFacts: facts,
  });
  const accountRows = facts.map((account, index) => ({
    id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, '0')}`,
    ...account,
  }));
  const runAuthority = {
    status: 'APPROVED',
    calculationHash: fact.calculationHash,
    approvedAt: new Date(fact.approvedAt),
    storeStableId: fact.storeStableId,
    payDate: new Date(fact.payDate + 'T00:00:00.000Z'),
    periodEnd: new Date(fact.accrualDate + 'T00:00:00.000Z'),
    grossPayCents: fact.grossPayCents,
    totalEmployeeDeductionsCents: fact.totalEmployeeDeductionsCents,
    netPayCents: fact.netPayCents,
    incomeTaxCents: fact.incomeTaxCents,
    employeeCppCents: fact.employeeCppCents,
    employeeCpp2Cents: fact.employeeCpp2Cents,
    employeeEiCents: fact.employeeEiCents,
    employerCppCents: fact.employerCppCents,
    employerCpp2Cents: fact.employerCpp2Cents,
    employerEiCents: fact.employerEiCents,
    vacationPayAccruedCents: fact.vacationPayAccruedCents,
    compensationExpenseCents: fact.compensationExpenseCents,
    craRemittanceCents: fact.craRemittanceCents,
    supportedEmployerPayrollCostCents: fact.supportedEmployerPayrollCostCents,
  };
  const tx = {
    payrollRun: {
      findUnique: jest.fn().mockResolvedValue(runAuthority),
    },
    accountingAccount: {
      findMany: jest.fn().mockResolvedValue(accountRows),
    },
    accountingCategory: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: '55555555-5555-4555-8555-555555555555',
          categoryStableId: 'expense_labor',
        },
      ]),
    },
    accountingJournalEntry: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        entryStableId: 'journal_payroll_1',
        idempotencyKey: 'payroll-run-accrual:payroll_run_1:v1',
        kind: AccountingJournalEntryKind.STANDARD,
        source: AccountingJournalSource.PAYROLL,
        sourceFactType: 'payroll.run.accrual.v1',
        sourceFactStableId: 'payroll_run_1',
        sourceFactVersion: 1,
        storeStableId: '4750_Yonge_Street',
        occurredAt: new Date('2026-06-30T00:00:00.000Z'),
        currency: 'CAD',
        memo: 'Payroll accrual payroll_run_1',
        createdByActorRef: 'actor_post',
        updatedByActorRef: 'actor_post',
        createdAt: new Date('2026-09-18T13:05:00.000Z'),
        updatedAt: new Date('2026-09-18T13:05:00.000Z'),
        version: 1,
        deletedAt: null,
        lines: [],
      }),
    },
    accountingAuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const period = {
    getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
    assertOnOrAfterAccountingStartDate: jest.fn().mockResolvedValue(undefined),
    assertJournalEditableForPeriod: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AccountingJournalService(
    {} as never,
    period as unknown as AccountingPeriodService,
  );
  return { service, tx, period, plan, runAuthority };
}

describe('AccountingJournalService Payroll accrual authority', () => {
  it('revalidates the frozen run and account authority before creating the Journal', async () => {
    const { service, tx, period, plan } = makeService();

    const result = await service.createPayrollRunAccrualJournalInTx(
      plan.journal,
      'actor_post',
      plan.authority,
      tx as never,
    );

    expect(result.entryStableId).toBe('journal_payroll_1');
    expect(tx.payrollRun.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { runStableId: 'payroll_run_1' } }),
    );
    expect(period.assertJournalEditableForPeriod).toHaveBeenCalledWith(
      new Date('2026-06-30T00:00:00.000Z'),
      AccountingJournalEntryKind.STANDARD,
      tx,
      'America/Toronto',
    );
    expect(tx.accountingJournalEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.accountingAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CREATE',
          entityType: 'ACCOUNTING_JOURNAL_ENTRY',
        }) as unknown,
      }),
    );
  });

  it('fails closed when the frozen Payroll calculation changes before write', async () => {
    const { service, tx, plan, runAuthority } = makeService();
    tx.payrollRun.findUnique.mockResolvedValue({
      ...runAuthority,
      calculationHash: 'sha256:' + 'b'.repeat(64),
    });

    await expect(
      service.createPayrollRunAccrualJournalInTx(
        plan.journal,
        'actor_post',
        plan.authority,
        tx as never,
      ),
    ).rejects.toThrow('Payroll run authority changed before Journal posting');
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('fails closed when an idempotent Payroll Journal replay is soft-deleted', async () => {
    const { service, tx, plan } = makeService();
    tx.accountingJournalEntry.create.mockResolvedValue({
      entryStableId: 'journal_payroll_1',
      idempotencyKey: 'payroll-run-accrual:payroll_run_1:v1',
      kind: AccountingJournalEntryKind.STANDARD,
      source: AccountingJournalSource.PAYROLL,
      sourceFactType: 'payroll.run.accrual.v1',
      sourceFactStableId: 'payroll_run_1',
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
      occurredAt: new Date('2026-06-30T00:00:00.000Z'),
      currency: 'CAD',
      memo: 'Payroll accrual payroll_run_1',
      createdByActorRef: 'actor_post',
      updatedByActorRef: 'actor_post',
      createdAt: new Date('2026-09-18T13:05:00.000Z'),
      updatedAt: new Date('2026-09-18T13:05:00.000Z'),
      version: 1,
      deletedAt: new Date('2026-09-18T13:10:00.000Z'),
      lines: [],
    });

    await expect(
      service.createPayrollRunAccrualJournalInTx(
        plan.journal,
        'actor_post',
        plan.authority,
        tx as never,
      ),
    ).rejects.toThrow(
      'Payroll accrual Journal was deleted and cannot be replayed',
    );
  });

  it('fails closed when a Payroll control account changes before write', async () => {
    const { service, tx, plan } = makeService();
    tx.accountingAccount.findMany.mockResolvedValue(
      accountFacts().map((account, index) => ({
        id: `66666666-6666-4666-8666-${String(index + 1).padStart(12, '0')}`,
        ...account,
        ...(account.accountStableId === PAYROLL_ACCOUNT_IDS.cppPayable
          ? { isActive: false }
          : {}),
      })),
    );

    await expect(
      service.createPayrollRunAccrualJournalInTx(
        plan.journal,
        'actor_post',
        plan.authority,
        tx as never,
      ),
    ).rejects.toThrow(
      'Payroll account authority changed before posting: account_payroll_cpp_payable',
    );
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
  });
});
