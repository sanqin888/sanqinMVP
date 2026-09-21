import { createTextOnlyAccountingDocumentExtraction } from './accounting-document-extraction';
import {
  assessAccountingPdfNativeTextUsability,
  parseAccountingPdfNativeTextUsability,
} from './accounting-pdf-routing';

const textOnly = (text: string, truncated = false) => ({
  ...createTextOnlyAccountingDocumentExtraction({
    inputKind: 'PDF' as const,
    engine: 'POPPLER' as const,
    text,
  }),
  truncated,
});

describe('Accounting native PDF usability routing', () => {
  it('keeps meaningful native provider text on the local Poppler path', () => {
    const text = [
      'Monthly Statement',
      'Date Jul 01-31, 2026',
      'Sales (84 Orders) $2,603.36',
      'Tax on Sales $338.48',
      'Net Total $1,431.94',
    ].join('\n');

    const result = assessAccountingPdfNativeTextUsability({
      text,
      documentExtraction: textOnly(text),
    });

    expect(result).toEqual(
      expect.objectContaining({
        disposition: 'USABLE_NATIVE_TEXT',
        reason: 'NATIVE_TEXT_USABLE',
      }),
    );
    expect(result.metrics.meaningfulLineCount).toBeGreaterThanOrEqual(2);
  });

  it('keeps readable unknown-provider text usable instead of coupling extraction quality to semantic mapping', () => {
    const text = [
      'Partner settlement statement',
      'Reference period 2026-07',
      'Gross activity 1234.56',
      'Service adjustment -45.67',
    ].join('\n');

    expect(
      assessAccountingPdfNativeTextUsability({
        text,
        documentExtraction: textOnly(text),
      }).disposition,
    ).toBe('USABLE_NATIVE_TEXT');
  });

  it('uses Unicode letters and numbers instead of an ASCII-only quality gate', () => {
    const text = [
      '三秦肉夹馍 七月结算单',
      '结算期间 2026年7月',
      '销售金额 2603.36',
      '税额 338.48',
    ].join('\n');

    const result = assessAccountingPdfNativeTextUsability({
      text,
      documentExtraction: textOnly(text),
    });

    expect(result.disposition).toBe('USABLE_NATIVE_TEXT');
    expect(result.metrics.hanCharacterCount).toBeGreaterThanOrEqual(4);
  });

  it('keeps readable text usable when bbox geometry is unavailable', () => {
    const text = [
      'Invoice 2026-09-16',
      'Subtotal CAD 75.00',
      'HST CAD 9.75',
      'Amount due CAD 84.75',
    ].join('\n');

    const result = assessAccountingPdfNativeTextUsability({
      text,
      documentExtraction: textOnly(text),
    });

    expect(result.disposition).toBe('USABLE_NATIVE_TEXT');
    expect(result.metrics.geometryLineCount).toBe(0);
  });

  it('marks blank and fragment-only native layers as scan candidates', () => {
    expect(
      assessAccountingPdfNativeTextUsability({
        text: '',
        documentExtraction: textOnly(''),
      }),
    ).toEqual(
      expect.objectContaining({
        disposition: 'SCAN_CANDIDATE',
        reason: 'NO_NATIVE_TEXT',
      }),
    );

    const fragment = assessAccountingPdfNativeTextUsability({
      text: 'Page 1',
      documentExtraction: textOnly('Page 1'),
    });
    expect(fragment).toEqual(
      expect.objectContaining({
        disposition: 'SCAN_CANDIDATE',
        reason: 'INSUFFICIENT_NATIVE_TEXT',
      }),
    );
    expect(fragment.metrics).toEqual(
      expect.objectContaining({
        characterCount: 6,
        meaningfulCharacterCount: 5,
        meaningfulTokenCount: 1,
        meaningfulLineCount: 1,
      }),
    );
  });

  it('fails suspicious glyph layers closed instead of treating them as scanned PDFs', () => {
    const text = '\uE000\uE001\uE002\uE003 \uFFFD\uFFFD\uFFFD\uFFFD 12345678';

    expect(
      assessAccountingPdfNativeTextUsability({
        text,
        documentExtraction: textOnly(text),
      }),
    ).toEqual(
      expect.objectContaining({
        disposition: 'FAIL_CLOSED',
        reason: 'SUSPICIOUS_NATIVE_TEXT',
      }),
    );
  });

  it('fails ambiguous nontrivial text closed instead of sending it to OCR', () => {
    const text = 'Reference 12345678';

    expect(
      assessAccountingPdfNativeTextUsability({
        text,
        documentExtraction: textOnly(text),
      }),
    ).toEqual(
      expect.objectContaining({
        disposition: 'FAIL_CLOSED',
        reason: 'AMBIGUOUS_NATIVE_TEXT',
      }),
    );
  });

  it('fails truncated native extraction closed even when the visible prefix looks usable', () => {
    const text = [
      'Monthly Statement',
      'Sales $2,603.36',
      'Tax on Sales $338.48',
      'Net Total $1,431.94',
    ].join('\n');

    expect(
      assessAccountingPdfNativeTextUsability({
        text,
        documentExtraction: textOnly(text, true),
      }),
    ).toEqual(
      expect.objectContaining({
        disposition: 'FAIL_CLOSED',
        reason: 'TRUNCATED_NATIVE_EXTRACTION',
      }),
    );
  });

  it('revalidates persisted routing evidence and rejects malformed or inconsistent states', () => {
    const usable = assessAccountingPdfNativeTextUsability({
      text: 'Invoice\nSubtotal 10.00\nTax 1.30\nTotal 11.30',
      documentExtraction: textOnly(
        'Invoice\nSubtotal 10.00\nTax 1.30\nTotal 11.30',
      ),
    });

    expect(parseAccountingPdfNativeTextUsability(usable)).toEqual(usable);
    expect(
      parseAccountingPdfNativeTextUsability({
        ...usable,
        disposition: 'SCAN_CANDIDATE',
      }),
    ).toBeUndefined();
    expect(
      parseAccountingPdfNativeTextUsability({
        ...usable,
        metrics: {
          ...usable.metrics,
          suspiciousCharacterRatio: 2,
        },
      }),
    ).toBeUndefined();
    expect(
      parseAccountingPdfNativeTextUsability({
        ...usable,
        metrics: {
          ...usable.metrics,
          geometryLineCount: usable.metrics.extractionLineCount + 1,
        },
      }),
    ).toBeUndefined();
  });
});
