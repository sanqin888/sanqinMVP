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

type IntegrationConfigMutation = 'ACTIVATE' | 'UPDATE';

const INTEGRATION_CONFIG_FIELDS = new Set([
  'allowed_customer_requests',
  'integrator_brand_id',
  'is_order_manager',
  'merchant_store_id',
  'require_manual_acceptance',
  'store_configuration_data',
  'webhooks_config',
  'integration_enabled',
]);
const CUSTOMER_REQUEST_FIELDS = new Set([
  'allow_single_use_items_requests',
  'allow_special_instruction_requests',
]);
const WEBHOOK_CONFIG_FIELDS = new Set([
  'order_release_webhooks',
  'schedule_order_webhooks',
  'delivery_status_webhooks',
  'webhooks_version',
]);
const WEBHOOK_FIELDS = new Set(['is_enabled']);

const invalidIntegrationConfig = (message: string) =>
  new UberValidationError({
    code: 'INVALID_REQUEST',
    operation: 'merchant',
    message,
  });

const INTEGRATOR_STORE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const mappedIntegratorStoreId = (mapping: {
  posExternalStoreId: string | null;
}) => {
  const storeId = mapping.posExternalStoreId?.trim();
  if (!storeId || !INTEGRATOR_STORE_ID_PATTERN.test(storeId))
    throw invalidIntegrationConfig(
      '当前 Uber 门店缺少有效的本地 Store ID 映射；请先配置本地打印房间 Store ID',
    );
  return storeId;
};

const assertKnownFields = (
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
) => {
  const unknownFields = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknownFields.length)
    throw invalidIntegrationConfig(
      `${path} 包含不支持的字段: ${unknownFields.join(', ')}`,
    );
};

const optionalBoolean = (
  value: Record<string, unknown>,
  key: string,
): boolean | undefined => {
  if (!(key in value)) return undefined;
  const candidate = value[key];
  if (typeof candidate !== 'boolean')
    throw invalidIntegrationConfig(`${key} 必须为 boolean`);
  return candidate;
};

const optionalString = (
  value: Record<string, unknown>,
  key: string,
): string | undefined => {
  if (!(key in value)) return undefined;
  const candidate = value[key];
  if (typeof candidate !== 'string' || !candidate.trim())
    throw invalidIntegrationConfig(`${key} 必须为非空 string`);
  return candidate.trim();
};

const normalizedWebhookConfig = (value: unknown): Record<string, unknown> => {
  if (value === undefined) return {};
  const webhooks = recordOf(value);
  if (!webhooks)
    throw invalidIntegrationConfig('webhooks_config 必须为 object');
  assertKnownFields(webhooks, WEBHOOK_CONFIG_FIELDS, 'webhooks_config');

  const normalized: Record<string, unknown> = {};
  for (const key of [
    'order_release_webhooks',
    'schedule_order_webhooks',
    'delivery_status_webhooks',
  ] as const) {
    if (!(key in webhooks)) continue;
    const webhook = recordOf(webhooks[key]);
    if (!webhook)
      throw invalidIntegrationConfig(`webhooks_config.${key} 必须为 object`);
    assertKnownFields(webhook, WEBHOOK_FIELDS, `webhooks_config.${key}`);
    const isEnabled = optionalBoolean(webhook, 'is_enabled');
    if (isEnabled === undefined)
      throw invalidIntegrationConfig(
        `webhooks_config.${key}.is_enabled 不能为空`,
      );
    if (key !== 'schedule_order_webhooks' && isEnabled)
      throw invalidIntegrationConfig(
        `SanQ 当前不支持启用 webhooks_config.${key}`,
      );
    normalized[key] = { is_enabled: isEnabled };
  }
  if ('webhooks_version' in webhooks)
    optionalString(webhooks, 'webhooks_version');
  return normalized;
};

/** SanQ is the order manager, owns scheduled fulfillment, and relays customer requests to POS. */
const withRequiredIntegrationConfig = (
  payload: Record<string, unknown>,
  mutation: IntegrationConfigMutation,
  integratorStoreId: string,
): Record<string, unknown> => {
  assertKnownFields(
    payload,
    INTEGRATION_CONFIG_FIELDS,
    'integration config payload',
  );
  if (mutation === 'ACTIVATE' && 'integration_enabled' in payload)
    throw invalidIntegrationConfig(
      'Activate payload 不得包含 integration_enabled；POST /pos_data 本身即执行激活',
    );

  const configured: Record<string, unknown> = {
    integrator_store_id: integratorStoreId,
  };
  for (const key of [
    'integrator_brand_id',
    'merchant_store_id',
    'store_configuration_data',
  ] as const) {
    const normalized = optionalString(payload, key);
    if (normalized !== undefined) configured[key] = normalized;
  }
  optionalBoolean(payload, 'is_order_manager');
  optionalBoolean(payload, 'require_manual_acceptance');
  if (mutation === 'UPDATE') {
    const enabled = optionalBoolean(payload, 'integration_enabled');
    if (enabled !== undefined) configured.integration_enabled = enabled;
  }

  const customerRequestsValue = payload.allowed_customer_requests;
  if (customerRequestsValue !== undefined) {
    const customerRequests = recordOf(customerRequestsValue);
    if (!customerRequests)
      throw invalidIntegrationConfig('allowed_customer_requests 必须为 object');
    assertKnownFields(
      customerRequests,
      CUSTOMER_REQUEST_FIELDS,
      'allowed_customer_requests',
    );
    optionalBoolean(customerRequests, 'allow_single_use_items_requests');
    optionalBoolean(customerRequests, 'allow_special_instruction_requests');
  }

  const webhooks = normalizedWebhookConfig(payload.webhooks_config);
  return {
    ...configured,
    is_order_manager: true,
    require_manual_acceptance: false,
    allowed_customer_requests: {
      allow_single_use_items_requests: true,
      allow_special_instruction_requests: true,
    },
    webhooks_config: {
      ...webhooks,
      schedule_order_webhooks: { is_enabled: true },
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
    const configuredPayload = withRequiredIntegrationConfig(
      payload,
      'ACTIVATE',
      mappedIntegratorStoreId(selected),
    );
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
    const { id, mapping } = await requireMappedStore(
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
    const configuredPayload = withRequiredIntegrationConfig(
      payload,
      'UPDATE',
      mappedIntegratorStoreId(mapping),
    );
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
