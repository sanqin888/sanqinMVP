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
});
