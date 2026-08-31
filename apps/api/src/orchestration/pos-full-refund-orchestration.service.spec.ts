import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PaymentMethod } from '@prisma/client';
import type { Server } from 'node:http';
import request from 'supertest';

import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { PosDeviceGuard } from '../pos/pos-device.guard';
import type { PosOrdersService } from '../pos/pos-orders.service';
import { PosCardRefundController } from './pos-card-refund.controller';
import { PosCardRefundOrchestrationService } from './pos-card-refund-orchestration.service';
import { PosFullRefundController } from './pos-full-refund.controller';
import { PosFullRefundOrchestrationService } from './pos-full-refund-orchestration.service';

const input = {
  reason: 'Customer cancellation',
  operatorName: 'Staff',
  refundAmountCents: 2000,
  originalPaymentMethod: PaymentMethod.CARD,
  refundMethod: PaymentMethod.CARD,
};

const order = {
  orderStableId: 'order_stable_1',
  status: 'paid',
};

const createHarness = () => {
  const cardRefunds = { refundFullOrder: jest.fn() };
  const posOrders = { createFullRefund: jest.fn() };
  const service = new PosFullRefundOrchestrationService(
    cardRefunds as unknown as PosCardRefundOrchestrationService,
    posOrders as unknown as PosOrdersService,
  );
  return { cardRefunds, posOrders, service };
};

