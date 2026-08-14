import { Injectable } from '@nestjs/common';
import {
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberMerchantConnectionRepositoryPort,
  UberMerchantStoreMapping,
  UberOAuthStatePort,
<<<<<<< HEAD
  UberStoreMappingRepositoryPort,
} from '../../application/merchant/uber-merchant-persistence.ports';
import type { UberOperationsAlertRepositoryPort } from '../../application/operations/uber-operations-alert.ports';
import { redactUberLogText } from '../shared/uber-log.utils';
import { UberCredentialVaultService } from '../crypto/uber-credential-vault.service';
import { UberTelemetryService } from './uber-telemetry.service';
import type { UberMerchantCredentialStore } from '../uber-api/uber-merchant-credential.port';

const mapStoreMapping = (
  row: UberMerchantStoreMapping,
): UberMerchantStoreMapping => ({
  merchantUberUserId: row.merchantUberUserId,
  uberStoreId: row.uberStoreId,
  storeName: row.storeName,
  locationSummary: row.locationSummary,
  isProvisioned: row.isProvisioned,
  provisionedAt: row.provisionedAt,
  posExternalStoreId: row.posExternalStoreId,
});
=======
  UberOperationsAlertRepositoryPort,
  UberStoreMappingRepositoryPort,
} from '../../application/ports/uber-persistence.ports';
import { redactUberLogText } from '../../domain/shared/uber-integration.utils';
import { UberCredentialVaultService } from '../crypto/uber-credential-vault.service';
import { UberTelemetryService } from '../observability/uber-telemetry.service';

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
>>>>>>> origin/main

@Injectable()
export class UberOAuthStatePrismaAdapter implements UberOAuthStatePort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: UberCredentialVaultService,
  ) {}
  async saveOAuthState(
    input: Parameters<UberOAuthStatePort['saveOAuthState']>[0],
  ) {
    await this.prisma.uberOAuthStateRequest.deleteMany({
      where: { expiresAt: { lte: input.issuedAt } },
    });
    await this.prisma.uberOAuthStateRequest.create({ data: input });
  }
  findOAuthState(nonce: string) {
    return this.prisma.uberOAuthStateRequest.findUnique({ where: { nonce } });
  }
  async claimOAuthState(
    input: Parameters<UberOAuthStatePort['claimOAuthState']>[0],
  ) {
    return (
      (
        await this.prisma.uberOAuthStateRequest.updateMany({
          where: {
            nonce: input.nonce,
            adminSessionId: input.adminSessionId,
            issuedAt: input.issuedAt,
            expiresAt: { gt: input.now },
            status: 'ISSUED',
          },
          data: { status: 'EXCHANGING', consumedAt: input.now },
        })
      ).count === 1
    );
  }
  async releaseOAuthStateForRetry(nonce: string, category: string) {
    return (
      (
        await this.prisma.uberOAuthStateRequest.updateMany({
          where: { nonce, status: 'EXCHANGING', retryCount: { lt: 3 } },
          data: {
            status: 'ISSUED',
            retryCount: { increment: 1 },
            lastErrorCategory: category,
          },
        })
      ).count === 1
    );
  }
  async failOAuthState(nonce: string, category: string) {
    return (
      (
        await this.prisma.uberOAuthStateRequest.updateMany({
          where: { nonce, status: { in: ['ISSUED', 'EXCHANGING'] } },
          data: { status: 'FAILED', lastErrorCategory: category },
        })
      ).count === 1
    );
  }
  async saveExchangedTokens(
    input: Parameters<UberOAuthStatePort['saveExchangedTokens']>[0],
  ) {
    const { nonce, ...tokens } = input;
    const encryptedExchangeResult = this.vault.encrypt(JSON.stringify(tokens));
    return (
      (
        await this.prisma.uberOAuthStateRequest.updateMany({
          where: { nonce, status: 'EXCHANGING' },
          data: {
            status: 'EXCHANGED',
            encryptedExchangeResult,
            uberUserId: tokens.uberUserId,
            scope: tokens.scope,
            tokenType: tokens.tokenType,
            tokenExpiresAt: tokens.expiresAt,
          },
        })
      ).count === 1
    );
  }
  async loadExchangedTokens(nonce: string) {
    const row = await this.prisma.uberOAuthStateRequest.findFirst({
      where: { nonce, status: { in: ['EXCHANGED', 'COMPLETED'] } },
    });
    if (!row?.encryptedExchangeResult) return null;
    const value = JSON.parse(
      this.vault.decrypt(row.encryptedExchangeResult),
    ) as {
      uberUserId: string;
      accessToken: string;
      refreshToken: string | null;
      expiresAt: string | null;
      scope: string | null;
      tokenType: string | null;
    };
    return {
      ...value,
      expiresAt: value.expiresAt ? new Date(value.expiresAt) : null,
    };
  }
  async completeOAuthState(nonce: string, connectedAt: Date) {
    return (
      (
        await this.prisma.uberOAuthStateRequest.updateMany({
          where: { nonce, status: 'EXCHANGED' },
          data: {
            status: 'COMPLETED',
            connectedAt,
            encryptedExchangeResult: null,
            lastErrorCategory: null,
          },
        })
      ).count === 1
    );
  }
}

