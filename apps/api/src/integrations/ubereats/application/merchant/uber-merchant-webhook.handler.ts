import { normalizeUberEventType } from '../../domain/shared/uber-integration.utils';
import { parseUberStoreProvisioningV1 } from '../../contracts/events/uber-store-provisioning.v1';
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
      const event = parseUberStoreProvisioningV1(payload);
      if (event)
        await this.inbox.setStoreProvisioned(event.storeId, event.provisioned);
    }
    await this.telemetry.captureEvent(
      `ubereats_${normalized.replaceAll('.', '_')}`,
      { eventType, eventId },
    );
  }
}
