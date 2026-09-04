import type { resolveStoreNow } from './daily-specials';
import type { PromotionRuleLike } from './promotion-rule.adapter';
import type { PromotionRuleChannel } from './promotion-rule-management.contract';

export const PROMOTION_CONTEXT_READER = Symbol('PROMOTION_CONTEXT_READER');

export type OrderPromotionContext = {
  rules: PromotionRuleLike[];
  now: ReturnType<typeof resolveStoreNow>;
};

export interface PromotionContextReaderPort {
  getOrderPromotionContext(
    channel: PromotionRuleChannel,
  ): Promise<OrderPromotionContext>;
}
