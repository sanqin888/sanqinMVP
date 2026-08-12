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
  UberStoreMappingRepositoryPort,
} from '../../application/merchant/uber-merchant-persistence.ports';
import type { UberOperationsAlertRepositoryPort } from '../../application/operations/uber-operations-alert.ports';
import { redactUberLogText } from '../../domain/shared/uber-integration.utils';
import { UberCredentialVaultService } from '../crypto/uber-credential-vault.service';
import { UberTelemetryService } from './uber-telemetry.service';

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

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
  ...(row.rawPayload === undefined ? {} : { rawPayload: row.rawPayload }),
});

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
export class UberMerchantConnectionPrismaAdapter implements UberMerchantConnectionRepositoryPort {
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
    if (!row) return null;
    if (!row.encryptedAccessToken) return null;
    const accessToken = this.vault.decrypt(row.encryptedAccessToken);
    return {
      merchantUberUserId: row.merchantUberUserId,
      accessToken,
      refreshToken: row.encryptedRefreshToken
        ? this.vault.decrypt(row.encryptedRefreshToken)
        : null,
      expiresAt: row.expiresAt,
      scope: row.scope,
      tokenType: row.tokenType,
      connectedAt: row.connectedAt,
      rawStoresSnapshot: row.rawStoresSnapshot,
    };
  }
  async upsertConnectionByUberUserId(
    input: Parameters<
      UberMerchantConnectionRepositoryPort['upsertConnectionByUberUserId']
    >[0],
  ) {
    const { uberUserId, accessToken, refreshToken, ...connection } = input;
    const encryptedAccessToken = this.vault.encrypt(accessToken);
    const encryptedRefreshToken = refreshToken
      ? this.vault.encrypt(refreshToken)
      : null;
    const row = await this.prisma.uberMerchantConnection.upsert({
      where: { merchantUberUserId: uberUserId },
      create: {
        ...connection,
        merchantUberUserId: uberUserId,
        rawStoresSnapshot: input.rawStoresSnapshot
          ? json(input.rawStoresSnapshot)
          : undefined,
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
    return { connectedAt: row.connectedAt };
  }
  async saveStoresSnapshot(
    merchantUberUserId: string,
    raw: Record<string, unknown>,
  ) {
    await this.prisma.uberMerchantConnection.update({
      where: { merchantUberUserId },
      data: { rawStoresSnapshot: json(raw) },
    });
  }
}

@Injectable()
export class UberStoreMappingPrismaAdapter implements UberStoreMappingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}
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
  }
  async saveDiscovery(input: UberMerchantStoreMapping) {
    await this.prisma.uberStoreMapping.upsert({
      where: { uberStoreId: input.uberStoreId },
      create: { ...input, rawPayload: json(input.rawPayload ?? {}) },
      update: {
        merchantUberUserId: input.merchantUberUserId,
        storeName: input.storeName,
        locationSummary: input.locationSummary,
        ...(input.isProvisioned
          ? { isProvisioned: true, provisionedAt: input.provisionedAt }
          : {}),
        rawPayload: json(input.rawPayload ?? {}),
      },
    });
  }
  async upsertMapping(input: UberMerchantStoreMapping) {
    const row = await this.prisma.uberStoreMapping.upsert({
      where: { uberStoreId: input.uberStoreId },
      create: { ...input, rawPayload: json(input.rawPayload ?? {}) },
      update: { ...input, rawPayload: json(input.rawPayload ?? {}) },
    });
    return mapStoreMapping(row);
  }
  async updatePosExternalStoreId(
    uberStoreId: string,
    posExternalStoreId: string,
  ) {
    const existing = await this.findMapping(uberStoreId);
    if (!existing) return null;
    const row = await this.prisma.uberStoreMapping.update({
      where: { uberStoreId },
      data: { posExternalStoreId },
    });
    return mapStoreMapping(row);
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
    status: number,
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
          uberHttpStatus: status,
          errorCode: `UBER_HTTP_${status}`,
        },
      },
    });
  }
}
