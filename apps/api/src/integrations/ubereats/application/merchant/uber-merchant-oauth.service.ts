import {
  UberValidationError,
  UberAuthenticationError,
  UberOAuthSessionMismatchError,
  UberOAuthStateError,
  UberOAuthTemporaryError,
  UberOAuthTerminalError,
  isUberApplicationError,
} from '../shared/uber-application.error';
import { randomBytes, randomUUID } from 'crypto';
import { type UberOAuthTokenPort } from '../merchant/uber-merchant-api.ports';
import {
  type UberMerchantConnectionRepositoryPort,
  type UberOAuthStatePort,
} from './uber-merchant-persistence.ports';

export type UberOAuthErrorCode =
  | 'OAUTH_START_FAILED'
  | 'OAUTH_USER_DENIED'
  | 'OAUTH_AUTHORIZATION_INVALID'
  | 'OAUTH_CODE_MISSING'
  | 'OAUTH_STATE_INVALID_OR_EXPIRED'
  | 'OAUTH_SESSION_MISMATCH'
  | 'OAUTH_TEMPORARY_FAILURE'
  | 'OAUTH_TERMINAL_FAILURE'
  | 'OAUTH_COMPLETION_FAILED';
export type UberOAuthResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: UberOAuthErrorCode } };

export type UberOAuthCallback = {
  code?: string;
  state?: string;
  /** Untrusted OAuth protocol value. Never include it in logs, HTML, or errors. */
  error?: string;
};

