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
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(created),
      update: jest.fn().mockResolvedValue(anchored),
    },
    accountingProviderPayoutBankRowDecision: {
      findUnique: jest.fn(),
      update: jest.fn(),
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
    accountingProviderPayout: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
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
  const bankRowDecisions = {
    requireCurrentPostingDecision: jest.fn().mockResolvedValue({
      decision: 'READY_FOR_POSTING',
    }),
  };
  const service = new AccountingProviderPayoutService(
    prisma as never,
    journal as unknown as AccountingJournalService,
    period as unknown as AccountingPeriodService,
    bankRowDecisions as never,
  );
  return { service, tx, journal, prisma, bankRowDecisions };
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

const readyBankRowDecision = () => ({
  id: '22222222-2222-4222-8222-222222222222',
  decisionStableId: 'bankrow_0123456789abcdef0123456789abcdef',
  artifactId: '33333333-3333-4333-8333-333333333333',
  rowNumber: 10,
  rowFingerprint: 'fingerprint',
  storeStableId: '4750_Yonge_Street',
  destinationBankAccountStableId: 'account_primary_bank',
  occurredOn: new Date('2026-09-23T00:00:00.000Z'),
  amountCents: 120_000,
  description: 'UBER',
  providerHint: AccountingFinancialProvider.UBER_EATS,
  decision: 'READY_FOR_POSTING',
  matchedPayoutStableId: null as string | null,
  confirmedByActorRef: 'actor_reviewer',
  confirmedAt: new Date('2026-09-23T14:00:00.000Z'),
  createdAt: new Date('2026-09-23T14:00:00.000Z'),
  updatedAt: new Date('2026-09-23T14:00:00.000Z'),
});

describe('AccountingProviderPayoutService', () => {
  it('lists recent payouts as read-only Accounting history', async () => {
    const { service, prisma } = makeService();
    prisma.accountingProviderPayout.findMany.mockResolvedValue([
      {
        ...payoutRow(),
        journalEntryStableId: 'journal_provider_payout_1',
      },
    ]);

    const result = await service.listPayouts({
      provider: AccountingFinancialProvider.UBER_EATS,
      storeStableId: '4750_Yonge_Street',
      payoutStableId: ' payout_uber_20260923_1 ',
      limit: 50,
    });

    expect(prisma.accountingProviderPayout.findMany).toHaveBeenCalledWith({
      where: {
        provider: AccountingFinancialProvider.UBER_EATS,
        storeStableId: '4750_Yonge_Street',
        payoutStableId: 'payout_uber_20260923_1',
      },
      orderBy: [{ payoutDate: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });
    expect(result).toEqual([
      expect.objectContaining({
        payoutStableId: 'payout_uber_20260923_1',
        payoutDate: '2026-09-23',
        journalEntryStableId: 'journal_provider_payout_1',
      }),
    ]);
  });

  it('rejects payout history limits outside the bounded API contract', async () => {
    const { service } = makeService();

    await expect(service.listPayouts({ limit: 0 })).rejects.toThrow(
      'limit must be between 1 and 200',
    );
    await expect(service.listPayouts({ limit: 201 })).rejects.toThrow(
      'limit must be between 1 and 200',
    );
  });

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
      }) as unknown,
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
        }) as unknown,
      }),
      tx,
    );
    expect(tx.accountingProviderPayout.update).toHaveBeenCalledWith({
      where: { id: payoutRow().id },
      data: { journalEntryStableId: 'journal_provider_payout_1' },
    });
    expect(result.journalEntryStableId).toBe('journal_provider_payout_1');
  });

  it('atomically posts a READY bank row decision and binds it to one deterministic payout', async () => {
    const { service, tx, journal } = makeService();
    const decision = readyBankRowDecision();
    const deterministicPayoutStableId = `payout_${decision.decisionStableId}`;
    tx.accountingProviderPayoutBankRowDecision.findUnique.mockResolvedValue(
      decision,
    );
    tx.accountingProviderPayout.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...payoutRow(),
          ...data,
          id: payoutRow().id,
          payoutDate: new Date('2026-09-23T00:00:00.000Z'),
          createdAt: payoutRow().createdAt,
          updatedAt: payoutRow().updatedAt,
          journalEntryStableId: null,
        }),
    );
    tx.accountingProviderPayout.update.mockImplementation(
      ({ data }: { data: { journalEntryStableId: string } }) =>
        Promise.resolve({
          ...payoutRow(),
          payoutStableId: deterministicPayoutStableId,
          providerReference: null,
          journalEntryStableId: data.journalEntryStableId,
        }),
    );
    tx.accountingProviderPayoutBankRowDecision.update.mockResolvedValue({
      ...decision,
      decision: 'MATCH_EXISTING_PAYOUT',
      matchedPayoutStableId: deterministicPayoutStableId,
    });

    const result = await service.recordPayoutFromBankRowDecision(
      decision.decisionStableId,
      'actor_accounting',
    );

    expect(tx.accountingProviderPayout.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payoutStableId: deterministicPayoutStableId,
        provider: AccountingFinancialProvider.UBER_EATS,
        storeStableId: '4750_Yonge_Street',
        destinationBankAccountStableId: 'account_primary_bank',
        amountCents: 120_000,
        currency: 'CAD',
        providerReference: null,
      }) as unknown,
    });
    expect(journal.createProviderPayoutJournalInTx).toHaveBeenCalledTimes(1);
    expect(
      tx.accountingProviderPayoutBankRowDecision.update,
    ).toHaveBeenCalledWith({
      where: { id: decision.id },
      data: {
        decision: 'MATCH_EXISTING_PAYOUT',
        matchedPayoutStableId: deterministicPayoutStableId,
      },
    });
    expect(result.payoutStableId).toBe(deterministicPayoutStableId);
    expect(tx.accountingAuditLog.create).toHaveBeenCalledTimes(2);
  });

  it('fails closed when an exact payout appears after READY preflight and requires scope reconfirmation', async () => {
    const decision = readyBankRowDecision();
    const existing = {
      ...payoutRow(),
      payoutStableId: 'payout_manual_exact',
      providerReference: null,
      journalEntryStableId: 'journal_manual_exact',
    };
    const { service, tx, journal } = makeService();
    tx.accountingProviderPayoutBankRowDecision.findUnique.mockResolvedValue(
      decision,
    );
    tx.accountingProviderPayout.findMany.mockResolvedValue([existing]);
    tx.accountingJournalEntry.findUnique.mockResolvedValue({
      source: AccountingJournalSource.PAYMENT,
      sourceFactType: 'accounting.provider_payout.v1',
      sourceFactStableId: existing.payoutStableId,
      deletedAt: null,
    });

    await expect(
      service.recordPayoutFromBankRowDecision(
        decision.decisionStableId,
        'actor_accounting',
      ),
    ).rejects.toThrow(
      'now matches an existing canonical payout; reconfirm the settlement scope',
    );

    expect(tx.accountingProviderPayout.create).not.toHaveBeenCalled();
    expect(
      tx.accountingProviderPayoutBankRowDecision.update,
    ).not.toHaveBeenCalled();
    expect(journal.createProviderPayoutJournalInTx).not.toHaveBeenCalled();
  });

  it('fails closed when a READY bank row now has multiple exact canonical payouts', async () => {
    const decision = readyBankRowDecision();
    const { service, tx, journal } = makeService();
    tx.accountingProviderPayoutBankRowDecision.findUnique.mockResolvedValue(
      decision,
    );
    tx.accountingProviderPayout.findMany.mockResolvedValue([
      {
        ...payoutRow(),
        payoutStableId: 'payout_exact_1',
        providerReference: null,
        journalEntryStableId: 'journal_exact_1',
      },
      {
        ...payoutRow(),
        payoutStableId: 'payout_exact_2',
        providerReference: null,
        journalEntryStableId: 'journal_exact_2',
      },
    ]);
    tx.accountingJournalEntry.findUnique
      .mockResolvedValueOnce({
        source: AccountingJournalSource.PAYMENT,
        sourceFactType: 'accounting.provider_payout.v1',
        sourceFactStableId: 'payout_exact_1',
        deletedAt: null,
      })
      .mockResolvedValueOnce({
        source: AccountingJournalSource.PAYMENT,
        sourceFactType: 'accounting.provider_payout.v1',
        sourceFactStableId: 'payout_exact_2',
        deletedAt: null,
      });

    await expect(
      service.recordPayoutFromBankRowDecision(
        decision.decisionStableId,
        'actor_accounting',
      ),
    ).rejects.toThrow('multiple exact canonical payout matches');
    expect(tx.accountingProviderPayout.create).not.toHaveBeenCalled();
    expect(
      tx.accountingProviderPayoutBankRowDecision.update,
    ).not.toHaveBeenCalled();
    expect(journal.createProviderPayoutJournalInTx).not.toHaveBeenCalled();
  });

  it('replays an already matched bank row without creating another payout or Journal', async () => {
    const decision = {
      ...readyBankRowDecision(),
      decision: 'MATCH_EXISTING_PAYOUT',
      matchedPayoutStableId: 'payout_existing_bankrow',
    };
    const existing = {
      ...payoutRow(),
      payoutStableId: 'payout_existing_bankrow',
      journalEntryStableId: 'journal_provider_payout_1',
    };
    const { service, tx, journal } = makeService(existing);
    tx.accountingProviderPayoutBankRowDecision.findUnique.mockResolvedValue(
      decision,
    );
    tx.accountingJournalEntry.findUnique.mockResolvedValue({
      source: AccountingJournalSource.PAYMENT,
      sourceFactType: 'accounting.provider_payout.v1',
      sourceFactStableId: 'payout_existing_bankrow',
      deletedAt: null,
    });

    const result = await service.recordPayoutFromBankRowDecision(
      decision.decisionStableId,
      'actor_retry',
    );

    expect(result.payoutStableId).toBe('payout_existing_bankrow');
    expect(tx.accountingProviderPayout.create).not.toHaveBeenCalled();
    expect(
      tx.accountingProviderPayoutBankRowDecision.update,
    ).not.toHaveBeenCalled();
    expect(journal.createProviderPayoutJournalInTx).not.toHaveBeenCalled();
  });

  it('fails closed when a bank row decision is not READY or MATCHED', async () => {
    const { service, tx, journal } = makeService();
    tx.accountingProviderPayoutBankRowDecision.findUnique.mockResolvedValue({
      ...readyBankRowDecision(),
      decision: 'EXCLUDED',
    });

    await expect(
      service.recordPayoutFromBankRowDecision(
        readyBankRowDecision().decisionStableId,
        'actor_accounting',
      ),
    ).rejects.toThrow('not ready for provider payout posting');
    expect(tx.accountingProviderPayout.create).not.toHaveBeenCalled();
    expect(journal.createProviderPayoutJournalInTx).not.toHaveBeenCalled();
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
