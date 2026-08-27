// apps/api/src/promotions/promotions.service.ts
import { Injectable } from '@nestjs/common';
import type { Channel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveStoreNow } from '../common/daily-specials';
import type { PromotionRuleLike } from './promotion-rule.adapter';

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrderPromotionContext(channel: Channel): Promise<{
    rules: PromotionRuleLike[];
    now: ReturnType<typeof resolveStoreNow>;
  }> {
    const [businessConfig, rules] = await Promise.all([
      this.prisma.businessConfig.findUnique({
        where: { id: 1 },
        select: { timezone: true },
      }),
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
      now: resolveStoreNow(businessConfig?.timezone ?? 'America/Toronto'),
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
