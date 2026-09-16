import {
  AnalyzeExpenseCommand,
  TextractClient,
  type AnalyzeExpenseCommandOutput,
} from '@aws-sdk/client-textract';
import sharp from 'sharp';
import { analyzeAccountingReceiptImageGeometry } from './accounting-image-ocr';
import {
  extractAccountingText,
  type AccountingPdfExtraction,
} from './accounting-pdf-extractor';
import { ACCOUNTING_RECEIPT_IMAGE_POLICY } from './accounting-receipt-image';

const TEXTRACT_TIMEOUT_MS = 20_000;
const TEXTRACT_MAX_SYNC_BYTES = 9_500_000;
const TEXTRACT_MAX_IMAGE_DIMENSION = 9_000;
const TEXTRACT_IMAGE_QUALITY = 92;
const TEXTRACT_FALLBACK_IMAGE_QUALITY = 82;

export const ACCOUNTING_TEXTRACT_EXPENSE_POLICY = {
  timeoutMs: TEXTRACT_TIMEOUT_MS,
  maxImageBytes: TEXTRACT_MAX_SYNC_BYTES,
  maxImageDimension: TEXTRACT_MAX_IMAGE_DIMENSION,
} as const;

type TextractExpenseDocument = NonNullable<
  AnalyzeExpenseCommandOutput['ExpenseDocuments']
>[number];
type TextractExpenseField = NonNullable<
  TextractExpenseDocument['SummaryFields']
>[number];

export type AccountingTextractNormalizedField = {
  type: string;
  text: string;
  confidence: number | null;
  currencyCode: string | null;
  currencyConfidence: number | null;
};

export type AccountingTextractCurrencySuggestion = {
  code: string | null;
  confidence: number | null;
  ambiguous: boolean;
};

export type AccountingTextractExpenseEvidence = {
  provider: 'AWS_TEXTRACT_ANALYZE_EXPENSE';
  modelVersion: string | null;
  requestId: string | null;
  vendorName: string | null;
  dateCandidates: Array<{
    text: string;
    confidence: number | null;
  }>;
  summaryFields: {
    subtotal: AccountingTextractNormalizedField | null;
    tax: AccountingTextractNormalizedField | null;
    total: AccountingTextractNormalizedField | null;
    amountPaid: AccountingTextractNormalizedField | null;
  };
  currencySuggestion: AccountingTextractCurrencySuggestion;
  financialConsistency: 'MATCHED' | 'MISMATCH' | 'INSUFFICIENT';
  lineItemCount: number;
  lineItemPriceCount: number;
  lineItemPriceSumCents: number | null;
  lineItemsReconcileToSubtotal: boolean | null;
  submittedDocument: {
    kind: 'IMAGE' | 'PDF';
    cropApplied: boolean;
    width: number | null;
    height: number | null;
    byteSize: number;
  };
};

export type AccountingTextractExpenseRecognition = {
  text: string;
  extraction: AccountingPdfExtraction;
  evidence: AccountingTextractExpenseEvidence;
};

export type AccountingTextractExpenseRunner = (
  image: Buffer,
) => Promise<AnalyzeExpenseCommandOutput>;

let textractClient: TextractClient | null = null;

export function isAccountingTextractExpenseRecognitionEnabled(
  value = process.env.ACCOUNTING_TEXTRACT_ENABLED,
): boolean {
  return /^(?:1|true|yes|on)$/i.test(value?.trim() ?? '');
}

export async function recognizeAccountingExpenseImageWithTextract(
  buffer: Buffer,
  runner: AccountingTextractExpenseRunner = runAnalyzeExpense,
): Promise<AccountingTextractExpenseRecognition> {
  const prepared = await prepareAccountingTextractReceiptImage(buffer);
  const response = await runner(prepared.buffer);
  return mapTextractExpenseResponse(response, {
    kind: 'IMAGE',
    cropApplied: prepared.cropApplied,
    width: prepared.width,
    height: prepared.height,
    byteSize: prepared.buffer.length,
  });
}

