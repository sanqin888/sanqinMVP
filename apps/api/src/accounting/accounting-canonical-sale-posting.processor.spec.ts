import type {
  OrderFinancialFactV1,
  OrderFinancialFactsReaderPort,
} from '../orders/public-api';
import type { BrandStoreConfigReaderPort } from '../store/public-api';
import { AccountingFinancialProvider } from './accounting-contracts';
import { AccountingCanonicalSalePostingProcessor } from './accounting-canonical-sale-posting.processor';
import { AccountingCanonicalSalePostingService } from './accounting-canonical-sale-posting.service';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingPeriodService } from './accounting-period.service';
import { AccountingProviderSettlementQueryService } from './accounting-provider-settlement-query.service';

const NOW = new Date('2026-09-22T16:00:00.000Z');
const START = new Date('2026-06-01T04:00:00.000Z');

function saleFact(
  orderStableId: string,
  overrides: Partial<OrderFinancialFactV1> = {},
): OrderFinancialFactV1 {
  return {
    version: 1,
    factStableId: `fact_${orderStableId}`,
    orderStableId,
    storeStableId: '4750_Yonge_Street',
    occurredAt: new Date('2026-09-22T15:00:00.000Z'),
    sourceUpdatedAt: new Date('2026-09-22T15:00:01.000Z'),
    sourceEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
    channel: 'in_store',
    paymentMethod: 'CASH',
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

function makeProcessor() {
  const period = {
    requireCanonicalFinancialPostingStartAt: jest.fn().mockResolvedValue(START),
  };
  const journal = {
    readCanonicalSaleJournalAnchors: jest.fn().mockResolvedValue([]),
  };
  const posting = {
    previewCanonicalSale: jest.fn().mockResolvedValue({
      status: 'READY',
      block: null,
    } as never),
    postCanonicalSale: jest.fn().mockResolvedValue({} as never),
  };
  const settlementQuery = {
    readProviderFinancialCoverage: jest.fn().mockResolvedValue([] as never),
  };
  const orders: jest.Mocked<OrderFinancialFactsReaderPort> = {
    readFactByOrderStableId: jest.fn(),
    readFactsForRange: jest.fn().mockResolvedValue([]),
    readReplayCandidateByOrderStableId: jest.fn(),
    readReplayCandidatesForRange: jest.fn(),
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

  const processor = new AccountingCanonicalSalePostingProcessor(
    period as unknown as AccountingPeriodService,
    journal as unknown as AccountingJournalService,
    posting as unknown as AccountingCanonicalSalePostingService,
    settlementQuery as unknown as AccountingProviderSettlementQueryService,
    orders,
    storeConfig as unknown as BrandStoreConfigReaderPort,
  );

  return {
    processor,
    period,
    journal,
    posting,
    settlementQuery,
    orders,
    storeConfig,
  };
}

describe('Accounting canonical SALE posting processor', () => {
  it('posts only missing immutable SALE facts and leaves legacy reconstruction on controlled replay', async () => {
    const { processor, journal, posting, settlementQuery, orders } =
      makeProcessor();
    const alreadyPosted = saleFact('already_posted');
    const missing = saleFact('missing');
    const legacy = saleFact('legacy', {
      factStableId: 'legacy',
      sourceEvidence: 'LEGACY_CURRENT_ORDER',
    });
    orders.readFactsForRange.mockResolvedValue([
      alreadyPosted,
      missing,
      legacy,
    ]);
    journal.readCanonicalSaleJournalAnchors.mockResolvedValue([
      {
        entryStableId: 'journal_existing',
        sourceFactStableId: alreadyPosted.factStableId,
        idempotencyKey: 'canonical-sale:already_posted:v1',
      },
    ]);

    const result = await processor.processOnce({
      mode: 'RECENT',
      now: NOW,
    });

    expect(result).toMatchObject({
      mode: 'RECENT',
      scanned: 3,
      immutable: 2,
      alreadyPosted: 1,
      legacyDeferred: 1,
      authorityDeferred: 0,
      blocked: 0,
      posted: 1,
      failed: 0,
      complete: true,
    });
    expect(posting.previewCanonicalSale.mock.calls).toEqual([['missing']]);
    expect(posting.postCanonicalSale.mock.calls).toEqual([['missing']]);
    expect(settlementQuery.readProviderFinancialCoverage).not.toHaveBeenCalled();
  });

  it('defers Uber SALE facts while provider coverage remains statement-authoritative', async () => {
    const { processor, posting, settlementQuery, orders } = makeProcessor();
    orders.readFactsForRange.mockResolvedValue([
      saleFact('uber_statement_authority', {
        channel: 'ubereats',
        paymentMethod: 'UBEREATS',
      }),
    ]);
    settlementQuery.readProviderFinancialCoverage.mockResolvedValue([
      {
        provider: AccountingFinancialProvider.UBER_EATS,
        liveOrderFactCutoverAt: null,
      },
    ] as never);

    const result = await processor.processOnce({
      mode: 'RECENT',
      now: NOW,
    });

    expect(result.authorityDeferred).toBe(1);
    expect(result.posted).toBe(0);
    expect(posting.previewCanonicalSale).not.toHaveBeenCalled();
    expect(posting.postCanonicalSale).not.toHaveBeenCalled();
  });

  it('posts only Uber facts at or after the configured live Order-fact cutover', async () => {
    const { processor, posting, settlementQuery, orders } = makeProcessor();
    const cutover = new Date('2026-09-22T14:00:00.000Z');
    orders.readFactsForRange.mockResolvedValue([
      saleFact('uber_before', {
        channel: 'ubereats',
        paymentMethod: 'UBEREATS',
        occurredAt: new Date('2026-09-22T13:59:59.999Z'),
      }),
      saleFact('uber_after', {
        channel: 'ubereats',
        paymentMethod: 'UBEREATS',
        occurredAt: cutover,
      }),
    ]);
    settlementQuery.readProviderFinancialCoverage.mockResolvedValue([
      {
        provider: AccountingFinancialProvider.UBER_EATS,
        liveOrderFactCutoverAt: cutover,
      },
    ] as never);

    const result = await processor.processOnce({
      mode: 'RECENT',
      now: NOW,
    });

    expect(result.authorityDeferred).toBe(1);
    expect(result.posted).toBe(1);
    expect(posting.previewCanonicalSale.mock.calls).toEqual([['uber_after']]);
    expect(posting.postCanonicalSale.mock.calls).toEqual([['uber_after']]);
  });

  it('fails closed on a posting-policy block without preventing later eligible facts', async () => {
    const { processor, posting, orders } = makeProcessor();
    orders.readFactsForRange.mockResolvedValue([
      saleFact('blocked'),
      saleFact('ready'),
    ]);
    posting.previewCanonicalSale
      .mockResolvedValueOnce({
        status: 'BLOCKED',
        block: { code: 'JOURNAL_POLICY' },
      } as never)
      .mockResolvedValueOnce({
        status: 'READY',
        block: null,
      } as never);

    const result = await processor.processOnce({
      mode: 'RECENT',
      now: NOW,
    });

    expect(result.blocked).toBe(1);
    expect(result.posted).toBe(1);
    expect(posting.postCanonicalSale.mock.calls).toEqual([['ready']]);
  });

  it('keeps POS/Web posting available when Uber authority coverage cannot be read', async () => {
    const { processor, posting, settlementQuery, orders } = makeProcessor();
    orders.readFactsForRange.mockResolvedValue([
      saleFact('uber_unreadable', {
        channel: 'ubereats',
        paymentMethod: 'UBEREATS',
      }),
      saleFact('pos_ready'),
    ]);
    settlementQuery.readProviderFinancialCoverage.mockRejectedValue(
      new Error('coverage unavailable'),
    );

    const result = await processor.processOnce({
      mode: 'RECENT',
      now: NOW,
    });

    expect(result.failed).toBe(1);
    expect(result.posted).toBe(1);
    expect(posting.previewCanonicalSale.mock.calls).toEqual([['pos_ready']]);
    expect(posting.postCanonicalSale.mock.calls).toEqual([['pos_ready']]);
  });

  it('keeps a full reconciliation incomplete when the posting budget leaves work uninspected', async () => {
    const { processor, posting, orders } = makeProcessor();
    orders.readFactsForRange.mockImplementation(async (range) =>
      range.fromInclusive.getTime() === START.getTime()
        ? [saleFact('one'), saleFact('two')]
        : [],
    );

    const first = await processor.processOnce({
      mode: 'FULL',
      now: new Date('2026-06-02T04:00:00.000Z'),
      postLimit: 1,
    });

    expect(first.posted).toBe(1);
    expect(first.complete).toBe(false);
    expect(posting.postCanonicalSale.mock.calls).toEqual([['one']]);
  });

  it('uses a full startup reconciliation and then a recent recovery window', async () => {
    const { processor, orders } = makeProcessor();
    const firstNow = new Date('2026-06-03T05:00:00.000Z');
    const secondNow = new Date('2026-06-03T05:00:15.000Z');

    const first = await processor.processOnce({ now: firstNow });
    const second = await processor.processOnce({ now: secondNow });

    expect(first.mode).toBe('FULL');
    expect(second.mode).toBe('RECENT');
    expect(orders.readFactsForRange.mock.calls[0]).toEqual([
      {
        fromInclusive: START,
        toExclusive: firstNow,
        storeStableId: '4750_Yonge_Street',
      },
    ]);
    expect(orders.readFactsForRange.mock.calls[1]).toEqual([
      {
        fromInclusive: new Date('2026-06-01T05:00:15.000Z'),
        toExclusive: secondNow,
        storeStableId: '4750_Yonge_Street',
      },
    ]);
  });
});
