import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingFinancialDocumentType,
  AccountingFinancialProvider,
  AccountingJournalSource,
} from './accounting-contracts';
import { AccountingCloverFeeReclassificationService } from './accounting-clover-fee-reclassification.service';
import {
  CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
  CLOVER_FEE_RECLASSIFICATION_SOURCE_FACT_TYPE,
} from './accounting-provider-fee-clearing.contract';

const document = {
  documentStableId: 'acctfindoc_clover_june',
  revision: 1,
  provider: AccountingFinancialProvider.CLOVER,
  documentType: AccountingFinancialDocumentType.STATEMENT,
  storeStableId: '4750_Yonge_Street',
  currency: 'CAD',
};

const originalJournal = {
  entryStableId: 'journal_legacy_clover_june',
  occurredAt: new Date('2026-06-30T03:59:59.999Z'),
  currency: 'CAD',
  storeStableId: '4750_Yonge_Street',
  lines: [
    {
      debitCents: 0,
      creditCents: 9839,
      account: { accountStableId: 'account_clover_pending' },
    },
    {
      debitCents: 6449,
      creditCents: 0,
      account: { accountStableId: 'account_payment_processing_fee_expense' },
    },
    {
      debitCents: 3000,
      creditCents: 0,
      account: { accountStableId: 'account_general_operating_expense' },
    },
    {
      debitCents: 390,
      creditCents: 0,
      account: { accountStableId: 'account_hst_recoverable' },
    },
  ],
};

function makeService() {
  const prisma = {
    accountingProviderFinancialDocument: {
      findUnique: jest.fn().mockResolvedValue(document),
    },
    accountingJournalEntry: {
      findMany: jest.fn().mockResolvedValue([originalJournal]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue({
        occurredAt: originalJournal.occurredAt,
        currency: originalJournal.currency,
        storeStableId: originalJournal.storeStableId,
      }),
    },
    accountingAccount: {
      findMany: jest.fn().mockResolvedValue([
        {
          accountStableId: 'account_clover_pending',
          accountClass: AccountingAccountClass.ASSET,
          type: AccountingAccountType.PLATFORM_WALLET,
          currency: 'CAD',
          isActive: true,
        },
        {
          accountStableId: CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
          accountClass: AccountingAccountClass.LIABILITY,
          type: null,
          currency: 'CAD',
          isActive: true,
        },
      ]),
    },
  };
  const journal = {
    createJournalEntry: jest.fn().mockResolvedValue({
      entryStableId: 'journal_clover_fee_reclass',
    }),
  };
  return {
    service: new AccountingCloverFeeReclassificationService(
      prisma as never,
      journal as never,
    ),
    prisma,
    journal,
  };
}

describe('AccountingCloverFeeReclassificationService', () => {
  it('previews the exact legacy Pending credit as a fee-payable reclassification', async () => {
    const { service } = makeService();

    const preview = await service.preview(document.documentStableId);

    expect(preview).toEqual(
      expect.objectContaining({
        documentStableId: document.documentStableId,
        revision: 1,
        status: 'READY',
        blockReasons: [],
        originalJournalEntryStableId: originalJournal.entryStableId,
        existingCorrectionJournalEntryStableId: null,
        amountCents: 9839,
      }),
    );
    expect(preview.planHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('writes one idempotent reclassification Journal and then reports it as authoritative', async () => {
    const { service, prisma, journal } = makeService();
    const preview = await service.preview(document.documentStableId);

    prisma.accountingJournalEntry.findFirst
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        entryStableId: 'journal_clover_fee_reclass',
      });

    const result = await service.execute({
      documentStableId: document.documentStableId,
      expectedPlanHash: preview.planHash,
      operatorActorRef: 'user_admin_1',
    });

    expect(journal.createJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey:
          'clover-fee-pending-reclass:acctfindoc_clover_june:r1:v1',
        source: AccountingJournalSource.PLATFORM_STATEMENT,
        sourceFactType: CLOVER_FEE_RECLASSIFICATION_SOURCE_FACT_TYPE,
        sourceFactStableId: document.documentStableId,
        sourceFactVersion: 1,
        storeStableId: '4750_Yonge_Street',
        currency: 'CAD',
        lines: [
          expect.objectContaining({
            accountStableId: 'account_clover_pending',
            debitCents: 9839,
            creditCents: 0,
          }),
          expect.objectContaining({
            accountStableId: CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
            debitCents: 0,
            creditCents: 9839,
          }),
        ],
      }),
      'user_admin_1',
    );
    expect(result.status).toBe('ALREADY_RECLASSIFIED');
    expect(result.existingCorrectionJournalEntryStableId).toBe(
      'journal_clover_fee_reclass',
    );
  });

  it('blocks when the dedicated Clover fee payable account is not provisioned', async () => {
    const { service, prisma } = makeService();
    prisma.accountingAccount.findMany.mockResolvedValue([
      {
        accountStableId: 'account_clover_pending',
        accountClass: AccountingAccountClass.ASSET,
        type: AccountingAccountType.PLATFORM_WALLET,
        currency: 'CAD',
        isActive: true,
      },
    ]);

    const preview = await service.preview(document.documentStableId);
    expect(preview.status).toBe('BLOCKED');
    expect(preview.blockReasons).toContain(
      'CLOVER_FEE_PAYABLE_ACCOUNT_NOT_PROVISIONED',
    );
  });

  it('fails closed when the legacy Journal contains a debit outside known Clover fee accounts', async () => {
    const { service, prisma } = makeService();
    prisma.accountingJournalEntry.findMany.mockResolvedValue([
      {
        ...originalJournal,
        lines: [
          originalJournal.lines[0],
          {
            debitCents: 9839,
            creditCents: 0,
            account: {
              accountStableId: 'account_chargeback_adjustment_expense',
            },
          },
        ],
      },
    ]);

    const preview = await service.preview(document.documentStableId);
    expect(preview.status).toBe('BLOCKED');
    expect(preview.blockReasons).toContain(
      'ORIGINAL_JOURNAL_HAS_NON_FEE_DEBITS',
    );
  });

  it('does not reclassify a statement that already credits the fee payable account', async () => {
    const { service, prisma } = makeService();
    prisma.accountingJournalEntry.findMany.mockResolvedValue([
      {
        ...originalJournal,
        lines: [
          {
            debitCents: 0,
            creditCents: 9839,
            account: {
              accountStableId: CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
            },
          },
          ...originalJournal.lines.slice(1),
        ],
      },
    ]);

    const preview = await service.preview(document.documentStableId);
    expect(preview.status).toBe('BLOCKED');
    expect(preview.blockReasons).toContain(
      'NO_LEGACY_PENDING_CREDIT_TO_RECLASSIFY',
    );
    expect(preview.blockReasons).toContain(
      'ORIGINAL_JOURNAL_HAS_NON_PENDING_CREDITS',
    );
    expect(preview.blockReasons).toContain(
      'ORIGINAL_JOURNAL_ALREADY_USES_FEE_PAYABLE',
    );
  });

  it('looks only at the canonical provider-financial statement posting identity', async () => {
    const { service, prisma } = makeService();

    await service.preview(document.documentStableId);

    expect(prisma.accountingJournalEntry.findMany).toHaveBeenCalledTimes(1);
  });
});
