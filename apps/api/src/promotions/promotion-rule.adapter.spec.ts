import { DateTime } from 'luxon';
import { resolvePromotionCandidates } from './promotion-engine';
import {
  isPromotionRuleActiveNow,
  toPromotionRuleCandidate,
  type PromotionRuleLike,
  type PromotionRuleOrderLine,
} from './promotion-rule.adapter';

const now = DateTime.fromISO('2026-08-21T12:00:00', {
  zone: 'America/Toronto',
});

const baseRule = (
  overrides: Partial<PromotionRuleLike>,
): PromotionRuleLike => ({
  stableId: 'promo-1',
  titleZh: '测试活动',
  titleEn: 'Test promotion',
  type: 'PERCENTAGE_OFF',
  status: 'ACTIVE',
  priority: 175,
  stackingPolicy: 'EXCLUSIVE',
  excludesCoupons: false,
  excludesItemPromotions: false,
  channels: ['web', 'in_store'],
  validFrom: null,
  validTo: null,
  weekdays: [],
  startMinutes: null,
  endMinutes: null,
  config: { discountPercent: 10 },
  ...overrides,
});

const lines: PromotionRuleOrderLine[] = [
  {
    lineKey: 'line-a',
    productStableId: 'item-a',
    quantity: 2,
    lineTotalCents: 2000,
  },
  {
    lineKey: 'line-b',
    productStableId: 'item-b',
    quantity: 1,
    lineTotalCents: 500,
  },
];

describe('promotion rule adapter', () => {
  it('applies a percentage discount only to targeted items', () => {
    const candidate = toPromotionRuleCandidate({
      rule: baseRule({
        type: 'PERCENTAGE_OFF',
        config: {
          discountPercent: 20,
          targetItemStableIds: ['item-b'],
        },
      }),
      lines,
      now,
    });
    const resolution = resolvePromotionCandidates([candidate]);

    expect(resolution.adjustments).toEqual([
      expect.objectContaining({
        source: 'AUTOMATIC_PROMOTION',
        discountCents: 100,
        applicableSubtotalCents: 500,
        targetLineKeys: ['line-b'],
      }),
    ]);
  });

  it('rejects a fixed discount when minimum spend is not met', () => {
    const candidate = toPromotionRuleCandidate({
      rule: baseRule({
        type: 'FIXED_AMOUNT_OFF',
        config: { discountCents: 500, minSpendCents: 3000 },
      }),
      lines,
      now,
    });
    const resolution = resolvePromotionCandidates([candidate]);

    expect(resolution.adjustments).toEqual([]);
    expect(resolution.rejected).toContainEqual(
      expect.objectContaining({ code: 'MIN_SPEND_NOT_MET' }),
    );
  });

  it('implements same-item buy-x-get-y without counting reward units as buy units twice', () => {
    const candidate = toPromotionRuleCandidate({
      rule: baseRule({
        type: 'BUY_X_GET_Y',
        config: {
          buyItemStableIds: ['item-a'],
          buyQuantity: 2,
          getItemStableIds: ['item-a'],
          getQuantity: 1,
          discountPercent: 100,
        },
      }),
      lines: [
        {
          lineKey: 'line-a',
          productStableId: 'item-a',
          quantity: 3,
          lineTotalCents: 3000,
        },
      ],
      now,
    });
    const resolution = resolvePromotionCandidates([candidate]);

    expect(resolution.adjustments).toEqual([
      expect.objectContaining({
        discountCents: 1000,
        targetLineKeys: ['line-a'],
      }),
    ]);
  });

  it('discounts the cheapest eligible reward units for buy-x-get-y', () => {
    const candidate = toPromotionRuleCandidate({
      rule: baseRule({
        type: 'BUY_X_GET_Y',
        config: {
          buyItemStableIds: ['item-a'],
          buyQuantity: 2,
          getItemStableIds: ['item-b', 'item-c'],
          getQuantity: 1,
          discountPercent: 100,
        },
      }),
      lines: [
        {
          lineKey: 'line-a',
          productStableId: 'item-a',
          quantity: 2,
          lineTotalCents: 2000,
        },
        {
          lineKey: 'line-b',
          productStableId: 'item-b',
          quantity: 1,
          lineTotalCents: 600,
        },
        {
          lineKey: 'line-c',
          productStableId: 'item-c',
          quantity: 1,
          lineTotalCents: 400,
        },
      ],
      now,
    });
    const resolution = resolvePromotionCandidates([candidate]);

    expect(resolution.adjustments).toEqual([
      expect.objectContaining({
        discountCents: 400,
        targetLineKeys: ['line-c'],
      }),
    ]);
  });

  it('supports a free-item promotion with a minimum spend', () => {
    const candidate = toPromotionRuleCandidate({
      rule: baseRule({
        type: 'FREE_ITEM',
        config: {
          itemStableIds: ['item-b'],
          quantity: 1,
          minSpendCents: 2000,
        },
      }),
      lines,
      now,
    });
    const resolution = resolvePromotionCandidates([candidate]);

    expect(resolution.adjustments).toEqual([
      expect.objectContaining({
        discountCents: 500,
        targetLineKeys: ['line-b'],
      }),
    ]);
  });

  it('emits loyalty multiplier benefits without changing cash totals', () => {
    const candidate = toPromotionRuleCandidate({
      rule: baseRule({
        type: 'LOYALTY_MULTIPLIER',
        stackingPolicy: 'STACKABLE',
        config: { multiplier: 2 },
      }),
      lines,
      now,
    });
    const resolution = resolvePromotionCandidates([candidate]);

    expect(resolution.adjustments).toEqual([
      expect.objectContaining({
        source: 'LOYALTY_PROMOTION',
        scope: 'LOYALTY',
        discountCents: 0,
        loyaltyMultiplier: 2,
        stackingGroup: 'LOYALTY_BONUS',
      }),
    ]);
  });

  it('never lets persisted rules outrank a materialized Daily Special price', () => {
    const candidate = toPromotionRuleCandidate({
      rule: baseRule({ priority: 0 }),
      lines,
      now,
    });

    expect(candidate.priority).toBe(101);
  });

  it('uses store calendar dates and configured weekday/time windows', () => {
    const fridayRule = baseRule({
      validFrom: new Date('2026-08-21T00:00:00.000Z'),
      validTo: new Date('2026-08-21T00:00:00.000Z'),
      weekdays: [5],
      startMinutes: 11 * 60,
      endMinutes: 13 * 60,
    });

    expect(isPromotionRuleActiveNow(fridayRule, now)).toBe(true);
    expect(
      isPromotionRuleActiveNow(
        fridayRule,
        DateTime.fromISO('2026-08-21T14:00:00', {
          zone: 'America/Toronto',
        }),
      ),
    ).toBe(false);
  });
});
