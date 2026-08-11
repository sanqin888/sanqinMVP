import { UberTransientUpstreamError } from '../errors/uber-application.error';
import type {
  UberOAuthIdentityTokens,
  UberOAuthTokenPort,
} from '../ports/uber-api.ports';
import type {
  UberMerchantConnectionRepositoryPort,
  UberOAuthStatePort,
} from '../ports/uber-persistence.ports';
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
      failOAuthState: jest.fn((_nonce, category) => {
        row.status = 'FAILED';
        row.lastErrorCategory = category;
        return Promise.resolve(true);
      }),
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
    const tokens: UberOAuthTokenPort = {
      getRedirectUri: jest.fn(() => row.redirectUri),
      signState: jest.fn(() => 'signature'),
      verifyState: jest.fn(() => true),
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
      upsertConnectionByUberUserId,
      useCase: new CompleteUberOAuthUseCase(tokens, states, connections),
    };
  };

  it('并发 callback 仅一个请求获得 ISSUED -> EXCHANGING CAS', async () => {
    const x = setup();
    const results = await Promise.all([
      x.useCase.exchangeAuthorizationCode(
        'one-time-code',
        stateValue,
        'session-1',
      ),
      x.useCase.exchangeAuthorizationCode(
        'one-time-code',
        stateValue,
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
      x.useCase.exchangeAuthorizationCode('code', stateValue, 'session-1'),
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
        'code',
        stateValue,
        'session-1',
      ),
    ).toEqual({
      ok: false,
      error: { code: 'OAUTH_TEMPORARY_FAILURE' },
    });
    expect(x.row.status).toBe('EXCHANGED');
    expect(
      await x.useCase.exchangeAuthorizationCode(
        'code',
        stateValue,
        'session-1',
      ),
    ).toMatchObject({ ok: true });
    expect(x.exchangeAuthorizationCode).toHaveBeenCalledTimes(1);
  });

  it('COMPLETED 成功重放返回已保存的安全结果且不再兑换 code', async () => {
    const x = setup();
    expect(
      await x.useCase.exchangeAuthorizationCode(
        'code',
        stateValue,
        'session-1',
      ),
    ).toMatchObject({ ok: true });
    expect(
      await x.useCase.exchangeAuthorizationCode(
        'code',
        stateValue,
        'session-1',
      ),
    ).toMatchObject({ ok: true, value: { uberUserId: token.uberUserId } });
    expect(x.exchangeAuthorizationCode).toHaveBeenCalledTimes(1);
    expect(x.upsertConnectionByUberUserId).toHaveBeenCalledTimes(1);
  });
});
