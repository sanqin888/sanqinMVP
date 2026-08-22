import { UberValidationError } from '../shared/uber-application.error';
import { type UberStoreApiPort } from '../merchant/uber-merchant-api.ports';
import { createHash } from 'crypto';
import { buildUberIdempotencyKey } from '../orders/uber-idempotency-key';
import {
  type UberMerchantConnectionRepositoryPort,
  type UberStoreMappingRepositoryPort,
} from './uber-merchant-persistence.ports';
import type { UberOperationsAlertRepositoryPort } from '../operations/uber-operations-alert.ports';
import { AppLogger } from '../../../../common/app-logger';

export type UberStoreStatusTarget = {
  uberStoreId: string;
  targetStatus: 'ONLINE' | 'PAUSED';
  reason?: string;
  pauseUntil?: string;
};
const credentials = (v: unknown): boolean =>
  Array.isArray(v)
    ? v.some(credentials)
    : !!v &&
      typeof v === 'object' &&
      Object.entries(v as Record<string, unknown>).some(
        ([k, x]) => /(?:access|refresh)[_-]?token/i.test(k) || credentials(x),
      );
const sanitize = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(sanitize)
    : !v || typeof v !== 'object'
      ? v
      : Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .filter(([k]) => !/(?:access|refresh)[_-]?token/i.test(k))
            .map(([k, x]) => [k, sanitize(x)]),
        );

const recordOf = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** SanQ owns scheduled fulfillment, so every provision must subscribe to its webhook. */
const withScheduledOrderWebhook = (
  payload: Record<string, unknown>,
): Record<string, unknown> => {
  const webhooks = recordOf(payload.webhooks_config) ?? {};
  const scheduled = recordOf(webhooks.schedule_order_webhooks) ?? {};
  return {
    ...payload,
    webhooks_config: {
      ...webhooks,
      schedule_order_webhooks: {
        ...scheduled,
        is_enabled: true,
      },
      webhooks_version: '1.0.0',
    },
  };
};

const requireMappedStore = async (
  storeId: string,
  connectionId: string | undefined,
  connections: UberMerchantConnectionRepositoryPort,
  mappings: UberStoreMappingRepositoryPort,
) => {
  const id = storeId.trim();
  const merchantId = connectionId?.trim();
  if (!id || !merchantId)
    throw new UberValidationError({
      code: 'INVALID_REQUEST',
      operation: 'merchant',
      message: 'storeId 和 connectionId 不能为空',
    });
  const connection = await connections.findConnection(merchantId);
  if (!connection)
    throw new UberValidationError({
      code: 'INVALID_REQUEST',
      operation: 'merchant',
      message: '未找到 Uber 商户授权',
    });
  const mapping = await mappings.findMapping(id);
  if (!mapping || mapping.connectionId !== connection.connectionId)
    throw new UberValidationError({
      code: 'STORE_NOT_MAPPED',
      operation: 'merchant',
      message: '当前 Uber 商户授权未绑定该门店',
    });
  return { id, connection, mapping };
};

const requireProvisionedMappedStore = async (
  storeId: string,
  connectionId: string | undefined,
  connections: UberMerchantConnectionRepositoryPort,
  mappings: UberStoreMappingRepositoryPort,
) => {
  const result = await requireMappedStore(
    storeId,
    connectionId,
    connections,
    mappings,
  );
  if (!result.mapping.isProvisioned)
    throw new UberValidationError({
      code: 'STORE_NOT_PROVISIONED',
      operation: 'merchant',
      message: 'Uber 门店尚未 provision，不能执行 Store Management 操作',
    });
  return result;
};

export class ProvisionUberStoreUseCase {
  private readonly logger = new AppLogger(ProvisionUberStoreUseCase.name);
  constructor(
    private readonly api: UberStoreApiPort,
    private readonly connections: UberMerchantConnectionRepositoryPort,
    private readonly mappings: UberStoreMappingRepositoryPort,
  ) {}
  async provisionStore(
    storeId: string,
    payload: Record<string, unknown> = {},
    merchantId?: string,
  ) {
    const id = storeId.trim();
    if (!id)
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: 'storeId 不能为空',
      });
    if (credentials(payload))
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: 'provision payload 不得包含 credential',
      });
    if (!merchantId?.trim())
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: 'connectionId 不能为空',
      });
    const connection = await this.connections.findConnection(merchantId.trim());
    if (!connection)
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: '未找到 Uber 商户授权',
      });
    const selected = await this.mappings.findMapping(id);
    if (!selected || selected.connectionId !== connection.connectionId)
      throw new UberValidationError({
        code: 'STORE_NOT_MAPPED',
        operation: 'merchant',
        message: '请先确认并保存 Uber 门店映射，再执行 provisioning',
      });
    const configuredPayload = withScheduledOrderWebhook(payload);
    const response = await this.api.provisionStore(
      { connectionId: connection.connectionId },
      id,
      configuredPayload,
      buildUberIdempotencyKey({
        taskId: `store-provision:${connection.connectionId}:${id}`,
        resourceId: id,
        action: 'PROVISION_STORE',
        businessVersion: createHash('sha256')
          .update(JSON.stringify(configuredPayload))
          .digest('hex'),
      }),
    );
    const mapping = await this.mappings.upsertMapping({
      connectionId: connection.connectionId,
      uberStoreId: id,
      storeName: response.storeName ?? selected.storeName,
      locationSummary: response.locationSummary ?? selected.locationSummary,
      isProvisioned: true,
      provisionedAt: new Date(),
      posExternalStoreId:
        response.posExternalStoreId ?? selected.posExternalStoreId,
    });
    this.logger.log(`[merchant.provisioning] storeId=${id} outcome=success`);
    return {
      ok: true,
      connectionId: connection.connectionId,
      storeId: id,
      isProvisioned: true,
      provisionedAt: mapping.provisionedAt,
      response: sanitize(response),
    };
  }
}
export class RetrieveUberStoreIntegrationConfigUseCase {
  constructor(
    private readonly api: UberStoreApiPort,
    private readonly connections: UberMerchantConnectionRepositoryPort,
    private readonly mappings: UberStoreMappingRepositoryPort,
  ) {}

