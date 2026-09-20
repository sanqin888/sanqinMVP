import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialTaxRole,
  AccountingProviderFinancialCorrectionReason,
} from './accounting-contracts';
import {
  AccountingProviderFinancialReviewPolicyError,
  applyProviderFinancialReviewCorrections,
  normalizeProviderFinancialReviewDraft,
} from './accounting-provider-financial-review.policy';

const sourceLines = [
  {
    lineStableId: 'line_sales',
    lineNo: 1,
    rawCode: null,
    rawName: 'Sales',
    component: AccountingFinancialComponent.SALES,
    postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
    taxRole: AccountingFinancialTaxRole.NONE,
    amountCents: 260336,
  },
  {
    lineStableId: 'line_sales_tax',
    lineNo: 2,
    rawCode: null,
    rawName: 'Tax on Sales',
    component: AccountingFinancialComponent.SALES_TAX,
    postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
    taxRole: AccountingFinancialTaxRole.SALES_TAX,
    amountCents: 260336,
  },
];

describe('Accounting provider financial human review policy', () => {
  it('normalizes an extraction correction without changing accounting classification', () => {
    const review = normalizeProviderFinancialReviewDraft({
      documentType: AccountingFinancialDocumentType.STATEMENT,
      sourceLines,
      input: {
        expectedDocumentRevision: 1,
        note: 'Correct the PDF label/value pairing',
        corrections: [
          {
            sourceLineStableId: 'line_sales_tax',
            reason:
              AccountingProviderFinancialCorrectionReason.EXTRACTION_CORRECTION,
            amountCents: 33848,
            note: 'Source PDF shows $338.48',
          },
        ],
      },
    });

    expect(review).toEqual({
      expectedDocumentRevision: 1,
      note: 'Correct the PDF label/value pairing',
      corrections: [
        {
          sourceLineStableId: 'line_sales_tax',
          reason:
            AccountingProviderFinancialCorrectionReason.EXTRACTION_CORRECTION,
          note: 'Source PDF shows $338.48',
          effectiveRawCode: null,
          effectiveRawName: 'Tax on Sales',
          effectiveComponent: AccountingFinancialComponent.SALES_TAX,
          effectivePostingTreatment:
            AccountingFinancialPostingTreatment.POSTABLE,
          effectiveTaxRole: AccountingFinancialTaxRole.SALES_TAX,
          effectiveAmountCents: 33848,
        },
      ],
    });
  });

  it('allows an explicit unchanged review so a later revision can return to machine evidence', () => {
    expect(
      normalizeProviderFinancialReviewDraft({
        documentType: AccountingFinancialDocumentType.STATEMENT,
        sourceLines,
        input: {
          expectedDocumentRevision: 1,
          note: 'Reviewed against source; machine evidence is accepted as-is',
          corrections: [],
        },
      }),
    ).toEqual({
      expectedDocumentRevision: 1,
      note: 'Reviewed against source; machine evidence is accepted as-is',
      corrections: [],
    });
  });

  it('keeps source evidence immutable for a semantic classification correction', () => {
    const review = normalizeProviderFinancialReviewDraft({
      documentType: AccountingFinancialDocumentType.STATEMENT,
      sourceLines,
      input: {
        expectedDocumentRevision: 1,
        corrections: [
          {
            sourceLineStableId: 'line_sales',
            reason:
              AccountingProviderFinancialCorrectionReason.SEMANTIC_CLASSIFICATION,
            note: 'Treat this provider line as reconciliation-only evidence',
            component: AccountingFinancialComponent.OTHER,
            postingTreatment:
              AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
          },
        ],
      },
    });

    expect(review.corrections[0]).toEqual(
      expect.objectContaining({
        effectiveRawName: 'Sales',
        effectiveAmountCents: 260336,
        effectiveComponent: AccountingFinancialComponent.OTHER,
        effectivePostingTreatment:
          AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
      }),
    );
  });

  it('rejects extraction corrections that try to change accounting semantics', () => {
    expect(() =>
      normalizeProviderFinancialReviewDraft({
        documentType: AccountingFinancialDocumentType.STATEMENT,
        sourceLines,
        input: {
          expectedDocumentRevision: 1,
          corrections: [
            {
              sourceLineStableId: 'line_sales_tax',
              reason:
                AccountingProviderFinancialCorrectionReason.EXTRACTION_CORRECTION,
              amountCents: 33848,
              component: AccountingFinancialComponent.OTHER,
            },
          ],
        },
      }),
    ).toThrow(AccountingProviderFinancialReviewPolicyError);
  });

  it('rejects semantic classification that rewrites the source amount', () => {
    expect(() =>
      normalizeProviderFinancialReviewDraft({
        documentType: AccountingFinancialDocumentType.STATEMENT,
        sourceLines,
        input: {
          expectedDocumentRevision: 1,
          corrections: [
            {
              sourceLineStableId: 'line_sales',
              reason:
                AccountingProviderFinancialCorrectionReason.SEMANTIC_CLASSIFICATION,
              component: AccountingFinancialComponent.OTHER,
              amountCents: 1,
            },
          ],
        },
      }),
    ).toThrow(AccountingProviderFinancialReviewPolicyError);
  });

  it('applies reviewed effective values without mutating the machine source lines', () => {
    const review = normalizeProviderFinancialReviewDraft({
      documentType: AccountingFinancialDocumentType.STATEMENT,
      sourceLines,
      input: {
        expectedDocumentRevision: 1,
        corrections: [
          {
            sourceLineStableId: 'line_sales_tax',
            reason:
              AccountingProviderFinancialCorrectionReason.EXTRACTION_CORRECTION,
            amountCents: 33848,
          },
        ],
      },
    });

    const effective = applyProviderFinancialReviewCorrections({
      sourceLines,
      corrections: review.corrections,
    });

    expect(sourceLines[1]?.amountCents).toBe(260336);
    expect(effective[1]?.amountCents).toBe(33848);
    expect(effective[0]).toEqual(sourceLines[0]);
  });

  it('rejects unknown source lines and no-op corrections', () => {
    expect(() =>
      normalizeProviderFinancialReviewDraft({
        documentType: AccountingFinancialDocumentType.STATEMENT,
        sourceLines,
        input: {
          expectedDocumentRevision: 1,
          corrections: [
            {
              sourceLineStableId: 'missing_line',
              reason:
                AccountingProviderFinancialCorrectionReason.EXTRACTION_CORRECTION,
              amountCents: 33848,
            },
          ],
        },
      }),
    ).toThrow('unknown source line');

    expect(() =>
      normalizeProviderFinancialReviewDraft({
        documentType: AccountingFinancialDocumentType.STATEMENT,
        sourceLines,
        input: {
          expectedDocumentRevision: 1,
          corrections: [
            {
              sourceLineStableId: 'line_sales_tax',
              reason:
                AccountingProviderFinancialCorrectionReason.EXTRACTION_CORRECTION,
              amountCents: 260336,
            },
          ],
        },
      }),
    ).toThrow('does not change source line');
  });
});
