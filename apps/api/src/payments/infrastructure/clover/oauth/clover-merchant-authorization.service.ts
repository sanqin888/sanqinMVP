import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import { AppLogger } from '../../../../common/app-logger';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CloverProviderConfig } from '../clover-provider.config';
import { CloverCredentialVaultService } from './clover-credential-vault.service';
import {
  CloverPlatformMerchantVerificationGateway,
  CloverPlatformVerificationError,
} from '../platform/clover-platform-merchant-verification.gateway';
import {
  CloverOAuthClient,
  CloverOAuthProviderError,
  type CloverOAuthTokenPair,
} from './clover-oauth.client';

const MERCHANT_ID_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;

export type CloverOAuthFailureCode =
  | 'CONFIGURATION_ERROR'
  | 'INVALID_LAUNCH'
  | 'INVALID_STATE'
  | 'EXPIRED_STATE'
  | 'STATE_REPLAYED'
  | 'USER_DENIED'
  | 'PROVIDER_ERROR'
  | 'MISSING_CODE'
  | 'MERCHANT_MISMATCH'
  | 'PAYMENTS_PERMISSION_MISSING'
  | 'STORE_MAPPING_CONFLICT'
  | 'TOKEN_EXCHANGE_FAILED'
  | 'TEMPORARY_FAILURE';

export class CloverMerchantAuthorizationError extends Error {
  constructor(
    readonly publicCode: CloverOAuthFailureCode,
    readonly retryable = false,
  ) {
    super(publicCode);
    this.name = 'CloverMerchantAuthorizationError';
  }
}

export type CloverOAuthLaunchInput = {
  merchantId?: string;
  merchant_id?: string;
  mId?: string;
  clientId?: string;
  client_id?: string;
};

export type CloverOAuthCallbackInput = {
  code?: string;
  state?: string;
  merchantId?: string;
  merchant_id?: string;
  clientId?: string;
  client_id?: string;
  error?: string;
};

export type CloverOAuthCompletion = {
  merchantId: string;
  merchantName: string | null;
  storeStableId: string | null;
  status: 'ACTIVE' | 'PENDING_BINDING';
};

type ExchangedState = CloverOAuthTokenPair;

@Injectable()
export class CloverMerchantAuthorizationService {
  private readonly logger = new AppLogger(
    CloverMerchantAuthorizationService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: CloverCredentialVaultService,
    private readonly oauth: CloverOAuthClient,
    private readonly platform: CloverPlatformMerchantVerificationGateway,
    private readonly config: CloverProviderConfig,
  ) {}

  async start(input: CloverOAuthLaunchInput): Promise<string> {
    this.requireOAuthConfiguration();
    const merchantId = this.resolveConsistentValue([
      input.merchant_id,
      input.merchantId,
      input.mId,
    ]);
    if (!merchantId || !MERCHANT_ID_PATTERN.test(merchantId)) {
      throw new CloverMerchantAuthorizationError('INVALID_LAUNCH');
    }
    const launchClientId = this.resolveConsistentValue([
      input.client_id,
      input.clientId,
    ]);
    if (
      launchClientId &&
      launchClientId !== this.config.oauthClientId
    ) {
      throw new CloverMerchantAuthorizationError('INVALID_LAUNCH');
    }

    const state = randomBytes(32).toString('base64url');
    const stateHash = this.hashState(state);
    const issuedAt = new Date();
    const expiresAt = new Date(
      issuedAt.getTime() + this.config.oauthStateTtlMs,
    );
    await this.prisma.cloverOAuthStateRequest.deleteMany({
      where: { expiresAt: { lte: issuedAt } },
    });
    await this.prisma.cloverOAuthStateRequest.create({
      data: {
        stateHash,
        merchantId,
        clientId: this.config.oauthClientId!,
        redirectUri: this.config.oauthCallbackUrl!,
        issuedAt,
        expiresAt,
      },
    });
    this.logger.log(`[CloverOAuth] authorization started merchantId=${merchantId}`);
    return this.oauth.buildAuthorizeUrl(state);
  }

