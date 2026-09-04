import { PromotionRuleManagementService } from './promotion-rule-management.service';

function createPersistenceStub() {
  return {
    listPromotionRulesForManagement: jest.fn(),
    getPromotionRuleForManagement: jest.fn(),
    createPromotionRuleForManagement: jest.fn(),
    updatePromotionRuleForManagement: jest.fn(),
    deletePromotionRuleForManagement: jest.fn(),
  };
}

describe('PromotionRuleManagementService', () => {
  it('preserves the Admin defaults and normalization rules before owner persistence', async () => {
    const persistence = createPersistenceStub();
    persistence.createPromotionRuleForManagement.mockResolvedValue({
      stableId: 'rule-stable',
    });
    const service = new PromotionRuleManagementService(persistence as never);

    await service.createRule({
      stableId: '  rule-stable  ',
      titleZh: '  周末优惠  ',
      titleEn: '   ',
      description: '  weekend deal  ',
      type: 'PERCENTAGE_OFF',
      weekdays: [5, 1, 5],
      config: {
        membersOnly: true,
        discountPercent: 12.6,
        targetItemStableIds: [' item-a ', 'item-a'],
        minSpendCents: 100.4,
      },
    });

    expect(persistence.createPromotionRuleForManagement).toHaveBeenCalledWith(
      'rule-stable',
      {
        titleZh: '周末优惠',
        titleEn: null,
        description: 'weekend deal',
        type: 'PERCENTAGE_OFF',
        status: 'DRAFT',
        priority: 175,
        stackingPolicy: 'EXCLUSIVE',
        excludesCoupons: false,
        excludesItemPromotions: false,
        channels: ['web', 'in_store'],
        validFrom: null,
        validTo: null,
        weekdays: [1, 5],
        startMinutes: null,
        endMinutes: null,
        config: {
          membersOnly: true,
          discountPercent: 13,
          targetItemStableIds: ['item-a'],
          minSpendCents: 100,
        },
      },
    );
  });

  it('preserves explicit status, channel, date, time and BOGO configuration semantics', async () => {
    const persistence = createPersistenceStub();
    persistence.updatePromotionRuleForManagement.mockResolvedValue({
      stableId: 'rule-1',
    });
    const service = new PromotionRuleManagementService(persistence as never);

    await service.updateRule('rule-1', {
      titleZh: '买一送一',
      titleEn: 'BOGO',
      description: null,
      type: 'BUY_X_GET_Y',
      status: 'ACTIVE',
      priority: 250,
      stackingPolicy: 'STACKABLE',
      excludesCoupons: true,
      excludesItemPromotions: true,
      channels: ['ubereats', 'web', 'ubereats'],
      validFrom: '2026-09-04',
      validTo: '2026-09-05',
      weekdays: [7, 6],
      startMinutes: 600,
      endMinutes: 720,
      config: {
        membersOnly: false,
        buyItemStableIds: ['item-a'],
        buyQuantity: 1,
        getItemStableIds: ['item-b'],
        getQuantity: 1,
      },
    });

    expect(persistence.updatePromotionRuleForManagement).toHaveBeenCalledWith(
      'rule-1',
      expect.objectContaining({
        status: 'ACTIVE',
        priority: 250,
        stackingPolicy: 'STACKABLE',
        excludesCoupons: true,
        excludesItemPromotions: true,
        channels: ['ubereats', 'web'],
        validFrom: new Date(Date.UTC(2026, 8, 4)),
        validTo: new Date(Date.UTC(2026, 8, 5)),
        weekdays: [6, 7],
        startMinutes: 600,
        endMinutes: 720,
        config: {
          membersOnly: false,
          buyItemStableIds: ['item-a'],
          buyQuantity: 1,
          getItemStableIds: ['item-b'],
          getQuantity: 1,
          discountPercent: 100,
        },
      }),
    );
  });

  it.each([
    {
      name: 'partial BOGO target overlap',
      input: {
        titleZh: 'BOGO',
        type: 'BUY_X_GET_Y' as const,
        config: {
          buyItemStableIds: ['item-a', 'item-b'],
          buyQuantity: 1,
          getItemStableIds: ['item-b'],
          getQuantity: 1,
        },
      },
      message: 'BUY_X_GET_Y buy/get item sets must be identical or disjoint',
    },
    {
      name: 'reverse date range',
      input: {
        titleZh: 'Date',
        type: 'PERCENTAGE_OFF' as const,
        validFrom: '2026-09-05',
        validTo: '2026-09-04',
        config: { discountPercent: 10 },
      },
      message: 'validFrom must be on or before validTo',
    },
    {
      name: 'reverse minute range',
      input: {
        titleZh: 'Time',
        type: 'PERCENTAGE_OFF' as const,
        startMinutes: 700,
        endMinutes: 600,
        config: { discountPercent: 10 },
      },
      message: 'endMinutes must be on or after startMinutes',
    },
  ])(
    'rejects $name with the existing Admin error contract',
    ({ input, message }) => {
      const service = new PromotionRuleManagementService(
        createPersistenceStub() as never,
      );

      expect(() => service.createRule(input)).toThrow(message);
    },
  );

  it('preserves the not-found contract for get, update and delete', async () => {
    const persistence = createPersistenceStub();
    persistence.getPromotionRuleForManagement.mockResolvedValue(null);
    persistence.updatePromotionRuleForManagement.mockResolvedValue(null);
    persistence.deletePromotionRuleForManagement.mockResolvedValue(null);
    const service = new PromotionRuleManagementService(persistence as never);
    const input = {
      titleZh: 'Rule',
      type: 'PERCENTAGE_OFF' as const,
      config: { discountPercent: 10 },
    };

    await expect(service.getRule('missing')).rejects.toThrow(
      'promotion rule not found',
    );
    await expect(service.updateRule('missing', input)).rejects.toThrow(
      'promotion rule not found',
    );
    await expect(service.deleteRule('missing')).rejects.toThrow(
      'promotion rule not found',
    );
  });
});
