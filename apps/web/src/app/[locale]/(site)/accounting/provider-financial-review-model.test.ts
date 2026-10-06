import type {
  AccountingProviderFinancialDocument,
  AccountingProviderFinancialReviewRevision,
} from './contracts/provider-financial';
import {
  applyReviewedProviderFinancialLines,
  buildReviewCorrectionInputs,
  centsToMoneyInput,
  latestConfirmedProviderReview,
  parseMoneyInputToCents,
  reviewRowsFromRevision,
} from './provider-financial-review-model';

const document: AccountingProviderFinancialDocument = {
  documentStableId: 'acctfindoc_july',
  provider: 'UBER_EATS',
  documentType: 'STATEMENT',
  revision: 1,
  storeStableId: '4750_Yonge_Street',
  providerMerchantRef: null,
  providerDocumentRef: 'B4842290',
  periodStart: '2026-07-01',
  periodEnd: '2026-07-31',
  settledAt: null,
  payoutAt: null,
  currency: 'CAD',
  parserName: 'accounting-provider-financial',
  parserVersion: '3',
  lines: [
    {
      lineStableId: 'line_sales',
      lineNo: 1,
      rawName: 'Sales',
      component: 'SALES',
      postingTreatment: 'POSTABLE',
      taxRole: 'NONE',
      amountCents: 260336,
      occurredAt: null,
    },
    {
      lineStableId: 'line_sales_tax',
      lineNo: 2,
      rawName: 'Tax on Sales',
      component: 'SALES_TAX',
      postingTreatment: 'POSTABLE',
      taxRole: 'SALES_TAX',
      amountCents: 260336,
      occurredAt: null,
    },
  ],
};

const confirmed: AccountingProviderFinancialReviewRevision = {
  reviewRevisionStableId: 'acctfinreview_july_1',
  revision: 1,
  status: 'CONFIRMED',
  reviewHash: 'a'.repeat(64),
  note: 'Correct PDF pairing',
  effectiveSnapshotParserName: null,
  effectiveSnapshotParserVersion: null,
  effectiveSnapshotParseRunStableId: null,
  effectiveSnapshotSourceParseRunStableId: null,
  createdByUserStableId: 'user_admin_1',
  confirmedByUserStableId: 'user_admin_1',
  confirmedAt: '2026-09-20T14:00:00.000Z',
  createdAt: '2026-09-20T13:00:00.000Z',
  updatedAt: '2026-09-20T14:00:00.000Z',
  effectiveLines: [],
  corrections: [
    {
      correctionStableId: 'acctfincorr_1',
      sourceLineStableId: 'line_sales_tax',
      reason: 'EXTRACTION_CORRECTION',
      note: 'Source PDF shows $338.48',
      effectiveRawCode: null,
      effectiveRawName: 'Tax on Sales',
      effectiveComponent: 'SALES_TAX',
      effectivePostingTreatment: 'POSTABLE',
      effectiveTaxRole: 'SALES_TAX',
      effectiveAmountCents: 33848,
    },
  ],
};