export class StartUberOAuthUseCase {
  constructor(
    private readonly tokens: UberOAuthTokenPort,
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

export class CompleteUberOAuthUseCase {
  constructor(
    private readonly tokens: UberOAuthTokenPort,
    private readonly states: UberOAuthStatePort,
    private readonly connections: UberMerchantConnectionRepositoryPort,
  ) {}
  async exchangeAuthorizationCode(
    callback: UberOAuthCallback,
    adminSessionId: string | undefined,
    merchantContext?: string,
  ): Promise<
    UberOAuthResult<{
      connectionId: string;
      scope: string | null;
      tokenType: string | null;
      expiresAt: Date | null;
      connectedAt: Date;
    }>
  > {
    let nonce: string | undefined;
    try {
      const request = await this.validate(
        callback.state,
        adminSessionId,
        merchantContext,
      );
      nonce = request.nonce;

      if (request.status === 'COMPLETED')
        return { ok: true, value: this.completedValue(request) };
      if (request.status === 'FAILED')
        throw new UberOAuthTerminalError({
          code: 'OAUTH_TERMINAL_FAILURE',
          operation: 'merchant-oauth',
          message: 'OAuth 已最终失败',
        });

      const authorizationError = this.authorizationError(callback.error);
      if (authorizationError === 'denied') {
        await this.states.failOAuthState(nonce, 'authorization-denied');
        return { ok: false, error: { code: 'OAUTH_USER_DENIED' } };
      }
      if (authorizationError === 'temporary')
        return { ok: false, error: { code: 'OAUTH_TEMPORARY_FAILURE' } };
      if (authorizationError === 'invalid') {
        await this.states.failOAuthState(nonce, 'authorization-invalid');
        return { ok: false, error: { code: 'OAUTH_AUTHORIZATION_INVALID' } };
      }
      if (!callback.code)
        return { ok: false, error: { code: 'OAUTH_CODE_MISSING' } };

      let token =
        request.status === 'EXCHANGED'
          ? await this.states.loadExchangedTokens(nonce)
          : null;
      if (!token) {
        if (
          request.status !== 'ISSUED' ||
          !(await this.states.claimOAuthState({
            nonce,
            adminSessionId: adminSessionId!.trim(),
            issuedAt: request.issuedAt,
            now: new Date(),
          }))
        )
          throw new UberOAuthTemporaryError({
            code: 'OAUTH_EXCHANGE_IN_PROGRESS',
            operation: 'merchant-oauth',
            message: 'OAuth 正在处理中',
          });
        try {
          const exchanged = await this.tokens.exchangeAuthorizationCode(
            callback.code,
            request.redirectUri,
          );
          token = { ...exchanged, connectionId: randomUUID() };
        } catch (error) {
          const retryable = isUberApplicationError(error)
            ? error.retryable
            : false;
          if (retryable && request.retryCount < 2) {
            await this.states.releaseOAuthStateForRetry(
              nonce,
              this.errorCategory(error),
            );
            throw new UberOAuthTemporaryError({
              code: 'OAUTH_TOKEN_TEMPORARY',
              operation: 'merchant-oauth',
              message: 'Uber 暂时不可用',
              cause: error,
            });
          }
          await this.states.failOAuthState(nonce, this.errorCategory(error));
          throw new UberOAuthTerminalError({
            code: 'OAUTH_TOKEN_FINAL',
            operation: 'merchant-oauth',
            message: 'Uber 授权最终失败',
            cause: error,
          });
        }
        if (!(await this.states.saveExchangedTokens({ nonce, ...token })))
          throw new UberOAuthTemporaryError({
            code: 'OAUTH_RESULT_SAVE_FAILED',
            operation: 'merchant-oauth',
            message: '授权结果暂存失败',
          });
      }

      const connectedAt = new Date();
      await this.connections.upsertConnectionByConnectionId({
        ...token,
        connectedAt,
      });
      await this.states.completeOAuthState(nonce, connectedAt);
      return {
        ok: true,
        value: {
          connectionId: token.connectionId,
          scope: token.scope,
          tokenType: token.tokenType,
          expiresAt: token.expiresAt,
          connectedAt,
        },
      };
    } catch (error) {
      if (error instanceof UberOAuthStateError)
        return { ok: false, error: { code: 'OAUTH_STATE_INVALID_OR_EXPIRED' } };
      if (error instanceof UberOAuthSessionMismatchError)
        return { ok: false, error: { code: 'OAUTH_SESSION_MISMATCH' } };
      if (error instanceof UberOAuthTemporaryError)
        return { ok: false, error: { code: 'OAUTH_TEMPORARY_FAILURE' } };
      if (error instanceof UberOAuthTerminalError)
        return { ok: false, error: { code: 'OAUTH_TERMINAL_FAILURE' } };
      // EXCHANGED remains durable, so a replay resumes connection persistence without reusing the code.
      return {
        ok: false,
        error: {
          code: nonce ? 'OAUTH_TEMPORARY_FAILURE' : 'OAUTH_COMPLETION_FAILED',
        },
      };
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
      connectionId: row.connectionId,
      scope: row.scope,
      tokenType: row.tokenType,
      expiresAt: row.expiresAt,
      connectedAt: row.connectedAt,
    };
  }
  private async validate(
    state?: string,
    adminSessionId?: string,
    context?: string,
  ) {
    const parts = state?.trim().split('.') ?? [];
    if (parts.length !== 3)
      throw new UberOAuthStateError({
        code: 'OAUTH_STATE_INVALID',
        operation: 'merchant-oauth',
        message: 'OAuth state 非法',
      });
    const [timestamp, nonce, signature] = parts;
    const issuedAt = new Date(Number(timestamp));
    const now = new Date();
    if (
      !this.tokens.verifyState(`${timestamp}.${nonce}`, signature) ||
      Number.isNaN(issuedAt.getTime())
    )
      throw new UberOAuthStateError({
        code: 'OAUTH_STATE_INVALID',
        operation: 'merchant-oauth',
        message: 'OAuth state 校验失败',
      });
    const request = await this.states.findOAuthState(nonce);
    if (
      !request ||
      request.issuedAt.getTime() !== issuedAt.getTime() ||
      (['ISSUED', 'EXCHANGING'].includes(request.status) &&
        request.expiresAt <= now)
    )
      throw new UberOAuthStateError({
        code: 'OAUTH_STATE_EXPIRED',
        operation: 'merchant-oauth',
        message: 'OAuth state 不存在或过期',
      });
    if (
      !adminSessionId?.trim() ||
      request.adminSessionId !== adminSessionId.trim()
    )
      throw new UberOAuthSessionMismatchError({
        code: 'OAUTH_SESSION_MISMATCH',
        operation: 'merchant-oauth',
        message: 'OAuth state 与管理员会话不匹配',
      });
    if (
      request.redirectUri !== this.tokens.getRedirectUri() ||
      (context !== undefined &&
        request.merchantContext !== (context.trim() || null))
    )
      throw new UberOAuthStateError({
        code: 'OAUTH_STATE_CONTEXT_MISMATCH',
        operation: 'merchant-oauth',
        message: 'OAuth state 上下文不匹配',
      });
    return request;
  }
  private completedValue(
    request: Awaited<ReturnType<UberOAuthStatePort['findOAuthState']>> & {},
  ) {
    if (!request?.connectionId || !request.connectedAt)
      throw new UberOAuthTemporaryError({
        code: 'OAUTH_RESULT_INCOMPLETE',
        operation: 'merchant-oauth',
        message: 'OAuth 完成结果不完整',
      });
    return {
      connectionId: request.connectionId,
      scope: request.scope,
      tokenType: request.tokenType,
      expiresAt: request.tokenExpiresAt,
      connectedAt: request.connectedAt,
    };
  }
  private errorCategory(error: unknown): string {
    return isUberApplicationError(error)
      ? error.category
      : error instanceof TypeError
        ? 'internal-contract'
        : 'persistence';
  }
  private authorizationError(
    error?: string,
  ): 'denied' | 'temporary' | 'invalid' | null {
    if (!error) return null;
    if (error === 'access_denied') return 'denied';
    if (error === 'server_error' || error === 'temporarily_unavailable')
      return 'temporary';
    return 'invalid';
  }
}
