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
                    LineItemExpenseFields: [summaryField('PRICE', '11.32')],
                  },
                  {
                    LineItemExpenseFields: [summaryField('PRICE', '23.07')],
                  },
                  {
                    LineItemExpenseFields: [summaryField('PRICE', '7.99')],
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
