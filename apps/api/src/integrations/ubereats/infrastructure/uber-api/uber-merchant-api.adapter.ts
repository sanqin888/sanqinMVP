import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type { UberMerchantStore } from '../../domain/merchant/uber-merchant.types';
import { summarizeUberDebugResponse } from '../../domain/shared/uber-integration.utils';
import type {
  UberMerchantApiPort,
  UberOAuthTokenPort,
  UberStoreApiPort,
} from '../../application/ports/uber-api.ports';
import {
  UberApiGatewayTransport,
  type UberGatewayTransportPort,
} from './uber-api.gateway';
import { UberAuthService } from './uber-token.provider';
import { UberCryptoConfigService } from '../crypto/uber-crypto-config.service';
import {
  isUberApplicationError,
  UberTransientUpstreamError,
} from '../../application/errors/uber-application.error';

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
  refreshAccessToken(refreshToken: string, scope?: string) {
    return this.auth.refreshMerchantAccessToken(refreshToken, scope);
  }
}

/** Stateless adapter: only builds Uber requests and translates wire responses. */
@Injectable()
export class UberMerchantApiAdapter
  implements UberMerchantApiPort, UberStoreApiPort
{
  constructor(
    @Inject(UberApiGatewayTransport)
    private readonly transport: UberGatewayTransportPort,
  ) {}

  async discoverStores(accessToken: string) {
    const raw = await this.request('/v1/eats/stores', 'GET', accessToken);
    const candidates = [raw.stores, raw.data, object(raw.data)?.stores];
    const node = candidates.find(Array.isArray);
    const stores: UberMerchantStore[] = !Array.isArray(node)
      ? []
      : node
          .map(object)
          .filter((v): v is Record<string, unknown> => !!v)
          .map((store) => {
            const location = object(store.location) ?? object(store.address);
            const pos = object(store.pos_data);
            return {
              storeId:
                string(store.store_id, store.id, store.uuid) ?? 'unknown',
              storeName: string(store.name, store.store_name),
              locationSummary: string(
                store.location_summary,
                location?.formatted_address,
                [location?.address_line_one, location?.city, location?.country]
                  .filter(
                    (x): x is string => typeof x === 'string' && !!x.trim(),
                  )
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
              raw: store,
            };
          });
    return { stores, raw };
  }

  provisionStore(
    accessToken: string,
    storeId: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ) {
    return this.request(
      `/v1/eats/stores/${encodeURIComponent(storeId)}/pos_data`,
      'POST',
      accessToken,
      payload,
      idempotencyKey,
    );
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
        if (result.response.ok || status === 409)
          return {
            uberStoreId: storeId,
            ok: true,
            status,
            attempts: attempt,
            duplicate: status === 409,
          };
        error = summarizeUberDebugResponse(result.data, result.text);
        if (status !== 429 && status < 500)
          return {
            uberStoreId: storeId,
            ok: false,
            status,
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
      ok: false,
      status,
      attempts: maxAttempts,
      error: error || 'Uber 门店状态写入失败',
    };
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
      throw new UberTransientUpstreamError({
        code: 'UBER_NETWORK_ERROR',
        message: 'Uber API 暂时不可用',
        operation: `${method} ${path}`,
        upstreamStatus: null,
        cause: caught,
      });
    }
  }
}
