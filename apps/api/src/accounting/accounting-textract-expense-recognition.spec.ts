import type { AnalyzeExpenseCommandOutput } from '@aws-sdk/client-textract';
import sharp from 'sharp';
import {
  ACCOUNTING_TEXTRACT_EXPENSE_POLICY,
  isAccountingTextractExpenseRecognitionEnabled,
  recognizeAccountingExpenseImageWithTextract,
  recognizeAccountingExpensePdfWithTextract,
} from './accounting-textract-expense-recognition';

function summaryField(
  type: string,
  text: string,
  confidence = 99,
  currencyCode: string | null = 'USD',
) {
  return {
    Type: { Text: type, Confidence: confidence },
    ValueDetection: { Text: text, Confidence: confidence },
    ...(currencyCode
      ? {
          Currency: {
            Code: currencyCode,
            Confidence: 88,
          },
        }
      : {}),
  };
}

function line(text: string, top: number) {
  return {
    BlockType: 'LINE',
    Text: text,
    Page: 1,
    Confidence: 98.5,
    Geometry: {
      BoundingBox: {
        Left: 0.2,
        Top: top,
        Width: 0.6,
        Height: 0.02,
      },
    },
  };
}

async function receiptImage() {
  const receipt = await sharp({
    create: {
      width: 500,
      height: 1500,
      channels: 3,
      background: { r: 248, g: 248, b: 248 },
    },
  })
    .jpeg({ quality: 98 })
    .toBuffer();
  return sharp({
    create: {
      width: 1000,
      height: 1600,
      channels: 3,
      background: { r: 20, g: 20, b: 20 },
    },
  })
    .composite([{ input: receipt, left: 250, top: 50 }])
    .jpeg({ quality: 98 })
    .toBuffer();
}

