import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingFinancialProvider,
  AccountingJournalEntryKind,
  AccountingJournalSource,
  type AccountingFinancialProvider as AccountingFinancialProviderValue,
} from './accounting-contracts';
import {
  AccountingJournalPolicyError,
  normalizeJournalCreate,
} from './accounting-journal-policy';
import {
  assertProviderPayoutJournalAuthority,
  buildProviderPayoutWritePlan,
  hashProviderPayoutJournalWrite,
  PROVIDER_PAYOUT_SOURCE_FACT_TYPE,
  type ProviderPayoutAccountFact,
  type ProviderPayoutFactV1,
} from './accounting-provider-payout-journal-authority';

const fact = (
  overrides: Partial<ProviderPayoutFactV1> = {},
): ProviderPayoutFactV1 => ({
  payoutStableId: 'payout_uber_20260923_1',
  provider: AccountingFinancialProvider.UBER_EATS,
  storeStableId: '4750_Yonge_Street',
  payoutDate: '2026-09-23',
  destinationBankAccountStableId: 'account_cibc',
  amountCents: 120_000,
  currency: 'CAD',
  providerReference: 'UBER-2026-09-23',
  ...overrides,
});

const accountFact = (
  accountStableId: string,
  accountType: string | null,
): ProviderPayoutAccountFact => ({
  accountStableId,
  accountClass: AccountingAccountClass.ASSET,
  accountType,
  currency: 'CAD',
  isActive: true,
});

const accountFacts = (
  provider: AccountingFinancialProviderValue =
    AccountingFinancialProvider.UBER_EATS,
): ProviderPayoutAccountFact[] => {
  const pendingAccountStableId =
    provider === AccountingFinancialProvider.CLOVER
      ? 'account_clover_pending'
      : provider === AccountingFinancialProvider.FANTUAN
        ? 'account_fantuan_pending'
        : 'account_uber_pending';
  return [
    accountFact(
      pendingAccountStableId,
      AccountingAccountType.PLATFORM_WALLET,
    ),
    accountFact('account_cibc', AccountingAccountType.BANK),
  ];
};

describe('Provider payout Journal authority', () => {
  it('posts an actual bank receipt from provider pending without binding a monthly statement', () => {
    const plan = buildProviderPayoutWritePlan({
      fact: fact(),
      businessTimezone: 'America/Toronto',
      accountFacts: accountFacts(),
    });

    expect(plan.journal).toEqual({
      idempotencyKey: 'provider-payout:payout_uber_20260923_1:v1',
      kind: AccountingJournalEntryKind.TRANSFER,
      source: AccountingJournalSource.PAYMENT,
      sourceFactType: PROVIDER_PAYOUT_SOURCE_FACT_TYPE,
      sourceFactStableId: 'payout_uber_20260923_1',
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
      occurredAt: '2026-09-23T04:00:00.000Z',
      currency: 'CAD',
      memo: 'UBER_EATS payout UBER-2026-09-23',
      lines: [
        {
          accountStableId: 'account_cibc',
          debitCents: 120_000,
          memo: 'UBER_EATS payout received',
        },
        {
          accountStableId: 'account_uber_pending',
          creditCents: 120_000,
          memo: 'Clear UBER_EATS pending balance',
        },
      ],
    });
    expect(plan.authority.fact).not.toHaveProperty('documentStableId');
    expect(plan.authority.fact).not.toHaveProperty('periodStart');
    expect(plan.authority.fact).not.toHaveProperty('periodEnd');
  });

  it.each([
    [AccountingFinancialProvider.CLOVER, 'account_clover_pending'],
    [AccountingFinancialProvider.UBER_EATS, 'account_uber_pending'],
    [AccountingFinancialProvider.FANTUAN, 'account_fantuan_pending'],
  ] as const)(
    'maps %s payout to its own pending asset',
    (provider, pendingAccount) => {
      const plan = buildProviderPayoutWritePlan({
        fact: fact({ provider }),
        businessTimezone: 'America/Toronto',
        accountFacts: accountFacts(provider),
      });

      expect(plan.journal.lines[1]).toEqual(
        expect.objectContaining({
          accountStableId: pendingAccount,
          creditCents: 120_000,
        }),
      );
    },
  );

  it('requires an active CAD BANK destination account', () => {
    const invalidAccounts = accountFacts().map((account) =>
      account.accountStableId === 'account_cibc'
        ? {
            ...account,
            accountType: AccountingAccountType.PLATFORM_WALLET,
          }
        : account,
    );

    expect(() =>
      buildProviderPayoutWritePlan({
        fact: fact(),
        businessTimezone: 'America/Toronto',
        accountFacts: invalidAccounts,
      }),
    ).toThrow(
      'Provider payout destination must be an active CAD BANK asset account',
    );
  });

  it('requires a positive CAD payout amount', () => {
    expect(() =>
      buildProviderPayoutWritePlan({
        fact: fact({ amountCents: 0 }),
        businessTimezone: 'America/Toronto',
        accountFacts: accountFacts(),
      }),
    ).toThrow('amountCents must be a positive safe integer');

    expect(() =>
      buildProviderPayoutWritePlan({
        fact: fact({ currency: 'USD' }),
        businessTimezone: 'America/Toronto',
        accountFacts: accountFacts(),
      }),
    ).toThrow('Provider payout currently requires CAD currency');
  });

  it('binds the Journal exactly to the frozen payout fact and account prerequisites', () => {
    const plan = buildProviderPayoutWritePlan({
      fact: fact(),
      businessTimezone: 'America/Toronto',
      accountFacts: accountFacts(),
    });
    const normalized = normalizeJournalCreate(plan.journal);

    expect(() =>
      assertProviderPayoutJournalAuthority(normalized, plan.authority),
    ).not.toThrow();

    const tampered = normalizeJournalCreate({
      ...plan.journal,
      lines: [
        {
          ...plan.journal.lines[0],
          debitCents: 119_999,
        },
        {
          ...plan.journal.lines[1],
          creditCents: 119_999,
        },
      ],
    });
    expect(() =>
      assertProviderPayoutJournalAuthority(tampered, plan.authority),
    ).toThrow(AccountingJournalPolicyError);
    expect(hashProviderPayoutJournalWrite(normalized, plan.authority)).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });
});
