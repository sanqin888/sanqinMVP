import { extractAccountingText } from './accounting-pdf-extractor';
import { classifyAccountingDocumentText } from './accounting-document-review';

describe('accounting document review classification', () => {
  it('classifies a receipt-like OCR result as a likely bill', () => {
    const text = 'Invoice 2026-08-29 Subtotal $12.00 HST $1.56 Total $13.56';
    const extraction = extractAccountingText(text);

    expect(classifyAccountingDocumentText(text, extraction)).toEqual({
      reviewDisposition: 'LIKELY_BILL',
      reviewReason: 'BILL_SIGNALS',
    });
  });

  it('marks an unreadable OCR result for manual discard decision', () => {
    const text = '   ';
    const extraction = extractAccountingText(text);

    expect(classifyAccountingDocumentText(text, extraction)).toEqual({
      reviewDisposition: 'UNRECOGNIZED',
      reviewReason: 'NO_READABLE_TEXT',
    });
  });

  it('marks readable non-bill text as likely not a bill', () => {
    const text = 'Thank you for attending our community event this weekend.';
    const extraction = extractAccountingText(text);

    expect(classifyAccountingDocumentText(text, extraction)).toEqual({
      reviewDisposition: 'LIKELY_NOT_BILL',
      reviewReason: 'NO_BILL_SIGNALS',
    });
  });
});
