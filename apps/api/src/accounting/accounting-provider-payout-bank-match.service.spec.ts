import {
  AccountingAccountType,
  AccountingFinancialProvider,
} from './accounting-contracts';
import { AccountingProviderPayoutBankMatchService } from './accounting-provider-payout-bank-match.service';
import { AccountingArtifactDeliveryService } from './accounting-artifact-delivery.service';

jest.mock('node:fs', () => ({
  promises: {
    stat: jest.fn(),
    readFile: jest.fn(),
  },
}));

import * as fs from 'node:fs';

type PayoutFindManyArgs = {
  where: {
    storeStableId: string;
    destinationBankAccountStableId: string;
    currency: string;
    journalEntryStableId: { not: null };
  };
};

type JournalFindManyArgs = {
  where: {
    entryStableId: { in: string[] };
    deletedAt: null;
    kind: string;
    source: string;
    sourceFactType: string;
    sourceFactVersion: number;
    storeStableId: string;
    currency: string;
  };
};

describe('AccountingProviderPayoutBankMatchService', () => {
  const stat = jest.mocked(fs.promises.stat);
  const readFile = jest.mocked(fs.promises.readFile);

  beforeEach(() => {
    stat.mockReset();
    readFile.mockReset();
    stat.mockResolvedValue({ size: 1024 } as never);
    readFile.mockResolvedValue(
      [
        'Date,Description,Withdrawals,Deposits,Balance',
        '06/09/2026,UBER EATS PAYOUT,,284.48,1000.00',
        '06/10/2026,FANTUAN SETTLEMENT,,860.57,1860.57',
      ].join('\n') as never,
    );
  });

  function makeService() {
    const prisma = {
      accountingAccount: {
        findUnique: jest.fn().mockResolvedValue({
          accountStableId: 'account_cibc',
          type: AccountingAccountType.BANK,
          currency: 'CAD',
          isActive: true,
        }),
      },
      accountingProviderPayout: {
        findMany: jest.fn().mockResolvedValue([
          {
            payoutStableId: 'payout_uber',
            provider: AccountingFinancialProvider.UBER_EATS,
            payoutDate: new Date('2026-06-09T00:00:00.000Z'),
            amountCents: 28448,
            providerReference: null,
            journalEntryStableId: 'journal_uber',
          },
        ]),
      },
      accountingJournalEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            entryStableId: 'journal_uber',
            sourceFactStableId: 'payout_uber',
          },
        ]),
      },
    };
    const artifactDelivery = {
      resolveArtifactContent: jest.fn().mockResolvedValue({
        filePath: '/tmp/cibc.csv',
        mimeType: 'text/csv; charset=utf-8',
        filename: 'cibc.csv',
        retainedDerivative: false,
      }),
    };
    return {
      service: new AccountingProviderPayoutBankMatchService(
        prisma as never,
        artifactDelivery as unknown as AccountingArtifactDeliveryService,
      ),
      prisma,
      artifactDelivery,
    };
  }

  it('matches bank deposits only against existing payouts for the selected store and bank', async () => {
    const { service, prisma } = makeService();

    const result = await service.preview({
      artifactStableId: 'acctart_bank_1',
      storeStableId: '4750_Yonge_Street',
      destinationBankAccountStableId: 'account_cibc',
    });

    const [payoutFindArgs] = prisma.accountingProviderPayout.findMany.mock
      .calls[0] as unknown as [PayoutFindManyArgs];
    expect(payoutFindArgs.where).toMatchObject({
      storeStableId: '4750_Yonge_Street',
      destinationBankAccountStableId: 'account_cibc',
      currency: 'CAD',
      journalEntryStableId: { not: null },
    });

    const [journalFindArgs] = prisma.accountingJournalEntry.findMany.mock
      .calls[0] as unknown as [JournalFindManyArgs];
    expect(journalFindArgs.where).toEqual({
      entryStableId: { in: ['journal_uber'] },
      deletedAt: null,
      kind: 'TRANSFER',
      source: 'PAYMENT',
      sourceFactType: 'accounting.provider_payout.v1',
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
      currency: 'CAD',
    });
    expect(result).toMatchObject({
      scope: 'PROVIDER_PAYOUT_BANK_MATCH_PREVIEW',
      counts: {
        exactExisting: 1,
        ambiguousExisting: 0,
        possibleExisting: 0,
        unmatched: 1,
      },
      deposits: [
        {
          rowNumber: 2,
          status: 'EXACT_EXISTING_PAYOUT',
          candidates: [
            {
              payoutStableId: 'payout_uber',
              providerHintMatch: true,
            },
          ],
        },
        {
          rowNumber: 3,
          status: 'UNMATCHED',
          candidates: [],
        },
      ],
    });
  });

  it('ignores payout rows whose Journal anchor no longer verifies as the same active payout fact', async () => {
    const { service, prisma } = makeService();
    prisma.accountingJournalEntry.findMany.mockResolvedValue([
      {
        entryStableId: 'journal_uber',
        sourceFactStableId: 'different_payout',
      },
    ]);

    const result = await service.preview({
      artifactStableId: 'acctart_bank_1',
      storeStableId: '4750_Yonge_Street',
      destinationBankAccountStableId: 'account_cibc',
    });

    expect(result.counts).toMatchObject({
      exactExisting: 0,
      unmatched: 2,
    });
  });

  it('rejects a non-bank Accounting account before reading evidence', async () => {
    const { service, prisma, artifactDelivery } = makeService();
    prisma.accountingAccount.findUnique.mockResolvedValue({
      accountStableId: 'account_store_cash',
      type: AccountingAccountType.CASH,
      currency: 'CAD',
      isActive: true,
    });

    await expect(
      service.preview({
        artifactStableId: 'acctart_bank_1',
        storeStableId: '4750_Yonge_Street',
        destinationBankAccountStableId: 'account_store_cash',
      }),
    ).rejects.toThrow('active CAD BANK');
    expect(artifactDelivery.resolveArtifactContent).not.toHaveBeenCalled();
  });

  it('fails closed when a CSV lacks the strong directional bank signature', async () => {
    const { service } = makeService();
    readFile.mockResolvedValue(
      'Date,Amount,Description\n2026-06-09,284.48,UBER EATS\n' as never,
    );

    await expect(
      service.preview({
        artifactStableId: 'acctart_generic_csv',
        storeStableId: '4750_Yonge_Street',
        destinationBankAccountStableId: 'account_cibc',
      }),
    ).rejects.toThrow('strong bank transaction signature');
  });
});
