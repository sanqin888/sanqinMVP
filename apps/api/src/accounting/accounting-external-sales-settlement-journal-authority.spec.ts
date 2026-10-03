import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
  type CreateAccountingExternalSaleSettlementInputV1,
} from './accounting-external-sales.contract';
import {
  assertExternalSaleSettlementJournalAuthority,
  buildExternalSaleSettlementWritePlan,
  calculateExternalSaleJournalReceivableCents,
  hashExternalSaleSettlementJournalWrite,
  type ExternalSaleSettlementAccountFactV1,
  type ExternalSaleSettlementReceivableSnapshotV1,
} from './accounting-external-sales-settlement-journal-authority';
import { normalizeAccountingExternalSaleSettlement } from './accounting-external-sales.policy';
import { normalizeJournalCreate } from './accounting-journal-policy';

const settlementInput = (
  overrides: Partial<CreateAccountingExternalSaleSettlementInputV1> = {},
): CreateAccountingExternalSaleSettlementInputV1 => ({
  requestId: '22222222-2222-4222-8222-222222222222',
  storeStableId: '4750_Yonge_Street',
  settlementOn: '2026-06-20',
  counterpartyName: 'Supermarket A',
  currency: 'CAD',
  allocations: [
    {
      externalSaleStableId: 'extsale_11111111111141118111111111111111',
      amountCents: 10_000,
    },
  ],
  components: [
    {
      accountStableId: 'account_primary_bank',
      amountCents: 8200,
      label: 'Bank receipt',
    },
    {
      accountStableId: 'account_commission_expense',
      amountCents: 1500,
      label: 'Sales commission',
    },
    {
      accountStableId: 'account_hst_recoverable',
      amountCents: 300,
      label: 'Recoverable HST on commission',
    },
  ],
  ...overrides,
});

const account = (
  accountStableId: string,
  accountClass: string,
  accountType: string | null,
): ExternalSaleSettlementAccountFactV1 => ({
  accountStableId,
  accountClass,
  accountType,
  currency: 'CAD',
  isActive: true,
});

const accountFacts = (): ExternalSaleSettlementAccountFactV1[] => [
  account(
    ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
    AccountingAccountClass.ASSET,
    null,
  ),
  account(
    'account_primary_bank',
    AccountingAccountClass.ASSET,
    AccountingAccountType.BANK,
  ),
  account('account_commission_expense', AccountingAccountClass.EXPENSE, null),
  account('account_hst_recoverable', AccountingAccountClass.ASSET, null),
];

const snapshot = (
  overrides: Partial<ExternalSaleSettlementReceivableSnapshotV1> = {},
): ExternalSaleSettlementReceivableSnapshotV1 => ({
  externalSaleStableId: 'extsale_11111111111141118111111111111111',
  saleOccurredOn: '2026-06-15',
  storeStableId: '4750_Yonge_Street',
  counterpartyName: 'Supermarket A',
  currency: 'CAD',
  saleFactHash: 'sale_fact_hash_1',
  saleJournalEntryStableId: 'journal_sale_1',
  totalReceivableCents: 24_860,
  settledBeforeCents: 5000,
  outstandingBeforeCents: 19_860,
  ...overrides,
});

