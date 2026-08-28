import { AppLogger } from '../../../../common/app-logger';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { CloverProviderConfig } from '../clover-provider.config';
import { CloverCredentialVaultService } from './clover-credential-vault.service';
import {
  CloverMerchantAuthorizationError,
  CloverMerchantAuthorizationService,
} from './clover-merchant-authorization.service';
import {
  CloverPlatformMerchantVerificationGateway,
  CloverPlatformVerificationError,
} from '../platform/clover-platform-merchant-verification.gateway';
import {
  CloverOAuthProviderError,
  type CloverOAuthClient,
} from './clover-oauth.client';

const encryptionKey = Buffer.alloc(32, 7).toString('base64');
const merchantId = 'MERCHANT123';
const storeStableId = '4750_Yonge_Street';
const callbackUrl = 'https://sanq.ca/clover/oauth/callback';

type StateRow = {
  stateHash: string;
  merchantId: string;
  clientId: string;
  redirectUri: string;
  issuedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  status: 'ISSUED' | 'EXCHANGING' | 'EXCHANGED' | 'COMPLETED' | 'FAILED';
  lastErrorCode: string | null;
  encryptedExchangeResult: string | null;
};

type StateCreateInput = Omit<
  StateRow,
  'status' | 'consumedAt' | 'lastErrorCode' | 'encryptedExchangeResult'
>;

type StoreFindUniqueArgs = {
  where: { storeStableId: string };
  select: { isActive: boolean };
};

type AuthorizationUpsertArgs = {
  where: { merchantId: string };
  create: {
    storeStableId: string | null;
    status: string;
    encryptedAccessToken: string;
    encryptedRefreshToken: string;
    [key: string]: unknown;
  };
  update: {
    tokenVersion: { increment: number };
    refreshLeaseId: string | null;
    revokedAt: Date | null;
    [key: string]: unknown;
  };
};

const expectOAuthError = async (
  promise: Promise<unknown>,
  code: string,
  retryable?: boolean,
) => {
  try {
    await promise;
    throw new Error('expected CloverMerchantAuthorizationError');
  } catch (error) {
    expect(error).toBeInstanceOf(CloverMerchantAuthorizationError);
    const oauthError = error as CloverMerchantAuthorizationError;
    expect(oauthError.publicCode).toBe(code);
    if (retryable !== undefined) expect(oauthError.retryable).toBe(retryable);
  }
};

