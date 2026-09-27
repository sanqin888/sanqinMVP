import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
} from './accounting-contracts';
import {
  UBER_PAYMENT_DETAILS_DESCRIPTION_HEADER_SENTINEL,
  UBER_PAYMENT_DETAILS_HEADERS,
  UBER_PAYOUT_SUMMARY_HEADERS,
} from './accounting-uber-reporting.contract';
import { parseProviderFinancialEvidence } from './accounting-provider-financial.parser';
import { parseUberAccountingApiReport } from './accounting-uber-reporting.parser';

const csvCell = (value: string) =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const csvRow = (values: readonly string[]) => values.map(csvCell).join(',');

const dataRow = (
  headers: readonly string[],
  values: Record<string, string>,
): string[] => headers.map((header) => values[header] ?? '');

describe('Uber accounting Reporting parser', () => {
  it('parses Payment Details after the provider description row as API_REPORT reconciliation evidence', () => {
    const descriptionRow = [
      ...UBER_PAYMENT_DETAILS_DESCRIPTION_HEADER_SENTINEL,
      ...new Array<string>(
        UBER_PAYMENT_DETAILS_HEADERS.length -
          UBER_PAYMENT_DETAILS_DESCRIPTION_HEADER_SENTINEL.length,
      ).fill('provider description'),
    ] as string[];
    const first = dataRow(UBER_PAYMENT_DETAILS_HEADERS, {
      'Store Name': 'SanQ Test',
      'External Store ID': '4750_Yonge_Street',
      'Store UUID': 'uber-store-test',
      'Order ID': 'order-1',
      'Workflow ID': 'workflow-1',
      'Order Date': '2026-09-10',
      'Currency Code': 'CAD',
      'Sales (excl. tax)': '10.00',
      'Tax on Sales': '1.30',
      'Marketplace Fee': '-3.00',
      'Tax on Marketplace fee': '-0.39',
      Tips: '2.00',
      'Other payments description': 'manual adjustment',
      'Other payments': '0.50',
      'Marketplace Facilitator Tax': '0.00',
      Garnishment: '0.00',
      'Total payout': '10.41',
      'Payout Date': '2026-09-14',
      'Payout Status': 'Paid',
      'Payout reference ID': 'payout-1',
    });
    const second = dataRow(UBER_PAYMENT_DETAILS_HEADERS, {
      'Store Name': 'SanQ Test',
      'External Store ID': '4750_Yonge_Street',
      'Store UUID': 'uber-store-test',
      'Order ID': 'order-2',
      'Workflow ID': 'workflow-2',
      'Order Date': '2026-09-11',
      'Currency Code': 'CAD',
      'Sales (excl. tax)': '20.00',
      'Tax on Sales': '2.60',
      'Chargeback Amount': '-1.00',
      'Marketplace Fee': '-6.00',
      'Tax on Marketplace fee': '-0.78',
      Tips: '1.00',
      'Other payments': '0.00',
      'Marketplace Facilitator Tax': '0.00',
      Garnishment: '0.00',
      'Total payout': '15.82',
      'Payout Date': '2026-09-14',
      'Payout Status': 'Paid',
      'Payout reference ID': 'payout-1',
    });

    const parsed = parseUberAccountingApiReport({
      text: [
        csvRow(descriptionRow),
        csvRow(UBER_PAYMENT_DETAILS_HEADERS),
        csvRow(first),
        csvRow(second),
      ].join('\n'),
      requestedReportType: 'PAYMENT_DETAILS_REPORT',
      providerReportType: 'PAYMENT_DETAILS_REPORT',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-25',
      providerDocumentRef: 'uberreport_test:1',
    });

    expect(parsed).toMatchObject({
      provider: AccountingFinancialProvider.UBER_EATS,
      documentType: AccountingFinancialDocumentType.API_REPORT,
      businessIdentityKey:
        'uber:api-report:UBER_PAYMENT_DETAILS_REPORT:uberreport_test:1',
      providerDocumentRef: 'uberreport_test:1',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-25',
      currency: 'CAD',
      rawMetadata: expect.objectContaining({
        evidenceKind: 'UBER_PAYMENT_DETAILS_REPORT',
        headerRowIndex: 1,
        rowCount: 2,
        payoutReferenceCount: 1,
        payoutReferences: ['payout-1'],
        otherPaymentDescriptions: ['manual adjustment'],
      }) as unknown,
    });
    expect(parsed?.rawMetadata.columnTotalsCents).toEqual(
      expect.objectContaining({
        'Sales (excl. tax)': 3000,
        'Tax on Sales': 390,
        'Marketplace Fee': -900,
        'Total payout': 2623,
      }),
    );
    expect(
      parsed?.lines.find((line) => line.rawName === 'Sales (excl. tax)'),
    ).toMatchObject({
      component: AccountingFinancialComponent.SALES,
      postingTreatment: AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
      amountCents: 3000,
    });
    expect(
      parsed?.lines.find((line) => line.rawName === 'Total payout'),
    ).toMatchObject({
      component: AccountingFinancialComponent.PAYOUT,
      postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      amountCents: 2623,
    });
    expect(
      parsed?.lines
        .filter((line) => line.rawName !== 'Total payout')
        .every(
          (line) =>
            line.postingTreatment ===
            AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
        ),
    ).toBe(true);
  });

  it('parses the observed Finance request / Payout Summary completion pairing', () => {
    const row = dataRow(UBER_PAYOUT_SUMMARY_HEADERS, {
      'Store Name': 'SanQ Test',
      'External Store ID': '4750_Yonge_Street',
      'Store UUID': 'uber-store-test',
      'Order Count': '2',
      'Count of Misc payment': '0',
      'Currency Code': 'CAD',
      'Sales (excl. tax)': '30.00',
      'Tax on Sales': '3.90',
      'Marketplace Fee': '-9.00',
      'Tax on Marketplace fee': '-1.17',
      Tips: '3.00',
      'Other payments': '0.50',
      'Marketplace Facilitator Tax': '0.00',
      Garnishment: '0.00',
      'Total payout': '26.23',
      'Payout Date': '2026-09-14',
      'Payout Status': 'Paid',
      'Payout reference ID': 'payout-1',
    });

    const parsed = parseUberAccountingApiReport({
      text: [csvRow(UBER_PAYOUT_SUMMARY_HEADERS), csvRow(row)].join('\n'),
      requestedReportType: 'FINANCE_SUMMARY_REPORT',
      providerReportType: 'PAYOUT_SUMMARY_REPORT',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-25',
      providerDocumentRef: 'uberreport_summary:1',
    });

    expect(parsed).toMatchObject({
      documentType: AccountingFinancialDocumentType.API_REPORT,
      currency: 'CAD',
      rawMetadata: expect.objectContaining({
        evidenceKind: 'UBER_PAYOUT_SUMMARY_REPORT',
        rowCount: 1,
        payoutReferences: ['payout-1'],
      }) as unknown,
    });
    expect(
      parsed?.lines.find((line) => line.rawName === 'Total payout'),
    ).toMatchObject({
      amountCents: 2623,
      postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
    });
  });

  it('is wired through the provider-financial parser only for normalized Uber API report hints', () => {
    const row = dataRow(UBER_PAYOUT_SUMMARY_HEADERS, {
      'Store UUID': 'uber-store-test',
      'Currency Code': 'CAD',
      'Total payout': '12.34',
      'Payout reference ID': 'payout-1',
    });
    const text = [csvRow(UBER_PAYOUT_SUMMARY_HEADERS), csvRow(row)].join('\n');

    expect(
      parseProviderFinancialEvidence({
        text,
        providerHint: AccountingFinancialProvider.UBER_EATS,
        reportTypeHint: 'FINANCE_SUMMARY_REPORT',
        providerReportTypeHint: 'PAYOUT_SUMMARY_REPORT',
        periodStartHint: '2026-09-01',
        periodEndHint: '2026-09-25',
        providerDocumentRefHint: 'uberreport_summary:1',
      }),
    ).toMatchObject({
      documentType: AccountingFinancialDocumentType.API_REPORT,
      businessIdentityKey:
        'uber:api-report:UBER_PAYOUT_SUMMARY_REPORT:uberreport_summary:1',
    });
  });

  it('fails closed on provider-type mismatch, malformed money, or an altered machine header', () => {
    const validRow = dataRow(UBER_PAYOUT_SUMMARY_HEADERS, {
      'Store UUID': 'uber-store-test',
      'Currency Code': 'CAD',
      'Total payout': '10.00',
      'Payout reference ID': 'payout-1',
    });
    const validText = [
      csvRow(UBER_PAYOUT_SUMMARY_HEADERS),
      csvRow(validRow),
    ].join('\n');

    expect(
      parseUberAccountingApiReport({
        text: validText,
        requestedReportType: 'FINANCE_SUMMARY_REPORT',
        providerReportType: 'PAYMENT_DETAILS_REPORT',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-25',
        providerDocumentRef: 'report:1',
      }),
    ).toBeNull();

    const malformed = [...validRow];
    const salesIndex = UBER_PAYOUT_SUMMARY_HEADERS.indexOf('Sales (excl. tax)');
    malformed[salesIndex] = 'not-money';
    expect(
      parseUberAccountingApiReport({
        text: [csvRow(UBER_PAYOUT_SUMMARY_HEADERS), csvRow(malformed)].join(
          '\n',
        ),
        requestedReportType: 'FINANCE_SUMMARY_REPORT',
        providerReportType: 'PAYOUT_SUMMARY_REPORT',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-25',
        providerDocumentRef: 'report:1',
      }),
    ).toBeNull();

    const changedHeaders = [...UBER_PAYOUT_SUMMARY_HEADERS];
    changedHeaders[0] = 'Unexpected Store Name';
    expect(
      parseUberAccountingApiReport({
        text: [csvRow(changedHeaders), csvRow(validRow)].join('\n'),
        requestedReportType: 'FINANCE_SUMMARY_REPORT',
        providerReportType: 'PAYOUT_SUMMARY_REPORT',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-25',
        providerDocumentRef: 'report:1',
      }),
    ).toBeNull();
  });
});
