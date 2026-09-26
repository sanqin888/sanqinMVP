export type CloverPreSyncStatementEvidenceV1 = {
  documentStableId: string;
  businessIdentityKey: string;
  revision: number;
  providerMerchantRef: string;
  periodStart: string;
  periodEnd: string;
  principalCents: number;
  transactionCount: number | null;
  refundCount: number | null;
  refundAmountCents: number | null;
  explicitSurchargeCents: number | null;
  activityControlAmountSubmittedCents: number | null;
};

export type CloverPreSyncCloseoutBatchEvidenceV1 = {
  documentStableId: string;
  batchId: string;
  providerMerchantRef: string;
  businessDate: string;
  salesCount: number;
  salesCents: number;
  refundCount: number;
  refundCents: number;
  tipsCount: number;
  tipsCents: number;
};

export type CloverPreSyncSalesReportEvidenceV1 = {
  documentStableId: string;
  businessIdentityKey: string;
  revision: number;
  periodStart: string;
  periodEnd: string;
  transactionCount: number;
  grossSalesCents: number;
  refundCents: number;
  taxesCents: number;
  tipsCents: number;
  surchargeCents: number;
  amountCollectedCents: number;
  dailyAmountCollected: Array<{ date: string; amountCents: number }>;
};

export type CloverSalesReportCloseoutMatchV1 =
  | {
      status: 'MATCHED';
      report: CloverPreSyncSalesReportEvidenceV1;
    }
  | {
      status: 'MISSING' | 'AMBIGUOUS' | 'MISMATCH';
      report: null;
    };

export type CloverPreSyncCoverageIssueV1 =
  | 'BATCH_ID_CONFLICT'
  | 'CLOSEOUT_COVERAGE_NOT_FOUND'
  | 'CLOSEOUT_COVERAGE_AMBIGUOUS'
  | 'CLOSEOUT_DATE_GAP'
  | 'STATEMENT_ACTIVITY_CONTROL_MISMATCH'
  | 'STATEMENT_TRANSACTION_COUNT_MISMATCH'
  | 'STATEMENT_REFUND_COUNT_MISMATCH'
  | 'STATEMENT_REFUND_AMOUNT_MISMATCH';

export type CloverPreSyncAuthorityCoverageV1 = {
  status: 'CLOSED' | 'FAIL_CLOSED';
  issues: CloverPreSyncCoverageIssueV1[];
  statementPrincipalCents: number;
  coveredCloseoutRange: {
    from: string;
    to: string;
    batchCount: number;
  } | null;
  batches: Array<{
    documentStableId: string;
    batchId: string;
    businessDate: string;
  }>;
  closeout: {
    salesCount: number;
    salesCents: number;
    refundCount: number;
    refundCents: number;
    tipsCount: number;
    tipsCents: number;
  } | null;
  surcharge:
    | { status: 'EXPLICIT_PROVIDER_EVIDENCE'; amountCents: number }
    | { status: 'UNKNOWN'; amountCents: null };
  controls: {
    principalDeltaCents: number | null;
    transactionCountDelta: number | null;
    refundCountDelta: number | null;
    refundAmountDeltaCents: number | null;
  };
};

const dateKeyToEpochDay = (value: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed / 86_400_000);
};

const aggregate = (batches: CloverPreSyncCloseoutBatchEvidenceV1[]) =>
  batches.reduce(
    (result, batch) => ({
      salesCount: result.salesCount + batch.salesCount,
      salesCents: result.salesCents + batch.salesCents,
      refundCount: result.refundCount + batch.refundCount,
      refundCents: result.refundCents + batch.refundCents,
      tipsCount: result.tipsCount + batch.tipsCount,
      tipsCents: result.tipsCents + batch.tipsCents,
    }),
    {
      salesCount: 0,
      salesCents: 0,
      refundCount: 0,
      refundCents: 0,
      tipsCount: 0,
      tipsCents: 0,
    },
  );

