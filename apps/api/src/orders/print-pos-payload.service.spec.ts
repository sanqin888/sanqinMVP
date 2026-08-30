jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Channel: { ubereats: 'ubereats', web: 'web', in_store: 'in_store' },
  PaymentMethod: {
    UBEREATS: 'UBEREATS',
    CARD: 'CARD',
    CASH: 'CASH',
    WECHAT_ALIPAY: 'WECHAT_ALIPAY',
    STORE_BALANCE: 'STORE_BALANCE',
  },
}));

import { Channel, PaymentMethod } from '@prisma/client';
import { PrintPosPayloadService } from './print-pos-payload.service';

describe('PrintPosPayloadService', () => {
  it('Uber 收银小票和厨房单共用的打印载荷包含规范取餐码', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          orderStableId: 'ord_1',
          clientRequestId: 'REQ-1',
          deliveryFeeCents: 0,
          deliveryCostCents: 0,
          deliverySubsidyCents: 0,
          items: [],
          subtotalCents: 1000,
          subtotalAfterDiscountCents: 1000,
          paymentTotalCents: 1000,
          totalCents: 1000,
          paymentMethod: PaymentMethod.UBEREATS,
          channel: Channel.ubereats,
          contactName: 'Uber Customer',
          pickupCode: 'PIN-2468',
          fulfillmentType: 'pickup',
          taxCents: 0,
          creditCardSurchargeCents: 0,
        }),
      },
      loyaltyLedger: { findMany: jest.fn().mockResolvedValue([]) },
      checkoutIntent: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new PrintPosPayloadService(prisma as never);
    const payload = await service.getByStableId('ord_1');

    expect(payload.paymentMethod).toBe('ubereats');
    expect(payload.customerName).toBe('Uber Customer');
    expect(payload.pickupCode).toBe('PIN-2468');
    expect(payload.pickupCode).not.toBe(payload.orderNumber);
  });

  it('当存在信用卡附加费时，打印载荷会包含附加费并将总额展示为支付总额', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          orderStableId: 'ord_2',
          clientRequestId: 'REQ-2',
          deliveryFeeCents: 0,
          deliveryCostCents: 0,
          deliverySubsidyCents: 0,
          items: [],
          subtotalCents: 1000,
          subtotalAfterDiscountCents: 1000,
          paymentTotalCents: 1024,
          totalCents: 1000,
          paymentMethod: PaymentMethod.CARD,
          channel: Channel.web,
          pickupCode: null,
          fulfillmentType: 'pickup',
          taxCents: 0,
          creditCardSurchargeCents: 24,
        }),
      },
      loyaltyLedger: { findMany: jest.fn().mockResolvedValue([]) },
      checkoutIntent: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new PrintPosPayloadService(prisma as never);
    const payload = await service.getByStableId('ord_2');

    expect(payload.snapshot.creditCardSurchargeCents).toBe(24);
    expect(payload.snapshot.totalCents).toBe(1024);
  });

  it('打印载荷会统一输出特价/促销明细、积分和余额支付拆分', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-db-1',
          orderStableId: 'ord_pricing',
          clientRequestId: 'REQ-pricing',
          deliveryFeeCents: 0,
          deliveryCostCents: 0,
          deliverySubsidyCents: 0,
          items: [
            {
              productStableId: 'item-1',
              displayName: '肉夹馍',
              nameZh: '肉夹馍',
              nameEn: 'Roujiamo',
              qty: 1,
              unitPriceCents: 800,
              optionsJson: [],
            },
          ],
          subtotalCents: 800,
          subtotalAfterDiscountCents: 675,
          loyaltyRedeemCents: 25,
          couponDiscountCents: 0,
          promotionSnapshot: {
            version: 1,
            adjustments: [
              {
                promotionStableId: 'daily-1',
                source: 'DAILY_SPECIAL',
                productStableId: 'item-1',
                discountCents: 200,
                snapshot: { pricingMode: 'OVERRIDE_PRICE' },
              },
              {
                promotionStableId: 'auto-1',
                source: 'AUTOMATIC_PROMOTION',
                discountCents: 100,
                snapshot: { titleZh: '买一送一', titleEn: 'Buy 1 Get 1 Free' },
              },
            ],
          },
          paymentTotalCents: 763,
          totalCents: 763,
          paymentMethod: PaymentMethod.CARD,
          channel: Channel.web,
          pickupCode: null,
          fulfillmentType: 'pickup',
          taxCents: 88,
          creditCardSurchargeCents: 0,
        }),
      },
      loyaltyLedger: {
        findMany: jest.fn().mockResolvedValue([{ deltaMicro: -3_000_000n }]),
      },
      checkoutIntent: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const payload = await new PrintPosPayloadService(
      prisma as never,
    ).getByStableId('ord_pricing');

    expect(payload.snapshot.displaySubtotalCents).toBe(1000);
    expect(payload.snapshot.appliedDiscounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'DAILY_SPECIAL',
          discountCents: 200,
          productNameZh: '肉夹馍',
        }),
        expect.objectContaining({
          source: 'AUTOMATIC_PROMOTION',
          titleZh: '买一送一',
          discountCents: 100,
        }),
      ]),
    );
    expect(payload.snapshot.loyaltyRedeemCents).toBe(25);
    expect(payload.snapshot.balancePaidCents).toBe(300);
    expect(payload.snapshot.externalPaidCents).toBe(463);
    expect(payload.snapshot.orderTotalCents).toBe(763);
  });

  it('当订单未落库附加费但intent metadata有附加费时，打印载荷会回填附加费', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          orderStableId: 'ord_3',
          clientRequestId: 'REQ-3',
          deliveryFeeCents: 0,
          deliveryCostCents: 0,
          deliverySubsidyCents: 0,
          items: [],
          subtotalCents: 1000,
          subtotalAfterDiscountCents: 1000,
          paymentTotalCents: null,
          totalCents: 1000,
          paymentMethod: PaymentMethod.CARD,
          channel: Channel.web,
          pickupCode: null,
          fulfillmentType: 'pickup',
          taxCents: 0,
          creditCardSurchargeCents: 0,
        }),
      },
      loyaltyLedger: { findMany: jest.fn().mockResolvedValue([]) },
      checkoutIntent: {
        findFirst: jest.fn().mockResolvedValue({
          metadataJson: {
            creditCardSurchargeCents: 24,
          },
        }),
      },
    };

    const service = new PrintPosPayloadService(prisma as never);
    const payload = await service.getByStableId('ord_3');

    expect(payload.snapshot.creditCardSurchargeCents).toBe(24);
    expect(payload.snapshot.totalCents).toBe(1024);
  });

  it('当 intent metadata 包含餐具和订单备注时，打印载荷会带上对应摘要', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          orderStableId: 'ord_4',
          clientRequestId: 'REQ-4',
          deliveryFeeCents: 0,
          deliveryCostCents: 0,
          deliverySubsidyCents: 0,
          items: [],
          subtotalCents: 1000,
          subtotalAfterDiscountCents: 1000,
          paymentTotalCents: 1000,
          totalCents: 1000,
          paymentMethod: PaymentMethod.CARD,
          channel: Channel.web,
          pickupCode: null,
          fulfillmentType: 'pickup',
          taxCents: 0,
          creditCardSurchargeCents: 0,
        }),
      },
      loyaltyLedger: { findMany: jest.fn().mockResolvedValue([]) },
      checkoutIntent: {
        findFirst: jest.fn().mockResolvedValue({
          metadataJson: {
            customer: {
              notes: '少辣，不要香菜',
            },
            utensils: {
              needed: true,
              type: 'chopsticks',
              quantity: 1,
            },
          },
        }),
      },
    };

    const service = new PrintPosPayloadService(prisma as never);
    const payload = await service.getByStableId('ord_4');

    expect(payload.orderNotes).toBe('少辣，不要香菜');
    expect(payload.utensils).toEqual({
      needed: true,
      type: 'chopsticks',
      quantity: 1,
      summary: '是 / Yes · 筷子 / Chopsticks · 1份 / 1 set',
    });
  });

  it('固定套餐打印载荷按父项数量展开组成菜品并将子菜品选项归到子项', async () => {
    const componentOptionGroup = {
      templateGroupStableId: 'spice-group',
      groupKey: 'root__breakfast-combo__component-hulatang__group-spice-group',
      nameEn: 'Spice',
      nameZh: '辣度',
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 0,
      choices: [
        {
          stableId: 'mild',
          templateGroupStableId: 'spice-group',
          nameEn: 'Mild',
          nameZh: '微辣',
          priceDeltaCents: 0,
          sortOrder: 0,
        },
      ],
    };
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          orderStableId: 'ord_combo',
          clientRequestId: 'REQ-combo',
          deliveryFeeCents: 0,
          deliveryCostCents: 0,
          deliverySubsidyCents: 0,
          items: [
            {
              productStableId: 'breakfast-combo',
              displayName: 'Breakfast Combo',
              nameEn: 'Breakfast Combo',
              nameZh: '早点套餐',
              qty: 2,
              unitPriceCents: 1299,
              optionsJson: [componentOptionGroup],
              componentsJson: [
                {
                  productStableId: 'hulatang',
                  nameEn: 'Hulatang',
                  nameZh: '胡辣汤',
                  quantityPerParent: 1,
                  source: 'FIXED',
                  options: [componentOptionGroup],
                },
                {
                  productStableId: 'youtiao',
                  nameEn: 'Youtiao',
                  nameZh: '油条',
                  quantityPerParent: 2,
                  source: 'FIXED',
                  options: [],
                },
              ],
            },
          ],
          subtotalCents: 2598,
          subtotalAfterDiscountCents: 2598,
          paymentTotalCents: 2598,
          totalCents: 2598,
          paymentMethod: PaymentMethod.CARD,
          channel: Channel.web,
          pickupCode: null,
          fulfillmentType: 'pickup',
          taxCents: 0,
          creditCardSurchargeCents: 0,
        }),
      },
      loyaltyLedger: { findMany: jest.fn().mockResolvedValue([]) },
      checkoutIntent: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const payload = await new PrintPosPayloadService(
      prisma as never,
    ).getByStableId('ord_combo');

    expect(payload.snapshot.items[0]).toMatchObject({
      productStableId: 'breakfast-combo',
      quantity: 2,
      lineTotalCents: 2598,
      options: [],
      components: [
        expect.objectContaining({
          productStableId: 'hulatang',
          quantity: 2,
          options: [componentOptionGroup],
        }),
        expect.objectContaining({
          productStableId: 'youtiao',
          quantity: 4,
          options: [],
        }),
      ],
    });
  });

  it('可选套餐目标菜品只在组成项展示一次并保留选择加价', async () => {
    const targetChoiceGroup = {
      templateGroupStableId: 'noodle-group',
      groupKey: 'root__combo__group-noodle-group',
      nameEn: 'Noodle',
      nameZh: '面食',
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 0,
      choices: [
        {
          stableId: 'noodle-choice',
          templateGroupStableId: 'noodle-group',
          targetItemStableId: 'noodle-1',
          nameEn: 'Noodle 1',
          nameZh: '面食一',
          priceDeltaCents: 150,
          sortOrder: 0,
        },
      ],
    };
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          orderStableId: 'ord_selectable_combo',
          clientRequestId: 'REQ-selectable-combo',
          deliveryFeeCents: 0,
          deliveryCostCents: 0,
          deliverySubsidyCents: 0,
          items: [
            {
              productStableId: 'combo',
              displayName: 'Combo',
              nameEn: 'Combo',
              nameZh: '套餐',
              qty: 1,
              unitPriceCents: 1599,
              optionsJson: [targetChoiceGroup],
              componentsJson: [
                {
                  productStableId: 'noodle-1',
                  nameEn: 'Noodle 1',
                  nameZh: '面食一',
                  quantityPerParent: 1,
                  source: 'OPTION',
                  sourceOptionStableId: 'noodle-choice',
                  options: [],
                },
              ],
            },
          ],
          subtotalCents: 1599,
          subtotalAfterDiscountCents: 1599,
          paymentTotalCents: 1599,
          totalCents: 1599,
          paymentMethod: PaymentMethod.CARD,
          channel: Channel.web,
          pickupCode: null,
          fulfillmentType: 'pickup',
          taxCents: 0,
          creditCardSurchargeCents: 0,
        }),
      },
      loyaltyLedger: { findMany: jest.fn().mockResolvedValue([]) },
      checkoutIntent: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const payload = await new PrintPosPayloadService(
      prisma as never,
    ).getByStableId('ord_selectable_combo');

    expect(payload.snapshot.items[0].options).toEqual([]);
    expect(payload.snapshot.items[0].components).toEqual([
      expect.objectContaining({
        productStableId: 'noodle-1',
        quantity: 1,
        priceDeltaCents: 150,
      }),
    ]);
  });

  it('Uber 餐品特殊要求会进入收银小票和厨房单共用的打印载荷', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          orderStableId: 'ord_uber_notes',
          clientRequestId: 'ubereats:external-1',
          externalOrderNotes: 'Uber order note\n餐具 / Utensils: 是 / Yes',
          items: [
            {
              productStableId: 'item-1',
              displayName: '羊肉泡馍',
              nameEn: null,
              nameZh: '羊肉泡馍',
              qty: 1,
              unitPriceCents: 1599,
              externalSpecialInstructions:
                '  不要香菜，多放辣椒\nALLERGY: PEANUTS, SOY\nALLERGY INSTRUCTIONS: Use a clean surface\nOPTION REQUEST (加辣):\n不要和花生接触  ',
              optionsJson: [],
            },
          ],
          subtotalCents: 1599,
          subtotalAfterDiscountCents: 1599,
          paymentTotalCents: 1599,
          totalCents: 1599,
          paymentMethod: PaymentMethod.UBEREATS,
          channel: Channel.ubereats,
          fulfillmentType: 'pickup',
          taxCents: 0,
        }),
      },
      loyaltyLedger: { findMany: jest.fn().mockResolvedValue([]) },
      checkoutIntent: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const payload = await new PrintPosPayloadService(
      prisma as never,
    ).getByStableId('ord_uber_notes');

    expect(payload.orderNotes).toBe(
      'Uber order note\n餐具 / Utensils: 是 / Yes',
    );
    expect(payload.snapshot.items[0].specialInstructions).toBe(
      '不要香菜，多放辣椒\nALLERGY: PEANUTS, SOY\nALLERGY INSTRUCTIONS: Use a clean surface\nOPTION REQUEST (加辣):\n不要和花生接触',
    );
  });

  it.each([
    ['zh-CN', 'zh'],
    ['en-CA', 'en'],
  ] as const)(
    '将 POS 页面语言 %s 明确规范为打印语言 %s',
    async (locale, expected) => {
      const prisma = {
        order: {
          findUnique: jest.fn().mockResolvedValue({
            orderStableId: 'ord_locale',
            clientRequestId: 'REQ-locale',
            items: [
              {
                productStableId: 'item-1',
                displayName: 'Uber historical title',
                nameEn: null,
                nameZh: null,
                qty: 1,
                unitPriceCents: 100,
                optionsJson: [],
              },
            ],
            subtotalCents: 100,
            subtotalAfterDiscountCents: 100,
            paymentTotalCents: 100,
            totalCents: 100,
            paymentMethod: PaymentMethod.UBEREATS,
            channel: Channel.ubereats,
            fulfillmentType: 'pickup',
            taxCents: 0,
          }),
        },
        loyaltyLedger: { findMany: jest.fn().mockResolvedValue([]) },
        checkoutIntent: { findFirst: jest.fn().mockResolvedValue(null) },
      };

      const payload = await new PrintPosPayloadService(
        prisma as never,
      ).getByStableId('ord_locale', locale);

      expect(payload.locale).toBe(expected);
      expect(payload.snapshot.items[0]).toMatchObject({
        displayName: 'Uber historical title',
        nameEn: null,
        nameZh: null,
      });
    },
  );
});
