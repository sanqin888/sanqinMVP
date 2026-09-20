import {
  AccountingAccountClass,
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
} from '@prisma/client';
import { AccountingProviderSettlementPreviewService } from './accounting-provider-settlement-preview.service';
import {
  FANTUAN_ADJUSTMENT_DETAIL_EVIDENCE_KIND,
  FANTUAN_ADJUSTMENT_RAW_CODES,
} from './accounting-fantuan-adjustment-detail.contract';

const confirmedReview = (
  documentStableId: string,
  inboxItemStableId: string,
) => ({
  artifact: {
    inboxItem: {
      inboxItemStableId,
      status: AccountingInboxStatus.CONFIRMED,
      materializedEntityType:
        AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT,
      materializedEntityStableId: documentStableId,
      reviewedAt: new Date('2026-09-15T12:00:00.000Z'),
      reviewedByUserStableId: 'user_admin_1',
      version: 2,
    },
  },
});

const pendingReview = (
  documentStableId: string,
  inboxItemStableId: string,
) => ({
  artifact: {
    inboxItem: {
      inboxItemStableId,
      status: AccountingInboxStatus.PENDING_REVIEW,
      materializedEntityType:
        AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT,
      materializedEntityStableId: documentStableId,
      reviewedAt: null,
      reviewedByUserStableId: null,
      version: 1,
    },
  },
});

const uberCoverage = () => ({
  coverageStableId: 'coverage_uber_1',
  provider: AccountingFinancialProvider.UBER_EATS,
  storeStableId: '4750_Yonge_Street',
  financialHistoryRequiredFrom: new Date('2026-06-01T00:00:00.000Z'),
  financialCompleteThrough: null,
  liveOrderFactCutoverAt: null,
  orderDetailCoverageFrom: null,
  updatedAt: new Date('2026-09-15T12:00:00.000Z'),
});

const accountFact = (
  accountStableId: string,
  accountClass: AccountingAccountClass,
  overrides?: Partial<{ currency: string; isActive: boolean }>,
) => ({
  accountStableId,
  accountClass,
  currency: overrides?.currency ?? 'CAD',
  isActive: overrides?.isActive ?? true,
});

const uberStatement = (params: {
  documentStableId: string;
  businessIdentityKey: string;
  revision: number;
  periodStart: string;
  periodEnd: string;
  reviewStatus: 'CONFIRMED' | 'PENDING_REVIEW';
  component?: AccountingFinancialComponent;
  amountCents?: number;
}) => ({
  documentStableId: params.documentStableId,
  provider: AccountingFinancialProvider.UBER_EATS,
  documentType: AccountingFinancialDocumentType.STATEMENT,
  businessIdentityKey: params.businessIdentityKey,
  revision: params.revision,
  supersedesDocumentId: null,
  storeStableId: '4750_Yonge_Street',
  providerDocumentRef: params.documentStableId,
  periodStart: new Date(`${params.periodStart}T00:00:00.000Z`),
  periodEnd: new Date(`${params.periodEnd}T00:00:00.000Z`),
  settledAt: null,
  payoutAt: null,
  currency: 'CAD',
  rawMetadata: null,
  ...(params.reviewStatus === 'CONFIRMED'
    ? confirmedReview(
        params.documentStableId,
        `inbox_${params.documentStableId}`,
      )
    : pendingReview(
        params.documentStableId,
        `inbox_${params.documentStableId}`,
      )),
  lines: [
    {
      lineStableId: `line_${params.documentStableId}`,
      lineNo: 1,
      rawCode: null,
      rawName:
        (params.component ?? AccountingFinancialComponent.SALES) ===
        AccountingFinancialComponent.TIP
          ? 'Tips'
          : 'Sales',
      component: params.component ?? AccountingFinancialComponent.SALES,
      postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
      taxRole: AccountingFinancialTaxRole.NONE,
      amountCents: params.amountCents ?? 1000,
      occurredAt: null,
    },
    {
      lineStableId: `line_${params.documentStableId}_total_earnings`,
      lineNo: 2,
      rawCode: null,
      rawName: 'Total Earnings',
      component: AccountingFinancialComponent.CONTROL_TOTAL,
      postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      taxRole: AccountingFinancialTaxRole.NONE,
      amountCents: params.amountCents ?? 1000,
      occurredAt: null,
    },
    {
      lineStableId: `line_${params.documentStableId}_total_fees`,
      lineNo: 3,
      rawCode: null,
      rawName: 'Total Uber Fees',
      component: AccountingFinancialComponent.CONTROL_TOTAL,
      postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      taxRole: AccountingFinancialTaxRole.NONE,
      amountCents: 0,
      occurredAt: null,
    },
    {
      lineStableId: `line_${params.documentStableId}_total_marketing`,
      lineNo: 4,
      rawCode: null,
      rawName: 'Total Marketing Spends',
      component: AccountingFinancialComponent.CONTROL_TOTAL,
      postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      taxRole: AccountingFinancialTaxRole.NONE,
      amountCents: 0,
      occurredAt: null,
    },
    {
      lineStableId: `line_${params.documentStableId}_total_amendments`,
      lineNo: 5,
      rawCode: null,
      rawName: 'Total Amendments',
      component: AccountingFinancialComponent.CONTROL_TOTAL,
      postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      taxRole: AccountingFinancialTaxRole.NONE,
      amountCents: 0,
      occurredAt: null,
    },
    {
      lineStableId: `line_${params.documentStableId}_net_total`,
      lineNo: 6,
      rawCode: null,
      rawName: 'Net Total',
      component: AccountingFinancialComponent.CONTROL_TOTAL,
      postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      taxRole: AccountingFinancialTaxRole.NONE,
      amountCents: params.amountCents ?? 1000,
      occurredAt: null,
    },
  ],
});

