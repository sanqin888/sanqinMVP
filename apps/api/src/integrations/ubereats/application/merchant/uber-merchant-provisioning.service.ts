import { UberValidationError } from '../shared/uber-application.error';
import { type UberStoreApiPort } from '../merchant/uber-merchant-api.ports';
import { createHash } from 'crypto';
import { buildUberIdempotencyKey } from '../orders/uber-idempotency-key';
import {
  type UberMerchantConnectionRepositoryPort,
  type UberStoreMappingRepositoryPort,
} from './uber-merchant-persistence.ports';
import type { UberOperationsAlertRepositoryPort } from '../operations/uber-operations-alert.ports';

export type UberStoreStatusTarget = {
  uberStoreId: string;
  targetStatus: 'ONLINE' | 'PAUSED';
  reason?: string;
  pauseUntil?: string;
};
const object = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
const text = (...vs: unknown[]) => {
  for (const v of vs) if (typeof v === 'string' && v.trim()) return v.trim();
  return null;
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

export class ProvisionUberStoreUseCase {
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
        message: 'merchantUberUserId 不能为空',
      });
    const connection = await this.connections.findConnection(merchantId.trim());
    if (!connection)
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: '未找到 Uber 商户授权',
      });
    const response = await this.api.provisionStore(
      connection.accessToken,
      id,
      payload,
      buildUberIdempotencyKey({
        taskId: `store-provision:${connection.merchantUberUserId}:${id}`,
        resourceId: id,
        action: 'PROVISION_STORE',
        businessVersion: createHash('sha256')
          .update(JSON.stringify(payload))
          .digest('hex'),
      }),
    );
    const store = object(response.store);
    const location = object(response.location) ?? object(response.address);
    const mapping = await this.mappings.upsertMapping({
      merchantUberUserId: connection.merchantUberUserId,
      uberStoreId: id,
      storeName: text(store?.name, response.store_name),
      locationSummary: text(
        response.location_summary,
        location?.formatted_address,
      ),
      isProvisioned: true,
      provisionedAt: new Date(),
      posExternalStoreId: text(response.pos_external_store_id),
      rawPayload: response,
    });
    return {
      ok: true,
      merchantUberUserId: connection.merchantUberUserId,
      storeId: id,
      isProvisioned: true,
      provisionedAt: mapping.provisionedAt,
      response: sanitize(response),
    };
  }
}
export class DeprovisionUberStoreUseCase {
  revokeOrDeprovisionStore() {
    throw new UberValidationError({
      code: 'NOT_IMPLEMENTED',
      operation: 'merchant',
      message: 'deprovision MVP 暂未实现',
    });
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
            ok: false,
            skipped: true,
            status: 422,
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
      if (
        !result.ok &&
        typeof result.status === 'number' &&
        result.status >= 400 &&
        result.status < 500
      )
        await this.alerts.createStoreStatusAlert(
          mapping.uberStoreId,
          typeof result.error === 'string'
            ? result.error
            : 'Uber 门店状态写入被拒绝',
          result.status,
          payload,
        );
    }
    const succeeded = results.filter((r) => r.ok).length;
    return {
      ok: results.length > 0 && succeeded === results.length,
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
      payload,
      results,
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
