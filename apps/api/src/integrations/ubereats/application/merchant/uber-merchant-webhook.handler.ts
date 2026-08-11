import { normalizeUberEventType } from '../../domain/shared/uber-integration.utils';
import {
  webhookObject,
  webhookText,
} from '../../domain/webhook/uber-webhook-envelope';
import {
  type UberTelemetryPort,
  type UberWebhookInboxPort,
} from '../ports/uber-order-processing.ports';

export class HandleUberMerchantWebhookHandler {
  constructor(
    private readonly inbox: UberWebhookInboxPort,
    private readonly telemetry: UberTelemetryPort,
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
    );
  }
}
