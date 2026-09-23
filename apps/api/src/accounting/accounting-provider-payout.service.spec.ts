import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingFinancialProvider,
  AccountingJournalSource,
} from './accounting-contracts';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingPeriodService } from './accounting-period.service';
import { AccountingProviderPayoutService } from './accounting-provider-payout.service';

const payoutRow = () => ({
  id: '11111111-1111-4111-8111-111111111111',
  payoutStableId: 'payout_uber_20260923_1',
  provider: AccountingFinancialProvider.UBER_EATS,
  storeStableId: '4750_Yonge_Street',
  payoutDate: new Date('2026-09-23T00:00:00.000Z'),
  destinationBankAccountStableId: 'account_primary_bank',
  amountCents: 120_000,
  currency: 'CAD',
  providerReference: 'UBER-2026-09-23',
  journalEntryStableId: null as string | null,
  createdByActorRef: 'actor_accounting',
  createdAt: new Date('2026-09-23T15:00:00.000Z'),
  updatedAt: new Date('2026-09-23T15:00:00.000Z'),
});

function makeService(existing: ReturnType<typeof payoutRow> | null = null) {
  const created = payoutRow();
  const anchored = {
    ...created,
    journalEntryStableId: 'journal_provider_payout_1',
    updatedAt: new Date('2026-09-23T15:00:01.000Z'),
  };
  const tx = {
    accountingProviderPayout: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockResolvedValue(created),
      update: jest.fn().mockResolvedValue(anchored),
    },
    accountingAccount: {
      findMany: jest.fn().mockResolvedValue([
        {
          accountStableId: 'account_uber_pending',
          accountClass: AccountingAccountClass.ASSET,
          type: AccountingAccountType.PLATFORM_WALLET,
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
    accountingJournalEntry: {
      findUnique: jest.fn().mockResolvedValue({
        source: AccountingJournalSource.PAYMENT,
        sourceFactType: 'accounting.provider_payout.v1',
        sourceFactStableId: 'payout_uber_20260923_1',
        deletedAt: null,
      }),
    },
    accountingAuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    ),
  };
  const journal = {
    createProviderPayoutJournalInTx: jest
      .fn()
      .mockResolvedValue({ entryStableId: 'journal_provider_payout_1' }),
  };
  const period = {
    getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
  };
  const service = new AccountingProviderPayoutService(
    prisma as never,
    journal as unknown as AccountingJournalService,
    period as unknown as AccountingPeriodService,
  );
  return { service, tx, journal };
}

const input = () => ({
  payoutStableId: 'payout_uber_20260923_1',
  provider: AccountingFinancialProvider.UBER_EATS,
  storeStableId: '4750_Yonge_Street',
  payoutDate: '2026-09-23',
  destinationBankAccountStableId: 'account_primary_bank',
  amountCents: 120_000,
  currency: 'CAD',
  providerReference: 'UBER-2026-09-23',
});

describe('AccountingProviderPayoutService', () => {
  it('persists the payout fact and binds its canonical Journal in one Accounting transaction', async () => {
    const { service, tx, journal } = makeService();

    const result = await service.recordPayout(input(), 'actor_accounting');

    expect(tx.accountingProviderPayout.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payoutStableId: 'payout_uber_20260923_1',
        provider: AccountingFinancialProvider.UBER_EATS,
        storeStableId: '4750_Yonge_Street',
        destinationBankAccountStableId: 'account_primary_bank',
        amountCents: 120_000,
        currency: 'CAD',
        providerReference: 'UBER-2026-09-23',
        createdByActorRef: 'actor_accounting',
      }),
    });
    expect(journal.createProviderPayoutJournalInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        source: AccountingJournalSource.PAYMENT,
        sourceFactType: 'accounting.provider_payout.v1',
        sourceFactStableId: 'payout_uber_20260923_1',
        lines: [
          expect.objectContaining({
            accountStableId: 'account_primary_bank',
            debitCents: 120_000,
          }),
          expect.objectContaining({
            accountStableId: 'account_uber_pending',
            creditCents: 120_000,
          }),
        ],
      }),
      'actor_accounting',
      expect.objectContaining({
        version: 1,
        role: 'PROVIDER_PAYOUT',
        fact: expect.objectContaining({
          providerReference: 'UBER-2026-09-23',
        }),
      }),
      tx,
    );
    expect(tx.accountingProviderPayout.update).toHaveBeenCalledWith({
      where: { id: payoutRow().id },
      data: { journalEntryStableId: 'journal_provider_payout_1' },
    });
    expect(result.journalEntryStableId).toBe('journal_provider_payout_1');
  });

  it('replays an identical anchored payout without creating another Journal', async () => {
    const existing = {
      ...payoutRow(),
      journalEntryStableId: 'journal_provider_payout_1',
    };
    const { service, tx, journal } = makeService(existing);

    const result = await service.recordPayout(input(), 'actor_retry');

    expect(result.payoutStableId).toBe('payout_uber_20260923_1');
    expect(result.journalEntryStableId).toBe('journal_provider_payout_1');
    expect(tx.accountingJournalEntry.findUnique).toHaveBeenCalledWith({
      where: { entryStableId: 'journal_provider_payout_1' },
      select: {
        source: true,
        sourceFactType: true,
        sourceFactStableId: true,
        deletedAt: true,
      },
    });
    expect(tx.accountingProviderPayout.create).not.toHaveBeenCalled();
    expect(tx.accountingProviderPayout.update).not.toHaveBeenCalled();
    expect(journal.createProviderPayoutJournalInTx).not.toHaveBeenCalled();
  });

  it('fails closed when the same payout stable ID is reused with different facts', async () => {
    const existing = {
      ...payoutRow(),
      journalEntryStableId: 'journal_provider_payout_1',
    };
    const { service, journal } = makeService(existing);

    await expect(
      service.recordPayout(
        {
          ...input(),
          amountCents: 120_001,
        },
        'actor_accounting',
      ),
    ).rejects.toThrow(
      'Provider payout stable ID already exists with different facts',
    );
    expect(journal.createProviderPayoutJournalInTx).not.toHaveBeenCalled();
  });

  it('does not require a monthly statement or a positive current pending balance to record real bank evidence', async () => {
    const { service, tx } = makeService();

    await expect(
      service.recordPayout(input(), 'actor_accounting'),
    ).resolves.toEqual(
      expect.objectContaining({
        payoutStableId: 'payout_uber_20260923_1',
        amountCents: 120_000,
      }),
    );

    expect(tx.accountingAccount.findMany).toHaveBeenCalled();
    expect(tx).not.toHaveProperty('accountingProviderFinancialDocument');
    expect(tx).not.toHaveProperty('accountingJournalLine');
  });
});
