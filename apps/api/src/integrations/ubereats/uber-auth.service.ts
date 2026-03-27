//apps/api/src/integrations/ubereats/uber-auth.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { createSign, randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { AppLogger } from '../../common/app-logger';

type UberKeyFile = {
  application_id: string;
  key_id: string;
  private_key: string;
  public_key?: string;
};

type UberTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

type UberMerchantTokenExchangeResult = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
  tokenType: string | null;
  raw: UberTokenResponse;
};

type CachedToken = {
  accessToken: string;
  expiresAt: number;
};

@Injectable()
export class UberAuthService implements OnModuleInit {
  private readonly logger = new AppLogger(UberAuthService.name);

  private readonly tokenEndpoint =
    process.env.UBER_EATS_TOKEN_ENDPOINT?.trim() ||
    'https://auth.uber.com/oauth/v2/token';

  private readonly authorizeEndpoint =
    process.env.UBER_EATS_AUTHORIZE_ENDPOINT?.trim() ||
    'https://auth.uber.com/oauth/v2/authorize';

  private readonly merchantIdentityEndpoint =
    process.env.UBER_EATS_MERCHANT_IDENTITY_ENDPOINT?.trim() ||
    'https://api.uber.com/v1/me';

  /**
   * 商户 OAuth（店主授权）用的 scope
   * 优先用 UBER_EATS_USER_AUTH_SCOPES
   */
  private readonly merchantProvisioningScope =
    process.env.UBER_EATS_USER_AUTH_SCOPES?.trim() ||
    process.env.UBER_EATS_MERCHANT_SCOPE?.trim() ||
    'eats.pos_provisioning';

  /**
   * app 自己拿 client_credentials token 用的 scope
   */
  private readonly defaultScopes =
    process.env.UBER_EATS_APP_SCOPES?.trim() ||
    process.env.UBER_EATS_SCOPES?.trim() ||
    'eats.store eats.order';

  private readonly merchantRedirectUri =
    process.env.UBER_EATS_REDIRECT_URI?.trim() ||
    process.env.UBER_EATS_OAUTH_REDIRECT_URI?.trim() ||
    '';

  // 提前 60 秒刷新，避免刚拿到 token 就快过期
  private readonly tokenRefreshBufferMs = 60_000;

  private keyFilePath = '';
  private keyConfig: UberKeyFile | null = null;
  private normalizedPrivateKey = '';

  // 按 scope 缓存 token，避免不同 scope 相互覆盖
  private readonly tokenCache = new Map<string, CachedToken>();

  // 按 scope 去重并发刷新
  private readonly inflightTokenPromises = new Map<
    string,
    Promise<CachedToken>
  >();

  async onModuleInit(): Promise<void> {
    const keyConfig = await this.readKeyFile();

    this.logger.log(
      `[ubereats auth] key file validated path=${this.keyFilePath} applicationId=${keyConfig.application_id} keyId=${keyConfig.key_id}`,
    );
  }

  private async readKeyFile(): Promise<UberKeyFile> {
    if (this.keyConfig) {
      return this.keyConfig;
    }

    const keyFilePath = process.env.UBER_EATS_KEY_FILE?.trim();
    if (!keyFilePath) {
      throw new Error('UBER_EATS_KEY_FILE 未配置');
    }

    const raw = await readFile(keyFilePath, 'utf8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Uber key 文件 JSON 解析失败: ${keyFilePath}`);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`Uber key 文件内容无效: ${keyFilePath}`);
    }

    const config = parsed as Partial<UberKeyFile>;

    if (!config.application_id?.trim()) {
      throw new Error('Uber key 文件缺少 application_id');
    }
    if (!config.key_id?.trim()) {
      throw new Error('Uber key 文件缺少 key_id');
    }
    if (!config.private_key?.trim()) {
      throw new Error('Uber key 文件缺少 private_key');
    }

    this.keyFilePath = keyFilePath;
    this.normalizedPrivateKey = this.normalizePrivateKey(config.private_key);

    this.keyConfig = {
      application_id: config.application_id.trim(),
      key_id: config.key_id.trim(),
      private_key: config.private_key,
      public_key: config.public_key,
    };

    return this.keyConfig;
  }