  async complete(
    input: CloverOAuthCallbackInput,
  ): Promise<CloverOAuthCompletion> {
    this.requireOAuthConfiguration();
    const rawState = input.state?.trim();
    if (!rawState) {
      throw new CloverMerchantAuthorizationError('INVALID_STATE');
    }
    const stateHash = this.hashState(rawState);
    const state = await this.prisma.cloverOAuthStateRequest.findUnique({
      where: { stateHash },
    });
    if (!state) {
      throw new CloverMerchantAuthorizationError('INVALID_STATE');
    }
    const now = new Date();
    if (state.expiresAt <= now) {
      await this.failState(stateHash, 'expired-state');
      throw new CloverMerchantAuthorizationError('EXPIRED_STATE');
    }
    if (state.status === 'COMPLETED' || state.status === 'FAILED') {
      throw new CloverMerchantAuthorizationError('STATE_REPLAYED');
    }
    if (state.clientId !== this.config.oauthClientId) {
      await this.failState(stateHash, 'client-mismatch');
      throw new CloverMerchantAuthorizationError('INVALID_STATE');
    }
    if (state.redirectUri !== this.config.oauthCallbackUrl) {
      await this.failState(stateHash, 'redirect-mismatch');
      throw new CloverMerchantAuthorizationError('INVALID_STATE');
    }

    const callbackClientId = this.resolveConsistentValue(
      [input.client_id, input.clientId],
      'INVALID_STATE',
    );
    if (callbackClientId && callbackClientId !== state.clientId) {
      await this.failState(stateHash, 'client-mismatch');
      throw new CloverMerchantAuthorizationError('INVALID_STATE');
    }

    const callbackMerchantId = this.resolveConsistentValue(
      [input.merchant_id, input.merchantId],
      'MERCHANT_MISMATCH',
    );
    if (callbackMerchantId && callbackMerchantId !== state.merchantId) {
      await this.failState(stateHash, 'merchant-mismatch');
      throw new CloverMerchantAuthorizationError('MERCHANT_MISMATCH');
    }

    if (input.error) {
      const denied = input.error === 'access_denied';
      await this.failState(
        stateHash,
        denied ? 'authorization-denied' : 'provider-error',
      );
      throw new CloverMerchantAuthorizationError(
        denied ? 'USER_DENIED' : 'PROVIDER_ERROR',
        !denied,
      );
    }
    if (!callbackMerchantId) {
      await this.failState(stateHash, 'merchant-missing');
      throw new CloverMerchantAuthorizationError('MERCHANT_MISMATCH');
    }
    if (!input.code?.trim()) {
      await this.failState(stateHash, 'missing-code');
      throw new CloverMerchantAuthorizationError('MISSING_CODE');
    }

    let tokens: ExchangedState | null = null;
    if (state.status === 'EXCHANGED') {
      tokens = this.decryptExchangedState(state.encryptedExchangeResult);
    } else if (state.status === 'EXCHANGING') {
      throw new CloverMerchantAuthorizationError('TEMPORARY_FAILURE', true);
    } else {
      const claimed = await this.prisma.cloverOAuthStateRequest.updateMany({
        where: {
          stateHash,
          status: 'ISSUED',
          expiresAt: { gt: now },
        },
        data: { status: 'EXCHANGING', consumedAt: now },
      });
      if (claimed.count !== 1) {
        throw new CloverMerchantAuthorizationError('STATE_REPLAYED');
      }
      try {
        tokens = await this.oauth.exchangeAuthorizationCode(input.code.trim());
      } catch (error) {
        await this.failState(stateHash, this.providerErrorCode(error));
        throw new CloverMerchantAuthorizationError(
          'TOKEN_EXCHANGE_FAILED',
          error instanceof CloverOAuthProviderError && error.retryable,
        );
      }
      const persisted = await this.prisma.cloverOAuthStateRequest.updateMany({
        where: { stateHash, status: 'EXCHANGING' },
        data: {
          status: 'EXCHANGED',
          encryptedExchangeResult: this.vault.encrypt(
            JSON.stringify(this.serializeTokens(tokens)),
          ),
        },
      });
      if (persisted.count !== 1) {
        throw new CloverMerchantAuthorizationError('TEMPORARY_FAILURE', true);
      }
    }

    if (!tokens) {
      throw new CloverMerchantAuthorizationError('TEMPORARY_FAILURE', true);
    }

    let merchant;
    try {
      merchant = await this.platform.getMerchantIdentity(
        state.merchantId,
        tokens.accessToken,
      );
    } catch (error) {
      throw this.verificationError(error);
    }
    if (merchant.id !== state.merchantId) {
      await this.failState(stateHash, 'merchant-identity-mismatch');
      throw new CloverMerchantAuthorizationError('MERCHANT_MISMATCH');
    }
    try {
      await this.platform.verifyPaymentsRead(
        state.merchantId,
        tokens.accessToken,
      );
    } catch (error) {
      if (
        error instanceof CloverPlatformVerificationError &&
        (error.httpStatus === 401 || error.httpStatus === 403)
      ) {
        await this.failState(stateHash, 'payments-permission-missing');
        throw new CloverMerchantAuthorizationError(
          'PAYMENTS_PERMISSION_MISSING',
        );
      }
      throw this.verificationError(error);
    }

    const storeStableId = await this.resolveStoreMapping(state.merchantId);
    const status = storeStableId ? 'ACTIVE' : 'PENDING_BINDING';
    await this.persistAuthorization({
      merchantId: state.merchantId,
      merchantName: merchant.name,
      storeStableId,
      status,
      tokens,
    });
    const completed = await this.prisma.cloverOAuthStateRequest.updateMany({
      where: { stateHash, status: 'EXCHANGED' },
      data: {
        status: 'COMPLETED',
        encryptedExchangeResult: null,
        lastErrorCode: null,
      },
    });
    if (completed.count !== 1) {
      throw new CloverMerchantAuthorizationError('TEMPORARY_FAILURE', true);
    }

    this.logger.log(
      `[CloverOAuth] authorization completed merchantId=${state.merchantId} storeStableId=${storeStableId ?? 'unbound'} status=${status}`,
    );
    return {
      merchantId: state.merchantId,
      merchantName: merchant.name,
      storeStableId,
      status,
    };
  }

