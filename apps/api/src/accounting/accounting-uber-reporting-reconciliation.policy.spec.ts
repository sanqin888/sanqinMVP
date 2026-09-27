import {
  UBER_ACCOUNTING_REPORT_EVIDENCE_KIND,
  type UberAccountingReportEvidenceKind,
} from './accounting-uber-reporting.contract';
import {
  reconcileUberReportingEvidence,
  type UberReportingReconciliationEvidence,
} from './accounting-uber-reporting-reconciliation.policy';

function evidence(input: {
  documentStableId: string;
  kind: UberAccountingReportEvidenceKind;
  reportTotalPayoutCents: number;
  payoutControls: Array<{
    payoutReferenceId: string;
    totalPayoutCents: number;
    rowCount?: number;
  }>;
  unreferencedTotalPayoutCents?: number;
}): UberReportingReconciliationEvidence {
  return {
    documentStableId: input.documentStableId,
    evidenceKind: input.kind,
    periodStart: '2026-09-01',
    periodEnd: '2026-09-25',
    currency: 'CAD',
    reportTotalPayoutCents: input.reportTotalPayoutCents,
    payoutControls: input.payoutControls.map((row) => ({
      ...row,
      rowCount: row.rowCount ?? 1,
    })),
    unreferencedPayoutRowCount:
      input.unreferencedTotalPayoutCents == null ? 0 : 1,
    unreferencedTotalPayoutCents: input.unreferencedTotalPayoutCents ?? 0,
  };
}