const createHarness = () => {
  const vault = new CloverCredentialVaultService({
    CLOVER_CREDENTIAL_ACTIVE_KEY_VERSION: '1',
    CLOVER_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ 1: encryptionKey }),
    CLOVER_CREDENTIAL_KEYS_SOURCE: 'env',
  });
  const config = {
    merchantId,
    storeStableId,
    oauthClientId: 'app-123',
    oauthClientSecret: 'server-secret',
    oauthCallbackUrl: callbackUrl,
    oauthScopesMetadata: 'MERCHANT_READ,PAYMENTS_READ,ECOMMERCE',
    oauthStateTtlMs: 600_000,
  } as unknown as CloverProviderConfig;

  let stateRow: StateRow | null = null;
  let existingAuthorization: { storeStableId: string | null } | null = null;
  let mappingConflict: { merchantId: string } | null = null;
  let storeActive = true;
  let authorizationUpsert: AuthorizationUpsertArgs | null = null;

  const oauthStateRequest = {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    create: jest.fn(({ data }: { data: StateCreateInput }) => {
      stateRow = {
        ...data,
        consumedAt: null,
        status: 'ISSUED',
        lastErrorCode: null,
        encryptedExchangeResult: null,
      };
      return Promise.resolve(stateRow);
    }),
    findUnique: jest.fn(() => Promise.resolve(stateRow)),
    updateMany: jest.fn(({ data }: { data: Partial<StateRow> }) => {
      if (!stateRow) return Promise.resolve({ count: 0 });
      if (data.status === 'EXCHANGING') {
        if (stateRow.status !== 'ISSUED' || stateRow.expiresAt <= new Date()) {
          return Promise.resolve({ count: 0 });
        }
        stateRow = { ...stateRow, ...data };
        return Promise.resolve({ count: 1 });
      }
      if (data.status === 'EXCHANGED') {
        if (stateRow.status !== 'EXCHANGING') {
          return Promise.resolve({ count: 0 });
        }
        stateRow = { ...stateRow, ...data };
        return Promise.resolve({ count: 1 });
      }
      if (data.status === 'COMPLETED') {
        if (stateRow.status !== 'EXCHANGED') {
          return Promise.resolve({ count: 0 });
        }
        stateRow = { ...stateRow, ...data };
        return Promise.resolve({ count: 1 });
      }
      if (data.status === 'FAILED') {
        if (stateRow.status === 'COMPLETED' || stateRow.status === 'FAILED') {
          return Promise.resolve({ count: 0 });
        }
        stateRow = { ...stateRow, ...data };
        return Promise.resolve({ count: 1 });
      }
      return Promise.resolve({ count: 0 });
    }),
  };
  const authorizationUpsertMock = jest.fn((args: AuthorizationUpsertArgs) => {
    authorizationUpsert = args;
    return Promise.resolve({ id: 'authorization-db-id' });
  });
  const cloverMerchantAuthorization = {
    findUnique: jest.fn(({ where }: { where: Record<string, string> }) => {
      if ('storeStableId' in where) return Promise.resolve(mappingConflict);
      return Promise.resolve(existingAuthorization);
    }),
    upsert: authorizationUpsertMock,
  };
  const storeFindUniqueArgs: StoreFindUniqueArgs[] = [];
  const store = {
    findUnique: jest.fn((args: StoreFindUniqueArgs) => {
      storeFindUniqueArgs.push(args);
      return Promise.resolve(storeActive ? { isActive: true } : null);
    }),
  };
  const prisma = {
    cloverOAuthStateRequest: oauthStateRequest,
    cloverMerchantAuthorization,
    store,
  } as unknown as PrismaService;

  const tokens = {
    accessToken: 'production-access-token',
    refreshToken: 'production-refresh-token',
    accessTokenExpiresAt: new Date(Date.now() + 30 * 60_000),
    refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
  };
  const buildAuthorizeUrl = jest.fn(
    (state: string) =>
      `https://www.clover.com/oauth/v2/authorize?state=${state}`,
  );
  const exchangeAuthorizationCode = jest.fn().mockResolvedValue(tokens);
  const oauth = {
    buildAuthorizeUrl,
    exchangeAuthorizationCode,
  } as unknown as jest.Mocked<CloverOAuthClient>;
  const getMerchantIdentity = jest
    .fn()
    .mockResolvedValue({ id: merchantId, name: 'SanQ Roujiamo' });
  const verifyPaymentsRead = jest.fn().mockResolvedValue(undefined);
  const platform = {
    getMerchantIdentity,
    verifyPaymentsRead,
  } as unknown as jest.Mocked<CloverPlatformMerchantVerificationGateway>;

  const service = new CloverMerchantAuthorizationService(
    prisma,
    vault,
    oauth,
    platform,
    config,
  );

  const start = async () => {
    await service.start({ merchant_id: merchantId, client_id: 'app-123' });
    return buildAuthorizeUrl.mock.calls.at(-1)?.[0] as string;
  };

  return {
    service,
    oauth,
    platform,
    tokens,
    vault,
    oauthStateRequest,
    cloverMerchantAuthorization,
    authorizationUpsertMock,
    buildAuthorizeUrl,
    exchangeAuthorizationCode,
    getMerchantIdentity,
    verifyPaymentsRead,
    store,
    storeFindUniqueArgs,
    start,
    getState: () => stateRow,
    getAuthorizationUpsert: () => authorizationUpsert,
    setState: (value: StateRow | null) => {
      stateRow = value;
    },
    setExistingAuthorization: (
      value: { storeStableId: string | null } | null,
    ) => {
      existingAuthorization = value;
    },
    setMappingConflict: (value: { merchantId: string } | null) => {
      mappingConflict = value;
    },
    setStoreActive: (value: boolean) => {
      storeActive = value;
    },
  };
};