export function matchCloverSalesReportToCloseouts(params: {
  reports: CloverPreSyncSalesReportEvidenceV1[];
  closeouts: CloverPreSyncCloseoutBatchEvidenceV1[];
}): CloverSalesReportCloseoutMatchV1 {
  if (!params.reports.length) {
    return { status: 'MISSING', report: null };
  }

  const totals = aggregate(params.closeouts);
  const closeoutByDate = new Map(
    params.closeouts.map((batch) => [batch.businessDate, batch] as const),
  );
  const matches = params.reports.filter((report) => {
    if (
      report.transactionCount !== totals.salesCount ||
      report.amountCollectedCents !== totals.salesCents ||
      report.tipsCents !== totals.tipsCents ||
      report.refundCents !== totals.refundCents
    ) {
      return false;
    }

    const dailyByDate = new Map(
      report.dailyAmountCollected.map((item) => [item.date, item.amountCents]),
    );
    if (
      params.closeouts.some(
        (batch) => dailyByDate.get(batch.businessDate) !== batch.salesCents,
      )
    ) {
      return false;
    }

    return report.dailyAmountCollected.every((item) => {
      const closeout = closeoutByDate.get(item.date);
      return closeout ? item.amountCents === closeout.salesCents : item.amountCents === 0;
    });
  });

  if (matches.length === 1) {
    return { status: 'MATCHED', report: matches[0] };
  }
  if (matches.length > 1) {
    return { status: 'AMBIGUOUS', report: null };
  }
  return { status: 'MISMATCH', report: null };
}

const deltasFor = (
  statement: CloverPreSyncStatementEvidenceV1,
  totals: ReturnType<typeof aggregate> | null,
) => ({
  principalDeltaCents: totals
    ? totals.salesCents - statement.principalCents
    : null,
  transactionCountDelta:
    totals && statement.transactionCount != null
      ? totals.salesCount - statement.transactionCount
      : null,
  refundCountDelta:
    totals && statement.refundCount != null
      ? totals.refundCount - statement.refundCount
      : null,
  refundAmountDeltaCents:
    totals && statement.refundAmountCents != null
      ? totals.refundCents - statement.refundAmountCents
      : null,
});

