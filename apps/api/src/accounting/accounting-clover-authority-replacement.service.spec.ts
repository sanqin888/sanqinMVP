import { AccountingFinancialProvider } from './accounting-contracts';
import { AccountingCloverAuthorityReplacementService } from './accounting-clover-authority-replacement.service';

const closeout = (
  documentStableId: string,
  batchId: string,
  businessDate: string,
  salesCents: number,
  tipsCents: number,
) => ({
  documentStableId,
  batchId,
  providerMerchantRef: 'merchant_1',
  businessDate,
  salesCount: 1,
  salesCents,
  refundCount: 0,
  refundCents: 0,
  tipsCount: tipsCents > 0 ? 1 : 0,
  tipsCents,
});

const statement = (
  documentStableId: string,
  businessIdentityKey: string,
  periodStart: string,
  periodEnd: string,
  principalCents: number,
  explicitSurchargeCents: number | null,
) => ({
  documentStableId,
  businessIdentityKey,
  revision: 1,
  providerMerchantRef: 'merchant_1',
  periodStart,
  periodEnd,
  principalCents,
  transactionCount: null,
  refundCount: 0,
  refundAmountCents: 0,
  explicitSurchargeCents,
  activityControlAmountSubmittedCents: principalCents,
});

const closedPeriod = (params: {
  statement: ReturnType<typeof statement>;
  batches: ReturnType<typeof closeout>[];
  surchargeCents: number | null;
}) => ({
  status: 'CLOSED' as const,
  statement: params.statement,
  coverage: {
    status: 'CLOSED' as const,
    issues: [],
    statementPrincipalCents: params.statement.principalCents,
    coveredCloseoutRange: {
      from: params.batches[0].businessDate,
      to: params.batches[params.batches.length - 1].businessDate,
      batchCount: params.batches.length,
    },
    batches: params.batches.map((batch) => ({
      documentStableId: batch.documentStableId,
      batchId: batch.batchId,
      businessDate: batch.businessDate,
    })),
    closeout: {
      salesCount: params.batches.length,
      salesCents: params.batches.reduce(
        (sum, batch) => sum + batch.salesCents,
        0,
      ),
      refundCount: 0,
      refundCents: 0,
      tipsCount: params.batches.filter((batch) => batch.tipsCents > 0).length,
      tipsCents: params.batches.reduce(
        (sum, batch) => sum + batch.tipsCents,
        0,
      ),
    },
    surcharge:
      params.surchargeCents === null
        ? { status: 'UNKNOWN' as const, amountCents: null }
        : {
            status: 'EXPLICIT_PROVIDER_EVIDENCE' as const,
            amountCents: params.surchargeCents,
          },
    controls: {
      principalDeltaCents: 0,
      transactionCountDelta: null,
      refundCountDelta: 0,
      refundAmountDeltaCents: 0,
    },
  },
  selectedCloseoutBatches: params.batches,
});

const orderRows = (params: {
  pendingMovementCents: number;
  storeCashMovementCents: number;
  occurredAt: string;
}) => [
  {
    entryStableId: `journal_${params.occurredAt}`,
    idempotencyKey: `canonical-sale:${params.occurredAt}:v1`,
    idempotencyHash: 'hash_1',
    sourceFactType: 'order.financial_sale.v1',
    sourceFactStableId: `fact_${params.occurredAt}`,
    version: 1,
    occurredAt: new Date(params.occurredAt),
    lines: [
      {
        debitCents: params.pendingMovementCents,
        creditCents: 0,
        account: { accountStableId: 'account_clover_pending' },
      },
      {
        debitCents: params.storeCashMovementCents,
        creditCents: 0,
        account: { accountStableId: 'account_store_cash' },
      },
    ],
  },
];

