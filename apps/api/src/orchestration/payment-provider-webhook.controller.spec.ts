import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import type { PaymentProviderWebhookIngress } from '../payments/application/payment-provider-webhook.port';
import { PaymentWebhookAuthenticationError } from '../payments/application/payment-provider-webhook.port';
import type { PaymentReverseSyncService } from '../payments/application/payment-reverse-sync.service';
import type { PaymentWebhookEventRepository } from '../payments/application/payment-webhook-event.repository';
import { PaymentProviderWebhookController } from './payment-provider-webhook.controller';
import type { PaymentReverseSyncOrchestrationService } from './payment-reverse-sync-orchestration.service';
import { PaymentReverseSyncRetryableError } from './payment-reverse-sync-orchestration.service';

const notification = {
  eventId: 'clover_event_1',
  provider: 'CLOVER' as const,
  merchantId: 'merchant-1',
  providerPaymentId: 'provider-payment-1',
  operation: 'UPDATE' as const,
  occurredAt: new Date('2026-08-26T20:00:00.000Z'),
};

const createHarness = () => {
  const ingress = {
    parseAndAuthenticate: jest.fn(),
  };
  const reverseSync = {
    reconcileNotification: jest.fn(),
  };
  const events = {
    isCompleted: jest.fn(),
    markCompleted: jest.fn(),
  };
  const orchestration = {
    apply: jest.fn(),
  };

  const controller = new PaymentProviderWebhookController(
    ingress as unknown as PaymentProviderWebhookIngress,
    reverseSync as unknown as PaymentReverseSyncService,
    events as unknown as PaymentWebhookEventRepository,
    orchestration as unknown as PaymentReverseSyncOrchestrationService,
  );

  return { controller, ingress, reverseSync, events, orchestration };
};

describe('PaymentProviderWebhookController', () => {
  it('acknowledges an exact duplicate without running payment/order side effects again', async () => {
    const harness = createHarness();
    harness.ingress.parseAndAuthenticate.mockReturnValue({
      kind: 'EVENTS',
      notifications: [notification],
    });
    harness.events.isCompleted.mockResolvedValue(true);

    await expect(
      harness.controller.receiveCloverWebhook('auth-code', {}),
    ).resolves.toEqual({
      ok: true,
      received: 1,
      processed: 0,
      duplicates: 1,
    });
    expect(harness.reverseSync.reconcileNotification).not.toHaveBeenCalled();
    expect(harness.orchestration.apply).not.toHaveBeenCalled();
    expect(harness.events.markCompleted).not.toHaveBeenCalled();
  });

  it('persists the idempotency completion marker only after reverse-sync orchestration succeeds', async () => {
    const harness = createHarness();
    harness.ingress.parseAndAuthenticate.mockReturnValue({
      kind: 'EVENTS',
      notifications: [notification],
    });
    harness.events.isCompleted.mockResolvedValue(false);
    harness.reverseSync.reconcileNotification.mockResolvedValue({
      processingResult: 'UNKNOWN_PAYMENT',
      payment: null,
      externalReversal: 'NONE',
      previousRefundedAmountCents: null,
      failureCode: null,
      failureMessage: null,
    });
    harness.orchestration.apply.mockResolvedValue({
      action: 'NONE',
      orderStableId: null,
    });
    harness.events.markCompleted.mockResolvedValue(true);

    await expect(
      harness.controller.receiveCloverWebhook('auth-code', {}),
    ).resolves.toEqual({
      ok: true,
      received: 1,
      processed: 1,
      duplicates: 0,
    });
    expect(harness.orchestration.apply).toHaveBeenCalledTimes(1);
    expect(harness.events.markCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        notification,
        processingResult: 'UNKNOWN_PAYMENT',
      }),
    );
  });

  it('does not mark or orchestrate an event while canonical payment truth is deferred', async () => {
    const harness = createHarness();
    harness.ingress.parseAndAuthenticate.mockReturnValue({
      kind: 'EVENTS',
      notifications: [notification],
    });
    harness.events.isCompleted.mockResolvedValue(false);
    harness.reverseSync.reconcileNotification.mockResolvedValue({
      processingResult: 'DEFERRED',
      payment: null,
      externalReversal: 'NONE',
      previousRefundedAmountCents: null,
      failureCode: 'CLOVER_PLATFORM_PAYMENT_QUERY_UNCERTAIN',
      failureMessage: 'canonical query is temporarily uncertain',
    });

    await expect(
      harness.controller.receiveCloverWebhook('auth-code', {}),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(harness.orchestration.apply).not.toHaveBeenCalled();
    expect(harness.events.markCompleted).not.toHaveBeenCalled();
  });

  it('does not mark an event complete when Order finalization requires provider retry', async () => {
    const harness = createHarness();
    harness.ingress.parseAndAuthenticate.mockReturnValue({
      kind: 'EVENTS',
      notifications: [notification],
    });
    harness.events.isCompleted.mockResolvedValue(false);
    harness.reverseSync.reconcileNotification.mockResolvedValue({
      processingResult: 'APPLIED',
      payment: null,
      externalReversal: 'FULL_REFUND',
      previousRefundedAmountCents: 0,
      failureCode: null,
      failureMessage: null,
    });
    harness.orchestration.apply.mockRejectedValue(
      new PaymentReverseSyncRetryableError('finalizing'),
    );

    await expect(
      harness.controller.receiveCloverWebhook('auth-code', {}),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(harness.events.markCompleted).not.toHaveBeenCalled();
  });

  it('maps provider authentication failure to HTTP 401', async () => {
    const harness = createHarness();
    harness.ingress.parseAndAuthenticate.mockImplementation(() => {
      throw new PaymentWebhookAuthenticationError();
    });

    await expect(
      harness.controller.receiveCloverWebhook('bad-auth', {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
