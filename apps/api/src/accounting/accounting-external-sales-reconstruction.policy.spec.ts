import {
  accountingExternalSaleReconstructionPlanHash,
  buildAccountingExternalSaleReconstructionInput,
  parseAccountingExternalSaleCustomerStatement,
} from './accounting-external-sales-reconstruction.policy';

const statementRows = (): string[][] => [
  ['', '', '', '', '', '', '', '结算日期：', '2026-08-07T00:00:00.000Z'],
  [],
  [],
  [],
  ['', '', 'Customer Statement'],
  ['', '', 'Asia FoodMart'],
  ['', '', '2150 McNicoll Ave'],
  ['', '', 'Date', 'Item', 'Price(CAD)', 'Quantity', 'Amout', 'Tax', 'Subtotal'],
  ['', '', '2026-06-01T00:00:00.000Z', 'SanQin Rice Noodle', '3', '10', '30', '3.90', '33.90'],
  ['', '', '2026-06-02T00:00:00.000Z', 'SanQin Rice Noodle', '3', '-2', '-6', '', '-6'],
  ['', '', '2026-06-02T00:00:00.000Z', 'SanQin Rice Noodle', '4', '5', '20', '2.60', '22.60'],
  ['', '', 'Total', '', '', '13', '44', '6.50', '50.50'],
  ['', '', 'Paid Amount', '', '', '', '', '', '0'],
  ['', '', 'Balance Due', '', '', '', '', '', '50.50'],
];

describe('External Sales historical reconstruction policy', () => {
  it('reconciles Customer Statement controls and nets negative source rows by item and negotiated price', () => {
    const statement = parseAccountingExternalSaleCustomerStatement(
      statementRows(),
    );

    expect(statement).toEqual({
      counterpartyName: 'Asia FoodMart',
      periodStartOn: '2026-06-01',
      periodEndOn: '2026-06-02',
      sourceRowCount: 3,
      sourceQuantity: '13',
      lineSubtotalCents: 4400,
      taxTotalCents: 650,
      totalReceivableCents: 5050,
      paidAmountCents: 0,
      balanceDueCents: 5050,
      saleLines: [
        {
          description: 'SanQin Rice Noodle',
          quantity: '8',
          unitPriceCents: 300,
          lineAmountCents: 2400,
        },
        {
          description: 'SanQin Rice Noodle',
          quantity: '5',
          unitPriceCents: 400,
          lineAmountCents: 2000,
        },
      ],
    });
  });

  it('builds one PERIOD_SUMMARY sale and keeps the deterministic request id stable across classification edits', () => {
    const statement = parseAccountingExternalSaleCustomerStatement(
      statementRows(),
    );
    const first = buildAccountingExternalSaleReconstructionInput({
      artifactStableId: 'acctart_statement',
      contentHash: 'a'.repeat(64),
      originalFilename: '丰亚结算单26年6月.xlsx',
      classificationStableId: 'external_supermarket',
      storeStableId: '4750_Yonge_Street',
      statement,
    });
    const editedClassification = buildAccountingExternalSaleReconstructionInput({
      artifactStableId: 'acctart_statement',
      contentHash: 'a'.repeat(64),
      originalFilename: '丰亚结算单26年6月.xlsx',
      classificationStableId: 'external_wholesale',
      storeStableId: '4750_Yonge_Street',
      statement,
    });

    expect(first.requestId).toBe(editedClassification.requestId);
    expect(first).toMatchObject({
      granularity: 'PERIOD_SUMMARY',
      occurredOn: '2026-06-02',
      periodStartOn: '2026-06-01',
      periodEndOn: '2026-06-02',
      counterpartyName: 'Asia FoodMart',
      classificationStableId: 'external_supermarket',
      lines: [
        {
          quantity: '8',
          unit: 'unit',
          unitPriceCents: 300,
          lineAmountCents: 2400,
          revenueAccountStableId: 'account_sales_revenue',
        },
        {
          quantity: '5',
          unit: 'unit',
          unitPriceCents: 400,
          lineAmountCents: 2000,
          revenueAccountStableId: 'account_sales_revenue',
        },
      ],
      taxes: [
        {
          taxCode: 'HST',
          amountCents: 650,
          liabilityAccountStableId: 'account_hst_payable',
        },
      ],
    });

    const firstHash = accountingExternalSaleReconstructionPlanHash({
      accountingStartDate: '2026-06-01',
      artifactStableId: 'acctart_statement',
      contentHash: 'a'.repeat(64),
      proposedSale: first,
      source: statement,
    });
    const editedHash = accountingExternalSaleReconstructionPlanHash({
      accountingStartDate: '2026-06-01',
      artifactStableId: 'acctart_statement',
      contentHash: 'a'.repeat(64),
      proposedSale: editedClassification,
      source: statement,
    });
    expect(firstHash).not.toBe(editedHash);
  });

  it('fails closed when source control totals do not reconcile', () => {
    const rows = statementRows();
    rows[11][8] = '50.51';

    expect(() =>
      parseAccountingExternalSaleCustomerStatement(rows),
    ).toThrow('Customer Statement subtotal total does not reconcile');
  });
});
