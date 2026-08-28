import type { CloverMerchantAuthorization } from '@prisma/client';

import type { PrismaService } from '../../../../prisma/prisma.service';
import type { CloverProviderConfig } from '../clover-provider.config';
import { CloverCredentialVaultService } from './clover-credential-vault.service';
import {
  CloverMerchantAccessTokenService,
  CloverMerchantCredentialError,
} from './clover-merchant-access-token.service';
import {
  CloverOAuthProviderError,
  type CloverOAuthClient,
} from './clover-oauth.client';

const key = Buffer.alloc(32, 11).toString('base64');
const merchantId = 'MERCHANT123';

const createHarness = () => {
  const vault = new CloverCredentialVaultService({
    CLOVER_CREDENTIAL_ACTIVE_KEY_VERSION: '1',
    CLOVER_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ 1: key }),
    CLOVER_CREDENTIAL_KEYS_SOURCE: 'env',
  });
  const config = {
    oauthRefreshSkewMs: 120_000,
  } as unknown as CloverProviderConfig;
  let row = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    merchantId,
    merchantName: 'SanQ Roujiamo',
    storeStableId: '4750_Yonge_Street',
    encryptedAccessToken: vault.encrypt('old-access-token'),
    encryptedRefreshToken: vault.encrypt('old-refresh-token'),
    accessTokenExpiresAt: new Date(Date.now() - 1_000),
    refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
    scopes: 'MERCHANT_READ,PAYMENTS_READ',
    status: 'ACTIVE',
    tokenVersion: 4,
    refreshLeaseId: null,
    refreshLeaseExpiresAt: null,
    authorizedAt: new Date(Date.now() - 60_000),
    refreshedAt: null,
    revokedAt: null,
    createdAt: new Date(Date.now() - 60_000),
    updatedAt: new Date(),
  } as unknown as CloverMerchantAuthorization;

  let finalCasWins = true;
  const updateMany = jest.fn(
    ({ data }: { data: Record<string, unknown> }) => {
      if ('refreshLeaseId' in data && data.refreshLeaseId && !('encryptedAccessToken' in data)) {
        row = {
          ...row,
          refreshLeaseId: data.refreshLeaseId as string,
          refreshLeaseExpiresAt: data.refreshLeaseExpiresAt as Date,
        };
        return Promise.resolve({ count: 1 });
      }
      if ('encryptedAccessToken' in data) {
        if (!finalCasWins) return Promise.resolve({ count: 0 });
        row = {
          ...row,
          encryptedAccessToken: data.encryptedAccessToken as string,
          encryptedRefreshToken: data.encryptedRefreshToken as string,
          accessTokenExpiresAt: data.accessTokenExpiresAt as Date,
          refreshTokenExpiresAt: data.refreshTokenExpiresAt as Date | null,
          tokenVersion: row.tokenVersion + 1,
          refreshedAt: data.refreshedAt as Date,
          refreshLeaseId: null,
          refreshLeaseExpiresAt: null,
        };
        return Promise.resolve({ count: 1 });
      }
      if (data.status === 'REAUTH_REQUIRED') {
        row = {
          ...row,
          status: 'REAUTH_REQUIRED',
          refreshLeaseId: null,
          refreshLeaseExpiresAt: null,
        } as CloverMerchantAuthorization;
        return Promise.resolve({ count: 1 });
      }
      if (data.refreshLeaseId === null) {
        row = { ...row, refreshLeaseId: null, refreshLeaseExpiresAt: null };
        return Promise.resolve({ count: 1 });
      }
      return Promise.resolve({ count: 0 });
    },
  );
  const prisma = {
    cloverMerchantAuthorization: {
      findUnique: jest.fn(() => Promise.resolve(row)),
      updateMany,
    },
  } as unknown as PrismaService;
  const refreshedTokens = {
    accessToken: 'new-access-token',
    refreshToken: 'new-refresh-token',
    accessTokenExpiresAt: new Date(Date.now() + 30 * 60_000),
    refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
  };
  const oauth = {
    refreshTokens: jest.fn().mockResolvedValue(refreshedTokens),
  } as unknown as jest.Mocked<CloverOAuthClient>;
  const service = new CloverMerchantAccessTokenService(
    prisma,
    vault,
    oauth,
    config,
  );
  return {
    service,
    vault,
    oauth,
    updateMany,
    refreshedTokens,
    getRow: () => row,
    setRow: (value: CloverMerchantAuthorization) => {
      row = value;
    },
    setFinalCasWins: (value: boolean) => {
      finalCasWins = value;
    },
  };
};

