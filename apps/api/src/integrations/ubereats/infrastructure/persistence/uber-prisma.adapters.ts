import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberJsonValue,
  UberMenuPublishAttempt,
  UberMenuPublishPort,
  UberMerchantConnection,
  UberMerchantConnectionPort,
  UberOAuthStatePort,
  UberOperationsTicket,
  UberOperationsTicketPort,
  UberOrderAction,
  UberOrderActionPort,
  UberStoreMapping,
  UberStoreMappingPort,
  UberWebhookInbox,
  UberWebhookInboxPort,
  UberRepositoryScope,
  UberUnitOfWork,
} from '../../application/ports/uber-persistence.ports';

const json = (value: unknown): UberJsonValue | null =>
  value == null ? null : (JSON.parse(JSON.stringify(value)) as UberJsonValue);

@Injectable()
export class PrismaUberWebhookInboxAdapter implements UberWebhookInboxPort {
  constructor(private readonly prisma: PrismaService) {}
  async findInboxEvent(eventId: string) {
    const row = await this.prisma.uberWebhookInbox.findUnique({
      where: { eventId },
    });
    return row && this.map(row);
  }
  async saveInboxEvent(event: UberWebhookInbox) {
    const row = await this.prisma.uberWebhookInbox.upsert({
      where: { eventId: event.eventId },
      create: {
        eventId: event.eventId,
        eventType: 'unknown',
        status: event.status as never,
        attemptCount: event.attemptCount,
        payload: event.payload as never,
        processedAt: event.processedAt,
      },
      update: {
        status: event.status as never,
        attemptCount: event.attemptCount,
        payload: event.payload as never,
        processedAt: event.processedAt,
      },
    });
    return this.map(row);
  }
  async markInboxProcessed(id: string, processedAt: Date) {
    return (
      (
        await this.prisma.uberWebhookInbox.updateMany({
          where: { id, processedAt: null },
          data: { status: 'PROCESSED', processedAt },
        })
      ).count === 1
    );
  }
  private map(row: any): UberWebhookInbox {
    return {
      id: row.id,
      eventId: row.eventId,
      status: row.status,
      attemptCount: row.attemptCount,
      payload: json(row.payload) ?? null,
      receivedAt: row.createdAt,
      processedAt: row.processedAt,
    };
  }
}

@Injectable()
export class PrismaUberOrderActionAdapter implements UberOrderActionPort {
  constructor(private readonly prisma: PrismaService) {}
  async findPendingAction(now: Date) {
    const row = await this.prisma.uberOrderAction.findFirst({
      where: {
        OR: [
          { status: 'PENDING', nextRetryAt: { lte: now } },
          { status: 'PROCESSING', leaseExpiresAt: { lt: now } },
        ],
      },
      orderBy: { updatedAt: 'asc' },
    });
    return row && this.map(row);
  }
  async claimActionLease(id: string, now: Date, leaseUntil: Date) {
    return (
      (
        await this.prisma.uberOrderAction.updateMany({
          where: {
            id,
            OR: [
              { status: 'PENDING', nextRetryAt: { lte: now } },
              { status: 'PROCESSING', leaseExpiresAt: { lt: now } },
            ],
          },
          data: {
            status: 'PROCESSING',
            leaseExpiresAt: leaseUntil,
            attemptCount: { increment: 1 },
          },
        })
      ).count === 1
    );
  }
  async saveActionResult(
    id: string,
    result: UberJsonValue | null,
    status: string,
  ) {
    return this.map(
      await this.prisma.uberOrderAction.update({
        where: { id },
        data: {
          status: status as never,
          response: result as never,
          leaseExpiresAt: null,
          completedAt: new Date(),
        },
      }),
    );
  }
  private map(row: any): UberOrderAction {
    return {
      id: row.id,
      orderId: row.externalOrderId,
      action: row.action,
      status: row.status,
      attemptCount: row.attemptCount,
      leaseUntil: row.leaseExpiresAt,
      result: json(row.response),
    };
  }
}

@Injectable()
export class PrismaUberMerchantConnectionAdapter implements UberMerchantConnectionPort {
  constructor(private readonly prisma: PrismaService) {}
  async findMerchantConnection(id?: string) {
    const row = id
      ? await this.prisma.uberMerchantConnection.findUnique({
          where: { merchantUberUserId: id },
        })
      : await this.prisma.uberMerchantConnection.findFirst({
          orderBy: { connectedAt: 'desc' },
        });
    return row && this.map(row);
  }
  async saveMerchantConnection(value: UberMerchantConnection) {
    return this.map(
      await this.prisma.uberMerchantConnection.upsert({
        where: { merchantUberUserId: value.merchantUberUserId },
        create: {
          merchantUberUserId: value.merchantUberUserId,
          encryptedAccessToken: value.accessTokenEncrypted,
          encryptedRefreshToken: value.refreshTokenEncrypted,
          expiresAt: value.expiresAt,
          connectedAt: value.connectedAt,
        },
        update: {
          encryptedAccessToken: value.accessTokenEncrypted,
          encryptedRefreshToken: value.refreshTokenEncrypted,
          expiresAt: value.expiresAt,
        },
      }),
    );
  }
  private map(row: any): UberMerchantConnection {
    return {
      merchantUberUserId: row.merchantUberUserId,
      accessTokenEncrypted: row.encryptedAccessToken ?? '',
      refreshTokenEncrypted: row.encryptedRefreshToken,
      expiresAt: row.expiresAt,
      connectedAt: row.connectedAt,
    };
  }
}

