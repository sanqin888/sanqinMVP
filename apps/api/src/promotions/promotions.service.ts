// apps/api/src/promotions/promotions.service.ts
import { Inject, Injectable } from '@nestjs/common';
import type { Channel } from '@shared/order';
import { PrismaService } from '../prisma/prisma.service';
import { resolveStoreNow } from './daily-specials';
import type {
  OrderPromotionContext,
  PromotionContextReaderPort,
} from './promotion-context.contract';
import {
  BRAND_STORE_CONFIG_READER,
  type BrandStoreConfigReaderPort,
} from '../store/public-api';

@Injectable()
export class PromotionsService implements PromotionContextReaderPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly brandStoreConfigReader: BrandStoreConfigReaderPort,
  ) {}

  async getOrderPromotionContext(
    channel: Channel,
  ): Promise<OrderPromotionContext> {
    const [storeConfig, rules] = await Promise.all([
      this.brandStoreConfigReader.getConfiguredStoreSnapshot(),
      this.prisma.promotionRule.findMany({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          channels: { has: channel },
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    return {
      now: resolveStoreNow(storeConfig.timezone || 'America/Toronto'),
      rules: rules.map((rule) => ({
        stableId: rule.stableId,
        titleZh: rule.titleZh,
        titleEn: rule.titleEn,
        type: rule.type,
        status: rule.status,
        priority: rule.priority,
        stackingPolicy: rule.stackingPolicy,
        excludesCoupons: rule.excludesCoupons,
        excludesItemPromotions: rule.excludesItemPromotions,
        channels: rule.channels,
        validFrom: rule.validFrom,
        validTo: rule.validTo,
        weekdays: rule.weekdays,
        startMinutes: rule.startMinutes,
        endMinutes: rule.endMinutes,
        config: rule.config,
      })),
    };
  }
}
