<<<<<<< HEAD
import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { summarizeUberDebugResponse } from '../shared/uber-log.utils';
=======
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type { UberAuthenticationError } from '../../domain/menu/uber-menu.types';
import type { UberMerchantStore } from '../../domain/merchant/uber-merchant.types';
import { summarizeUberDebugResponse } from '../../domain/shared/uber-integration.utils';
>>>>>>> origin/main
import type {
  UberMerchantApiPort,
  UberOAuthTokenPort,
  UberStoreApiPort,
<<<<<<< HEAD
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
  UBER_GATEWAY_AUDIT_PORT,
  type UberGatewayAuditEvent,
  type UberGatewayAuditJsonValue,
  type UberGatewayAuditPort,
} from '../../application/shared/uber-gateway-audit.port';
import { mapUberGatewayFailure } from './uber-error.mapper';
import {
  mapUberStoreDiscoveryWire,
  mapUberStoreProvisionWire,
} from './uber-store-wire.mapper';

const SENSITIVE_AUDIT_KEY =
  /(token|authorization|signature|secret|password|cookie|phone|address)/i;
const sanitizeForAudit = (value: unknown): UberGatewayAuditJsonValue => {
  if (value === null || ['string', 'boolean'].includes(typeof value))
    return value as null | string | boolean;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(sanitizeForAudit);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        SENSITIVE_AUDIT_KEY.test(key) ? '[REDACTED]' : sanitizeForAudit(child),
      ]),
    );
  return '[UNSUPPORTED]';
=======
} from '../../application/ports/uber-api.ports';
import { UberApiGatewayTransport } from './uber-api.gateway';
import { UberAuthService } from './uber-token.provider';
import { UberConfigService } from '../config/uber-config.service';

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const string = (...values: unknown[]): string | null => {
  for (const value of values)
    if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
>>>>>>> origin/main
};

@Injectable()
export class UberOAuthTokenAdapter implements UberOAuthTokenPort {
  constructor(
    private readonly auth: UberAuthService,
<<<<<<< HEAD
    @Inject(UberCryptoConfigService)
    private readonly config: UberCryptoConfigService,
=======
    @Inject(UberConfigService) private readonly config: UberConfigService,
>>>>>>> origin/main
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
<<<<<<< HEAD
}

/** Merchant gateway: resolves credentials, refreshes them, and translates Uber wire responses. */
=======
  refreshAccessToken(refreshToken: string, scope?: string) {
    return this.auth.refreshMerchantAccessToken(refreshToken, scope);
  }
}

/** Stateless adapter: only builds Uber requests and translates wire responses. */
>>>>>>> origin/main
@Injectable()
export class UberMerchantApiAdapter
  implements UberMerchantApiPort, UberStoreApiPort
{
<<<<<<< HEAD
  private readonly credentialRequests = new Map<string, Promise<string>>();

  constructor(
    @Inject(UberApiGatewayTransport)
    private readonly transport: UberGatewayTransportPort,
    @Inject(UBER_MERCHANT_CREDENTIAL_STORE)
    private readonly credentials: UberMerchantCredentialStore,
    private readonly auth: UberAuthService,
    @Inject(UBER_GATEWAY_AUDIT_PORT)
    private readonly audit: UberGatewayAuditPort,
  ) {}

  async discoverStores(identity: UberMerchantIdentity) {
    const accessToken = await this.accessTokenFor(identity);
    const raw = await this.request('/v1/eats/stores', 'GET', accessToken);
    await this.auditResponse({
      operation: 'merchant.discover-stores',
      merchantUberUserId: identity.merchantUberUserId,
      outcome: 'RECEIVED',
      upstreamStatus: null,
      sanitizedRawResponse: sanitizeForAudit(raw),
      recordedAt: new Date(),
    });
    return mapUberStoreDiscoveryWire(raw);
  }

  async provisionStore(
    identity: UberMerchantIdentity,
=======
  constructor(private readonly transport: UberApiGatewayTransport) {}

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
>>>>>>> origin/main
    storeId: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ) {
<<<<<<< HEAD
    const accessToken = await this.accessTokenFor(identity);
    const raw = await this.request(
=======
    return this.request(
>>>>>>> origin/main
      `/v1/eats/stores/${encodeURIComponent(storeId)}/pos_data`,
      'POST',
      accessToken,
      payload,
      idempotencyKey,
    );
<<<<<<< HEAD
    await this.auditResponse({
      operation: 'merchant.provision-store',
      merchantUberUserId: identity.merchantUberUserId,
      storeId,
      outcome: 'RECEIVED',
      upstreamStatus: null,
      sanitizedRawResponse: sanitizeForAudit(raw),
      recordedAt: new Date(),
    });
    return mapUberStoreProvisionWire(raw);
=======
>>>>>>> origin/main
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
<<<<<<< HEAD
        await this.auditResponse({
          operation: 'merchant.write-store-status',
          storeId,
          outcome: result.response.ok
            ? 'SUCCEEDED'
            : status === 409
              ? 'REJECTED'
              : 'FAILED',
          upstreamStatus: status,
          sanitizedRawResponse: sanitizeForAudit(result.data),
          recordedAt: new Date(),
        });
        if (result.response.ok || status === 409)
          return {
            uberStoreId: storeId,
            outcome: 'SUCCEEDED' as const,
=======
        if (result.response.ok || status === 409)
          return {
            uberStoreId: storeId,
            ok: true,
            status,
>>>>>>> origin/main
            attempts: attempt,
            duplicate: status === 409,
          };
        error = summarizeUberDebugResponse(result.data, result.text);
        if (status !== 429 && status < 500)
          return {
            uberStoreId: storeId,
<<<<<<< HEAD
            outcome: 'FAILED' as const,
            reason: 'UPSTREAM_REJECTED' as const,
            retryable: false,
=======
            ok: false,
            status,
>>>>>>> origin/main
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
<<<<<<< HEAD
      outcome: 'FAILED' as const,
      reason: 'UPSTREAM_UNAVAILABLE' as const,
      retryable: true,
=======
      ok: false,
      status,
>>>>>>> origin/main
      attempts: maxAttempts,
      error: error || 'Uber 门店状态写入失败',
    };
  }

<<<<<<< HEAD
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

=======
>>>>>>> origin/main
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
<<<<<<< HEAD
      if (isUberApplicationError(caught)) throw caught;
      throw mapUberGatewayFailure({
        kind: 'transport',
        operation: `${method} ${path}`,
        code: 'UBER_NETWORK_ERROR',
        cause: caught,
      });
    }
  }

  /** Audit persistence must never change the merchant operation's outcome. */
  private async auditResponse(event: UberGatewayAuditEvent): Promise<void> {
    try {
      await this.audit.recordResponse(event);
    } catch {
      // Deliberately best-effort: gateway availability takes precedence over audit storage.
=======
      if (caught instanceof BadRequestException) throw caught;
      const error: UberAuthenticationError = {
        upstreamStatus: 502,
        code: 'UBER_API_ERROR',
        message:
          caught instanceof Error
            ? caught.message.slice(0, 500)
            : 'Uber request failed',
      };
      throw new BadRequestException({ ok: false, status: 502, error });
>>>>>>> origin/main
    }
  }
}
