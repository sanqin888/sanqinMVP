import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingPeriodService } from './accounting-period.service';
import {
  buildPayrollEmployeePaymentWritePlan,
  PAYROLL_NET_PAY_PAYABLE_ACCOUNT_STABLE_ID,
  type PayrollEmployeePaymentAccountFact,
  type PayrollEmployeePaymentFactV1,
} from './payroll/payroll-employee-payment-journal-authority';

const fact = (): PayrollEmployeePaymentFactV1 => ({
  paymentStableId: 'payroll_payment_1',
  runStableId: 'payroll_run_1',
  calculationHash: 'sha256:' + 'a'.repeat(64),
  postedAccrualJournalEntryStableId: 'journal_payroll_accrual_1',
  storeStableId: '4750_Yonge_Street',
  paymentDate: '2026-09-18',
  paymentAccountStableId: 'account_primary_bank',
  amountCents: 130_000,
});

const facts = (): PayrollEmployeePaymentAccountFact[] => [
  {
    accountStableId: PAYROLL_NET_PAY_PAYABLE_ACCOUNT_STABLE_ID,
    accountClass: AccountingAccountClass.LIABILITY,
    accountType: null,
    currency: 'CAD',
    isActive: true,
  },
  {
    accountStableId: 'account_primary_bank',
    accountClass: AccountingAccountClass.ASSET,
    accountType: AccountingAccountType.BANK,
    currency: 'CAD',
    isActive: true,
  },
];

function makeService() {
  const paymentFact = fact();
  const accountFacts = facts();
  const plan = buildPayrollEmployeePaymentWritePlan({
    fact: paymentFact,
    accountFacts,
  });
  const accountRows = accountFacts.map((account, index) => ({
    id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, '0')}`,
    accountStableId: account.accountStableId,
    accountClass: account.accountClass,
    type: account.accountType,
    currency: account.currency,
    isActive: account.isActive,
  }));
  const paymentAuthority = {
    paymentAccountStableId: paymentFact.paymentAccountStableId,
    amountCents: paymentFact.amountCents,
    currency: 'CAD',
    paymentDate: new Date(paymentFact.paymentDate + 'T00:00:00.000Z'),
    journalEntryStableId: null,
    run: {
      runStableId: paymentFact.runStableId,
      status: 'POSTED',
      calculationHash: paymentFact.calculationHash,
      postedJournalEntryStableId:
        paymentFact.postedAccrualJournalEntryStableId,
      storeStableId: paymentFact.storeStableId,
      netPayCents: paymentFact.amountCents,
    },
  };
  const tx = {
    payrollEmployeePayment: {
      findUnique: jest.fn().mockResolvedValue(paymentAuthority),
    },
    accountingAccount: {
      findMany: jest.fn().mockResolvedValue(accountRows),
    },
    accountingJournalEntry: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({
          source: AccountingJournalSource.PAYROLL,
          sourceFactType: 'payroll.run.accrual.v1',
          sourceFactStableId: 'payroll_run_1',
          deletedAt: null,
        })
        .mockResolvedValueOnce(null),
      create: jest.fn().mockResolvedValue({
        entryStableId: 'journal_payroll_payment_1',
        idempotencyKey: 'payroll-employee-payment:payroll_payment_1:v1',
        kind: AccountingJournalEntryKind.STANDARD,
        source: AccountingJournalSource.PAYROLL,
        sourceFactType: 'payroll.employee-payment.v1',
        sourceFactStableId: 'payroll_payment_1',
        sourceFactVersion: 1,
        storeStableId: paymentFact.storeStableId,
        occurredAt: new Date('2026-09-18T00:00:00.000Z'),
        currency: 'CAD',
        memo: 'Payroll employee payment payroll_run_1',
        createdByActorRef: 'actor_pay',
        updatedByActorRef: 'actor_pay',
        createdAt: new Date('2026-09-18T14:00:00.000Z'),
        updatedAt: new Date('2026-09-18T14:00:00.000Z'),
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
  return { service, tx, plan, paymentAuthority };
}

describe('AccountingJournalService Payroll employee payment authority', () => {
  it('revalidates the settlement fact and account authority before writing', async () => {
    const { service, tx, plan } = makeService();

    const result = await service.createPayrollEmployeePaymentJournalInTx(
      plan.journal,
      'actor_pay',
      plan.authority,
      tx as never,
    );

    expect(result.entryStableId).toBe('journal_payroll_payment_1');
    expect(tx.payrollEmployeePayment.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { paymentStableId: 'payroll_payment_1' },
      }),
    );
    expect(tx.accountingJournalEntry.create).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the settlement amount changes before Journal write', async () => {
    const { service, tx, plan, paymentAuthority } = makeService();
    tx.payrollEmployeePayment.findUnique.mockResolvedValue({
      ...paymentAuthority,
      amountCents: 129_999,
    });

    await expect(
      service.createPayrollEmployeePaymentJournalInTx(
        plan.journal,
        'actor_pay',
        plan.authority,
        tx as never,
      ),
    ).rejects.toThrow(
      'Payroll employee payment authority changed before Journal posting',
    );
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('fails closed when the referenced accrual Journal is no longer active', async () => {
    const { service, tx, plan } = makeService();
    tx.accountingJournalEntry.findUnique.mockReset().mockResolvedValueOnce({
      source: AccountingJournalSource.PAYROLL,
      sourceFactType: 'payroll.run.accrual.v1',
      sourceFactStableId: 'payroll_run_1',
      deletedAt: new Date('2026-09-18T14:10:00.000Z'),
    });

    await expect(
      service.createPayrollEmployeePaymentJournalInTx(
        plan.journal,
        'actor_pay',
        plan.authority,
        tx as never,
      ),
    ).rejects.toThrow(
      'Payroll accrual Journal authority is not active for employee payment',
    );
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('fails closed when the selected bank account changes before write', async () => {
    const { service, tx, plan } = makeService();
    tx.accountingAccount.findMany.mockResolvedValue(
      facts().map((account, index) => ({
        id: `66666666-6666-4666-8666-${String(index + 1).padStart(12, '0')}`,
        accountStableId: account.accountStableId,
        accountClass: account.accountClass,
        type: account.accountType,
        currency: account.currency,
        isActive:
          account.accountStableId === 'account_primary_bank'
            ? false
            : account.isActive,
      })),
    );

    await expect(
      service.createPayrollEmployeePaymentJournalInTx(
        plan.journal,
        'actor_pay',
        plan.authority,
        tx as never,
      ),
    ).rejects.toThrow(
      'Payroll employee payment account authority changed before posting: account_primary_bank',
    );
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
  });
});
