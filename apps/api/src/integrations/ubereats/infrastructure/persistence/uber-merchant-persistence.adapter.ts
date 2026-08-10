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
  UberOperationsAlertRepositoryPort,
  UberStoreMappingRepositoryPort,
} from '../../application/ports/uber-persistence.ports';
import { redactUberLogText } from '../../domain/shared/uber-integration.utils';
import { UberCredentialVaultService } from '../crypto/uber-credential-vault.service';
import { UberTelemetryService } from '../observability/uber-telemetry.service';

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class UberOAuthStatePrismaAdapter implements UberOAuthStatePort {
  constructor(private readonly prisma: PrismaService) {}
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
  async consumeOAuthState(
    input: Parameters<UberOAuthStatePort['consumeOAuthState']>[0],
  ) {
    return (
      (
        await this.prisma.uberOAuthStateRequest.updateMany({
          where: {
            nonce: input.nonce,
            adminSessionId: input.adminSessionId,
            issuedAt: input.issuedAt,
            expiresAt: { gt: input.now },
            consumedAt: null,
          },
          data: { consumedAt: input.now },
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
    const accessToken = row.encryptedAccessToken
      ? this.vault.decrypt(row.encryptedAccessToken)
      : row.accessToken;
    if (!accessToken) return null;
    return {
      ...row,
      accessToken,
      refreshToken: row.encryptedRefreshToken
        ? this.vault.decrypt(row.encryptedRefreshToken)
        : row.refreshToken,
    };
  }
  async upsertConnection(
    input: Parameters<
      UberMerchantConnectionRepositoryPort['upsertConnection']
    >[0],
  ) {
    const encryptedAccessToken = this.vault.encrypt(input.accessToken);
    const encryptedRefreshToken = input.refreshToken
      ? this.vault.encrypt(input.refreshToken)
      : null;
    return this.prisma.uberMerchantConnection.upsert({
      where: { merchantUberUserId: input.merchantUberUserId },
      create: {
        ...input,
        rawStoresSnapshot: input.rawStoresSnapshot
          ? json(input.rawStoresSnapshot)
          : undefined,
        accessToken: null,
        refreshToken: null,
        encryptedAccessToken,
        encryptedRefreshToken,
      },
      update: {
        accessToken: null,
        refreshToken: null,
        encryptedAccessToken,
        encryptedRefreshToken,
        expiresAt: input.expiresAt,
        scope: input.scope,
        tokenType: input.tokenType,
        connectedAt: input.connectedAt,
      },
    });
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
  upsertMapping(input: UberMerchantStoreMapping) {
    return this.prisma.uberStoreMapping.upsert({
      where: { uberStoreId: input.uberStoreId },
      create: { ...input, rawPayload: json(input.rawPayload ?? {}) },
      update: { ...input, rawPayload: json(input.rawPayload ?? {}) },
    });
  }
  async updatePosExternalStoreId(
    uberStoreId: string,
    posExternalStoreId: string,
  ) {
    const existing = await this.findMapping(uberStoreId);
    return existing
      ? this.prisma.uberStoreMapping.update({
          where: { uberStoreId },
          data: { posExternalStoreId },
        })
      : null;
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
