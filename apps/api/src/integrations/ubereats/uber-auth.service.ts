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

  private readonly merchantProvisioningScope =
    process.env.UBER_EATS_MERCHANT_SCOPE?.trim() || 'eats.pos_provisioning';

  private readonly merchantRedirectUri =
    process.env.UBER_EATS_REDIRECT_URI?.trim() ||
    process.env.UBER_EATS_OAUTH_REDIRECT_URI?.trim() ||
    '';

  private readonly defaultScopes =
    process.env.UBER_EATS_SCOPES?.trim() || 'eats.store eats.order';

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
    const normalized = raw.replace(/\r\n/g, '\n').replace(/\n/g, '\n').trim();

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

  private buildClientAssertion(): string {
    const keyConfig = this.keyConfig;
    if (!keyConfig) {
      throw new Error('Uber key 配置未初始化');
    }
    if (!this.normalizedPrivateKey) {
      throw new Error('Uber private key 未初始化');
    }

    const now = Math.floor(Date.now() / 1000);

    const header = {
      alg: 'RS256',
      kid: keyConfig.key_id,
      typ: 'JWT',
    };

    const payload = {
      iss: keyConfig.application_id,
      sub: keyConfig.application_id,
      aud: 'auth.uber.com',
      iat: now,
      exp: now + 300,
      jti: randomUUID(),
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();

    const signature = signer.sign(this.normalizedPrivateKey);
    const encodedSignature = this.base64UrlEncode(signature);

    return `${signingInput}.${encodedSignature}`;
  }

  private normalizeScopes(scope?: string): string {
    const raw = (scope?.trim() || this.defaultScopes).trim();

    if (!raw) {
      throw new Error('Uber scopes 为空，请配置 UBER_EATS_SCOPES');
    }

    // 去重 + 排序，避免同一组 scope 因顺序不同生成多个缓存 key
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

  private async performTokenRequest(
    params: URLSearchParams,
  ): Promise<UberTokenResponse> {
    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Uber token 获取失败 status=${response.status} body=${errorText.slice(0, 300)}`,
      );
    }

    return (await response.json()) as UberTokenResponse;
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
    const resolvedScope = this.normalizeScopes(
      scope || this.merchantProvisioningScope,
    );
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
  ): Promise<UberMerchantTokenExchangeResult> {
    if (!code.trim()) {
      throw new Error('authorization code 不能为空');
    }

    if (!this.keyConfig) {
      await this.readKeyFile();
    }

    const assertion = this.buildClientAssertion();
    const redirectUri = this.resolveMerchantRedirectUri(redirectUriOverride);
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code.trim(),
      redirect_uri: redirectUri,
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
      scope: data.scope?.trim() || null,
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
    if (!this.keyConfig) {
      await this.readKeyFile();
    }

    const keyConfig = this.keyConfig;
    if (!keyConfig) {
      throw new Error('Uber key 配置未初始化');
    }

    const assertion = this.buildClientAssertion();

    const params = new URLSearchParams({
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
