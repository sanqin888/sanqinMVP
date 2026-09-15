import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole,
} from '@prisma/client';
import { AccountingProviderSettlementPreviewService } from './accounting-provider-settlement-preview.service';

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

  it('blocks pre-live Uber Order reversals until a READY authoritative statement covers the same date', async () => {
    const operations = {
      readProviderSettlementDocuments: jest.fn().mockResolvedValue([]),
      readProviderFinancialCoverage: jest.fn().mockResolvedValue([
        {
          provider: AccountingFinancialProvider.UBER_EATS,
          storeStableId: '4750_Yonge_Street',
          financialHistoryRequiredFrom: new Date('2026-06-01T00:00:00.000Z'),
          financialCompleteThrough: null,
          liveOrderFactCutoverAt: null,
          orderDetailCoverageFrom: null,
        },
      ]),
      readActiveAccountingAccountStableIds: jest.fn().mockResolvedValue([]),
      readSettlementShadowExistingJournals: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
      readOrderSaleJournalsByFactStableIds: jest.fn().mockResolvedValue([
        {
          entryStableId: 'journal_uber_manual_1',
          idempotencyKey: 'canonical-sale:order-uber-1:v1',
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
        {
          documentStableId: 'provider_doc_tip_1',
          provider: AccountingFinancialProvider.UBER_EATS,
          documentType: AccountingFinancialDocumentType.STATEMENT,
          businessIdentityKey: 'uber:statement:aug-2026',
          revision: 1,
          supersedesDocumentId: null,
          storeStableId: '4750_Yonge_Street',
          providerDocumentRef: 'aug-2026',
          periodStart: new Date('2026-08-01T00:00:00.000Z'),
          periodEnd: new Date('2026-08-31T00:00:00.000Z'),
          settledAt: null,
          payoutAt: null,
          currency: 'CAD',
          rawMetadata: null,
          lines: [
            {
              lineStableId: 'line-tip',
              lineNo: 1,
              rawCode: null,
              rawName: 'Tips',
              component: AccountingFinancialComponent.TIP,
              postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
              taxRole: AccountingFinancialTaxRole.NONE,
              amountCents: 500,
              occurredAt: null,
            },
          ],
        },
      ]),
      readProviderFinancialCoverage: jest.fn().mockResolvedValue([
        {
          provider: AccountingFinancialProvider.UBER_EATS,
          storeStableId: '4750_Yonge_Street',
          financialHistoryRequiredFrom: new Date('2026-06-01T00:00:00.000Z'),
          financialCompleteThrough: null,
          liveOrderFactCutoverAt: null,
          orderDetailCoverageFrom: null,
        },
      ]),
      readActiveAccountingAccountStableIds: jest
        .fn()
        .mockResolvedValue(['account_uber_pending']),
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
});