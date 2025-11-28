import {
  Controller,
  Post,
  Req,
  Res,
  Headers,
  HttpCode,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { CheckoutIntentsService } from './checkout-intents.service';
import { OrdersService } from '../orders/orders.service';
import { buildOrderDtoFromMetadata } from './hco-metadata';
import { CloverService } from './clover.service';
import { OrderStatus } from '../orders/order-status';

type RawBodyRequest = Request & { rawBody?: Buffer };

type CloverWebhookEvent = {
  checkoutSessionId?: string;
  referenceId?: string;
  result?: string;
  status?: string;
};

const errToString = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

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
    @Headers('clover-signature') signature?: string,
  ) {
    this.logger.log('=== Clover HCO webhook entered ==='); // 👈 直接加在最前面

    // ---- 1. 还原 rawBody ----
    let rawBody: Buffer;
    const body: unknown = req.body;

    if (Buffer.isBuffer(req.rawBody)) {
      rawBody = req.rawBody;
    } else if (Buffer.isBuffer(body)) {
      rawBody = body;
    } else if (typeof body === 'string') {
      rawBody = Buffer.from(body, 'utf8');
    } else if (body && typeof body === 'object') {
      rawBody = Buffer.from(JSON.stringify(body), 'utf8');
    } else {
      rawBody = Buffer.alloc(0);
    }

    const secret = process.env.CLOVER_HCO_SIGNING_SECRET || '';

    // ---- 2. 签名校验（如果配置了 secret）----
    if (secret && rawBody.length > 0) {
      if (!signature) {
        this.logger.warn('Clover HCO webhook missing Clover-Signature header');
        // 不直接 401，避免配置错误时整个支付流程卡死；只是记录日志
      } else {
        const [tPart, v1Part] = signature.split(',').map((s) => s.trim());
        const ts = tPart?.startsWith('t=') ? tPart.slice(2) : undefined;
        const v1 = v1Part?.startsWith('v1=') ? v1Part.slice(3) : undefined;

        if (ts && v1) {
          const signedPayload = `${ts}.${rawBody.toString('utf8')}`;
          const mac = createHmac('sha256', secret)
            .update(signedPayload)
            .digest('hex');

          const sigOk =
            mac.length === v1.length &&
            timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(v1, 'hex'));

          if (!sigOk) {
            this.logger.warn(
              `Invalid Clover HCO signature: expected HMAC for ts=${ts}, header=${signature}`,
            );
            // 为了容忍配置问题，这里仍然返回 200，让 Clover 不重试
            return res.status(200).send('invalid-signature');
          }
        } else {
          this.logger.warn(
            `Malformed Clover-Signature header received: ${signature}`,
          );
        }
      }
    }

    // ---- 3. 解析 JSON payload ----
    let payload: unknown;
    try {
      payload = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {};
    } catch (error) {
      this.logger.warn(
        `Clover HCO webhook JSON parse failed: ${errToString(error)}`,
      );
      payload = {};
    }

    this.logger.log(
      `Clover HCO webhook payload debug: ${JSON.stringify(payload)}`,
    );

    // ---- 4. 抽取我们关心的字段 ----
    const event = this.extractEvent(payload);

    if (!event.checkoutSessionId && !event.referenceId) {
      this.logger.warn('Clover webhook missing identifiers');
      return res.status(200).send('missing-identifiers');
    }

    const checkoutSessionId = event.checkoutSessionId ?? null;
    const referenceId = event.referenceId ?? null;

    // ---- 5. 根据 checkoutSessionId / referenceId 找到 CheckoutIntent ----
    const intent = await this.checkoutIntents.findByIdentifiers({
      checkoutSessionId,
      referenceId,
    });

    if (!intent) {
      this.logger.warn(
        `No CheckoutIntent found for checkoutSessionId=${checkoutSessionId} referenceId=${referenceId}`,
      );
      return res.status(200).send('intent-not-found');
    }

    if (intent.orderId) {
      this.logger.log(
        `CheckoutIntent ${intent.id} already processed as order ${intent.orderId}, ignoring duplicate webhook`,
      );
      return res.status(200).send('already-processed');
    }

    // ---- 6. 根据 Clover 返回的状态判断是否支付成功 ----
    const rawStatus = (event.status || event.result || '').toString();

    // 目前 webhook payload 的状态字段是简单字符串，
    // 直接用字符串匹配即可识别成功状态（APPROVED / SUCCESS / PAID / COMPLETE / SETTLED 等）
    const isSuccess = /success|approved|paid|complete|settled/i.test(rawStatus);

    if (!isSuccess) {
      this.logger.warn(
        `CheckoutIntent ${intent.id} webhook status not successful (status=${rawStatus}), not creating order`,
      );
      // 保持 intent 为 pending，方便后续人工排查
      return res.status(200).send('not-success-status');
    }

    // ---- 7. （可选）调用 Clover API 再次确认支付状态 ----
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
        return res.status(200).send('verification-failed');
      }
    }

    // ---- 8. 构造订单 DTO 并创建订单（然后推进状态到 paid） ----
    try {
      // ✅ 优先用 referenceId（例如 SQ743563），没有才退回到 intent.id
      const clientRequestId = intent.referenceId || intent.id;

      const orderDto = buildOrderDtoFromMetadata(
        intent.metadata,
        clientRequestId,
      );
      // 1) 先建订单（默认 pending）
      const order = await this.orders.create(orderDto);

      // 2) 在线支付成功的单，直接把状态推进到 paid（触发 loyalty 结算）
      const finalized = await this.orders.updateStatus(
        order.id,
        OrderStatus.paid,
      );

      // 3) 标记 CheckoutIntent 已处理
      await this.checkoutIntents.markProcessed({
        intentId: intent.id,
        orderId: finalized.id,
        status: event.status ?? event.result ?? 'SUCCESS',
        result: event.result ?? 'SUCCESS',
      });

      this.logger.log(
        `Created order ${finalized.id} with status=${finalized.status} from Clover checkout ${
          intent.checkoutSessionId ?? intent.referenceId
        }`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create order for checkout intent ${intent.id}: ${errToString(
          error,
        )}`,
      );
      return res.status(500).send('order-create-failed');
    }
    return res.send('ok');
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
