export {
  isDailySpecialActiveNow,
  resolveEffectivePriceCents,
  resolveStoreNow,
} from './daily-specials';
export {
  PROMOTION_CONTEXT_READER,
  type OrderPromotionContext,
  type PromotionContextReaderPort,
} from './promotion-context.contract';
export {
  evaluateOrderPromotions,
  type PromotionOrderEvaluation,
  type PromotionOrderLine,
} from './order-promotion-evaluator';
export type { CouponPromotionLike } from './coupon-promotion.adapter';
export {
  resolvePromotionLoyaltyMultiplier,
  type PromotionSource,
} from './promotion-engine';
export { PromotionsModule } from './promotions.module';
