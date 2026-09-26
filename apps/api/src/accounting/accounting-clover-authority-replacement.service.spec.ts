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

const salesReport = (params: {
  documentStableId: string;
  periodStart: string;
  periodEnd: string;
  amountCollectedCents: number;
  grossSalesCents: number;
  tipsCents: number;
  surchargeCents: number;
  dailyAmountCollected: Array<{ date: string; amountCents: number }>;
}) => ({
  documentStableId: params.documentStableId,
  businessIdentityKey: `clover:sales-report:${params.periodStart}:${params.periodEnd}`,
  revision: 1,
  periodStart: params.periodStart,
  periodEnd: params.periodEnd,
  transactionCount: 1,
  grossSalesCents: params.grossSalesCents,
  refundCents: 0,
  taxesCents: 0,
  tipsCents: params.tipsCents,
  surchargeCents: params.surchargeCents,
  amountCollectedCents: params.amountCollectedCents,
  dailyAmountCollected: params.dailyAmountCollected,
});

const closedPeriod = (params: {
  statement: ReturnType<typeof statement>;
  batches: ReturnType<typeof closeout>[];
  surchargeCents: number | null;
  supplementalSalesReports?: ReturnType<typeof salesReport>[];
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
  supplementalSalesReports: params.supplementalSalesReports ?? [],
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
  it('uses a matching Sales Report for truncated June surcharge and keeps July Statement authority', async () => {
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
          supplementalSalesReports: [
            salesReport({
              documentStableId: 'sales_report_june',
              periodStart: '2026-06-01',
              periodEnd: '2026-06-29',
              amountCollectedCents: 28_000,
              grossSalesCents: 26_700,
              tipsCents: 1_000,
              surchargeCents: 300,
              dailyAmountCollected: [
                { date: '2026-06-01', amountCents: 0 },
                { date: '2026-06-02', amountCents: 28_000 },
                { date: '2026-06-29', amountCents: 0 },
              ],
            }),
          ],
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
        findFirst: jest.fn().mockResolvedValue(null),
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
    const journal = { createJournalEntry: jest.fn() };
    const service = new AccountingCloverAuthorityReplacementService(
      prisma as never,
      period as never,
      preSyncAuthority as never,
      pendingReconciliation as never,
      settlementQuery as never,
      journal as never,
    );

    const report = await service.preview({
      storeStableId: '4750_Yonge_Street',
    });

    expect(report.status).toBe('READY_FOR_HUMAN_REVIEW');
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
        surchargeCents: 300,
        surchargeAuthority: 'EXPLICIT_PROVIDER_EVIDENCE',
        surchargeSource: 'SALES_REPORT',
        surchargeSourceDocumentStableId: 'sales_report_june',
      },
      proposal: {
        status: 'READY',
        blockReasons: [],
        pendingAuthorityDeltaCents: 3_000,
        missingTipRevenueCents: 1_000,
        missingSurchargeRevenueCents: 300,
        storeCashReclassificationCents: 1_700,
      },
    });
    expect(report.periods[1]).toMatchObject({
      providerEvidence: {
        surchargeCents: 550,
        surchargeAuthority: 'EXPLICIT_PROVIDER_EVIDENCE',
        surchargeSource: 'STATEMENT',
        surchargeSourceDocumentStableId: 'statement_july',
      },
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

  it('posts only the authorized READY periods and verifies a fresh ALREADY_POSTED preview', async () => {
    const journal = {
      createJournalEntry: jest
        .fn()
        .mockResolvedValueOnce({ entryStableId: 'journal_june' })
        .mockResolvedValueOnce({ entryStableId: 'journal_july' }),
    };
    const service = new AccountingCloverAuthorityReplacementService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      journal as never,
    );
    const juneJournal = {
      idempotencyKey:
        'clover-pre-sync-authority-adjustment:statement_june:2026-06-02:2026-06-28:v1',
      kind: 'ADJUSTMENT',
      source: 'PLATFORM_STATEMENT',
      sourceFactType: 'accounting.clover_pre_sync_authority_adjustment.v1',
      sourceFactStableId: 'statement_june:2026-06-02:2026-06-28',
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
      occurredAt: '2026-06-29T03:59:59.999Z',
      currency: 'CAD',
      lines: [
        {
          accountStableId: 'account_clover_pending',
          debitCents: 12_863,
          creditCents: 0,
        },
        {
          accountStableId: 'account_store_cash',
          debitCents: 398,
          creditCents: 0,
        },
        {
          accountStableId: 'account_tip_revenue',
          debitCents: 0,
          creditCents: 8_343,
        },
        {
          accountStableId: 'account_card_surcharge_revenue',
          debitCents: 0,
          creditCents: 4_918,
        },
      ],
    };
    const julyJournal = {
      idempotencyKey:
        'clover-pre-sync-authority-adjustment:statement_july:2026-06-30:2026-07-30:v1',
      kind: 'ADJUSTMENT',
      source: 'PLATFORM_STATEMENT',
      sourceFactType: 'accounting.clover_pre_sync_authority_adjustment.v1',
      sourceFactStableId: 'statement_july:2026-06-30:2026-07-30',
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
      occurredAt: '2026-07-31T03:59:59.999Z',
      currency: 'CAD',
      lines: [
        {
          accountStableId: 'account_clover_pending',
          debitCents: 31_325,
          creditCents: 0,
        },
        {
          accountStableId: 'account_store_cash',
          debitCents: 0,
          creditCents: 18_567,
        },
        {
          accountStableId: 'account_tip_revenue',
          debitCents: 0,
          creditCents: 7_207,
        },
        {
          accountStableId: 'account_card_surcharge_revenue',
          debitCents: 0,
          creditCents: 5_551,
        },
      ],
    };
    const readyPreview = {
      status: 'READY_FOR_HUMAN_REVIEW',
      planHash: 'a'.repeat(64),
      globalIssues: [],
      totals: { alreadyPostedPeriods: 0 },
      periods: [
        {
          statementDocumentStableId: 'statement_june',
          proposal: { status: 'READY', draftJournal: juneJournal },
        },
        {
          statementDocumentStableId: 'statement_july',
          proposal: { status: 'READY', draftJournal: julyJournal },
        },
      ],
    };
    const postedPreview = {
      ...readyPreview,
      status: 'ALREADY_POSTED',
      planHash: 'b'.repeat(64),
      totals: { alreadyPostedPeriods: 2 },
      periods: readyPreview.periods.map((period) => ({
        ...period,
        proposal: { status: 'ALREADY_POSTED', draftJournal: null },
      })),
    };
    jest
      .spyOn(service, 'preview')
      .mockResolvedValueOnce(readyPreview as never)
      .mockResolvedValueOnce(postedPreview as never);

    const result = await service.execute({
      storeStableId: '4750_Yonge_Street',
      expectedPlanHash: 'a'.repeat(64),
      operatorActorRef: 'user_admin',
    });

    expect(journal.createJournalEntry).toHaveBeenNthCalledWith(
      1,
      juneJournal,
      'user_admin',
    );
    expect(journal.createJournalEntry).toHaveBeenNthCalledWith(
      2,
      julyJournal,
      'user_admin',
    );
    expect(result.status).toBe('ALREADY_POSTED');
    expect(result.execution).toEqual({
      journalEntriesPostedOrReplayed: 2,
      alreadyPostedPeriods: 2,
    });
  });
});
