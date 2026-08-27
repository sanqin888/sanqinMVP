import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { AppLogger } from '../common/app-logger';
import {
  PAYMENT_PROVIDER_WEBHOOK_INGRESS,
  PaymentWebhookAuthenticationError,
  PaymentWebhookConfigurationError,
  PaymentWebhookPayloadError,
  type PaymentProviderWebhookIngress,
} from '../payments/application/payment-provider-webhook.port';
import { PaymentReverseSyncService } from '../payments/application/payment-reverse-sync.service';
import {
  PAYMENT_WEBHOOK_EVENT_REPOSITORY,
  type PaymentWebhookEventRepository,
} from '../payments/application/payment-webhook-event.repository';
import {
  PaymentReverseSyncOrchestrationService,
  PaymentReverseSyncRetryableError,
} from './payment-reverse-sync-orchestration.service';

@Controller('payments/webhooks')
export class PaymentProviderWebhookController {
  private readonly logger = new AppLogger(
    PaymentProviderWebhookController.name,
  );

  constructor(
    @Inject(PAYMENT_PROVIDER_WEBHOOK_INGRESS)
    private readonly ingress: PaymentProviderWebhookIngress,
    private readonly reverseSync: PaymentReverseSyncService,
    @Inject(PAYMENT_WEBHOOK_EVENT_REPOSITORY)
    private readonly events: PaymentWebhookEventRepository,
    private readonly orchestration: PaymentReverseSyncOrchestrationService,
  ) {}

  @Post('clover')
  @HttpCode(200)
  async receiveCloverWebhook(
    @Headers('x-clover-auth') authHeader: string | undefined,
    @Body() payload: unknown,
  ): Promise<{
    ok: true;
    verification?: true;
    received?: number;
    processed?: number;
    duplicates?: number;
  }> {
    let ingressResult: ReturnType<
      PaymentProviderWebhookIngress['parseAndAuthenticate']
    >;
    try {
      ingressResult = this.ingress.parseAndAuthenticate({
        authHeader,
        payload,
      });
    } catch (error) {
      if (error instanceof PaymentWebhookAuthenticationError) {
        throw new UnauthorizedException({
          code: 'PAYMENT_WEBHOOK_AUTHENTICATION_FAILED',
          message: 'Payment provider webhook authentication failed.',
        });
      }
      if (error instanceof PaymentWebhookConfigurationError) {
        throw new ServiceUnavailableException({
          code: 'PAYMENT_WEBHOOK_NOT_CONFIGURED',
          message: error.message,
        });
      }
      if (error instanceof PaymentWebhookPayloadError) {
        throw new BadRequestException({
          code: 'PAYMENT_WEBHOOK_PAYLOAD_INVALID',
          message: error.message,
        });
      }
      throw error;
    }

    if (ingressResult.kind === 'VERIFICATION') {
      this.logger.log(
        `[CloverWebhook] verificationCode=${ingressResult.verificationCode}`,
      );
      return { ok: true, verification: true };
    }

    let processed = 0;
    let duplicates = 0;
    for (const notification of ingressResult.notifications) {
      if (await this.events.isCompleted(notification.eventId)) {
        duplicates += 1;
        continue;
      }

      try {
        const result =
          await this.reverseSync.reconcileNotification(notification);
        if (result.processingResult === 'DEFERRED') {
          throw new PaymentReverseSyncRetryableError(
            result.failureMessage ??
              'Payment provider truth is not stable enough to complete reverse sync yet.',
          );
        }
        await this.orchestration.apply(result);
        const snapshot = result.payment?.toSnapshot();
        const recorded = await this.events.markCompleted({
          notification,
          processingResult: result.processingResult,
          attemptId: snapshot?.attemptId ?? null,
          externalPaymentId: snapshot?.externalPaymentId ?? null,
          refundedAmountCents: snapshot?.refundedAmountCents ?? null,
          failureCode: result.failureCode,
          failureMessage: result.failureMessage,
        });
        if (recorded) processed += 1;
        else duplicates += 1;
      } catch (error) {
        if (error instanceof PaymentReverseSyncRetryableError) {
          throw new ServiceUnavailableException({
            code: 'PAYMENT_WEBHOOK_REVERSE_SYNC_RETRY_REQUIRED',
            message: error.message,
          });
        }
        throw error;
      }
    }

    return {
      ok: true,
      received: ingressResult.notifications.length,
      processed,
      duplicates,
    };
  }
}