describe('AccountingProviderSettlementPreviewService', () => {
  const storeConfig = {
    getStoreSnapshot: jest.fn().mockResolvedValue({
      storeStableId: '4750_Yonge_Street',
      timezone: 'America/Toronto',
    }),
  };
  const accounting = {
    getAccountingStartDate: jest.fn().mockResolvedValue('2026-06-01'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves a Fantuan summary Adjustment only from one confirmed same-period detail whose net matches', async () => {
    const statementStableId = 'fantuan_statement_aug';
    const detailStableId = 'fantuan_adjustment_detail_aug';
    const operations = {
      readProviderSettlementDocuments: jest.fn().mockResolvedValue([
        {
          documentStableId: statementStableId,
          provider: AccountingFinancialProvider.FANTUAN,
          documentType: AccountingFinancialDocumentType.STATEMENT,
          businessIdentityKey: 'fantuan:statement:2026-08-01:2026-08-31',
          revision: 1,
          supersedesDocumentId: null,
          storeStableId: '4750_Yonge_Street',
          providerDocumentRef: '2026-08-01:2026-08-31',
          periodStart: new Date('2026-08-01T00:00:00.000Z'),
          periodEnd: new Date('2026-08-31T00:00:00.000Z'),
          settledAt: null,
          payoutAt: null,
          currency: 'CAD',
          rawMetadata: { evidenceKind: 'FANTUAN_SETTLEMENT_SUMMARY' },
          ...confirmedReview(statementStableId, 'inbox_fantuan_statement_aug'),
          lines: [
            {
              lineStableId: 'line-summary-adjustment',
              lineNo: 1,
              rawCode: null,
              rawName: 'Adjustment',
              component: AccountingFinancialComponent.ADJUSTMENT,
              postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
              taxRole: AccountingFinancialTaxRole.NONE,
              amountCents: 2694,
              occurredAt: null,
            },
          ],
        },
        {
          documentStableId: detailStableId,
          provider: AccountingFinancialProvider.FANTUAN,
          documentType: AccountingFinancialDocumentType.OTHER,
          businessIdentityKey:
            'fantuan:adjustment-detail:2026-08-01:2026-08-31',
          revision: 1,
          supersedesDocumentId: null,
          storeStableId: '4750_Yonge_Street',
          providerDocumentRef: 'adjustment-detail:2026-08-01:2026-08-31',
          periodStart: new Date('2026-08-01T00:00:00.000Z'),
          periodEnd: new Date('2026-08-31T00:00:00.000Z'),
          settledAt: null,
          payoutAt: null,
          currency: 'CAD',
          rawMetadata: {
            evidenceKind: FANTUAN_ADJUSTMENT_DETAIL_EVIDENCE_KIND,
            adjustmentNetCents: 2694,
          },
          ...confirmedReview(detailStableId, 'inbox_fantuan_detail_aug'),
          lines: [
            {
              lineStableId: 'line-compensation',
              lineNo: 1,
              rawCode: FANTUAN_ADJUSTMENT_RAW_CODES.COMPENSATION,
              rawName: 'Compensation',
              component: AccountingFinancialComponent.ADJUSTMENT,
              postingTreatment:
                AccountingFinancialPostingTreatment.CONTROL_TOTAL,
              taxRole: AccountingFinancialTaxRole.NONE,
              amountCents: 3354,
              occurredAt: null,
            },
            {
              lineStableId: 'line-deduction',
              lineNo: 2,
              rawCode: FANTUAN_ADJUSTMENT_RAW_CODES.DEDUCTION,
              rawName: 'Deduction',
              component: AccountingFinancialComponent.ADJUSTMENT,
              postingTreatment:
                AccountingFinancialPostingTreatment.CONTROL_TOTAL,
              taxRole: AccountingFinancialTaxRole.NONE,
              amountCents: -660,
              occurredAt: null,
            },
          ],
        },
      ]),
      readProviderFinancialCoverage: jest.fn().mockResolvedValue([
        {
          coverageStableId: 'coverage_fantuan_1',
          provider: AccountingFinancialProvider.FANTUAN,
          storeStableId: '4750_Yonge_Street',
          financialHistoryRequiredFrom: new Date('2026-06-01T00:00:00.000Z'),
          financialCompleteThrough: null,
          liveOrderFactCutoverAt: null,
          orderDetailCoverageFrom: null,
          updatedAt: new Date('2026-09-19T12:00:00.000Z'),
        },
      ]),
      readAccountingAccountFacts: jest
        .fn()
        .mockResolvedValue([
          accountFact('account_fantuan_pending', AccountingAccountClass.ASSET),
          accountFact(
            'account_other_operating_revenue',
            AccountingAccountClass.REVENUE,
          ),
          accountFact(
            'account_chargeback_adjustment_expense',
            AccountingAccountClass.EXPENSE,
          ),
        ]),
      readSettlementShadowExistingJournals: jest.fn().mockResolvedValue([]),
      readOrderSaleJournalsByFactStableIds: jest.fn().mockResolvedValue([]),
    };
    const orderFinancialFacts = {
      readFactsForRange: jest.fn().mockResolvedValue([]),
    };
    const service = new AccountingProviderSettlementPreviewService(
      operations as never,
      operations as never,
      accounting as never,
      storeConfig as never,
      orderFinancialFacts as never,
    );

    const result = await service.previewRange({
      fromDate: '2026-08-01',
      toDateExclusive: '2026-09-01',
      storeStableId: '4750_Yonge_Street',
      provider: AccountingFinancialProvider.FANTUAN,
    });

    const statement = result.providerDocuments.find(
      (document) => document.documentStableId === statementStableId,
    );
    const detail = result.providerDocuments.find(
      (document) => document.documentStableId === detailStableId,
    );
    expect(statement).toEqual(
      expect.objectContaining({
        status: 'READY',
        blockReasons: [],
        supplementaryEvidenceDocuments: [
          expect.objectContaining({
            documentStableId: detailStableId,
            revision: 1,
          }),
        ],
        debitCents: 3354,
        creditCents: 3354,
      }),
    );
    expect(statement?.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rawName: 'Adjustment',
          disposition: 'CONTROL_TOTAL',
        }),
        expect.objectContaining({
          rawCode: FANTUAN_ADJUSTMENT_RAW_CODES.COMPENSATION,
          disposition: 'POSTABLE',
          targetAccountStableId: 'account_other_operating_revenue',
        }),
        expect.objectContaining({
          rawCode: FANTUAN_ADJUSTMENT_RAW_CODES.DEDUCTION,
          disposition: 'POSTABLE',
          targetAccountStableId: 'account_chargeback_adjustment_expense',
        }),
      ]),
    );
    expect(detail?.status).toBe('NOOP');
    expect(result.amounts.readyProviderDebitCents).toBe(3354);
    expect(result.amounts.readyProviderCreditCents).toBe(3354);
    expect(orderFinancialFacts.readFactsForRange).not.toHaveBeenCalled();
  });

  it('keeps Fantuan Adjustment blocked when same-period detail evidence is absent', async () => {
    const statementStableId = 'fantuan_statement_aug_missing_detail';
    const operations = {
      readProviderSettlementDocuments: jest.fn().mockResolvedValue([
        {
          documentStableId: statementStableId,
          provider: AccountingFinancialProvider.FANTUAN,
          documentType: AccountingFinancialDocumentType.STATEMENT,
          businessIdentityKey: 'fantuan:statement:2026-08-01:2026-08-31',
          revision: 1,
          supersedesDocumentId: null,
          storeStableId: '4750_Yonge_Street',
          providerDocumentRef: '2026-08-01:2026-08-31',
          periodStart: new Date('2026-08-01T00:00:00.000Z'),
          periodEnd: new Date('2026-08-31T00:00:00.000Z'),
          settledAt: null,
          payoutAt: null,
          currency: 'CAD',
          rawMetadata: null,
          ...confirmedReview(statementStableId, 'inbox_fantuan_missing_detail'),
          lines: [
            {
              lineStableId: 'line-summary-adjustment',
              lineNo: 1,
              rawCode: null,
              rawName: 'Adjustment',
              component: AccountingFinancialComponent.ADJUSTMENT,
              postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
              taxRole: AccountingFinancialTaxRole.NONE,
              amountCents: 2694,
              occurredAt: null,
            },
          ],
        },
      ]),
      readProviderFinancialCoverage: jest.fn().mockResolvedValue([
        {
          coverageStableId: 'coverage_fantuan_1',
          provider: AccountingFinancialProvider.FANTUAN,
          storeStableId: '4750_Yonge_Street',
          financialHistoryRequiredFrom: new Date('2026-06-01T00:00:00.000Z'),
          financialCompleteThrough: null,
          liveOrderFactCutoverAt: null,
          orderDetailCoverageFrom: null,
          updatedAt: new Date('2026-09-19T12:00:00.000Z'),
        },
      ]),
      readAccountingAccountFacts: jest.fn().mockResolvedValue([]),
      readSettlementShadowExistingJournals: jest.fn().mockResolvedValue([]),
      readOrderSaleJournalsByFactStableIds: jest.fn().mockResolvedValue([]),
    };
    const service = new AccountingProviderSettlementPreviewService(
      operations as never,
      operations as never,
      accounting as never,
      storeConfig as never,
      { readFactsForRange: jest.fn().mockResolvedValue([]) } as never,
    );

    const result = await service.previewRange({
      fromDate: '2026-08-01',
      toDateExclusive: '2026-09-01',
      storeStableId: '4750_Yonge_Street',
      provider: AccountingFinancialProvider.FANTUAN,
    });

    expect(result.providerDocuments[0]).toEqual(
      expect.objectContaining({
        status: 'BLOCKED',
        blockReasons: ['FANTUAN_ADJUSTMENT_DETAIL_REQUIRED'],
        draftJournal: null,
      }),
    );
  });

  it('blocks pre-live Uber Order reversals until a READY authoritative statement covers the same date', async () => {
    const operations = {
      readProviderSettlementDocuments: jest.fn().mockResolvedValue([]),
      readProviderFinancialCoverage: jest
        .fn()
        .mockResolvedValue([uberCoverage()]),
      readAccountingAccountFacts: jest
        .fn()
        .mockResolvedValue([
          accountFact('account_uber_pending', AccountingAccountClass.ASSET),
          accountFact('account_sales_revenue', AccountingAccountClass.REVENUE),
          accountFact('account_hst_payable', AccountingAccountClass.LIABILITY),
        ]),
      readSettlementShadowExistingJournals: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
      readOrderSaleJournalsByFactStableIds: jest.fn().mockResolvedValue([
        {
          entryStableId: 'journal_uber_manual_1',
          idempotencyKey: 'canonical-sale:order-uber-1:v1',
          idempotencyHash: 'a'.repeat(64),
          version: 1,
          sourceFactStableId: 'order-uber-1',
          storeStableId: '4750_Yonge_Street',
          occurredAt: new Date('2026-06-10T16:00:00.000Z'),
          currency: 'CAD',
          lines: [
            {
              debitCents: 1130,
              creditCents: 0,
              memo: null,
              account: { accountStableId: 'account_uber_pending' },
              category: null,
            },
            {
              debitCents: 0,
              creditCents: 1000,
              memo: null,
              account: { accountStableId: 'account_sales_revenue' },
              category: null,
            },
            {
              debitCents: 0,
              creditCents: 130,
              memo: null,
              account: { accountStableId: 'account_hst_payable' },
              category: null,
            },
          ],
        },
      ]),
    };
    const orderFinancialFacts = {
      readFactsForRange: jest.fn().mockResolvedValue([
        {
          version: 1,
          factStableId: 'order-uber-1',
          orderStableId: 'order-uber-1',
          storeStableId: '4750_Yonge_Street',
          occurredAt: new Date('2026-06-10T16:00:00.000Z'),
          sourceUpdatedAt: new Date('2026-06-10T16:00:01.000Z'),
          sourceEvidence: 'LEGACY_CURRENT_ORDER',
          channel: 'ubereats',
          paymentMethod: 'UBEREATS',
          itemQuantity: 1,
          currency: 'CAD',
          pricingEvidence: 'COMPLETE',
          nominalSubtotalCents: 1000,
          effectiveSubtotalCents: 1000,
          discounts: {
            dailySpecialCents: 0,
            couponCents: 0,
            automaticPromotionCents: 0,
            posManualCents: 0,
            pointsRedemptionCents: 0,
            unattributedLegacyCents: 0,
            totalCents: 0,
          },
          subtotalAfterDiscountCents: 1000,
          taxCents: 130,
          deliveryRevenueCents: 0,
          cardSurchargeCents: 0,
          orderTotalCents: 1130,
          paymentTotalCents: 1130,
        },
      ]),
    };

    const service = new AccountingProviderSettlementPreviewService(
      operations as never,
      operations as never,
      accounting as never,
      storeConfig as never,
      orderFinancialFacts as never,
    );
    const result = await service.previewRange({
      fromDate: '2026-06-01',
      toDateExclusive: '2026-07-01',
      storeStableId: '4750_Yonge_Street',
      provider: AccountingFinancialProvider.UBER_EATS,
    });

    expect(result.policy.preLiveUberOrderAuthority).toBe('STATEMENT_ONLY');
    expect(result.counts).toEqual(
      expect.objectContaining({
        preCutoverUberOrderFacts: 1,
        preCutoverUberSaleJournals: 1,
        readyUberOrderReversals: 0,
        blockedUberOrderReversals: 1,
      }),
    );
    expect(result.amounts.readyUberReversalDebitCents).toBe(0);
    expect(result.amounts.readyUberReversalCreditCents).toBe(0);
    expect(result.uberPreCutoverOrderReversals[0]).toEqual(
      expect.objectContaining({
        originalJournalEntryStableId: 'journal_uber_manual_1',
        originalJournalAnchor: {
          idempotencyKey: 'canonical-sale:order-uber-1:v1',
          idempotencyHash: 'a'.repeat(64),
          version: 1,
          sourceFactStableId: 'order-uber-1',
        },
        orderStableId: 'order-uber-1',
        status: 'BLOCKED',
        blockReasons: ['NO_READY_AUTHORITATIVE_STATEMENT_COVERAGE'],
        coveredByDocumentStableId: null,
      }),
    );
  });

  it('blocks a statement tip draft until the dedicated tip revenue account is provisioned', async () => {
    const operations = {
      readProviderSettlementDocuments: jest.fn().mockResolvedValue([
        uberStatement({
          documentStableId: 'provider_doc_tip_1',
          businessIdentityKey: 'uber:statement:aug-2026',
          revision: 1,
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          reviewStatus: 'CONFIRMED',
          component: AccountingFinancialComponent.TIP,
          amountCents: 500,
        }),
      ]),
      readProviderFinancialCoverage: jest
        .fn()
        .mockResolvedValue([uberCoverage()]),
      readAccountingAccountFacts: jest
        .fn()
        .mockResolvedValue([
          accountFact('account_uber_pending', AccountingAccountClass.ASSET),
        ]),
      readSettlementShadowExistingJournals: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
      readOrderSaleJournalsByFactStableIds: jest.fn().mockResolvedValue([]),
    };
    const orderFinancialFacts = {
      readFactsForRange: jest.fn().mockResolvedValue([]),
    };
    const service = new AccountingProviderSettlementPreviewService(
      operations as never,
      operations as never,
      accounting as never,
      storeConfig as never,
      orderFinancialFacts as never,
    );

    const result = await service.previewRange({
      fromDate: '2026-08-01',
      toDateExclusive: '2026-09-01',
      storeStableId: '4750_Yonge_Street',
      provider: AccountingFinancialProvider.UBER_EATS,
    });

    expect(result.providerDocuments[0]).toEqual(
      expect.objectContaining({
        status: 'BLOCKED',
        missingRequiredAccounts: ['account_tip_revenue'],
      }),
    );
    expect(result.providerDocuments[0].blockReasons).toContain(
      'ACCOUNT_NOT_PROVISIONED:account_tip_revenue',
    );
  });

  it('uses the global latest revision and blocks it when human review is still pending', async () => {
    const operations = {
      readProviderSettlementDocuments: jest.fn().mockResolvedValue([
        uberStatement({
          documentStableId: 'provider_doc_aug_r1',
          businessIdentityKey: 'uber:statement:aug-2026',
          revision: 1,
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          reviewStatus: 'CONFIRMED',
        }),
        uberStatement({
          documentStableId: 'provider_doc_aug_r2',
          businessIdentityKey: 'uber:statement:aug-2026',
          revision: 2,
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          reviewStatus: 'PENDING_REVIEW',
        }),
      ]),
      readProviderFinancialCoverage: jest
        .fn()
        .mockResolvedValue([uberCoverage()]),
      readAccountingAccountFacts: jest
        .fn()
        .mockResolvedValue([
          accountFact('account_uber_pending', AccountingAccountClass.ASSET),
          accountFact('account_sales_revenue', AccountingAccountClass.REVENUE),
        ]),
      readSettlementShadowExistingJournals: jest.fn().mockResolvedValue([]),
      readOrderSaleJournalsByFactStableIds: jest.fn().mockResolvedValue([]),
    };
    const orderFinancialFacts = {
      readFactsForRange: jest.fn().mockResolvedValue([]),
    };
    const service = new AccountingProviderSettlementPreviewService(
      operations as never,
      operations as never,
      accounting as never,
      storeConfig as never,
      orderFinancialFacts as never,
    );

    const result = await service.previewRange({
      fromDate: '2026-08-01',
      toDateExclusive: '2026-09-01',
      storeStableId: '4750_Yonge_Street',
      provider: AccountingFinancialProvider.UBER_EATS,
    });

    expect(result.version).toBe(3);
    expect(result.providerDocuments).toHaveLength(1);
    expect(result.providerDocuments[0]).toEqual(
      expect.objectContaining({
        documentStableId: 'provider_doc_aug_r2',
        revision: 2,
        status: 'BLOCKED',
      }),
    );
    expect(result.providerDocuments[0].reviewEvidence?.status).toBe(
      AccountingInboxStatus.PENDING_REVIEW,
    );
    expect(result.providerDocuments[0].reviewEvidence?.version).toBe(1);
    expect(result.providerDocuments[0].blockReasons).toContain(
      'PROVIDER_DOCUMENT_NOT_CONFIRMED',
    );
  });

  it('does not fall back to an older in-range revision when the global latest revision moved outside the requested range', async () => {
    const operations = {
      readProviderSettlementDocuments: jest.fn().mockResolvedValue([
        uberStatement({
          documentStableId: 'provider_doc_period_r1',
          businessIdentityKey: 'uber:statement:period-correction',
          revision: 1,
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          reviewStatus: 'CONFIRMED',
        }),
        uberStatement({
          documentStableId: 'provider_doc_period_r2',
          businessIdentityKey: 'uber:statement:period-correction',
          revision: 2,
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
          reviewStatus: 'CONFIRMED',
        }),
      ]),
      readProviderFinancialCoverage: jest
        .fn()
        .mockResolvedValue([uberCoverage()]),
      readAccountingAccountFacts: jest
        .fn()
        .mockResolvedValue([
          accountFact('account_uber_pending', AccountingAccountClass.ASSET),
          accountFact('account_sales_revenue', AccountingAccountClass.REVENUE),
        ]),
      readSettlementShadowExistingJournals: jest.fn().mockResolvedValue([]),
      readOrderSaleJournalsByFactStableIds: jest.fn().mockResolvedValue([]),
    };
    const orderFinancialFacts = {
      readFactsForRange: jest.fn().mockResolvedValue([]),
    };
    const service = new AccountingProviderSettlementPreviewService(
      operations as never,
      operations as never,
      accounting as never,
      storeConfig as never,
      orderFinancialFacts as never,
    );

    const result = await service.previewRange({
      fromDate: '2026-08-01',
      toDateExclusive: '2026-09-01',
      storeStableId: '4750_Yonge_Street',
      provider: AccountingFinancialProvider.UBER_EATS,
    });

    expect(result.providerDocuments).toHaveLength(1);
    expect(result.providerDocuments[0]).toEqual(
      expect.objectContaining({
        documentStableId: 'provider_doc_period_r2',
        revision: 2,
        latestRevisionInRequestedRange: false,
        status: 'BLOCKED',
      }),
    );
    expect(result.providerDocuments[0].blockReasons).toContain(
      'LATEST_REVISION_OUTSIDE_REQUESTED_RANGE',
    );
  });

  it('surfaces Uber control-total mismatches and withholds the draft Journal', async () => {
    const statement = uberStatement({
      documentStableId: 'provider_doc_control_mismatch',
      businessIdentityKey: 'uber:statement:control-mismatch',
      revision: 1,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      reviewStatus: 'CONFIRMED',
      amountCents: 1000,
    });
    const totalEarnings = statement.lines.find(
      (line) => line.rawName === 'Total Earnings',
    );
    if (!totalEarnings) {
      throw new Error('test fixture is missing Total Earnings');
    }
    totalEarnings.amountCents = 900;

    const operations = {
      readProviderSettlementDocuments: jest.fn().mockResolvedValue([statement]),
      readProviderFinancialCoverage: jest
        .fn()
        .mockResolvedValue([uberCoverage()]),
      readAccountingAccountFacts: jest
        .fn()
        .mockResolvedValue([
          accountFact('account_uber_pending', AccountingAccountClass.ASSET),
          accountFact('account_sales_revenue', AccountingAccountClass.REVENUE),
        ]),
      readSettlementShadowExistingJournals: jest.fn().mockResolvedValue([]),
      readOrderSaleJournalsByFactStableIds: jest.fn().mockResolvedValue([]),
    };
    const orderFinancialFacts = {
      readFactsForRange: jest.fn().mockResolvedValue([]),
    };
    const service = new AccountingProviderSettlementPreviewService(
      operations as never,
      operations as never,
      accounting as never,
      storeConfig as never,
      orderFinancialFacts as never,
    );

    const result = await service.previewRange({
      fromDate: '2026-08-01',
      toDateExclusive: '2026-09-01',
      storeStableId: '4750_Yonge_Street',
      provider: AccountingFinancialProvider.UBER_EATS,
    });

    const plan = result.providerDocuments[0];
    expect(plan).toEqual(
      expect.objectContaining({
        status: 'BLOCKED',
        draftJournal: null,
        debitCents: 0,
        creditCents: 0,
      }),
    );
    expect(plan.blockReasons).toContain('PROVIDER_CONTROL_TOTAL_MISMATCH');
    expect(plan.controlTotalChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'UBER_TOTAL_EARNINGS',
          status: 'MISMATCH',
          expectedCents: 900,
          calculatedCents: 1000,
          deltaCents: 100,
        }),
      ]),
    );
  });

  it('requires explicit provider coverage and exact class/currency/active account prerequisites', async () => {
    const operations = {
      readProviderSettlementDocuments: jest.fn().mockResolvedValue([
        uberStatement({
          documentStableId: 'provider_doc_tip_invalid_account',
          businessIdentityKey: 'uber:statement:tip-invalid-account',
          revision: 1,
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          reviewStatus: 'CONFIRMED',
          component: AccountingFinancialComponent.TIP,
          amountCents: 500,
        }),
      ]),
      readProviderFinancialCoverage: jest.fn().mockResolvedValue([]),
      readAccountingAccountFacts: jest.fn().mockResolvedValue([
        accountFact('account_uber_pending', AccountingAccountClass.ASSET),
        accountFact('account_tip_revenue', AccountingAccountClass.LIABILITY, {
          currency: 'USD',
          isActive: false,
        }),
      ]),
      readSettlementShadowExistingJournals: jest.fn().mockResolvedValue([]),
      readOrderSaleJournalsByFactStableIds: jest.fn().mockResolvedValue([]),
    };
    const orderFinancialFacts = {
      readFactsForRange: jest.fn().mockResolvedValue([]),
    };
    const service = new AccountingProviderSettlementPreviewService(
      operations as never,
      operations as never,
      accounting as never,
      storeConfig as never,
      orderFinancialFacts as never,
    );

    const result = await service.previewRange({
      fromDate: '2026-08-01',
      toDateExclusive: '2026-09-01',
      storeStableId: '4750_Yonge_Street',
      provider: AccountingFinancialProvider.UBER_EATS,
    });

    const plan = result.providerDocuments[0];
    expect(plan).toEqual(
      expect.objectContaining({
        status: 'BLOCKED',
        coverageEvidence: null,
        invalidRequiredAccounts: ['account_tip_revenue'],
      }),
    );
    expect(plan.blockReasons).toEqual(
      expect.arrayContaining([
        'PROVIDER_FINANCIAL_COVERAGE_NOT_PROVISIONED',
        'ACCOUNT_CLASS_MISMATCH:account_tip_revenue',
        'ACCOUNT_CURRENCY_MISMATCH:account_tip_revenue',
        'ACCOUNT_ACTIVE_STATE_MISMATCH:account_tip_revenue',
      ]),
    );
  });

  it('blocks a historical Uber reversal when more than one READY authoritative statement covers the same Store-local date', async () => {
    const operations = {
      readProviderSettlementDocuments: jest.fn().mockResolvedValue([
        uberStatement({
          documentStableId: 'provider_doc_cover_a',
          businessIdentityKey: 'uber:statement:cover-a',
          revision: 1,
          periodStart: '2026-06-01',
          periodEnd: '2026-06-30',
          reviewStatus: 'CONFIRMED',
        }),
        uberStatement({
          documentStableId: 'provider_doc_cover_b',
          businessIdentityKey: 'uber:statement:cover-b',
          revision: 1,
          periodStart: '2026-06-01',
          periodEnd: '2026-06-30',
          reviewStatus: 'CONFIRMED',
        }),
      ]),
      readProviderFinancialCoverage: jest
        .fn()
        .mockResolvedValue([uberCoverage()]),
      readAccountingAccountFacts: jest
        .fn()
        .mockResolvedValue([
          accountFact('account_uber_pending', AccountingAccountClass.ASSET),
          accountFact('account_sales_revenue', AccountingAccountClass.REVENUE),
          accountFact('account_hst_payable', AccountingAccountClass.LIABILITY),
        ]),
      readSettlementShadowExistingJournals: jest.fn().mockResolvedValue([]),
      readOrderSaleJournalsByFactStableIds: jest.fn().mockResolvedValue([
        {
          entryStableId: 'journal_uber_manual_ambiguous',
          idempotencyKey: 'canonical-sale:order-uber-ambiguous:v1',
          idempotencyHash: 'b'.repeat(64),
          version: 1,
          sourceFactStableId: 'order-uber-ambiguous',
          storeStableId: '4750_Yonge_Street',
          occurredAt: new Date('2026-06-10T16:00:00.000Z'),
          currency: 'CAD',
          lines: [
            {
              debitCents: 1130,
              creditCents: 0,
              memo: null,
              account: { accountStableId: 'account_uber_pending' },
              category: null,
            },
            {
              debitCents: 0,
              creditCents: 1000,
              memo: null,
              account: { accountStableId: 'account_sales_revenue' },
              category: null,
            },
            {
              debitCents: 0,
              creditCents: 130,
              memo: null,
              account: { accountStableId: 'account_hst_payable' },
              category: null,
            },
          ],
        },
      ]),
    };
    const orderFinancialFacts = {
      readFactsForRange: jest.fn().mockResolvedValue([
        {
          version: 1,
          factStableId: 'order-uber-ambiguous',
          orderStableId: 'order-uber-ambiguous',
          storeStableId: '4750_Yonge_Street',
          occurredAt: new Date('2026-06-10T16:00:00.000Z'),
          sourceUpdatedAt: new Date('2026-06-10T16:00:01.000Z'),
          sourceEvidence: 'LEGACY_CURRENT_ORDER',
          channel: 'ubereats',
          paymentMethod: 'UBEREATS',
          itemQuantity: 1,
          currency: 'CAD',
          pricingEvidence: 'COMPLETE',
          nominalSubtotalCents: 1000,
          effectiveSubtotalCents: 1000,
          discounts: {
            dailySpecialCents: 0,
            couponCents: 0,
            automaticPromotionCents: 0,
            posManualCents: 0,
            pointsRedemptionCents: 0,
            unattributedLegacyCents: 0,
            totalCents: 0,
          },
          subtotalAfterDiscountCents: 1000,
          taxCents: 130,
          deliveryRevenueCents: 0,
          cardSurchargeCents: 0,
          orderTotalCents: 1130,
          paymentTotalCents: 1130,
        },
      ]),
    };
    const service = new AccountingProviderSettlementPreviewService(
      operations as never,
      operations as never,
      accounting as never,
      storeConfig as never,
      orderFinancialFacts as never,
    );

    const result = await service.previewRange({
      fromDate: '2026-06-01',
      toDateExclusive: '2026-07-01',
      storeStableId: '4750_Yonge_Street',
      provider: AccountingFinancialProvider.UBER_EATS,
    });

    expect(result.counts.readyProviderDocuments).toBe(2);
    expect(result.uberPreCutoverOrderReversals[0]).toEqual(
      expect.objectContaining({
        status: 'BLOCKED',
        blockReasons: ['AMBIGUOUS_AUTHORITATIVE_STATEMENT_COVERAGE'],
        coveredByDocumentStableId: null,
        coveringDocumentStableIds: [
          'provider_doc_cover_a',
          'provider_doc_cover_b',
        ],
      }),
    );
  });
});
