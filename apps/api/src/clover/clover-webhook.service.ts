import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AppLogger } from '../common/app-logger';
import { CheckoutIntentsService } from './checkout-intents.service';
import { CloverService } from './clover.service';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class CloverWebhookService {
  private readonly logger = new AppLogger(CloverWebhookService.name);
  private readonly webhookKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly checkoutIntents: CheckoutIntentsService,
    private readonly orders: OrdersService,
    private readonly clover: CloverService,
  ) {
    this.webhookKey = this.config.get<string>('CLOVER_WEBHOOK_KEY') || '';
  }

  verifySignature(payload: unknown, signatureHeader: string): boolean {
    if (!this.webhookKey) {
      this.logger.warn(
        'CLOVER_WEBHOOK_KEY not configured, skipping verification (UNSAFE)',
      );
      return true;
    }

    try {
      const payloadString = JSON.stringify(payload);

      const parts = signatureHeader.split(',');
      const timestampPart = parts.find((part) => part.startsWith('t='));
      const signaturePart = parts.find((part) => part.startsWith('v1='));

      if (!timestampPart || !signaturePart) return false;

      const timestamp = timestampPart.substring(2);
      const signature = signaturePart.substring(3);

      const dataToSign = `${timestamp}${payloadString}`;

      const computedSignature = crypto
        .createHmac('sha256', this.webhookKey)
        .update(dataToSign)
        .digest('hex');

      return computedSignature === signature;
    } catch (error) {
      this.logger.error('Signature verification error', error);
      return false;
    }
  }

  async processPayload(payload: unknown): Promise<void> {
    if (!payload || typeof payload !== 'object') {
      this.logger.warn('Webhook payload is not a JSON object');
      return;
    }

    const payloadRecord = payload as Record<string, unknown>;
    const merchants = payloadRecord.merchants;
    if (!merchants || typeof merchants !== 'object') {
      this.logger.warn('Webhook payload missing merchants');
      return;
    }

    for (const [merchantId, events] of Object.entries(merchants)) {
      if (!Array.isArray(events)) continue;

      for (const event of events) {
        await this.handleEvent(merchantId, event);
      }
    }
  }

  private async handleEvent(merchantId: string, event: unknown) {
    if (!event || typeof event !== 'object') return;

    const eventRecord = event as Record<string, unknown>;
    const objectId =
      typeof eventRecord.objectId === 'string' ? eventRecord.objectId : undefined;
    const type =
      typeof eventRecord.type === 'string' ? eventRecord.type : undefined;

    this.logger.log(
      `Received Webhook: Merchant=${merchantId}, Type=${type ?? 'UNKNOWN'}, ID=${
        objectId ?? 'UNKNOWN'
      }`,
    );

    if (type === 'PAYMENT' && objectId) {
      await this.handlePaymentUpdate(objectId);
    }
  }

  private async handlePaymentUpdate(paymentId: string) {
    void this.checkoutIntents;
    void this.orders;
    void this.clover;

    this.logger.log(
      `Processing payment update for ${paymentId} - Logic to be implemented`,
    );
  }
}