  private normalizePrivateKey(raw: string): string {
    const normalized = raw.replace(/\r\n/g, '\n').trim();

    const pemPatterns = [
      {
        begin: '-----BEGIN PRIVATE KEY-----',
        end: '-----END PRIVATE KEY-----',
      },
      {
        begin: '-----BEGIN RSA PRIVATE KEY-----',
        end: '-----END RSA PRIVATE KEY-----',
      },
    ];

    const isValidPem = pemPatterns.some(
      ({ begin, end }) =>
        normalized.includes(begin) && normalized.includes(end),
    );

    if (!isValidPem) {
      throw new Error('Uber private_key 不是合法 PEM 格式');
    }

    return normalized;
  }

  private base64UrlEncode(input: string | Buffer): string {
    return Buffer.from(input)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  private async buildClientAssertion(): Promise<string> {
    const keyConfig = await this.readKeyFile();
    const now = Math.floor(Date.now() / 1000);

    const header = {
      alg: 'RS256',
      typ: 'JWT',
      kid: keyConfig.key_id,
    };

    const payload = {
      iss: keyConfig.application_id,
      sub: keyConfig.application_id,
      aud: 'auth.uber.com',
      jti: randomUUID(),
      iat: now,
      exp: now + 300,
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;

    const signer = createSign('RSA-SHA256');
    signer.update(unsignedToken);
    signer.end();

    const signature = signer.sign(this.normalizedPrivateKey);
    const encodedSignature = this.base64UrlEncode(signature);

    return `${unsignedToken}.${encodedSignature}`;
  }

  private normalizeScopes(scope?: string): string {
    const raw = (scope?.trim() || this.defaultScopes).trim();

    if (!raw) {
      throw new Error(
        'Uber scopes 为空，请配置 UBER_EATS_APP_SCOPES 或 UBER_EATS_SCOPES',
      );
    }

    const normalized = Array.from(
      new Set(
        raw
          .split(/\s+/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ).sort();

    if (!normalized.length) {
      throw new Error('Uber scopes 无有效内容');
    }

    return normalized.join(' ');
  }

  private normalizeMerchantScopes(scope?: string): string {
    const raw = (
      scope?.trim() ||
      this.merchantProvisioningScope ||
      this.defaultScopes
    ).trim();

    if (!raw) {
      throw new Error(
        'Uber merchant scopes 为空，请配置 UBER_EATS_USER_AUTH_SCOPES 或 UBER_EATS_MERCHANT_SCOPE',
      );
    }

    const normalized = Array.from(
      new Set(
        raw
          .split(/\s+/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ).sort();

    if (!normalized.length) {
      throw new Error('Uber merchant scopes 无有效内容');
    }

    return normalized.join(' ');
  }

  private maskValue(value?: string | null, keepStart = 4, keepEnd = 4): string {
    const v = value?.trim();
    if (!v) return 'missing';
    if (v.length <= keepStart + keepEnd) return `${v.slice(0, 2)}***`;
    return `${v.slice(0, keepStart)}***${v.slice(-keepEnd)}`;
  }

  private async performTokenRequest(
    params: URLSearchParams,
  ): Promise<UberTokenResponse> {
    const grantType = params.get('grant_type') ?? 'missing';
    const redirectUri = params.get('redirect_uri') ?? 'missing';
    const scope = params.get('scope') ?? 'missing';
    const clientId = params.get('client_id') ?? 'missing';

    const hasCode = Boolean(params.get('code'));
    const hasRefreshToken = Boolean(params.get('refresh_token'));
    const hasClientSecret = Boolean(params.get('client_secret'));
    const hasClientAssertion = Boolean(params.get('client_assertion'));

    this.logger.log(
      `[ubereats token request] endpoint=${this.tokenEndpoint} grantType=${grantType} redirectUri=${redirectUri} scope=${scope} ` +
        `clientId=${this.maskValue(clientId, 6, 4)} ` +
        `hasCode=${hasCode} hasRefreshToken=${hasRefreshToken} hasClientSecret=${hasClientSecret} hasClientAssertion=${hasClientAssertion}`,
    );

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    const responseText = await response.text();

    if (!response.ok) {
      this.logger.error(
        `[ubereats token error] endpoint=${this.tokenEndpoint} status=${response.status} ` +
          `grantType=${grantType} redirectUri=${redirectUri} scope=${scope} ` +
          `clientId=${this.maskValue(clientId, 6, 4)} body=${responseText.slice(0, 500)}`,
      );

      throw new Error(
        `Uber token 获取失败 status=${response.status} body=${responseText.slice(0, 300)}`,
      );
    }

    this.logger.log(
      `[ubereats token success] endpoint=${this.tokenEndpoint} status=${response.status} body=${responseText.slice(0, 200)}`,
    );

    return JSON.parse(responseText) as UberTokenResponse;
  }

  private resolveMerchantRedirectUri(override?: string): string {
    const redirectUri = override?.trim() || this.merchantRedirectUri;

    if (!redirectUri) {
      throw new Error('UBER_EATS_REDIRECT_URI 未配置');
    }

    return redirectUri;
  }

  async buildMerchantAuthorizeUrl(
    state: string,
    scope?: string,
  ): Promise<string> {
    const keyConfig = await this.readKeyFile();
    const resolvedScope = this.normalizeMerchantScopes(scope);
    const redirectUri = this.resolveMerchantRedirectUri();

    const params = new URLSearchParams({
      client_id: keyConfig.application_id,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: resolvedScope,
      state,
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

    const keyConfig = await this.readKeyFile();
    const assertion = await this.buildClientAssertion();
    const redirectUri = this.resolveMerchantRedirectUri(redirectUriOverride);

    // 注意：Uber 的 authorization_code 换 token 这里也需要带 scope
    const resolvedScope = this.normalizeMerchantScopes(scopeOverride);

    const params = new URLSearchParams({
      client_id: keyConfig.application_id,
      grant_type: 'authorization_code',
      code: code.trim(),
      redirect_uri: redirectUri,
      scope: resolvedScope,
      client_assertion_type:
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
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

    const keyConfig = await this.readKeyFile();
    const assertion = await this.buildClientAssertion();
    const resolvedScope = this.normalizeMerchantScopes(scopeOverride);

    const params = new URLSearchParams({
      client_id: keyConfig.application_id,
      grant_type: 'refresh_token',
      refresh_token: refreshToken.trim(),
      scope: resolvedScope,
      client_assertion_type:
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
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

  async getMerchantIdentity(
    accessToken: string,
  ): Promise<Record<string, unknown> | null> {
    const response = await fetch(this.merchantIdentityEndpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.warn(
        `[ubereats auth] merchant identity lookup failed status=${response.status} body=${errorText.slice(0, 200)}`,
      );
      return null;
    }

    const payload = (await response.json()) as unknown;
    return payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : null;
  }

  private async requestAccessToken(scope: string): Promise<CachedToken> {
    const keyConfig = await this.readKeyFile();
    const assertion = await this.buildClientAssertion();

    const params = new URLSearchParams({
      client_id: keyConfig.application_id,
      grant_type: 'client_credentials',
      scope,
      client_assertion_type:
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
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

    const expiresAt = Date.now() + expiresInSec * 1000;

    this.logger.log(
      `[ubereats auth] access token fetched scope="${scope}" tokenType=${data.token_type ?? 'unknown'} responseScope="${data.scope ?? ''}" expiresAt=${new Date(expiresAt).toISOString()}`,
    );

    return {
      accessToken: data.access_token,
      expiresAt,
    };
  }

  async getAccessToken(scope?: string): Promise<string> {
    const normalizedScope = this.normalizeScopes(scope);
    const now = Date.now();

    const cached = this.tokenCache.get(normalizedScope);
    if (cached && now < cached.expiresAt - this.tokenRefreshBufferMs) {
      return cached.accessToken;
    }

    const inflight = this.inflightTokenPromises.get(normalizedScope);
    if (inflight) {
      const shared = await inflight;
      return shared.accessToken;
    }

    const refreshPromise = this.requestAccessToken(normalizedScope)
      .then((token) => {
        this.tokenCache.set(normalizedScope, token);
        return token;
      })
      .finally(() => {
        this.inflightTokenPromises.delete(normalizedScope);
      });

    this.inflightTokenPromises.set(normalizedScope, refreshPromise);

    const token = await refreshPromise;
    return token.accessToken;
  }

  clearTokenCache(scope?: string): void {
    if (!scope) {
      this.tokenCache.clear();
      this.inflightTokenPromises.clear();

      this.logger.warn('[ubereats auth] token cache cleared for all scopes');
      return;
    }

    const normalizedScope = this.normalizeScopes(scope);
    this.tokenCache.delete(normalizedScope);
    this.inflightTokenPromises.delete(normalizedScope);

    this.logger.warn(
      `[ubereats auth] token cache cleared scope="${normalizedScope}"`,
    );
  }
}
