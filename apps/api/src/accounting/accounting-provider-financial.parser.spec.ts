import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole,
} from '@prisma/client';
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

  it('parses Clover monthly statement controls and separates fee HST', () => {
    const parsed = parseProviderFinancialEvidence({
      text: `
MERCHANT CARD PROCESSING STATEMENT LOCATION RECAP
StatementPeriod 05/01/26 - 05/31/26
MerchantNumber 29351880018
LOCATION
SUMMARY
Total Amount Submitted 2,880.92
Third-Party Transactions 0.00
Adjustments 0.00
Interchange Charges 0.00
Service Charges -55.50
Fees -35.15
Chargebacks/Reversals 0.00
Total Amount Funded 2,790.27
All amounts shown are in CAD funds
SERVICE CHARGES
Date Invoice Description Tax Total
05/31/26 000086953 DISCOUNT FEES -51.52
Total HST:0.00 -55.50
FEES
Date Invoice Description Tax Total
05/17/26 011981361 MONTHLY EQUIPMENT BILL HST:-3.90 -33.90
Total HST:-3.90 -35.15
`,
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        provider: AccountingFinancialProvider.CLOVER,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        providerMerchantRef: '29351880018',
        periodStart: '2026-05-01',
        periodEnd: '2026-05-31',
      }),
    );
    expect(lineByName(parsed!, 'Total Amount Submitted')).toEqual(
      expect.objectContaining({
        amountCents: 288092,
        postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      }),
    );
    expect(lineByName(parsed!, 'Fees before HST')).toEqual(
      expect.objectContaining({
        amountCents: -3125,
        component: AccountingFinancialComponent.PROCESSING_FEE,
      }),
    );
    expect(lineByName(parsed!, 'Fees HST')).toEqual(
      expect.objectContaining({
        amountCents: -390,
        component: AccountingFinancialComponent.PROCESSING_FEE_TAX,
        taxRole: AccountingFinancialTaxRole.INPUT_TAX,
      }),
    );
    expect(lineByName(parsed!, 'Total Amount Funded')).toEqual(
      expect.objectContaining({
        amountCents: 279027,
        component: AccountingFinancialComponent.PAYOUT,
        postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      }),
    );
  });

  it('uses only the Uber consolidated monthly summary and excludes payout sections', () => {
    const parsed = parseProviderFinancialEvidence({
      text: `
Monthly Statement
August 2026
SanQ Roujiamo
Statement Number
#3F0FE63E
Date
Aug 01-31, 2026
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

  it('parses Fantuan posting components while keeping section and tax totals as controls', () => {
    const parsed = parseProviderFinancialEvidence({
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