@Injectable()
export class PrismaUberStoreMappingAdapter implements UberStoreMappingPort {
  constructor(private readonly prisma: PrismaService) {}
  async findStoreMapping(uberStoreId: string) {
    const row = await this.prisma.uberStoreMapping.findUnique({
      where: { uberStoreId },
    });
    return row && this.map(row);
  }
  async saveStoreMapping(value: UberStoreMapping) {
    return this.map(
      await this.prisma.uberStoreMapping.upsert({
        where: { uberStoreId: value.uberStoreId },
        create: {
          uberStoreId: value.uberStoreId,
          merchantUberUserId: value.merchantUberUserId,
          posExternalStoreId: value.posExternalStoreId,
          isProvisioned: value.isProvisioned,
        },
        update: {
          merchantUberUserId: value.merchantUberUserId,
          posExternalStoreId: value.posExternalStoreId,
          isProvisioned: value.isProvisioned,
        },
      }),
    );
  }
  private map(row: any): UberStoreMapping {
    return {
      uberStoreId: row.uberStoreId,
      storeId: row.posExternalStoreId,
      merchantUberUserId: row.merchantUberUserId,
      posExternalStoreId: row.posExternalStoreId,
      isProvisioned: row.isProvisioned,
    };
  }
}

@Injectable()
export class PrismaUberOAuthStateAdapter implements UberOAuthStatePort {
  constructor(private readonly prisma: PrismaService) {}
  async saveOAuthState(
    input: Parameters<UberOAuthStatePort['saveOAuthState']>[0],
  ) {
    await this.prisma.uberOAuthStateRequest.create({ data: input });
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
export class PrismaUberMenuPublishAdapter implements UberMenuPublishPort {
  constructor(private readonly prisma: PrismaService) {}
  async findLatestPublishAttempt(storeId: string) {
    const row = await this.prisma.uberMenuPublishVersion.findFirst({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
    });
    return row && this.map(row);
  }
  async savePublishAttempt(value: UberMenuPublishAttempt) {
    return this.map(
      await this.prisma.uberMenuPublishVersion.upsert({
        where: { id: value.id },
        create: {
          id: value.id,
          storeId: value.storeId,
          status: value.status as never,
          totalItems: 0,
          changedItems: 0,
          checksum: value.payloadHash,
          payload: {},
        },
        update: {
          status: value.status as never,
          checksum: value.payloadHash,
          errorDetails: value.error as never,
        },
      }),
    );
  }
  private map(row: any): UberMenuPublishAttempt {
    return {
      id: row.id,
      storeId: row.storeId,
      status: row.status,
      attemptNumber: 1,
      payloadHash: row.checksum,
      error: json(row.errorDetails),
      createdAt: row.createdAt,
    };
  }
}

@Injectable()
export class PrismaUberOperationsTicketAdapter implements UberOperationsTicketPort {
  constructor(private readonly prisma: PrismaService) {}
  async findOperationsTicket(id: string) {
    const row = await this.prisma.uberOpsTicket.findUnique({ where: { id } });
    return row && this.map(row);
  }
  async saveOperationsTicket(value: UberOperationsTicket) {
    return this.map(
      await this.prisma.uberOpsTicket.upsert({
        where: { id: value.id },
        create: {
          id: value.id,
          storeId: value.storeId ?? 'default',
          type: value.type as never,
          status: value.status as never,
          priority: value.priority as never,
          title: value.title,
          context: value.context as never,
        },
        update: {
          status: value.status as never,
          priority: value.priority as never,
          title: value.title,
          context: value.context as never,
        },
      }),
    );
  }
  private map(row: any): UberOperationsTicket {
    return {
      id: row.id,
      storeId: row.storeId,
      type: row.type,
      status: row.status,
      priority: row.priority,
      title: row.title,
      context: json(row.context),
    };
  }
}

@Injectable()
export class PrismaUberUnitOfWork implements UberUnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (scope: UberRepositoryScope) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => {
      // Adapters depend only on the delegate surface shared by PrismaService and
      // TransactionClient; that implementation detail stays below this boundary.
      const client = tx as unknown as PrismaService;
      return work({
        webhookInbox: new PrismaUberWebhookInboxAdapter(client),
        orderActions: new PrismaUberOrderActionAdapter(client),
        merchantConnections: new PrismaUberMerchantConnectionAdapter(client),
        storeMappings: new PrismaUberStoreMappingAdapter(client),
        oauthStates: new PrismaUberOAuthStateAdapter(client),
        menuPublishes: new PrismaUberMenuPublishAdapter(client),
        operationsTickets: new PrismaUberOperationsTicketAdapter(client),
      });
    });
  }
}
