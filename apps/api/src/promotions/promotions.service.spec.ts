import { Channel } from '@prisma/client';
import type { PromotionRuleWriteModel } from './promotion-rule-management.contract';
import { PromotionsService } from './promotions.service';

describe('PromotionsService canonical store timezone', () => {
  it('reads promotion time from the StoreConfig snapshot without BusinessConfig', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      promotionRule: { findMany },
    };
    const brandStoreConfigReader = {
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
        timezone: 'America/Toronto',
      }),
    };
    const service = new PromotionsService(
      prisma as never,
      brandStoreConfigReader as never,
    );

    const result = await service.getOrderPromotionContext(Channel.web);

    expect(result.rules).toEqual([]);
    expect(result.now.weekday).toBeGreaterThanOrEqual(1);
    expect(result.now.weekday).toBeLessThanOrEqual(7);
    expect(
      brandStoreConfigReader.getConfiguredStoreSnapshot,
    ).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        channels: { has: Channel.web },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    expect('businessConfig' in prisma).toBe(false);
  });
});

describe('PromotionsService PromotionRule management persistence', () => {
  it('maps persistence records to the stable business DTO without DB metadata', async () => {
    const persistedRule = {
      id: '8a3d4c0e-4750-4f6a-9138-000000000001',
      stableId: 'rule-stable',
      titleZh: '九折',
      titleEn: '10% off',
      description: 'description',
      type: 'PERCENTAGE_OFF',
      status: 'ACTIVE',
      priority: 175,
      stackingPolicy: 'EXCLUSIVE',
      excludesCoupons: false,
      excludesItemPromotions: false,
      channels: ['web', 'in_store'],
      validFrom: new Date('2026-09-04T00:00:00.000Z'),
      validTo: new Date('2026-09-05T00:00:00.000Z'),
      weekdays: [5],
      startMinutes: 600,
      endMinutes: 720,
      config: {
        membersOnly: false,
        discountPercent: 10,
        targetItemStableIds: [],
      },
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
      deletedAt: null,
    };
    const create = jest.fn().mockResolvedValue(persistedRule);
    const prisma = {
      promotionRule: { create },
    };
    const service = new PromotionsService(prisma as never, {} as never);
    const data: PromotionRuleWriteModel = {
      titleZh: persistedRule.titleZh,
      titleEn: persistedRule.titleEn,
      description: persistedRule.description,
      type: 'PERCENTAGE_OFF',
      status: 'ACTIVE',
      priority: 175,
      stackingPolicy: 'EXCLUSIVE',
      excludesCoupons: false,
      excludesItemPromotions: false,
      channels: ['web', 'in_store'],
      validFrom: persistedRule.validFrom,
      validTo: persistedRule.validTo,
      weekdays: [5],
      startMinutes: 600,
      endMinutes: 720,
      config: persistedRule.config,
    };

    const result = await service.createPromotionRuleForManagement(
      persistedRule.stableId,
      data,
    );

    expect(create).toHaveBeenCalledWith({
      data: {
        stableId: persistedRule.stableId,
        ...data,
      },
    });
    expect(result).toEqual({
      stableId: 'rule-stable',
      titleZh: '九折',
      titleEn: '10% off',
      description: 'description',
      type: 'PERCENTAGE_OFF',
      status: 'ACTIVE',
      priority: 175,
      stackingPolicy: 'EXCLUSIVE',
      excludesCoupons: false,
      excludesItemPromotions: false,
      channels: ['web', 'in_store'],
      validFrom: '2026-09-04T00:00:00.000Z',
      validTo: '2026-09-05T00:00:00.000Z',
      weekdays: [5],
      startMinutes: 600,
      endMinutes: 720,
      config: persistedRule.config,
    });
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('createdAt');
    expect(result).not.toHaveProperty('updatedAt');
    expect(result).not.toHaveProperty('deletedAt');
  });

  it('preserves Admin list ordering and ENDED soft-delete semantics', async () => {
    const persistedRule = {
      id: '8a3d4c0e-4750-4f6a-9138-000000000002',
      stableId: 'rule-soft-delete',
      titleZh: '活动',
      titleEn: null,
      description: null,
      type: 'FREE_ITEM',
      status: 'ACTIVE',
      priority: 200,
      stackingPolicy: 'EXCLUSIVE',
      excludesCoupons: false,
      excludesItemPromotions: false,
      channels: ['web'],
      validFrom: null,
      validTo: null,
      weekdays: [],
      startMinutes: null,
      endMinutes: null,
      config: { membersOnly: false, itemStableIds: ['item-a'], quantity: 1 },
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
      deletedAt: null,
    };
    const findMany = jest.fn().mockResolvedValue([persistedRule]);
    const findFirst = jest.fn().mockResolvedValue({ id: persistedRule.id });
    const update = jest.fn(
      (args: {
        where: { id: string };
        data: { status: string; deletedAt: Date };
      }) => ({
        ...persistedRule,
        status: args.data.status,
        deletedAt: args.data.deletedAt,
      }),
    );
    const service = new PromotionsService(
      {
        promotionRule: { findMany, findFirst, update },
      } as never,
      {} as never,
    );

    await service.listPromotionRulesForManagement();
    const deleted = await service.deletePromotionRuleForManagement(
      persistedRule.stableId,
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: [{ status: 'asc' }, { priority: 'asc' }, { createdAt: 'desc' }],
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { stableId: persistedRule.stableId, deletedAt: null },
      select: { id: true },
    });
    expect(update).toHaveBeenCalledTimes(1);
    const updateArgs = update.mock.calls[0]?.[0];
    expect(updateArgs).toBeDefined();
    expect(updateArgs?.where).toEqual({ id: persistedRule.id });
    expect(updateArgs?.data.status).toBe('ENDED');
    expect(updateArgs?.data.deletedAt).toBeInstanceOf(Date);
    expect(deleted).toEqual(expect.objectContaining({ status: 'ENDED' }));
    expect(deleted).not.toHaveProperty('deletedAt');
  });
});
