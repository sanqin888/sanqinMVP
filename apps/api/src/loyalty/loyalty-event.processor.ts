import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Consumer } from 'sqs-consumer';
import { SQSClient } from '@aws-sdk/client-sqs';
import { LoyaltyService } from './loyalty.service';
import { OrderEventsBus } from '../messaging/order-events.bus';

@Injectable()
export class LoyaltyEventProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LoyaltyEventProcessor.name);
  private consumer?: Consumer;

  private readonly onOrderPaidVerified = async (payload: {
    orderId: string;
    userId?: string;
    amountCents?: number;
    redeemValueCents?: number;
  }) => {
    await this.handleOrderPaid({
      orderId: payload.orderId,
      userId: payload.userId,
      amountCents: payload.amountCents,
      redeemValueCents: payload.redeemValueCents,
      source: 'order-events-bus',
    });
  };

  constructor(
    private readonly loyaltyService: LoyaltyService,
    private readonly orderEventsBus: OrderEventsBus,
  ) {}

  onModuleInit() {
    this.orderEventsBus.onOrderPaidVerified(this.onOrderPaidVerified);

    const queueUrl = process.env.LOYALTY_SQS_QUEUE_URL;
    if (!queueUrl) {
      this.logger.warn(
        'LOYALTY_SQS_QUEUE_URL not found, Loyalty SQS consumer disabled.',
      );
      return;
    }

    this.consumer = Consumer.create({
      queueUrl,
      sqs: new SQSClient({ region: process.env.AWS_REGION }),
      handleMessage: async (message) => {
        try {
          await this.processMessage(message);
        } catch (error) {
          this.logger.error(
            `Failed to process loyalty event: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          throw error;
        }
        return message;
      },
    });

    this.consumer.on('error', (err) => {
      this.logger.error(`SQS Consumer Error: ${err.message}`);
    });

    this.consumer.on('processing_error', (err) => {
      this.logger.error(`SQS Processing Error: ${err.message}`);
    });

    this.consumer.start();
    this.logger.log(`Loyalty SQS Consumer started listening on ${queueUrl}`);
  }

  onModuleDestroy() {
    this.orderEventsBus.offOrderPaidVerified(this.onOrderPaidVerified);
    if (this.consumer) {
      this.consumer.stop();
    }
  }

  /**
   * 解析 SQS 消息 (Raw Mode)
   * 因为开启了 Raw Message Delivery，sqsMessage.Body 直接就是我们要的业务 JSON
   */
  private async processMessage(sqsMessage: { Body?: string }) {
    if (!sqsMessage.Body) return;

    let eventPayload: {
      event?: string;
      orderId?: string;
      userId?: string;
      amountCents?: number;
      redeemValueCents?: number;
    };
    try {
      // ✅ 只需要解析这一层，没有信封了
      eventPayload = JSON.parse(sqsMessage.Body) as {
        event?: string;
        orderId?: string;
        userId?: string;
        amountCents?: number;
        redeemValueCents?: number;
      };
    } catch {
      this.logger.warn(`Invalid JSON in SQS body: ${sqsMessage.Body}`);
      return;
    }

    this.logger.log(`Received Event: ${JSON.stringify(eventPayload)}`);

    // 业务路由：只处理 ORDER_PAID
    if (eventPayload.event === 'ORDER_PAID') {
      await this.handleOrderPaid({
        orderId: eventPayload.orderId,
        userId: eventPayload.userId,
        amountCents: eventPayload.amountCents,
        redeemValueCents: eventPayload.redeemValueCents,
        source: 'sqs',
      });
    }
  }

  private async handleOrderPaid(params: {
    orderId?: string;
    userId?: string;
    amountCents?: number;
    redeemValueCents?: number;
    source: 'sqs' | 'order-events-bus';
  }) {
    const orderId = params.orderId?.trim();
    if (!orderId) {
      this.logger.warn(
        `[Loyalty] Ignore ORDER_PAID from ${params.source}: missing orderId`,
      );
      return;
    }

    this.logger.log(
      `[Loyalty] Processing ORDER_PAID from ${params.source} for order=${orderId}, user=${params.userId ?? 'N/A'}`,
    );

    await this.loyaltyService.settleOnPaid({
      orderId,
      userId: params.userId,
      subtotalCents: params.amountCents ?? 0,
      redeemValueCents: params.redeemValueCents ?? 0,
    });
  }
}
