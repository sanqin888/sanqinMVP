import {
  extractAccountingText,
  extractPdfLayout,
  extractPdfText,
  parsePopplerBboxLayout,
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

  it('normalizes Poppler bbox-layout lines into Accounting-owned geometry', () => {
    const extraction = parsePopplerBboxLayout(`
      <doc>
        <page width="612" height="792">
          <flow>
            <block>
              <line xMin="61.2" yMin="79.2" xMax="183.6" yMax="95.04">
                <word xMin="61.2" yMin="79.2" xMax="100" yMax="95.04">Sales</word>
                <word xMin="105" yMin="79.2" xMax="183.6" yMax="95.04">(84 Orders)</word>
              </line>
              <line xMin="459" yMin="79.2" xMax="550.8" yMax="95.04">
                <word xMin="459" yMin="79.2" xMax="550.8" yMax="95.04">$2,603.36</word>
              </line>
              <line xMin="61.2" yMin="99" xMax="183.6" yMax="114.84">
                <word xMin="61.2" yMin="99" xMax="183.6" yMax="114.84">Tax on Sales</word>
              </line>
              <line xMin="459" yMin="99" xMax="550.8" yMax="114.84">
                <word xMin="459" yMin="99" xMax="550.8" yMax="114.84">$338.48</word>
              </line>
            </block>
          </flow>
        </page>
      </doc>
    `);

    expect(extraction).toEqual(
      expect.objectContaining({
        inputKind: 'PDF',
        engine: 'POPPLER',
        layoutMode: 'GEOMETRY',
        truncated: false,
      }),
    );
    expect(extraction.lines).toHaveLength(4);
    expect(extraction.lines[0]).toEqual(
      expect.objectContaining({
        lineId: 'p1-l1',
        page: 1,
        text: 'Sales (84 Orders)',
      }),
    );
    expect(extraction.lines[0]?.geometry?.left).toBeCloseTo(0.1);
    expect(extraction.lines[0]?.geometry?.top).toBeCloseTo(0.1);
    expect(extraction.lines[0]?.geometry?.width).toBeCloseTo(0.2);
    expect(extraction.lines[0]?.geometry?.height).toBeCloseTo(0.02);
    expect(extraction.lines[1]).toEqual(
      expect.objectContaining({
        lineId: 'p1-l2',
        text: '$2,603.36',
      }),
    );
    expect(extraction.lines[1]?.geometry?.left).toBeCloseTo(0.75);
    expect(extraction.lines[1]?.geometry?.top).toBeCloseTo(0.1);
    expect(extraction.lines[2]).toEqual(
      expect.objectContaining({
        lineId: 'p1-l3',
        text: 'Tax on Sales',
      }),
    );
    expect(extraction.lines[3]).toEqual(
      expect.objectContaining({
        lineId: 'p1-l4',
        text: '$338.48',
      }),
    );
  });

  it('delegates valid PDF bytes to the optional Poppler layout runner', async () => {
    const pdf = Buffer.from('%PDF-1.4\nsynthetic');
    const runner = jest.fn(() =>
      Promise.resolve(
        '<doc><page width="100" height="100">' +
          '<line xMin="10" yMin="20" xMax="30" yMax="30">' +
          '<word xMin="10" yMin="20" xMax="30" yMax="30">Total</word>' +
          '</line></page></doc>',
      ),
    );

    const extraction = await extractPdfLayout(pdf, runner);

    expect(extraction).toEqual(
      expect.objectContaining({
        engine: 'POPPLER',
        layoutMode: 'GEOMETRY',
      }),
    );
    expect(extraction.lines[0]).toEqual(
      expect.objectContaining({ text: 'Total' }),
    );
    expect(extraction.lines[0]?.geometry?.left).toBeCloseTo(0.1);
    expect(extraction.lines[0]?.geometry?.top).toBeCloseTo(0.2);
    expect(extraction.lines[0]?.geometry?.width).toBeCloseTo(0.2);
    expect(extraction.lines[0]?.geometry?.height).toBeCloseTo(0.1);
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