describe('provider financial review UI model', () => {
  it('converts exact decimal input to integer cents without floating-point rounding', () => {
    expect(parseMoneyInputToCents('338.48')).toBe(33848);
    expect(parseMoneyInputToCents('-79.41')).toBe(-7941);
    expect(parseMoneyInputToCents('10')).toBe(1000);
    expect(parseMoneyInputToCents('1.234')).toBeNull();
    expect(centsToMoneyInput(-7941)).toBe('-79.41');
  });

  it('projects confirmed review corrections without mutating machine lines', () => {
    const effective = applyReviewedProviderFinancialLines(document, confirmed);

    expect(document.lines[1]?.amountCents).toBe(260336);
    expect(effective[1]?.amountCents).toBe(33848);
    expect(effective[0]).toEqual(document.lines[0]);
  });

  it('uses a confirmed parser snapshot as the full effective line set', () => {
    const snapshot: AccountingProviderFinancialReviewRevision = {
      ...confirmed,
      reviewRevisionStableId: 'acctfinreview_snapshot_1',
      corrections: [],
      effectiveSnapshotParserName: 'accounting-provider-financial',
      effectiveSnapshotParserVersion: '7',
      effectiveSnapshotParseRunStableId: 'acctparserun_v7',
      effectiveSnapshotSourceParseRunStableId: 'acctparserun_v6',
      effectiveLines: [
        {
          reviewedLineStableId: 'reviewed_fee_control',
          lineNo: 1,
          sourceLineStableId: null,
          rawCode: 'CLOVER_FEES_TOTAL',
          rawName: 'Fees',
          component: 'CONTROL_TOTAL',
          postingTreatment: 'CONTROL_TOTAL',
          taxRole: 'NONE',
          amountCents: -3575,
          occurredAt: null,
        },
        {
          reviewedLineStableId: 'reviewed_equipment',
          lineNo: 2,
          sourceLineStableId: null,
          rawCode: 'CLOVER_MONTHLY_EQUIPMENT_BILL',
          rawName: 'Monthly Equipment Bill',
          component: 'PLATFORM_OTHER_FEE',
          postingTreatment: 'POSTABLE',
          taxRole: 'NONE',
          amountCents: -3000,
          occurredAt: null,
        },
      ],
    };

    const effective = applyReviewedProviderFinancialLines(document, snapshot);

    expect(effective).toHaveLength(2);
    expect(effective[0]).toEqual(
      expect.objectContaining({
        lineStableId: 'reviewed_fee_control',
        component: 'CONTROL_TOTAL',
        amountCents: -3575,
      }),
    );
    expect(effective[1]).toEqual(
      expect.objectContaining({
        lineStableId: 'reviewed_equipment',
        component: 'PLATFORM_OTHER_FEE',
        amountCents: -3000,
      }),
    );
    expect(document.lines).toHaveLength(2);
    expect(document.lines[0]?.component).toBe('SALES');
  });

  it('selects the highest confirmed revision rather than a newer draft', () => {
    const result = latestConfirmedProviderReview([
      { ...confirmed, revision: 1 },
      { ...confirmed, revision: 2, status: 'SUPERSEDED' },
      { ...confirmed, revision: 3, status: 'DRAFT' },
      { ...confirmed, revision: 4 },
    ]);

    expect(result?.revision).toBe(4);
  });

  it('round-trips a confirmed extraction correction into a new full revision draft', () => {
    const rows = reviewRowsFromRevision(document, confirmed);
    const built = buildReviewCorrectionInputs(rows, document.lines);

    expect(built.error).toBeNull();
    expect(built.corrections).toEqual([
      {
        sourceLineStableId: 'line_sales_tax',
        reason: 'EXTRACTION_CORRECTION',
        rawName: 'Tax on Sales',
        amountCents: 33848,
        note: 'Source PDF shows $338.48',
      },
    ]);
  });

  it('requires an operator note for semantic classification in the UI adapter', () => {
    const built = buildReviewCorrectionInputs(
      [
        {
          sourceLineStableId: 'line_sales',
          reason: 'SEMANTIC_CLASSIFICATION',
          rawName: 'Sales',
          amount: '2603.36',
          component: 'OTHER',
          postingTreatment: 'RECONCILIATION_ONLY',
          taxRole: 'NONE',
          note: '',
        },
      ],
      document.lines,
    );

    expect(built.corrections).toEqual([]);
    expect(built.error).toContain('Classification note is required');
  });

  it('rejects a semantic classification that leaves the source accounting fields unchanged', () => {
    const sourceLine = {
      lineStableId: 'line_tax_on_other_earnings',
      lineNo: 7,
      rawName: 'Tax on Other Earnings',
      component: 'OTHER' as const,
      postingTreatment: 'POSTABLE' as const,
      taxRole: 'SALES_TAX' as const,
      amountCents: -39,
      occurredAt: null,
    };

    const built = buildReviewCorrectionInputs(
      [
        {
          sourceLineStableId: sourceLine.lineStableId,
          reason: 'SEMANTIC_CLASSIFICATION',
          rawName: sourceLine.rawName,
          amount: '-0.39',
          component: 'OTHER',
          postingTreatment: 'POSTABLE',
          taxRole: 'SALES_TAX',
          note: 'Payment Details confirms the tax treatment.',
        },
      ],
      [sourceLine],
    );

    expect(built.corrections).toEqual([]);
    expect(built.error).toContain(
      'Classification does not change source line #7 Tax on Other Earnings',
    );
    expect(built.error).toContain(
      'change Component, Posting treatment, or Tax role',
    );
  });

  it('accepts a semantic classification when the component actually changes', () => {
    const sourceLine = {
      lineStableId: 'line_tax_on_other_earnings',
      lineNo: 7,
      rawName: 'Tax on Other Earnings',
      component: 'OTHER' as const,
      postingTreatment: 'POSTABLE' as const,
      taxRole: 'SALES_TAX' as const,
      amountCents: -39,
      occurredAt: null,
    };

    const built = buildReviewCorrectionInputs(
      [
        {
          sourceLineStableId: sourceLine.lineStableId,
          reason: 'SEMANTIC_CLASSIFICATION',
          rawName: sourceLine.rawName,
          amount: '-0.39',
          component: 'SALES_TAX',
          postingTreatment: 'POSTABLE',
          taxRole: 'SALES_TAX',
          note: 'Payment Details confirms Tax on Price Adjustments.',
        },
      ],
      [sourceLine],
    );

    expect(built.error).toBeNull();
    expect(built.corrections).toEqual([
      {
        sourceLineStableId: sourceLine.lineStableId,
        reason: 'SEMANTIC_CLASSIFICATION',
        component: 'SALES_TAX',
        postingTreatment: 'POSTABLE',
        taxRole: 'SALES_TAX',
        note: 'Payment Details confirms Tax on Price Adjustments.',
      },
    ]);
  });

  it('rejects an extraction correction that leaves label and amount unchanged', () => {
    const built = buildReviewCorrectionInputs(
      [
        {
          sourceLineStableId: 'line_sales',
          reason: 'EXTRACTION_CORRECTION',
          rawName: 'Sales',
          amount: '2603.36',
          component: 'SALES',
          postingTreatment: 'POSTABLE',
          taxRole: 'NONE',
          note: '',
        },
      ],
      document.lines,
    );

    expect(built.corrections).toEqual([]);
    expect(built.error).toContain(
      'Correction does not change source line #1 Sales',
    );
  });
});
