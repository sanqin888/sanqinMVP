import { type UberTelemetryPort } from '../shared/uber-telemetry.port';
import type {
  UberStoreProvisioningEventV1,
  UberStoreStatusChangedEventV1,
} from '../../domain/webhook/uber-webhook-event.parser';
import type { UberStoreApiPort } from './uber-merchant-api.ports';
import { type UberWebhookInboxPort } from '../orders/uber-order-processing.ports';

export class HandleUberMerchantWebhookHandler {
  constructor(
    private readonly inbox: UberWebhookInboxPort,
    private readonly storeApi: UberStoreApiPort,
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

  async executeStatusChanged(
    eventId: string,
    event: UberStoreStatusChangedEventV1,
  ): Promise<void> {
    const status = await this.storeApi.retrieveStatus(event.storeId);
    await this.telemetry.captureEvent('ubereats_store_status_changed', {
      eventType: event.eventType,
      eventId,
      uberStoreId: event.storeId,
      status: status.status,
      offlineReason: status.offlineReason,
      offlineReasonMetadata: status.offlineReasonMetadata,
      isOfflineUntil: status.isOfflineUntil,
    });
  }
}
