import { BadRequestException } from '@nestjs/common';
import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import { AccountingStatementDrillThroughService } from './accounting-statement-drill-through.service';

describe('AccountingStatementDrillThroughService', () => {
  const scope = {
    currency: 'CAD',
    timezone: 'America/Toronto',
    accountingStartDate: '2026-06-01',
    requestedFrom: '2026-07-01',
    requestedTo: '2026-07-31',
    effectiveFrom: '2026-07-01',
    effectiveTo: '2026-07-31',
    accountingStartAt: new Date('2026-06-01T04:00:00.000Z'),
    fromInclusive: new Date('2026-07-01T04:00:00.000Z'),
    toExclusive: new Date('2026-08-01T04:00:00.000Z'),
  };

  const makeService = () => {
    type JournalCountArgs = {
      where: {
        currency?: string;
        OR?: unknown[];
        kind?: unknown;
        occurredAt?: unknown;
      };
    };
    let lastCountArgs: JournalCountArgs | undefined;
    const prisma = {
      accountingAccount: {
        findUnique: jest.fn().mockResolvedValue({
          accountStableId: 'account_primary_bank',
          name: 'CIBC',
          accountClass: AccountingAccountClass.ASSET,
          type: AccountingAccountType.BANK,
          currency: 'CAD',
          isActive: true,
        }),
      },
      accountingJournalEntry: {
        count: jest.fn(async (args: JournalCountArgs) => {
          lastCountArgs = args;
          return 1;
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            entryStableId: 'journal_payout_1',
            kind: AccountingJournalEntryKind.TRANSFER,
            source: AccountingJournalSource.PAYMENT,
            sourceFactType: 'accounting.provider_payout.v1',
            sourceFactStableId: 'payout_uber_1',
            sourceFactVersion: 1,
            storeStableId: '4750_Yonge_Street',
            occurredAt: new Date('2026-07-15T04:00:00.000Z'),
            currency: 'CAD',
            memo: 'UBER_EATS payout',
            lines: [
              {
                lineNo: 1,
                debitCents: 44190,
                creditCents: 0,
                memo: null,
                account: {
                  accountStableId: 'account_primary_bank',
                  name: 'CIBC',
                  accountClass: AccountingAccountClass.ASSET,
                  type: AccountingAccountType.BANK,
                },
                category: null,
              },
              {
                lineNo: 2,
                debitCents: 0,
                creditCents: 44190,
                memo: null,
                account: {
                  accountStableId: 'account_uber_pending',
                  name: 'Uber Pending',
                  accountClass: AccountingAccountClass.ASSET,
                  type: AccountingAccountType.PLATFORM_WALLET,
                },
                category: null,
              },
            ],
          },
        ]),
      },
    };
    const trialBalance = {
      resolveStatementScope: jest.fn().mockResolvedValue(scope),
    };
    const service = new AccountingStatementDrillThroughService(
      prisma as never,
      trialBalance as never,
    );
    return {
      service,
      prisma,
      trialBalance,
      getLastCountArgs: () => lastCountArgs,
    };
  };

  it('uses the B3 statement scope and preserves PAYOUT source lineage with the full balanced Journal', async () => {
    const { service, prisma, trialBalance } = makeService();

    const result = await service.read({
      accountStableId: 'account_primary_bank',
      phase: 'PERIOD',
      from: '2026-07-01',
      to: '2026-07-31',
      currency: 'cad',
      limit: 25,
      offset: 0,
    });

    expect(trialBalance.resolveStatementScope).toHaveBeenCalledWith({
      from: '2026-07-01',
      to: '2026-07-31',
      currency: 'cad',
    });
    expect(prisma.accountingJournalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 25,
        orderBy: [{ occurredAt: 'desc' }, { entryStableId: 'desc' }],
      }),
    );
    expect(result.entries[0]).toEqual(
      expect.objectContaining({
        source: AccountingJournalSource.PAYMENT,
        sourceFactType: 'accounting.provider_payout.v1',
        sourceFactStableId: 'payout_uber_1',
        accountDebitCents: 44190,
        accountCreditCents: 0,
        accountNormalMovementCents: 44190,
        entryDebitCents: 44190,
        entryCreditCents: 44190,
        highlightedLineNos: [1],
      }),
    );
    expect(result.entries[0]?.lines).toHaveLength(2);
  });

  it('uses explicit OPENING_BALANCE or pre-period Journals for the OPENING phase', async () => {
    const { service, getLastCountArgs } = makeService();

    await service.read({
      accountStableId: 'account_primary_bank',
      phase: 'OPENING',
      from: '2026-07-01',
      to: '2026-07-31',
    });

    expect(getLastCountArgs()?.where).toMatchObject({
      currency: 'CAD',
      OR: [
        { kind: AccountingJournalEntryKind.OPENING_BALANCE },
        { occurredAt: { lt: scope.fromInclusive } },
      ],
    });
  });

  it('excludes explicit OPENING_BALANCE Journals from the PERIOD phase', async () => {
    const { service, getLastCountArgs } = makeService();

    await service.read({
      accountStableId: 'account_primary_bank',
      phase: 'PERIOD',
      from: '2026-07-01',
      to: '2026-07-31',
    });

    expect(getLastCountArgs()?.where).toMatchObject({
      currency: 'CAD',
      kind: { not: AccountingJournalEntryKind.OPENING_BALANCE },
      occurredAt: {
        gte: scope.fromInclusive,
        lt: scope.toExclusive,
      },
    });
  });

  it('fails closed on invalid pagination before reading Journal rows', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.read({
        accountStableId: 'account_primary_bank',
        phase: 'PERIOD',
        limit: 101,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.accountingJournalEntry.findMany).not.toHaveBeenCalled();
  });
});
