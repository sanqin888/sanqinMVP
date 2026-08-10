import { Inject, Injectable } from '@nestjs/common';
import {
  UberValidationError,
  UberAuthenticationError,
} from '../errors/uber-application.error';
import { randomBytes, randomUUID } from 'crypto';
import {
  UBER_OAUTH_TOKEN,
  type UberOAuthTokenPort,
} from '../ports/uber-api.ports';
import {
  UBER_MERCHANT_CONNECTION_REPOSITORY,
  UBER_OAUTH_STATE_REPOSITORY,
  type UberMerchantConnectionRepositoryPort,
  type UberOAuthStatePort,
} from '../ports/uber-persistence.ports';

export type UberOAuthErrorCode =
  | 'OAUTH_START_FAILED'
  | 'OAUTH_CODE_MISSING'
  | 'OAUTH_COMPLETION_FAILED';
export type UberOAuthResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: UberOAuthErrorCode } };

@Injectable()
export class StartUberOAuthUseCase {
  constructor(
    @Inject(UBER_OAUTH_TOKEN) private readonly tokens: UberOAuthTokenPort,
    @Inject(UBER_OAUTH_STATE_REPOSITORY)
    private readonly states: UberOAuthStatePort,
  ) {}
  async buildMerchantAuthorizeUrl(
    adminSessionId: string,
    merchantContext?: string,
  ) {
    if (!adminSessionId.trim())
      throw new UberAuthenticationError({
        code: 'UNAUTHORIZED',
        operation: 'merchant',
        message: '缺少发起 OAuth 的管理员会话',
      });
    const issuedAt = new Date();
    const nonce = randomBytes(32).toString('base64url');
    const payload = `${issuedAt.getTime()}.${nonce}`;
    const state = `${payload}.${this.tokens.signState(payload)}`;
    await this.states.saveOAuthState({
      nonce,
      adminSessionId: adminSessionId.trim(),
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + 600_000),
      redirectUri: this.tokens.getRedirectUri(),
      merchantContext: merchantContext?.trim() || null,
    });
    return {
      ok: true,
      state,
      authorizeUrl: this.tokens.buildAuthorizeUrl(state),
    };
  }
  async startMerchantOAuth(
    adminSessionId: string,
    merchantContext?: string,
  ): Promise<
    UberOAuthResult<
      Awaited<ReturnType<StartUberOAuthUseCase['buildMerchantAuthorizeUrl']>>
    >
  > {
    try {
      return {
        ok: true,
        value: await this.buildMerchantAuthorizeUrl(
          adminSessionId,
          merchantContext,
        ),
      };
    } catch {
      return { ok: false, error: { code: 'OAUTH_START_FAILED' } };
    }
  }
}

@Injectable()
export class CompleteUberOAuthUseCase {
  constructor(
    @Inject(UBER_OAUTH_TOKEN) private readonly tokens: UberOAuthTokenPort,
    @Inject(UBER_OAUTH_STATE_REPOSITORY)
    private readonly states: UberOAuthStatePort,
    @Inject(UBER_MERCHANT_CONNECTION_REPOSITORY)
    private readonly connections: UberMerchantConnectionRepositoryPort,
  ) {}
  async exchangeAuthorizationCode(
    code: string | undefined,
    state: string | undefined,
    adminSessionId: string | undefined,
    merchantContext?: string,
  ): Promise<UberOAuthResult<Record<string, unknown>>> {
    if (!code) return { ok: false, error: { code: 'OAUTH_CODE_MISSING' } };
    try {
      const request = await this.consume(
        state,
        adminSessionId,
        merchantContext,
      );
      const token = await this.tokens.exchangeAuthorizationCode(
        code,
        request.redirectUri,
      );
      const merchantUberUserId = `oauth:${randomUUID()}`;
      const connectedAt = new Date();
      await this.connections.upsertConnection({
        merchantUberUserId,
        ...token,
        connectedAt,
        rawStoresSnapshot: null,
      });
      return {
        ok: true,
        value: {
          ok: true,
          merchantUberUserId,
          scope: token.scope,
          tokenType: token.tokenType,
          expiresAt: token.expiresAt,
          connectedAt,
        },
      };
    } catch {
      return { ok: false, error: { code: 'OAUTH_COMPLETION_FAILED' } };
    }
  }
  async getMerchantConnectionStatus(id?: string) {
    const row = await this.connections.findConnection(id);
    if (!row)
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: '未找到 Uber 商户授权',
      });
    return {
      ok: true,
      merchantUberUserId: row.merchantUberUserId,
      scope: row.scope,
      tokenType: row.tokenType,
      expiresAt: row.expiresAt,
      connectedAt: row.connectedAt,
    };
  }
  private async consume(
    state?: string,
    adminSessionId?: string,
    context?: string,
  ) {
    const parts = state?.trim().split('.') ?? [];
    if (parts.length !== 3)
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: 'OAuth state 非法',
      });
    const [timestamp, nonce, signature] = parts;
    const issuedAt = new Date(Number(timestamp));
    const now = new Date();
    if (
      !this.tokens.verifyState(`${timestamp}.${nonce}`, signature) ||
      Number.isNaN(issuedAt.getTime())
    )
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: 'OAuth state 校验失败',
      });
    const request = await this.states.findOAuthState(nonce);
    if (
      !request ||
      request.consumedAt ||
      request.issuedAt.getTime() !== issuedAt.getTime() ||
      request.expiresAt <= now
    )
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: 'OAuth state 不存在、已使用或过期',
      });
    if (
      !adminSessionId?.trim() ||
      request.adminSessionId !== adminSessionId.trim()
    )
      throw new UberAuthenticationError({
        code: 'UNAUTHORIZED',
        operation: 'merchant',
        message: 'OAuth state 与管理员会话不匹配',
      });
    if (
      request.redirectUri !== this.tokens.getRedirectUri() ||
      (context !== undefined &&
        request.merchantContext !== (context.trim() || null))
    )
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: 'OAuth state 上下文不匹配',
      });
    if (
      !(await this.states.consumeOAuthState({
        nonce,
        adminSessionId: adminSessionId.trim(),
        issuedAt,
        now,
      }))
    )
      throw new UberValidationError({
        code: 'INVALID_REQUEST',
        operation: 'merchant',
        message: 'OAuth state 已使用',
      });
    return request;
  }
}
