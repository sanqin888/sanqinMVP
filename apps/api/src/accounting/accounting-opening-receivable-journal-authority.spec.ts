import {
  AccountingAccountClass,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  buildAccountingOpeningReceivableWritePlan,
  assertAccountingOpeningReceivableJournalAuthority,
} from './accounting-opening-receivable-journal-authority';
import { normalizeJournalCreate } from './accounting-journal-policy';
import { normalizeAccountingOpeningReceivable } from './accounting-opening-receivable.policy';

describe('Accounting Opening Receivable Journal authority', () => {
  const fact = normalizeAccountingOpeningReceivable(
    {
      requestId: '11111111-1111-4111-8111-111111111111',
      storeStableId: '4750_Yonge_Street',
      counterpartyName: 'Pre-start supermarket receivables',
      amountCents: 50_500,
    },
    '2026-06-01',
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
      accountStableId: 'account_opening_balance_equity',
      accountClass: AccountingAccountClass.EQUITY,
      accountType: null,
      currency: 'CAD',
      isActive: true,
    },
  ];

  it('builds only AR debit and Opening Balance Equity credit', () => {
    const plan = buildAccountingOpeningReceivableWritePlan({
      fact,
      businessTimezone: 'America/Toronto',
      accountFacts,
    });

    expect(plan.journal).toMatchObject({
      kind: AccountingJournalEntryKind.OPENING_BALANCE,
      source: AccountingJournalSource.MANUAL,
      sourceFactType: 'accounting.opening_receivable.v1',
      sourceFactStableId: fact.openingReceivableStableId,
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
      currency: 'CAD',
      lines: [
        {
          accountStableId: 'account_accounts_receivable',
          debitCents: 50_500,
          creditCents: 0,
        },
        {
          accountStableId: 'account_opening_balance_equity',
          debitCents: 0,
          creditCents: 50_500,
        },
      ],
    });
    expect(plan.journal.occurredAt).toBe('2026-06-01T04:00:00.000Z');

    expect(() =>
      assertAccountingOpeningReceivableJournalAuthority(
        normalizeJournalCreate(plan.journal),
        plan.authority,
      ),
    ).not.toThrow();
  });

  it('rejects an unexpected account class', () => {
    expect(() =>
      buildAccountingOpeningReceivableWritePlan({
        fact,
        businessTimezone: 'America/Toronto',
        accountFacts: accountFacts.map((account) =>
          account.accountStableId === 'account_opening_balance_equity'
            ? { ...account, accountClass: AccountingAccountClass.REVENUE }
            : account,
        ),
      }),
    ).toThrow(
      'Opening Receivable account is not an active CAD EQUITY account',
    );
  });
});