  private async resolveStoreMapping(merchantId: string): Promise<string | null> {
    const existing = await this.prisma.cloverMerchantAuthorization.findUnique({
      where: { merchantId },
      select: { storeStableId: true },
    });
    if (existing?.storeStableId) {
      const store = await this.prisma.store.findUnique({
        where: { storeStableId: existing.storeStableId },
        select: { isActive: true },
      });
      if (store?.isActive) return existing.storeStableId;
    }

    if (
      this.config.merchantId !== merchantId ||
      !this.config.storeStableId
    ) {
      return null;
    }
    const store = await this.prisma.store.findUnique({
      where: { storeStableId: this.config.storeStableId },
      select: { isActive: true },
    });
    if (!store?.isActive) return null;
    const conflict = await this.prisma.cloverMerchantAuthorization.findUnique({
      where: { storeStableId: this.config.storeStableId },
      select: { merchantId: true },
    });
    if (conflict && conflict.merchantId !== merchantId) {
      throw new CloverMerchantAuthorizationError('STORE_MAPPING_CONFLICT');
    }
    return this.config.storeStableId;
  }

  private async persistAuthorization(input: {
    merchantId: string;
    merchantName: string | null;
    storeStableId: string | null;
    status: 'ACTIVE' | 'PENDING_BINDING';
    tokens: CloverOAuthTokenPair;
  }): Promise<void> {
    const encryptedAccessToken = this.vault.encrypt(input.tokens.accessToken);
    const encryptedRefreshToken = this.vault.encrypt(input.tokens.refreshToken);
    const authorizedAt = new Date();
    await this.prisma.cloverMerchantAuthorization.upsert({
      where: { merchantId: input.merchantId },
      create: {
        merchantId: input.merchantId,
        merchantName: input.merchantName,
        storeStableId: input.storeStableId,
        encryptedAccessToken,
        encryptedRefreshToken,
        accessTokenExpiresAt: input.tokens.accessTokenExpiresAt,
        refreshTokenExpiresAt: input.tokens.refreshTokenExpiresAt,
        scopes: this.config.oauthScopesMetadata,
        status: input.status,
        authorizedAt,
      },
      update: {
        merchantName: input.merchantName,
        storeStableId: input.storeStableId,
        encryptedAccessToken,
        encryptedRefreshToken,
        accessTokenExpiresAt: input.tokens.accessTokenExpiresAt,
        refreshTokenExpiresAt: input.tokens.refreshTokenExpiresAt,
        scopes: this.config.oauthScopesMetadata,
        status: input.status,
        tokenVersion: { increment: 1 },
        refreshLeaseId: null,
        refreshLeaseExpiresAt: null,
        authorizedAt,
        refreshedAt: null,
        revokedAt: null,
      },
    });
  }

