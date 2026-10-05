import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  assertAccountingOpeningReceivableSettlementJournalAuthority,
  buildAccountingOpeningReceivableSettlementWritePlan,
  calculateOpeningReceivableCanonicalAmountCents,
  calculateOpeningReceivableSettlementAppliedCents,
} from './accounting-opening-receivable-settlement-journal-authority';
import { normalizeAccountingOpeningReceivableSettlement } from './accounting-opening-receivable-settlement.policy';
import { normalizeJournalCreate } from './accounting-journal-policy';

describe('Accounting Opening Receivable settlement Journal authority', () => {
  const fact = normalizeAccountingOpeningReceivableSettlement(
    {
      requestId: '22222222-2222-4222-8222-222222222222',
      openingReceivableStableId: 'openingrecv_11111111111141118111111111111111',
      settlementOn: '2026-06-20',
      amountCents: 12_500,
      collectionAccountStableId: 'account_primary_bank',
    },
    {
      storeStableId: '4750_Yonge_Street',
      counterpartyName: 'Pre-start supermarket receivables',
    },
  );

  const accountFacts = [
    {
      accountStableId: 'account_accounts_receivable',
      accountClass: AccountingAccountClass.ASSET,
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

  const receivableSnapshot = {
    openingReceivableStableId: fact.openingReceivableStableId,
    openingDate: '2026-06-01',
    accountingStartDate: '2026-06-01',
    storeStableId: '4750_Yonge_Street',
    counterpartyName: 'Pre-start supermarket receivables',
    currency: 'CAD' as const,
    openingFactHash: 'opening-fact-hash',
    openingJournalEntryStableId: 'journal_opening_1',
    openingAmountCents: 50_500,
    settledBeforeCents: 20_000,
    outstandingBeforeCents: 30_500,
  };

  it('posts exactly Dr selected BANK / Cr Accounts Receivable', () => {
    const plan = buildAccountingOpeningReceivableSettlementWritePlan({
      fact,
      businessTimezone: 'America/Toronto',
      accountFacts,
      receivableSnapshot,
    });

    expect(plan.journal).toMatchObject({
      kind: AccountingJournalEntryKind.STANDARD,
      source: AccountingJournalSource.MANUAL,
      sourceFactType: 'accounting.opening_receivable_settlement.v1',
      sourceFactStableId: fact.settlementStableId,
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
      currency: 'CAD',
      lines: [
        {
          accountStableId: 'account_primary_bank',
          debitCents: 12_500,
          creditCents: 0,
        },
        {
          accountStableId: 'account_accounts_receivable',
          debitCents: 0,
          creditCents: 12_500,
        },
      ],
    });
    expect(plan.journal.occurredAt).toBe('2026-06-20T04:00:00.000Z');
    expect(() =>
      assertAccountingOpeningReceivableSettlementJournalAuthority(
        normalizeJournalCreate(plan.journal),
        plan.authority,
      ),
    ).not.toThrow();
  });

  it('permits a full settlement exactly equal to canonical outstanding AR', () => {
    const plan = buildAccountingOpeningReceivableSettlementWritePlan({
      fact: { ...fact, amountCents: 30_500 },
      businessTimezone: 'America/Toronto',
      accountFacts,
      receivableSnapshot,
    });

    expect(plan.journal.lines).toEqual([
      expect.objectContaining({
        accountStableId: 'account_primary_bank',
        debitCents: 30_500,
        creditCents: 0,
      }),
      expect.objectContaining({
        accountStableId: 'account_accounts_receivable',
        debitCents: 0,
        creditCents: 30_500,
      }),
    ]);
  });

  it('rejects over-settlement and a non-BANK/CASH collection account', () => {
    expect(() =>
      buildAccountingOpeningReceivableSettlementWritePlan({
        fact: { ...fact, amountCents: 30_501 },
        businessTimezone: 'America/Toronto',
        accountFacts,
        receivableSnapshot,
      }),
    ).toThrow('Opening Receivable settlement exceeds outstanding receivable');

    expect(() =>
      buildAccountingOpeningReceivableSettlementWritePlan({
        fact,
        businessTimezone: 'America/Toronto',
        accountFacts: accountFacts.map((account) =>
          account.accountStableId === 'account_primary_bank'
            ? {
                ...account,
                accountType: AccountingAccountType.PLATFORM_WALLET,
              }
            : account,
        ),
        receivableSnapshot,
      }),
    ).toThrow(
      'Opening Receivable settlement collection account must be BANK or CASH',
    );
  });

  it('rejects settlement dates before cutover/opening and malformed canonical opening AR', () => {
    expect(() =>
      buildAccountingOpeningReceivableSettlementWritePlan({
        fact: { ...fact, settlementOn: '2026-05-31' },
        businessTimezone: 'America/Toronto',
        accountFacts,
        receivableSnapshot,
      }),
    ).toThrow(
      'Opening Receivable settlement date cannot precede the opening/cutover date',
    );

    expect(() =>
      calculateOpeningReceivableCanonicalAmountCents([
        {
          accountStableId: 'account_accounts_receivable',
          debitCents: 50_500,
          creditCents: 0,
        },
        {
          accountStableId: 'account_opening_balance_equity',
          debitCents: 0,
          creditCents: 50_499,
        },
      ]),
    ).toThrow(
      'Opening Receivable canonical Journal has an invalid AR / Opening Balance Equity shape',
    );

    expect(() =>
      calculateOpeningReceivableSettlementAppliedCents(
        [
          {
            accountStableId: 'account_primary_bank',
            debitCents: 12_500,
            creditCents: 0,
          },
          {
            accountStableId: 'account_accounts_receivable',
            debitCents: 1,
            creditCents: 12_500,
          },
        ],
        'account_primary_bank',
      ),
    ).toThrow(
      'Opening Receivable settlement canonical Journal has an invalid BANK/CASH -> AR shape',
    );
  });
});
