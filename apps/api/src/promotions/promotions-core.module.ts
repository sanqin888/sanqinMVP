import { Module } from '@nestjs/common';
import { CatalogAdminModule } from '../menu/public-api';
import { BrandStoreConfigModule } from '../store/public-api';
import { DAILY_SPECIAL_OFFERS } from './daily-special-offers.contract';
import { PROMOTION_CONTEXT_READER } from './promotion-context.contract';
import { PROMOTION_RULE_MANAGEMENT } from './promotion-rule-management.contract';
import { MARKETING_CAMPAIGN_FACTS_READER } from './marketing-campaign-facts-reader.contract';
import { PromotionRuleManagementService } from './promotion-rule-management.service';
import { PromotionsService } from './promotions.service';

@Module({
  imports: [BrandStoreConfigModule, CatalogAdminModule],
  providers: [
    PromotionsService,
    PromotionRuleManagementService,
    {
      provide: PROMOTION_CONTEXT_READER,
      useExisting: PromotionsService,
    },
    {
      provide: DAILY_SPECIAL_OFFERS,
      useExisting: PromotionsService,
    },
    {
      provide: PROMOTION_RULE_MANAGEMENT,
      useExisting: PromotionRuleManagementService,
    },
    {
      provide: MARKETING_CAMPAIGN_FACTS_READER,
      useExisting: PromotionsService,
    },
  ],
  exports: [
    PROMOTION_CONTEXT_READER,
    DAILY_SPECIAL_OFFERS,
    PROMOTION_RULE_MANAGEMENT,
    MARKETING_CAMPAIGN_FACTS_READER,
  ],
})
export class PromotionsCoreModule {}
