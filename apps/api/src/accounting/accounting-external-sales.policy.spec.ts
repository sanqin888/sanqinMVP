import {
  ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
  AccountingExternalSaleGranularity,
  type CreateAccountingExternalSaleInputV1,
  type CreateAccountingExternalSaleSettlementInputV1,
} from './accounting-external-sales.contract';
import {
  buildAccountingExternalSalePostingDraft,
  buildAccountingExternalSaleSettlementPostingDraft,
  externalSaleExpectedLineAmountCents,
  hashAccountingExternalSaleFact,
  hashAccountingExternalSaleSettlementFact,
  normalizeAccountingExternalSale,
  normalizeAccountingExternalSaleSettlement,
  summarizeAccountingExternalSale,
} from './accounting-external-sales.policy';

const SALE_REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const SETTLEMENT_REQUEST_ID = '22222222-2222-4222-8222-222222222222';

const saleInput = (
  overrides: Partial<CreateAccountingExternalSaleInputV1> = {},
): CreateAccountingExternalSaleInputV1 => ({
  requestId: SALE_REQUEST_ID,
  storeStableId: '4750_Yonge_Street',
  classificationStableId: 'external_wholesale',
  granularity: AccountingExternalSaleGranularity.TRANSACTION,
  occurredOn: '2026-06-15',
  counterpartyName: 'Supermarket A',
  currency: 'CAD',
  lines: [
    {
      description: 'Liangpi',
      productReference: 'historical-liangpi',
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

const settlementInput = (
  overrides: Partial<CreateAccountingExternalSaleSettlementInputV1> = {},
): CreateAccountingExternalSaleSettlementInputV1 => ({
  requestId: SETTLEMENT_REQUEST_ID,
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
      accountStableId: 'account_i4hhayw0pkqzi96cfnbnunbm',
      amountCents: 8500,
      label: 'CIBC receipt',
    },
    {
      accountStableId: 'account_commission_expense',
      amountCents: 1500,
      label: 'Sales commission',
    },
  ],
  ...overrides,
});

describe('Accounting External Sales Slice A policy', () => {
  it('preserves negotiated quantity and unit price as canonical sale facts', () => {
    const fact = normalizeAccountingExternalSale(saleInput());

    expect(fact).toMatchObject({
      version: 1,
      externalSaleStableId: 'extsale_11111111111141118111111111111111',
      classificationStableId: 'external_wholesale',
      counterpartyName: 'Supermarket A',
      occurredOn: '2026-06-15',
      periodStartOn: null,
      periodEndOn: null,
      currency: 'CAD',
    });
    expect(fact.lines).toEqual([
      expect.objectContaining({
        description: 'Liangpi',
        productReference: 'historical-liangpi',
        quantity: '40',
        unit: '份',
        unitPriceCents: 550,
        lineAmountCents: 22_000,
        revenueAccountStableId: 'account_sales_revenue',
      }),
    ]);
    expect(summarizeAccountingExternalSale(fact)).toEqual({
      lineSubtotalCents: 22_000,
      adjustmentTotalCents: 0,
      taxTotalCents: 2860,
      totalReceivableCents: 24_860,
    });
  });

  it('keeps classification data-driven instead of enumerating each sales mode', () => {
    const fact = normalizeAccountingExternalSale(
      saleInput({ classificationStableId: 'external_school_catering' }),
    );

    expect(fact.classificationStableId).toBe('external_school_catering');
  });

  it('uses exact decimal quantity arithmetic with deterministic half-up cent rounding', () => {
    expect(externalSaleExpectedLineAmountCents('12.5', 1399)).toBe(17_488);

    const fact = normalizeAccountingExternalSale(
      saleInput({
        lines: [
          {
            description: 'Bulk prepared food',
            quantity: '12.5000',
            unit: 'kg',
            unitPriceCents: 1399,
            lineAmountCents: 17_488,
            revenueAccountStableId: 'account_sales_revenue',
          },
        ],
        taxes: [],
      }),
    );

    expect(fact.lines[0]?.quantity).toBe('12.5');
  });

  it('rejects a frozen line amount that does not reconcile to quantity x negotiated unit price', () => {
    expect(() =>
      normalizeAccountingExternalSale(
        saleInput({
          lines: [
            {
              description: 'Liangpi',
              quantity: '40',
              unit: '份',
              unitPriceCents: 550,
              lineAmountCents: 21_999,
              revenueAccountStableId: 'account_sales_revenue',
            },
          ],
        }),
      ),
    ).toThrow(
      'lineAmountCents must equal quantity x unitPriceCents after half-up cent rounding',
    );
  });

  it('supports signed generic sale adjustments without a dedicated discount field', () => {
    const fact = normalizeAccountingExternalSale(
      saleInput({
        adjustments: [
          {
            label: 'Volume allowance',
            amountCents: -1000,
            revenueAccountStableId: 'account_sales_discounts',
          },
          {
            label: 'Packaging',
            amountCents: 500,
            revenueAccountStableId: 'account_other_operating_revenue',
          },
        ],
      }),
    );

    expect(summarizeAccountingExternalSale(fact)).toEqual({
      lineSubtotalCents: 22_000,
      adjustmentTotalCents: -500,
      taxTotalCents: 2860,
      totalReceivableCents: 24_360,
    });
  });

  it('rejects adjustments that erase the commercial sale value even when tax is present', () => {
    expect(() =>
      normalizeAccountingExternalSale(
        saleInput({
          adjustments: [
            {
              label: 'Invalid full offset',
              amountCents: -22_000,
              revenueAccountStableId: 'account_sales_discounts',
            },
          ],
        }),
      ),
    ).toThrow(
      'External Sale must retain positive commercial value after adjustments',
    );
  });

  it('requires explicit summary coverage without inventing transaction-level precision', () => {
    const fact = normalizeAccountingExternalSale(
      saleInput({
        granularity: AccountingExternalSaleGranularity.PERIOD_SUMMARY,
        occurredOn: '2026-06-30',
        periodStartOn: '2026-06-01',
        periodEndOn: '2026-06-30',
      }),
    );

    expect(fact).toMatchObject({
      granularity: 'PERIOD_SUMMARY',
      periodStartOn: '2026-06-01',
      periodEndOn: '2026-06-30',
    });

    expect(() =>
      normalizeAccountingExternalSale(
        saleInput({
          granularity: AccountingExternalSaleGranularity.DAILY_SUMMARY,
          periodStartOn: '2026-06-01',
          periodEndOn: '2026-06-02',
        }),
      ),
    ).toThrow(
      'DAILY_SUMMARY requires periodStartOn and periodEndOn to be the same day',
    );
  });

  it('builds sale recognition through Accounts Receivable, independent of settlement method', () => {
    const draft = buildAccountingExternalSalePostingDraft(
      normalizeAccountingExternalSale(saleInput()),
    );

    expect(draft).toMatchObject({
      kind: 'STANDARD',
      source: 'EXTERNAL_SALE',
      sourceFactType: 'accounting.external_sale.v1',
      sourceFactVersion: 1,
      occurredOn: '2026-06-15',
      currency: 'CAD',
    });
    expect(draft.lines).toEqual([
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

  it('keeps explicit zero-tax evidence without creating a zero-value Journal line', () => {
    const fact = normalizeAccountingExternalSale(
      saleInput({
        taxes: [
          {
            taxCode: 'ZERO_RATED',
            label: 'Zero-rated sales tax',
            rateBasisPoints: 0,
            amountCents: 0,
            liabilityAccountStableId: 'account_hst_payable',
          },
        ],
      }),
    );
    const draft = buildAccountingExternalSalePostingDraft(fact);

    expect(fact.taxes[0]?.amountCents).toBe(0);
    expect(draft.lines).toHaveLength(2);
  });

  it('keeps tax rate descriptive and the explicit tax amount authoritative', () => {
    const fact = normalizeAccountingExternalSale(
      saleInput({
        taxes: [
          {
            taxCode: 'HST',
            label: 'Reviewed HST',
            rateBasisPoints: 1300,
            amountCents: 2800,
            liabilityAccountStableId: 'account_hst_payable',
          },
        ],
      }),
    );

    expect(fact.taxes[0]).toMatchObject({
      rateBasisPoints: 1300,
      amountCents: 2800,
    });
    expect(summarizeAccountingExternalSale(fact).totalReceivableCents).toBe(
      24_800,
    );
  });

  it('normalizes generic settlement components and closes the same receivable amount', () => {
    const fact = normalizeAccountingExternalSaleSettlement(settlementInput());
    const draft = buildAccountingExternalSaleSettlementPostingDraft(fact);

    expect(fact).toMatchObject({
      version: 1,
      settlementStableId: 'extsettlement_22222222222242228222222222222222',
      settlementOn: '2026-06-20',
      counterpartyName: 'Supermarket A',
    });
    expect(draft).toMatchObject({
      source: 'EXTERNAL_SALE',
      sourceFactType: 'accounting.external_sale_settlement.v1',
      sourceFactVersion: 1,
    });
    expect(draft.lines).toEqual([
      expect.objectContaining({
        accountStableId: 'account_i4hhayw0pkqzi96cfnbnunbm',
        debitCents: 8500,
        creditCents: 0,
      }),
      expect.objectContaining({
        accountStableId: 'account_commission_expense',
        debitCents: 1500,
        creditCents: 0,
      }),
      expect.objectContaining({
        accountStableId: ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
        debitCents: 0,
        creditCents: 10_000,
      }),
    ]);
  });

  it('allows settlement composition to add a new explicit account without a sales-mode schema field', () => {
    const fact = normalizeAccountingExternalSaleSettlement(
      settlementInput({
        components: [
          {
            accountStableId: 'account_primary_bank',
            amountCents: 9200,
            label: 'Bank receipt',
          },
          {
            accountStableId: 'account_general_operating_expense',
            amountCents: 800,
            label: 'Reviewed channel fee',
          },
        ],
      }),
    );

    expect(
      fact.components.map((component) => component.accountStableId),
    ).toEqual(['account_primary_bank', 'account_general_operating_expense']);
  });

  it('rejects settlement compositions that do not reconcile to receivable allocations', () => {
    expect(() =>
      normalizeAccountingExternalSaleSettlement(
        settlementInput({
          components: [
            {
              accountStableId: 'account_primary_bank',
              amountCents: 9999,
              label: 'Bank receipt',
            },
          ],
        }),
      ),
    ).toThrow(
      'settlement components (9999) must equal receivable allocations (10000)',
    );
  });

  it('rejects duplicate receivable allocations and AR self-clearing components', () => {
    expect(() =>
      normalizeAccountingExternalSaleSettlement(
        settlementInput({
          allocations: [
            {
              externalSaleStableId: 'extsale_1',
              amountCents: 5000,
            },
            {
              externalSaleStableId: 'extsale_1',
              amountCents: 5000,
            },
          ],
        }),
      ),
    ).toThrow(
      'External Sale settlement cannot allocate the same sale more than once',
    );

    expect(() =>
      normalizeAccountingExternalSaleSettlement(
        settlementInput({
          components: [
            {
              accountStableId: ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
              amountCents: 10_000,
              label: 'Invalid self-clear',
            },
          ],
        }),
      ),
    ).toThrow('settlement component cannot post back into Accounts Receivable');
  });

  it('uses stable normalized facts for deterministic idempotency hashes', () => {
    const saleA = normalizeAccountingExternalSale(saleInput());
    const saleB = normalizeAccountingExternalSale(
      saleInput({ currency: 'cad' }),
    );
    expect(hashAccountingExternalSaleFact(saleA)).toBe(
      hashAccountingExternalSaleFact(saleB),
    );

    const settlementA =
      normalizeAccountingExternalSaleSettlement(settlementInput());
    const settlementB = normalizeAccountingExternalSaleSettlement(
      settlementInput({ currency: 'cad' }),
    );
    expect(hashAccountingExternalSaleSettlementFact(settlementA)).toBe(
      hashAccountingExternalSaleSettlementFact(settlementB),
    );
  });

  it('keeps External Sales v1 on CAD until multi-currency accounting is explicitly designed', () => {
    expect(() =>
      normalizeAccountingExternalSale(saleInput({ currency: 'USD' })),
    ).toThrow('External Sales v1 currently requires CAD currency');
  });
});
