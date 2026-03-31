//apps/api/src/integrations/ubereats/uber-auth.service.ts
import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../common/app-logger';

type UberTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  refresh_token?: string;
  scope?: string;
};

type CachedToken = {
  accessToken: string;
  expiresAt: number;
};

export type UberMerchantTokenExchangeResult = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
  tokenType: string | null;
  raw: UberTokenResponse;
};

@Injectable()
export class UberAuthService {
  private readonly logger = new AppLogger(UberAuthService.name);

  private readonly clientId = process.env.UBER_EATS_CLIENT_ID?.trim() || '';
  private readonly clientSecret =
    process.env.UBER_EATS_CLIENT_SECRET?.trim() || '';

  private readonly tokenEndpoint =
    process.env.UBER_EATS_TOKEN_ENDPOINT?.trim() ||
    'https://auth.uber.com/oauth/v2/token';

  private readonly authorizeEndpoint =
    process.env.UBER_EATS_AUTHORIZE_ENDPOINT?.trim() ||
    'https://auth.uber.com/oauth/v2/authorize';

  private readonly defaultAppScopes =
    process.env.UBER_EATS_APP_SCOPES?.trim() ||
    process.env.UBER_EATS_SCOPES?.trim() ||
    'eats.store eats.order';

  private readonly defaultMerchantScopes =
    process.env.UBER_EATS_USER_AUTH_SCOPES?.trim() || 'eats.pos_provisioning';

  private readonly redirectUri =
    process.env.UBER_EATS_REDIRECT_URI?.trim() || '';

  private readonly accessTokenSkewMs = 60_000;

  private readonly tokenCache = new Map<string, CachedToken>();
  private readonly inflightTokenRequests = new Map<
    string,
    Promise<CachedToken>
  >();

  private resolveOAuthClientCredentials(): {
    clientId: string;
    clientSecret: string;
  } {
    const clientId = this.clientId;
    const clientSecret = this.clientSecret;

    if (!clientId) {
      throw new Error('UBER_EATS_CLIENT_ID 未配置');
    }

    if (!clientSecret) {
      throw new Error('UBER_EATS_CLIENT_SECRET 未配置');
    }

    return { clientId, clientSecret };
  }

  private normalizeScopes(scope?: string): string {
    const deduped = this.normalizeScopesToArray(scope);

    if (!deduped.length) {
      throw new Error('Uber app scopes 不能为空');
    }

    return deduped.join(' ');
  }

