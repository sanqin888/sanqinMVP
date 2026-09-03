import type { Channel } from '@shared/order';
import type { resolveStoreNow } from './daily-specials';
import type { PromotionRuleLike } from './promotion-rule.adapter';

export const PROMOTION_CONTEXT_READER = Symbol('PROMOTION_CONTEXT_READER');

export type OrderPromotionContext = {
  rules: PromotionRuleLike[];
  now: ReturnType<typeof resolveStoreNow>;
};

export interface PromotionContextReaderPort {
  getOrderPromotionContext(channel: Channel): Promise<OrderPromotionContext>;
}
