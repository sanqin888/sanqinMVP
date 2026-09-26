import {
  projectCloverPreSyncAuthorityCoverage,
  type CloverPreSyncCloseoutBatchEvidenceV1,
  type CloverPreSyncStatementEvidenceV1,
} from './accounting-clover-pre-sync-authority.policy';

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const distribute = (total: number, index: number, count: number) => {
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return base + (index < remainder ? 1 : 0);
};

const closeouts = (params: {
  from: string;
  days: number;
  salesCents: number;
  salesCount: number;
  tipsCents: number;
  tipsCount: number;
  skipDates?: string[];
}): CloverPreSyncCloseoutBatchEvidenceV1[] => {
  const skipped = new Set(params.skipDates ?? []);
  const businessDates = Array.from({ length: params.days }, (_, index) =>
    addDays(params.from, index),
  ).filter((businessDate) => !skipped.has(businessDate));

  return businessDates.map((businessDate, index) => ({
    documentStableId: `acctfindoc_batch_${params.from}_${index}`,
    batchId: `batch_${params.from}_${index}`,
    providerMerchantRef: '29351880018',
    businessDate,
    salesCount: distribute(params.salesCount, index, businessDates.length),
    salesCents: distribute(params.salesCents, index, businessDates.length),
    refundCount: 0,
    refundCents: 0,
    tipsCount: distribute(params.tipsCount, index, businessDates.length),
    tipsCents: distribute(params.tipsCents, index, businessDates.length),
  }));
};

const statement = (
  partial: Partial<CloverPreSyncStatementEvidenceV1>,
): CloverPreSyncStatementEvidenceV1 => ({
  documentStableId: 'acctfindoc_statement',
  businessIdentityKey: 'clover:statement:29351880018:period',
  revision: 1,
  providerMerchantRef: '29351880018',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  principalCents: 336210,
  transactionCount: null,
  refundCount: null,
  refundAmountCents: null,
  explicitSurchargeCents: null,
  activityControlAmountSubmittedCents: null,
  ...partial,
});

