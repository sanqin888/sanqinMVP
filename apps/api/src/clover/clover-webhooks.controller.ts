import { Controller, Post, Req, Res, Headers, HttpCode, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { CheckoutIntentsService } from './checkout-intents.service';
import { OrdersService } from '../orders/orders.service';
import { buildOrderDtoFromMetadata } from './hco-metadata';
import { CloverService } from './clover.service';

type RawBodyRequest = Request & { rawBody?: Buffer };

type CloverWebhookEvent = {
  checkoutSessionId?: string;
  referenceId?: string;
  result?: string;
  status?: string;
};

@Controller('webhooks') // 最终路由：/api/v1/webhooks/clover-hco
export class CloverHcoWebhookController {
  private readonly logger = new Logger(CloverHcoWebhookController.name);

  constructor(
    private readonly checkoutIntents: CheckoutIntentsService,
    private readonly orders: OrdersService,
    private readonly clover: CloverService,
  ) {}

  @Post('clover-hco')
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest,
    @Res() res: Response,
    @Headers('clover-signature') sig?: string,
  ) {
    const rawBuffer = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const secret = process.env.CLOVER_HCO_SIGNING_SECRET || '';

    if (secret) {
      const mac = createHmac('sha256', secret).update(rawBuffer).digest('hex');
      const got = sig ?? '';
      if (
        mac.length !== got.length ||
        !timingSafeEqual(Buffer.from(mac), Buffer.from(got))
      ) {
        this.logger.warn('Invalid HCO signature received');
        return res.status(401).send('invalid signature');
      }
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBuffer.toString('utf8'));
    } catch {
      this.logger.warn('Ignoring Clover webhook with non-JSON payload');
      return res.send('ignored');
    }

    const event = this.extractEvent(payload);
    if (!event.checkoutSessionId && !event.referenceId) {
      this.logger.warn('Clover webhook missing identifiers');
      return res.send('ignored');
    }

    if (event.result && event.result.toUpperCase() !== 'SUCCESS') {
      this.logger.log(`Ignoring Clover webhook with result ${event.result}`);
      return res.send('ignored');
    }

    const intent = await this.checkoutIntents.findByIdentifiers({
      checkoutSessionId: event.checkoutSessionId,
      referenceId: event.referenceId,
    });

    if (!intent) {
      this.logger.warn(
        `No checkout intent found for session=${event.checkoutSessionId ?? 'n/a'} reference=${event.referenceId ?? 'n/a'}`,
      );
      return res.status(202).send('intent-not-found');
    }

    if (intent.orderId) {
      this.logger.log(
        `Checkout intent ${intent.id} already linked to order ${intent.orderId}, skipping duplicate webhook`,
      );
      return res.send('ok');
    }

    if (intent.checkoutSessionId) {
      const paid = await this.clover.verifyHostedCheckoutPaid(intent.checkoutSessionId);
      if (!paid) {
        this.logger.warn(
          `Checkout intent ${intent.id} payment not confirmed yet; deferring order creation`,
        );
        return res.status(202).send('payment-not-confirmed');
      }
    } else {
      this.logger.warn(
        `Checkout intent ${intent.id} missing checkoutSessionId, proceeding without Clover verification`,
      );
    }

    try {
      const orderDto = buildOrderDtoFromMetadata(intent.metadata, intent.id);
      const order = await this.orders.create(orderDto);
      await this.checkoutIntents.markProcessed({
        intentId: intent.id,
        orderId: order.id,
        status: event.status ?? event.result ?? 'SUCCESS',
        result: event.result ?? 'SUCCESS',
      });
      this.logger.log(`Created order ${order.id} from Clover checkout ${intent.checkoutSessionId ?? intent.referenceId}`);
    } catch (error) {
      this.logger.error(
        `Failed to create order for checkout intent ${intent.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return res.status(500).send('order-create-failed');
    }

    return res.send('ok');
  }

  private extractEvent(payload: unknown): CloverWebhookEvent {
    const event: CloverWebhookEvent = {};
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== 'object') return;
      for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        const lower = key.toLowerCase();
        if (
          !event.checkoutSessionId &&
          lower === 'checkoutsessionid' &&
          typeof raw === 'string'
        ) {
          event.checkoutSessionId = raw;
        } else if (!event.referenceId && lower === 'referenceid' && typeof raw === 'string') {
          event.referenceId = raw;
        } else if (!event.referenceId && lower === 'orderid' && typeof raw === 'string') {
          event.referenceId = raw;
        } else if (!event.result && (lower === 'result' || lower === 'status') && typeof raw === 'string') {
          event.result = raw;
        } else if (!event.status && lower === 'status' && typeof raw === 'string') {
          event.status = raw;
        }
        visit(raw);
      }
    };

    visit(payload);
    return event;
  }
}
