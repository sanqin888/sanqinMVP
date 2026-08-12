import { UberValidationError } from '../errors/uber-application.error';
import {
  type UberMerchantApiPort,
  type UberOAuthTokenPort,
} from '../ports/uber-api.ports';
import {
  type UberMerchantConnectionRepositoryPort,
  type UberStoreMappingRepositoryPort,
} from './uber-merchant-persistence.ports';

export class DiscoverUberStoresUseCase {
  constructor(
    private readonly api: UberMerchantApiPort,
    private readonly tokens: UberOAuthTokenPort,
    private readonly connections: UberMerchantConnectionRepositoryPort,
    private readonly mappings: UberStoreMappingRepositoryPort,
  ) {}
  async getMerchantStores(id?: string) {
    const connection = await this.resolve(id);
    const { stores, raw } = await this.api.discoverStores(
      connection.accessToken,
    );
    const existing = await this.mappings.findMappings(
      connection.merchantUberUserId,
      stores.map((s) => s.storeId),
    );
    const byId = new Map(existing.map((m) => [m.uberStoreId, m]));
    await this.connections.saveStoresSnapshot(
      connection.merchantUberUserId,
      raw,
    );
    await Promise.all(
      stores.map((s) =>
        this.mappings.saveDiscovery({
          merchantUberUserId: connection.merchantUberUserId,
          uberStoreId: s.storeId,
          storeName: s.storeName,
          locationSummary: s.locationSummary,
          isProvisioned: s.integrationEnabled,
          provisionedAt: s.integrationEnabled ? new Date() : null,
          posExternalStoreId: s.posExternalStoreId,
          rawPayload: s.raw,
        }),
      ),
    );
    return {
      ok: true,
      merchantUberUserId: connection.merchantUberUserId,
      count: stores.length,
      stores: stores.map((s) => ({
        ...s,
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
        message: 'merchantUberUserId 不能为空',
      });
    let row = await this.connections.findConnection(id.trim());
    if (!row)
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: '未找到 Uber 商户授权',
      });
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now() + 60_000) {
      if (!row.refreshToken)
        throw new UberValidationError({
          code: 'INVALID_REQUEST',
          operation: 'merchant',
          message: 'Uber 商户凭据已过期',
        });
      const fresh = await this.tokens.refreshAccessToken(
        row.refreshToken,
        row.scope ?? undefined,
      );
      await this.connections.upsertConnectionByUberUserId({
        ...row,
        ...fresh,
        uberUserId: row.merchantUberUserId,
      });
      row = { ...row, ...fresh };
    }
    return row;
  }
}

export class MapUberStoreUseCase {
  constructor(private readonly mappings: UberStoreMappingRepositoryPort) {}
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