  getDefaultAppScopes(): string[] {
    return Array.from(
      new Set(
        (this.defaultAppScopes || '')
          .split(/\s+/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
  }

  normalizeScopesToArray(scope?: string): string[] {
    const source = (scope?.trim() ? scope : this.defaultAppScopes || '').trim();

    return Array.from(
      new Set(
        source
          .split(/\s+/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
  }

  private normalizeMerchantScopes(scope?: string): string {
    const source = (scope || this.defaultMerchantScopes || '').trim();

    const deduped = Array.from(
      new Set(
        source
          .split(/\s+/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );

    if (!deduped.length) {
      throw new Error('Uber merchant scopes 不能为空');
    }

    return deduped.join(' ');
  }

  private resolveMerchantRedirectUri(override?: string): string {
    const redirectUri = (override || this.redirectUri || '').trim();

    if (!redirectUri) {
      throw new Error('UBER_EATS_REDIRECT_URI 未配置');
    }

    return redirectUri;
  }

  private isTokenUsable(entry?: CachedToken | null): entry is CachedToken {
    return !!entry && Date.now() + this.accessTokenSkewMs < entry.expiresAt;
  }

  async getAccessToken(scope?: string): Promise<string> {
    const normalizedScope = this.normalizeScopes(scope);

    const cached = this.tokenCache.get(normalizedScope);
    if (this.isTokenUsable(cached)) {
      return cached.accessToken;
    }

    const inflight = this.inflightTokenRequests.get(normalizedScope);
    if (inflight) {
      const shared = await inflight;
      return shared.accessToken;
    }

    const request = this.requestAccessToken(normalizedScope)
      .then((result) => {
        this.tokenCache.set(normalizedScope, result);
        return result;
      })
      .finally(() => {
        this.inflightTokenRequests.delete(normalizedScope);
      });

    this.inflightTokenRequests.set(normalizedScope, request);

    const resolved = await request;
    return resolved.accessToken;
  }

  async forceRefreshAccessToken(scope?: string): Promise<string> {
    const normalizedScope = this.normalizeScopes(scope);
    this.tokenCache.delete(normalizedScope);

    const fresh = await this.requestAccessToken(normalizedScope);
    this.tokenCache.set(normalizedScope, fresh);

    return fresh.accessToken;
  }

  clearAccessTokenCache(scope?: string): void {
    if (scope?.trim()) {
      this.tokenCache.delete(this.normalizeScopes(scope));
      this.inflightTokenRequests.delete(this.normalizeScopes(scope));
      return;
    }

    this.tokenCache.clear();
    this.inflightTokenRequests.clear();
  }

  buildMerchantAuthorizeUrl(state: string, scope?: string): string {
    if (!state.trim()) {
      throw new Error('OAuth state 不能为空');
    }

    const { clientId } = this.resolveOAuthClientCredentials();
    const resolvedScope = this.normalizeMerchantScopes(scope);
    const redirectUri = this.resolveMerchantRedirectUri();

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: resolvedScope,
      state: state.trim(),
    });

    return `${this.authorizeEndpoint}?${params.toString()}`;
  }

  async exchangeAuthorizationCode(
    code: string,
    redirectUriOverride?: string,
    scopeOverride?: string,
  ): Promise<UberMerchantTokenExchangeResult> {
    if (!code.trim()) {
      throw new Error('authorization code 不能为空');
    }

    const { clientId, clientSecret } = this.resolveOAuthClientCredentials();
    const redirectUri = this.resolveMerchantRedirectUri(redirectUriOverride);
    const resolvedScope = this.normalizeMerchantScopes(scopeOverride);

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code: code.trim(),
      redirect_uri: redirectUri,
      scope: resolvedScope,
    });

    const data = await this.performTokenRequest(params);

    if (!data.access_token) {
      throw new Error('Uber authorization_code 响应缺少 access_token');
    }

    const expiresAt =
      typeof data.expires_in === 'number' && data.expires_in > 0
        ? new Date(Date.now() + data.expires_in * 1000)
        : null;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token?.trim() || null,
      expiresAt,
      scope: data.scope?.trim() || resolvedScope,
      tokenType: data.token_type?.trim() || null,
      raw: data,
    };
  }

  async refreshMerchantAccessToken(
    refreshToken: string,
    scopeOverride?: string,
  ): Promise<UberMerchantTokenExchangeResult> {
    if (!refreshToken.trim()) {
      throw new Error('refresh token 不能为空');
    }

    const { clientId, clientSecret } = this.resolveOAuthClientCredentials();
    const resolvedScope = this.normalizeMerchantScopes(scopeOverride);

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken.trim(),
      scope: resolvedScope,
    });

    const data = await this.performTokenRequest(params);

    if (!data.access_token) {
      throw new Error('Uber refresh_token 响应缺少 access_token');
    }

    const expiresAt =
      typeof data.expires_in === 'number' && data.expires_in > 0
        ? new Date(Date.now() + data.expires_in * 1000)
        : null;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token?.trim() || refreshToken.trim(),
      expiresAt,
      scope: data.scope?.trim() || resolvedScope,
      tokenType: data.token_type?.trim() || null,
      raw: data,
    };
  }

  private async requestAccessToken(scope: string): Promise<CachedToken> {
    const { clientId, clientSecret } = this.resolveOAuthClientCredentials();

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope,
    });

    const data = await this.performTokenRequest(params);

    if (!data.access_token) {
      throw new Error(
        `Uber access token 响应缺少 access_token scope="${scope}"`,
      );
    }

    const expiresInSec =
      typeof data.expires_in === 'number' && data.expires_in > 0
        ? data.expires_in
        : 3600;

    return {
      accessToken: data.access_token,
      expiresAt: Date.now() + expiresInSec * 1000,
    };
  }

  private async performTokenRequest(
    params: URLSearchParams,
  ): Promise<UberTokenResponse> {
    const body = params.toString();

    this.logger.debug(
      `[token.request] endpoint=${this.tokenEndpoint} grant_type=${params.get('grant_type') || ''} scope=${params.get('scope') || ''}`,
    );

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });

    const text = await response.text();
    const data = text ? this.tryParseJson(text) : {};

    if (!response.ok) {
      this.logger.error(
        `[token.request] failed status=${response.status} body=${text || '<empty>'}`,
      );
      throw new Error(
        `Uber token 请求失败 status=${response.status} body=${text || '<empty>'}`,
      );
    }

    return (data || {}) as UberTokenResponse;
  }

  private tryParseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
}
