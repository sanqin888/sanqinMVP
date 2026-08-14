import { UberValidationError } from '../shared/uber-application.error';
import { AppLogger } from '../../../../common/app-logger';
import { type UberMerchantApiPort } from '../merchant/uber-merchant-api.ports';
import {
  type UberMerchantConnectionRepositoryPort,
  type UberStoreMappingRepositoryPort,
} from './uber-merchant-persistence.ports';

export class DiscoverUberStoresUseCase {
  constructor(
    private readonly api: UberMerchantApiPort,
    private readonly connections: UberMerchantConnectionRepositoryPort,
    private readonly mappings: UberStoreMappingRepositoryPort,
  ) {}
  async getMerchantStores(id?: string) {
    const connection = await this.resolve(id);
    const { stores } = await this.api.discoverStores({
      connectionId: connection.connectionId,
    });
    const uniqueStores = Array.from(
      new Map(stores.map((store) => [store.storeId, store])).values(),
    );
    const existing = await this.mappings.findMappings(
      uniqueStores.map((s) => s.storeId),
    );
    const byId = new Map(existing.map((m) => [m.uberStoreId, m]));
    return {
      ok: true,
      connectionId: connection.connectionId,
      count: uniqueStores.length,
      stores: uniqueStores.map((s) => ({
        ...s,
        isMapped: byId.get(s.storeId)?.connectionId === connection.connectionId,
        mappedConnectionId: byId.get(s.storeId)?.connectionId ?? null,
        requiresReconnect:
          Boolean(byId.get(s.storeId)) &&
          byId.get(s.storeId)?.connectionId !== connection.connectionId,
        isProvisioned:
          byId.get(s.storeId)?.isProvisioned ?? s.integrationEnabled,
        provisionedAt:
          byId.get(s.storeId)?.provisionedAt ??
          (s.integrationEnabled ? new Date() : null),
        posExternalStoreId:
          byId.get(s.storeId)?.posExternalStoreId ?? s.posExternalStoreId,
      })),
    };
  }
  private async resolve(id?: string) {
    if (!id?.trim())
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: 'connectionId 不能为空',
      });
    const row = await this.connections.findConnection(id.trim());
    if (!row)
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: '未找到 Uber 商户授权',
      });
    return row;
  }
}

export class MapUberStoreUseCase {
  private readonly logger = new AppLogger(MapUberStoreUseCase.name);
  constructor(
    private readonly mappings: UberStoreMappingRepositoryPort,
    private readonly api: UberMerchantApiPort,
    private readonly connections: UberMerchantConnectionRepositoryPort,
  ) {}
  async selectStore(input: {
    connectionId: string;
    storeId: string;
    storeName?: string | null;
    locationSummary?: string | null;
    reconnectFromConnectionId?: string;
  }) {
    const connectionId = input.connectionId.trim();
    const storeId = input.storeId.trim();
    if (!connectionId || !storeId)
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: '连接和门店 ID 不能为空',
      });
    const connection = await this.connections.findConnection(connectionId);
    if (!connection)
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: '未找到 Uber 商户授权',
      });
    const discovery = await this.api.discoverStores({ connectionId });
    if (!discovery.stores.some((store) => store.storeId === storeId))
      throw new UberValidationError({
        code: 'STORE_NOT_AUTHORIZED',
        operation: 'merchant',
        message: '当前 merchant connection 未授权该 Uber 门店',
      });
    const existing = await this.mappings.findMapping(storeId);
    if (existing && existing.connectionId !== connectionId) {
      if (input.reconnectFromConnectionId?.trim() !== existing.connectionId)
        throw new UberValidationError({
          code: 'STORE_ALREADY_MAPPED',
          operation: 'merchant',
          message:
            '该 Uber 门店已绑定到其他授权连接；重新授权需要明确确认原 connectionId',
        });
      const reconnected = await this.mappings.reconnectMapping({
        uberStoreId: storeId,
        fromConnectionId: existing.connectionId,
        toConnectionId: connectionId,
        storeName: input.storeName?.trim() || existing.storeName,
        locationSummary:
          input.locationSummary?.trim() || existing.locationSummary,
      });
      if (!reconnected)
        throw new UberValidationError({
          code: 'STORE_RECONNECT_CONFLICT',
          operation: 'merchant',
          message: '门店连接已发生变化，请刷新后重试',
        });
      this.logger.log(
        `[merchant.store-mapping] storeId=${storeId} outcome=reconnected`,
      );
      return { ok: true, mapping: reconnected };
    }
    const mapping = await this.mappings.upsertMapping({
      connectionId,
      uberStoreId: storeId,
      storeName: input.storeName?.trim() || existing?.storeName || null,
      locationSummary:
        input.locationSummary?.trim() || existing?.locationSummary || null,
      isProvisioned: existing?.isProvisioned ?? false,
      provisionedAt: existing?.provisionedAt ?? null,
      posExternalStoreId: existing?.posExternalStoreId ?? null,
    });
    this.logger.log(
      `[merchant.store-mapping] storeId=${storeId} outcome=selected`,
    );
    return { ok: true, mapping };
  }
  async updatePosExternalStoreId(
    uberStoreId: string,
    posExternalStoreId: string,
  ) {
    const id = uberStoreId.trim(),
      pos = posExternalStoreId.trim();
    if (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(pos))
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: '门店 ID 非法',
      });
    const mapping = await this.mappings.updatePosExternalStoreId(id, pos);
    if (!mapping)
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: 'Uber 门店映射不存在',
      });
    return {
      ok: true,
      storeId: id,
      posExternalStoreId: mapping.posExternalStoreId,
    };
  }
}
