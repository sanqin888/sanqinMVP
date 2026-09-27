import {
  UBER_ACCOUNTING_REPORT_EVIDENCE_KIND,
  type UberAccountingReportEvidenceKind,
} from './accounting-uber-reporting.contract';

export type UberReportingPayoutControl = {
  payoutReferenceId: string;
  totalPayoutCents: number;
  rowCount: number;
};

export type UberReportingReconciliationEvidence = {
  documentStableId: string;
  evidenceKind: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  reportTotalPayoutCents: number;
  payoutControls: UberReportingPayoutControl[];
  unreferencedPayoutRowCount: number;
  unreferencedTotalPayoutCents: number;
};

export type UberReportingReconciliationResult = {
  status: 'MATCHED' | 'MISMATCH' | 'INCOMPLETE';
  periodStart: string | null;
  periodEnd: string | null;
  currency: string | null;
  paymentDetailsDocumentStableIds: string[];
  payoutSummaryDocumentStableIds: string[];
  paymentDetailsReportTotalPayoutCents: number;
  payoutSummaryReportTotalPayoutCents: number;
  reportTotalDeltaCents: number;
  payoutReferenceChecks: Array<{
    payoutReferenceId: string;
    paymentDetailsTotalPayoutCents: number | null;
    payoutSummaryTotalPayoutCents: number | null;
    deltaCents: number | null;
    status:
      | 'MATCHED'
      | 'MISMATCH'
      | 'MISSING_PAYMENT_DETAILS'
      | 'MISSING_PAYOUT_SUMMARY';
  }>;
  issues: string[];
};

function integer(value: number): boolean {
  return Number.isSafeInteger(value);
}

function validateEvidence(
  evidence: UberReportingReconciliationEvidence,
  expectedKind: UberAccountingReportEvidenceKind,
): string[] {
  const issues: string[] = [];
  if (!evidence.documentStableId.trim()) {
    issues.push('DOCUMENT_STABLE_ID_MISSING');
  }
  if (evidence.evidenceKind !== expectedKind) {
    issues.push('EVIDENCE_KIND_MISMATCH');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(evidence.periodStart)) {
    issues.push('PERIOD_START_INVALID');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(evidence.periodEnd)) {
    issues.push('PERIOD_END_INVALID');
  }
  if (!/^[A-Z]{3}$/.test(evidence.currency)) issues.push('CURRENCY_INVALID');
  if (!integer(evidence.reportTotalPayoutCents)) {
    issues.push('REPORT_TOTAL_INVALID');
  }
  if (
    !Number.isSafeInteger(evidence.unreferencedPayoutRowCount) ||
    evidence.unreferencedPayoutRowCount < 0 ||
    !integer(evidence.unreferencedTotalPayoutCents)
  ) {
    issues.push('UNREFERENCED_PAYOUT_CONTROL_INVALID');
  }
  const seen = new Set<string>();
  let referencedTotalPayoutCents = 0;
  for (const control of evidence.payoutControls) {
    const payoutReferenceId = control.payoutReferenceId.trim();
    if (!payoutReferenceId || seen.has(payoutReferenceId)) {
      issues.push('PAYOUT_REFERENCE_INVALID_OR_DUPLICATE');
      continue;
    }
    seen.add(payoutReferenceId);
    if (
      !integer(control.totalPayoutCents) ||
      !Number.isSafeInteger(control.rowCount) ||
      control.rowCount < 1
    ) {
      issues.push('PAYOUT_CONTROL_INVALID');
      continue;
    }
    referencedTotalPayoutCents += control.totalPayoutCents;
  }
  if (
    integer(evidence.reportTotalPayoutCents) &&
    integer(evidence.unreferencedTotalPayoutCents) &&
    referencedTotalPayoutCents + evidence.unreferencedTotalPayoutCents !==
      evidence.reportTotalPayoutCents
  ) {
    issues.push('INTERNAL_PAYOUT_TOTAL_MISMATCH');
  }
  return issues;
}

