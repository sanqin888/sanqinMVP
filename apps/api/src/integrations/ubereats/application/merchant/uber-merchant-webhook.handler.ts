<<<<<<< HEAD
import { type UberTelemetryPort } from '../shared/uber-telemetry.port';
import type { UberStoreProvisioningEventV1 } from '../../domain/webhook/uber-webhook-event.parser';
import { type UberWebhookInboxPort } from '../orders/uber-order-processing.ports';

export class HandleUberMerchantWebhookHandler {
  constructor(
    private readonly inbox: UberWebhookInboxPort,
    private readonly telemetry: UberTelemetryPort,
  ) {}

  async execute(
    eventId: string,
    event: UberStoreProvisioningEventV1,
  ): Promise<void> {
    await this.inbox.setStoreProvisioned(event.storeId, event.provisioned);
    await this.telemetry.captureEvent(
      `ubereats_${event.eventType.replaceAll('.', '_')}`,
      { eventType: event.eventType, eventId },
=======
import { Inject, Injectable } from '@nestjs/common';
import { normalizeUberEventType } from '../../domain/shared/uber-integration.utils';
import {
  webhookObject,
  webhookText,
} from '../../domain/webhook/uber-webhook-envelope';
import {
  UBER_TELEMETRY_PORT,
  UBER_WEBHOOK_INBOX_PORT,
  type UberTelemetryPort,
  type UberWebhookInboxPort,
} from '../ports/uber-order-processing.ports';

@Injectable()
export class HandleUberMerchantWebhookHandler {
  constructor(
    @Inject(UBER_WEBHOOK_INBOX_PORT)
    private readonly inbox: UberWebhookInboxPort,
    @Inject(UBER_TELEMETRY_PORT) private readonly telemetry: UberTelemetryPort,
  ) {}

  async execute(
    eventType: string,
    eventId: string,
    payload: unknown,
  ): Promise<void> {
    const normalized = normalizeUberEventType(eventType);
    if (
      normalized === 'store.provisioned' ||
      normalized === 'store.deprovisioned'
    ) {
      const root = webhookObject(payload);
      const data = webhookObject(root?.data);
      const storeId = webhookText(
        root?.store_id,
        data?.store_id,
        webhookObject(data?.store)?.id,
      );
      if (storeId)
        await this.inbox.setStoreProvisioned(
          storeId,
          normalized === 'store.provisioned',
        );
    }
    await this.telemetry.captureEvent(
      `ubereats_${normalized.replaceAll('.', '_')}`,
      { eventType, eventId },
>>>>>>> origin/main
    );
  }
}