@Injectable()
<<<<<<< HEAD
export class UberMerchantConnectionPrismaAdapter
  implements UberMerchantConnectionRepositoryPort, UberMerchantCredentialStore
{
=======
export class UberMerchantConnectionPrismaAdapter implements UberMerchantConnectionRepositoryPort {
>>>>>>> origin/main
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: UberCredentialVaultService,
  ) {}
  async findConnection(id?: string) {
    const row = id
      ? await this.prisma.uberMerchantConnection.findUnique({
          where: { merchantUberUserId: id },
        })
      : await this.prisma.uberMerchantConnection.findFirst({
          orderBy: { connectedAt: 'desc' },
        });
<<<<<<< HEAD
    if (!row?.encryptedAccessToken) return null;
    return {
      merchantUberUserId: row.merchantUberUserId,
      expiresAt: row.expiresAt,
      scope: row.scope,
      tokenType: row.tokenType,
      connectedAt: row.connectedAt,
    };
  }
  async loadCredential(merchantUberUserId: string) {
    const row = await this.prisma.uberMerchantConnection.findUnique({
      where: { merchantUberUserId },
    });
    if (!row?.encryptedAccessToken) return null;
    return {
      merchantUberUserId: row.merchantUberUserId,
      accessToken: this.vault.decrypt(row.encryptedAccessToken),
      refreshToken: row.encryptedRefreshToken
        ? this.vault.decrypt(row.encryptedRefreshToken)
        : null,
      expiresAt: row.expiresAt,
      scope: row.scope,
      tokenType: row.tokenType,
      version: row.updatedAt.toISOString(),
    };
  }
  async rotateCredential(
    input: Parameters<UberMerchantCredentialStore['rotateCredential']>[0],
  ) {
    const updated = await this.prisma.uberMerchantConnection.updateMany({
      where: {
        merchantUberUserId: input.merchantUberUserId,
        updatedAt: new Date(input.expectedVersion),
      },
      data: {
        encryptedAccessToken: this.vault.encrypt(input.accessToken),
        encryptedRefreshToken: input.refreshToken
          ? this.vault.encrypt(input.refreshToken)
          : null,
        expiresAt: input.expiresAt,
        scope: input.scope,
        tokenType: input.tokenType,
      },
    });
    return updated.count === 1;
  }
=======
    if (!row) return null;
    if (!row.encryptedAccessToken) return null;
    const accessToken = this.vault.decrypt(row.encryptedAccessToken);
    return {
      ...row,
      accessToken,
      refreshToken: row.encryptedRefreshToken
        ? this.vault.decrypt(row.encryptedRefreshToken)
        : null,
    };
  }