describe('Clover pre-sync authority coverage policy', () => {
  it('characterizes June across zero-activity dates with May boundary batches and UNKNOWN surcharge', () => {
    const result = projectCloverPreSyncAuthorityCoverage({
      statement: statement({}),
      closeouts: closeouts({
        from: '2026-05-29',
        days: 31,
        salesCents: 336210,
        salesCount: 180,
        tipsCents: 9896,
        tipsCount: 47,
        skipDates: ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22'],
      }),
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'CLOSED',
        statementPrincipalCents: 336210,
        coveredCloseoutRange: {
          from: '2026-05-29',
          to: '2026-06-28',
          batchCount: 27,
        },
        closeout: {
          salesCount: 180,
          salesCents: 336210,
          refundCount: 0,
          refundCents: 0,
          tipsCount: 47,
          tipsCents: 9896,
        },
        surcharge: { status: 'UNKNOWN', amountCents: null },
        controls: {
          principalDeltaCents: 0,
          transactionCountDelta: null,
          refundCountDelta: null,
          refundAmountDeltaCents: null,
        },
      }),
    );
  });

  it('characterizes July with explicit provider surcharge and count/refund controls', () => {
    const result = projectCloverPreSyncAuthorityCoverage({
      statement: statement({
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
        principalCents: 350132,
        transactionCount: 230,
        refundCount: 0,
        refundAmountCents: 0,
        explicitSurchargeCents: 5551,
        activityControlAmountSubmittedCents: 350132,
      }),
      closeouts: closeouts({
        from: '2026-06-30',
        days: 31,
        salesCents: 350132,
        salesCount: 230,
        tipsCents: 7207,
        tipsCount: 43,
      }),
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'CLOSED',
        coveredCloseoutRange: {
          from: '2026-06-30',
          to: '2026-07-30',
          batchCount: 31,
        },
        closeout: {
          salesCount: 230,
          salesCents: 350132,
          refundCount: 0,
          refundCents: 0,
          tipsCount: 43,
          tipsCents: 7207,
        },
        surcharge: {
          status: 'EXPLICIT_PROVIDER_EVIDENCE',
          amountCents: 5551,
        },
        controls: {
          principalDeltaCents: 0,
          transactionCountDelta: 0,
          refundCountDelta: 0,
          refundAmountDeltaCents: 0,
        },
      }),
    );
  });

  it('does not match Closeouts from a different Clover merchant', () => {
    const batches = closeouts({
      from: '2026-05-29',
      days: 31,
      salesCents: 336210,
      salesCount: 180,
      tipsCents: 9896,
      tipsCount: 47,
    }).map((batch) => ({
      ...batch,
      providerMerchantRef: 'different-mid',
    }));

    const result = projectCloverPreSyncAuthorityCoverage({
      statement: statement({}),
      closeouts: batches,
    });

    expect(result.status).toBe('FAIL_CLOSED');
    expect(result.issues).toContain('CLOSEOUT_COVERAGE_NOT_FOUND');
  });

  it('does not match an equal principal from a non-overlapping provider period', () => {
    const result = projectCloverPreSyncAuthorityCoverage({
      statement: statement({}),
      closeouts: closeouts({
        from: '2026-08-01',
        days: 31,
        salesCents: 336210,
        salesCount: 180,
        tipsCents: 9896,
        tipsCount: 47,
      }),
    });

    expect(result.status).toBe('FAIL_CLOSED');
    expect(result.issues).toContain('CLOSEOUT_COVERAGE_NOT_FOUND');
  });

  it('fails closed when missing provider evidence prevents statement principal closure', () => {
    const batches = closeouts({
      from: '2026-05-29',
      days: 31,
      salesCents: 336210,
      salesCount: 180,
      tipsCents: 9896,
      tipsCount: 47,
    });
    batches.splice(10, 1);

    const result = projectCloverPreSyncAuthorityCoverage({
      statement: statement({}),
      closeouts: batches,
    });

    expect(result.status).toBe('FAIL_CLOSED');
    expect(result.issues).toContain('CLOSEOUT_COVERAGE_NOT_FOUND');
  });

  it('fails closed on a duplicate Batch ID even when principal could match', () => {
    const batches = closeouts({
      from: '2026-05-29',
      days: 31,
      salesCents: 336210,
      salesCount: 180,
      tipsCents: 9896,
      tipsCount: 47,
    });
    batches.push({ ...batches[0], documentStableId: 'acctfindoc_conflict' });

    const result = projectCloverPreSyncAuthorityCoverage({
      statement: statement({}),
      closeouts: batches,
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'FAIL_CLOSED',
        issues: ['BATCH_ID_CONFLICT'],
      }),
    );
  });

  it('fails closed on a verifiable statement transaction-count mismatch', () => {
    const result = projectCloverPreSyncAuthorityCoverage({
      statement: statement({ transactionCount: 179 }),
      closeouts: closeouts({
        from: '2026-05-29',
        days: 31,
        salesCents: 336210,
        salesCount: 180,
        tipsCents: 9896,
        tipsCount: 47,
      }),
    });

    expect(result.status).toBe('FAIL_CLOSED');
    expect(result.issues).toContain('STATEMENT_TRANSACTION_COUNT_MISMATCH');
    expect(result.controls.transactionCountDelta).toBe(1);
  });

  it('never infers surcharge when the statement has no explicit surcharge evidence', () => {
    const result = projectCloverPreSyncAuthorityCoverage({
      statement: statement({ explicitSurchargeCents: null }),
      closeouts: closeouts({
        from: '2026-05-29',
        days: 31,
        salesCents: 336210,
        salesCount: 180,
        tipsCents: 9896,
        tipsCount: 47,
      }),
    });

    expect(result.surcharge).toEqual({
      status: 'UNKNOWN',
      amountCents: null,
    });
  });
});
