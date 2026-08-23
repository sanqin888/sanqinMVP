import { UberMerchantApiAdapter } from './uber-merchant-api.adapter';
import type { UberMerchantCredentialStore } from './uber-merchant-credential.port';
import type { UberAuthService } from './uber-token.provider';
import { createUberTransportFake } from '../../test/uber-api-test.helpers';

describe('UberMerchantApiAdapter merchant credentials', () => {
  type GatewayAudit = ConstructorParameters<typeof UberMerchantApiAdapter>[3];
  const audit = (): jest.Mocked<GatewayAudit> => {
    const recordResponse: jest.MockedFunction<GatewayAudit['recordResponse']> =
      jest.fn();
    recordResponse.mockResolvedValue(undefined);
    return { recordResponse };
  };
  const expired = () => ({
    connectionId: 'merchant-1',
    accessToken: 'expired-access',
    refreshToken: 'refresh-secret',
    expiresAt: new Date(Date.now() - 1000),
    scope: 'offline_access eats.pos_provisioning',
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
      scope: 'offline_access eats.pos_provisioning',
      tokenType: 'Bearer',
    });
    const auth = {
      refreshMerchantAccessToken,
    } as unknown as jest.Mocked<UberAuthService>;
    const gateway = new UberMerchantApiAdapter(
      transport,
      credentials,
      auth,
      audit(),
    );

    await gateway.discoverStores({ connectionId: 'merchant-1' });

    expect(refreshMerchantAccessToken).toHaveBeenCalledWith(
      'refresh-secret',
      'offline_access eats.pos_provisioning',
    );
    expect(rotateCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: 'merchant-1',
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
        scope: 'offline_access eats.pos_provisioning',
        tokenType: 'Bearer',
      };
    });
    const gateway = new UberMerchantApiAdapter(
      transport,
      credentials,
      {
        refreshMerchantAccessToken,
      } as unknown as UberAuthService,
      audit(),
    );

    const calls = [
      gateway.discoverStores({ connectionId: 'merchant-1' }),
      gateway.discoverStores({ connectionId: 'merchant-1' }),
    ];
    release();
    await Promise.all(calls);

    expect(refreshMerchantAccessToken).toHaveBeenCalledTimes(1);
    expect(rotateCredential).toHaveBeenCalledTimes(1);
  });

  it('审计失败采用 best-effort，不阻断 discovery，并仅发送脱敏原始响应到专用 port', async () => {
    const transport = createUberTransportFake();
    transport.request.mockResolvedValue({
      stores: [],
      accessToken: 'must-not-leak',
      nested: { password: 'must-not-leak' },
    });
    const credentials: jest.Mocked<UberMerchantCredentialStore> = {
      loadCredential: jest.fn().mockResolvedValue({
        ...expired(),
        accessToken: 'valid',
        expiresAt: new Date(Date.now() + 3_600_000),
      }),
      rotateCredential: jest.fn(),
    };
    const gatewayAudit = audit();
    gatewayAudit.recordResponse.mockRejectedValue(new Error('audit offline'));
    const gateway = new UberMerchantApiAdapter(
      transport,
      credentials,
      {} as UberAuthService,
      gatewayAudit,
    );

    await expect(
      gateway.discoverStores({ connectionId: 'merchant-1' }),
    ).resolves.toEqual({ stores: [] });
    const event = gatewayAudit.recordResponse.mock.calls[0][0];
    expect(event).toMatchObject({
      operation: 'merchant.discover-stores',
      connectionId: 'merchant-1',
      outcome: 'RECEIVED',
      upstreamStatus: null,
      sanitizedRawResponse: {
        stores: [],
        accessToken: '[REDACTED]',
        nested: { password: '[REDACTED]' },
      },
    });
    expect(event.recordedAt).toBeInstanceOf(Date);
  });
});