describe('Uber Reporting cross-report reconciliation policy', () => {
  it('matches per-payout and report-level payout controls', () => {
    const result = reconcileUberReportingEvidence({
      paymentDetails: [
        evidence({
          documentStableId: 'payment-doc-1',
          kind: UBER_ACCOUNTING_REPORT_EVIDENCE_KIND.PAYMENT_DETAILS,
          reportTotalPayoutCents: 3000,
          payoutControls: [
            { payoutReferenceId: 'payout-a', totalPayoutCents: 1000, rowCount: 2 },
            { payoutReferenceId: 'payout-b', totalPayoutCents: 2000 },
          ],
        }),
      ],
      payoutSummaries: [
        evidence({
          documentStableId: 'summary-doc-1',
          kind: UBER_ACCOUNTING_REPORT_EVIDENCE_KIND.PAYOUT_SUMMARY,
          reportTotalPayoutCents: 3000,
          payoutControls: [
            { payoutReferenceId: 'payout-a', totalPayoutCents: 1000 },
            { payoutReferenceId: 'payout-b', totalPayoutCents: 2000 },
          ],
        }),
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'MATCHED',
        paymentDetailsReportTotalPayoutCents: 3000,
        payoutSummaryReportTotalPayoutCents: 3000,
        reportTotalDeltaCents: 0,
        issues: [],
      }),
    );
    expect(result.payoutReferenceChecks).toEqual([
      expect.objectContaining({
        payoutReferenceId: 'payout-a',
        deltaCents: 0,
        status: 'MATCHED',
      }),
      expect.objectContaining({
        payoutReferenceId: 'payout-b',
        deltaCents: 0,
        status: 'MATCHED',
      }),
    ]);
  });

  it('fails reconciliation when payout-reference membership or grouped totals differ', () => {
    const result = reconcileUberReportingEvidence({
      paymentDetails: [
        evidence({
          documentStableId: 'payment-doc-1',
          kind: UBER_ACCOUNTING_REPORT_EVIDENCE_KIND.PAYMENT_DETAILS,
          reportTotalPayoutCents: 3000,
          payoutControls: [
            { payoutReferenceId: 'payout-a', totalPayoutCents: 1000 },
            { payoutReferenceId: 'payout-b', totalPayoutCents: 2000 },
          ],
        }),
      ],
      payoutSummaries: [
        evidence({
          documentStableId: 'summary-doc-1',
          kind: UBER_ACCOUNTING_REPORT_EVIDENCE_KIND.PAYOUT_SUMMARY,
          reportTotalPayoutCents: 2900,
          payoutControls: [
            { payoutReferenceId: 'payout-a', totalPayoutCents: 900 },
            { payoutReferenceId: 'payout-c', totalPayoutCents: 2000 },
          ],
        }),
      ],
    });

    expect(result.status).toBe('MISMATCH');
    expect(result.issues).toEqual(
      expect.arrayContaining([
        'PAYOUT_REFERENCE_SET_MISMATCH',
        'PAYOUT_REFERENCE_TOTAL_MISMATCH',
        'REPORT_TOTAL_PAYOUT_MISMATCH',
      ]),
    );
  });

  it('fails closed when evidence is incomplete or has nonzero payout without a reference', () => {
    const result = reconcileUberReportingEvidence({
      paymentDetails: [
        evidence({
          documentStableId: 'payment-doc-1',
          kind: UBER_ACCOUNTING_REPORT_EVIDENCE_KIND.PAYMENT_DETAILS,
          reportTotalPayoutCents: 1000,
          payoutControls: [],
          unreferencedTotalPayoutCents: 1000,
        }),
      ],
      payoutSummaries: [],
    });

    expect(result.status).toBe('INCOMPLETE');
    expect(result.issues).toEqual(
      expect.arrayContaining([
        'PAYOUT_SUMMARY_MISSING',
        'NONZERO_UNREFERENCED_TOTAL_PAYOUT',
      ]),
    );
  });

  it('fails closed when a document payout-control spine does not sum to its report total', () => {
    const result = reconcileUberReportingEvidence({
      paymentDetails: [
        evidence({
          documentStableId: 'payment-doc-1',
          kind: UBER_ACCOUNTING_REPORT_EVIDENCE_KIND.PAYMENT_DETAILS,
          reportTotalPayoutCents: 1000,
          payoutControls: [
            { payoutReferenceId: 'payout-a', totalPayoutCents: 900 },
          ],
        }),
      ],
      payoutSummaries: [
        evidence({
          documentStableId: 'summary-doc-1',
          kind: UBER_ACCOUNTING_REPORT_EVIDENCE_KIND.PAYOUT_SUMMARY,
          reportTotalPayoutCents: 1000,
          payoutControls: [
            { payoutReferenceId: 'payout-a', totalPayoutCents: 1000 },
          ],
        }),
      ],
    });

    expect(result.status).toBe('INCOMPLETE');
    expect(result.issues).toContain(
      'PAYMENT_DETAILS_INTERNAL_PAYOUT_TOTAL_MISMATCH',
    );
  });

  it('aggregates multiple source artifacts before comparing payout references', () => {
    const result = reconcileUberReportingEvidence({
      paymentDetails: [
        evidence({
          documentStableId: 'payment-doc-1',
          kind: UBER_ACCOUNTING_REPORT_EVIDENCE_KIND.PAYMENT_DETAILS,
          reportTotalPayoutCents: 1000,
          payoutControls: [
            { payoutReferenceId: 'payout-a', totalPayoutCents: 1000 },
          ],
        }),
        evidence({
          documentStableId: 'payment-doc-2',
          kind: UBER_ACCOUNTING_REPORT_EVIDENCE_KIND.PAYMENT_DETAILS,
          reportTotalPayoutCents: 500,
          payoutControls: [
            { payoutReferenceId: 'payout-a', totalPayoutCents: 500 },
          ],
        }),
      ],
      payoutSummaries: [
        evidence({
          documentStableId: 'summary-doc-1',
          kind: UBER_ACCOUNTING_REPORT_EVIDENCE_KIND.PAYOUT_SUMMARY,
          reportTotalPayoutCents: 1500,
          payoutControls: [
            { payoutReferenceId: 'payout-a', totalPayoutCents: 1500 },
          ],
        }),
      ],
    });

    expect(result.status).toBe('MATCHED');
    expect(result.payoutReferenceChecks).toEqual([
      expect.objectContaining({
        payoutReferenceId: 'payout-a',
        paymentDetailsTotalPayoutCents: 1500,
        payoutSummaryTotalPayoutCents: 1500,
      }),
    ]);
  });
});
