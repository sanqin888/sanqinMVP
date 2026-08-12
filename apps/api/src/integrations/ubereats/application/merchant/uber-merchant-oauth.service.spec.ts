import { UberTransientUpstreamError } from '../shared/uber-application.error';
import type {
  UberOAuthIdentityTokens,
  UberOAuthTokenPort,
} from '../merchant/uber-merchant-api.ports';
import type {
  UberMerchantConnectionRepositoryPort,
  UberOAuthStatePort,
} from './uber-merchant-persistence.ports';
import { CompleteUberOAuthUseCase } from './uber-merchant-oauth.service';

describe('CompleteUberOAuthUseCase OAuth 状态机', () => {
  const now = Date.now();
  const nonce = 'nonce-1';
  const stateValue = `${now}.${nonce}.signature`;
  const token = {
    uberUserId: '123e4567-e89b-42d3-a456-426614174000',
    accessToken: 'secret-access',
    refreshToken: 'secret-refresh',
    expiresAt: null,
    scope: 'eats.store',
    tokenType: 'Bearer',
  };

  const setup = () => {
    type OAuthState = NonNullable<
      Awaited<ReturnType<UberOAuthStatePort['findOAuthState']>>
    >;
    const row: OAuthState = {
      nonce,
      adminSessionId: 'session-1',
      redirectUri: 'https://example.com/callback',
      issuedAt: new Date(now),
      expiresAt: new Date(now + 60_000),
      consumedAt: null,
      merchantContext: null,
      status: 'ISSUED',
      retryCount: 0,
      lastErrorCategory: null,
      uberUserId: null,
      scope: null,
      tokenType: null,
      tokenExpiresAt: null,
      connectedAt: null,
    };
    let recovery: UberOAuthIdentityTokens | null = null;
    const failOAuthState = jest.fn((_nonce: string, category: string) => {
      row.status = 'FAILED';
      row.lastErrorCategory = category;
      return Promise.resolve(true);
    });
    const states: UberOAuthStatePort = {
      findOAuthState: jest.fn(() => Promise.resolve({ ...row })),
      claimOAuthState: jest.fn(() => {
        if (row.status !== 'ISSUED') return Promise.resolve(false);
        row.status = 'EXCHANGING';
        return Promise.resolve(true);
      }),
      releaseOAuthStateForRetry: jest.fn((_nonce, category) => {
        row.status = 'ISSUED';
        row.retryCount += 1;
        row.lastErrorCategory = category;
        return Promise.resolve(true);
      }),
      failOAuthState,
      saveExchangedTokens: jest.fn((value) => {
        recovery = { ...value };
        row.status = 'EXCHANGED';
        row.uberUserId = value.uberUserId;
        row.scope = value.scope;
        row.tokenType = value.tokenType;
        row.tokenExpiresAt = value.expiresAt;
        return Promise.resolve(true);
      }),
      loadExchangedTokens: jest.fn(() => Promise.resolve(recovery)),
      completeOAuthState: jest.fn((_nonce, connectedAt) => {
        row.status = 'COMPLETED';
        row.connectedAt = connectedAt;
        recovery = null;
        return Promise.resolve(true);
      }),
      saveOAuthState: jest.fn(() => Promise.resolve()),
    };
    const exchangeAuthorizationCode = jest.fn(() => Promise.resolve(token));
    const verifyState = jest.fn(() => true);
    const tokens: UberOAuthTokenPort = {
      getRedirectUri: jest.fn(() => row.redirectUri),
      signState: jest.fn(() => 'signature'),
      verifyState,
      buildAuthorizeUrl: jest.fn(() => 'https://example.com/authorize'),
      exchangeAuthorizationCode,
      refreshAccessToken: jest.fn(() => Promise.resolve(token)),
    };
    const upsertConnectionByUberUserId = jest.fn(() =>
      Promise.resolve({
        connectedAt: new Date(),
      }),
    );
    const connections: UberMerchantConnectionRepositoryPort = {
      findConnection: jest.fn(() => Promise.resolve(null)),
      upsertConnectionByUberUserId,
      saveStoresSnapshot: jest.fn(() => Promise.resolve()),
    };
    return {
      row,
      states,
      tokens,
      connections,
      exchangeAuthorizationCode,
      verifyState,
      failOAuthState,
      upsertConnectionByUberUserId,
      useCase: new CompleteUberOAuthUseCase(tokens, states, connections),
    };
  };

  it('并发 callback 仅一个请求获得 ISSUED -> EXCHANGING CAS', async () => {
    const x = setup();
    const results = await Promise.all([
      x.useCase.exchangeAuthorizationCode(
        { code: 'one-time-code', state: stateValue },
        'session-1',
      ),
      x.useCase.exchangeAuthorizationCode(
        { code: 'one-time-code', state: stateValue },
        'session-1',
      ),
    ]);
    expect(x.exchangeAuthorizationCode).toHaveBeenCalledTimes(1);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results).toContainEqual({
      ok: false,
      error: { code: 'OAUTH_TEMPORARY_FAILURE' },
    });
  });

  it('token endpoint 超时释放为有限重试状态并记录错误类别', async () => {
    const x = setup();
    x.exchangeAuthorizationCode.mockRejectedValueOnce(
      new UberTransientUpstreamError({
        code: 'TIMEOUT',
        operation: 'token',
        message: 'timeout',
      }),
    );
    await expect(
      x.useCase.exchangeAuthorizationCode(
        { code: 'code', state: stateValue },
        'session-1',
      ),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'OAUTH_TEMPORARY_FAILURE' },
    });
    expect(x.row).toMatchObject({
      status: 'ISSUED',
      retryCount: 1,
      lastErrorCategory: 'transient-upstream',
    });
  });

  it('token 成功后连接数据库失败会保留 EXCHANGED，并在重放时恢复而不重复兑换', async () => {
    const x = setup();
    jest
      .mocked(x.upsertConnectionByUberUserId)
      .mockRejectedValueOnce(new Error('database unavailable'));
    expect(
      await x.useCase.exchangeAuthorizationCode(
        { code: 'code', state: stateValue },
        'session-1',
      ),
    ).toEqual({
      ok: false,
      error: { code: 'OAUTH_TEMPORARY_FAILURE' },
    });
    expect(x.row.status).toBe('EXCHANGED');
    expect(
      await x.useCase.exchangeAuthorizationCode(
        { code: 'code', state: stateValue },
        'session-1',
      ),
    ).toMatchObject({ ok: true });
    expect(x.exchangeAuthorizationCode).toHaveBeenCalledTimes(1);
  });

  it('COMPLETED 成功重放返回已保存的安全结果且不再兑换 code', async () => {
    const x = setup();
    expect(
      await x.useCase.exchangeAuthorizationCode(
        { code: 'code', state: stateValue },
        'session-1',
      ),
    ).toMatchObject({ ok: true });
    expect(
      await x.useCase.exchangeAuthorizationCode(
        { code: 'code', state: stateValue },
        'session-1',
      ),
    ).toMatchObject({ ok: true, value: { uberUserId: token.uberUserId } });
    expect(x.exchangeAuthorizationCode).toHaveBeenCalledTimes(1);
    expect(x.upsertConnectionByUberUserId).toHaveBeenCalledTimes(1);
  });

  it('验证 state 后将用户拒绝终结为稳定错误，且不兑换 code', async () => {
    const x = setup();
    await expect(
      x.useCase.exchangeAuthorizationCode(
        { error: 'access_denied', state: stateValue },
        'session-1',
      ),
    ).resolves.toEqual({ ok: false, error: { code: 'OAUTH_USER_DENIED' } });
    expect(x.row).toMatchObject({
      status: 'FAILED',
      lastErrorCategory: 'authorization-denied',
    });
    expect(x.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it('临时上游授权错误保持 ISSUED，允许使用同一 callback 重试', async () => {
    const x = setup();
    await expect(
      x.useCase.exchangeAuthorizationCode(
        { error: 'temporarily_unavailable', state: stateValue },
        'session-1',
      ),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'OAUTH_TEMPORARY_FAILURE' },
    });
    expect(x.row.status).toBe('ISSUED');
  });

  it('无效授权响应和缺少 code 映射为不同稳定错误', async () => {
    const invalid = setup();
    await expect(
      invalid.useCase.exchangeAuthorizationCode(
        { error: 'invalid_request', state: stateValue },
        'session-1',
      ),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'OAUTH_AUTHORIZATION_INVALID' },
    });
    const missing = setup();
    await expect(
      missing.useCase.exchangeAuthorizationCode(
        { state: stateValue },
        'session-1',
      ),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'OAUTH_CODE_MISSING' },
    });
  });

  it('篡改或过期 state 在处理 OAuth error 前即被拒绝', async () => {
    const tampered = setup();
    tampered.verifyState.mockReturnValue(false);
    await expect(
      tampered.useCase.exchangeAuthorizationCode(
        { error: 'access_denied', state: stateValue },
        'session-1',
      ),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'OAUTH_STATE_INVALID_OR_EXPIRED' },
    });
    expect(tampered.failOAuthState).not.toHaveBeenCalled();

    const expired = setup();
    expired.row.expiresAt = new Date(now - 1);
    await expect(
      expired.useCase.exchangeAuthorizationCode(
        { error: 'access_denied', state: stateValue },
        'session-1',
      ),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'OAUTH_STATE_INVALID_OR_EXPIRED' },
    });
  });

  it('cookie 丢失时不允许仅凭 state 建立商户连接', async () => {
    const x = setup();
    await expect(
      x.useCase.exchangeAuthorizationCode(
        { code: 'code', state: stateValue },
        undefined,
      ),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'OAUTH_SESSION_MISMATCH' },
    });
    expect(x.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });
});
