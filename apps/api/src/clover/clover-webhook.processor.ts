import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { SQSClient } from '@aws-sdk/client-sqs';
import { Consumer } from 'sqs-consumer';
import { CheckoutIntentsService } from './checkout-intents.service';
import { OrdersService } from '../orders/orders.service';
import { CloverService } from './clover.service';
import { buildOrderDtoFromMetadata } from './hco-metadata';
import { normalizeStableId } from '../common/utils/stable-id';
import { CLIENT_REQUEST_ID_RE } from '../common/utils/client-request-id';

const normalizeClientRequestId = (
  value?: string | null,
): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().toUpperCase();
  return CLIENT_REQUEST_ID_RE.test(trimmed) ? trimmed : undefined;
};

type CloverWebhookEvent = {
  checkoutSessionId?: string;
  referenceId?: string;
  result?: string;
  status?: string;
};

const errToString = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

@Injectable()
export class CloverWebhookProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CloverWebhookProcessor.name);
  private consumer?: Consumer;

  constructor(
    private readonly checkoutIntents: CheckoutIntentsService,
    private readonly orders: OrdersService,
    private readonly clover: CloverService,
  ) {}

  onModuleInit() {
    const queueUrl = process.env.CLOVER_SQS_QUEUE_URL;
    if (!queueUrl) {
      this.logger.warn(
        'CLOVER_SQS_QUEUE_URL not configured, skipping processor.',
      );
      return;
    }

    this.consumer = Consumer.create({
      queueUrl,
      sqs: new SQSClient({ region: process.env.AWS_REGION }),
      handleMessage: async (message) => {
        if (!message.Body) {
          this.logger.warn('Received empty SQS message body.');
          return undefined;
        }
        let payload: unknown;
        try {
          payload = JSON.parse(message.Body);
        } catch (error) {
          this.logger.error(
            `Invalid JSON in SQS message: ${errToString(error)}`,
          );
          return undefined;
        }
        await this.processEvent(payload);
        return message;
      },
    });

    this.consumer.on('error', (err) => {
      this.logger.error(err.message);
    });

    this.consumer.on('processing_error', (err) => {
      this.logger.error(err.message);
    });

    this.consumer.start();
    this.logger.log('Clover SQS Consumer started...');
  }

  onModuleDestroy() {
    if (this.consumer) {
      this.consumer.stop();
    }
  }

  private async processEvent(payload: unknown) {
    this.logger.log('Processing payload from SQS...');

    // ---- 1. 抽取我们关心的字段 ----
    const event = this.extractEvent(payload);

    if (!event.checkoutSessionId && !event.referenceId) {
      this.logger.warn('Clover webhook missing identifiers');
      return;
    }

    const checkoutSessionId = event.checkoutSessionId ?? null;
    const referenceId = event.referenceId ?? null;

    // ---- 2. 根据 checkoutSessionId / referenceId 找到 CheckoutIntent ----
    const intent = await this.checkoutIntents.findByIdentifiers({
      checkoutSessionId,
      referenceId,
    });

    if (!intent) {
      this.logger.warn(
        `No CheckoutIntent found for checkoutSessionId=${checkoutSessionId} referenceId=${referenceId}`,
      );
      return;
    }

    if (
      intent.orderId ||
      intent.status === 'completed' ||
      intent.status === 'failed' ||
      intent.status === 'expired'
    ) {
      this.logger.log(
        `CheckoutIntent ${intent.id} already processed as order ${intent.orderId}, ignoring duplicate webhook`,
      );
      return;
    }

    if (intent.status === 'processing') {
      this.logger.log(
        `CheckoutIntent ${intent.id} is already processing, ignoring duplicate webhook`,
      );
      return;
    }

    if (intent.expiresAt && intent.expiresAt < new Date()) {
      await this.checkoutIntents.markExpired(intent.id);
      this.logger.warn(
        `CheckoutIntent ${intent.id} expired before webhook processing`,
      );
      return;
    }

    const claimed = await this.checkoutIntents.claimProcessing(intent.id);
    if (!claimed) {
      this.logger.log(
        `CheckoutIntent ${intent.id} already claimed by another worker`,
      );
      return;
    }

    // ---- 3. 根据 Clover 返回的状态判断是否支付成功 ----
    const rawStatus = (event.status || event.result || '').toString();

    // 目前 webhook payload 的状态字段是简单字符串，
    // 直接用字符串匹配即可识别成功状态（APPROVED / SUCCESS / PAID / COMPLETE / SETTLED 等）
    const isSuccess = /success|approved|paid|complete|settled/i.test(rawStatus);

    if (!isSuccess) {
      this.logger.warn(
        `CheckoutIntent ${intent.id} webhook status not successful (status=${rawStatus}), not creating order`,
      );
      await this.checkoutIntents.markFailed({
        intentId: intent.id,
        result: rawStatus || 'FAILED',
      });
      return;
    }

    // ---- 4. （可选）调用 Clover API 再次确认支付状态 ----
    const skipVerify =
      process.env.CLOVER_SKIP_VERIFY === '1' ||
      process.env.NODE_ENV !== 'production';

    if (skipVerify) {
      this.logger.warn(
        `Skipping Clover payment verification for intent ${intent.id} in dev mode`,
      );
    } else if (intent.checkoutSessionId) {
      const ok = await this.clover.verifyHostedCheckoutPaid(
        intent.checkoutSessionId,
      );
      if (!ok) {
        this.logger.warn(
          `verifyHostedCheckoutPaid returned false for checkoutSessionId=${intent.checkoutSessionId}`,
        );
        await this.checkoutIntents.markFailed({
          intentId: intent.id,
          result: 'VERIFICATION_FAILED',
        });
        return;
      }
    }

    // ---- 5. 构造订单 DTO 并创建订单 ----
    try {
      const orderStableId =
        normalizeStableId(
          (intent.metadata as { orderStableId?: unknown })?.orderStableId,
        ) ?? undefined;
      const clientRequestId = normalizeClientRequestId(intent.referenceId);

      const orderDto = buildOrderDtoFromMetadata(
        intent.metadata,
        orderStableId,
      );
      if (clientRequestId) {
        orderDto.clientRequestId = clientRequestId;
      }

      const idempotencyKey =
        orderStableId ??
        intent.checkoutSessionId ??
        intent.referenceId ??
        intent.id;

      // 1) 先建订单（已支付）
      const order = await this.orders.createInternal(orderDto, idempotencyKey);

      // 2) 标记 CheckoutIntent 已处理
      await this.checkoutIntents.markCompleted({
        intentId: intent.id,
        orderId: order.id,
        result: event.result ?? event.status ?? 'SUCCESS',
      });

      this.logger.log(
        `Created order ${order.id} with status=${order.status} from Clover checkout ${
          intent.checkoutSessionId ?? intent.referenceId
        }`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create order for checkout intent ${intent.id}: ${errToString(
          error,
        )}`,
      );
      throw error;
    }
  }

  // 从 Clover webhook JSON 里递归抽取 checkoutSessionId / referenceId / status / result
  private extractEvent(payload: unknown): CloverWebhookEvent {
    const event: CloverWebhookEvent = {};

    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== 'object') return;

      for (const [key, raw] of Object.entries(
        value as Record<string, unknown>,
      )) {
        const lower = key.toLowerCase();

        // Hosted Checkout webhook 文档中，Data 字段 = Checkout Session UUID
        if (
          !event.checkoutSessionId &&
          (lower === 'checkoutsessionid' || lower === 'data') &&
          typeof raw === 'string'
        ) {
          event.checkoutSessionId = raw;
        }

        if (
          !event.referenceId &&
          (lower === 'referenceid' || lower === 'orderid') &&
          typeof raw === 'string'
        ) {
          event.referenceId = raw;
        }

        if (!event.result && lower === 'result' && typeof raw === 'string') {
          event.result = raw;
        }

        if (!event.status && lower === 'status' && typeof raw === 'string') {
          event.status = raw;
        }

        visit(raw);
      }
    };

    visit(payload);
    return event;
  }
}