describe('AccountingCloverAuthorityReplacementService', () => {
  it('truncates pre-accounting Closeouts, keeps June blocked, and produces a deterministic July draft', async () => {
    const juneBatches = [
      closeout('batch_pre_1', 'PRE1', '2026-05-29', 20_000, 500),
      closeout('batch_pre_2', 'PRE2', '2026-05-31', 10_000, 300),
      closeout('batch_june_1', 'J1', '2026-06-02', 28_000, 1_000),
    ];
    const julyBatches = [
      closeout('batch_july_1', 'JL1', '2026-06-30', 35_000, 700),
    ];
    const preSyncAuthority = {
      readAuthorityPeriods: jest.fn().mockResolvedValue([
        closedPeriod({
          statement: statement(
            'statement_june',
            'clover:statement:2026-06',
            '2026-06-01',
            '2026-06-30',
            58_000,
            null,
          ),
          batches: juneBatches,
          surchargeCents: null,
        }),
        closedPeriod({
          statement: statement(
            'statement_july',
            'clover:statement:2026-07',
            '2026-07-01',
            '2026-07-31',
            35_000,
            550,
          ),
          batches: julyBatches,
          surchargeCents: 550,
        }),
        {
          status: 'FAIL_CLOSED',
          statementDocumentStableId: 'statement_august',
          statementPeriodEnd: '2026-08-31',
          issues: ['CLOSEOUT_COVERAGE_NOT_FOUND'],
        },
      ]),
    };
    const prisma = {
      accountingJournalEntry: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(
            orderRows({
              pendingMovementCents: 25_000,
              storeCashMovementCents: 20_000,
              occurredAt: '2026-06-02T16:00:00.000Z',
            }),
          )
          .mockResolvedValueOnce(
            orderRows({
              pendingMovementCents: 30_000,
              storeCashMovementCents: 10_000,
              occurredAt: '2026-06-30T16:00:00.000Z',
            }),
          ),
      },
    };
    const pendingReconciliation = {
      reconcile: jest
        .fn()
        .mockResolvedValueOnce({
          providers: [
            {
              openingBalanceCents: 0,
              periodNetMovementCents: 5_000,
              closingBalanceCents: 5_000,
            },
          ],
        })
        .mockResolvedValueOnce({
          providers: [
            {
              openingBalanceCents: 5_000,
              periodNetMovementCents: 10_000,
              closingBalanceCents: 15_000,
            },
          ],
        }),
    };
    const settlementQuery = {
      readProviderFinancialCoverage: jest.fn().mockResolvedValue([
        {
          provider: AccountingFinancialProvider.CLOVER,
          financialHistoryRequiredFrom: new Date('2026-06-01T00:00:00.000Z'),
          financialCompleteThrough: new Date('2026-07-31T00:00:00.000Z'),
          providerPaymentFactCutoverAt: null,
        },
      ]),
    };
    const period = {
      getAccountingStartDate: jest.fn().mockResolvedValue('2026-06-01'),
      getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
    };

    const service = new AccountingCloverAuthorityReplacementService(
      prisma as never,
      period as never,
      preSyncAuthority as never,
      pendingReconciliation as never,
      settlementQuery as never,
    );
    const report = await service.preview({
      storeStableId: '4750_Yonge_Street',
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.globalIssues).toEqual([]);
    expect(report.periods).toHaveLength(2);
    expect(report.periods[0]).toMatchObject({
      authorityWindow: {
        from: '2026-06-02',
        to: '2026-06-02',
        truncatedAtAccountingStart: true,
        batchCount: 1,
      },
      providerEvidence: {
        principalCents: 28_000,
        tipsCents: 1_000,
        surchargeCents: null,
      },
      proposal: {
        status: 'BLOCKED',
        blockReasons: ['PROVIDER_SURCHARGE_UNKNOWN'],
        pendingAuthorityDeltaCents: 3_000,
      },
    });
    expect(report.periods[1]).toMatchObject({
      proposal: {
        status: 'READY',
        pendingAuthorityDeltaCents: 5_000,
        missingTipRevenueCents: 700,
        missingSurchargeRevenueCents: 550,
        storeCashReclassificationCents: 3_750,
      },
      pendingRollForward: {
        simulatedOpeningAfterPriorAuthorityAdjustmentsCents: 8_000,
        proposedAuthorityAdjustmentCents: 5_000,
        simulatedProviderAuthorityClosingCents: 23_000,
      },
    });
    expect(report.periods[1].proposal.draftJournal).not.toBeNull();
    expect(report.planHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
