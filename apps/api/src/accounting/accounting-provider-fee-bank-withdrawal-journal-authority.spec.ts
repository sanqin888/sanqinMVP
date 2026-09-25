import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingFinancialProvider,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  AccountingJournalPolicyError,
  normalizeJournalCreate,
} from './accounting-journal-policy';
import {
  assertProviderFeeBankWithdrawalJournalAuthority,
  buildProviderFeeBankWithdrawalWritePlan,
  hashProviderFeeBankWithdrawalJournalWrite,
  PROVIDER_FEE_BANK_WITHDRAWAL_SOURCE_FACT_TYPE,
  type ProviderFeeBankWithdrawalAccountFact,
  type ProviderFeeBankWithdrawalFactV1,
} from './accounting-provider-fee-bank-withdrawal-journal-authority';
import { CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID } from './accounting-provider-fee-clearing.contract';

const fact = (
  overrides: Partial<ProviderFeeBankWithdrawalFactV1> = {},
): ProviderFeeBankWithdrawalFactV1 => ({
  decisionStableId: 'feebankrow_test_1',
  provider: AccountingFinancialProvider.CLOVER,
  storeStableId: '4750_Yonge_Street',
  withdrawalDate: '2026-07-02',
  bankAccountStableId: 'account_cibc',
  amountCents: 5931,
  currency: 'CAD',
  ...overrides,
});

const accountFacts = (): ProviderFeeBankWithdrawalAccountFact[] => [
  {
    accountStableId: CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
    accountClass: AccountingAccountClass.LIABILITY,
    accountType: null,
    currency: 'CAD',
    isActive: true,
  },
  {
    accountStableId: 'account_cibc',
    accountClass: AccountingAccountClass.ASSET,
    accountType: AccountingAccountType.BANK,
    currency: 'CAD',
    isActive: true,
  },
];

describe('Provider fee bank withdrawal Journal authority', () => {
  it('clears Clover fee payable against the actual bank withdrawal without recreating expense', () => {
    const plan = buildProviderFeeBankWithdrawalWritePlan({
      fact: fact(),
      businessTimezone: 'America/Toronto',
      accountFacts: accountFacts(),
    });

    expect(plan.journal).toEqual({
      idempotencyKey: 'provider-fee-bank-withdrawal:feebankrow_test_1:v1',
      kind: AccountingJournalEntryKind.TRANSFER,
      source: AccountingJournalSource.PAYMENT,
      sourceFactType: PROVIDER_FEE_BANK_WITHDRAWAL_SOURCE_FACT_TYPE,
      sourceFactStableId: 'feebankrow_test_1',
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
      occurredAt: '2026-07-02T04:00:00.000Z',
      currency: 'CAD',
      memo: 'Clover fee bank withdrawal feebankrow_test_1',
      lines: [
        {
          accountStableId: CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
          debitCents: 5931,
          memo: 'Clear Clover fee payable',
        },
        {
          accountStableId: 'account_cibc',
          creditCents: 5931,
          memo: 'Clover fee withdrawn from bank',
        },
      ],
    });
    expect(
      plan.journal.lines.some((line) =>
        line.accountStableId.includes('expense'),
      ),
    ).toBe(false);
  });

  it('requires the dedicated Clover fee payable liability and an active CAD bank', () => {
    expect(() =>
      buildProviderFeeBankWithdrawalWritePlan({
        fact: fact(),
        businessTimezone: 'America/Toronto',
        accountFacts: accountFacts().map((account) =>
          account.accountStableId === CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID
            ? { ...account, accountClass: AccountingAccountClass.ASSET }
            : account,
        ),
      }),
    ).toThrow('Clover fee payable must be an active CAD liability account');

    expect(() =>
      buildProviderFeeBankWithdrawalWritePlan({
        fact: fact(),
        businessTimezone: 'America/Toronto',
        accountFacts: accountFacts().map((account) =>
          account.accountStableId === 'account_cibc'
            ? { ...account, accountType: AccountingAccountType.PLATFORM_WALLET }
            : account,
        ),
      }),
    ).toThrow('Provider fee withdrawal bank must be an active CAD BANK');
  });

  it('binds the Journal exactly to the frozen withdrawal fact and prerequisites', () => {
    const plan = buildProviderFeeBankWithdrawalWritePlan({
      fact: fact(),
      businessTimezone: 'America/Toronto',
      accountFacts: accountFacts(),
    });
    const normalized = normalizeJournalCreate(plan.journal);

    expect(() =>
      assertProviderFeeBankWithdrawalJournalAuthority(
        normalized,
        plan.authority,
      ),
    ).not.toThrow();

    const tampered = normalizeJournalCreate({
      ...plan.journal,
      lines: [
        {
          ...plan.journal.lines[0],
          debitCents: 5930,
        },
        {
          ...plan.journal.lines[1],
          creditCents: 5930,
        },
      ],
    });
    expect(() =>
      assertProviderFeeBankWithdrawalJournalAuthority(
        tampered,
        plan.authority,
      ),
    ).toThrow(AccountingJournalPolicyError);
    expect(
      hashProviderFeeBankWithdrawalJournalWrite(normalized, plan.authority),
    ).toMatch(/^[a-f0-9]{64}$/);
  });
});
