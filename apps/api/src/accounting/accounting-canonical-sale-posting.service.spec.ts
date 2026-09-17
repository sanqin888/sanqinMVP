import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from '@prisma/client';
import type {
  LoyaltyFinancialFactsReaderPort,
  LoyaltyFinancialFactV1,
} from '../loyalty/public-api';
import type {
  OrderFinancialFactV1,
  OrderFinancialFactsReaderPort,
  OrderFinancialReplayCandidateV1,
} from '../orders/public-api';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingPeriodService } from './accounting-period.service';
import { CANONICAL_SALE_SYSTEM_ACTOR } from './accounting-canonical-sale-journal.policy';
import { AccountingCanonicalSalePostingService } from './accounting-canonical-sale-posting.service';

function makeFact(
  overrides: Partial<OrderFinancialFactV1> = {},
): OrderFinancialFactV1 {
  return {
    version: 1,
    factStableId: 'order_stable_1',
    orderStableId: 'order_stable_1',
    storeStableId: '4750_Yonge_Street',
    occurredAt: new Date('2026-09-12T16:00:00.000Z'),
    sourceUpdatedAt: new Date('2026-09-12T16:01:00.000Z'),
    sourceEvidence: 'IMMUTABLE_SALE_SNAPSHOT',
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

function makeCandidate(
  overrides: Partial<OrderFinancialReplayCandidateV1> = {},
): OrderFinancialReplayCandidateV1 {
  const fact = makeFact();
  return {
    sourceFact: fact,
    replayEligibility: 'ELIGIBLE',
    pricingResolution: 'SOURCE_COMPLETE',
    resolvedFact: fact,
    ...overrides,
  };
}

function loyaltyFact(
  kind: LoyaltyFinancialFactV1['kind'],
  amountCents: number,
): LoyaltyFinancialFactV1 {
  return {
    version: 1,
    factStableId: `loyalty_${kind}_${amountCents}`,
    kind,
    occurredAt: new Date('2026-09-12T16:00:00.000Z'),
    orderStableId: 'order_stable_1',
    sourceKey: 'order_stable_1',
    currency: 'CAD',
    amountCents,
  };
}

function makeService() {
  const accounting = {
    requireCanonicalFinancialPostingStartAt: jest.fn(),
    createJournalEntry: jest.fn(),
  };
  const orders: jest.Mocked<OrderFinancialFactsReaderPort> = {
    readFactByOrderStableId: jest.fn(),
    readFactsForRange: jest.fn(),
    readReplayCandidateByOrderStableId: jest.fn(),
    readReplayCandidatesForRange: jest.fn(),
  };
  const loyalty: jest.Mocked<LoyaltyFinancialFactsReaderPort> = {
    readFactsByOrderStableId: jest.fn(),
    readFactsByOrderStableIds: jest.fn(),
    readFactsForRange: jest.fn(),
  };
  const service = new AccountingCanonicalSalePostingService(
    accounting as unknown as AccountingPeriodService,
    accounting as unknown as AccountingJournalService,
    orders,
    loyalty,
  );
  accounting.requireCanonicalFinancialPostingStartAt.mockResolvedValue(
    new Date('2026-06-01T04:00:00.000Z'),
  );
  loyalty.readFactsByOrderStableId.mockResolvedValue([]);
  return { service, accounting, orders, loyalty };
}

describe('Accounting canonical SALE posting service', () => {
  it('fails closed when accountingStartDate is not configured', async () => {
    const { service, accounting, orders } = makeService();
    accounting.requireCanonicalFinancialPostingStartAt.mockRejectedValue(
      new ConflictException('accountingStartDate required'),
    );

    await expect(
      service.previewCanonicalSale('order_stable_1'),
    ).rejects.toThrow(ConflictException);
    expect(orders.readReplayCandidateByOrderStableId.mock.calls).toHaveLength(
      0,
    );
  });

  it('returns not found when the Orders owner has no financial fact', async () => {
    const { service, orders } = makeService();
    orders.readReplayCandidateByOrderStableId.mockResolvedValue(null);

    await expect(service.previewCanonicalSale('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('blocks post-sale mutated legacy Orders before reading Loyalty', async () => {
    const { service, orders, loyalty } = makeService();
    orders.readReplayCandidateByOrderStableId.mockResolvedValue(
      makeCandidate({
        replayEligibility: 'POST_SALE_MUTATION',
        resolvedFact: null,
      }),
    );

    const preview = await service.previewCanonicalSale('order_stable_1');

    expect(preview.status).toBe('BLOCKED');
    expect(preview.block?.code).toBe('POST_SALE_MUTATION');
    expect(loyalty.readFactsByOrderStableId.mock.calls).toHaveLength(0);
  });

  it('preserves MANUAL_OVERRIDE as an explicit non-postable pricing exception', async () => {
    const { service, orders } = makeService();
    orders.readReplayCandidateByOrderStableId.mockResolvedValue(
      makeCandidate({
        replayEligibility: 'PRICING_UNRESOLVED',
        pricingResolution: 'MANUAL_OVERRIDE',
        resolvedFact: null,
      }),
    );

    const preview = await service.previewCanonicalSale('order_stable_1');

    expect(preview.status).toBe('BLOCKED');
    expect(preview.block?.code).toBe('PRICING_MANUAL_OVERRIDE');
  });

  it('blocks a sale before the configured Toronto accounting floor', async () => {
    const { service, orders } = makeService();
    const fact = makeFact({
      occurredAt: new Date('2026-06-01T03:59:59.999Z'),
    });
    orders.readReplayCandidateByOrderStableId.mockResolvedValue(
      makeCandidate({ sourceFact: fact, resolvedFact: fact }),
    );

    const preview = await service.previewCanonicalSale('order_stable_1');

    expect(preview.status).toBe('BLOCKED');
    expect(preview.block?.code).toBe('BEFORE_ACCOUNTING_START_DATE');
  });

  it('uses Store Balance redemption as liability tender and leaves returns for later reversal', async () => {
    const { service, accounting, orders, loyalty } = makeService();
    const fact = makeFact({
      nominalSubtotalCents: 749,
      effectiveSubtotalCents: 749,
      discounts: {
        dailySpecialCents: 0,
        couponCents: 0,
        automaticPromotionCents: 0,
        posManualCents: 0,
        pointsRedemptionCents: 515,
        unattributedLegacyCents: 0,
        totalCents: 515,
      },
      subtotalAfterDiscountCents: 234,
      taxCents: 30,
      orderTotalCents: 264,
      paymentTotalCents: 264,
    });
    orders.readReplayCandidateByOrderStableId.mockResolvedValue(
      makeCandidate({ sourceFact: fact, resolvedFact: fact }),
    );
    loyalty.readFactsByOrderStableId.mockResolvedValue([
      loyaltyFact('STORE_BALANCE_REDEEMED', 200),
      loyaltyFact('STORE_BALANCE_RETURNED', 50),
    ]);

    const preview = await service.previewCanonicalSale('order_stable_1');

    expect(preview.status).toBe('READY');
    expect(preview.loyalty).toEqual({
      storeBalanceRedeemedCents: 200,
      storeBalanceReturnedCents: 50,
    });
    expect(preview.journal?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountStableId: 'account_clover_pending',
          debitCents: 64,
        }),
        expect.objectContaining({
          accountStableId: 'account_store_balance_liability',
          debitCents: 200,
        }),
      ]),
    );
    expect(accounting.createJournalEntry).not.toHaveBeenCalled();
  });

  it('blocks a sale that unexpectedly carries Store Balance top-up principal', async () => {
    const { service, orders, loyalty } = makeService();
    orders.readReplayCandidateByOrderStableId.mockResolvedValue(
      makeCandidate(),
    );
    loyalty.readFactsByOrderStableId.mockResolvedValue([
      loyaltyFact('STORE_BALANCE_TOPUP', 1000),
    ]);

    const preview = await service.previewCanonicalSale('order_stable_1');

    expect(preview.status).toBe('BLOCKED');
    expect(preview.block?.code).toBe('STORE_BALANCE_TOPUP_ON_SALE');
  });

  it('posts through the existing Journal writer with the stable system actor', async () => {
    const { service, accounting, orders } = makeService();
    orders.readReplayCandidateByOrderStableId.mockResolvedValue(
      makeCandidate(),
    );
    const createdAt = new Date('2026-09-12T16:02:00.000Z');
    accounting.createJournalEntry.mockResolvedValue({
      entryStableId: 'journal_1',
      idempotencyKey: 'canonical-sale:order_stable_1:v1',
      kind: AccountingJournalEntryKind.STANDARD,
      source: AccountingJournalSource.ORDER,
      sourceFactType: 'order.financial_sale.v1',
      sourceFactStableId: 'order_stable_1',
      sourceFactVersion: 1,
      storeStableId: '4750_Yonge_Street',
      occurredAt: new Date('2026-09-12T16:00:00.000Z'),
      currency: 'CAD',
      memo: 'Canonical sale order_stable_1',
      createdByActorRef: CANONICAL_SALE_SYSTEM_ACTOR,
      updatedByActorRef: CANONICAL_SALE_SYSTEM_ACTOR,
      createdAt,
      updatedAt: createdAt,
      version: 1,
      deletedAt: null,
      lines: [],
    });

    const result = await service.postCanonicalSale('order_stable_1');

    expect(accounting.createJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'canonical-sale:order_stable_1:v1',
        sourceFactType: 'order.financial_sale.v1',
        sourceFactStableId: 'order_stable_1',
      }),
      CANONICAL_SALE_SYSTEM_ACTOR,
    );
    expect(result.journalEntry).toEqual({
      entryStableId: 'journal_1',
      idempotencyKey: 'canonical-sale:order_stable_1:v1',
      version: 1,
      createdAt,
      updatedAt: createdAt,
    });
  });

  it('does not call the Journal writer for a blocked preview', async () => {
    const { service, accounting, orders } = makeService();
    orders.readReplayCandidateByOrderStableId.mockResolvedValue(
      makeCandidate({
        replayEligibility: 'PRICING_UNRESOLVED',
        pricingResolution: 'UNRESOLVED',
        resolvedFact: null,
      }),
    );

    await expect(service.postCanonicalSale('order_stable_1')).rejects.toThrow(
      ConflictException,
    );
    expect(accounting.createJournalEntry).not.toHaveBeenCalled();
  });
});
