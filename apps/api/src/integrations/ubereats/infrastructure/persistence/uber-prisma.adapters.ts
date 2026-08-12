import { Injectable } from '@nestjs/common';
import {
  Prisma,
  UberMenuPublishStatus,
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
  UberOrderActionStatus,
  UberWebhookInboxStatus,
} from '@prisma/client';
import { buildUberIdempotencyKey } from '../../application/idempotency/uber-idempotency-key';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberJsonValue,
  UberMenuPublishAttempt,
  UberMenuPublishPort,
  UberOAuthStatePort,
  UberOperationsTicket,
  UberOperationsTicketPort,
  UberOrderAction,
  UberOrderActionPort,
  UberWebhookInbox,
  UberWebhookInboxPort,
  UberRepositoryScope,
  UberUnitOfWork,
} from '../../application/ports/uber-persistence.ports';

const json = (value: unknown): UberJsonValue | null =>
  value == null ? null : (JSON.parse(JSON.stringify(value)) as UberJsonValue);

type WebhookInboxRow = Prisma.UberWebhookInboxGetPayload<object>;
type OrderActionRow = Prisma.UberOrderActionGetPayload<object>;
type MenuPublishRow = Prisma.UberMenuPublishVersionGetPayload<object>;
type OperationsTicketRow = Prisma.UberOpsTicketGetPayload<object>;

const toPrismaJson = (
  value: Exclude<UberJsonValue, null>,
): Prisma.InputJsonValue => {
  if (Array.isArray(value)) {
    return value.map((item) => (item === null ? null : toPrismaJson(item)));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        item === null ? null : toPrismaJson(item),
      ]),
    );
  }
  return value;
};

