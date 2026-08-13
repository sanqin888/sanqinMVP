import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type { UberMerchantStore } from '../../domain/merchant/uber-merchant.types';
import { summarizeUberDebugResponse } from '../shared/uber-log.utils';
import type {
  UberMerchantApiPort,
  UberOAuthTokenPort,
  UberStoreApiPort,
} from '../../application/merchant/uber-merchant-api.ports';
import {
  UberApiGatewayTransport,
  type UberGatewayTransportPort,
} from './uber-api.gateway';
import { UberAuthService } from './uber-token.provider';
import { UberCryptoConfigService } from '../crypto/uber-crypto-config.service';
import type { UberMerchantIdentity } from '../../application/merchant/uber-merchant-api.ports';
import {
  UBER_MERCHANT_CREDENTIAL_STORE,
  type UberMerchantCredentialStore,
} from './uber-merchant-credential.port';
import { isUberApplicationError } from '../../application/shared/uber-application.error';
import {
  UBER_TELEMETRY_PORT,
  type UberTelemetryPort,
} from '../../application/shared/uber-telemetry.port';
import { mapUberGatewayFailure } from './uber-error.mapper';

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const string = (...values: unknown[]): string | null => {
  for (const value of values)
    if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
};

@Injectable()
export class UberOAuthTokenAdapter implements UberOAuthTokenPort {
  constructor(
    private readonly auth: UberAuthService,
    @Inject(UberCryptoConfigService)
    private readonly config: UberCryptoConfigService,
  ) {}
  getRedirectUri() {
    return this.auth.getMerchantRedirectUri();
  }
  signState(payload: string) {
    return createHmac('sha256', this.config.getOAuthStateSecret())
      .update(payload)
      .digest('hex');
  }
  verifyState(payload: string, signature: string) {
    const expected = Buffer.from(this.signState(payload));
    const received = Buffer.from(signature);
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }
  buildAuthorizeUrl(state: string) {
    return this.auth.buildMerchantAuthorizeUrl(state);
  }
  exchangeAuthorizationCode(code: string, redirectUri: string) {
    return this.auth.exchangeAuthorizationCode(code, redirectUri);
  }
}

