import {
  AccountingAccountClass,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
  AccountingExternalSaleGranularity,
  type CreateAccountingExternalSaleInputV1,
} from './accounting-external-sales.contract';
import {
  assertExternalSaleJournalAuthority,
  buildExternalSaleWritePlan,
  hashExternalSaleJournalWrite,
  type ExternalSaleAccountFactV1,
} from './accounting-external-sales-journal-authority';
import { normalizeAccountingExternalSale } from './accounting-external-sales.policy';
import { normalizeJournalCreate } from './accounting-journal-policy';

const saleInput = (
  overrides: Partial<CreateAccountingExternalSaleInputV1> = {},
): CreateAccountingExternalSaleInputV1 => ({
  requestId: '11111111-1111-4111-8111-111111111111',
  storeStableId: '4750_Yonge_Street',
  classificationStableId: 'external_wholesale',
  granularity: AccountingExternalSaleGranularity.TRANSACTION,
  occurredOn: '2026-06-15',
  counterpartyName: 'Supermarket A',
  currency: 'CAD',
  lines: [
    {
      description: 'Liangpi',
      quantity: '40',
      unit: '份',
      unitPriceCents: 550,
      lineAmountCents: 22_000,
      revenueAccountStableId: 'account_sales_revenue',
    },
  ],
  taxes: [
    {
      taxCode: 'HST',
      label: 'HST',
      rateBasisPoints: 1300,
      amountCents: 2860,
      liabilityAccountStableId: 'account_hst_payable',
    },
  ],
  ...overrides,
});

const account = (
  accountStableId: string,
  accountClass: string,
): ExternalSaleAccountFactV1 => ({
  accountStableId,
  accountClass,
  accountType: null,
  currency: 'CAD',
  isActive: true,
});

const baseAccounts = (): ExternalSaleAccountFactV1[] => [
  account(
    ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
    AccountingAccountClass.ASSET,
  ),
  account('account_sales_revenue', AccountingAccountClass.REVENUE),
  account('account_hst_payable', AccountingAccountClass.LIABILITY),
];

