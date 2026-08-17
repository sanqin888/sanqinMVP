import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
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
    @Inject(UBER_GATEWAY_AUDIT_PORT)
    private readonly audit: UberGatewayAuditPort,
  ) {}

  async discoverStores(identity: UberMerchantIdentity) {
    const accessToken = await this.accessTokenFor(identity);
    const raw = await this.request('/v1/eats/stores', 'GET', accessToken);
    await this.auditResponse({
      operation: 'merchant.discover-stores',
      connectionId: identity.connectionId,
      outcome: 'RECEIVED',
      upstreamStatus: null,
      sanitizedRawResponse: sanitizeForAudit(raw),
      recordedAt: new Date(),
    });
    return mapUberStoreDiscoveryWire(raw);
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
    await this.auditResponse({
      operation: 'merchant.provision-store',
      connectionId: identity.connectionId,
      storeId,
      outcome: 'RECEIVED',
      upstreamStatus: null,
      sanitizedRawResponse: sanitizeForAudit(raw),
      recordedAt: new Date(),
    });
    return mapUberStoreProvisionWire(raw, storeId);
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
          path: `/v1/eats/store/${encodeURIComponent(storeId)}/status`,
          method: 'POST',
          operation: 'uber.store.status',
          scope: 'eats.store.status.write',
          partitionKey: storeId,
          json: payload,
          idempotencyKey,
        });
        status = result.response.status;
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
    const id = identity.connectionId.trim();
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
      connectionId: id,
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

  /** Audit persistence must never change the merchant operation's outcome. */
  private async auditResponse(event: UberGatewayAuditEvent): Promise<void> {
    try {
      await this.audit.recordResponse(event);
    } catch {
      // Deliberately best-effort: gateway availability takes precedence over audit storage.
    }
  }
}
