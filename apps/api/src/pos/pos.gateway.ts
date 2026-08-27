import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PosDeviceService } from './pos-device.service';
import {
  POS_DEVICE_ID_COOKIE,
  POS_DEVICE_KEY_COOKIE,
} from './pos-device.constants';

export const POS_CUSTOMER_ORDERING_STATUS_UPDATED_EVENT =
  'CUSTOMER_ORDERING_STATUS_UPDATED';
export const POS_CARD_PAYMENT_STATUS_UPDATED_EVENT =
  'POS_CARD_PAYMENT_STATUS_UPDATED';
export const POS_CARD_PAYMENT_REVERSE_SYNC_UPDATED_EVENT =
  'POS_CARD_PAYMENT_REVERSE_SYNC_UPDATED';

type PosSocketDeviceIdentity = {
  deviceStableId: string;
  storeStableId: string;
};

type PosSocketData = {
  posDevice?: PosSocketDeviceIdentity;
};

type PosSocketCredentials = {
  deviceStableId: string;
  deviceKey: string;
};

type PosPrintTarget = 'customer' | 'kitchen' | 'label';

const POS_PRINT_TARGETS: readonly PosPrintTarget[] = [
  'customer',
  'kitchen',
  'label',
];

function resolvePosSocketCorsOrigin(): string | string[] {
  const configured = process.env.CORS_ORIGIN?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured?.length ? configured : 'http://localhost:3000';
}