  async retrieve(storeId: string, connectionId?: string) {
    const { id } = await requireMappedStore(
      storeId,
      connectionId,
      this.connections,
      this.mappings,
    );
    return this.api.retrieveIntegrationConfig(id);
  }
}

export class UpdateUberStoreIntegrationConfigUseCase {
  private readonly logger = new AppLogger(
    UpdateUberStoreIntegrationConfigUseCase.name,
  );
  constructor(
    private readonly api: UberStoreApiPort,
    private readonly connections: UberMerchantConnectionRepositoryPort,
    private readonly mappings: UberStoreMappingRepositoryPort,
  ) {}

  async update(
    storeId: string,
    payload: Record<string, unknown>,
    connectionId?: string,
  ) {
    const { id } = await requireMappedStore(
      storeId,
      connectionId,
      this.connections,
      this.mappings,
    );
    if (credentials(payload))
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: 'integration config payload 不得包含 credential',
      });
    const configuredPayload = withScheduledOrderWebhook(payload);
    const businessVersion = createHash('sha256')
      .update(JSON.stringify(configuredPayload))
      .digest('hex');
    await this.api.updateIntegrationConfig(
      id,
      configuredPayload,
      buildUberIdempotencyKey({
        taskId: `store-integration-update:${id}`,
        resourceId: id,
        action: 'UPDATE_INTEGRATION_CONFIG',
        businessVersion,
      }),
    );
    this.logger.log(
      `[merchant.integration-config] storeId=${id} operation=update outcome=success`,
    );
    return { ok: true, storeId: id };
  }
}

export class DeprovisionUberStoreUseCase {
  private readonly logger = new AppLogger(DeprovisionUberStoreUseCase.name);
  constructor(
    private readonly api: UberStoreApiPort,
    private readonly connections: UberMerchantConnectionRepositoryPort,
    private readonly mappings: UberStoreMappingRepositoryPort,
  ) {}

  async revokeOrDeprovisionStore(storeId: string, connectionId?: string) {
    const { id, connection, mapping } = await requireMappedStore(
      storeId,
      connectionId,
      this.connections,
      this.mappings,
    );
    const businessVersion = createHash('sha256')
      .update(
        `${connection.connectionId}:${mapping.provisionedAt?.toISOString() ?? 'not-provisioned'}`,
      )
      .digest('hex');
    await this.api.removeIntegration(
      { connectionId: connection.connectionId },
      id,
      buildUberIdempotencyKey({
        taskId: `store-integration-remove:${connection.connectionId}:${id}`,
        resourceId: id,
        action: 'REMOVE_INTEGRATION',
        businessVersion,
      }),
    );
    await this.mappings.upsertMapping({
      ...mapping,
      isProvisioned: false,
      provisionedAt: null,
    });
    this.logger.log(
      `[merchant.integration-config] storeId=${id} operation=remove outcome=success`,
    );
    return { ok: true, storeId: id, isProvisioned: false };
  }
}

export class RetrieveUberStoreStatusUseCase {
  constructor(
    private readonly api: UberStoreApiPort,
    private readonly connections: UberMerchantConnectionRepositoryPort,
    private readonly mappings: UberStoreMappingRepositoryPort,
  ) {}

  async retrieve(storeId: string, connectionId?: string) {
    const { id } = await requireProvisionedMappedStore(
      storeId,
      connectionId,
      this.connections,
      this.mappings,
    );
    return this.api.retrieveStatus(id);
  }
}

export class UpdateUberStorePrepTimeUseCase {
  private readonly logger = new AppLogger(UpdateUberStorePrepTimeUseCase.name);

