import { Module } from '@nestjs/common';
import { BrandStoreConfigModule } from '../store/public-api';
import { DAILY_SPECIAL_OFFERS } from './daily-special-offers.contract';
import { PROMOTION_CONTEXT_READER } from './promotion-context.contract';
import { PromotionsService } from './promotions.service';

@Module({
  imports: [BrandStoreConfigModule],
  providers: [
    PromotionsService,
    {
      provide: PROMOTION_CONTEXT_READER,
      useExisting: PromotionsService,
    },
    {
      provide: DAILY_SPECIAL_OFFERS,
      useExisting: PromotionsService,
    },
  ],
  exports: [PROMOTION_CONTEXT_READER, DAILY_SPECIAL_OFFERS],
})
export class PromotionsCoreModule {}