describe('Accounting External Sale Settlement Journal authority', () => {
  it('takes receivable principal only from one positive canonical Journal AR debit', () => {
    expect(
      calculateExternalSaleJournalReceivableCents([
        {
          accountStableId: 'account_accounts_receivable',
          debitCents: 24_860,
          creditCents: 0,
        },
        {
          accountStableId: 'account_sales_revenue',
          debitCents: 0,
          creditCents: 22_000,
        },
      ]),
    ).toBe(24_860);

    expect(() =>
      calculateExternalSaleJournalReceivableCents([
        {
          accountStableId: 'account_accounts_receivable',
          debitCents: 10_000,
          creditCents: 0,
        },
        {
          accountStableId: 'account_accounts_receivable',
          debitCents: 14_860,
          creditCents: 0,
        },
      ]),
    ).toThrow(
      'External Sale canonical Journal must contain exactly one Accounts Receivable line',
    );

    expect(() =>
      calculateExternalSaleJournalReceivableCents([
        {
          accountStableId: 'account_accounts_receivable',
          debitCents: 0,
          creditCents: 24_860,
        },
      ]),
    ).toThrow(
      'External Sale canonical Journal has an invalid Accounts Receivable debit',
    );
  });

  it('posts a partial settlement through bank, commission, HST recoverable, and AR', () => {
    const fact = normalizeAccountingExternalSaleSettlement(settlementInput());
    const plan = buildExternalSaleSettlementWritePlan({
      fact,
      businessTimezone: 'America/Toronto',
      accountFacts: accountFacts(),
      receivableSnapshots: [snapshot()],
    });

    expect(plan.journal).toMatchObject({
      idempotencyKey:
        'external-sale-settlement:extsettlement_22222222222242228222222222222222:v1',
      kind: AccountingJournalEntryKind.STANDARD,
      source: AccountingJournalSource.EXTERNAL_SALE,
      sourceFactType: 'accounting.external_sale_settlement.v1',
      sourceFactStableId: 'extsettlement_22222222222242228222222222222222',
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
      occurredAt: '2026-06-20T04:00:00.000Z',
      currency: 'CAD',
    });
    expect(plan.journal.lines).toEqual([
      expect.objectContaining({
        accountStableId: 'account_primary_bank',
        debitCents: 8200,
        creditCents: 0,
      }),
      expect.objectContaining({
        accountStableId: 'account_commission_expense',
        debitCents: 1500,
        creditCents: 0,
      }),
      expect.objectContaining({
        accountStableId: 'account_hst_recoverable',
        debitCents: 300,
        creditCents: 0,
      }),
      expect.objectContaining({
        accountStableId: ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
        debitCents: 0,
        creditCents: 10_000,
      }),
    ]);
    expect(plan.authority.receivablePrerequisites[0]).toMatchObject({
      totalReceivableCents: 24_860,
      settledBeforeCents: 5000,
      outstandingBeforeCents: 19_860,
      allocationCents: 10_000,
    });
  });

  it('accepts active CAD CASH as an explicit collection component', () => {
    const fact = normalizeAccountingExternalSaleSettlement(
      settlementInput({
        components: [
          {
            accountStableId: 'account_store_cash',
            amountCents: 10_000,
            label: 'Cash receipt',
          },
        ],
      }),
    );
    const plan = buildExternalSaleSettlementWritePlan({
      fact,
      businessTimezone: 'America/Toronto',
      accountFacts: [
        account(
          ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
          AccountingAccountClass.ASSET,
          null,
        ),
        account(
          'account_store_cash',
          AccountingAccountClass.ASSET,
          AccountingAccountType.CASH,
        ),
      ],
      receivableSnapshots: [snapshot()],
    });

    expect(plan.journal.lines[0]).toMatchObject({
      accountStableId: 'account_store_cash',
      debitCents: 10_000,
    });
  });

  it('rejects PLATFORM_WALLET and unrelated ledger accounts as settlement components', () => {
    const walletFact = normalizeAccountingExternalSaleSettlement(
      settlementInput({
        components: [
          {
            accountStableId: 'account_uber_pending',
            amountCents: 10_000,
            label: 'Invalid wallet',
          },
        ],
      }),
    );
    expect(() =>
      buildExternalSaleSettlementWritePlan({
        fact: walletFact,
        businessTimezone: 'America/Toronto',
        accountFacts: [
          account(
            ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
            AccountingAccountClass.ASSET,
            null,
          ),
          account(
            'account_uber_pending',
            AccountingAccountClass.ASSET,
            AccountingAccountType.PLATFORM_WALLET,
          ),
        ],
        receivableSnapshots: [snapshot()],
      }),
    ).toThrow(
      'External Sale settlement account is not allowed: account_uber_pending',
    );

    const payrollFact = normalizeAccountingExternalSaleSettlement(
      settlementInput({
        components: [
          {
            accountStableId: 'account_payroll_wages_expense',
            amountCents: 10_000,
            label: 'Invalid payroll expense',
          },
        ],
      }),
    );
    expect(() =>
      buildExternalSaleSettlementWritePlan({
        fact: payrollFact,
        businessTimezone: 'America/Toronto',
        accountFacts: [
          account(
            ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
            AccountingAccountClass.ASSET,
            null,
          ),
          account(
            'account_payroll_wages_expense',
            AccountingAccountClass.EXPENSE,
            null,
          ),
        ],
        receivableSnapshots: [snapshot()],
      }),
    ).toThrow(
      'External Sale settlement account is not allowed: account_payroll_wages_expense',
    );
  });

  it('requires recoverable HST to be paired with explicit settlement expense principal', () => {
    const fact = normalizeAccountingExternalSaleSettlement(
      settlementInput({
        components: [
          {
            accountStableId: 'account_hst_recoverable',
            amountCents: 10_000,
            label: 'Invalid standalone recoverable tax',
          },
        ],
      }),
    );
    expect(() =>
      buildExternalSaleSettlementWritePlan({
        fact,
        businessTimezone: 'America/Toronto',
        accountFacts: [
          account(
            ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
            AccountingAccountClass.ASSET,
            null,
          ),
          account(
            'account_hst_recoverable',
            AccountingAccountClass.ASSET,
            null,
          ),
        ],
        receivableSnapshots: [snapshot()],
      }),
    ).toThrow(
      'External Sale settlement recoverable tax requires a settlement expense component',
    );
  });

  it('requires exact active CAD HST recoverable shape', () => {
    const fact = normalizeAccountingExternalSaleSettlement(
      settlementInput({
        components: [
          {
            accountStableId: 'account_hst_recoverable',
            amountCents: 10_000,
            label: 'Invalid HST shape',
          },
        ],
      }),
    );
    expect(() =>
      buildExternalSaleSettlementWritePlan({
        fact,
        businessTimezone: 'America/Toronto',
        accountFacts: [
          account(
            ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
            AccountingAccountClass.ASSET,
            null,
          ),
          account(
            'account_hst_recoverable',
            AccountingAccountClass.ASSET,
            AccountingAccountType.BANK,
          ),
        ],
        receivableSnapshots: [snapshot()],
      }),
    ).toThrow(
      'External Sale settlement HST recoverable must be an ASSET account with no operational type',
    );
  });

  it('rejects allocation above the frozen outstanding receivable', () => {
    const fact = normalizeAccountingExternalSaleSettlement(settlementInput());
    expect(() =>
      buildExternalSaleSettlementWritePlan({
        fact,
        businessTimezone: 'America/Toronto',
        accountFacts: accountFacts(),
        receivableSnapshots: [
          snapshot({
            settledBeforeCents: 20_000,
            outstandingBeforeCents: 4860,
          }),
        ],
      }),
    ).toThrow(
      'External Sale settlement allocation exceeds outstanding receivable',
    );
  });

  it('rejects counterparty/store/date drift from the recognized sale', () => {
    const fact = normalizeAccountingExternalSaleSettlement(settlementInput());
    expect(() =>
      buildExternalSaleSettlementWritePlan({
        fact,
        businessTimezone: 'America/Toronto',
        accountFacts: accountFacts(),
        receivableSnapshots: [
          snapshot({ counterpartyName: 'Different Counterparty' }),
        ],
      }),
    ).toThrow(
      'External Sale settlement allocation does not match store/counterparty/currency',
    );

    expect(() =>
      buildExternalSaleSettlementWritePlan({
        fact,
        businessTimezone: 'America/Toronto',
        accountFacts: accountFacts(),
        receivableSnapshots: [snapshot({ saleOccurredOn: '2026-06-21' })],
      }),
    ).toThrow('External Sale settlement date precedes the sale');
  });

  it('rejects replacement settlement facts until C3', () => {
    const fact = normalizeAccountingExternalSaleSettlement(
      settlementInput({
        replacementForSettlementStableId: 'extsettlement_original',
      }),
    );
    expect(() =>
      buildExternalSaleSettlementWritePlan({
        fact,
        businessTimezone: 'America/Toronto',
        accountFacts: accountFacts(),
        receivableSnapshots: [snapshot()],
      }),
    ).toThrow(
      'External Sale settlement replacement requires the C3 reversal/correction authority',
    );
  });

  it('binds Journal content and frozen receivable/account prerequisites into its authority hash', () => {
    const fact = normalizeAccountingExternalSaleSettlement(settlementInput());
    const plan = buildExternalSaleSettlementWritePlan({
      fact,
      businessTimezone: 'America/Toronto',
      accountFacts: accountFacts(),
      receivableSnapshots: [snapshot()],
    });
    const normalized = normalizeJournalCreate(plan.journal);

    expect(() =>
      assertExternalSaleSettlementJournalAuthority(normalized, plan.authority),
    ).not.toThrow();

    const originalHash = hashExternalSaleSettlementJournalWrite(
      normalized,
      plan.authority,
    );
    const changed = normalizeJournalCreate({
      ...plan.journal,
      memo: 'tampered settlement memo',
    });
    expect(() =>
      assertExternalSaleSettlementJournalAuthority(changed, plan.authority),
    ).toThrow(
      'External Sale settlement Journal does not match its frozen settlement authority',
    );
    expect(originalHash).not.toBe(
      hashExternalSaleSettlementJournalWrite(changed, plan.authority),
    );
  });
});
