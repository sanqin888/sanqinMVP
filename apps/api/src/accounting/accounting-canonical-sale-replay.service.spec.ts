import { BadRequestException } from '@nestjs/common';
import type {
  LoyaltyFinancialFactV1,
  LoyaltyFinancialFactsReaderPort,
} from '../loyalty/public-api';
import type {
  OrderFinancialFactV1,
  OrderFinancialFactsReaderPort,
  OrderFinancialReplayCandidateV1,
} from '../orders/public-api';
import type { BrandStoreConfigReaderPort } from '../store/public-api';
import { AccountingCanonicalSaleReplayService } from './accounting-canonical-sale-replay.service';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingPeriodService } from './accounting-period.service';

function makeFact(
  orderStableId: string,
  overrides: Partial<OrderFinancialFactV1> = {},
): OrderFinancialFactV1 {
  return {
    version: 1,
    factStableId: orderStableId,
    orderStableId,
    storeStableId: '4750_Yonge_Street',
    occurredAt: new Date('2026-06-02T16:00:00.000Z'),
    sourceUpdatedAt: new Date('2026-06-02T16:01:00.000Z'),
    sourceEvidence: 'LEGACY_CURRENT_ORDER',
    channel: 'in_store',
    paymentMethod: 'CARD',
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
    ...overrides,
  };
}

function eligibleCandidate(
  orderStableId: string,
  overrides: Partial<OrderFinancialFactV1> = {},
): OrderFinancialReplayCandidateV1 {
  const fact = makeFact(orderStableId, overrides);
  return {
    sourceFact: fact,
    replayEligibility: 'ELIGIBLE',
    pricingResolution: 'SOURCE_COMPLETE',
    resolvedFact: fact,
  };
}

function manualOverrideCandidate(
  orderStableId: string,
): OrderFinancialReplayCandidateV1 {
  const fact = makeFact(orderStableId, {
    pricingEvidence: 'DAILY_SPECIAL_NOMINAL_UNKNOWN',
    nominalSubtotalCents: null,
    discounts: {
      dailySpecialCents: null,
      couponCents: 0,
      automaticPromotionCents: 0,
      posManualCents: 0,
      pointsRedemptionCents: 0,
      unattributedLegacyCents: 0,
      totalCents: null,
    },
  });
  return {
    sourceFact: fact,
    replayEligibility: 'PRICING_UNRESOLVED',
    pricingResolution: 'MANUAL_OVERRIDE',
    resolvedFact: null,
  };
}

function postSaleMutationCandidate(
  orderStableId: string,
): OrderFinancialReplayCandidateV1 {
  const fact = makeFact(orderStableId);
  return {
    sourceFact: fact,
    replayEligibility: 'POST_SALE_MUTATION',
    pricingResolution: 'SOURCE_COMPLETE',
    resolvedFact: null,
  };
}

function balanceFact(
  orderStableId: string,
  amountCents: number,
): LoyaltyFinancialFactV1 {
  return {
    version: 1,
    factStableId: `loyalty_${orderStableId}`,
    kind: 'STORE_BALANCE_REDEEMED',
    occurredAt: new Date('2026-06-02T16:00:00.000Z'),
    orderStableId,
    sourceKey: orderStableId,
    currency: 'CAD',
    amountCents,
  };
}

function makeService() {
  const accounting = {
    requireCanonicalFinancialPostingStartAt: jest
      .fn()
      .mockResolvedValue(new Date('2026-06-01T04:00:00.000Z')),
    createJournalEntry: jest.fn().mockResolvedValue({} as never),
  };
  const orders: jest.Mocked<OrderFinancialFactsReaderPort> = {
    readFactByOrderStableId: jest.fn(),
    readFactsForRange: jest.fn(),
    readReplayCandidateByOrderStableId: jest.fn(),
    readReplayCandidatesForRange: jest.fn(),
  };
  const loyalty: jest.Mocked<LoyaltyFinancialFactsReaderPort> = {
    readFactsByOrderStableId: jest.fn(),
    readFactsByOrderStableIds: jest.fn().mockResolvedValue([]),
    readFactsForRange: jest.fn(),
  };
  const storeConfig: jest.Mocked<
    Pick<BrandStoreConfigReaderPort, 'getConfiguredStoreSnapshot'>
  > = {
    getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
      storeStableId: '4750_Yonge_Street',
      storeName: 'SanQ',
      isActive: true,
      timezone: 'America/Toronto',
    } as never),
  };

  const service = new AccountingCanonicalSaleReplayService(
    accounting as unknown as AccountingPeriodService,
    accounting as unknown as AccountingJournalService,
    orders,
    loyalty,
    storeConfig as unknown as BrandStoreConfigReaderPort,
  );
  return { service, accounting, orders, loyalty, storeConfig };
}

