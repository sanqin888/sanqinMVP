import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CreateOrderInput } from '@shared/order';
import type { Server } from 'node:http';
import request from 'supertest';

import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  PosDeviceGuard,
  type AuthenticatedPosIdentity,
} from '../pos/public-api';
import { PosCardPaymentController } from './pos-card-payment.controller';
import { PosCardPaymentOrchestrationService } from './pos-card-payment-orchestration.service';

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
    getBenefitsReview: jest.fn().mockResolvedValue({ items: [] }),
    getReviewAttempt: jest.fn().mockResolvedValue({ status: 'RECONCILING' }),
    recheckReviewAttempt: jest
      .fn()
      .mockResolvedValue({ status: 'RECONCILING' }),
    start: jest.fn().mockResolvedValue({ status: 'PROCESSING' }),
    recover: jest.fn().mockResolvedValue({ status: 'PROCESSING' }),
    resumeOriginalSale: jest.fn().mockResolvedValue({ status: 'RECONCILING' }),
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
    await controller.getBenefitsReview(req);
    await controller.getReviewAttempt(req, body.attemptId);
    await controller.recheckReviewAttempt(req, body.attemptId);
    await controller.start(req, body);
    await controller.recover(req, body);
    await controller.resumeOriginal(req, body);
    await controller.cancel(req, body.attemptId, body);

    expect(cardPayments.getConfig).toHaveBeenCalledWith(storeStableId);
    expect(cardPayments.getAvailability).toHaveBeenCalledWith(storeStableId);
    expect(cardPayments.getBenefitsReview).toHaveBeenCalledWith(storeStableId);
    expect(cardPayments.getReviewAttempt).toHaveBeenCalledWith(
      storeStableId,
      body.attemptId,
    );
    expect(cardPayments.recheckReviewAttempt).toHaveBeenCalledWith(
      storeStableId,
      body.attemptId,
    );
    expect(cardPayments.start).toHaveBeenCalledWith(storeStableId, body);
    expect(cardPayments.recover).toHaveBeenCalledWith(storeStableId, body);
    expect(cardPayments.resumeOriginalSale).toHaveBeenCalledWith(
      storeStableId,
      body,
    );
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

describe('PosCardPaymentController cancel HTTP validation', () => {
  let app: INestApplication;
  let httpServer: Server;
  const cancelPayment = jest.fn().mockResolvedValue({ status: 'PROCESSING' });
  const getReviewAttempt = jest
    .fn()
    .mockResolvedValue({ status: 'RECONCILING' });
  const recheckReviewAttempt = jest.fn().mockResolvedValue({
    status: 'RECONCILING',
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PosCardPaymentController],
      providers: [
        {
          provide: PosCardPaymentOrchestrationService,
          useValue: {
            cancel: cancelPayment,
            getReviewAttempt,
            recheckReviewAttempt,
          },
        },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PosDeviceGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const httpRequest = context.switchToHttp().getRequest<{
            posDevice?: AuthenticatedPosIdentity;
          }>();
          httpRequest.posDevice = posIdentity;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    httpServer = app.getHttpServer() as unknown as Server;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reads the saved Attempt using the authenticated device Store', async () => {
    const response = await request(httpServer).get(
      `/api/v1/pos/payments/card/review/${body.attemptId}`,
    );

    expect(response.status).toBe(200);
    expect(getReviewAttempt).toHaveBeenCalledWith(
      storeStableId,
      body.attemptId,
    );
    expect(cancelPayment).not.toHaveBeenCalled();
  });

  it('rechecks the original Attempt without a new Sale request body', async () => {
    const response = await request(httpServer).post(
      `/api/v1/pos/payments/card/review/${body.attemptId}/recheck`,
    );

    expect(response.status).toBe(201);
    expect(recheckReviewAttempt).toHaveBeenCalledWith(
      storeStableId,
      body.attemptId,
    );
    expect(cancelPayment).not.toHaveBeenCalled();
  });

  it('accepts a string attemptId route param and validates the body separately', async () => {
    const response = await request(httpServer)
      .post(`/api/v1/pos/payments/card/${body.attemptId}/cancel`)
      .send(body);

    expect(response.status).toBe(201);
    expect(cancelPayment).toHaveBeenCalledWith(storeStableId, body);
  });

  it('rejects an invalid body before invoking payment cancellation', async () => {
    const response = await request(httpServer)
      .post(`/api/v1/pos/payments/card/${body.attemptId}/cancel`)
      .send({ ...body, idempotencyKey: null });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      message: 'Validation failed',
      issues: [expect.objectContaining({ path: 'idempotencyKey' })],
    });
    expect(cancelPayment).not.toHaveBeenCalled();
  });

  it('rejects a mismatched path and body attemptId before invoking payment cancellation', async () => {
    const response = await request(httpServer)
      .post('/api/v1/pos/payments/card/other-attempt/cancel')
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'POS_CARD_PAYMENT_ATTEMPT_MISMATCH',
    });
    expect(cancelPayment).not.toHaveBeenCalled();
  });
});
