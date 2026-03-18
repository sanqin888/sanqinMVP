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
  expires_in?: number;
  token_type?: string;
};

@Injectable()
export class UberAuthService implements OnModuleInit {
  private readonly logger = new AppLogger(UberAuthService.name);
  private readonly tokenEndpoint =
    process.env.UBER_EATS_TOKEN_ENDPOINT?.trim() ||
    'https://login.uber.com/oauth/v2/token';
  private readonly tokenRefreshBufferMs = 60_000;

  private keyFilePath = '';
  private keyConfig: UberKeyFile | null = null;
  private cachedAccessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  async onModuleInit(): Promise<void> {
    const keyConfig = await this.readKeyFile();
    this.normalizePrivateKey(keyConfig.private_key);

    this.logger.log(
      `[ubereats auth] key file validated path=${this.keyFilePath} applicationId=${keyConfig.application_id} keyId=${keyConfig.key_id}`,
    );
  }

  private async readKeyFile(): Promise<UberKeyFile> {
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
    this.keyConfig = {
      application_id: config.application_id.trim(),
      key_id: config.key_id.trim(),
      private_key: config.private_key,
      public_key: config.public_key,
    };

    return this.keyConfig;
  }

  private normalizePrivateKey(raw: string): string {
    const normalized = raw.replace(/\\n/g, '\n').trim();

    if (
      !normalized.includes('-----BEGIN PRIVATE KEY-----') ||
      !normalized.includes('-----END PRIVATE KEY-----')
    ) {
      throw new Error('Uber private_key 不是合法 PEM 格式');
    }

    return normalized;
  }

  private buildClientAssertion(): string {
    const keyConfig = this.keyConfig;
    if (!keyConfig) {
      throw new Error('Uber key 配置未初始化');
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
      aud: this.tokenEndpoint,
      iat: now,
      exp: now + 300,
      jti: randomUUID(),
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const content = `${encodedHeader}.${encodedPayload}`;

    const signer = createSign('RSA-SHA256');
    signer.update(content);
    signer.end();

    const signature = signer.sign(
      this.normalizePrivateKey(keyConfig.private_key),
    );
    const encodedSignature = this.base64UrlEncode(signature);
    return `${content}.${encodedSignature}`;
  }

  private async requestAccessToken(): Promise<{
    accessToken: string;
    expiresAt: number;
  }> {
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
      client_id: keyConfig.application_id,
      client_assertion_type:
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
    });

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
        `Uber access token 获取失败 status=${response.status} body=${errorText.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as UberTokenResponse;
    if (!data.access_token) {
      throw new Error('Uber access token 响应缺少 access_token');
    }

    const expiresInSec =
      typeof data.expires_in === 'number' && data.expires_in > 0
        ? data.expires_in
        : 3600;
    const expiresAt = Date.now() + expiresInSec * 1000;

    this.logger.log(
      `[ubereats auth] access token 获取成功 expiresAt=${new Date(expiresAt).toISOString()}`,
    );

    return {
      accessToken: data.access_token,
      expiresAt,
    };
  }

  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (
      this.cachedAccessToken &&
      now < this.accessTokenExpiresAt - this.tokenRefreshBufferMs
    ) {
      return this.cachedAccessToken;
    }

    const { accessToken, expiresAt } = await this.requestAccessToken();
    this.cachedAccessToken = accessToken;
    this.accessTokenExpiresAt = expiresAt;
    return accessToken;
  }

  private base64UrlEncode(input: string | Buffer): string {
    return Buffer.from(input)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }
}
