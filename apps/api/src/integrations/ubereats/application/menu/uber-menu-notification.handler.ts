import { createHash } from 'crypto';
import type { UberMenuRefreshRequestEventV1 } from '../../domain/webhook/uber-webhook-event.parser';
import type { ProvisionedUberStoreQueryPort } from './uber-menu-draft.ports';
import type {
  UberMenuGatewayPort,
  UberMenuPublicationRepositoryPort,
} from './uber-menu-publication.ports';
import { buildUberIdempotencyKey } from '../orders/uber-idempotency-key';
import { UberValidationError } from '../shared/uber-application.error';
import type { UberTelemetryPort } from '../shared/uber-telemetry.port';

export interface UberMenuNotification {
  publishVersion?: string | null;
  resourceId?: string | null;
  status: string;
  [key: string]: unknown;
}
export interface MenuNotificationRepository {
  findByCorrelation(input: {
    publishVersion: string | null;
    resourceId: string | null;
  }): Promise<{ versionStableId: string } | null>;
  apply(versionStableId: string, event: UberMenuNotification): Promise<void>;
}
export const MENU_NOTIFICATION_REPOSITORY = Symbol(
  'MENU_NOTIFICATION_REPOSITORY',
);
/** Correlates notifications by immutable publish version/resource id, never by store alone. */
export class UberMenuNotificationHandler {
  constructor(private readonly repository: MenuNotificationRepository) {}
  async handle(event: UberMenuNotification) {
    const publishVersion = event.publishVersion?.trim() || null;
    const resourceId = event.resourceId?.trim() || null;
    if (!publishVersion && !resourceId)
      return { kind: 'ignored' as const, reason: 'missing_correlation' };
    const version = await this.repository.findByCorrelation({
      publishVersion,
      resourceId,
    });
    if (!version)
      return { kind: 'ignored' as const, reason: 'unknown_publication' };
    await this.repository.apply(version.versionStableId, event);
    return { kind: 'handled' as const };
  }
}

/** Replays the latest confirmed full menu when Uber explicitly requests a refresh. */
export class UberMenuRefreshRequestHandler {
  constructor(
    private readonly provisionedStores: ProvisionedUberStoreQueryPort,
    private readonly publications: UberMenuPublicationRepositoryPort,
    private readonly gateway: UberMenuGatewayPort,
    private readonly telemetry: UberTelemetryPort,
  ) {}

  async execute(
    eventId: string,
    event: UberMenuRefreshRequestEventV1,
  ): Promise<void> {
    const mapping = await this.provisionedStores.resolveProvisionedUberStoreId(
      event.storeId,
    );
    const posStoreId = mapping?.posExternalStoreId?.trim() || null;
    if (!mapping || !posStoreId)
      throw new UberValidationError({
        code: 'UBER_MENU_REFRESH_STORE_NOT_MAPPED',
        message:
          'Uber menu refresh 对应门店未完成 provision 或缺少稳定 POS Store ID',
        operation: 'webhook.menu-refresh',
      });

    if (event.partnerStoreId && event.partnerStoreId !== posStoreId)
      throw new UberValidationError({
        code: 'UBER_MENU_REFRESH_STORE_MAPPING_MISMATCH',
        message:
          'Uber menu refresh 的 partner_store_id 与本地稳定门店 ID 不一致',
        operation: 'webhook.menu-refresh',
      });

    const payload =
      await this.publications.findLastSucceededPayload(posStoreId);
    if (!payload)
      throw new UberValidationError({
        code: 'UBER_MENU_REFRESH_CONFIRMED_MENU_MISSING',
        message: 'Uber menu refresh 没有可安全重放的已确认菜单',
        operation: 'webhook.menu-refresh',
      });

    const payloadHash = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    await this.gateway.uploadMenu({
      storeId: event.storeId,
      payload,
      idempotencyKey: buildUberIdempotencyKey({
        taskId: `menu-refresh:${eventId}`,
        resourceId: event.storeId,
        action: 'REFRESH_MENU',
        businessVersion: payloadHash,
      }),
    });
    await this.telemetry.captureEvent('ubereats_store_menu_refresh_processed', {
      eventId,
      uberStoreId: event.storeId,
      posStoreId,
      payloadHash,
    });
  }
}