function aggregateControls(
  evidence: UberReportingReconciliationEvidence[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const document of evidence) {
    for (const control of document.payoutControls) {
      const payoutReferenceId = control.payoutReferenceId.trim();
      result.set(
        payoutReferenceId,
        (result.get(payoutReferenceId) ?? 0) + control.totalPayoutCents,
      );
    }
  }
  return result;
}

export function reconcileUberReportingEvidence(input: {
  paymentDetails: UberReportingReconciliationEvidence[];
  payoutSummaries: UberReportingReconciliationEvidence[];
}): UberReportingReconciliationResult {
  const issues: string[] = [];
  if (!input.paymentDetails.length) issues.push('PAYMENT_DETAILS_MISSING');
  if (!input.payoutSummaries.length) issues.push('PAYOUT_SUMMARY_MISSING');

  for (const evidence of input.paymentDetails) {
    issues.push(
      ...validateEvidence(
        evidence,
        UBER_ACCOUNTING_REPORT_EVIDENCE_KIND.PAYMENT_DETAILS,
      ).map((issue) => `PAYMENT_DETAILS_${issue}`),
    );
  }
  for (const evidence of input.payoutSummaries) {
    issues.push(
      ...validateEvidence(
        evidence,
        UBER_ACCOUNTING_REPORT_EVIDENCE_KIND.PAYOUT_SUMMARY,
      ).map((issue) => `PAYOUT_SUMMARY_${issue}`),
    );
  }

  const all = [...input.paymentDetails, ...input.payoutSummaries];
  const periods = new Set(
    all.map((row) => `${row.periodStart}|${row.periodEnd}`),
  );
  const currencies = new Set(all.map((row) => row.currency));
  if (periods.size > 1) issues.push('PERIOD_MISMATCH');
  if (currencies.size > 1) issues.push('CURRENCY_MISMATCH');

  const unreferencedPayoutCents = all.reduce(
    (sum, row) => sum + row.unreferencedTotalPayoutCents,
    0,
  );
  if (unreferencedPayoutCents !== 0) {
    issues.push('NONZERO_UNREFERENCED_TOTAL_PAYOUT');
  }

  const paymentControls = aggregateControls(input.paymentDetails);
  const summaryControls = aggregateControls(input.payoutSummaries);
  if (
    input.paymentDetails.length &&
    input.payoutSummaries.length &&
    (paymentControls.size === 0 || summaryControls.size === 0)
  ) {
    issues.push('PAYOUT_REFERENCE_CONTROLS_MISSING');
  }
  const payoutReferences = [
    ...new Set([...paymentControls.keys(), ...summaryControls.keys()]),
  ].sort();

  const payoutReferenceChecks = payoutReferences.map((payoutReferenceId) => {
    const payment = paymentControls.get(payoutReferenceId);
    const summary = summaryControls.get(payoutReferenceId);
    if (payment == null) {
      return {
        payoutReferenceId,
        paymentDetailsTotalPayoutCents: null,
        payoutSummaryTotalPayoutCents: summary ?? null,
        deltaCents: null,
        status: 'MISSING_PAYMENT_DETAILS' as const,
      };
    }
    if (summary == null) {
      return {
        payoutReferenceId,
        paymentDetailsTotalPayoutCents: payment,
        payoutSummaryTotalPayoutCents: null,
        deltaCents: null,
        status: 'MISSING_PAYOUT_SUMMARY' as const,
      };
    }
    const deltaCents = payment - summary;
    return {
      payoutReferenceId,
      paymentDetailsTotalPayoutCents: payment,
      payoutSummaryTotalPayoutCents: summary,
      deltaCents,
      status: deltaCents === 0 ? ('MATCHED' as const) : ('MISMATCH' as const),
    };
  });

  if (
    payoutReferenceChecks.some(
      (check) =>
        check.status === 'MISSING_PAYMENT_DETAILS' ||
        check.status === 'MISSING_PAYOUT_SUMMARY',
    )
  ) {
    issues.push('PAYOUT_REFERENCE_SET_MISMATCH');
  }
  if (payoutReferenceChecks.some((check) => check.status === 'MISMATCH')) {
    issues.push('PAYOUT_REFERENCE_TOTAL_MISMATCH');
  }

  const paymentDetailsReportTotalPayoutCents = input.paymentDetails.reduce(
    (sum, row) => sum + row.reportTotalPayoutCents,
    0,
  );
  const payoutSummaryReportTotalPayoutCents = input.payoutSummaries.reduce(
    (sum, row) => sum + row.reportTotalPayoutCents,
    0,
  );
  const reportTotalDeltaCents =
    paymentDetailsReportTotalPayoutCents - payoutSummaryReportTotalPayoutCents;
  if (
    input.paymentDetails.length &&
    input.payoutSummaries.length &&
    reportTotalDeltaCents !== 0
  ) {
    issues.push('REPORT_TOTAL_PAYOUT_MISMATCH');
  }

  const incompleteIssues = new Set([
    'PAYMENT_DETAILS_MISSING',
    'PAYOUT_SUMMARY_MISSING',
    'PAYMENT_DETAILS_DOCUMENT_STABLE_ID_MISSING',
    'PAYOUT_SUMMARY_DOCUMENT_STABLE_ID_MISSING',
    'PAYMENT_DETAILS_EVIDENCE_KIND_MISMATCH',
    'PAYOUT_SUMMARY_EVIDENCE_KIND_MISMATCH',
    'PAYMENT_DETAILS_PERIOD_START_INVALID',
    'PAYMENT_DETAILS_PERIOD_END_INVALID',
    'PAYOUT_SUMMARY_PERIOD_START_INVALID',
    'PAYOUT_SUMMARY_PERIOD_END_INVALID',
    'PAYMENT_DETAILS_CURRENCY_INVALID',
    'PAYOUT_SUMMARY_CURRENCY_INVALID',
    'PAYMENT_DETAILS_REPORT_TOTAL_INVALID',
    'PAYOUT_SUMMARY_REPORT_TOTAL_INVALID',
    'PAYMENT_DETAILS_UNREFERENCED_PAYOUT_CONTROL_INVALID',
    'PAYOUT_SUMMARY_UNREFERENCED_PAYOUT_CONTROL_INVALID',
    'PAYMENT_DETAILS_PAYOUT_REFERENCE_INVALID_OR_DUPLICATE',
    'PAYOUT_SUMMARY_PAYOUT_REFERENCE_INVALID_OR_DUPLICATE',
    'PAYMENT_DETAILS_PAYOUT_CONTROL_INVALID',
    'PAYOUT_SUMMARY_PAYOUT_CONTROL_INVALID',
    'PAYMENT_DETAILS_INTERNAL_PAYOUT_TOTAL_MISMATCH',
    'PAYOUT_SUMMARY_INTERNAL_PAYOUT_TOTAL_MISMATCH',
    'PAYOUT_REFERENCE_CONTROLS_MISSING',
    'PERIOD_MISMATCH',
    'CURRENCY_MISMATCH',
    'NONZERO_UNREFERENCED_TOTAL_PAYOUT',
  ]);
  const hasIncomplete = issues.some((issue) => incompleteIssues.has(issue));
  const hasMismatch = issues.some((issue) =>
    [
      'PAYOUT_REFERENCE_SET_MISMATCH',
      'PAYOUT_REFERENCE_TOTAL_MISMATCH',
      'REPORT_TOTAL_PAYOUT_MISMATCH',
    ].includes(issue),
  );

  const period = all[0] ?? null;
  return {
    status: hasIncomplete ? 'INCOMPLETE' : hasMismatch ? 'MISMATCH' : 'MATCHED',
    periodStart: periods.size === 1 && period ? period.periodStart : null,
    periodEnd: periods.size === 1 && period ? period.periodEnd : null,
    currency: currencies.size === 1 ? ([...currencies][0] ?? null) : null,
    paymentDetailsDocumentStableIds: input.paymentDetails
      .map((row) => row.documentStableId)
      .sort(),
    payoutSummaryDocumentStableIds: input.payoutSummaries
      .map((row) => row.documentStableId)
      .sort(),
    paymentDetailsReportTotalPayoutCents,
    payoutSummaryReportTotalPayoutCents,
    reportTotalDeltaCents,
    payoutReferenceChecks,
    issues: [...new Set(issues)].sort(),
  };
}