export async function recognizeAccountingExpensePdfWithTextract(
  buffer: Buffer,
  runner: AccountingTextractExpenseRunner = runAnalyzeExpense,
): Promise<AccountingTextractExpenseRecognition> {
  if (
    buffer.length < 5 ||
    buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
  ) {
    throw new Error('Accounting Textract PDF input is invalid');
  }
  if (buffer.length > TEXTRACT_MAX_SYNC_BYTES) {
    throw new Error('Accounting Textract PDF exceeded synchronous byte limit');
  }
  const response = await runner(buffer);
  return mapTextractExpenseResponse(response, {
    kind: 'PDF',
    cropApplied: false,
    width: null,
    height: null,
    byteSize: buffer.length,
  });
}

function mapTextractExpenseResponse(
  response: AnalyzeExpenseCommandOutput,
  submittedDocument: AccountingTextractExpenseEvidence['submittedDocument'],
): AccountingTextractExpenseRecognition {
  const expenseDocuments = response.ExpenseDocuments ?? [];
  const document = expenseDocuments[0];
  if (!document) {
    throw new Error('Accounting Textract returned no expense document');
  }

  const text = extractTextractDocumentText(document);
  const generic = extractAccountingText(text);
  const summaryFields = document.SummaryFields ?? [];
  const subtotal = selectSummaryField(summaryFields, 'SUBTOTAL');
  const tax = selectSummaryField(summaryFields, 'TAX');
  const total = selectSummaryField(summaryFields, 'TOTAL');
  const amountPaid = selectSummaryField(summaryFields, 'AMOUNT_PAID');
  const vendor = selectSummaryField(summaryFields, 'VENDOR_NAME');
  const dateCandidates = summaryFields
    .filter((field) => normalizedFieldType(field) === 'INVOICE_RECEIPT_DATE')
    .map(normalizeTextractField)
    .filter((field): field is AccountingTextractNormalizedField => Boolean(field))
    .slice(0, 5)
    .map((field) => ({
      text: field.text,
      confidence: field.confidence,
    }));

  const reviewedDate = chooseTextractDate(generic.date, dateCandidates);
  const subtotalCents = parseTextractMoneyCents(subtotal?.text ?? null);
  const taxCents = parseTextractMoneyCents(tax?.text ?? null);
  const totalCents = parseTextractMoneyCents(total?.text ?? null);
  const financialConsistency = evaluateFinancialConsistency(
    subtotalCents,
    taxCents,
    totalCents,
  );
  const lineItems =
    document.LineItemGroups?.flatMap((group) => group.LineItems ?? []) ?? [];
  const lineItemPrices = lineItems
    .map((lineItem) =>
      lineItem.LineItemExpenseFields?.find(
        (field) => normalizedFieldType(field) === 'PRICE',
      ),
    )
    .map((field) => parseTextractMoneyCents(field?.ValueDetection?.Text ?? null))
    .filter((value): value is number => value != null);
  const lineItemPriceSumCents = lineItemPrices.length
    ? lineItemPrices.reduce((sum, value) => sum + value, 0)
    : null;

  const extraction: AccountingPdfExtraction = {
    ...generic,
    date: reviewedDate,
    subtotalCents: subtotalCents ?? generic.subtotalCents,
    taxCents: taxCents ?? generic.taxCents,
    totalCents: totalCents ?? generic.totalCents,
    confidence: deriveTextractExtractionConfidence({
      date: reviewedDate,
      generic,
      totalCents: totalCents ?? generic.totalCents,
      financialConsistency,
    }),
  };

  return {
    text,
    extraction,
    evidence: {
      provider: 'AWS_TEXTRACT_ANALYZE_EXPENSE',
      modelVersion: response.AnalyzeExpenseModelVersion ?? null,
      requestId: response.$metadata.requestId ?? null,
      vendorName: vendor?.text ?? null,
      dateCandidates,
      summaryFields: {
        subtotal,
        tax,
        total,
        amountPaid,
      },
      currencySuggestion: deriveCurrencySuggestion([subtotal, tax, total]),
      financialConsistency,
      lineItemCount: lineItems.length,
      lineItemPriceCount: lineItemPrices.length,
      lineItemPriceSumCents,
      lineItemsReconcileToSubtotal:
        subtotalCents != null && lineItemPriceSumCents != null
          ? subtotalCents === lineItemPriceSumCents
          : null,
      submittedDocument,
    },
  };
}