describe('Accounting canonical SALE replay', () => {
  it('resolves Toronto business-day bounds and reports ready/blocked parity without posting', async () => {
    const { service, orders, loyalty } = makeService();
    orders.readReplayCandidatesForRange.mockResolvedValue([
      eligibleCandidate('order_ready'),
      manualOverrideCandidate('order_manual'),
    ]);

    const report = await service.previewRange({
      fromDate: '2026-06-01',
      toDateExclusive: '2026-06-03',
      storeStableId: '4750_Yonge_Street',
    });

    expect(orders.readReplayCandidatesForRange.mock.calls).toEqual([
      [
        {
          fromInclusive: new Date('2026-06-01T04:00:00.000Z'),
          toExclusive: new Date('2026-06-03T04:00:00.000Z'),
          storeStableId: '4750_Yonge_Street',
        },
      ],
    ]);
    expect(loyalty.readFactsByOrderStableIds.mock.calls).toEqual([
      [['order_ready', 'order_manual']],
    ]);
    expect(report.planHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.counts).toMatchObject({
      total: 2,
      ready: 1,
      blocked: 1,
      byBlockCode: { PRICING_MANUAL_OVERRIDE: 1 },
      byPricingResolution: {
        SOURCE_COMPLETE: 1,
        MANUAL_OVERRIDE: 1,
      },
    });
    expect(report.amounts).toMatchObject({
      readyOrderTotalCents: 1130,
      blockedObservedOrderTotalCents: 1130,
      readyGrossSalesRevenueCents: 1000,
      readyTaxCents: 130,
      readyJournalDebitCents: 1130,
      readyJournalCreditCents: 1130,
      legacyComparableOrderTotalCents: 1130,
      canonicalComparableOrderTotalCents: 1130,
      parityDeltaCents: 0,
    });
    expect(report.exceptions).toEqual([
      expect.objectContaining({
        orderStableId: 'order_manual',
        blockCode: 'PRICING_MANUAL_OVERRIDE',
        pricingResolution: 'MANUAL_OVERRIDE',
      }),
    ]);
    expect(report.writeAuthority).toMatchObject({
      canonicalJournalReplayEnabled: true,
      legacyAccountingTransactionAccrualStillActive: false,
    });
  });

  it('batch-applies exact Loyalty Store Balance principal to the replay preview', async () => {
    const { service, orders, loyalty } = makeService();
    orders.readReplayCandidatesForRange.mockResolvedValue([
      eligibleCandidate('order_balance'),
    ]);
    loyalty.readFactsByOrderStableIds.mockResolvedValue([
      balanceFact('order_balance', 200),
    ]);

    const report = await service.previewRange({
      toDateExclusive: '2026-06-03',
      storeStableId: '4750_Yonge_Street',
    });

    expect(report.counts.ready).toBe(1);
    expect(report.amounts.readyStoreBalanceRedeemedCents).toBe(200);
    expect(report.amounts.readyJournalDebitCents).toBe(1130);
    expect(report.amounts.readyJournalCreditCents).toBe(1130);
    expect(report.amounts.parityDeltaCents).toBe(0);
  });

  it('produces the same plan hash for the same immutable replay evidence', async () => {
    const { service, orders } = makeService();
    orders.readReplayCandidatesForRange.mockResolvedValue([
      eligibleCandidate('order_ready'),
    ]);

    const first = await service.previewRange({
      toDateExclusive: '2026-06-03',
      storeStableId: '4750_Yonge_Street',
    });
    const second = await service.previewRange({
      toDateExclusive: '2026-06-03',
      storeStableId: '4750_Yonge_Street',
    });

    expect(second.planHash).toBe(first.planHash);
  });

  it('rejects a range that begins before the configured accounting floor', async () => {
    const { service, orders } = makeService();

    await expect(
      service.previewRange({
        fromDate: '2026-05-31',
        toDateExclusive: '2026-06-03',
        storeStableId: '4750_Yonge_Street',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(orders.readReplayCandidatesForRange.mock.calls).toHaveLength(0);
  });

  it('requires explicit replay Store identity to match the configured Accounting Store', async () => {
    const { service, orders } = makeService();

    await expect(
      service.previewRange({
        toDateExclusive: '2026-06-03',
        storeStableId: 'another_store',
      }),
    ).rejects.toThrow(
      'storeStableId must match the configured Accounting store',
    );
    expect(orders.readReplayCandidatesForRange.mock.calls).toHaveLength(0);
  });

  it('executes only the exact reviewed plan and explicitly acknowledged mutation exceptions', async () => {
    const { service, accounting, orders } = makeService();
    orders.readReplayCandidatesForRange.mockResolvedValue([
      eligibleCandidate('order_ready'),
      postSaleMutationCandidate('order_mutated'),
    ]);

    const preview = await service.previewRange({
      fromDate: '2026-06-01',
      toDateExclusive: '2026-06-03',
      storeStableId: '4750_Yonge_Street',
    });
    const executed = await service.executeRange({
      fromDate: '2026-06-01',
      toDateExclusive: '2026-06-03',
      storeStableId: '4750_Yonge_Street',
      expectedPlanHash: preview.planHash,
      acknowledgedBlockedOrderStableIds: ['order_mutated'],
    });

    expect(accounting.createJournalEntry).toHaveBeenCalledTimes(1);
    expect(accounting.createJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'canonical-sale:order_ready:v1',
        sourceFactStableId: 'order_ready',
      }),
      'system:accounting-revenue-posting',
    );
    expect(executed.execution).toEqual({
      postedOrReplayed: 1,
      blockedAcknowledged: 1,
    });
  });

  it('rejects a stale execution plan before any Journal write', async () => {
    const { service, accounting, orders } = makeService();
    orders.readReplayCandidatesForRange.mockResolvedValue([
      eligibleCandidate('order_ready'),
    ]);

    await expect(
      service.executeRange({
        toDateExclusive: '2026-06-03',
        storeStableId: '4750_Yonge_Street',
        expectedPlanHash: '0'.repeat(64),
        acknowledgedBlockedOrderStableIds: [],
      }),
    ).rejects.toThrow('Canonical sale replay plan changed after preview');
    expect(accounting.createJournalEntry).not.toHaveBeenCalled();
  });

  it('requires the blocked mutation acknowledgement inventory to match exactly', async () => {
    const { service, accounting, orders } = makeService();
    orders.readReplayCandidatesForRange.mockResolvedValue([
      eligibleCandidate('order_ready'),
      postSaleMutationCandidate('order_mutated'),
    ]);
    const preview = await service.previewRange({
      toDateExclusive: '2026-06-03',
      storeStableId: '4750_Yonge_Street',
    });

    await expect(
      service.executeRange({
        toDateExclusive: '2026-06-03',
        storeStableId: '4750_Yonge_Street',
        expectedPlanHash: preview.planHash,
        acknowledgedBlockedOrderStableIds: [],
      }),
    ).rejects.toThrow(
      'acknowledgedBlockedOrderStableIds must exactly match the current POST_SALE_MUTATION exception inventory',
    );
    expect(accounting.createJournalEntry).not.toHaveBeenCalled();
  });

  it('keeps any unresolved pricing exception as a hard write blocker', async () => {
    const { service, accounting, orders } = makeService();
    orders.readReplayCandidatesForRange.mockResolvedValue([
      eligibleCandidate('order_ready'),
      manualOverrideCandidate('order_manual'),
    ]);
    const preview = await service.previewRange({
      toDateExclusive: '2026-06-03',
      storeStableId: '4750_Yonge_Street',
    });

    await expect(
      service.executeRange({
        toDateExclusive: '2026-06-03',
        storeStableId: '4750_Yonge_Street',
        expectedPlanHash: preview.planHash,
        acknowledgedBlockedOrderStableIds: ['order_manual'],
      }),
    ).rejects.toThrow('Canonical sale replay has unresolved block');
    expect(accounting.createJournalEntry).not.toHaveBeenCalled();
  });
});