describe('CloverMerchantAuthorizationService', () => {
  it('creates a short-lived one-time state without persisting the raw state or accepting an open redirect', async () => {
    const harness = createHarness();
    const result = await harness.service.start({
      merchantId,
      clientId: 'app-123',
      redirect_uri: 'https://evil.example/callback',
    } as never);
    const rawState = harness.buildAuthorizeUrl.mock.calls[0][0];
    const state = harness.getState();

    expect(result).toContain('https://www.clover.com/oauth/v2/authorize');
    expect(rawState).toHaveLength(43);
    expect(state?.stateHash).not.toBe(rawState);
    expect(state?.stateHash).toHaveLength(64);
    expect(state?.redirectUri).toBe(callbackUrl);
    expect(state!.expiresAt.getTime() - state!.issuedAt.getTime()).toBe(
      600_000,
    );
    expect(
      JSON.stringify(harness.oauthStateRequest.create.mock.calls[0]),
    ).not.toContain(rawState);
  });

  it('rejects conflicting or malformed launch identifiers', async () => {
    const harness = createHarness();
    await expectOAuthError(
      harness.service.start({
        merchant_id: merchantId,
        merchantId: 'OTHER123',
      }),
      'INVALID_LAUNCH',
    );
    await expectOAuthError(
      harness.service.start({ merchant_id: '../../etc/passwd' }),
      'INVALID_LAUNCH',
    );
    await expectOAuthError(
      harness.service.start({
        merchant_id: merchantId,
        client_id: 'wrong-app',
      }),
      'INVALID_LAUNCH',
    );
  });

  it('exchanges, verifies Merchant Read and Payment Read, maps by stable ID, and persists encrypted credentials', async () => {
    const harness = createHarness();
    const state = await harness.start();

    const result = await harness.service.complete({
      code: 'authorization-code',
      state,
      merchant_id: merchantId,
      client_id: 'app-123',
    });

    expect(result).toEqual({
      merchantId,
      merchantName: 'SanQ Roujiamo',
      storeStableId,
      status: 'ACTIVE',
    });
    expect(harness.getMerchantIdentity.mock.calls).toEqual([
      [merchantId, harness.tokens.accessToken],
    ]);
    expect(harness.verifyPaymentsRead.mock.calls).toEqual([
      [merchantId, harness.tokens.accessToken],
    ]);
    expect(harness.storeFindUniqueArgs).toContainEqual({
      where: { storeStableId },
      select: { isActive: true },
    });
    expect(
      harness.storeFindUniqueArgs.every(
        ({ where }) => !Object.prototype.hasOwnProperty.call(where, 'id'),
      ),
    ).toBe(true);
    const upsert = harness.getAuthorizationUpsert();
    expect(upsert).not.toBeNull();
    if (!upsert) throw new Error('expected authorization upsert');
    expect(upsert.where).toEqual({ merchantId });
    expect(upsert.create.storeStableId).toBe(storeStableId);
    expect(upsert.create.status).toBe('ACTIVE');
    expect(upsert.create.encryptedAccessToken).not.toContain(
      harness.tokens.accessToken,
    );
    expect(upsert.create.encryptedRefreshToken).not.toContain(
      harness.tokens.refreshToken,
    );
    expect(harness.vault.decrypt(upsert.create.encryptedAccessToken)).toBe(
      harness.tokens.accessToken,
    );
    expect(harness.getState()?.status).toBe('COMPLETED');
    expect(harness.getState()?.encryptedExchangeResult).toBeNull();
  });

  it('never writes access tokens, refresh tokens, authorization codes, or state values to OAuth logs', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const harness = createHarness();
    const state = await harness.start();

    await harness.service.complete({
      code: 'authorization-code-secret',
      state,
      merchant_id: merchantId,
    });

    const logs = JSON.stringify(logSpy.mock.calls);
    expect(logs).not.toContain(harness.tokens.accessToken);
    expect(logs).not.toContain(harness.tokens.refreshToken);
    expect(logs).not.toContain('authorization-code-secret');
    expect(logs).not.toContain(state);
    logSpy.mockRestore();
  });

  it('preserves an existing stable store mapping during reauthorization', async () => {
    const harness = createHarness();
    harness.setExistingAuthorization({ storeStableId: 'existing_store' });
    const state = await harness.start();

    const result = await harness.service.complete({
      code: 'authorization-code',
      state,
      merchant_id: merchantId,
    });

    expect(result.storeStableId).toBe('existing_store');
    const upsert = harness.getAuthorizationUpsert();
    expect(upsert).not.toBeNull();
    if (!upsert) throw new Error('expected authorization upsert');
    expect(upsert.update.tokenVersion).toEqual({ increment: 1 });
    expect(upsert.update.refreshLeaseId).toBeNull();
    expect(upsert.update.revokedAt).toBeNull();
  });

  it('keeps a verified merchant unbound instead of guessing when no explicit mapping exists', async () => {
    const harness = createHarness();
    harness.setExistingAuthorization(null);
    (
      harness.service as unknown as {
        config: { merchantId?: string; storeStableId?: string };
      }
    ).config.storeStableId = undefined;
    const state = await harness.start();

    const result = await harness.service.complete({
      code: 'authorization-code',
      state,
      merchant_id: merchantId,
    });

    expect(result.status).toBe('PENDING_BINDING');
    expect(result.storeStableId).toBeNull();
  });

  it('rejects missing or unknown state before touching the token endpoint', async () => {
    const missing = createHarness();
    await expectOAuthError(
      missing.service.complete({
        code: 'authorization-code',
        merchant_id: merchantId,
      }),
      'INVALID_STATE',
    );
    expect(missing.exchangeAuthorizationCode.mock.calls).toHaveLength(0);

    const unknown = createHarness();
    await expectOAuthError(
      unknown.service.complete({
        code: 'authorization-code',
        state: 'unknown-state',
        merchant_id: merchantId,
      }),
      'INVALID_STATE',
    );
    expect(unknown.exchangeAuthorizationCode.mock.calls).toHaveLength(0);
  });

  it('rejects expired and replayed state', async () => {
    const expired = createHarness();
    const expiredRawState = await expired.start();
    expired.getState()!.expiresAt = new Date(Date.now() - 1);
    await expectOAuthError(
      expired.service.complete({
        code: 'authorization-code',
        state: expiredRawState,
        merchant_id: merchantId,
      }),
      'EXPIRED_STATE',
    );

    const replayed = createHarness();
    const replayedRawState = await replayed.start();
    replayed.getState()!.status = 'COMPLETED';
    await expectOAuthError(
      replayed.service.complete({
        code: 'authorization-code',
        state: replayedRawState,
        merchant_id: merchantId,
      }),
      'STATE_REPLAYED',
    );
  });

  it('distinguishes denial, missing code, and callback merchant mismatch', async () => {
    const denied = createHarness();
    const deniedState = await denied.start();
    await expectOAuthError(
      denied.service.complete({
        state: deniedState,
        merchant_id: merchantId,
        error: 'access_denied',
      }),
      'USER_DENIED',
    );
    expect(denied.exchangeAuthorizationCode.mock.calls).toHaveLength(0);

    const providerError = createHarness();
    const providerErrorState = await providerError.start();
    await expectOAuthError(
      providerError.service.complete({
        state: providerErrorState,
        merchant_id: merchantId,
        error: 'server_error',
      }),
      'PROVIDER_ERROR',
      true,
    );

    const missing = createHarness();
    const missingState = await missing.start();
    await expectOAuthError(
      missing.service.complete({
        state: missingState,
        merchant_id: merchantId,
      }),
      'MISSING_CODE',
    );

    const mismatch = createHarness();
    const mismatchState = await mismatch.start();
    await expectOAuthError(
      mismatch.service.complete({
        code: 'authorization-code',
        state: mismatchState,
        merchant_id: 'OTHER123',
      }),
      'MERCHANT_MISMATCH',
    );
  });

  it('distinguishes token endpoint final failures from retryable provider timeouts', async () => {
    const finalFailure = createHarness();
    const finalState = await finalFailure.start();
    finalFailure.exchangeAuthorizationCode.mockRejectedValueOnce(
      new CloverOAuthProviderError('CLOVER_OAUTH_HTTP_400', false, 400),
    );
    await expectOAuthError(
      finalFailure.service.complete({
        code: 'bad-code',
        state: finalState,
        merchant_id: merchantId,
      }),
      'TOKEN_EXCHANGE_FAILED',
      false,
    );

    const timeout = createHarness();
    const timeoutState = await timeout.start();
    timeout.exchangeAuthorizationCode.mockRejectedValueOnce(
      new CloverOAuthProviderError('CLOVER_OAUTH_TIMEOUT', true),
    );
    await expectOAuthError(
      timeout.service.complete({
        code: 'authorization-code',
        state: timeoutState,
        merchant_id: merchantId,
      }),
      'TOKEN_EXCHANGE_FAILED',
      true,
    );
  });

  it('rejects a token that cannot prove the launched merchant identity', async () => {
    const harness = createHarness();
    const state = await harness.start();
    harness.getMerchantIdentity.mockResolvedValueOnce({
      id: 'DIFFERENT_MERCHANT',
      name: 'Other Merchant',
    });

    await expectOAuthError(
      harness.service.complete({
        code: 'authorization-code',
        state,
        merchant_id: merchantId,
      }),
      'MERCHANT_MISMATCH',
    );
    expect(harness.cloverMerchantAuthorization.upsert).not.toHaveBeenCalled();
  });

  it('requires the authorized token to read Payments before activating it', async () => {
    const harness = createHarness();
    const state = await harness.start();
    harness.verifyPaymentsRead.mockRejectedValueOnce(
      new CloverPlatformVerificationError(
        'CLOVER_PAYMENTS_READ_HTTP_403',
        false,
        403,
      ),
    );

    await expectOAuthError(
      harness.service.complete({
        code: 'authorization-code',
        state,
        merchant_id: merchantId,
      }),
      'PAYMENTS_PERMISSION_MISSING',
    );
    expect(harness.cloverMerchantAuthorization.upsert).not.toHaveBeenCalled();
  });

  it('rejects an explicit store mapping already owned by another Clover merchant', async () => {
    const harness = createHarness();
    harness.setMappingConflict({ merchantId: 'OTHER123' });
    const state = await harness.start();

    await expectOAuthError(
      harness.service.complete({
        code: 'authorization-code',
        state,
        merchant_id: merchantId,
      }),
      'STORE_MAPPING_CONFLICT',
    );
    expect(harness.cloverMerchantAuthorization.upsert).not.toHaveBeenCalled();
  });
});
