import { Injectable } from '@nestjs/common';
import type { CloverMerchantAuthorization } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../../prisma/prisma.service';
import { CloverProviderConfig } from '../clover-provider.config';
import { CloverCredentialVaultService } from './clover-credential-vault.service';
import {
  CloverOAuthClient,
  CloverOAuthProviderError,
} from './clover-oauth.client';

const REFRESH_LEASE_MS = 12_000;
const REFRESH_WAIT_MS = 250;
const REFRESH_WAIT_ATTEMPTS = 20;

export type CloverMerchantAccessToken = {
  token: string;
};

export class CloverMerchantCredentialError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'CloverMerchantCredentialError';
  }
}

@Injectable()
export class CloverMerchantAccessTokenService {
  private readonly refreshFlights = new Map<
    string,
    Promise<CloverMerchantAccessToken | null>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: CloverCredentialVaultService,
    private readonly oauth: CloverOAuthClient,
    private readonly config: CloverProviderConfig,
  ) {}

  async hasUsableCredential(merchantId: string): Promise<boolean> {
    const normalizedMerchantId = merchantId.trim();
    if (!normalizedMerchantId) return false;
    const row = await this.prisma.cloverMerchantAuthorization.findUnique({
      where: { merchantId: normalizedMerchantId },
    });
    return Boolean(
      row?.status === 'ACTIVE' &&
        this.vault.isConfigured() &&
        (row.accessTokenExpiresAt.getTime() > Date.now() ||
          !row.refreshTokenExpiresAt ||
          row.refreshTokenExpiresAt.getTime() > Date.now()),
    );
  }

  async getAccessToken(
    merchantId: string,
    options: { forceRefresh?: boolean } = {},
  ): Promise<CloverMerchantAccessToken | null> {
    const normalizedMerchantId = merchantId.trim();
    if (!normalizedMerchantId) return null;

    const row = await this.prisma.cloverMerchantAuthorization.findUnique({
      where: { merchantId: normalizedMerchantId },
    });
    if (row?.status === 'ACTIVE' && this.vault.isConfigured()) {
      const needsRefresh =
        options.forceRefresh === true ||
        row.accessTokenExpiresAt.getTime() <=
          Date.now() + this.config.oauthRefreshSkewMs;
      if (!needsRefresh) {
        return {
          token: this.vault.decrypt(row.encryptedAccessToken),
        };
      }
      return this.refreshSingleFlight(row);
    }

    return null;
  }

  private refreshSingleFlight(
    row: CloverMerchantAuthorization,
  ): Promise<CloverMerchantAccessToken | null> {
    const existing = this.refreshFlights.get(row.merchantId);
    if (existing) return existing;
    const flight = this.refreshDatabaseCredential(row).finally(() => {
      if (this.refreshFlights.get(row.merchantId) === flight) {
        this.refreshFlights.delete(row.merchantId);
      }
    });
    this.refreshFlights.set(row.merchantId, flight);
    return flight;
  }

  private async refreshDatabaseCredential(
    initial: CloverMerchantAuthorization,
  ): Promise<CloverMerchantAccessToken | null> {
    if (
      initial.refreshTokenExpiresAt &&
      initial.refreshTokenExpiresAt.getTime() <= Date.now()
    ) {
      await this.markReauthRequired(initial);
      return null;
    }

    const leaseId = randomUUID();
    const leaseNow = new Date();
    const leaseExpiresAt = new Date(leaseNow.getTime() + REFRESH_LEASE_MS);
    const claimed = await this.prisma.cloverMerchantAuthorization.updateMany({
      where: {
        id: initial.id,
        merchantId: initial.merchantId,
        status: 'ACTIVE',
        tokenVersion: initial.tokenVersion,
        OR: [
          { refreshLeaseId: null },
          { refreshLeaseExpiresAt: null },
          { refreshLeaseExpiresAt: { lte: leaseNow } },
        ],
      },
      data: { refreshLeaseId: leaseId, refreshLeaseExpiresAt: leaseExpiresAt },
    });

    if (claimed.count !== 1) {
      return this.waitForRefreshWinner(initial);
    }

    let refreshed;
    try {
      const refreshToken = this.vault.decrypt(initial.encryptedRefreshToken);
      refreshed = await this.oauth.refreshTokens(refreshToken);
    } catch (error) {
      await this.handleRefreshFailure(initial, leaseId, error);
      if (error instanceof CloverOAuthProviderError && error.retryable) {
        throw new CloverMerchantCredentialError(error.code, true);
      }
      return null;
    }

    const updated = await this.prisma.cloverMerchantAuthorization.updateMany({
      where: {
        id: initial.id,
        merchantId: initial.merchantId,
        status: 'ACTIVE',
        tokenVersion: initial.tokenVersion,
        refreshLeaseId: leaseId,
      },
      data: {
        encryptedAccessToken: this.vault.encrypt(refreshed.accessToken),
        encryptedRefreshToken: this.vault.encrypt(refreshed.refreshToken),
        accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
        refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt,
        tokenVersion: { increment: 1 },
        refreshedAt: new Date(),
        refreshLeaseId: null,
        refreshLeaseExpiresAt: null,
      },
    });

    if (updated.count === 1) {
      return { token: refreshed.accessToken };
    }

    // A concurrent re-authorization or newer refresh won the CAS. Never write
    // the now-stale refresh result over the newer credential pair.
    const winner = await this.prisma.cloverMerchantAuthorization.findUnique({
      where: { merchantId: initial.merchantId },
    });
    if (winner?.status === 'ACTIVE' && this.vault.isConfigured()) {
      return {
        token: this.vault.decrypt(winner.encryptedAccessToken),
      };
    }
    return null;
  }

  private async waitForRefreshWinner(
    initial: CloverMerchantAuthorization,
  ): Promise<CloverMerchantAccessToken | null> {
    for (let attempt = 0; attempt < REFRESH_WAIT_ATTEMPTS; attempt += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, REFRESH_WAIT_MS));
      const winner = await this.prisma.cloverMerchantAuthorization.findUnique({
        where: { merchantId: initial.merchantId },
      });
      if (!winner || winner.status !== 'ACTIVE') {
        return null;
      }
      if (winner.tokenVersion !== initial.tokenVersion) {
        return {
          token: this.vault.decrypt(winner.encryptedAccessToken),
        };
      }
      const leaseExpired =
        !winner.refreshLeaseExpiresAt || winner.refreshLeaseExpiresAt <= new Date();
      if (leaseExpired) {
        return this.refreshDatabaseCredential(winner);
      }
    }
    throw new CloverMerchantCredentialError(
      'CLOVER_OAUTH_REFRESH_IN_PROGRESS',
      true,
    );
  }

  private async handleRefreshFailure(
    initial: CloverMerchantAuthorization,
    leaseId: string,
    error: unknown,
  ): Promise<void> {
    if (error instanceof CloverOAuthProviderError && !error.retryable) {
      await this.prisma.cloverMerchantAuthorization.updateMany({
        where: {
          id: initial.id,
          tokenVersion: initial.tokenVersion,
          refreshLeaseId: leaseId,
        },
        data: {
          status: 'REAUTH_REQUIRED',
          refreshLeaseId: null,
          refreshLeaseExpiresAt: null,
        },
      });
      return;
    }
    await this.prisma.cloverMerchantAuthorization.updateMany({
      where: {
        id: initial.id,
        tokenVersion: initial.tokenVersion,
        refreshLeaseId: leaseId,
      },
      data: { refreshLeaseId: null, refreshLeaseExpiresAt: null },
    });
  }

  private async markReauthRequired(
    row: CloverMerchantAuthorization,
  ): Promise<void> {
    await this.prisma.cloverMerchantAuthorization.updateMany({
      where: {
        id: row.id,
        status: 'ACTIVE',
        tokenVersion: row.tokenVersion,
      },
      data: {
        status: 'REAUTH_REQUIRED',
        refreshLeaseId: null,
        refreshLeaseExpiresAt: null,
      },
    });
  }
}