export function projectCloverPreSyncAuthorityCoverage(params: {
  statement: CloverPreSyncStatementEvidenceV1;
  closeouts: CloverPreSyncCloseoutBatchEvidenceV1[];
}): CloverPreSyncAuthorityCoverageV1 {
  const surcharge =
    params.statement.explicitSurchargeCents == null
      ? ({ status: 'UNKNOWN', amountCents: null } as const)
      : ({
          status: 'EXPLICIT_PROVIDER_EVIDENCE',
          amountCents: params.statement.explicitSurchargeCents,
        } as const);
  const candidates = params.closeouts
    .filter(
      (batch) =>
        batch.providerMerchantRef === params.statement.providerMerchantRef,
    )
    .sort(
      (left, right) =>
        left.businessDate.localeCompare(right.businessDate) ||
        left.batchId.localeCompare(right.batchId),
    );

  const byBatchId = new Map<string, CloverPreSyncCloseoutBatchEvidenceV1[]>();
  for (const batch of candidates) {
    byBatchId.set(batch.batchId, [
      ...(byBatchId.get(batch.batchId) ?? []),
      batch,
    ]);
  }
  if ([...byBatchId.values()].some((rows) => rows.length !== 1)) {
    return {
      status: 'FAIL_CLOSED',
      issues: ['BATCH_ID_CONFLICT'],
      statementPrincipalCents: params.statement.principalCents,
      coveredCloseoutRange: null,
      batches: [],
      closeout: null,
      surcharge,
      controls: deltasFor(params.statement, null),
    };
  }

  const statementStartDay = dateKeyToEpochDay(params.statement.periodStart);
  const statementEndDay = dateKeyToEpochDay(params.statement.periodEnd);
  const exactCandidates: CloverPreSyncCloseoutBatchEvidenceV1[][] = [];
  // Provider batches are ordered evidence, not a calendar-day series. A date with
  // no batch can be a legitimate zero-activity day; statement controls below own
  // completeness instead of synthetic daily continuity.
  for (let start = 0; start < candidates.length; start += 1) {
    const selected: CloverPreSyncCloseoutBatchEvidenceV1[] = [];
    let salesCents = 0;
    for (let index = start; index < candidates.length; index += 1) {
      const batch = candidates[index];
      selected.push(batch);
      salesCents += batch.salesCents;
      if (salesCents === params.statement.principalCents) {
        const selectedStartDay = dateKeyToEpochDay(selected[0].businessDate);
        const selectedEndDay = dateKeyToEpochDay(
          selected[selected.length - 1].businessDate,
        );
        const overlapsStatementPeriod =
          statementStartDay != null &&
          statementEndDay != null &&
          selectedStartDay != null &&
          selectedEndDay != null &&
          selectedStartDay <= statementEndDay &&
          selectedEndDay >= statementStartDay;
        if (overlapsStatementPeriod) exactCandidates.push([...selected]);
      }
      if (
        params.statement.principalCents >= 0 &&
        salesCents > params.statement.principalCents
      ) {
        break;
      }
    }
  }

  if (exactCandidates.length === 0) {
    return {
      status: 'FAIL_CLOSED',
      issues: ['CLOSEOUT_COVERAGE_NOT_FOUND'],
      statementPrincipalCents: params.statement.principalCents,
      coveredCloseoutRange: null,
      batches: [],
      closeout: null,
      surcharge,
      controls: deltasFor(params.statement, null),
    };
  }

  let selected = exactCandidates[0];
  if (exactCandidates.length > 1) {
    const controlCompatible = exactCandidates.filter((candidate) => {
      const totals = aggregate(candidate);
      return (
        (params.statement.transactionCount == null ||
          totals.salesCount === params.statement.transactionCount) &&
        (params.statement.refundCount == null ||
          totals.refundCount === params.statement.refundCount) &&
        (params.statement.refundAmountCents == null ||
          totals.refundCents === params.statement.refundAmountCents)
      );
    });
    if (controlCompatible.length !== 1) {
      return {
        status: 'FAIL_CLOSED',
        issues: ['CLOSEOUT_COVERAGE_AMBIGUOUS'],
        statementPrincipalCents: params.statement.principalCents,
        coveredCloseoutRange: null,
        batches: [],
        closeout: null,
        surcharge,
        controls: deltasFor(params.statement, null),
      };
    }
    selected = controlCompatible[0];
  }
  const totals = aggregate(selected);
  const issues: CloverPreSyncCoverageIssueV1[] = [];
  if (
    params.statement.activityControlAmountSubmittedCents != null &&
    params.statement.activityControlAmountSubmittedCents !==
      params.statement.principalCents
  ) {
    issues.push('STATEMENT_ACTIVITY_CONTROL_MISMATCH');
  }
  if (
    params.statement.transactionCount != null &&
    totals.salesCount !== params.statement.transactionCount
  ) {
    issues.push('STATEMENT_TRANSACTION_COUNT_MISMATCH');
  }
  if (
    params.statement.refundCount != null &&
    totals.refundCount !== params.statement.refundCount
  ) {
    issues.push('STATEMENT_REFUND_COUNT_MISMATCH');
  }
  if (
    params.statement.refundAmountCents != null &&
    totals.refundCents !== params.statement.refundAmountCents
  ) {
    issues.push('STATEMENT_REFUND_AMOUNT_MISMATCH');
  }

  return {
    status: issues.length === 0 ? 'CLOSED' : 'FAIL_CLOSED',
    issues,
    statementPrincipalCents: params.statement.principalCents,
    coveredCloseoutRange: {
      from: selected[0].businessDate,
      to: selected[selected.length - 1].businessDate,
      batchCount: selected.length,
    },
    batches: selected.map((batch) => ({
      documentStableId: batch.documentStableId,
      batchId: batch.batchId,
      businessDate: batch.businessDate,
    })),
    closeout: totals,
    surcharge,
    controls: deltasFor(params.statement, totals),
  };
}