describe('PosFullRefundOrchestrationService', () => {
  it('preserves the legacy manual refund path only after an explicit legacy classification', async () => {
    const harness = createHarness();
    harness.cardRefunds.refundFullOrder.mockResolvedValue({
      mode: 'LEGACY_MANUAL_REQUIRED',
      status: null,
      operation: null,
      order,
      refundedCardBaseCents: null,
      refundedAdditionalChargeCents: null,
      refundedCustomerTotalCents: null,
      failureCode: null,
      failureMessage: null,
    });
    harness.posOrders.createFullRefund.mockResolvedValue({
      order: { ...order, status: 'refunded' },
      outcome: 'refunded',
    });

    await expect(
      harness.service.refundFullOrder(
        '4750_Yonge_Street',
        'order_stable_1',
        input,
      ),
    ).resolves.toMatchObject({ outcome: 'refunded' });
    expect(harness.posOrders.createFullRefund).toHaveBeenCalledWith(
      'order_stable_1',
      input,
    );
  });

  it('never falls back to the legacy Order-first path for an uncertain managed refund', async () => {
    const harness = createHarness();
    harness.cardRefunds.refundFullOrder.mockResolvedValue({
      mode: 'MANAGED',
      status: 'UNKNOWN',
      operation: 'REFUND',
      order,
      refundedCardBaseCents: null,
      refundedAdditionalChargeCents: null,
      refundedCustomerTotalCents: null,
      failureCode: 'CLOVER_PLATFORM_REVERSAL_NOT_YET_VISIBLE',
      failureMessage: 'not visible yet',
    });

    await expect(
      harness.service.refundFullOrder(
        '4750_Yonge_Street',
        'order_stable_1',
        input,
      ),
    ).resolves.toMatchObject({
      outcome: 'pending_platform',
      managedPaymentStatus: 'UNKNOWN',
      managedPaymentOperation: 'REFUND',
      order: { status: 'paid' },
    });
    expect(harness.posOrders.createFullRefund).not.toHaveBeenCalled();
  });

  it('returns the historical response shape after canonical managed success', async () => {
    const harness = createHarness();
    harness.cardRefunds.refundFullOrder.mockResolvedValue({
      mode: 'MANAGED',
      status: 'SUCCEEDED',
      operation: 'VOID',
      order: { ...order, status: 'refunded' },
      refundedCardBaseCents: 1500,
      refundedAdditionalChargeCents: 36,
      refundedCustomerTotalCents: 1536,
      failureCode: null,
      failureMessage: null,
    });

    await expect(
      harness.service.refundFullOrder(
        '4750_Yonge_Street',
        'order_stable_1',
        input,
      ),
    ).resolves.toMatchObject({
      outcome: 'refunded',
      managedPaymentStatus: 'SUCCEEDED',
      managedPaymentOperation: 'VOID',
    });
    expect(harness.posOrders.createFullRefund).not.toHaveBeenCalled();
  });

  it('does not hide a definitive managed refund failure behind legacy fallback', async () => {
    const harness = createHarness();
    harness.cardRefunds.refundFullOrder.mockResolvedValue({
      mode: 'MANAGED',
      status: 'FAILED',
      operation: 'REFUND',
      order,
      refundedCardBaseCents: null,
      refundedAdditionalChargeCents: null,
      refundedCustomerTotalCents: null,
      failureCode: 'CLOVER_REFUND_FAILED',
      failureMessage: 'refund failed',
    });

    try {
      await harness.service.refundFullOrder(
        '4750_Yonge_Street',
        'order_stable_1',
        input,
      );
      throw new Error('Expected managed refund failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      const conflict = error as ConflictException;
      expect(conflict.getResponse()).toMatchObject({
        code: 'CLOVER_REFUND_FAILED',
      });
    }
    expect(harness.posOrders.createFullRefund).not.toHaveBeenCalled();
  });
});

const controllerOrderStableId = 'c1234567890abcdefghijklmn';
const controllerStoreStableId = '4750_Yonge_Street';
const controllerStoreDbId = '11111111-1111-4111-8111-111111111111';
const controllerFullRefund =
  jest.fn<PosFullRefundOrchestrationService['refundFullOrder']>();
const controllerCardRefund =
  jest.fn<PosCardRefundOrchestrationService['refundFullOrder']>();

describe('POS refund controller validation boundaries', () => {
  let app: INestApplication;
  let httpServer: Server;

  beforeEach(async () => {
    jest.clearAllMocks();
    controllerFullRefund.mockResolvedValue({
      order: { orderStableId: controllerOrderStableId },
      outcome: 'refunded',
    } as never);
    controllerCardRefund.mockResolvedValue({
      mode: 'MANAGED',
      status: 'SUCCEEDED',
      operation: 'REFUND',
      order: { orderStableId: controllerOrderStableId },
      refundedCardBaseCents: 0,
      refundedAdditionalChargeCents: 0,
      refundedCustomerTotalCents: 0,
      failureCode: null,
      failureMessage: null,
    } as never);

    const moduleRef = await Test.createTestingModule({
      controllers: [PosFullRefundController, PosCardRefundController],
      providers: [
        {
          provide: PosFullRefundOrchestrationService,
          useValue: { refundFullOrder: controllerFullRefund },
        },
        {
          provide: PosCardRefundOrchestrationService,
          useValue: { refundFullOrder: controllerCardRefund },
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
            posDevice?: { storeId: string; storeStableId: string };
          }>();
          httpRequest.posDevice = {
            storeId: controllerStoreDbId,
            storeStableId: controllerStoreStableId,
          };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer() as unknown as Server;
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts a valid full-refund path parameter while validating only the request body', async () => {
    const payload = {
      reason: 'Customer cancellation',
      operatorName: 'Staff',
      refundAmountCents: 2031,
      originalPaymentMethod: 'STORE_BALANCE',
      refundMethod: 'STORE_BALANCE',
    } as const;

    const response = await request(httpServer)
      .post(`/pos/orders/${controllerOrderStableId}/full-refund`)
      .send(payload);

    expect(response.status).toBe(201);
    expect(controllerFullRefund).toHaveBeenCalledWith(
      controllerStoreStableId,
      controllerOrderStableId,
      payload,
    );
  });

  it('accepts a zero refund amount for benefits-only Web orders', async () => {
    const payload = {
      reason: 'Customer cancellation',
      operatorName: 'Staff',
      refundAmountCents: 0,
      originalPaymentMethod: 'STORE_BALANCE',
      refundMethod: 'STORE_BALANCE',
    } as const;

    const response = await request(httpServer)
      .post(`/pos/orders/${controllerOrderStableId}/full-refund`)
      .send(payload);

    expect(response.status).toBe(201);
    expect(controllerFullRefund).toHaveBeenCalledWith(
      controllerStoreStableId,
      controllerOrderStableId,
      payload,
    );
  });

  it('still rejects an invalid full-refund body', async () => {
    const response = await request(httpServer)
      .post(`/pos/orders/${controllerOrderStableId}/full-refund`)
      .send({
        reason: '',
        operatorName: 'Staff',
        refundAmountCents: 2031,
        originalPaymentMethod: 'STORE_BALANCE',
        refundMethod: 'STORE_BALANCE',
      });

    expect(response.status).toBe(400);
    expect(controllerFullRefund).not.toHaveBeenCalled();
  });

  it('accepts a valid managed-card refund path parameter while validating only the request body', async () => {
    const payload = {
      reason: 'Customer cancellation',
      operatorName: 'Staff',
      refundMethod: 'CARD',
    } as const;

    const response = await request(httpServer)
      .post(`/pos/payments/card/orders/${controllerOrderStableId}/full-refund`)
      .send(payload);

    expect(response.status).toBe(201);
    expect(controllerCardRefund).toHaveBeenCalledWith(
      controllerStoreStableId,
      controllerOrderStableId,
      payload,
    );
  });

  it('still rejects an invalid managed-card refund body', async () => {
    const response = await request(httpServer)
      .post(`/pos/payments/card/orders/${controllerOrderStableId}/full-refund`)
      .send({
        reason: 'Customer cancellation',
        operatorName: '',
        refundMethod: 'CARD',
      });

    expect(response.status).toBe(400);
    expect(controllerCardRefund).not.toHaveBeenCalled();
  });
});
