import { CompleteUberOAuthUseCase } from './uber-merchant-oauth.service';
import type { UberOAuthTokenPort } from '../ports/uber-api.ports';
import type {
  UberMerchantConnectionRepositoryPort,
  UberOAuthStatePort,
} from '../ports/uber-persistence.ports';

describe('CompleteUberOAuthUseCase', () => {
  const uberUserId = '123e4567-e89b-42d3-a456-426614174000';

  it('reconnect 使用真实 Uber user_id 幂等更新同一连接', async () => {
    const now = Date.now();
    const tokens = {
      getRedirectUri: jest.fn().mockReturnValue('https://example.com/callback'),
      verifyState: jest.fn().mockReturnValue(true),
      exchangeAuthorizationCode: jest.fn().mockResolvedValue({
        uberUserId,
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: null,
        scope: 'eats.store',
        tokenType: 'Bearer',
      }),
    } as unknown as UberOAuthTokenPort;
    const states = {
      findOAuthState: jest.fn((nonce: string) =>
        Promise.resolve({
          nonce,
          adminSessionId: 'session-1',
          redirectUri: 'https://example.com/callback',
          issuedAt: new Date(now),
          expiresAt: new Date(now + 60_000),
          consumedAt: null,
          merchantContext: null,
        }),
      ),
      consumeOAuthState: jest.fn().mockResolvedValue(true),
    } as unknown as UberOAuthStatePort;
    const rows = new Map<string, unknown>();
    const connections = {
      upsertConnectionByUberUserId: jest.fn((input) => {
        rows.set(input.uberUserId, input);
        return Promise.resolve({ connectedAt: input.connectedAt });
      }),
    } as unknown as UberMerchantConnectionRepositoryPort;
    const useCase = new CompleteUberOAuthUseCase(tokens, states, connections);

    const first = await useCase.exchangeAuthorizationCode(
      'code-1',
      `${now}.nonce-1.signature`,
      'session-1',
    );
    const reconnect = await useCase.exchangeAuthorizationCode(
      'code-2',
      `${now}.nonce-2.signature`,
      'session-1',
    );

    expect(first).toMatchObject({ ok: true, value: { uberUserId } });
    expect(reconnect).toMatchObject({ ok: true, value: { uberUserId } });
    expect(rows.size).toBe(1);
    expect(connections.upsertConnectionByUberUserId).toHaveBeenCalledTimes(2);
    expect(Array.from(rows.keys())).toEqual([uberUserId]);
  });
});