/** Merchant gateway: resolves credentials, refreshes them, and translates Uber wire responses. */
@Injectable()
export class UberMerchantApiAdapter
  implements UberMerchantApiPort, UberStoreApiPort
{
  private readonly credentialRequests = new Map<string, Promise<string>>();

  constructor(
    @Inject(UberApiGatewayTransport)
    private readonly transport: UberGatewayTransportPort,
    @Inject(UBER_MERCHANT_CREDENTIAL_STORE)
    private readonly credentials: UberMerchantCredentialStore,
    private readonly auth: UberAuthService,
    @Optional()
    @Inject(UBER_TELEMETRY_PORT)
    private readonly audit?: Pick<UberTelemetryPort, 'captureEvent'>,
  ) {}

  async discoverStores(identity: UberMerchantIdentity) {
    const accessToken = await this.accessTokenFor(identity);
    const raw = await this.request('/v1/eats/stores', 'GET', accessToken);
    await this.audit?.captureEvent('uber.gateway.raw-response', {
      operation: 'merchant.discover-stores',
      merchantUberUserId: identity.merchantUberUserId,
      response: raw,
    });
    const candidates = [raw.stores, raw.data, object(raw.data)?.stores];
    const node = candidates.find(Array.isArray);
    if (!Array.isArray(node))
      throw mapUberGatewayFailure({
        kind: 'mapping',
        code: 'UBER_STORE_DISCOVERY_MAPPING_FAILED',
        operation: 'merchant.discover-stores',
        reason: 'Uber 门店列表响应无法映射',
      });
    const stores: UberMerchantStore[] = node
      .map(object)
      .filter((v): v is Record<string, unknown> => !!v)
      .map((store) => {
        const location = object(store.location) ?? object(store.address);
        const pos = object(store.pos_data);
        return {
          storeId: string(store.store_id, store.id, store.uuid) ?? 'unknown',
          storeName: string(store.name, store.store_name),
          locationSummary: string(
            store.location_summary,
            location?.formatted_address,
            [location?.address_line_one, location?.city, location?.country]
              .filter((x): x is string => typeof x === 'string' && !!x.trim())
              .join(', '),
          ),
          integrationEnabled: pos?.integration_enabled === true,
          posExternalStoreId: string(
            pos?.order_manager_client_id,
            pos?.pos_external_store_id,
            store.pos_external_store_id,
          ),
          timezone: string(
            store.timezone,
            store.time_zone,
            location?.timezone,
            location?.time_zone,
          ),
        };
      });
    return { stores };
  }

  async provisionStore(
    identity: UberMerchantIdentity,
    storeId: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ) {
    const accessToken = await this.accessTokenFor(identity);
    const raw = await this.request(
      `/v1/eats/stores/${encodeURIComponent(storeId)}/pos_data`,
      'POST',
      accessToken,
      payload,
      idempotencyKey,
    );
    await this.audit?.captureEvent('uber.gateway.raw-response', {
      operation: 'merchant.provision-store',
      merchantUberUserId: identity.merchantUberUserId,
      storeId,
      response: raw,
    });
    const store = object(raw.store);
    const location = object(raw.location) ?? object(raw.address);
    const mappedStoreId = string(raw.store_id, store?.id, store?.store_id);
    if (!mappedStoreId)
      throw mapUberGatewayFailure({
        kind: 'mapping',
        code: 'UBER_STORE_PROVISION_MAPPING_FAILED',
        operation: 'merchant.provision-store',
        reason: 'Uber 门店配置响应无法映射',
      });
    return {
      storeId: mappedStoreId,
      status: string(raw.status),
      storeName: string(store?.name, raw.store_name),
      locationSummary: string(
        raw.location_summary,
        location?.formatted_address,
      ),
      posExternalStoreId: string(
        raw.pos_external_store_id,
        object(raw.pos_data)?.order_manager_client_id,
      ),
    };
  }

  async writeStatus(
    storeId: string,
    payload: Record<string, string>,
    idempotencyKey: string,
  ) {
    const maxAttempts = 3;
    let status: number | null = null;
    let error = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.transport.inspect<Record<string, unknown>>({
          path: `/v1/eats/stores/${encodeURIComponent(storeId)}/status`,
          method: 'POST',
          operation: 'uber.store.status',
          scope: 'eats.store.status.write',
          partitionKey: storeId,
          json: payload,
          idempotencyKey,
        });
        status = result.response.status;
        await this.audit?.captureEvent('uber.gateway.store-status-response', {
          operation: 'merchant.write-store-status',
          storeId,
          httpStatus: status,
          attempt,
        });
        if (result.response.ok || status === 409)
          return {
            uberStoreId: storeId,
            outcome: 'SUCCEEDED' as const,
            attempts: attempt,
            duplicate: status === 409,
          };
        error = summarizeUberDebugResponse(result.data, result.text);
        if (status !== 429 && status < 500)
          return {
            uberStoreId: storeId,
            outcome: 'FAILED' as const,
            reason: 'UPSTREAM_REJECTED' as const,
            retryable: false,
            attempts: attempt,
            error,
          };
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      }
      if (attempt < maxAttempts)
        await new Promise((resolve) =>
          setTimeout(resolve, 25 * 2 ** (attempt - 1)),
        );
    }
    return {
      uberStoreId: storeId,
      outcome: 'FAILED' as const,
      reason: 'UPSTREAM_UNAVAILABLE' as const,
      retryable: true,
      attempts: maxAttempts,
      error: error || 'Uber 门店状态写入失败',
    };
  }

  private async accessTokenFor(
    identity: UberMerchantIdentity,
  ): Promise<string> {
    const id = identity.merchantUberUserId.trim();
    const inflight = this.credentialRequests.get(id);
    if (inflight) return inflight;
    const request = this.loadAndRefresh(id).finally(() =>
      this.credentialRequests.delete(id),
    );
    this.credentialRequests.set(id, request);
    return request;
  }

  private async loadAndRefresh(id: string): Promise<string> {
    let credential = await this.credentials.loadCredential(id);
    if (!credential) throw new Error('未找到 Uber 商户凭据');
    if (
      !credential.expiresAt ||
      credential.expiresAt.getTime() > Date.now() + 60_000
    )
      return credential.accessToken;
    if (!credential.refreshToken) throw new Error('Uber 商户凭据已过期');
    const fresh = await this.auth.refreshMerchantAccessToken(
      credential.refreshToken,
      credential.scope ?? undefined,
    );
    const rotated = await this.credentials.rotateCredential({
      merchantUberUserId: id,
      expectedVersion: credential.version,
      ...fresh,
    });
    if (rotated) return fresh.accessToken;
    credential = await this.credentials.loadCredential(id);
    if (!credential) throw new Error('未找到 Uber 商户凭据');
    return credential.accessToken;
  }

  private async request(
    path: string,
    method: 'GET' | 'POST',
    accessToken: string,
    json?: Record<string, unknown>,
    idempotencyKey?: string,
  ) {
    try {
      const common = {
        path,
        operation: `${method} ${path}`,
        scope: 'eats.store',
        accessToken,
        json,
      };
      return await this.transport.request<Record<string, unknown>>(
        method === 'POST'
          ? { ...common, method, idempotencyKey: idempotencyKey! }
          : { ...common, method },
      );
    } catch (caught) {
      if (isUberApplicationError(caught)) throw caught;
      throw mapUberGatewayFailure({
        kind: 'transport',
        operation: `${method} ${path}`,
        code: 'UBER_NETWORK_ERROR',
        cause: caught,
      });
    }
  }
}
