import {
  resolveProviderFinancialCoverageFrontier,
  resolveProviderPaymentFactAuthority,
} from './accounting-provider-financial-coverage.policy';

describe('provider payment-fact authority policy', () => {
  const cutover = new Date('2026-10-01T14:30:00.000Z');

  it('keeps provider documents authoritative before a durable cutover exists', () => {
    expect(
      resolveProviderPaymentFactAuthority({
        occurredAt: new Date('2026-10-02T12:00:00.000Z'),
        providerPaymentFactCutoverAt: null,
        hasCanonicalPaymentFact: false,
      }),
    ).toBe('PROVIDER_DOCUMENTS');
  });

  it('keeps pre-cutover facts on provider-document authority', () => {
    expect(
      resolveProviderPaymentFactAuthority({
        occurredAt: new Date('2026-10-01T14:29:59.999Z'),
        providerPaymentFactCutoverAt: cutover,
        hasCanonicalPaymentFact: true,
      }),
    ).toBe('PROVIDER_DOCUMENTS');
  });

  it('uses Payments canonical facts at and after the durable cutover', () => {
    expect(
      resolveProviderPaymentFactAuthority({
        occurredAt: cutover,
        providerPaymentFactCutoverAt: cutover,
        hasCanonicalPaymentFact: true,
      }),
    ).toBe('PAYMENTS_CANONICAL_FACTS');
  });

  it('fails closed when a post-cutover fact is missing from Payments', () => {
    expect(
      resolveProviderPaymentFactAuthority({
        occurredAt: new Date('2026-10-01T14:30:00.001Z'),
        providerPaymentFactCutoverAt: cutover,
        hasCanonicalPaymentFact: false,
      }),
    ).toBe('BLOCKED_MISSING_CANONICAL_PAYMENT_FACT');
  });
});

describe('provider financial coverage frontier policy', () => {
  it('advances from the required history boundary across contiguous posted periods', () => {
    expect(
      resolveProviderFinancialCoverageFrontier({
        financialHistoryRequiredFrom: '2026-06-01',
        financialCompleteThrough: null,
        intervals: [
          {
            documentStableId: 'doc_august',
            periodStart: '2026-08-01',
            periodEnd: '2026-08-31',
          },
          {
            documentStableId: 'doc_june',
            periodStart: '2026-06-01',
            periodEnd: '2026-06-30',
          },
          {
            documentStableId: 'doc_july',
            periodStart: '2026-07-01',
            periodEnd: '2026-07-31',
          },
        ],
      }),
    ).toEqual({
      financialCompleteThrough: '2026-08-31',
      evidenceDocumentStableIds: ['doc_june', 'doc_july', 'doc_august'],
    });
  });

  it('stops at the first uncovered day instead of jumping to a later period', () => {
    expect(
      resolveProviderFinancialCoverageFrontier({
        financialHistoryRequiredFrom: '2026-06-01',
        financialCompleteThrough: null,
        intervals: [
          {
            documentStableId: 'doc_june',
            periodStart: '2026-06-01',
            periodEnd: '2026-06-30',
          },
          {
            documentStableId: 'doc_august',
            periodStart: '2026-08-01',
            periodEnd: '2026-08-31',
          },
        ],
      }),
    ).toEqual({
      financialCompleteThrough: '2026-06-30',
      evidenceDocumentStableIds: ['doc_june'],
    });
  });

  it('uses an already-proven frontier as the monotonic starting point', () => {
    expect(
      resolveProviderFinancialCoverageFrontier({
        financialHistoryRequiredFrom: '2026-06-01',
        financialCompleteThrough: '2026-06-30',
        intervals: [
          {
            documentStableId: 'doc_july',
            periodStart: '2026-07-01',
            periodEnd: '2026-07-31',
          },
          {
            documentStableId: 'doc_august',
            periodStart: '2026-08-01',
            periodEnd: '2026-08-31',
          },
        ],
      }),
    ).toEqual({
      financialCompleteThrough: '2026-08-31',
      evidenceDocumentStableIds: ['doc_july', 'doc_august'],
    });
  });

  it('accepts overlapping evidence while preserving a continuous frontier', () => {
    expect(
      resolveProviderFinancialCoverageFrontier({
        financialHistoryRequiredFrom: '2026-06-01',
        financialCompleteThrough: null,
        intervals: [
          {
            documentStableId: 'doc_june_first_half',
            periodStart: '2026-06-01',
            periodEnd: '2026-06-15',
          },
          {
            documentStableId: 'doc_june_to_july',
            periodStart: '2026-06-10',
            periodEnd: '2026-07-31',
          },
        ],
      }),
    ).toEqual({
      financialCompleteThrough: '2026-07-31',
      evidenceDocumentStableIds: ['doc_june_first_half', 'doc_june_to_july'],
    });
  });

  it('never regresses an existing complete-through frontier', () => {
    expect(
      resolveProviderFinancialCoverageFrontier({
        financialHistoryRequiredFrom: '2026-06-01',
        financialCompleteThrough: '2026-08-31',
        intervals: [
          {
            documentStableId: 'doc_june',
            periodStart: '2026-06-01',
            periodEnd: '2026-06-30',
          },
        ],
      }),
    ).toEqual({
      financialCompleteThrough: '2026-08-31',
      evidenceDocumentStableIds: [],
    });
  });

  it('fails closed on malformed persisted coverage intervals', () => {
    expect(() =>
      resolveProviderFinancialCoverageFrontier({
        financialHistoryRequiredFrom: '2026-06-01',
        financialCompleteThrough: null,
        intervals: [
          {
            documentStableId: 'doc_bad',
            periodStart: '2026-07-01',
            periodEnd: '2026-06-30',
          },
        ],
      }),
    ).toThrow('provider coverage interval ends before it starts: doc_bad');
  });
});
