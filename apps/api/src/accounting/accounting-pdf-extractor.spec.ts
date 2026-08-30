import { extractAccountingText } from './accounting-pdf-extractor';

describe('accounting text extraction', () => {
  it('extracts a body-only bill using the same accounting fields as a PDF', () => {
    const extraction = extractAccountingText(`
      Invoice Date: 2026-08-15
      Internet service
      Subtotal $100.00
      HST $13.00
      Total $113.00
    `);

    expect(extraction).toMatchObject({
      date: '2026-08-15',
      subtotalCents: 10000,
      taxCents: 1300,
      totalCents: 11300,
      suggestedCategoryStableId: 'expense_telecom',
    });
  });

  it('keeps unrecognized dates nullable for manual review', () => {
    const extraction = extractAccountingText('Amount due $42.00');

    expect(extraction.date).toBeNull();
    expect(extraction.totalCents).toBe(4200);
  });
});
