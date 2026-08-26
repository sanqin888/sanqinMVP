import { UnauthorizedException } from '@nestjs/common';
import type { CreateOrderInput } from '@shared/order';

import { PosCardPaymentController } from './pos-card-payment.controller';
import type { PosCardPaymentOrchestrationService } from './pos-card-payment-orchestration.service';

const storeDbId = '8a3d4c0e-4750-4f6a-9138-000000000001';
const storeStableId = '4750_Yonge_Street';

const order: CreateOrderInput = {
  channel: 'in_store',
  fulfillmentType: 'pickup',
  paymentMethod: 'CARD',
  items: [{ productStableId: 'citem1', qty: 1, unitPrice: 10 }],
};

const body = {
  attemptId: 'attempt-1',
  idempotencyKey: 'client-idem-1',
  order,
};

const createHarness = () => {
  const cardPayments = {
    getConfig: jest
      .fn()
      .mockReturnValue({ enabled: true, storeId: storeStableId }),
    getAvailability: jest
      .fn()
      .mockResolvedValue({ enabled: true, storeId: storeStableId }),
    start: jest.fn().mockResolvedValue({ status: 'PROCESSING' }),
    recover: jest.fn().mockResolvedValue({ status: 'PROCESSING' }),
    cancel: jest.fn().mockResolvedValue({ status: 'CANCELLED' }),
  };
  const controller = new PosCardPaymentController(
    cardPayments as unknown as PosCardPaymentOrchestrationService,
  );
  return { controller, cardPayments };
};

describe('PosCardPaymentController store identity', () => {
  it(
    'uses Store.storeStableId for every Phase D boundary call, never PosDevice.storeId',
    async () => {
      const { controller, cardPayments } = createHarness();
      const req = {
        posDevice: {
          storeId: storeDbId,
          storeStableId,
        },
      } as never;

      controller.getConfig(req);
      await controller.getAvailability(req);
      await controller.start(req, body);
      await controller.recover(req, body);
      await controller.cancel(req, body.attemptId, body);

      expect(cardPayments.getConfig).toHaveBeenCalledWith(storeStableId);
      expect(cardPayments.getAvailability).toHaveBeenCalledWith(storeStableId);
      expect(cardPayments.start).toHaveBeenCalledWith(storeStableId, body);
      expect(cardPayments.recover).toHaveBeenCalledWith(storeStableId, body);
      expect(cardPayments.cancel).toHaveBeenCalledWith(storeStableId, body);

      expect(cardPayments.getConfig).not.toHaveBeenCalledWith(storeDbId);
      expect(cardPayments.getAvailability).not.toHaveBeenCalledWith(storeDbId);
      expect(cardPayments.start).not.toHaveBeenCalledWith(storeDbId, body);
      expect(cardPayments.recover).not.toHaveBeenCalledWith(storeDbId, body);
      expect(cardPayments.cancel).not.toHaveBeenCalledWith(storeDbId, body);
    },
  );

  it('does not fall back to the database UUID when storeStableId is unavailable', () => {
    const { controller, cardPayments } = createHarness();
    const req = {
      posDevice: {
        storeId: storeDbId,
        storeStableId: '   ',
      },
    } as never;

    expect(() => controller.getConfig(req)).toThrow(UnauthorizedException);
    expect(cardPayments.getConfig).not.toHaveBeenCalled();
  });
});