describe('Accounting External Sale Journal write authority', () => {
  it('builds a receivable-first canonical Journal from negotiated sale facts', () => {
    const fact = normalizeAccountingExternalSale(saleInput());
    const plan = buildExternalSaleWritePlan({
      fact,
      businessTimezone: 'America/Toronto',
      accountFacts: baseAccounts(),
    });

    expect(plan.journal).toMatchObject({
      idempotencyKey:
        'external-sale:extsale_11111111111141118111111111111111:v1',
      kind: AccountingJournalEntryKind.STANDARD,
      source: AccountingJournalSource.EXTERNAL_SALE,
      sourceFactType: 'accounting.external_sale.v1',
      sourceFactStableId: 'extsale_11111111111141118111111111111111',
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
      occurredAt: '2026-06-15T04:00:00.000Z',
      currency: 'CAD',
    });
    expect(plan.journal.lines).toEqual([
      expect.objectContaining({
        accountStableId: ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
        debitCents: 24_860,
        creditCents: 0,
      }),
      expect.objectContaining({
        accountStableId: 'account_sales_revenue',
        debitCents: 0,
        creditCents: 22_000,
      }),
      expect.objectContaining({
        accountStableId: 'account_hst_payable',
        debitCents: 0,
        creditCents: 2860,
      }),
    ]);
  });

  it('allows a negative discount adjustment only through sales discounts', () => {
    const fact = normalizeAccountingExternalSale(
      saleInput({
        adjustments: [
          {
            label: 'Volume allowance',
            amountCents: -1000,
            revenueAccountStableId: 'account_sales_discounts',
          },
        ],
      }),
    );
    const plan = buildExternalSaleWritePlan({
      fact,
      businessTimezone: 'America/Toronto',
      accountFacts: [
        ...baseAccounts(),
        account('account_sales_discounts', AccountingAccountClass.REVENUE),
      ],
    });

    expect(plan.journal.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountStableId: 'account_sales_discounts',
          debitCents: 1000,
          creditCents: 0,
        }),
      ]),
    );
  });

  it('rejects arbitrary revenue account injection', () => {
    const fact = normalizeAccountingExternalSale(
      saleInput({
        lines: [
          {
            description: 'Liangpi',
            quantity: '40',
            unit: '份',
            unitPriceCents: 550,
            lineAmountCents: 22_000,
            revenueAccountStableId: 'account_tip_revenue',
          },
        ],
      }),
    );

    expect(() =>
      buildExternalSaleWritePlan({
        fact,
        businessTimezone: 'America/Toronto',
        accountFacts: [
          account(
            ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
            AccountingAccountClass.ASSET,
          ),
          account('account_tip_revenue', AccountingAccountClass.REVENUE),
          account('account_hst_payable', AccountingAccountClass.LIABILITY),
        ],
      }),
    ).toThrow(
      'External Sale line revenue account is not allowed: account_tip_revenue',
    );
  });

  it('rejects commission as a Sale-recognition account', () => {
    const fact = normalizeAccountingExternalSale(
      saleInput({
        adjustments: [
          {
            label: 'Commission',
            amountCents: -1500,
            revenueAccountStableId: 'account_commission_expense',
          },
        ],
      }),
    );

    expect(() =>
      buildExternalSaleWritePlan({
        fact,
        businessTimezone: 'America/Toronto',
        accountFacts: [
          ...baseAccounts(),
          account('account_commission_expense', AccountingAccountClass.EXPENSE),
        ],
      }),
    ).toThrow('External Sale adjustment account is not allowed for its sign');
  });

  it('pins HST and zero-rated evidence to the sales-tax liability account', () => {
    const wrongTax = normalizeAccountingExternalSale(
      saleInput({
        taxes: [
          {
            taxCode: 'HST',
            label: 'HST',
            rateBasisPoints: 1300,
            amountCents: 2860,
            liabilityAccountStableId: 'account_general_operating_expense',
          },
        ],
      }),
    );
    expect(() =>
      buildExternalSaleWritePlan({
        fact: wrongTax,
        businessTimezone: 'America/Toronto',
        accountFacts: [
          account(
            ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
            AccountingAccountClass.ASSET,
          ),
          account('account_sales_revenue', AccountingAccountClass.REVENUE),
          account(
            'account_general_operating_expense',
            AccountingAccountClass.EXPENSE,
          ),
        ],
      }),
    ).toThrow('External Sale tax mapping is not allowed');

    const zeroRated = normalizeAccountingExternalSale(
      saleInput({
        taxes: [
          {
            taxCode: 'ZERO_RATED',
            label: 'Zero-rated',
            rateBasisPoints: 0,
            amountCents: 0,
            liabilityAccountStableId: 'account_hst_payable',
          },
        ],
      }),
    );
    const plan = buildExternalSaleWritePlan({
      fact: zeroRated,
      businessTimezone: 'America/Toronto',
      accountFacts: baseAccounts(),
    });
    expect(plan.journal.lines).toHaveLength(2);
  });

  it('requires exact active CAD account prerequisites', () => {
    const fact = normalizeAccountingExternalSale(saleInput());
    expect(() =>
      buildExternalSaleWritePlan({
        fact,
        businessTimezone: 'America/Toronto',
        accountFacts: baseAccounts().map((item) =>
          item.accountStableId === ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID
            ? { ...item, isActive: false }
            : item,
        ),
      }),
    ).toThrow('External Sale account is not an active CAD ASSET account');
  });

  it('rejects replacement facts until C3 reversal/correction authority exists', () => {
    const fact = normalizeAccountingExternalSale(
      saleInput({
        replacementForExternalSaleStableId: 'extsale_original',
      }),
    );
    expect(() =>
      buildExternalSaleWritePlan({
        fact,
        businessTimezone: 'America/Toronto',
        accountFacts: baseAccounts(),
      }),
    ).toThrow(
      'External Sale replacement requires the C3 reversal/correction authority',
    );
  });

  it('binds Journal content and account prerequisites into the authority hash', () => {
    const fact = normalizeAccountingExternalSale(saleInput());
    const plan = buildExternalSaleWritePlan({
      fact,
      businessTimezone: 'America/Toronto',
      accountFacts: baseAccounts(),
    });
    const normalized = normalizeJournalCreate(plan.journal);

    expect(() =>
      assertExternalSaleJournalAuthority(normalized, plan.authority),
    ).not.toThrow();

    const first = hashExternalSaleJournalWrite(normalized, plan.authority);
    const changed = normalizeJournalCreate({
      ...plan.journal,
      memo: 'tampered memo',
    });
    expect(() =>
      assertExternalSaleJournalAuthority(changed, plan.authority),
    ).toThrow('External Sale Journal does not match its frozen sale authority');
    expect(first).not.toBe(
      hashExternalSaleJournalWrite(changed, plan.authority),
    );
  });
});
