import {
  createTextOnlyAccountingDocumentExtraction,
  parseAccountingDocumentExtraction,
  sliceAccountingDocumentExtractionBeforeMarker,
} from './accounting-document-extraction';

describe('Accounting document extraction contract', () => {
  it('normalizes plain OCR text into a bounded text-only extraction', () => {
    expect(
      createTextOnlyAccountingDocumentExtraction({
        inputKind: 'IMAGE',
        engine: 'TESSERACT',
        text: 'Receipt\r\nTotal $10.00\n',
      }),
    ).toEqual({
      version: 1,
      inputKind: 'IMAGE',
      engine: 'TESSERACT',
      layoutMode: 'TEXT_ONLY',
      truncated: false,
      lines: [
        {
          lineId: 'p1-l1',
          page: 1,
          text: 'Receipt',
          confidence: null,
          geometry: null,
        },
        {
          lineId: 'p1-l2',
          page: 1,
          text: 'Total $10.00',
          confidence: null,
          geometry: null,
        },
      ],
    });
  });

  it('slices provider layout before payout detail without mutating the source', () => {
    const extraction = {
      version: 1 as const,
      inputKind: 'PDF' as const,
      engine: 'POPPLER' as const,
      layoutMode: 'GEOMETRY' as const,
      truncated: false,
      lines: [
        {
          lineId: 'p1-l1',
          page: 1,
          text: 'Net Total $100.00',
          confidence: null,
          geometry: { left: 0.1, top: 0.2, width: 0.8, height: 0.02 },
        },
        {
          lineId: 'p1-l2',
          page: 1,
          text: 'Payout Period:',
          confidence: null,
          geometry: { left: 0.1, top: 0.5, width: 0.3, height: 0.02 },
        },
        {
          lineId: 'p1-l3',
          page: 1,
          text: 'Sales $50.00',
          confidence: null,
          geometry: { left: 0.1, top: 0.6, width: 0.5, height: 0.02 },
        },
      ],
    };

    expect(
      sliceAccountingDocumentExtractionBeforeMarker(
        extraction,
        'Payout Period:',
      )?.lines.map((line) => line.text),
    ).toEqual(['Net Total $100.00']);
    expect(extraction.lines).toHaveLength(3);
  });

  it('rejects malformed persisted extraction geometry', () => {
    expect(
      parseAccountingDocumentExtraction({
        version: 1,
        inputKind: 'PDF',
        engine: 'POPPLER',
        layoutMode: 'GEOMETRY',
        truncated: false,
        lines: [
          {
            lineId: 'p1-l1',
            page: 1,
            text: 'Total $10.00',
            confidence: null,
            geometry: {
              left: 0.9,
              top: 0.1,
              width: 0.2,
              height: 0.02,
            },
          },
        ],
      }),
    ).toBeUndefined();
  });

  it('rejects inconsistent persisted engine and layout claims', () => {
    expect(
      parseAccountingDocumentExtraction({
        version: 1,
        inputKind: 'IMAGE',
        engine: 'POPPLER',
        layoutMode: 'TEXT_ONLY',
        truncated: false,
        lines: [],
      }),
    ).toBeUndefined();
    expect(
      parseAccountingDocumentExtraction({
        version: 1,
        inputKind: 'PDF',
        engine: 'POPPLER',
        layoutMode: 'GEOMETRY',
        truncated: false,
        lines: [
          {
            lineId: 'p1-l1',
            page: 1,
            text: 'Total $10.00',
            confidence: null,
            geometry: null,
          },
        ],
      }),
    ).toBeUndefined();
  });
});