@WebSocketGateway({
  namespace: 'pos',
  cors: { origin: resolvePosSocketCorsOrigin(), credentials: true },
})
export class PosGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PosGateway.name);
  private readonly ackTimeoutMs = Number(
    process.env.POS_PRINT_ACK_TIMEOUT_MS || 10_000,
  );
  private readonly maxAttempts = Number(
    process.env.POS_PRINT_MAX_ATTEMPTS || 3,
  );
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly posDeviceService: PosDeviceService,
  ) {}

  afterInit(server: Server) {
    server.use((client, next) => {
      void this.authenticateSocket(client)
        .then((authenticated) => {
          if (authenticated) {
            next();
            return;
          }
          next(new Error('POS_DEVICE_AUTH_FAILED'));
        })
        .catch(() => {
          this.logger.warn({
            event: 'pos_socket_auth_failed',
            socketId: client.id,
            reason: 'DEVICE_VERIFICATION_ERROR',
          });
          next(new Error('POS_DEVICE_AUTH_FAILED'));
        });
    });
  }

  private async authenticateSocket(client: Socket): Promise<boolean> {
    const credentials = this.readSocketCredentials(client);
    if (!credentials) {
      this.logger.warn({
        event: 'pos_socket_auth_failed',
        socketId: client.id,
        reason: 'MISSING_CREDENTIALS',
      });
      return false;
    }

    const device = await this.posDeviceService.verifyDevice(credentials);
    if (!device) {
      this.logger.warn({
        event: 'pos_socket_auth_failed',
        socketId: client.id,
        deviceStableId: credentials.deviceStableId,
        reason: 'INVALID_OR_INACTIVE_DEVICE',
      });
      return false;
    }

    const data = client.data as PosSocketData;
    data.posDevice = {
      deviceStableId: device.deviceStableId,
      storeStableId: device.storeStableId,
    };
    return true;
  }

  private readSocketCredentials(client: Socket): PosSocketCredentials | null {
    const cookieHeader = client.handshake.headers.cookie;
    const cookieDeviceStableId = this.readCookieValue(
      cookieHeader,
      POS_DEVICE_ID_COOKIE,
    );
    const cookieDeviceKey = this.readCookieValue(
      cookieHeader,
      POS_DEVICE_KEY_COOKIE,
    );
    if (cookieDeviceStableId && cookieDeviceKey) {
      return {
        deviceStableId: cookieDeviceStableId,
        deviceKey: cookieDeviceKey,
      };
    }

    const rawAuth = client.handshake.auth as unknown;
    if (!rawAuth || typeof rawAuth !== 'object') return null;
    const auth = rawAuth as Record<string, unknown>;
    const authDeviceStableId = auth[POS_DEVICE_ID_COOKIE];
    const authDeviceKey = auth[POS_DEVICE_KEY_COOKIE];
    if (
      typeof authDeviceStableId !== 'string' ||
      !authDeviceStableId.trim() ||
      typeof authDeviceKey !== 'string' ||
      !authDeviceKey
    ) {
      return null;
    }

    return {
      deviceStableId: authDeviceStableId.trim(),
      deviceKey: authDeviceKey,
    };
  }

  private readCookieValue(
    cookieHeader: string | undefined,
    cookieName: string,
  ): string | undefined {
    if (!cookieHeader) return undefined;
    for (const pair of cookieHeader.split(';')) {
      const normalized = pair.trim();
      const separator = normalized.indexOf('=');
      if (separator <= 0 || normalized.slice(0, separator) !== cookieName) {
        continue;
      }
      const rawValue = normalized.slice(separator + 1);
      try {
        return decodeURIComponent(rawValue);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private getAuthenticatedDevice(
    client: Socket,
  ): PosSocketDeviceIdentity | null {
    const data = client.data as PosSocketData;
    return data.posDevice ?? null;
  }

  handleConnection(client: Socket) {
    const device = this.getAuthenticatedDevice(client);
    this.logger.log({
      event: 'pos_socket_connected',
      socketId: client.id,
      deviceStableId: device?.deviceStableId ?? null,
      storeId: device?.storeStableId ?? null,
    });
  }

  handleDisconnect(client: Socket) {
    const device = this.getAuthenticatedDevice(client);
    this.logger.log({
      event: 'pos_socket_disconnected',
      socketId: client.id,
      deviceStableId: device?.deviceStableId ?? null,
      storeId: device?.storeStableId ?? null,
    });
  }

  @SubscribeMessage('joinStore')
  async handleJoinStore(client: Socket, payload?: { storeId?: string }) {
    const device = this.getAuthenticatedDevice(client);
    if (!device) {
      this.logger.warn({
        event: 'pos_socket_join_rejected',
        socketId: client.id,
        reason: 'UNAUTHENTICATED',
      });
      return;
    }

    const requestedStoreId =
      typeof payload?.storeId === 'string' && payload.storeId.trim()
        ? payload.storeId.trim()
        : null;
    if (requestedStoreId && requestedStoreId !== device.storeStableId) {
      this.logger.warn({
        event: 'pos_socket_cross_store_join_rejected',
        socketId: client.id,
        deviceStableId: device.deviceStableId,
        storeId: device.storeStableId,
        requestedStoreId,
        reason: 'STORE_MISMATCH',
      });
      return;
    }

    const roomName = `store:${device.storeStableId}`;
    await client.join(roomName);
    this.logger.log({
      event: 'pos_socket_store_joined',
      socketId: client.id,
      deviceStableId: device.deviceStableId,
      storeId: device.storeStableId,
      room: roomName,
    });
    client.emit('joined', { room: roomName });
    await this.dispatchPending(device.storeStableId);
  }

  @SubscribeMessage('PRINT_JOB_ACK')
  async handlePrintJobAck(
    client: Socket,
    payload?: {
      jobId?: string;
      target?: PosPrintTarget;
      success?: boolean;
      error?: string;
    },
  ) {
    const device = this.getAuthenticatedDevice(client);
    if (!device) {
      this.logger.warn({
        event: 'pos_print_ack_rejected',
        socketId: client.id,
        jobId: typeof payload?.jobId === 'string' ? payload.jobId : null,
        reason: 'UNAUTHENTICATED',
      });
      return;
    }

    const jobId =
      typeof payload?.jobId === 'string' ? payload.jobId.trim() : '';
    const target = payload?.target;
    const success = payload?.success;
    if (
      !jobId ||
      !target ||
      !POS_PRINT_TARGETS.includes(target) ||
      typeof success !== 'boolean'
    ) {
      this.logger.warn({
        event: 'pos_print_ack_rejected',
        socketId: client.id,
        deviceStableId: device.deviceStableId,
        storeId: device.storeStableId,
        jobId: jobId || null,
        reason: 'INVALID_PAYLOAD',
      });
      return;
    }

    const existingJob = await this.prisma.posPrintJob.findUnique({
      where: { jobId },
    });
    if (!existingJob) {
      this.logger.warn({
        event: 'pos_print_ack_rejected',
        socketId: client.id,
        deviceStableId: device.deviceStableId,
        storeId: device.storeStableId,
        jobId,
        reason: 'JOB_NOT_FOUND',
      });
      return;
    }
    if (existingJob.storeId !== device.storeStableId) {
      this.logger.warn({
        event: 'pos_print_ack_rejected',
        socketId: client.id,
        deviceStableId: device.deviceStableId,
        storeId: device.storeStableId,
        jobId,
        jobStoreId: existingJob.storeId,
        reason: 'STORE_MISMATCH',
      });
      return;
    }

    clearTimeout(this.timers.get(`${jobId}:${target}`));
    this.timers.delete(`${jobId}:${target}`);
    const failureReason =
      typeof payload?.error === 'string' && payload.error.trim()
        ? payload.error.trim().slice(0, 256)
        : 'PRINT_EXCEPTION';
    const job = await this.prisma.posPrintJob.update({
      where: { jobId },
      data: success
        ? {
            [`${target}Status`]: 'COMPLETED',
            [`${target}FailureReason`]: null,
            [`${target}CompletedAt`]: new Date(),
          }
        : {
            [`${target}Status`]: 'FAILED',
            [`${target}FailureReason`]: failureReason,
          },
    });
    this.logger.log({
      event: 'pos_print_ack_received',
      jobId: job.jobId,
      orderStableId: job.orderStableId,
      storeId: job.storeId,
      deviceStableId: device.deviceStableId,
      target,
      attempt: job[`${target}Attempts`],
      status: success ? 'COMPLETED' : 'FAILED',
      reason: success ? null : failureReason,
    });
    if (!success) await this.dispatchTarget(jobId, target);
  }

  async sendPrintJob(input: {
    orderId: string;
    orderStableId: string;
    storeId: string;
    kind: string;
    data: unknown;
  }) {
    const targets = (
      input.data as {
        targets?: { customer?: boolean; kitchen?: boolean; label?: boolean };
      }
    )?.targets;
    const job = await this.prisma.posPrintJob.upsert({
      where: {
        orderStableId_kind: {
          orderStableId: input.orderStableId,
          kind: input.kind,
        },
      },
      create: {
        jobId: randomUUID(),
        orderId: input.orderId,
        orderStableId: input.orderStableId,
        storeId: input.storeId,
        kind: input.kind,
        payload: input.data as never,
        customerRequested: targets?.customer === true,
        kitchenRequested: targets?.kitchen === true,
        labelRequested: targets?.label === true,
        customerStatus: targets?.customer === true ? 'PENDING' : 'SKIPPED',
        kitchenStatus: targets?.kitchen === true ? 'PENDING' : 'SKIPPED',
        labelStatus: targets?.label === true ? 'PENDING' : 'SKIPPED',
      },
      update: {},
    });
    this.logger.log({
      event: 'pos_print_job_upserted',
      jobId: job.jobId,
      orderStableId: job.orderStableId,
      storeId: job.storeId,
      targets: {
        customer: job.customerRequested,
        kitchen: job.kitchenRequested,
        label: job.labelRequested,
      },
      status: {
        customer: job.customerStatus,
        kitchen: job.kitchenStatus,
        label: job.labelStatus,
      },
    });
    await Promise.all(
      POS_PRINT_TARGETS.map((target) => this.dispatchTarget(job.jobId, target)),
    );
    return job;
  }

  private async dispatchPending(storeId: string) {
    const jobs = await this.prisma.posPrintJob.findMany({
      where: {
        storeId,
        OR: [
          {
            customerRequested: true,
            customerStatus: { in: ['PENDING', 'FAILED'] },
            OR: [
              { customerAttempts: { lt: this.maxAttempts } },
              { customerFailureReason: 'CLIENT_OFFLINE' },
            ],
          },
          {
            kitchenRequested: true,
            kitchenStatus: { in: ['PENDING', 'FAILED'] },
            OR: [
              { kitchenAttempts: { lt: this.maxAttempts } },
              { kitchenFailureReason: 'CLIENT_OFFLINE' },
            ],
          },
          {
            labelRequested: true,
            labelStatus: { in: ['PENDING', 'FAILED'] },
            OR: [
              { labelAttempts: { lt: this.maxAttempts } },
              { labelFailureReason: 'CLIENT_OFFLINE' },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    const dispatches = jobs.flatMap((job) =>
      POS_PRINT_TARGETS.filter(
        (target) =>
          job[`${target}Requested`] &&
          ['PENDING', 'FAILED'].includes(job[`${target}Status`]) &&
          (job[`${target}Attempts`] < this.maxAttempts ||
            job[`${target}FailureReason`] === 'CLIENT_OFFLINE'),
      ).map((target) => ({ jobId: job.jobId, target })),
    );
    const jobCount = new Set(dispatches.map(({ jobId }) => jobId)).size;
    this.logger.log({
      event: 'pos_print_pending_dispatch',
      storeId,
      status: 'STARTED',
      jobCount,
    });
    await Promise.all(
      dispatches.map(({ jobId, target }) => this.dispatchTarget(jobId, target)),
    );
  }

  private async dispatchTarget(jobId: string, target: PosPrintTarget) {
    if (this.timers.has(`${jobId}:${target}`)) return;
    const job = await this.prisma.posPrintJob.findUnique({ where: { jobId } });
    if (
      !job ||
      !job[`${target}Requested`] ||
      job[`${target}Status`] === 'COMPLETED'
    )
      return;
    const attemptsKey = `${target}Attempts` as const;
    let attempt = job[attemptsKey];
    if (attempt >= this.maxAttempts) {
      // Older versions counted an offline lookup as a send. Such jobs were never
      // delivered and are safe to recover; a REPRINT creates a fresh kind/job too.
      if (job[`${target}FailureReason`] === 'CLIENT_OFFLINE') {
        await this.prisma.posPrintJob.update({
          where: { jobId },
          data: { [attemptsKey]: 0, [`${target}Status`]: 'PENDING' },
        });
        attempt = 0;
        this.logger.warn({
          event: 'pos_print_legacy_offline_recovered',
          jobId,
          orderStableId: job.orderStableId,
          storeId: job.storeId,
          target,
          attempt,
          status: 'PENDING',
          reason: 'LEGACY_OFFLINE_ATTEMPTS_RESET',
        });
      } else {
        this.logger.warn({
          event: 'pos_print_retry_stopped',
          jobId,
          orderStableId: job.orderStableId,
          storeId: job.storeId,
          target,
          attempt,
          status: job[`${target}Status`],
          reason: 'MAX_SEND_ATTEMPTS_REACHED',
          recovery: 'REQUEST_ORDER_REPRINT',
        });
        return;
      }
    }
    const sockets = await this.server.in(`store:${job.storeId}`).fetchSockets();
    if (!sockets.length) {
      await this.prisma.posPrintJob.update({
        where: { jobId },
        data: {
          [`${target}Status`]: 'PENDING',
          [`${target}FailureReason`]: 'CLIENT_OFFLINE',
        },
      });
      this.logger.warn({
        event: 'pos_print_dispatch_deferred',
        jobId,
        orderStableId: job.orderStableId,
        storeId: job.storeId,
        target,
        attempt,
        status: 'PENDING',
        reason: 'CLIENT_OFFLINE',
      });
      return;
    }
    this.server
      .to(`store:${job.storeId}`)
      .emit('PRINT_JOB', { jobId, target, payload: job.payload });
    await this.prisma.posPrintJob.update({
      where: { jobId },
      data: {
        [attemptsKey]: { increment: 1 },
        [`${target}Status`]: 'DELIVERED',
        [`${target}FailureReason`]: null,
      },
    });
    this.logger.log({
      event: 'pos_print_job_emitted',
      jobId,
      orderStableId: job.orderStableId,
      storeId: job.storeId,
      target,
      attempt: attempt + 1,
      status: 'DELIVERED',
      reason: null,
    });
    const timerKey = `${jobId}:${target}`;
    clearTimeout(this.timers.get(timerKey));
    this.timers.set(
      timerKey,
      setTimeout(
        () => void this.markTimeoutAndRetry(jobId, target),
        this.ackTimeoutMs,
      ),
    );
  }

  private async markTimeoutAndRetry(jobId: string, target: PosPrintTarget) {
    this.timers.delete(`${jobId}:${target}`);
    const job = await this.prisma.posPrintJob.update({
      where: { jobId },
      data: {
        [`${target}Status`]: 'FAILED',
        [`${target}FailureReason`]: 'ACK_TIMEOUT',
      },
    });
    this.logger.warn({
      event: 'pos_print_ack_timeout',
      jobId: job.jobId,
      orderStableId: job.orderStableId,
      storeId: job.storeId,
      target,
      attempt: job[`${target}Attempts`],
      status: 'FAILED',
      reason: 'ACK_TIMEOUT',
    });
    await this.dispatchTarget(jobId, target);
  }

  async getOrderPrintStatus(orderStableId: string) {
    return this.prisma.posPrintJob.findFirst({
      // In-store orders are printed through the explicit REPRINT flow and do
      // not create an AUTO job when they are accepted. Looking up AUTO only
      // therefore made the board poll forever even after both ACKs completed.
      // The newest job is the authoritative status for both automatic prints
      // and operator-requested prints.
      where: { orderStableId },
      orderBy: { createdAt: 'desc' },
    });
  }

  sendPrintSummary(storeId: string, data: unknown) {
    const roomName = `store:${storeId}`;
    this.logger.log(`🚀 Sending PRINT_SUMMARY to ${roomName}`);
    this.server.to(roomName).emit('PRINT_SUMMARY', data);
  }

  publishCardPaymentStatus(
    storeId: string,
    data: {
      attemptId: string;
      paymentId: string | null;
      status: string;
      failureCode?: string | null;
      failureMessage?: string | null;
      externalAmountCents?: number;
      surchargeCents?: number | null;
      chargedTotalCents?: number | null;
      pointsCents?: number;
      balanceCents?: number;
      couponDiscountCents?: number;
      orderStableId?: string | null;
      orderNumber?: string | null;
      pickupCode?: string | null;
    },
  ) {
    this.server
      .to(`store:${storeId}`)
      .emit(POS_CARD_PAYMENT_STATUS_UPDATED_EVENT, {
        attemptId: data.attemptId,
        paymentId: data.paymentId,
        status: data.status,
        failureCode: data.failureCode ?? null,
        failureMessage: data.failureMessage ?? null,
        orderStableId: data.orderStableId ?? null,
        orderNumber: data.orderNumber ?? null,
        pickupCode: data.pickupCode ?? null,
      });
  }

  publishCardPaymentReverseSync(
    storeId: string,
    data: {
      attemptId: string;
      paymentId: string;
      externalReversal: 'PARTIAL_REFUND' | 'FULL_REFUND' | 'VOID';
      refundedAmountCents: number;
      orderStableId?: string | null;
      orderStatus?: string | null;
      requiresManualReview?: boolean;
    },
  ) {
    this.server
      .to(`store:${storeId}`)
      .emit(POS_CARD_PAYMENT_REVERSE_SYNC_UPDATED_EVENT, {
        attemptId: data.attemptId,
        paymentId: data.paymentId,
        externalReversal: data.externalReversal,
        refundedAmountCents: data.refundedAmountCents,
        orderStableId: data.orderStableId ?? null,
        orderStatus: data.orderStatus ?? null,
        requiresManualReview: data.requiresManualReview ?? false,
      });
  }

  publishCustomerOrderingStatusUpdate(data: {
    isTemporarilyClosed: boolean;
    autoResumeAt: string | null;
  }) {
    this.logger.log('📣 Broadcasting CUSTOMER_ORDERING_STATUS_UPDATED');
    this.server.emit(POS_CUSTOMER_ORDERING_STATUS_UPDATED_EVENT, data);
  }
}