describe('CloverMerchantAccessTokenService', () => {
  it('uses a valid database merchant token without any static-token fallback', async () => {
    const harness = createHarness();
    harness.getRow().accessTokenExpiresAt = new Date(Date.now() + 10 * 60_000);

    const credential = await harness.service.getAccessToken(merchantId);

    expect(credential).toEqual({
      token: 'old-access-token',
    });
    expect(harness.oauth.refreshTokens).not.toHaveBeenCalled();
  });

  it('refreshes an expired token, persists both rotated tokens, and increments the CAS version', async () => {
    const harness = createHarness();

    const credential = await harness.service.getAccessToken(merchantId);

    expect(credential).toEqual({
      token: 'new-access-token',
    });
    expect(harness.oauth.refreshTokens).toHaveBeenCalledWith('old-refresh-token');
    expect(harness.vault.decrypt(harness.getRow().encryptedAccessToken)).toBe(
      'new-access-token',
    );
    expect(harness.vault.decrypt(harness.getRow().encryptedRefreshToken)).toBe(
      'new-refresh-token',
    );
    expect(harness.getRow().tokenVersion).toBe(5);
    expect(harness.getRow().refreshLeaseId).toBeNull();
  });

  it('single-flights concurrent refresh requests so one process consumes the single-use refresh token once', async () => {
    const harness = createHarness();

    const [a, b] = await Promise.all([
      harness.service.getAccessToken(merchantId),
      harness.service.getAccessToken(merchantId),
    ]);

    expect(a).toEqual(b);
    expect(harness.oauth.refreshTokens).toHaveBeenCalledTimes(1);
    expect(harness.getRow().tokenVersion).toBe(5);
  });

  it('marks a merchant for reauthorization when Clover rejects the refresh token', async () => {
    const harness = createHarness();
    harness.oauth.refreshTokens.mockRejectedValueOnce(
      new CloverOAuthProviderError('CLOVER_OAUTH_HTTP_401', false, 401),
    );

    const credential = await harness.service.getAccessToken(merchantId);

    expect(credential).toBeNull();
    expect(harness.getRow().status).toBe('REAUTH_REQUIRED');
    expect(harness.getRow().refreshLeaseId).toBeNull();
  });

  it('releases the refresh lease and surfaces retryable provider timeouts without invalidating authorization', async () => {
    const harness = createHarness();
    harness.oauth.refreshTokens.mockRejectedValueOnce(
      new CloverOAuthProviderError('CLOVER_OAUTH_TIMEOUT', true),
    );

    try {
      await harness.service.getAccessToken(merchantId);
      throw new Error('expected CloverMerchantCredentialError');
    } catch (error) {
      expect(error).toBeInstanceOf(CloverMerchantCredentialError);
      expect((error as CloverMerchantCredentialError).retryable).toBe(true);
    }
    expect(harness.getRow().status).toBe('ACTIVE');
    expect(harness.getRow().refreshLeaseId).toBeNull();
  });

  it('does not overwrite a newer refresh token when a concurrent reauthorization wins the final CAS', async () => {
    const harness = createHarness();
    harness.setFinalCasWins(false);
    harness.oauth.refreshTokens.mockImplementationOnce(async () => {
      const winner = {
        ...harness.getRow(),
        encryptedAccessToken: harness.vault.encrypt('winner-access-token'),
        encryptedRefreshToken: harness.vault.encrypt('winner-refresh-token'),
        accessTokenExpiresAt: new Date(Date.now() + 30 * 60_000),
        tokenVersion: harness.getRow().tokenVersion + 1,
        refreshLeaseId: null,
        refreshLeaseExpiresAt: null,
      } as CloverMerchantAuthorization;
      harness.setRow(winner);
      return harness.refreshedTokens;
    });

    const credential = await harness.service.getAccessToken(merchantId);

    expect(credential).toEqual({
      token: 'winner-access-token',
    });
    expect(harness.vault.decrypt(harness.getRow().encryptedRefreshToken)).toBe(
      'winner-refresh-token',
    );
    expect(harness.vault.decrypt(harness.getRow().encryptedRefreshToken)).not.toBe(
      'new-refresh-token',
    );
  });

  it('returns no credential when the merchant authorization requires reauthorization', async () => {
    const harness = createHarness();
    harness.getRow().status = 'REAUTH_REQUIRED';

    await expect(harness.service.getAccessToken(merchantId)).resolves.toBeNull();
    await expect(harness.service.hasUsableCredential(merchantId)).resolves.toBe(false);
  });
});