>>>>>>> origin/main
  async upsertConnectionByUberUserId(
    input: Parameters<
      UberMerchantConnectionRepositoryPort['upsertConnectionByUberUserId']
    >[0],
  ) {
<<<<<<< HEAD
    const { uberUserId, accessToken, refreshToken, ...connection } = input;
    const encryptedAccessToken = this.vault.encrypt(accessToken);
    const encryptedRefreshToken = refreshToken
      ? this.vault.encrypt(refreshToken)
      : null;
    const row = await this.prisma.uberMerchantConnection.upsert({
=======
    const { uberUserId, ...connection } = input;
    const encryptedAccessToken = this.vault.encrypt(input.accessToken);
    const encryptedRefreshToken = input.refreshToken
      ? this.vault.encrypt(input.refreshToken)
      : null;
    return this.prisma.uberMerchantConnection.upsert({
>>>>>>> origin/main
      where: { merchantUberUserId: uberUserId },
      create: {
        ...connection,
        merchantUberUserId: uberUserId,
<<<<<<< HEAD
=======
        rawStoresSnapshot: input.rawStoresSnapshot
          ? json(input.rawStoresSnapshot)
          : undefined,
>>>>>>> origin/main
        encryptedAccessToken,
        encryptedRefreshToken,
      },
      update: {
        encryptedAccessToken,
        encryptedRefreshToken,
        expiresAt: input.expiresAt,
        scope: input.scope,
        tokenType: input.tokenType,
        connectedAt: input.connectedAt,
      },
    });
<<<<<<< HEAD
    return { connectedAt: row.connectedAt };
=======
  }
  async saveStoresSnapshot(
    merchantUberUserId: string,
    raw: Record<string, unknown>,
  ) {
    await this.prisma.uberMerchantConnection.update({
      where: { merchantUberUserId },
      data: { rawStoresSnapshot: json(raw) },
    });
>>>>>>> origin/main
  }
}

@Injectable()
export class UberStoreMappingPrismaAdapter implements UberStoreMappingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}
<<<<<<< HEAD
  async findMappings(merchantUberUserId: string, ids: string[]) {
    const rows = await this.prisma.uberStoreMapping.findMany({
      where: { merchantUberUserId, uberStoreId: { in: ids } },
    });
    return rows.map(mapStoreMapping);
  }
  async listMappings() {
    const rows = await this.prisma.uberStoreMapping.findMany({
      orderBy: { uberStoreId: 'asc' },
    });
    return rows.map(mapStoreMapping);
  }
  async findMapping(uberStoreId: string) {
    const row = await this.prisma.uberStoreMapping.findUnique({
      where: { uberStoreId },
    });
    return row ? mapStoreMapping(row) : null;
=======
  findMappings(merchantUberUserId: string, ids: string[]) {
    return this.prisma.uberStoreMapping.findMany({
      where: { merchantUberUserId, uberStoreId: { in: ids } },
    });
  }
  listMappings() {
    return this.prisma.uberStoreMapping.findMany({
      orderBy: { uberStoreId: 'asc' },
    });
  }
  findMapping(uberStoreId: string) {
    return this.prisma.uberStoreMapping.findUnique({ where: { uberStoreId } });
>>>>>>> origin/main
  }
  async saveDiscovery(input: UberMerchantStoreMapping) {
    await this.prisma.uberStoreMapping.upsert({
      where: { uberStoreId: input.uberStoreId },
<<<<<<< HEAD
      create: input,
=======
      create: { ...input, rawPayload: json(input.rawPayload ?? {}) },
>>>>>>> origin/main
      update: {
        merchantUberUserId: input.merchantUberUserId,
        storeName: input.storeName,
        locationSummary: input.locationSummary,
        ...(input.isProvisioned
          ? { isProvisioned: true, provisionedAt: input.provisionedAt }
          : {}),
<<<<<<< HEAD
      },
    });
  }
  async upsertMapping(input: UberMerchantStoreMapping) {
    const row = await this.prisma.uberStoreMapping.upsert({
      where: { uberStoreId: input.uberStoreId },
      create: input,
      update: input,
    });
    return mapStoreMapping(row);
=======
        rawPayload: json(input.rawPayload ?? {}),
      },
    });
  }
  upsertMapping(input: UberMerchantStoreMapping) {
    return this.prisma.uberStoreMapping.upsert({
      where: { uberStoreId: input.uberStoreId },
      create: { ...input, rawPayload: json(input.rawPayload ?? {}) },
      update: { ...input, rawPayload: json(input.rawPayload ?? {}) },
    });
>>>>>>> origin/main
  }
  async updatePosExternalStoreId(
    uberStoreId: string,
    posExternalStoreId: string,
  ) {
    const existing = await this.findMapping(uberStoreId);
<<<<<<< HEAD
    if (!existing) return null;
    const row = await this.prisma.uberStoreMapping.update({
      where: { uberStoreId },
      data: { posExternalStoreId },
    });
    return mapStoreMapping(row);
=======
    return existing
      ? this.prisma.uberStoreMapping.update({
          where: { uberStoreId },
          data: { posExternalStoreId },
        })
      : null;
>>>>>>> origin/main
  }
}

@Injectable()
export class UberOperationsAlertPrismaAdapter implements UberOperationsAlertRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetry: UberTelemetryService,
  ) {}
  async getStoreStatusSource() {
    return (
      (await this.prisma.businessConfig.findUnique({ where: { id: 1 } })) ??
      this.prisma.businessConfig.create({ data: { id: 1, storeName: '' } })
    );
  }
  async recordStoreStatusResult(
    result: Record<string, unknown>,
    payload: Record<string, string>,
  ) {
    await this.telemetry.captureEvent('ubereats_store_status_sync_result', {
      ...result,
      payload,
    } as Prisma.JsonObject);
  }
  async createStoreStatusAlert(
    uberStoreId: string,
    error: string,
<<<<<<< HEAD
    reason: 'UPSTREAM_REJECTED' | 'UPSTREAM_UNAVAILABLE',
    retryable: boolean,
=======
    status: number,
>>>>>>> origin/main
    payload: Record<string, string>,
  ) {
    await this.prisma.uberOpsTicket.create({
      data: {
        storeId: uberStoreId,
        type: UberOpsTicketType.STORE_STATUS_SYNC,
        status: UberOpsTicketStatus.OPEN,
        priority: UberOpsTicketPriority.HIGH,
        title: 'Uber 门店状态同步需要运营处理',
        description: redactUberLogText(error).slice(0, 500),
        context: {
          uberStoreId,
          targetStatus: payload.status,
<<<<<<< HEAD
          outcome: 'FAILED',
          reason,
          retryable,
=======
          uberHttpStatus: status,
          errorCode: `UBER_HTTP_${status}`,
>>>>>>> origin/main
        },
      },
    });
  }
}
