import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Consumer } from 'sqs-consumer';
import { SQSClient } from '@aws-sdk/client-sqs';
import { LoyaltyService } from './loyalty.service';

@Injectable()
export class LoyaltyEventProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LoyaltyEventProcessor.name);
  private consumer?: Consumer;

  constructor(private readonly loyaltyService: LoyaltyService) {}

  onModuleInit() {
    const queueUrl = process.env.LOYALTY_SQS_QUEUE_URL;
    if (!queueUrl) {
      this.logger.warn(
        'LOYALTY_SQS_QUEUE_URL not found, Loyalty processor disabled.',
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
    } catch (e) {
      this.logger.warn(`Invalid JSON in SQS body: ${sqsMessage.Body}`);
      return;
    }

    this.logger.log(`Received Event: ${JSON.stringify(eventPayload)}`);

    // 业务路由：只处理 ORDER_PAID
    if (eventPayload.event === 'ORDER_PAID') {
      const { orderId, userId, amountCents, redeemValueCents } = eventPayload;

      this.logger.log(`Processing ORDER_PAID for order=${orderId}, user=${userId}`);

      await this.loyaltyService.settleOnPaid({
        orderId: orderId ?? '',
        userId,
        subtotalCents: amountCents ?? 0,
        redeemValueCents: redeemValueCents ?? 0,
      });
    }
  }
}
