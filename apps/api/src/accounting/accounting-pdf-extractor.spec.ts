import {
  extractAccountingText,
  extractPdfText,
} from './accounting-pdf-extractor';

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
    expect(extraction.sourceCurrency).toBeNull();
    expect(extraction.sourceCurrencyEvidence).toBe('UNKNOWN');
  });

  it('captures an explicitly stated foreign source currency without converting the amount', () => {
    const extraction = extractAccountingText(`
      Cloudflare subscription
      Invoice total USD 20.00
      Amount due USD 20.00
    `);

    expect(extraction.totalCents).toBe(2000);
    expect(extraction.sourceCurrency).toBe('USD');
    expect(extraction.sourceCurrencyEvidence).toBe('EXPLICIT_TEXT');
  });

  it('fails currency evidence closed when multiple explicit currencies are present', () => {
    const extraction = extractAccountingText(
      'Invoice USD 20.00; card statement reference CAD 27.46',
    );

    expect(extraction.sourceCurrency).toBeNull();
    expect(extraction.sourceCurrencyEvidence).toBe('AMBIGUOUS');
  });

  it('delegates valid PDF bytes to the Unicode-capable text engine', async () => {
    const pdf = Buffer.from('%PDF-1.4\nsynthetic');
    const runner = jest.fn(() =>
      Promise.resolve(
        [
          'Monthly Statement\r',
          'SanQ Roujiamo 三秦肉夹馍',
          '\fNet Total $1,222.85',
        ].join('\n'),
      ),
    );

    await expect(extractPdfText(pdf, runner)).resolves.toBe(
      'Monthly Statement\nSanQ Roujiamo 三秦肉夹馍\n Net Total $1,222.85',
    );
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith(pdf);
  });

  it('does not invoke the PDF text engine for non-PDF bytes', async () => {
    const runner = jest.fn(() => Promise.resolve('should not be used'));

    await expect(
      extractPdfText(Buffer.from('not a pdf'), runner),
    ).resolves.toBe('');
    expect(runner).not.toHaveBeenCalled();
  });
});