describe('Accounting Textract expense recognition', () => {
  it('keeps inferred Textract currency as suggestion and ignores wrong amount-paid as canonical total', async () => {
    const input = await receiptImage();
    const submitted: Buffer[] = [];
    const runner = jest.fn((image: Buffer) => {
      submitted.push(image);
      return Promise.resolve({
        $metadata: { requestId: 'textract-request-1' },
        AnalyzeExpenseModelVersion: '1.0',
        ExpenseDocuments: [
          {
            ExpenseIndex: 1,
            SummaryFields: [
              summaryField('VENDOR_NAME', 'FOODY MART SUPERMARKET', 99.9, null),
              summaryField('INVOICE_RECEIPT_DATE', '2026/09/08', 99.9, null),
              summaryField('SUBTOTAL', '42.38', 99.9),
              summaryField('TAX', '0.00', 99.9),
              summaryField('TOTAL', '42.38', 99.9),
              summaryField('AMOUNT_PAID', '12.38', 99.7),
            ],
            LineItemGroups: [
              {
                LineItemGroupIndex: 1,
                LineItems: [
                  {
                    LineItemExpenseFields: [
                      summaryField('ITEM', 'Meat the', 98.5, null),
                      summaryField('PRICE', '11.32', 99.1),
                    ],
                  },
                  {
                    LineItemExpenseFields: [
                      summaryField('ITEM', 'Meat', 97.5, null),
                      summaryField('PRICE', '23.07', 99.2),
                    ],
                  },
                  {
                    LineItemExpenseFields: [
                      summaryField(
                        'ITEM',
                        'New Zealand Golden Kiwi',
                        96.5,
                        null,
                      ),
                      summaryField('PRICE', '7.99', 98.8),
                    ],
                  },
                ],
              },
            ],
            Blocks: [
              line('FOODY MART SUPERMARKET', 0.05),
              line('2026/09/08', 0.1),
              line('Sub Total 42.38', 0.5),
              line('HST 0.00', 0.55),
              line('Total after Tax 42.38', 0.6),
              line('Debit Card 42.38', 0.65),
            ],
          },
        ],
      } as AnalyzeExpenseCommandOutput);
    });

    const result = await recognizeAccountingExpenseImageWithTextract(
      input,
      runner,
    );

    expect(runner).toHaveBeenCalledTimes(1);
    const submittedImage = submitted[0];
    if (!submittedImage) throw new Error('expected Textract image submission');
    expect(submittedImage.subarray(0, 3)).toEqual(
      Buffer.from([0xff, 0xd8, 0xff]),
    );
    expect(submittedImage.length).toBeLessThanOrEqual(
      ACCOUNTING_TEXTRACT_EXPENSE_POLICY.maxImageBytes,
    );
    expect(result.extraction).toEqual(
      expect.objectContaining({
        date: '2026-09-08',
        subtotalCents: 4238,
        taxCents: 0,
        totalCents: 4238,
        sourceCurrency: null,
        sourceCurrencyEvidence: 'UNKNOWN',
      }),
    );
    expect(result.documentExtraction).toEqual(
      expect.objectContaining({
        version: 1,
        inputKind: 'IMAGE',
        engine: 'AWS_TEXTRACT',
        layoutMode: 'GEOMETRY',
        truncated: false,
      }),
    );
    expect(result.documentExtraction.lines[0]).toEqual(
      expect.objectContaining({
        lineId: 'p1-l1',
        text: 'FOODY MART SUPERMARKET',
        confidence: 98.5,
      }),
    );
    expect(result.documentExtraction.lines[0]?.geometry?.left).toBeCloseTo(0.2);
    expect(result.documentExtraction.lines[0]?.geometry?.top).toBeCloseTo(0.05);
    expect(result.documentExtraction.lines[0]?.geometry?.width).toBeCloseTo(
      0.6,
    );
    expect(result.documentExtraction.lines[0]?.geometry?.height).toBeCloseTo(
      0.02,
    );
    expect(result.evidence).toEqual(
      expect.objectContaining({
        provider: 'AWS_TEXTRACT_ANALYZE_EXPENSE',
        requestId: 'textract-request-1',
        vendorName: 'FOODY MART SUPERMARKET',
        financialConsistency: 'MATCHED',
        currencySuggestion: {
          code: 'USD',
          confidence: 88,
          ambiguous: false,
        },
        lineItemCount: 3,
        lineItemPriceCount: 3,
        lineItemPriceSumCents: 4238,
        lineItemsReconcileToSubtotal: true,
        lineItemHintsTruncated: false,
        lineItemHints: [
          { description: 'Meat the', priceCents: 1132, confidence: 99.1 },
          { description: 'Meat', priceCents: 2307, confidence: 99.2 },
          {
            description: 'New Zealand Golden Kiwi',
            priceCents: 799,
            confidence: 98.8,
          },
        ],
      }),
    );
    expect(result.evidence.summaryFields.amountPaid?.text).toBe('12.38');
    expect(result.extraction.totalCents).toBe(4238);
  });

  it('uses explicit source text for foreign source currency instead of provider inference', async () => {
    const input = await receiptImage();
    const result = await recognizeAccountingExpenseImageWithTextract(
      input,
      () =>
        Promise.resolve({
          $metadata: { requestId: 'textract-request-2' },
          ExpenseDocuments: [
            {
              SummaryFields: [
                summaryField('SUBTOTAL', '20.00', 99, 'USD'),
                summaryField('TAX', '0.00', 99, 'USD'),
                summaryField('TOTAL', '20.00', 99, 'USD'),
              ],
              Blocks: [
                line('Cloud service subscription', 0.1),
                line('Amount due USD 20.00', 0.5),
                line('Total USD 20.00', 0.6),
              ],
            },
          ],
        } as AnalyzeExpenseCommandOutput),
    );

    expect(result.extraction.sourceCurrency).toBe('USD');
    expect(result.extraction.sourceCurrencyEvidence).toBe('EXPLICIT_TEXT');
    expect(result.evidence.currencySuggestion.code).toBe('USD');
  });

  it('keeps unreconciled line-item totals as diagnostics without overriding summary totals', async () => {
    const input = await receiptImage();
    const result = await recognizeAccountingExpenseImageWithTextract(
      input,
      () =>
        Promise.resolve({
          $metadata: {},
          ExpenseDocuments: [
            {
              SummaryFields: [
                summaryField('SUBTOTAL', '105.35', 99.9, 'CAD'),
                summaryField('TAX', '0.00', 99.9, 'CAD'),
                summaryField('TOTAL', '105.35', 99.9, 'CAD'),
              ],
              LineItemGroups: [
                {
                  LineItems: [
                    {
                      LineItemExpenseFields: [summaryField('PRICE', '50.00')],
                    },
                    {
                      LineItemExpenseFields: [summaryField('PRICE', '58.36')],
                    },
                  ],
                },
              ],
              Blocks: [
                line('Sep 15 2026', 0.1),
                line('Sub Total 105.35', 0.5),
                line('HST 0.00', 0.55),
                line('Total 105.35', 0.6),
              ],
            },
          ],
        } as AnalyzeExpenseCommandOutput),
    );

    expect(result.extraction.subtotalCents).toBe(10535);
    expect(result.extraction.totalCents).toBe(10535);
    expect(result.evidence.lineItemPriceSumCents).toBe(10836);
    expect(result.evidence.lineItemsReconcileToSubtotal).toBe(false);
    expect(result.evidence.lineItemHints).toEqual([
      { description: null, priceCents: 5000, confidence: 99 },
      { description: null, priceCents: 5836, confidence: 99 },
    ]);
  });

  it('bounds persisted line-item hints without changing reconciliation', async () => {
    const input = await receiptImage();
    const result = await recognizeAccountingExpenseImageWithTextract(
      input,
      () =>
        Promise.resolve({
          $metadata: {},
          ExpenseDocuments: [
            {
              SummaryFields: [
                summaryField('SUBTOTAL', '51.00', 99.9, 'CAD'),
                summaryField('TAX', '0.00', 99.9, 'CAD'),
                summaryField('TOTAL', '51.00', 99.9, 'CAD'),
              ],
              LineItemGroups: [
                {
                  LineItems: Array.from({ length: 51 }, (_, index) => ({
                    LineItemExpenseFields: [
                      summaryField('ITEM', `Item ${index + 1}`, 99, null),
                      summaryField('PRICE', '1.00', 99, 'CAD'),
                    ],
                  })),
                },
              ],
              Blocks: [
                line('Sep 15 2026', 0.1),
                line('Sub Total 51.00', 0.5),
                line('HST 0.00', 0.55),
                line('Total 51.00', 0.6),
              ],
            },
          ],
        } as AnalyzeExpenseCommandOutput),
    );

    expect(result.evidence.lineItemPriceCount).toBe(51);
    expect(result.evidence.lineItemPriceSumCents).toBe(5100);
    expect(result.evidence.lineItemsReconcileToSubtotal).toBe(true);
    expect(result.evidence.lineItemHints).toHaveLength(50);
    expect(result.evidence.lineItemHintsTruncated).toBe(true);
  });

  it('does not choose a conflicting Textract date solely by provider confidence', async () => {
    const input = await receiptImage();
    const result = await recognizeAccountingExpenseImageWithTextract(
      input,
      () =>
        Promise.resolve({
          $metadata: {},
          ExpenseDocuments: [
            {
              SummaryFields: [
                summaryField('INVOICE_RECEIPT_DATE', '2020/09/10', 99.8, null),
                summaryField('INVOICE_RECEIPT_DATE', 'Sep 15 2026', 95, null),
                summaryField('SUBTOTAL', '105.35', 99.9, 'CAD'),
                summaryField('TAX', '0.00', 99.9, 'CAD'),
                summaryField('TOTAL', '105.35', 99.9, 'CAD'),
              ],
              Blocks: [
                line('Sub Total 105.35', 0.5),
                line('HST 0.00', 0.55),
                line('Total 105.35', 0.6),
              ],
            },
          ],
        } as AnalyzeExpenseCommandOutput),
    );

    expect(result.extraction.date).toBeNull();
    expect(result.evidence.dateCandidates).toHaveLength(2);
  });

  it('fails closed when full-text parsing matches one candidate but other normalized receipt dates conflict', async () => {
    const input = await receiptImage();
    const result = await recognizeAccountingExpenseImageWithTextract(
      input,
      () =>
        Promise.resolve({
          $metadata: {},
          ExpenseDocuments: [
            {
              SummaryFields: [
                summaryField('INVOICE_RECEIPT_DATE', '26/09/08', 99.59, null),
                summaryField('INVOICE_RECEIPT_DATE', '2026/09/01', 99.98, null),
                summaryField(
                  'INVOICE_RECEIPT_DATE',
                  'Sep 08 2026',
                  79.78,
                  null,
                ),
                summaryField('SUBTOTAL', '42.38', 99.97, 'USD'),
                summaryField('TAX', '0.00', 99.96, 'USD'),
                summaryField('TOTAL', '42.38', 99.99, 'USD'),
              ],
              Blocks: [
                line('FOODY MART SUPERMARKET', 0.05),
                line('2026/09/01 10:39 Receipt# P1260908163966', 0.1),
                line('Sep 08 2026 04:39 pm', 0.7),
                line('Sub Total 42.38', 0.75),
                line('HST 0.00', 0.8),
                line('Total after Tax 42.38', 0.85),
              ],
            },
          ],
        } as AnalyzeExpenseCommandOutput),
    );

    expect(result.extraction.date).toBeNull();
    expect(result.extraction.totalCents).toBe(4238);
    expect(result.evidence.dateCandidates).toHaveLength(3);
  });

  it('submits scanned PDF bytes unchanged through the synchronous expense mapper', async () => {
    const pdf = Buffer.from('%PDF-1.4\nscanned-page\n%%EOF', 'ascii');
    let submitted: Buffer | null = null;
    const result = await recognizeAccountingExpensePdfWithTextract(
      pdf,
      (document) => {
        submitted = document;
        return Promise.resolve({
          $metadata: { requestId: 'textract-pdf-request' },
          AnalyzeExpenseModelVersion: '1.0',
          ExpenseDocuments: [
            {
              SummaryFields: [
                summaryField('SUBTOTAL', '20.00', 99, 'USD'),
                summaryField('TAX', '0.00', 99, 'USD'),
                summaryField('TOTAL', '20.00', 99, 'USD'),
              ],
              Blocks: [
                line('Sep 16 2026', 0.1),
                line('Subtotal USD 20.00', 0.5),
                line('Tax USD 0.00', 0.55),
                line('Total USD 20.00', 0.6),
              ],
            },
          ],
        } as AnalyzeExpenseCommandOutput);
      },
    );

    expect(submitted).toBe(pdf);
    expect(result.extraction).toEqual(
      expect.objectContaining({
        date: '2026-09-16',
        totalCents: 2000,
        sourceCurrency: 'USD',
      }),
    );
    expect(result.documentExtraction).toEqual(
      expect.objectContaining({
        inputKind: 'PDF',
        engine: 'AWS_TEXTRACT',
        layoutMode: 'GEOMETRY',
      }),
    );
    expect(result.evidence.submittedDocument).toEqual({
      kind: 'PDF',
      cropApplied: false,
      width: null,
      height: null,
      byteSize: pdf.length,
    });
  });

  it('requires explicit enablement before acquisition uses Textract', () => {
    expect(isAccountingTextractExpenseRecognitionEnabled(undefined)).toBe(
      false,
    );
    expect(isAccountingTextractExpenseRecognitionEnabled('false')).toBe(false);
    expect(isAccountingTextractExpenseRecognitionEnabled('1')).toBe(true);
    expect(isAccountingTextractExpenseRecognitionEnabled('true')).toBe(true);
  });
});