const toNullablePrismaJson = (
  value: UberJsonValue | null,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput =>
  value === null ? Prisma.JsonNull : toPrismaJson(value);

function toWebhookInboxStatus(status: string): UberWebhookInboxStatus {
  switch (status) {
    case 'PENDING':
      return UberWebhookInboxStatus.PENDING;
    case 'PROCESSING':
      return UberWebhookInboxStatus.PROCESSING;
    case 'PROCESSED':
      return UberWebhookInboxStatus.PROCESSED;
    case 'FAILED':
      return UberWebhookInboxStatus.FAILED;
    case 'DEAD':
      return UberWebhookInboxStatus.DEAD;
    default:
      throw new Error(`Unsupported Uber webhook inbox status: ${status}`);
  }
}

function toOrderActionStatus(status: string): UberOrderActionStatus {
  switch (status) {
    case 'PENDING':
      return UberOrderActionStatus.PENDING;
    case 'PROCESSING':
      return UberOrderActionStatus.PROCESSING;
    case 'SUCCEEDED':
      return UberOrderActionStatus.SUCCEEDED;
    case 'FAILED':
      return UberOrderActionStatus.FAILED;
    case 'DEAD':
      return UberOrderActionStatus.DEAD;
    default:
      throw new Error(`Unsupported Uber order action status: ${status}`);
  }
}

function toMenuPublishStatus(status: string): UberMenuPublishStatus {
  switch (status) {
    case 'SUBMITTED':
      return UberMenuPublishStatus.SUBMITTED;
    case 'SUCCEEDED':
      return UberMenuPublishStatus.SUCCEEDED;
    case 'FAILED':
      return UberMenuPublishStatus.FAILED;
    default:
      throw new Error(`Unsupported Uber menu publish status: ${status}`);
  }
}

function toOpsTicketType(type: string): UberOpsTicketType {
  switch (type) {
    case 'ORDER_STATUS_SYNC':
      return UberOpsTicketType.ORDER_STATUS_SYNC;
    case 'STORE_STATUS_SYNC':
      return UberOpsTicketType.STORE_STATUS_SYNC;
    case 'MENU_PUBLISH':
      return UberOpsTicketType.MENU_PUBLISH;
    case 'MENU_ITEM_AVAILABILITY':
      return UberOpsTicketType.MENU_ITEM_AVAILABILITY;
    case 'RECONCILIATION':
      return UberOpsTicketType.RECONCILIATION;
    default:
      throw new Error(`Unsupported Uber operations ticket type: ${type}`);
  }
}

function toOpsTicketStatus(status: string): UberOpsTicketStatus {
  switch (status) {
    case 'OPEN':
      return UberOpsTicketStatus.OPEN;
    case 'IN_PROGRESS':
      return UberOpsTicketStatus.IN_PROGRESS;
    case 'RESOLVED':
      return UberOpsTicketStatus.RESOLVED;
    case 'IGNORED':
      return UberOpsTicketStatus.IGNORED;
    case 'CLOSED':
      return UberOpsTicketStatus.CLOSED;
    default:
      throw new Error(`Unsupported Uber operations ticket status: ${status}`);
  }
}

function toOpsTicketPriority(priority: string): UberOpsTicketPriority {
  switch (priority) {
    case 'LOW':
      return UberOpsTicketPriority.LOW;
    case 'MEDIUM':
      return UberOpsTicketPriority.MEDIUM;
    case 'HIGH':
      return UberOpsTicketPriority.HIGH;
    case 'CRITICAL':
      return UberOpsTicketPriority.CRITICAL;
    default:
      throw new Error(
        `Unsupported Uber operations ticket priority: ${priority}`,
      );
  }
}

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
        status: toWebhookInboxStatus(event.status),
        attemptCount: event.attemptCount,
        payload: toNullablePrismaJson(event.payload),
        processedAt: event.processedAt,
      },
      update: {
        status: toWebhookInboxStatus(event.status),
        attemptCount: event.attemptCount,
        payload: toNullablePrismaJson(event.payload),
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
  private map(row: WebhookInboxRow): UberWebhookInbox {
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
          status: toOrderActionStatus(status),
          response: toNullablePrismaJson(result),
          leaseExpiresAt: null,
          completedAt: new Date(),
        },
      }),
    );
  }
  private map(row: OrderActionRow): UberOrderAction {
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
export class PrismaUberOAuthStateAdapter implements UberOAuthStatePort {
  constructor(private readonly prisma: PrismaService) {}
  async saveOAuthState(
    input: Parameters<UberOAuthStatePort['saveOAuthState']>[0],
  ) {
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
  saveExchangedTokens(): Promise<boolean> {
    throw new Error(
      'OAuth exchange recovery requires the credential-vault adapter',
    );
  }
  loadExchangedTokens(): Promise<null> {
    throw new Error(
      'OAuth exchange recovery requires the credential-vault adapter',
    );
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
          },
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
          status: toMenuPublishStatus(value.status),
          totalItems: 0,
          changedItems: 0,
          checksum: value.payloadHash,
          payload: {},
          businessVersion: value.payloadHash ?? 'v1',
          idempotencyKey: buildUberIdempotencyKey({
            taskId: value.id,
            resourceId: value.storeId,
            action: 'PUBLISH_MENU',
            businessVersion: value.payloadHash ?? 'v1',
          }),
        },
        update: {
          status: toMenuPublishStatus(value.status),
          checksum: value.payloadHash,
          errorDetails: toNullablePrismaJson(value.error),
        },
      }),
    );
  }
  private map(row: MenuPublishRow): UberMenuPublishAttempt {
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
          type: toOpsTicketType(value.type),
          status: toOpsTicketStatus(value.status),
          priority: toOpsTicketPriority(value.priority),
          title: value.title,
          context: toNullablePrismaJson(value.context),
        },
        update: {
          status: toOpsTicketStatus(value.status),
          priority: toOpsTicketPriority(value.priority),
          title: value.title,
          context: toNullablePrismaJson(value.context),
        },
      }),
    );
  }
  private map(row: OperationsTicketRow): UberOperationsTicket {
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
        oauthStates: new PrismaUberOAuthStateAdapter(client),
        menuPublishes: new PrismaUberMenuPublishAdapter(client),
        operationsTickets: new PrismaUberOperationsTicketAdapter(client),
      });
    });
  }
}
