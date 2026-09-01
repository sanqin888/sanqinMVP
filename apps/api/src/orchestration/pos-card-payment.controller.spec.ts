import { UnauthorizedException } from '@nestjs/common';
import type { CreateOrderInput } from '@shared/order';

import type { AuthenticatedPosIdentity } from '../pos/public-api';
import { PosCardPaymentController } from './pos-card-payment.controller';
import type { PosCardPaymentOrchestrationService } from './pos-card-payment-orchestration.service';

const storeStableId = '4750_Yonge_Street';
const posIdentity: AuthenticatedPosIdentity = {
  deviceStableId: 'device-1',
  storeStableId,
  name: 'Front POS',
};

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
  it('uses the authenticated POS store stable id for every Phase D boundary call', async () => {
    const { controller, cardPayments } = createHarness();
    const req = { posDevice: posIdentity } as never;

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
  });

  it('rejects an authenticated POS identity without a usable storeStableId', () => {
    const { controller, cardPayments } = createHarness();
    const req = {
      posDevice: { ...posIdentity, storeStableId: '   ' },
    } as never;

    expect(() => controller.getConfig(req)).toThrow(UnauthorizedException);
    expect(cardPayments.getConfig).not.toHaveBeenCalled();
  });
});
