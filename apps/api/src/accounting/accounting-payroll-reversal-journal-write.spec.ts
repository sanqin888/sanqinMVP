import {
  AccountingAccountClass,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingPeriodService } from './accounting-period.service';
import {
  buildPayrollRunReversalWritePlan,
  type PayrollRunReversalFactV1,
} from './payroll/payroll-reversal-journal-authority';
import {
  PAYROLL_ACCOUNT_IDS,
  type PayrollAccountFact,
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

const reversalFact = (): PayrollRunReversalFactV1 => ({
  runStableId: 'payroll_run_1',
  calculationHash: 'sha256:' + 'a'.repeat(64),
  approvedAt: '2026-09-18T13:00:00.000Z',
  postedAccrualJournalEntryStableId: 'journal_payroll_accrual_1',
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
  reversedAt: '2026-09-18T22:00:00.000Z',
  reversedByActorRef: 'actor_reverse',
  reversalReason: 'Incorrect regular hours',
});

function makeService() {
  const facts = accountFacts();
  const fact = reversalFact();
  const plan = buildPayrollRunReversalWritePlan({
    fact,
    accountFacts: facts,
  });
  const accountRows = facts.map((account, index) => ({
    id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, '0')}`,
    ...account,
  }));
  const runAuthority = {
    employeeId: '33333333-3333-4333-8333-333333333333',
    correctionSequence: 0,
    status: 'POSTED',
    calculationHash: fact.calculationHash,
    approvedAt: new Date(fact.approvedAt),
    postedJournalEntryStableId: fact.postedAccrualJournalEntryStableId,
    postedAt: new Date('2026-09-18T13:05:00.000Z'),
    reversalJournalEntryStableId: null,
    reversedByActorRef: fact.reversedByActorRef,
    reversalReason: fact.reversalReason,
    reversedAt: new Date(fact.reversedAt),
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
    employeePayment: null,
    craRemittanceEvidence: null,
  };
  const accrualJournal = {
    source: AccountingJournalSource.PAYROLL,
    sourceFactType: 'payroll.run.accrual.v1',
    sourceFactStableId: fact.runStableId,
    sourceFactVersion: 1,
    deletedAt: null,
  };
  const tx = {
    payrollRun: {
      findUnique: jest.fn().mockResolvedValue(runAuthority),
      findFirst: jest.fn().mockResolvedValue(null),
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
      findUnique: jest
        .fn()
        .mockResolvedValueOnce(accrualJournal)
        .mockResolvedValueOnce(null),
      create: jest.fn().mockResolvedValue({
        entryStableId: 'journal_payroll_reversal_1',
        idempotencyKey: 'payroll-run-reversal:payroll_run_1:v1',
        kind: AccountingJournalEntryKind.STANDARD,
        source: AccountingJournalSource.PAYROLL,
        sourceFactType: 'payroll.run.reversal.v1',
        sourceFactStableId: 'payroll_run_1',
        sourceFactVersion: 1,
        storeStableId: '4750_Yonge_Street',
        occurredAt: new Date('2026-06-30T00:00:00.000Z'),
        currency: 'CAD',
        memo: 'Payroll reversal payroll_run_1: Incorrect regular hours',
        createdByActorRef: 'actor_reverse',
        updatedByActorRef: 'actor_reverse',
        createdAt: new Date('2026-09-18T22:00:00.000Z'),
        updatedAt: new Date('2026-09-18T22:00:00.000Z'),
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

  return { service, tx, period, plan, runAuthority, accrualJournal };
}

describe('AccountingJournalService Payroll reversal authority', () => {
  it('re-reads the frozen run, accrual anchor and CoA before writing the inverse Journal', async () => {
    const { service, tx, period, plan } = makeService();

    const result = await service.createPayrollRunReversalJournalInTx(
      plan.journal,
      'actor_reverse',
      plan.authority,
      tx as never,
    );

    expect(result.entryStableId).toBe('journal_payroll_reversal_1');
    expect(tx.payrollRun.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { runStableId: 'payroll_run_1' } }),
    );
    expect(tx.payrollRun.findFirst).toHaveBeenCalledTimes(1);
    expect(period.assertJournalEditableForPeriod).toHaveBeenCalledWith(
      new Date('2026-06-30T00:00:00.000Z'),
      AccountingJournalEntryKind.STANDARD,
      tx,
      'America/Toronto',
    );
    expect(tx.accountingJournalEntry.create).toHaveBeenCalledTimes(1);
  });

  it('fails closed when employee settlement appears before Journal persistence', async () => {
    const { service, tx, plan, runAuthority } = makeService();
    tx.payrollRun.findUnique.mockResolvedValue({
      ...runAuthority,
      employeePayment: { paymentStableId: 'payroll_payment_1' },
    });

    await expect(
      service.createPayrollRunReversalJournalInTx(
        plan.journal,
        'actor_reverse',
        plan.authority,
        tx as never,
      ),
    ).rejects.toThrow(
      'Payroll reversal authority changed before Journal posting',
    );
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('fails closed when CRA remittance evidence appears before Journal persistence', async () => {
    const { service, tx, plan, runAuthority } = makeService();
    tx.payrollRun.findUnique.mockResolvedValue({
      ...runAuthority,
      craRemittanceEvidence: { id: 'cra_evidence_1' },
    });

    await expect(
      service.createPayrollRunReversalJournalInTx(
        plan.journal,
        'actor_reverse',
        plan.authority,
        tx as never,
      ),
    ).rejects.toThrow(
      'Payroll reversal authority changed before Journal posting',
    );
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('fails closed when a later finalized run appears before Journal persistence', async () => {
    const { service, tx, plan } = makeService();
    tx.payrollRun.findFirst.mockResolvedValue({
      runStableId: 'payroll_run_later',
    });

    await expect(
      service.createPayrollRunReversalJournalInTx(
        plan.journal,
        'actor_reverse',
        plan.authority,
        tx as never,
      ),
    ).rejects.toThrow(
      'Cannot reverse this run after a later Payroll run has been finalized',
    );
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('fails closed when the original accrual Journal is unavailable', async () => {
    const { service, tx, plan } = makeService();
    tx.accountingJournalEntry.findUnique.mockReset();
    tx.accountingJournalEntry.findUnique.mockResolvedValue(null);

    await expect(
      service.createPayrollRunReversalJournalInTx(
        plan.journal,
        'actor_reverse',
        plan.authority,
        tx as never,
      ),
    ).rejects.toThrow(
      'Payroll accrual Journal authority is not active for reversal',
    );
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('uses the original pay-date STANDARD period gate and does not bypass a closed month', async () => {
    const { service, tx, period, plan } = makeService();
    period.assertJournalEditableForPeriod.mockRejectedValue(
      new Error('month closed'),
    );

    await expect(
      service.createPayrollRunReversalJournalInTx(
        plan.journal,
        'actor_reverse',
        plan.authority,
        tx as never,
      ),
    ).rejects.toThrow('month closed');
    expect(period.assertJournalEditableForPeriod).toHaveBeenCalledWith(
      new Date('2026-06-30T00:00:00.000Z'),
      AccountingJournalEntryKind.STANDARD,
      tx,
      'America/Toronto',
    );
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
  });
});