  private decryptExchangedState(serialized: string | null): ExchangedState {
    if (!serialized) {
      throw new CloverMerchantAuthorizationError('TEMPORARY_FAILURE', true);
    }
    try {
      const value = JSON.parse(this.vault.decrypt(serialized)) as {
        accessToken?: unknown;
        refreshToken?: unknown;
        accessTokenExpiresAt?: unknown;
        refreshTokenExpiresAt?: unknown;
      };
      if (
        typeof value.accessToken !== 'string' ||
        typeof value.refreshToken !== 'string' ||
        typeof value.accessTokenExpiresAt !== 'string'
      ) {
        throw new Error('invalid exchange state');
      }
      const accessTokenExpiresAt = new Date(value.accessTokenExpiresAt);
      const refreshTokenExpiresAt =
        typeof value.refreshTokenExpiresAt === 'string'
          ? new Date(value.refreshTokenExpiresAt)
          : null;
      if (
        Number.isNaN(accessTokenExpiresAt.getTime()) ||
        (refreshTokenExpiresAt && Number.isNaN(refreshTokenExpiresAt.getTime()))
      ) {
        throw new Error('invalid exchange state');
      }
      return {
        accessToken: value.accessToken,
        refreshToken: value.refreshToken,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
      };
    } catch (error) {
      if (error instanceof CloverMerchantAuthorizationError) throw error;
      throw new CloverMerchantAuthorizationError('TEMPORARY_FAILURE', true);
    }
  }

  private serializeTokens(tokens: CloverOAuthTokenPair) {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt?.toISOString() ?? null,
    };
  }

  private verificationError(error: unknown): CloverMerchantAuthorizationError {
    if (error instanceof CloverPlatformVerificationError) {
      return new CloverMerchantAuthorizationError(
        error.retryable ? 'TEMPORARY_FAILURE' : 'PROVIDER_ERROR',
        error.retryable,
      );
    }
    return new CloverMerchantAuthorizationError('TEMPORARY_FAILURE', true);
  }

  private async failState(stateHash: string, lastErrorCode: string): Promise<void> {
    await this.prisma.cloverOAuthStateRequest.updateMany({
      where: {
        stateHash,
        status: { in: ['ISSUED', 'EXCHANGING', 'EXCHANGED'] },
      },
      data: {
        status: 'FAILED',
        encryptedExchangeResult: null,
        lastErrorCode,
      },
    });
  }

  private providerErrorCode(error: unknown): string {
    return error instanceof CloverOAuthProviderError
      ? error.code
      : 'oauth-token-exchange-failed';
  }

  private resolveConsistentValue(
    values: Array<string | undefined>,
    conflictCode: CloverOAuthFailureCode = 'INVALID_LAUNCH',
  ): string | null {
    const normalized = values
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));
    if (new Set(normalized).size > 1) {
      throw new CloverMerchantAuthorizationError(conflictCode);
    }
    return normalized[0] ?? null;
  }

  private hashState(state: string): string {
    return createHash('sha256').update(state).digest('hex');
  }

  private requireOAuthConfiguration(): void {
    if (
      !this.config.oauthClientId ||
      !this.config.oauthClientSecret ||
      !this.config.oauthCallbackUrl ||
      !this.vault.isConfigured()
    ) {
      throw new CloverMerchantAuthorizationError('CONFIGURATION_ERROR');
    }
    let callback: URL;
    try {
      callback = new URL(this.config.oauthCallbackUrl);
    } catch {
      throw new CloverMerchantAuthorizationError('CONFIGURATION_ERROR');
    }
    if (callback.protocol !== 'https:' || callback.username || callback.password) {
      throw new CloverMerchantAuthorizationError('CONFIGURATION_ERROR');
    }
  }
}