async function runAnalyzeExpense(
  image: Buffer,
): Promise<AnalyzeExpenseCommandOutput> {
  if (!textractClient) {
    textractClient = new TextractClient({
      region: process.env.AWS_REGION ?? 'ca-central-1',
    });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEXTRACT_TIMEOUT_MS);
  try {
    return await textractClient.send(
      new AnalyzeExpenseCommand({ Document: { Bytes: image } }),
      { abortSignal: controller.signal },
    );
  } finally {
    clearTimeout(timer);
  }
}

async function prepareAccountingTextractReceiptImage(buffer: Buffer): Promise<{
  buffer: Buffer;
  cropApplied: boolean;
  width: number;
  height: number;
}> {
  const metadata = await sharp(buffer, {
    failOn: 'error',
    limitInputPixels: ACCOUNTING_RECEIPT_IMAGE_POLICY.maxInputPixels,
  }).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Accounting Textract source dimensions are unavailable');
  }
  if ((metadata.pages ?? 1) > 1) {
    throw new Error('Animated Accounting receipt images are not supported');
  }

  const swapsAxes = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
  const orientedWidth = swapsAxes ? metadata.height : metadata.width;
  const orientedHeight = swapsAxes ? metadata.width : metadata.height;
  const geometry = await analyzeAccountingReceiptImageGeometry(
    buffer,
    orientedWidth,
  );
  const region = geometry.cropApplied
    ? {
        left: geometry.cropLeft,
        top: 0,
        width: geometry.cropWidth,
        height: orientedHeight,
      }
    : null;

  const encode = async (quality: number, maxDimension: number) => {
    let pipeline = sharp(buffer, {
      failOn: 'error',
      limitInputPixels: ACCOUNTING_RECEIPT_IMAGE_POLICY.maxInputPixels,
      autoOrient: true,
    });
    if (region) pipeline = pipeline.extract(region);
    return pipeline
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality, chromaSubsampling: '4:4:4' })
      .toBuffer();
  };

  let prepared = await encode(
    TEXTRACT_IMAGE_QUALITY,
    TEXTRACT_MAX_IMAGE_DIMENSION,
  );
  if (prepared.length > TEXTRACT_MAX_SYNC_BYTES) {
    prepared = await encode(
      TEXTRACT_FALLBACK_IMAGE_QUALITY,
      Math.min(7_500, TEXTRACT_MAX_IMAGE_DIMENSION),
    );
  }
  if (prepared.length > TEXTRACT_MAX_SYNC_BYTES) {
    throw new Error('Accounting Textract prepared image exceeded byte limit');
  }

  const preparedMetadata = await sharp(prepared).metadata();
  if (!preparedMetadata.width || !preparedMetadata.height) {
    throw new Error('Accounting Textract prepared dimensions are unavailable');
  }
  if (
    preparedMetadata.width > TEXTRACT_MAX_IMAGE_DIMENSION ||
    preparedMetadata.height > TEXTRACT_MAX_IMAGE_DIMENSION
  ) {
    throw new Error('Accounting Textract prepared image exceeded dimension limit');
  }

  return {
    buffer: prepared,
    cropApplied: geometry.cropApplied,
    width: preparedMetadata.width,
    height: preparedMetadata.height,
  };
}

function extractTextractDocumentText(document: TextractExpenseDocument): string {
  const lines = (document.Blocks ?? [])
    .flatMap((block) => {
      const text =
        block.BlockType === 'LINE' ? block.Text?.trim() ?? '' : '';
      return text
        ? [
            {
              text,
              page: block.Page ?? 0,
              top: block.Geometry?.BoundingBox?.Top ?? 0,
              left: block.Geometry?.BoundingBox?.Left ?? 0,
            },
          ]
        : [];
    })
    .sort(
      (left, right) =>
        left.page - right.page ||
        left.top - right.top ||
        left.left - right.left,
    )
    .map((line) => line.text);
  if (lines.length) return lines.join('\n');

  const fallback: string[] = [];
  for (const field of document.SummaryFields ?? []) {
    const label = field.LabelDetection?.Text?.trim();
    const value = field.ValueDetection?.Text?.trim();
    if (label && value) fallback.push(`${label} ${value}`);
    else if (value) fallback.push(value);
  }
  for (const group of document.LineItemGroups ?? []) {
    for (const lineItem of group.LineItems ?? []) {
      const values = (lineItem.LineItemExpenseFields ?? [])
        .map((field) => field.ValueDetection?.Text?.trim())
        .filter((value): value is string => Boolean(value));
      if (values.length) fallback.push(values.join(' '));
    }
  }
  return fallback.join('\n');
}

