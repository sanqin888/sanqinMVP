export {
  isDailySpecialActiveNow,
  resolveEffectivePriceCents,
  resolveStoreNow,
} from './daily-specials';
export { DailySpecialOffersModule } from './daily-special-offers.module';
export {
  DAILY_SPECIAL_OFFERS,
  type DailySpecialCatalogItemSnapshot,
  type DailySpecialOffersPort,
  type DailySpecialUpsertEntry,
  type DailySpecialUpsertPayload,
} from './daily-special-offers.contract';
export {
  PROMOTION_CONTEXT_READER,
  type OrderPromotionContext,
  type PromotionContextReaderPort,
} from './promotion-context.contract';
export {
  MARKETING_CAMPAIGN_FACTS_READER,
  type MarketingCampaignFactV1,
  type MarketingCampaignFactsReaderPort,
  type MarketingCampaignKindV1,
  type MarketingCampaignLifecycleStatusV1,
  type MarketingCampaignScopeV1,
  type MarketingCouponProgramAttributionV1,
} from './marketing-campaign-facts-reader.contract';
export {
  PROMOTION_RULE_MANAGEMENT,
  type PromotionRuleChannel,
  type PromotionRuleManagementDto,
  type PromotionRuleManagementInput,
  type PromotionRuleManagementPort,
  type PromotionRuleStackingPolicy,
  type PromotionRuleStatus,
  type PromotionRuleType,
} from './promotion-rule-management.contract';
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
