import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from '@prisma/client';
import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingFinancialProvider,
} from './accounting-contracts';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingPeriodService } from './accounting-period.service';
import { buildProviderPayoutWritePlan } from './accounting-provider-payout-journal-authority';

const basePayload = {
  idempotencyKey: 'journal:manual:1',
  kind: AccountingJournalEntryKind.STANDARD,
  source: AccountingJournalSource.MANUAL,
  occurredAt: '2026-09-12T14:00:00.000Z',
  currency: 'CAD',
  memo: 'Kitchen supply purchase',
  lines: [
    {
      accountStableId: 'account_general_operating_expense',
      categoryStableId: 'expense_kitchen_supplies',
      debitCents: 1250,
      creditCents: 0,
    },
    {
      accountStableId: 'account_store_cash',
      debitCents: 0,
      creditCents: 1250,
    },
  ],
};

describe('AccountingJournalService double-entry journal characterization', () => {
  const makeService = () => {
    const tx = {
      accountingAutomationConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      accountingPeriodClose: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      accountingJournalEntry: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      accountingJournalLine: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      accountingProviderFinancialReviewRevision: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      accountingProviderPayout: {
        findUnique: jest.fn(),
      },
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'account-expense-db-id',
            accountStableId: 'account_general_operating_expense',
            currency: 'CAD',
          },
          {
            id: 'account-cash-db-id',
            accountStableId: 'account_store_cash',
            currency: 'CAD',
          },
        ]),
      },
      accountingCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'category-db-id',
            categoryStableId: 'expense_kitchen_supplies',
          },
        ]),
      },
      accountingAuditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const transaction = jest.fn(
      (work: (transactionClient: typeof tx) => Promise<unknown>) => work(tx),
    );
    const prisma = { ...tx, $transaction: transaction };
    const brandStoreConfigReader = {
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
        timezone: 'America/Toronto',
      }),
    };
    const period = new AccountingPeriodService(
      prisma as never,
      brandStoreConfigReader as never,
    );
    const service = new AccountingJournalService(prisma as never, period);
    return { service, prisma };
  };

  const journalRow = (overrides: Record<string, unknown> = {}) => ({
    entryStableId: 'journal_stable_1',
    idempotencyKey: basePayload.idempotencyKey,
    kind: AccountingJournalEntryKind.STANDARD,
    source: AccountingJournalSource.MANUAL,
    sourceFactType: null,
    sourceFactStableId: null,
    sourceFactVersion: null,
    storeStableId: null,
    occurredAt: new Date(basePayload.occurredAt),
    currency: 'CAD',
    memo: basePayload.memo,
    createdByActorRef: 'user_stable_1',
    updatedByActorRef: 'user_stable_1',
    createdAt: new Date('2026-09-12T14:01:00.000Z'),
    updatedAt: new Date('2026-09-12T14:01:00.000Z'),
    version: 1,
    deletedAt: null,
    lines: [],
    ...overrides,
  });

  const internalJournalRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'journal-db-id',
    idempotencyHash: 'hash',
    ...journalRow(overrides),
  });

  it('reads canonical SALE Journal anchors by owner fact stable identity', async () => {
    const { service, prisma } = makeService();
    prisma.accountingJournalEntry.findMany.mockResolvedValue([
      {
        entryStableId: 'journal_sale_1',
        sourceFactStableId: 'sale_fact_1',
        idempotencyKey: 'canonical-sale:order_1:v1',
      },
    ]);

    await expect(
      service.readCanonicalSaleJournalAnchors([' sale_fact_1 ', 'sale_fact_1']),
    ).resolves.toEqual([
      {
        entryStableId: 'journal_sale_1',
        sourceFactStableId: 'sale_fact_1',
        idempotencyKey: 'canonical-sale:order_1:v1',
      },
    ]);
    expect(prisma.accountingJournalEntry.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        source: AccountingJournalSource.ORDER,
        sourceFactType: 'order.financial_sale.v1',
        sourceFactStableId: { in: ['sale_fact_1'] },
      },
      select: {
        entryStableId: true,
        idempotencyKey: true,
        sourceFactStableId: true,
      },
      orderBy: { entryStableId: 'asc' },
    });
  });

  it('fails closed when one canonical SALE fact has duplicate Journal anchors', async () => {
    const { service, prisma } = makeService();
    prisma.accountingJournalEntry.findMany.mockResolvedValue([
      {
        entryStableId: 'journal_sale_1',
        sourceFactStableId: 'sale_fact_1',
        idempotencyKey: 'canonical-sale:order_1:v1',
      },
      {
        entryStableId: 'journal_sale_duplicate',
        sourceFactStableId: 'sale_fact_1',
        idempotencyKey: 'manual-duplicate-anchor',
      },
    ]);

    await expect(
      service.readCanonicalSaleJournalAnchors(['sale_fact_1']),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a provider payout Journal only from its persisted payout authority', async () => {
    const { service, prisma } = makeService();
    const accountRows = [
      {
        id: 'account-bank-db-id',
        accountStableId: 'account_primary_bank',
        accountClass: AccountingAccountClass.ASSET,
        type: AccountingAccountType.BANK,
        currency: 'CAD',
        isActive: true,
      },
      {
        id: 'account-uber-db-id',
        accountStableId: 'account_uber_pending',
        accountClass: AccountingAccountClass.ASSET,
        type: AccountingAccountType.PLATFORM_WALLET,
        currency: 'CAD',
        isActive: true,
      },
    ];
    const plan = buildProviderPayoutWritePlan({
      fact: {
        payoutStableId: 'payout_uber_20260923_1',
        provider: AccountingFinancialProvider.UBER_EATS,
        storeStableId: '4750_Yonge_Street',
        payoutDate: '2026-09-23',
        destinationBankAccountStableId: 'account_primary_bank',
        amountCents: 120_000,
        currency: 'CAD',
        providerReference: 'UBER-2026-09-23',
      },
      businessTimezone: 'America/Toronto',
      accountFacts: accountRows.map((account) => ({
        accountStableId: account.accountStableId,
        accountClass: account.accountClass,
        accountType: account.type,
        currency: account.currency,
        isActive: account.isActive,
      })),
    });
    prisma.accountingProviderPayout.findUnique.mockResolvedValue({
      provider: AccountingFinancialProvider.UBER_EATS,
      storeStableId: '4750_Yonge_Street',
      payoutDate: new Date('2026-09-23T00:00:00.000Z'),
      destinationBankAccountStableId: 'account_primary_bank',
      amountCents: 120_000,
      currency: 'CAD',
      providerReference: 'UBER-2026-09-23',
      journalEntryStableId: null,
    });
    prisma.accountingAccount.findMany.mockResolvedValue(accountRows);
    prisma.accountingJournalEntry.findUnique.mockResolvedValue(null);
    prisma.accountingJournalEntry.create.mockResolvedValue(
      journalRow({
        entryStableId: 'journal_provider_payout_1',
        idempotencyKey: plan.journal.idempotencyKey,
        kind: AccountingJournalEntryKind.TRANSFER,
        source: AccountingJournalSource.PAYMENT,
        sourceFactType: 'accounting.provider_payout.v1',
        sourceFactStableId: 'payout_uber_20260923_1',
        sourceFactVersion: 1,
        storeStableId: '4750_Yonge_Street',
        occurredAt: new Date('2026-09-23T04:00:00.000Z'),
        memo: 'UBER_EATS payout UBER-2026-09-23',
      }),
    );

    await expect(
      service.createProviderPayoutJournalInTx(
        plan.journal,
        'actor_accounting',
        plan.authority,
        prisma as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        entryStableId: 'journal_provider_payout_1',
        sourceFactStableId: 'payout_uber_20260923_1',
      }),
    );
    expect(prisma.accountingJournalEntry.create).toHaveBeenCalled();
  });

  it('rejects provider payout facts through the generic Journal writer', async () => {
    const { service } = makeService();
    const plan = buildProviderPayoutWritePlan({
      fact: {
        payoutStableId: 'payout_uber_20260923_1',
        provider: AccountingFinancialProvider.UBER_EATS,
        storeStableId: '4750_Yonge_Street',
        payoutDate: '2026-09-23',
        destinationBankAccountStableId: 'account_primary_bank',
        amountCents: 120_000,
        currency: 'CAD',
        providerReference: null,
      },
      businessTimezone: 'America/Toronto',
      accountFacts: [
        {
          accountStableId: 'account_primary_bank',
          accountClass: AccountingAccountClass.ASSET,
          accountType: AccountingAccountType.BANK,
          currency: 'CAD',
          isActive: true,
        },
        {
          accountStableId: 'account_uber_pending',
          accountClass: AccountingAccountClass.ASSET,
          accountType: AccountingAccountType.PLATFORM_WALLET,
          currency: 'CAD',
          isActive: true,
        },
      ],
    });

    await expect(
      service.createJournalEntry(plan.journal, 'actor_accounting'),
    ).rejects.toThrow(
      'canonical provider payout Journals require payout-specific write authority',
    );
  });

  it('rejects converting a generic Journal into provider payout authority', async () => {
    const existing = internalJournalRow();
    const { service, prisma } = makeService();
    prisma.accountingJournalEntry.findUnique.mockResolvedValue(existing);

    await expect(
      service.updateJournalEntry(
        'journal_stable_1',
        {
          kind: AccountingJournalEntryKind.TRANSFER,
          sourceFactType: 'accounting.provider_payout.v1',
          sourceFactStableId: 'payout_uber_20260923_1',
          sourceFactVersion: 1,
          storeStableId: '4750_Yonge_Street',
          occurredAt: '2026-09-23T04:00:00.000Z',
          currency: 'CAD',
          memo: 'attempted payout conversion',
          lines: [
            {
              accountStableId: 'account_primary_bank',
              debitCents: 120_000,
            },
            {
              accountStableId: 'account_uber_pending',
              creditCents: 120_000,
            },
          ],
          lastKnownUpdatedAt: existing.updatedAt.toISOString(),
        },
        'actor_accounting',
      ),
    ).rejects.toThrow(
      'generic Journal update cannot create canonical provider payout authority',
    );
    expect(prisma.accountingJournalEntry.updateMany).not.toHaveBeenCalled();
  });

  it('keeps canonical provider payout Journals immutable through generic update/delete paths', async () => {
    const existing = internalJournalRow({
      kind: AccountingJournalEntryKind.TRANSFER,
      source: AccountingJournalSource.PAYMENT,
      sourceFactType: 'accounting.provider_payout.v1',
      sourceFactStableId: 'payout_uber_20260923_1',
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
      occurredAt: new Date('2026-09-23T04:00:00.000Z'),
    });
    const updateCase = makeService();
    updateCase.prisma.accountingJournalEntry.findUnique.mockResolvedValue(
      existing,
    );

    await expect(
      updateCase.service.updateJournalEntry(
        'journal_stable_1',
        {
          kind: AccountingJournalEntryKind.TRANSFER,
          sourceFactType: 'accounting.provider_payout.v1',
          sourceFactStableId: 'payout_uber_20260923_1',
          sourceFactVersion: 1,
          storeStableId: '4750_Yonge_Street',
          occurredAt: '2026-09-23T04:00:00.000Z',
          currency: 'CAD',
          memo: 'changed',
          lines: [
            {
              accountStableId: 'account_primary_bank',
              debitCents: 120_000,
            },
            {
              accountStableId: 'account_uber_pending',
              creditCents: 120_000,
            },
          ],
          lastKnownUpdatedAt: existing.updatedAt.toISOString(),
        },
        'actor_accounting',
      ),
    ).rejects.toThrow(
      'canonical provider payout Journals cannot be updated in place',
    );

    const deleteCase = makeService();
    deleteCase.prisma.accountingJournalEntry.findUnique.mockResolvedValue(
      existing,
    );
    await expect(
      deleteCase.service.deleteJournalEntry(
        'journal_stable_1',
        'actor_accounting',
      ),
    ).rejects.toThrow(
      'canonical provider payout Journals cannot be deleted in place',
    );
  });

  it('fails closed when confirmed human review authority changes after settlement preview', async () => {
    const { service, prisma } = makeService();
    prisma.accountingProviderFinancialReviewRevision.findMany.mockResolvedValue(
      [
        {
          reviewRevisionStableId: 'acctfinreview_current',
          revision: 2,
          reviewHash: 'c'.repeat(64),
          confirmedAt: new Date('2026-09-20T14:00:00.000Z'),
          confirmedByUserStableId: 'user_admin_2',
        },
      ],
    );
    const authority = {
      reviewRevisionStableId: 'acctfinreview_previewed',
      revision: 1,
      reviewHash: 'b'.repeat(64),
      confirmedAt: '2026-09-20T13:00:00.000Z',
      confirmedByUserStableId: 'user_admin_1',
    };
    const revalidator = service as unknown as {
      assertProviderFinancialHumanReviewAuthorityInTx(
        documentDbId: string,
        reviewAuthority: typeof authority | undefined,
        tx: unknown,
        documentStableId: string,
      ): Promise<void>;
    };

    await expect(
      revalidator.assertProviderFinancialHumanReviewAuthorityInTx(
        'document-db-id',
        authority,
        prisma,
        'acctfindoc_july',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('fails closed when human review is confirmed after a preview that had no review', async () => {
    const { service, prisma } = makeService();
    prisma.accountingProviderFinancialReviewRevision.findMany.mockResolvedValue(
      [
        {
          reviewRevisionStableId: 'acctfinreview_new',
          revision: 1,
          reviewHash: 'd'.repeat(64),
          confirmedAt: new Date('2026-09-20T14:00:00.000Z'),
          confirmedByUserStableId: 'user_admin_1',
        },
      ],
    );
    const revalidator = service as unknown as {
      assertProviderFinancialHumanReviewAuthorityInTx(
        documentDbId: string,
        reviewAuthority: undefined,
        tx: unknown,
        documentStableId: string,
      ): Promise<void>;
    };

    await expect(
      revalidator.assertProviderFinancialHumanReviewAuthorityInTx(
        'document-db-id',
        undefined,
        prisma,
        'acctfindoc_july',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a balanced journal with stable operator identity and CREATE audit evidence', async () => {
    const { service, prisma } = makeService();
    prisma.accountingJournalEntry.findUnique.mockResolvedValue(null);
    prisma.accountingJournalEntry.create.mockResolvedValue(journalRow());

    const created = await service.createJournalEntry(
      basePayload,
      'user_stable_1',
    );

    expect(created.entryStableId).toBe('journal_stable_1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.accountingJournalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: basePayload.idempotencyKey,
          idempotencyHash: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown,
          kind: AccountingJournalEntryKind.STANDARD,
          source: AccountingJournalSource.MANUAL,
          createdByActorRef: 'user_stable_1',
          updatedByActorRef: 'user_stable_1',
          lines: {
            create: [
              expect.objectContaining({
                lineNo: 1,
                accountId: 'account-expense-db-id',
                categoryId: 'category-db-id',
                debitCents: 1250,
                creditCents: 0,
              }) as unknown,
              expect.objectContaining({
                lineNo: 2,
                accountId: 'account-cash-db-id',
                categoryId: null,
                debitCents: 0,
                creditCents: 1250,
              }) as unknown,
            ],
          },
        }) as unknown,
      }) as unknown,
    );
    expect(prisma.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE',
        entityType: 'ACCOUNTING_JOURNAL_ENTRY',
        entityId: 'journal_stable_1',
        operatorActorRef: 'user_stable_1',
      }) as unknown,
    });
  });

  it('rejects an inactive or missing account before journal persistence', async () => {
    const { service, prisma } = makeService();
    prisma.accountingJournalEntry.findUnique.mockResolvedValue(null);
    prisma.accountingAccount.findMany.mockResolvedValue([
      {
        id: 'account-cash-db-id',
        accountStableId: 'account_store_cash',
        currency: 'CAD',
      },
    ]);

    await expect(
      service.createJournalEntry(basePayload, 'user_stable_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('rejects an inactive or missing category before journal persistence', async () => {
    const { service, prisma } = makeService();
    prisma.accountingJournalEntry.findUnique.mockResolvedValue(null);
    prisma.accountingCategory.findMany.mockResolvedValue([]);

    await expect(
      service.createJournalEntry(basePayload, 'user_stable_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('rejects an account whose currency does not match the journal currency', async () => {
    const { service, prisma } = makeService();
    prisma.accountingJournalEntry.findUnique.mockResolvedValue(null);
    prisma.accountingAccount.findMany.mockResolvedValue([
      {
        id: 'account-expense-db-id',
        accountStableId: 'account_general_operating_expense',
        currency: 'USD',
      },
      {
        id: 'account-cash-db-id',
        accountStableId: 'account_store_cash',
        currency: 'CAD',
      },
    ]);

    await expect(
      service.createJournalEntry(basePayload, 'user_stable_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('returns equivalent public data for an identical idempotent replay without duplicate write/audit', async () => {
    const { service, prisma } = makeService();
    let stored: ReturnType<typeof internalJournalRow> | null = null;
    prisma.accountingJournalEntry.findUnique.mockImplementation(() =>
      Promise.resolve(stored),
    );
    prisma.accountingJournalEntry.create.mockImplementation(
      ({ data }: { data: { idempotencyHash: string } }) => {
        stored = internalJournalRow({ idempotencyHash: data.idempotencyHash });
        return Promise.resolve(journalRow());
      },
    );

    const first = await service.createJournalEntry(
      basePayload,
      'user_stable_1',
    );
    const second = await service.createJournalEntry(
      basePayload,
      'user_stable_1',
    );

    expect(second).toEqual(first);
    expect(second).not.toHaveProperty('id');
    expect(second).not.toHaveProperty('idempotencyHash');
    expect(prisma.accountingJournalEntry.create).toHaveBeenCalledTimes(1);
    expect(prisma.accountingAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it('recovers a concurrent idempotent create after the database unique constraint wins the race', async () => {
    const { service, prisma } = makeService();
    let stored: ReturnType<typeof internalJournalRow> | null = null;
    prisma.accountingJournalEntry.findUnique
      .mockResolvedValueOnce(null)
      .mockImplementation(() => Promise.resolve(stored));
    prisma.accountingJournalEntry.create.mockImplementation(
      ({ data }: { data: { idempotencyHash: string } }) => {
        stored = internalJournalRow({ idempotencyHash: data.idempotencyHash });
        return Promise.reject(
          Object.assign(new Error('unique conflict'), { code: 'P2002' }),
        );
      },
    );

    await expect(
      service.createJournalEntry(basePayload, 'user_stable_1'),
    ).resolves.toEqual(journalRow());
    expect(prisma.accountingAuditLog.create).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key for different journal content', async () => {
    const { service, prisma } = makeService();
    let stored: ReturnType<typeof internalJournalRow> | null = null;
    prisma.accountingJournalEntry.findUnique.mockImplementation(() =>
      Promise.resolve(stored),
    );
    prisma.accountingJournalEntry.create.mockImplementation(
      ({ data }: { data: { idempotencyHash: string } }) => {
        stored = internalJournalRow({ idempotencyHash: data.idempotencyHash });
        return Promise.resolve(journalRow());
      },
    );

    await service.createJournalEntry(basePayload, 'user_stable_1');
    await expect(
      service.createJournalEntry(
        { ...basePayload, memo: 'Different content' },
        'user_stable_1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('binds canonical-change write authority into idempotency and CREATE audit evidence', async () => {
    const { service, prisma } = makeService();
    const canonicalPayload = {
      ...basePayload,
      idempotencyKey: 'canonical-reversal:change_fact_1:v1',
      kind: AccountingJournalEntryKind.ADJUSTMENT,
      source: AccountingJournalSource.ORDER,
      sourceFactType: 'order.financial_reversal.v1',
      sourceFactStableId: 'change_fact_1',
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
      memo: 'Canonical reversal change_fact_1',
    };
    const authority = {
      version: 1 as const,
      changeFactType: 'order.financial_reversal.v1' as const,
      changeFactStableId: 'change_fact_1',
      originalSaleFactStableId: 'sale_fact_1',
      originalSaleJournalEntryStableId: 'journal_sale_1',
      cardSettlementEvidenceMode: 'LEGACY_ORDER_DECLARED' as const,
      matchedPaymentReversalFactStableIds: [],
      matchedLoyaltyFactStableIds: [],
    };
    prisma.accountingJournalEntry.findUnique.mockResolvedValue(null);
    prisma.accountingJournalEntry.create.mockResolvedValue(
      journalRow({
        idempotencyKey: canonicalPayload.idempotencyKey,
        kind: AccountingJournalEntryKind.ADJUSTMENT,
        source: AccountingJournalSource.ORDER,
        sourceFactType: canonicalPayload.sourceFactType,
        sourceFactStableId: canonicalPayload.sourceFactStableId,
        sourceFactVersion: 1,
        storeStableId: '4750_Yonge_Street',
      }),
    );

    await service.createCanonicalChangeJournalEntry(
      canonicalPayload,
      'system:accounting-canonical-change-posting',
      authority,
    );

    expect(prisma.accountingJournalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: canonicalPayload.idempotencyKey,
          idempotencyHash: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown,
          sourceFactStableId: 'change_fact_1',
        }) as unknown,
      }) as unknown,
    );
    expect(prisma.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE',
        entityType: 'ACCOUNTING_JOURNAL_ENTRY',
        afterJson: expect.objectContaining({
          writeAuthority: authority,
          journal: expect.objectContaining({
            sourceFactStableId: 'change_fact_1',
          }) as unknown,
        }) as unknown,
      }) as unknown,
    });
  });

  it('rejects canonical-change authority whose source identity does not match the Journal', async () => {
    const { service, prisma } = makeService();
    const canonicalPayload = {
      ...basePayload,
      idempotencyKey: 'canonical-reversal:change_fact_1:v1',
      kind: AccountingJournalEntryKind.ADJUSTMENT,
      source: AccountingJournalSource.ORDER,
      sourceFactType: 'order.financial_reversal.v1',
      sourceFactStableId: 'change_fact_1',
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
    };

    await expect(
      service.createCanonicalChangeJournalEntry(
        canonicalPayload,
        'system:accounting-canonical-change-posting',
        {
          version: 1,
          changeFactType: 'order.financial_reversal.v1',
          changeFactStableId: 'other_change_fact',
          originalSaleFactStableId: 'sale_fact_1',
          originalSaleJournalEntryStableId: 'journal_sale_1',
          cardSettlementEvidenceMode: 'LEGACY_ORDER_DECLARED',
          matchedPaymentReversalFactStableIds: [],
          matchedLoyaltyFactStableIds: [],
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.accountingJournalEntry.create).not.toHaveBeenCalled();
    expect(prisma.accountingAuditLog.create).not.toHaveBeenCalled();
  });

  it('replays the same canonical-change authority idempotently and rejects authority drift', async () => {
    const { service, prisma } = makeService();
    const canonicalPayload = {
      ...basePayload,
      idempotencyKey: 'canonical-reversal:change_fact_1:v1',
      kind: AccountingJournalEntryKind.ADJUSTMENT,
      source: AccountingJournalSource.ORDER,
      sourceFactType: 'order.financial_reversal.v1',
      sourceFactStableId: 'change_fact_1',
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
      memo: 'Canonical reversal change_fact_1',
    };
    const authority = {
      version: 1 as const,
      changeFactType: 'order.financial_reversal.v1' as const,
      changeFactStableId: 'change_fact_1',
      originalSaleFactStableId: 'sale_fact_1',
      originalSaleJournalEntryStableId: 'journal_sale_1',
      cardSettlementEvidenceMode: 'LEGACY_ORDER_DECLARED' as const,
      matchedPaymentReversalFactStableIds: [],
      matchedLoyaltyFactStableIds: [],
    };
    let stored: ReturnType<typeof internalJournalRow> | null = null;
    prisma.accountingJournalEntry.findUnique.mockImplementation(() =>
      Promise.resolve(stored),
    );
    prisma.accountingJournalEntry.create.mockImplementation(
      ({ data }: { data: { idempotencyHash: string } }) => {
        stored = internalJournalRow({
          idempotencyHash: data.idempotencyHash,
          idempotencyKey: canonicalPayload.idempotencyKey,
          kind: AccountingJournalEntryKind.ADJUSTMENT,
          source: AccountingJournalSource.ORDER,
          sourceFactType: canonicalPayload.sourceFactType,
          sourceFactStableId: canonicalPayload.sourceFactStableId,
          sourceFactVersion: 1,
          storeStableId: '4750_Yonge_Street',
        });
        return Promise.resolve(
          journalRow({
            idempotencyKey: canonicalPayload.idempotencyKey,
            kind: AccountingJournalEntryKind.ADJUSTMENT,
            source: AccountingJournalSource.ORDER,
            sourceFactType: canonicalPayload.sourceFactType,
            sourceFactStableId: canonicalPayload.sourceFactStableId,
            sourceFactVersion: 1,
            storeStableId: '4750_Yonge_Street',
          }),
        );
      },
    );

    await service.createCanonicalChangeJournalEntry(
      canonicalPayload,
      'system:accounting-canonical-change-posting',
      authority,
    );
    await expect(
      service.createCanonicalChangeJournalEntry(
        canonicalPayload,
        'system:accounting-canonical-change-posting',
        authority,
      ),
    ).resolves.toEqual(
      expect.objectContaining({ sourceFactStableId: 'change_fact_1' }),
    );
    await expect(
      service.createCanonicalChangeJournalEntry(
        canonicalPayload,
        'system:accounting-canonical-change-posting',
        {
          ...authority,
          cardSettlementEvidenceMode: 'STRICT_PAYMENT_EVIDENCE',
          matchedPaymentReversalFactStableIds: ['payment_reversal_fact_1'],
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.accountingJournalEntry.create).toHaveBeenCalledTimes(1);
    expect(prisma.accountingAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it('optimistically updates an open-period journal by replacing its balanced lines', async () => {
    const { service, prisma } = makeService();
    const existing = internalJournalRow();
    const updated = journalRow({
      memo: 'Updated memo',
      updatedAt: new Date('2026-09-12T14:10:00.000Z'),
      updatedByActorRef: 'user_stable_2',
      version: 2,
    });
    prisma.accountingJournalEntry.findUnique
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    prisma.accountingJournalEntry.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.updateJournalEntry(
        'journal_stable_1',
        {
          kind: AccountingJournalEntryKind.STANDARD,
          occurredAt: basePayload.occurredAt,
          currency: 'CAD',
          memo: 'Updated memo',
          lines: basePayload.lines,
          lastKnownUpdatedAt: existing.updatedAt.toISOString(),
        },
        'user_stable_2',
      ),
    ).resolves.toBe(updated);

    expect(prisma.accountingJournalEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyHash: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown,
          updatedByActorRef: 'user_stable_2',
          version: { increment: 1 },
        }) as unknown,
      }) as unknown,
    );
    expect(prisma.accountingJournalLine.deleteMany).toHaveBeenCalledWith({
      where: { entryId: 'journal-db-id' },
    });
    expect(prisma.accountingJournalLine.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE',
        entityId: 'journal_stable_1',
        operatorActorRef: 'user_stable_2',
        beforeJson: journalRow(),
        afterJson: updated,
      }) as unknown,
    });
  });

  it('rejects a stale optimistic update before replacing lines or auditing', async () => {
    const { service, prisma } = makeService();
    const existing = internalJournalRow();
    prisma.accountingJournalEntry.findUnique.mockResolvedValue(existing);
    prisma.accountingJournalEntry.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateJournalEntry(
        'journal_stable_1',
        {
          kind: AccountingJournalEntryKind.STANDARD,
          occurredAt: basePayload.occurredAt,
          lines: basePayload.lines,
          lastKnownUpdatedAt: existing.updatedAt.toISOString(),
        },
        'user_stable_2',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.accountingJournalLine.deleteMany).not.toHaveBeenCalled();
    expect(prisma.accountingAuditLog.create).not.toHaveBeenCalled();
  });

  it('soft-deletes a journal row, increments its version and records DELETE audit evidence', async () => {
    const { service, prisma } = makeService();
    const existing = journalRow();
    const deleted = journalRow({
      deletedAt: new Date('2026-09-12T15:00:00.000Z'),
      version: 2,
      updatedByActorRef: 'user_stable_3',
    });
    prisma.accountingJournalEntry.findUnique.mockResolvedValue(existing);
    prisma.accountingJournalEntry.update.mockResolvedValue(deleted);

    await expect(
      service.deleteJournalEntry('journal_stable_1', 'user_stable_3'),
    ).resolves.toEqual({ ok: true });

    expect(prisma.accountingJournalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entryStableId: 'journal_stable_1' },
        data: {
          deletedAt: expect.any(Date) as unknown,
          updatedByActorRef: 'user_stable_3',
          version: { increment: 1 },
        },
      }) as unknown,
    );
    expect(prisma.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'DELETE',
        entityId: 'journal_stable_1',
        operatorActorRef: 'user_stable_3',
        beforeJson: existing,
        afterJson: deleted,
      }) as unknown,
    });
  });

  it('keeps journal mutation and audit evidence in the same transaction unit', async () => {
    const { service, prisma } = makeService();
    prisma.accountingJournalEntry.findUnique.mockResolvedValue(null);
    prisma.accountingJournalEntry.create.mockResolvedValue(journalRow());
    prisma.accountingAuditLog.create.mockRejectedValue(
      new Error('audit failed'),
    );

    await expect(
      service.createJournalEntry(basePayload, 'user_stable_1'),
    ).rejects.toThrow('audit failed');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