  constructor(
    private readonly api: UberStoreApiPort,
    private readonly connections: UberMerchantConnectionRepositoryPort,
    private readonly mappings: UberStoreMappingRepositoryPort,
  ) {}

  async update(
    storeId: string,
    defaultPrepTimeSeconds: number,
    connectionId?: string,
  ) {
    const { id } = await requireProvisionedMappedStore(
      storeId,
      connectionId,
      this.connections,
      this.mappings,
    );
    if (
      !Number.isInteger(defaultPrepTimeSeconds) ||
      defaultPrepTimeSeconds < 1 ||
      defaultPrepTimeSeconds > 10_800
    )
      throw new UberValidationError({
        code: 'INVALID_PREP_TIME',
        operation: 'merchant.update-store-prep-time',
        message: 'defaultPrepTimeSeconds 必须是 1 到 10800 的整数秒数',
      });

    const result = await this.api.updatePrepTime(
      id,
      defaultPrepTimeSeconds,
      buildUberIdempotencyKey({
        taskId: `store-prep-time:${id}:${defaultPrepTimeSeconds}`,
        resourceId: id,
        action: 'UPDATE_STORE_PREP_TIME',
        businessVersion: String(defaultPrepTimeSeconds),
      }),
    );
    this.logger.log(
      `[merchant.store-prep-time] storeId=${id} seconds=${defaultPrepTimeSeconds} outcome=success`,
    );
    return result;
  }
}

export class SyncUberStoreStatusUseCase {
  constructor(
    private readonly api: UberStoreApiPort,
    private readonly mappings: UberStoreMappingRepositoryPort,
    private readonly alerts: UberOperationsAlertRepositoryPort,
  ) {}
  async syncStoreStatusToUber(target?: UberStoreStatusTarget) {
    const config = await this.alerts.getStoreStatusSource();
    const pause = this.parsePause(config.temporaryCloseReason);
    const payload: Record<string, string> = target
      ? target.targetStatus === 'PAUSED'
        ? {
            status: 'PAUSED',
            reason: target.reason ?? '运营手动暂停',
            ...(target.pauseUntil ? { pause_until: target.pauseUntil } : {}),
          }
        : { status: 'ONLINE' }
      : config.isTemporarilyClosed
        ? {
            status: 'PAUSED',
            reason: pause.reason,
            ...(pause.pauseUntil ? { pause_until: pause.pauseUntil } : {}),
          }
        : { status: 'ONLINE' };
    const results: Record<string, unknown>[] = [];
    const businessVersion = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    for (const mapping of await this.mappings.listMappings()) {
      if (target && mapping.uberStoreId !== target.uberStoreId) continue;
      const result = !mapping.isProvisioned
        ? {
            uberStoreId: mapping.uberStoreId,
            outcome: 'SKIPPED' as const,
            reason: 'NOT_PROVISIONED' as const,
            attempts: 0,
            error: 'Uber 门店尚未 provision，未发送状态写请求',
          }
        : await this.api.writeStatus(
            mapping.uberStoreId,
            payload,
            buildUberIdempotencyKey({
              taskId: `store-status:${mapping.uberStoreId}:${businessVersion}`,
              resourceId: mapping.uberStoreId,
              action: 'WRITE_STATUS',
              businessVersion,
            }),
          );
      results.push(result);
      await this.alerts.recordStoreStatusResult(result, payload);
      if (result.outcome === 'FAILED')
        await this.alerts.createStoreStatusAlert(
          mapping.uberStoreId,
          result.error,
          result.reason,
          result.retryable,
          payload,
        );
    }
    const succeeded = results.filter((r) => r.outcome === 'SUCCEEDED').length;
    if (results.length === 0)
      return { outcome: 'SKIPPED' as const, reason: 'NO_STORES' as const };
    if (succeeded === results.length)
      return { outcome: 'SUCCEEDED' as const, synchronizedStores: succeeded };
    const failedStores = results.length - succeeded;
    const allSkipped = results.every((result) => result.outcome === 'SKIPPED');
    if (allSkipped)
      return {
        outcome: 'SKIPPED' as const,
        reason: 'NO_PROVISIONED_STORES' as const,
      };
    return {
      outcome: 'FAILED' as const,
      synchronizedStores: succeeded,
      failedStores,
      error: {
        code: 'UPSTREAM_REJECTED' as const,
        message: '一个或多个 Uber 门店状态同步失败',
        retryable: results.some(
          (result) => result.outcome === 'FAILED' && result.retryable,
        ),
      },
    };
  }
  private parsePause(value?: string | null) {
    const prefix = '__AUTO_UNTIL__:';
    if (!value?.startsWith(prefix))
      return { reason: value?.trim() || '门店临时暂停营业', pauseUntil: null };
    const [raw, ...rest] = value.slice(prefix.length).split('|');
    const date = new Date(raw.trim());
    return {
      reason: rest.join('|').trim() || '门店临时暂停营业',
      pauseUntil: Number.isNaN(date.getTime()) ? null : date.toISOString(),
    };
  }
}
