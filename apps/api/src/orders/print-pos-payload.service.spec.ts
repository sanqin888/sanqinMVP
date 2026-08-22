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
      checkoutIntent: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new PrintPosPayloadService(prisma as never);
    const payload = await service.getByStableId('ord_2');

    expect(payload.snapshot.creditCardSurchargeCents).toBe(24);
    expect(payload.snapshot.totalCents).toBe(1024);
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
      summary: '筷子1份',
    });
  });

  it('Uber 餐品特殊要求会进入收银小票和厨房单共用的打印载荷', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          orderStableId: 'ord_uber_notes',
          clientRequestId: 'ubereats:external-1',
          externalOrderNotes: 'Uber order note',
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
      checkoutIntent: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const payload = await new PrintPosPayloadService(
      prisma as never,
    ).getByStableId('ord_uber_notes');

    expect(payload.orderNotes).toBe('Uber order note');
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
