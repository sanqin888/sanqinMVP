import { UberMerchantApiAdapter } from './uber-merchant-api.adapter';
import type { UberMerchantCredentialStore } from './uber-merchant-credential.port';
import type { UberAuthService } from './uber-token.provider';
import { createUberTransportFake } from '../../test/uber-api-test.helpers';

describe('UberMerchantApiAdapter merchant credentials', () => {
  const expired = () => ({
    merchantUberUserId: 'merchant-1',
    accessToken: 'expired-access',
    refreshToken: 'refresh-secret',
    expiresAt: new Date(Date.now() - 1000),
    scope: 'eats.store',
    tokenType: 'Bearer',
    version: '2026-01-01T00:00:00.000Z',
  });

  it('过期 token 会在 gateway 内自动刷新并持久化轮换', async () => {
    const transport = createUberTransportFake();
    transport.request.mockResolvedValue({ stores: [] });
    const rotateCredential = jest.fn().mockResolvedValue(true);
    const credentials: jest.Mocked<UberMerchantCredentialStore> = {
      loadCredential: jest.fn().mockResolvedValue(expired()),
      rotateCredential,
    };
    const refreshMerchantAccessToken = jest.fn().mockResolvedValue({
      accessToken: 'fresh-access',
      refreshToken: 'fresh-refresh',
      expiresAt: new Date(Date.now() + 3600_000),
      scope: 'eats.store',
      tokenType: 'Bearer',
    });
    const auth = {
      refreshMerchantAccessToken,
    } as unknown as jest.Mocked<UberAuthService>;
    const gateway = new UberMerchantApiAdapter(transport, credentials, auth);

    await gateway.discoverStores({ merchantUberUserId: 'merchant-1' });

    expect(refreshMerchantAccessToken).toHaveBeenCalledWith(
      'refresh-secret',
      'eats.store',
    );
    expect(rotateCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantUberUserId: 'merchant-1',
        expectedVersion: expired().version,
        accessToken: 'fresh-access',
      }),
    );
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'fresh-access' }),
    );
  });

  it('同一商户并发调用只执行一次刷新', async () => {
    const transport = createUberTransportFake();
    transport.request.mockResolvedValue({ stores: [] });
    const rotateCredential = jest.fn().mockResolvedValue(true);
    const credentials: jest.Mocked<UberMerchantCredentialStore> = {
      loadCredential: jest.fn().mockResolvedValue(expired()),
      rotateCredential,
    };
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const refreshMerchantAccessToken = jest.fn(async () => {
      await barrier;
      return {
        accessToken: 'fresh-access',
        refreshToken: 'fresh-refresh',
        expiresAt: new Date(Date.now() + 3600_000),
        scope: 'eats.store',
        tokenType: 'Bearer',
      };
    });
    const gateway = new UberMerchantApiAdapter(transport, credentials, {
      refreshMerchantAccessToken,
    } as unknown as UberAuthService);

    const calls = [
      gateway.discoverStores({ merchantUberUserId: 'merchant-1' }),
      gateway.discoverStores({ merchantUberUserId: 'merchant-1' }),
    ];
    release();
    await Promise.all(calls);

    expect(refreshMerchantAccessToken).toHaveBeenCalledTimes(1);
    expect(rotateCredential).toHaveBeenCalledTimes(1);
  });
});
