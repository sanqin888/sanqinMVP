import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export const POS_CUSTOMER_ORDERING_STATUS_UPDATED_EVENT =
  'CUSTOMER_ORDERING_STATUS_UPDATED';

@WebSocketGateway({ namespace: 'pos', cors: { origin: '*' } })
export class PosGateway implements OnGatewayConnection, OnGatewayDisconnect {
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

  constructor(private readonly prisma: PrismaService) {}

  handleConnection(client: Socket) {
    this.logger.log(`POS Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`POS Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinStore')
  handleJoinStore(client: Socket, payload: { storeId: string }) {
    if (!payload?.storeId) {
      return;
    }

    const roomName = `store:${payload.storeId}`;
    void client.join(roomName);
    this.logger.log(`Client ${client.id} joined room: ${roomName}`);
    client.emit('joined', { room: roomName });
    void this.dispatchPending(payload.storeId);
  }

  @SubscribeMessage('PRINT_JOB_ACK')
  async handlePrintJobAck(
    _client: Socket,
    payload: {
      jobId?: string;
      target?: 'customer' | 'kitchen';
      success?: boolean;
      error?: string;
    },
  ) {
    if (
      !payload?.jobId ||
      !['customer', 'kitchen'].includes(payload.target ?? '')
    )
      return;
    const target = payload.target as 'customer' | 'kitchen';
    clearTimeout(this.timers.get(`${payload.jobId}:${target}`));
    this.timers.delete(`${payload.jobId}:${target}`);
    await this.prisma.posPrintJob.update({
      where: { jobId: payload.jobId },
      data: payload.success
        ? {
            [`${target}Status`]: 'COMPLETED',
            [`${target}FailureReason`]: null,
            [`${target}CompletedAt`]: new Date(),
          }
        : {
            [`${target}Status`]: 'FAILED',
            [`${target}FailureReason`]: payload.error || 'PRINT_EXCEPTION',
          },
    });
    if (!payload.success) await this.dispatchTarget(payload.jobId, target);
  }

  async sendPrintJob(input: {
    orderId: string;
    orderStableId: string;
    storeId: string;
    kind: string;
    data: unknown;
  }) {
    const targets = (
      input.data as { targets?: { customer?: boolean; kitchen?: boolean } }
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
        customerStatus: targets?.customer === true ? 'PENDING' : 'SKIPPED',
        kitchenStatus: targets?.kitchen === true ? 'PENDING' : 'SKIPPED',
      },
      update: {},
    });
    await Promise.all(
      (['customer', 'kitchen'] as const).map((target) =>
        this.dispatchTarget(job.jobId, target),
      ),
    );
    return job;
  }

  private async dispatchPending(storeId: string) {
    const jobs = await this.prisma.posPrintJob.findMany({
      where: {
        storeId,
        OR: [
          { customerStatus: { in: ['PENDING', 'FAILED'] } },
          { kitchenStatus: { in: ['PENDING', 'FAILED'] } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    await Promise.all(
      jobs.flatMap((job) =>
        (['customer', 'kitchen'] as const).map((target) =>
          this.dispatchTarget(job.jobId, target),
        ),
      ),
    );
  }

  private async dispatchTarget(jobId: string, target: 'customer' | 'kitchen') {
    if (this.timers.has(`${jobId}:${target}`)) return;
    const job = await this.prisma.posPrintJob.findUnique({ where: { jobId } });
    if (
      !job ||
      !job[`${target}Requested`] ||
      job[`${target}Status`] === 'COMPLETED'
    )
      return;
    const attemptsKey = `${target}Attempts` as const;
    if (job[attemptsKey] >= this.maxAttempts) return;
    const sockets = await this.server.in(`store:${job.storeId}`).fetchSockets();
    const reason = sockets.length ? null : 'CLIENT_OFFLINE';
    await this.prisma.posPrintJob.update({
      where: { jobId },
      data: {
        [attemptsKey]: { increment: 1 },
        [`${target}Status`]: reason ? 'FAILED' : 'DELIVERED',
        [`${target}FailureReason`]: reason,
      },
    });
    if (reason) return;
    this.server
      .to(`store:${job.storeId}`)
      .emit('PRINT_JOB', { jobId, target, payload: job.payload });
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

  private async markTimeoutAndRetry(
    jobId: string,
    target: 'customer' | 'kitchen',
  ) {
    this.timers.delete(`${jobId}:${target}`);
    await this.prisma.posPrintJob.update({
      where: { jobId },
      data: {
        [`${target}Status`]: 'FAILED',
        [`${target}FailureReason`]: 'ACK_TIMEOUT',
      },
    });
    await this.dispatchTarget(jobId, target);
  }

  async getOrderPrintStatus(orderStableId: string) {
    return this.prisma.posPrintJob.findFirst({
      where: { orderStableId, kind: 'AUTO' },
      orderBy: { createdAt: 'desc' },
    });
  }

  sendPrintSummary(storeId: string, data: unknown) {
    const roomName = `store:${storeId}`;
    this.logger.log(`🚀 Sending PRINT_SUMMARY to ${roomName}`);
    this.server.to(roomName).emit('PRINT_SUMMARY', data);
  }

  publishCustomerOrderingStatusUpdate(data: {
    isTemporarilyClosed: boolean;
    autoResumeAt: string | null;
  }) {
    this.logger.log('📣 Broadcasting CUSTOMER_ORDERING_STATUS_UPDATED');
    this.server.emit(POS_CUSTOMER_ORDERING_STATUS_UPDATED_EVENT, data);
  }
}
