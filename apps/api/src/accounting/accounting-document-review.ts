import type { AccountingPdfExtraction } from './accounting-pdf-extractor';

export type AccountingReviewDisposition =
  | 'LIKELY_BILL'
  | 'UNRECOGNIZED'
  | 'LIKELY_NOT_BILL';

export type AccountingInputKind = 'PDF' | 'IMAGE' | 'EMAIL_BODY';

export type AccountingReviewMetadata = {
  inputKind: AccountingInputKind;
  reviewDisposition: AccountingReviewDisposition;
  reviewReason:
    | 'BILL_SIGNALS'
    | 'NO_READABLE_TEXT'
    | 'NO_BILL_SIGNALS'
    | 'INSUFFICIENT_BILL_SIGNALS';
};

const billSignalPattern =
  /\b(invoice|receipt|bill|subtotal|sub total|hst|gst|tax|amount due|balance due|grand total|total amount|payment|purchase|transaction)\b|发票|收据|账单|小票|合计|总计|税额|应付|金额/i;
const moneyTokenPattern =
  /(?:CAD\s*)?\$?\s*-?\d{1,6}(?:,\d{3})*(?:\.\d{2})\b/gi;

export function classifyAccountingDocumentText(
  text: string,
  extraction: AccountingPdfExtraction,
): Omit<AccountingReviewMetadata, 'inputKind'> {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  if (normalizedText.length < 8) {
    return {
      reviewDisposition: 'UNRECOGNIZED',
      reviewReason: 'NO_READABLE_TEXT',
    };
  }

  const hasBillSignal = billSignalPattern.test(normalizedText);
  const moneyTokenCount = Array.from(
    normalizedText.matchAll(moneyTokenPattern),
  ).length;
  if (
    extraction.totalCents != null ||
    (moneyTokenCount >= 2 &&
      (hasBillSignal || extraction.taxCents != null || extraction.date != null))
  ) {
    return {
      reviewDisposition: 'LIKELY_BILL',
      reviewReason: 'BILL_SIGNALS',
    };
  }

  if (!hasBillSignal && moneyTokenCount === 0) {
    return {
      reviewDisposition: 'LIKELY_NOT_BILL',
      reviewReason: 'NO_BILL_SIGNALS',
    };
  }

  return {
    reviewDisposition: 'UNRECOGNIZED',
    reviewReason: 'INSUFFICIENT_BILL_SIGNALS',
  };
}
