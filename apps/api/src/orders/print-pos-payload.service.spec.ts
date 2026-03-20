import { Channel, PaymentMethod } from '@prisma/client';
import { PrintPosPayloadService } from './print-pos-payload.service';

describe('PrintPosPayloadService', () => {
  it('maps UBEREATS payment method to ubereats for receipt payload', async () => {
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
          pickupCode: null,
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
});
