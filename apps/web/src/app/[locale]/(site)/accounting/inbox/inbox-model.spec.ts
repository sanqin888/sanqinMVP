import {
  reconciledTextractLineItemHints,
  type AccountingInboxParseResult,
} from './inbox-model';

describe('reconciledTextractLineItemHints', () => {
  const baseEvidence: NonNullable<
    AccountingInboxParseResult['textractEvidence']
  > = {
    provider: 'AWS_TEXTRACT_ANALYZE_EXPENSE',
    lineItemPriceCount: 3,
    lineItemsReconcileToSubtotal: true,
    lineItemHintsTruncated: false,
    lineItemHints: [
      { description: ' Meat the ', priceCents: 1132, confidence: 99.1 },
      { description: 'Meat', priceCents: 2307, confidence: 99.2 },
      {
        description: 'New Zealand Golden Kiwi',
        priceCents: 799,
        confidence: 98.8,
      },
    ],
  };
  const baseResult: AccountingInboxParseResult = {
    subtotalCents: 4238,
    textractEvidence: baseEvidence,
  };

  it('returns review hints only when recognized prices reconcile to subtotal', () => {
    expect(reconciledTextractLineItemHints(baseResult)).toEqual([
      { description: 'Meat the', priceCents: 1132, confidence: 99.1 },
      { description: 'Meat', priceCents: 2307, confidence: 99.2 },
      {
        description: 'New Zealand Golden Kiwi',
        priceCents: 799,
        confidence: 98.8,
      },
    ]);
  });

  it('fails closed for unsafe hint sets', () => {
    expect(
      reconciledTextractLineItemHints({
        ...baseResult,
        textractEvidence: {
          ...baseEvidence,
          lineItemsReconcileToSubtotal: false,
        },
      }),
    ).toEqual([]);

    expect(
      reconciledTextractLineItemHints({
        ...baseResult,
        textractEvidence: {
          ...baseEvidence,
          lineItemHintsTruncated: true,
        },
      }),
    ).toEqual([]);

    expect(
      reconciledTextractLineItemHints({
        ...baseResult,
        textractEvidence: {
          ...baseEvidence,
          lineItemPriceCount: 4,
        },
      }),
    ).toEqual([]);

    expect(
      reconciledTextractLineItemHints({
        ...baseResult,
        textractEvidence: {
          ...baseEvidence,
          lineItemHints: [
            ...(baseEvidence.lineItemHints ?? []).slice(0, 2),
            { description: 'Discount', priceCents: -101, confidence: 99 },
          ],
        },
      }),
    ).toEqual([]);
  });

  it('rechecks hint sums instead of trusting reconciliation metadata', () => {
    expect(
      reconciledTextractLineItemHints({
        ...baseResult,
        textractEvidence: {
          ...baseEvidence,
          lineItemHints: baseEvidence.lineItemHints?.map((hint, index) =>
            index === 2 ? { ...hint, priceCents: 899 } : hint,
          ),
        },
      }),
    ).toEqual([]);
  });
});
