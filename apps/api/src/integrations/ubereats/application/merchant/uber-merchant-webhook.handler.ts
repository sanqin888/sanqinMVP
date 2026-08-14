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
    );
  }
}
