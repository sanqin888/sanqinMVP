import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole,
} from '@prisma/client';
import { CLOVER_STATEMENT_RAW_CODES } from './accounting-clover-statement.contract';
import { parseProviderFinancialEvidence } from './accounting-provider-financial.parser';

function lineByName(
  parsed: NonNullable<ReturnType<typeof parseProviderFinancialEvidence>>,
  name: string,
) {
  return parsed.lines.find((line) => line.rawName === name);
}

describe('accounting provider financial parser', () => {
  it('parses Clover Closeout Batch Totals only as reconciliation evidence', () => {
    const parsed = parseProviderFinancialEvidence({
      providerHint: AccountingFinancialProvider.CLOVER,
      documentTypeHint: AccountingFinancialDocumentType.BATCH_CONTROL,
      emailSubject: 'MID 29351880018 Closeout Report for Sep 6, 2026',
      text: `
Closeout Batch Report
Created:
Sep 7, 2026 01:30 AM
Batch ID:
097NYJ27P2HZM
Batch Totals
Type Count Total
Sales 5 $57.21
Refunds 0 $0.00
Net 5 $57.21
Tax 0 $0.00
Tips 4 $3.84
Card Type Totals
Type Count Total
MC 3 $19.90
Server Totals
YULIN SONG
Type Count Total
Sales 1 $0.66
Refunds 0 $0.00
Net 1 $0.66
Tax 0 $0.00
Tips 0 $0.00
Employee
Type Count Total
Sales 4 $56.55
Refunds 0 $0.00
Net 4 $56.55
Tax 0 $0.00
Tips 4 $3.84
`,
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        provider: AccountingFinancialProvider.CLOVER,
        documentType: AccountingFinancialDocumentType.BATCH_CONTROL,
        businessIdentityKey: 'clover:batch:097NYJ27P2HZM',
        periodStart: '2026-09-06',
        periodEnd: '2026-09-06',
      }),
    );
    expect(parsed?.lines).toHaveLength(5);
    expect(lineByName(parsed!, 'Sales')).toEqual(
      expect.objectContaining({
        amountCents: 5721,
        postingTreatment:
          AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
      }),
    );
    expect(lineByName(parsed!, 'Net')).toEqual(
      expect.objectContaining({
        amountCents: 5721,
        component: AccountingFinancialComponent.CONTROL_TOTAL,
        postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      }),
    );
  });

  const modernCloverExtraction = (params: {
    amountSubmittedCents: number;
    accountFeesCents: number;
    amountProcessedCents: number;
    feeSummaryFeesCents: number;
    serviceChargesCents: number;
    cardProcessingFeesCents: number;
    equipmentDescription: string;
    networkRows: Array<{
      invoice: string;
      description: string;
      amountCents: number;
    }>;
  }) => {
    let lineNo = 0;
    const line = (
      page: number,
      text: string,
      left: number,
      top: number,
      width = 0.08,
      height = 0.02,
    ) => ({
      lineId: `p${page}-l${++lineNo}`,
      page,
      text,
      confidence: null,
      geometry: { left, top, width, height },
    });
    const money = (cents: number) => {
      const sign = cents < 0 ? '-' : '';
      const absolute = Math.abs(cents);
      return `${sign}$${(absolute / 100).toFixed(2)}`;
    };
    const feeRow = (
      page: number,
      top: number,
      invoice: string,
      description: string,
      type: 'Fees' | 'Service Charges',
      amountCents: number,
      taxCents?: number,
    ) => [
      line(page, invoice, 0.27, top, 0.06, 0.012),
      line(page, description, 0.36, top, 0.2, 0.012),
      line(page, type, 0.64, top, 0.1, 0.012),
      ...(taxCents == null
        ? []
        : [line(page, `HST: ${money(taxCents)}`, 0.77, top, 0.08, 0.012)]),
      line(page, money(amountCents), 0.9, top, 0.06, 0.012),
    ];

    const firstNetworkRow = params.networkRows[0];
    if (!firstNetworkRow) {
      throw new Error('modern Clover fixture requires a network fee row');
    }

    const rows = [
      line(1, 'YOUR CARD PROCESSING STATEMENT', 0.06, 0.1, 0.32),
      line(1, 'Amount Submitted', 0.12, 0.3, 0.14),
      line(1, money(params.amountSubmittedCents), 0.14, 0.35, 0.1),
      line(1, 'Paid by Others', 0.44, 0.28, 0.12),
      line(1, '$0.00', 0.47, 0.31, 0.06),
      line(1, 'Disputes', 0.46, 0.35, 0.08),
      line(1, '$0.00', 0.47, 0.38, 0.06),
      line(1, 'Adjustments', 0.45, 0.41, 0.1),
      line(1, '$0.00', 0.47, 0.44, 0.06),
      line(1, 'Fees', 0.47, 0.47, 0.05),
      line(1, money(params.accountFeesCents), 0.46, 0.5, 0.08),
      line(1, 'Amount Processed', 0.74, 0.3, 0.14),
      line(1, money(params.amountProcessedCents), 0.75, 0.35, 0.1),
      line(1, 'Account Summary', 0.05, 0.56, 0.14),
      line(2, 'Card Processing and Fee Summary', 0.05, 0.1, 0.3),
      line(2, 'Fees', 0.8, 0.18, 0.05),
      line(2, 'Total', 0.06, 0.3, 0.05),
      line(2, money(Math.abs(params.cardProcessingFeesCents)), 0.8, 0.3, 0.08),
      line(3, 'Fee Summary', 0.06, 0.1, 0.12),
      line(3, 'Fees', 0.1, 0.15, 0.05),
      line(3, money(params.feeSummaryFeesCents), 0.1, 0.18, 0.08),
      line(3, 'IC/PF', 0.31, 0.15, 0.06),
      line(3, '$0.00', 0.31, 0.18, 0.06),
      line(3, 'Service Charges', 0.52, 0.15, 0.12),
      line(3, money(params.serviceChargesCents), 0.54, 0.18, 0.08),
      ...feeRow(
        3,
        0.4,
        firstNetworkRow.invoice,
        firstNetworkRow.description,
        'Fees',
        firstNetworkRow.amountCents,
        0,
      ),
      ...params.networkRows
        .slice(1)
        .flatMap((row, index) =>
          feeRow(
            4,
            0.2 + index * 0.03,
            row.invoice,
            row.description,
            'Fees',
            row.amountCents,
            0,
          ),
        ),
      ...feeRow(
        4,
        0.3,
        '012400617',
        params.equipmentDescription,
        'Fees',
        -3390,
        -390,
      ),
      ...feeRow(
        4,
        0.42,
        '000078478',
        'DISCOUNT FEES',
        'Service Charges',
        params.serviceChargesCents,
      ),
    ];

    return {
      version: 1 as const,
      inputKind: 'PDF' as const,
      engine: 'POPPLER' as const,
      layoutMode: 'GEOMETRY' as const,
      truncated: false,
      lines: rows,
    };
  };

  it('does not reinterpret the pre-July Clover statement layout with the modern parser', () => {
    const parsed = parseProviderFinancialEvidence({
      providerHint: AccountingFinancialProvider.CLOVER,
      documentTypeHint: AccountingFinancialDocumentType.STATEMENT,
      text: `
MERCHANT CARD PROCESSING STATEMENT LOCATION RECAP
StatementPeriod 06/01/26 - 06/30/26
Merchant Number 29351880018
Total Amount Funded 3,263.71
`,
    });
    expect(parsed).toBeNull();
  });

  it.each([
    {
      label: 'July with MONTHLY EQUIPMENT BILL across a six-page-style table',
      period: '07/01/2026-07/31/2026',
      amountSubmittedCents: 350132,
      accountFeesCents: -10097,
      amountProcessedCents: 340035,
      feeSummaryFeesCents: -3612,
      serviceChargesCents: -6485,
      cardProcessingFeesCents: -6707,
      equipmentDescription: 'MONTHLY EQUIPMENT BILL',
      networkRows: [
        {
          invoice: '000145623',
          description: 'VI DIGITAL COMM XBRD SVCS FEE',
          amountCents: -21,
        },
        {
          invoice: '000263262',
          description: 'MC ACQ CLEAR LARGE TICKET',
          amountCents: -201,
        },
      ],
      expectedNetworkCents: -222,
    },
    {
      label: 'August with Clover Flex 3 on the five-page statement',
      period: '08/01/2026-08/31/2026',
      amountSubmittedCents: 394993,
      accountFeesCents: -10684,
      amountProcessedCents: 384309,
      feeSummaryFeesCents: -3591,
      serviceChargesCents: -7093,
      cardProcessingFeesCents: -7294,
      equipmentDescription: 'Clover Flex 3',
      networkRows: [
        {
          invoice: '000257278',
          description: 'VI DIGITL COM US CNP SVC FEE M',
          amountCents: -11,
        },
        {
          invoice: '000141577',
          description: 'MC-AUTH DIGITAL ENABLEMENT MIN',
          amountCents: -190,
        },
      ],
      expectedNetworkCents: -201,
    },
  ])('parses modern Clover $label', (fixture) => {
    const parsed = parseProviderFinancialEvidence({
      providerHint: AccountingFinancialProvider.CLOVER,
      documentTypeHint: AccountingFinancialDocumentType.STATEMENT,
      text: `
YOUR CARD PROCESSING STATEMENT
PERIOD: ${fixture.period}
Merchant Number: 29351880018
Card Processing and Fee Summary
Fee Summary
`,
      documentExtraction: modernCloverExtraction(fixture),
    });

    const [periodStart = '', periodEnd = ''] = fixture.period.split('-');
    const asIsoDate = (value: string) =>
      `${value.slice(6, 10)}-${value.slice(0, 2)}-${value.slice(3, 5)}`;
    expect(parsed).toEqual(
      expect.objectContaining({
        provider: AccountingFinancialProvider.CLOVER,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        providerMerchantRef: '29351880018',
        periodStart: asIsoDate(periodStart),
        periodEnd: asIsoDate(periodEnd),
      }),
    );
    expect(lineByName(parsed!, 'Amount Submitted')?.amountCents).toBe(
      fixture.amountSubmittedCents,
    );
    expect(lineByName(parsed!, 'Account Summary Fees')?.amountCents).toBe(
      fixture.accountFeesCents,
    );
    expect(lineByName(parsed!, 'Amount Processed')?.amountCents).toBe(
      fixture.amountProcessedCents,
    );
    expect(lineByName(parsed!, 'Fee Summary Fees')?.amountCents).toBe(
      fixture.feeSummaryFeesCents,
    );
    expect(lineByName(parsed!, 'Service Charges Total')?.amountCents).toBe(
      fixture.serviceChargesCents,
    );
    expect(lineByName(parsed!, 'Card Processing Total Fees')).toEqual(
      expect.objectContaining({
        rawCode: CLOVER_STATEMENT_RAW_CODES.CARD_PROCESSING_TOTAL_FEES,
        amountCents: fixture.cardProcessingFeesCents,
      }),
    );
    expect(lineByName(parsed!, 'Clover Equipment Fee')).toEqual(
      expect.objectContaining({
        rawCode: CLOVER_STATEMENT_RAW_CODES.EQUIPMENT_FEE,
        amountCents: -3000,
        component: AccountingFinancialComponent.PLATFORM_OTHER_FEE,
      }),
    );
    expect(lineByName(parsed!, 'Clover Equipment Fee HST')).toEqual(
      expect.objectContaining({
        rawCode: CLOVER_STATEMENT_RAW_CODES.EQUIPMENT_FEE_HST,
        amountCents: -390,
        taxRole: AccountingFinancialTaxRole.INPUT_TAX,
      }),
    );
    expect(lineByName(parsed!, 'Other Card/Network Fees')).toEqual(
      expect.objectContaining({
        rawCode: CLOVER_STATEMENT_RAW_CODES.NETWORK_FEES,
        amountCents: fixture.expectedNetworkCents,
      }),
    );
    expect(lineByName(parsed!, 'Service Charges')).toEqual(
      expect.objectContaining({
        rawCode: CLOVER_STATEMENT_RAW_CODES.SERVICE_CHARGES,
        amountCents: fixture.serviceChargesCents,
      }),
    );
    expect(
      parsed?.lines.some(
        (line) =>
          line.postingTreatment ===
          AccountingFinancialPostingTreatment.UNCLASSIFIED,
      ),
    ).toBe(false);
    expect(parsed?.rawMetadata).toEqual(
      expect.objectContaining({
        statementLayout: 'MODERN_V1',
        documentExtractionEngine: 'POPPLER',
        amountsFundedExcludedFromNormalizedLines: true,
      }),
    );
  });

  it('uses only the Uber consolidated monthly summary and excludes payout sections', () => {
    const parsed = parseProviderFinancialEvidence({
      providerHint: AccountingFinancialProvider.UBER_EATS,
      documentTypeHint: AccountingFinancialDocumentType.STATEMENT,
      text: `
Monthly Statement
August 2026
SanQ Roujiamo
Statement Number
#3F0FE63E
Date
Aug 01-31, 2026
This section consolidates all financial transactions affecting the Net Total for the calendar month.
Consolidated Monthly Summary
Earnings
Sales (106 Orders) $3,300.67
Tax on Sales $429.19
Tips $0.00
Total Earnings $3,729.86
Uber Fees
Marketplace Fees -$767.88
Tax on Marketplace Fees -$99.81
Other Charges -$0.02
Tax On Other Charges $0.00
Total Uber Fees -$867.71
Marketing Spends
Offers On Items -$688.02
Marketing Adjustment $0.00
Other Offer Charges -$14.85
Tax on offer spends -$91.40
Ad Spends -$74.24
Ad Credits $49.96
Tax on Net Ad Spends -$3.16
Total Marketing Spends -$821.71
Amendments
Net Chargeback Amount (2 Orders) -$16.46
Net Tax On Chargeback -$2.15
Adjustments $0.00
Total Amendments -$18.61
Net Total $2,021.83*
Payout Period:
Jul 27, 2026 - Aug 02, 2026
Sales (12 Orders) $342.78
Marketplace Fees -$81.91
Net Payout $216.02
`,
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        provider: AccountingFinancialProvider.UBER_EATS,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        providerDocumentRef: '3F0FE63E',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      }),
    );
    expect(lineByName(parsed!, 'Sales')?.amountCents).toBe(330067);
    expect(lineByName(parsed!, 'Marketplace Fees')?.amountCents).toBe(-76788);
    expect(lineByName(parsed!, 'Other Charges')).toEqual(
      expect.objectContaining({
        amountCents: -2,
        component: AccountingFinancialComponent.PLATFORM_OTHER_FEE,
      }),
    );
    expect(lineByName(parsed!, 'Tax On Other Charges')).toEqual(
      expect.objectContaining({
        amountCents: 0,
        component: AccountingFinancialComponent.PLATFORM_OTHER_FEE_TAX,
        taxRole: AccountingFinancialTaxRole.INPUT_TAX,
      }),
    );
    expect(lineByName(parsed!, 'Tax on offer spends')).toEqual(
      expect.objectContaining({
        amountCents: -9140,
        component: AccountingFinancialComponent.SALES_TAX,
        taxRole: AccountingFinancialTaxRole.SALES_TAX,
      }),
    );
    expect(lineByName(parsed!, 'Tax on Net Ad Spends')).toEqual(
      expect.objectContaining({
        amountCents: -316,
        component: AccountingFinancialComponent.ADVERTISING_TAX,
        taxRole: AccountingFinancialTaxRole.INPUT_TAX,
      }),
    );
    expect(lineByName(parsed!, 'Net Tax On Chargeback')).toEqual(
      expect.objectContaining({
        amountCents: -215,
        component: AccountingFinancialComponent.CHARGEBACK_TAX,
        taxRole: AccountingFinancialTaxRole.SALES_TAX,
      }),
    );
    expect(lineByName(parsed!, 'Net Total')).toEqual(
      expect.objectContaining({
        amountCents: 202183,
        postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      }),
    );
    expect(parsed?.lines.some((line) => line.amountCents === 34278)).toBe(
      false,
    );
    expect(parsed?.rawMetadata).toEqual(
      expect.objectContaining({
        payoutSectionsExcludedFromNormalizedLines: true,
      }),
    );
  });

  it('uses layout rows for the observed July Uber statement instead of flattened label order', () => {
    const parsed = parseProviderFinancialEvidence({
      providerHint: AccountingFinancialProvider.UBER_EATS,
      documentTypeHint: AccountingFinancialDocumentType.STATEMENT,
      text: `
Monthly Statement
Statement Number #B4842290
Date Jul 01-31, 2026
Consolidated Monthly Summary
Sales (84 Orders)
Tax on Sales

$2,603.36
$338.48
Total Earnings $2,941.84
Net Total $1,431.94*
Payout Period:
Jun 29, 2026 - Jul 05, 2026
Sales (4 Orders) $120.00
`,
      documentExtraction: {
        version: 1,
        inputKind: 'PDF',
        engine: 'POPPLER',
        layoutMode: 'GEOMETRY',
        truncated: false,
        lines: [
          {
            lineId: 'p1-l1',
            page: 1,
            text: 'Sales (84 Orders)',
            confidence: null,
            geometry: { left: 0.1, top: 0.3, width: 0.25, height: 0.02 },
          },
          {
            lineId: 'p1-l2',
            page: 1,
            text: '$2,603.36',
            confidence: null,
            geometry: { left: 0.75, top: 0.3, width: 0.15, height: 0.02 },
          },
          {
            lineId: 'p1-l3',
            page: 1,
            text: 'Tax on Sales',
            confidence: null,
            geometry: { left: 0.1, top: 0.33, width: 0.2, height: 0.02 },
          },
          {
            lineId: 'p1-l4',
            page: 1,
            text: '$338.48',
            confidence: null,
            geometry: { left: 0.75, top: 0.33, width: 0.12, height: 0.02 },
          },
          {
            lineId: 'p1-l5',
            page: 1,
            text: 'Total Earnings $2,941.84',
            confidence: null,
            geometry: { left: 0.1, top: 0.4, width: 0.8, height: 0.02 },
          },
          {
            lineId: 'p1-l6',
            page: 1,
            text: 'Net Total $1,431.94*',
            confidence: null,
            geometry: { left: 0.1, top: 0.6, width: 0.8, height: 0.02 },
          },
          {
            lineId: 'p1-l7',
            page: 1,
            text: 'Payout Period:',
            confidence: null,
            geometry: { left: 0.1, top: 0.7, width: 0.3, height: 0.02 },
          },
          {
            lineId: 'p1-l8',
            page: 1,
            text: 'Sales (4 Orders) $120.00',
            confidence: null,
            geometry: { left: 0.1, top: 0.8, width: 0.8, height: 0.02 },
          },
        ],
      },
    });

    const sales = lineByName(parsed!, 'Sales');
    expect(sales?.amountCents).toBe(260336);
    expect(sales?.rawPayload).toMatchObject({
      extractionEvidence: {
        strategy: 'LAYOUT_ROW_PAIR',
        engine: 'POPPLER',
        labelLine: { lineId: 'p1-l1' },
        amountLine: { lineId: 'p1-l2' },
      },
    });

    const salesTax = lineByName(parsed!, 'Tax on Sales');
    expect(salesTax?.amountCents).toBe(33848);
    expect(salesTax?.rawPayload).toMatchObject({
      extractionEvidence: {
        strategy: 'LAYOUT_ROW_PAIR',
        labelLine: { lineId: 'p1-l3' },
        amountLine: { lineId: 'p1-l4' },
      },
    });
    expect(lineByName(parsed!, 'Total Earnings')?.amountCents).toBe(294184);
    expect(lineByName(parsed!, 'Net Total')?.amountCents).toBe(143194);
    expect(parsed?.lines.some((line) => line.amountCents === 12000)).toBe(
      false,
    );
    expect(parsed?.rawMetadata).toEqual(
      expect.objectContaining({
        documentExtractionEngine: 'POPPLER',
        layoutAwareExtraction: true,
      }),
    );
  });

  it('uses page-aware AWS Textract geometry for scanned provider statements', () => {
    const text = `
Monthly Statement
Statement Number #SCANNED
Date Jul 01-31, 2026
Sales (84 Orders)
$2,603.36
Tax on Sales
$338.48
Net Total
$1,431.94*
`;
    const parsed = parseProviderFinancialEvidence({
      providerHint: AccountingFinancialProvider.UBER_EATS,
      documentTypeHint: AccountingFinancialDocumentType.STATEMENT,
      text,
      documentExtraction: {
        version: 1,
        inputKind: 'PDF',
        engine: 'AWS_TEXTRACT',
        layoutMode: 'GEOMETRY',
        truncated: false,
        lines: [
          {
            lineId: 'p1-l1',
            page: 1,
            text: 'Sales (84 Orders)',
            confidence: 99,
            geometry: { left: 0.1, top: 0.3, width: 0.25, height: 0.02 },
          },
          {
            lineId: 'p1-l2',
            page: 1,
            text: '$2,603.36',
            confidence: 99,
            geometry: { left: 0.75, top: 0.3, width: 0.15, height: 0.02 },
          },
          {
            lineId: 'p2-l1',
            page: 2,
            text: 'Tax on Sales',
            confidence: 99,
            geometry: { left: 0.1, top: 0.2, width: 0.2, height: 0.02 },
          },
          {
            lineId: 'p2-l2',
            page: 2,
            text: '$338.48',
            confidence: 99,
            geometry: { left: 0.75, top: 0.2, width: 0.12, height: 0.02 },
          },
          {
            lineId: 'p2-l3',
            page: 2,
            text: 'Net Total',
            confidence: 99,
            geometry: { left: 0.1, top: 0.5, width: 0.2, height: 0.02 },
          },
          {
            lineId: 'p2-l4',
            page: 2,
            text: '$1,431.94*',
            confidence: 99,
            geometry: { left: 0.75, top: 0.5, width: 0.15, height: 0.02 },
          },
        ],
      },
    });

    expect(lineByName(parsed!, 'Sales')?.amountCents).toBe(260336);
    expect(lineByName(parsed!, 'Tax on Sales')?.amountCents).toBe(33848);
    expect(lineByName(parsed!, 'Net Total')?.amountCents).toBe(143194);
    expect(lineByName(parsed!, 'Tax on Sales')?.rawPayload).toMatchObject({
      extractionEvidence: {
        strategy: 'LAYOUT_ROW_PAIR',
        engine: 'AWS_TEXTRACT',
        labelLine: { lineId: 'p2-l1', page: 2 },
        amountLine: { lineId: 'p2-l2', page: 2 },
      },
    });
    expect(parsed?.rawMetadata).toEqual(
      expect.objectContaining({
        documentExtractionEngine: 'AWS_TEXTRACT',
        layoutAwareExtraction: true,
      }),
    );
  });

  it('fails a Poppler text-only Uber statement closed instead of trusting flattened column order', () => {
    const text = `
Monthly Statement
Statement Number #TEXT-ONLY
Date Jul 01-31, 2026
Sales (84 Orders)
Tax on Sales
$2,603.36
$338.48
Net Total $1,431.94*
`;

    const parsed = parseProviderFinancialEvidence({
      providerHint: AccountingFinancialProvider.UBER_EATS,
      documentTypeHint: AccountingFinancialDocumentType.STATEMENT,
      text,
      documentExtraction: {
        version: 1,
        inputKind: 'PDF',
        engine: 'POPPLER',
        layoutMode: 'TEXT_ONLY',
        truncated: false,
        lines: text
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line, index) => ({
            lineId: `p1-l${index + 1}`,
            page: 1,
            text: line,
            confidence: null,
            geometry: null,
          })),
      },
    });

    expect(parsed).toBeNull();
  });

  it('accepts same-line amounts when a usable native PDF has only Poppler text evidence', () => {
    const text = `
Monthly Statement
Statement Number #TEXT-INLINE
Date Jul 01-31, 2026
Sales (84 Orders) $2,603.36
Tax on Sales $338.48
Total Earnings $2,941.84
Net Total $2,941.84
`;
    const parsed = parseProviderFinancialEvidence({
      providerHint: AccountingFinancialProvider.UBER_EATS,
      documentTypeHint: AccountingFinancialDocumentType.STATEMENT,
      text,
      documentExtraction: {
        version: 1,
        inputKind: 'PDF',
        engine: 'POPPLER',
        layoutMode: 'TEXT_ONLY',
        truncated: false,
        lines: text
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line, index) => ({
            lineId: `p1-l${index + 1}`,
            page: 1,
            text: line,
            confidence: null,
            geometry: null,
          })),
      },
    });

    expect(lineByName(parsed!, 'Sales')?.amountCents).toBe(260336);
    expect(lineByName(parsed!, 'Tax on Sales')?.amountCents).toBe(33848);
    expect(lineByName(parsed!, 'Sales')?.rawPayload).toMatchObject({
      extractionEvidence: {
        strategy: 'TEXT_LINE_INLINE',
        engine: 'POPPLER',
      },
    });
  });

  it('fails a geometry-backed Uber label closed instead of falling back to flattened adjacency', () => {
    const parsed = parseProviderFinancialEvidence({
      providerHint: AccountingFinancialProvider.UBER_EATS,
      documentTypeHint: AccountingFinancialDocumentType.STATEMENT,
      text: `
Monthly Statement
Statement Number #LAYOUT-BLOCK
Date Jul 01-31, 2026
Sales (84 Orders)
Tax on Sales
$2,603.36
$338.48
Net Total $2,941.84
`,
      documentExtraction: {
        version: 1,
        inputKind: 'PDF',
        engine: 'POPPLER',
        layoutMode: 'GEOMETRY',
        truncated: false,
        lines: [
          {
            lineId: 'p1-l1',
            page: 1,
            text: 'Sales (84 Orders)',
            confidence: null,
            geometry: { left: 0.1, top: 0.3, width: 0.25, height: 0.02 },
          },
          {
            lineId: 'p1-l2',
            page: 1,
            text: '$2,603.36',
            confidence: null,
            geometry: { left: 0.75, top: 0.3, width: 0.15, height: 0.02 },
          },
          {
            lineId: 'p1-l3',
            page: 1,
            text: 'Tax on Sales',
            confidence: null,
            geometry: { left: 0.1, top: 0.33, width: 0.2, height: 0.02 },
          },
          {
            lineId: 'p1-l4',
            page: 1,
            text: '$338.48',
            confidence: null,
            geometry: { left: 0.75, top: 0.5, width: 0.12, height: 0.02 },
          },
        ],
      },
    });

    expect(lineByName(parsed!, 'Sales')?.amountCents).toBe(260336);
    expect(lineByName(parsed!, 'Tax on Sales')).toBeUndefined();
  });

  it('parses Fantuan posting components while keeping section and tax totals as controls', () => {
    const parsed = parseProviderFinancialEvidence({
      providerHint: AccountingFinancialProvider.FANTUAN,
      documentTypeHint: AccountingFinancialDocumentType.STATEMENT,
      text: `
Name: SANQIN RESTAURANT/ 15112320 CANADA INC.
Restaurant: Qin's Traditional Roujiamo | VIP 25% OFF(YG)
Total Transfer Amount: $3813.11
From: 2026-08-01 to 2026-08-31
Summary
Sales $5220.77
Item Subtotal $5220.77
Marketing and Fantuan Event Charges -$1870.30
Discounts from Promotion events -$1185.71
Fantuan Subsidy for Promotion events $1113.41
Commission -$1798.00
Adjustment $26.94
Net Taxes $435.70
Net Sales GST/HST $669.35
Commission GST/HST -$233.65
Total transfer amount $3813.11
`,
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        provider: AccountingFinancialProvider.FANTUAN,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      }),
    );
    expect(lineByName(parsed!, 'Discounts from Promotion events')).toEqual(
      expect.objectContaining({
        amountCents: -118571,
        component: AccountingFinancialComponent.PROMOTION,
        postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
      }),
    );
    expect(
      lineByName(parsed!, 'Fantuan Subsidy for Promotion events')?.amountCents,
    ).toBe(111341);
    expect(lineByName(parsed!, 'Commission')?.amountCents).toBe(-179800);
    expect(lineByName(parsed!, 'Net Taxes')?.postingTreatment).toBe(
      AccountingFinancialPostingTreatment.CONTROL_TOTAL,
    );
    expect(lineByName(parsed!, 'Net Sales GST/HST')?.taxRole).toBe(
      AccountingFinancialTaxRole.SALES_TAX,
    );
    expect(lineByName(parsed!, 'Commission GST/HST')?.taxRole).toBe(
      AccountingFinancialTaxRole.INPUT_TAX,
    );
    expect(lineByName(parsed!, 'Total transfer amount')).toEqual(
      expect.objectContaining({
        amountCents: 381311,
        component: AccountingFinancialComponent.PAYOUT,
        postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      }),
    );
  });

  it('requires an explicit provider hint instead of owning coarse statement recognition', () => {
    const text = `
Monthly Statement
Statement Number #TEST-1
Date Aug 01-31, 2026
Consolidated Monthly Summary
Sales (1 Orders) $10.00
Marketplace Fees -$2.00
Net Total $8.00
`;

    expect(parseProviderFinancialEvidence({ text })).toBeNull();
    expect(
      parseProviderFinancialEvidence({
        text,
        providerHint: AccountingFinancialProvider.UBER_EATS,
        documentTypeHint: AccountingFinancialDocumentType.STATEMENT,
      }),
    ).toEqual(
      expect.objectContaining({
        provider: AccountingFinancialProvider.UBER_EATS,
        documentType: AccountingFinancialDocumentType.STATEMENT,
      }) as unknown,
    );
  });

  it('uses an operator-selected provider as a parser hint when recognition keywords are incomplete', () => {
    const text = `
From: 2026-08-01 to 2026-08-31
Sales $5220.77
Commission -$1798.00
Total transfer amount $3813.11
`;

    expect(parseProviderFinancialEvidence({ text })).toBeNull();
    expect(
      parseProviderFinancialEvidence({
        text,
        providerHint: AccountingFinancialProvider.FANTUAN,
      }),
    ).toEqual(
      expect.objectContaining({
        provider: AccountingFinancialProvider.FANTUAN,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      }) as unknown,
    );
  });

  it('fails closed for Uber API CSV until an observed provider schema is fixture-pinned', () => {
    expect(
      parseProviderFinancialEvidence({
        text: 'Order ID,Item Name,Quantity\n1,Roujiamo,2',
        providerHint: AccountingFinancialProvider.UBER_EATS,
        reportTypeHint: 'ORDERS_AND_ITEMS_REPORT',
        periodStartHint: '2026-08-01',
        periodEndHint: '2026-08-31',
      }),
    ).toBeNull();

    expect(
      parseProviderFinancialEvidence({
        text: 'Metric,Amount\nMarketplace Fees,-12.34\nNet Chargeback Amount,-2.10',
        providerHint: AccountingFinancialProvider.UBER_EATS,
        reportTypeHint: 'FINANCE_SUMMARY_REPORT',
        periodStartHint: '2026-08-01',
        periodEndHint: '2026-08-31',
        providerDocumentRefHint: 'uberreport_1:1',
      }),
    ).toBeNull();
  });
});
