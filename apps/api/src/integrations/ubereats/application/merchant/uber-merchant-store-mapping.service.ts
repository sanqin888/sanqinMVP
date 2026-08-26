import { UberValidationError } from '../shared/uber-application.error';
import { AppLogger } from '../../../../common/app-logger';
import { type UberMerchantApiPort } from '../merchant/uber-merchant-api.ports';
import {
  type UberMerchantConnectionRepositoryPort,
  type UberStoreMappingRepositoryPort,
} from './uber-merchant-persistence.ports';

const POS_EXTERNAL_STORE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export class DiscoverUberStoresUseCase {
  constructor(
    private readonly api: UberMerchantApiPort,
    private readonly connections: UberMerchantConnectionRepositoryPort,
    private readonly mappings: UberStoreMappingRepositoryPort,
  ) {}
  async getMerchantStores() {
    const connection = await this.resolve();
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
      count: uniqueStores.length,
      stores: uniqueStores.map((s) => ({
        ...s,
        isMapped: byId.get(s.storeId)?.connectionId === connection.connectionId,
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
  private async resolve() {
    const row = await this.connections.findConnection();
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
    storeId: string;
    storeName?: string | null;
    locationSummary?: string | null;
  }) {
    const storeId = input.storeId.trim();
    if (!storeId)
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: '门店 ID 不能为空',
      });
    const connection = await this.connections.findConnection();
    if (!connection)
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: '未找到 Uber 商户授权',
      });
    const connectionId = connection.connectionId;
    const discovery = await this.api.discoverStores({ connectionId });
    const discoveredStore = discovery.stores.find(
      (store) => store.storeId === storeId,
    );
    if (!discoveredStore)
      throw new UberValidationError({
        code: 'STORE_NOT_AUTHORIZED',
        operation: 'merchant',
        message: '当前 merchant connection 未授权该 Uber 门店',
      });
    const discoveredStoreId = discoveredStore.posExternalStoreId?.trim();
    const recoveredStoreId =
      discoveredStoreId && POS_EXTERNAL_STORE_ID_PATTERN.test(discoveredStoreId)
        ? discoveredStoreId
        : null;
    const existing = await this.mappings.findMapping(storeId);
    if (existing && existing.connectionId !== connectionId) {
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
      posExternalStoreId: existing?.posExternalStoreId ?? recoveredStoreId,
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
    if (!id || !POS_EXTERNAL_STORE_ID_PATTERN.test(pos))
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