function normalizedFieldType(field: {
  Type?: { Text?: string };
}): string {
  return field.Type?.Text?.trim().toUpperCase() ?? '';
}

function selectSummaryField(
  fields: TextractExpenseField[],
  type: string,
): AccountingTextractNormalizedField | null {
  return fields
    .filter((field) => normalizedFieldType(field) === type)
    .map(normalizeTextractField)
    .filter((field): field is AccountingTextractNormalizedField => Boolean(field))
    .sort((left, right) => (right.confidence ?? -1) - (left.confidence ?? -1))[0] ?? null;
}

function normalizeTextractField(
  field: TextractExpenseField,
): AccountingTextractNormalizedField | null {
  const text = field.ValueDetection?.Text?.trim();
  if (!text) return null;
  return {
    type: normalizedFieldType(field),
    text,
    confidence: field.ValueDetection?.Confidence ?? null,
    currencyCode: field.Currency?.Code?.trim().toUpperCase() ?? null,
    currencyConfidence: field.Currency?.Confidence ?? null,
  };
}

function parseTextractMoneyCents(text: string | null): number | null {
  if (!text) return null;
  const parenthesized = /^\s*\(.*\)\s*$/.test(text);
  const match = /-?\d{1,9}(?:,\d{3})*(?:\.\d{2})/.exec(text);
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return parenthesized ? -Math.abs(cents) : cents;
}

function chooseTextractDate(
  genericDate: string | null,
  candidates: Array<{ text: string; confidence: number | null }>,
): string | null {
  const normalizedCandidates = new Set(
    candidates
      .map((candidate) => extractAccountingText(candidate.text).date)
      .filter((date): date is string => Boolean(date)),
  );
  if (genericDate && normalizedCandidates.has(genericDate)) return genericDate;
  if (normalizedCandidates.size === 1) {
    return Array.from(normalizedCandidates)[0];
  }
  if (normalizedCandidates.size === 0) return genericDate;
  return null;
}

function evaluateFinancialConsistency(
  subtotalCents: number | null,
  taxCents: number | null,
  totalCents: number | null,
): AccountingTextractExpenseEvidence['financialConsistency'] {
  if (subtotalCents == null || taxCents == null || totalCents == null) {
    return 'INSUFFICIENT';
  }
  return subtotalCents + taxCents === totalCents ? 'MATCHED' : 'MISMATCH';
}

function deriveCurrencySuggestion(
  fields: Array<AccountingTextractNormalizedField | null>,
): AccountingTextractCurrencySuggestion {
  const candidates = fields.filter(
    (field): field is AccountingTextractNormalizedField => Boolean(field?.currencyCode),
  );
  const codes = new Set(
    candidates
      .map((field) => field.currencyCode)
      .filter((code): code is string => Boolean(code)),
  );
  if (codes.size !== 1) {
    return {
      code: null,
      confidence: null,
      ambiguous: codes.size > 1,
    };
  }
  const code = Array.from(codes)[0];
  const confidences = candidates
    .map((field) => field.currencyConfidence)
    .filter((value): value is number => value != null);
  return {
    code,
    confidence: confidences.length ? Math.max(...confidences) : null,
    ambiguous: false,
  };
}

function deriveTextractExtractionConfidence(input: {
  date: string | null;
  generic: AccountingPdfExtraction;
  totalCents: number | null;
  financialConsistency: AccountingTextractExpenseEvidence['financialConsistency'];
}): AccountingPdfExtraction['confidence'] {
  if (
    input.totalCents != null &&
    input.date &&
    input.financialConsistency === 'MATCHED'
  ) {
    return 'HIGH';
  }
  if (input.totalCents != null) return 'MEDIUM';
  return input.generic.confidence;
}
