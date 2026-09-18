import {
  AccountingAccountClass,
  AccountingAccountType,
} from '../accounting-contracts';
import { AccountingJournalService } from '../accounting-journal.service';
import { AccountingPayrollEmployeePaymentService } from './accounting-payroll-employee-payment.service';
import { PAYROLL_NET_PAY_PAYABLE_ACCOUNT_STABLE_ID } from './payroll-employee-payment-journal-authority';
import { PayrollRunStatus } from './payroll-contracts';

const run = () => ({
  id: '11111111-1111-4111-8111-111111111111',
  runStableId: 'payroll_run_1',
  status: PayrollRunStatus.POSTED,
  calculationHash: 'sha256:' + 'a'.repeat(64),
  postedJournalEntryStableId: 'journal_payroll_accrual_1',
  postedAt: new Date('2026-09-18T13:05:00.000Z'),
  storeStableId: '4750_Yonge_Street',
  payDate: new Date('2026-09-18T00:00:00.000Z'),
  netPayCents: 130_000,
});

const createdPayment = () => ({
  id: '22222222-2222-4222-8222-222222222222',
  paymentStableId: 'payroll_payment_1',
  runId: run().id,
  paymentAccountStableId: 'account_primary_bank',
  amountCents: 130_000,
  currency: 'CAD',
  paymentDate: new Date('2026-09-18T00:00:00.000Z'),
  reference: 'EFT 1001',
  journalEntryStableId: null,
  createdByActorRef: 'actor_pay',
  createdAt: new Date('2026-09-18T14:00:00.000Z'),
  run: { runStableId: 'payroll_run_1' },
});

function makeService(
  existingPayment: ReturnType<typeof createdPayment> | null = null,
) {
  const runRow = run();
  const created = createdPayment();
  const tx = {
    payrollRun: {
      findUnique: jest.fn().mockResolvedValue(runRow),
    },
    payrollEmployeePayment: {
      findUnique: jest.fn().mockResolvedValue(existingPayment),
      create: jest.fn().mockResolvedValue(created),
      update: jest.fn().mockResolvedValue({
        ...created,
        journalEntryStableId: 'journal_payroll_payment_1',
      }),
    },
    accountingAccount: {
      findMany: jest.fn().mockResolvedValue([
        {
          accountStableId: PAYROLL_NET_PAY_PAYABLE_ACCOUNT_STABLE_ID,
          accountClass: AccountingAccountClass.LIABILITY,
          type: null,
          currency: 'CAD',
          isActive: true,
        },
        {
          accountStableId: 'account_primary_bank',
          accountClass: AccountingAccountClass.ASSET,
          type: AccountingAccountType.BANK,
          currency: 'CAD',
          isActive: true,
        },
      ]),
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
  const journal = {
    createPayrollEmployeePaymentJournalInTx: jest
      .fn()
      .mockResolvedValue({ entryStableId: 'journal_payroll_payment_1' }),
  };
  const service = new AccountingPayrollEmployeePaymentService(
    prisma as never,
    journal as unknown as AccountingJournalService,
  );
  return { service, tx, journal, runRow };
}

describe('AccountingPayrollEmployeePaymentService', () => {
  it('settles exactly the frozen net pay and binds the Journal in one transaction', async () => {
    const { service, tx, journal } = makeService();

    const result = await service.settleRun(
      'payroll_run_1',
      {
        paymentAccountStableId: 'account_primary_bank',
        paymentDate: '2026-09-18',
        reference: 'EFT 1001',
      },
      'actor_pay',
    );

    expect(tx.payrollEmployeePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runId: run().id,
          paymentAccountStableId: 'account_primary_bank',
          amountCents: 130_000,
          currency: 'CAD',
          reference: 'EFT 1001',
        }) as unknown,
      }),
    );
    expect(
      journal.createPayrollEmployeePaymentJournalInTx,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceFactType: 'payroll.employee-payment.v1',
        sourceFactStableId: 'payroll_payment_1',
        lines: expect.arrayContaining([
          expect.objectContaining({
            accountStableId: PAYROLL_NET_PAY_PAYABLE_ACCOUNT_STABLE_ID,
            debitCents: 130_000,
          }),
          expect.objectContaining({
            accountStableId: 'account_primary_bank',
            creditCents: 130_000,
          }),
        ]) as unknown,
      }),
      'actor_pay',
      expect.objectContaining({ version: 1, role: 'EMPLOYEE_PAYMENT' }),
      tx,
    );
    expect(tx.payrollEmployeePayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { journalEntryStableId: 'journal_payroll_payment_1' },
      }),
    );
    expect(result.amountCents).toBe(130_000);
    expect(result.journalEntryStableId).toBe('journal_payroll_payment_1');
  });

  it('replays an identical existing settlement without creating another Journal', async () => {
    const existing = {
      ...createdPayment(),
      journalEntryStableId: 'journal_payroll_payment_1',
    };
    const { service, tx, journal } = makeService(existing);

    const result = await service.settleRun(
      'payroll_run_1',
      {
        paymentAccountStableId: 'account_primary_bank',
        paymentDate: '2026-09-18',
        reference: 'EFT 1001',
      },
      'actor_pay',
    );

    expect(result.paymentStableId).toBe('payroll_payment_1');
    expect(tx.payrollEmployeePayment.create).not.toHaveBeenCalled();
    expect(tx.payrollEmployeePayment.update).not.toHaveBeenCalled();
    expect(
      journal.createPayrollEmployeePaymentJournalInTx,
    ).not.toHaveBeenCalled();
  });

  it('fails closed when a replay changes the selected payment account', async () => {
    const existing = {
      ...createdPayment(),
      journalEntryStableId: 'journal_payroll_payment_1',
    };
    const { service, journal } = makeService(existing);

    await expect(
      service.settleRun(
        'payroll_run_1',
        {
          paymentAccountStableId: 'account_store_cash',
          paymentDate: '2026-09-18',
          reference: 'EFT 1001',
        },
        'actor_pay',
      ),
    ).rejects.toThrow(
      'Payroll run already has a different employee payment settlement',
    );
    expect(
      journal.createPayrollEmployeePaymentJournalInTx,
    ).not.toHaveBeenCalled();
  });

  it('requires POSTED accrual authority and a payment date on or after pay date', async () => {
    const first = makeService();
    first.tx.payrollRun.findUnique.mockResolvedValue({
      ...first.runRow,
      status: PayrollRunStatus.APPROVED,
    });
    await expect(
      first.service.settleRun(
        'payroll_run_1',
        {
          paymentAccountStableId: 'account_primary_bank',
          paymentDate: '2026-09-18',
        },
        'actor_pay',
      ),
    ).rejects.toThrow('Employee payment requires a POSTED Payroll run');

    const second = makeService();
    await expect(
      second.service.settleRun(
        'payroll_run_1',
        {
          paymentAccountStableId: 'account_primary_bank',
          paymentDate: '2026-09-17',
        },
        'actor_pay',
      ),
    ).rejects.toThrow(
      'Employee payment date cannot be before the Payroll pay date',
    );
  });
});
