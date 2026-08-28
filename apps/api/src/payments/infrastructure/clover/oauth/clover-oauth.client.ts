import { Injectable } from '@nestjs/common';

import { CloverProviderConfig } from '../clover-provider.config';

const OAUTH_TIMEOUT_MS = 8_000;

export type CloverOAuthTokenPair = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date | null;
};

export class CloverOAuthProviderError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly httpStatus?: number,
    readonly recoveryAvailable = false,
  ) {
    super(code);
    this.name = 'CloverOAuthProviderError';
  }
}

@Injectable()
export class CloverOAuthClient {
  constructor(private readonly config: CloverProviderConfig) {}

  buildAuthorizeUrl(state: string): string {
    const clientId = this.requireClientId();
    const redirectUri = this.requireRedirectUri();
    const url = new URL('/oauth/v2/authorize', this.config.oauthAuthorizeBase);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeAuthorizationCode(code: string): Promise<CloverOAuthTokenPair> {
    return this.requestToken('/oauth/v2/token', {
      client_id: this.requireClientId(),
      client_secret: this.requireClientSecret(),
      code,
    });
  }

  async refreshTokens(refreshToken: string): Promise<CloverOAuthTokenPair> {
    try {
      return await this.requestToken('/oauth/v2/refresh', {
        client_id: this.requireClientId(),
        refresh_token: refreshToken,
      });
    } catch (error) {
      if (
        error instanceof CloverOAuthProviderError &&
        error.httpStatus === 401 &&
        error.recoveryAvailable
      ) {
        return this.requestToken('/oauth/v2/recovery', {
          client_id: this.requireClientId(),
          client_secret: this.requireClientSecret(),
          recovery_token: refreshToken,
        });
      }
      throw error;
    }
  }

  private async requestToken(
    path: '/oauth/v2/token' | '/oauth/v2/refresh' | '/oauth/v2/recovery',
    body: Record<string, string>,
  ): Promise<CloverOAuthTokenPair> {
    const response = await this.request(`${this.config.oauthApiBase}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'SanQ-Payments/1.0',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new CloverOAuthProviderError(
        `CLOVER_OAUTH_HTTP_${response.status}`,
        response.status >= 500 || response.status === 429,
        response.status,
        response.headers.get('x-clover-recovery-available') === 'true',
      );
    }
    const value = await this.parseJson(response);
    const accessToken = this.nonEmptyString(value.access_token);
    const refreshToken = this.nonEmptyString(value.refresh_token);
    const accessExpiration = this.unixSeconds(value.access_token_expiration);
    const refreshExpiration = this.optionalUnixSeconds(
      value.refresh_token_expiration,
    );
    if (!accessToken || !refreshToken || !accessExpiration) {
      throw new CloverOAuthProviderError(
        'CLOVER_OAUTH_TOKEN_RESPONSE_INVALID',
        false,
      );
    }
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: accessExpiration,
      refreshTokenExpiresAt: refreshExpiration,
    };
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OAUTH_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      const code =
        error instanceof Error && error.name === 'AbortError'
          ? 'CLOVER_OAUTH_TIMEOUT'
          : 'CLOVER_OAUTH_NETWORK_ERROR';
      throw new CloverOAuthProviderError(code, true);
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseJson(response: Response): Promise<Record<string, unknown>> {
    try {
      const value: unknown = await response.json();
      return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    } catch {
      throw new CloverOAuthProviderError('CLOVER_OAUTH_RESPONSE_INVALID', false);
    }
  }

  private nonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private unixSeconds(value: unknown): Date | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return null;
    }
    return new Date(value * 1000);
  }

  private optionalUnixSeconds(value: unknown): Date | null {
    if (value === undefined || value === null) return null;
    return this.unixSeconds(value);
  }

  private requireClientId(): string {
    if (!this.config.oauthClientId) {
      throw new CloverOAuthProviderError('CLOVER_OAUTH_CLIENT_ID_MISSING', false);
    }
    return this.config.oauthClientId;
  }

  private requireClientSecret(): string {
    if (!this.config.oauthClientSecret) {
      throw new CloverOAuthProviderError(
        'CLOVER_OAUTH_CLIENT_SECRET_MISSING',
        false,
      );
    }
    return this.config.oauthClientSecret;
  }

  private requireRedirectUri(): string {
    if (!this.config.oauthCallbackUrl) {
      throw new CloverOAuthProviderError(
        'CLOVER_OAUTH_CALLBACK_URL_MISSING',
        false,
      );
    }
    return this.config.oauthCallbackUrl;
  }
}
