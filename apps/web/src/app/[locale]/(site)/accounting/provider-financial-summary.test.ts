import {
  findProviderSupportingHeadlineLine,
  isProviderSupportingFinancialDocumentType,
  selectProviderFinancialSummaryLines,
} from './provider-financial-summary';

const line = (
  rawName: string,
  component: string,
  amountCents: number,
) => ({ rawName, component, amountCents });

describe('provider financial summary helpers', () => {
  it('keeps statements actionable and classifies all validated non-statements as supporting evidence', () => {
    expect(isProviderSupportingFinancialDocumentType('STATEMENT')).toBe(false);
    expect(isProviderSupportingFinancialDocumentType('BATCH_CONTROL')).toBe(true);
    expect(isProviderSupportingFinancialDocumentType('API_REPORT')).toBe(true);
    expect(isProviderSupportingFinancialDocumentType('OTHER')).toBe(true);
  });

  it('uses payout first, then control total or Net as the supporting-evidence headline', () => {
    const control = line('Net', 'CONTROL_TOTAL', 20098);
    const payout = line('Total payout', 'PAYOUT', 19900);

    expect(findProviderSupportingHeadlineLine([control])).toBe(control);
    expect(findProviderSupportingHeadlineLine([control, payout])).toBe(payout);
  });

  it('prioritizes the most useful economic/control lines for compact evidence summaries', () => {
    const lines = [
      line('Other', 'OTHER', 100),
      line('Commission', 'COMMISSION', -200),
      line('Tips', 'TIP', 300),
      line('Tax', 'SALES_TAX', 400),
      line('Refunds', 'REFUND', 0),
      line('Sales', 'SALES', 1000),
      line('Total payout', 'PAYOUT', 1500),
    ];

    expect(
      selectProviderFinancialSummaryLines(lines, 3).map(
        (item) => item.component,
      ),
    ).toEqual(['PAYOUT', 'SALES', 'SALES_TAX']);
  });
});
