// apps/api/src/clover/clover-pay.controller.ts
import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { AppLogger } from '../common/app-logger';
import { CloverService } from './clover.service';
import {
  CreateHostedCheckoutDto,
  HOSTED_CHECKOUT_CURRENCY,
} from './dto/create-hosted-checkout.dto';
import { CheckoutIntentsService } from './checkout-intents.service';
import {
  parseHostedCheckoutMetadata,
  type HostedCheckoutMetadata,
  buildOrderDtoFromMetadata,
} from './hco-metadata';
import { OrdersService } from '../orders/orders.service';
import { generateStableId } from '../common/utils/stable-id';
import { buildClientRequestId } from '../common/utils/client-request-id';

const normalizeReturnUrlBase = (value?: string | null): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
};

@Controller('clover')
export class CloverPayController {
  private readonly logger = new AppLogger(CloverPayController.name);

  constructor(
    private readonly clover: CloverService,
    private readonly checkoutIntents: CheckoutIntentsService,
    private readonly orders: OrdersService,
  ) {}

  @Post('pay/online/hosted-checkout')
  async createCheckout(@Body() dto: CreateHostedCheckoutDto) {
    this.logger.log(
      `Incoming hosted-checkout request: amountCents=${dto.amountCents ?? 'N/A'}`,
    );

    if (!dto.metadata) {
      throw new BadRequestException({
        code: 'CHECKOUT_METADATA_REQUIRED',
        message: 'metadata is required to create a hosted checkout session',
      });
    }

    let metadata: HostedCheckoutMetadata;
    try {
      metadata = parseHostedCheckoutMetadata(dto.metadata);
    } catch (error) {
      throw new BadRequestException({
        code: 'INVALID_CHECKOUT_METADATA',
        message:
          error instanceof Error
            ? error.message
            : 'invalid hosted checkout metadata payload',
      });
    }

    const currency = dto.currency ?? HOSTED_CHECKOUT_CURRENCY;
    const clientRequestId = buildClientRequestId();
    const orderStableId = generateStableId();
    const { returnUrlBase, ...dtoRest } = dto;
    const normalizedReturnUrlBase =
      normalizeReturnUrlBase(returnUrlBase) ??
      normalizeReturnUrlBase(dto.returnUrl);
    const returnUrl = normalizedReturnUrlBase
      ? `${normalizedReturnUrlBase}/${encodeURIComponent(orderStableId)}`
      : undefined;
    const metadataWithIds = {
      ...metadata,
      orderStableId,
    } satisfies HostedCheckoutMetadata;

    const locale = metadata.locale;

    // ⭐ 0 元订单：不走 Clover，直接用积分支付并创建已支付订单
    if (typeof dto.amountCents === 'number' && dto.amountCents <= 0) {
      const referenceId = clientRequestId;

      // 先记录 CheckoutIntent（状态 pending）
      const intent = await this.checkoutIntents.recordIntent({
        referenceId,
        checkoutSessionId: null,
        amountCents: dto.amountCents,
        currency,
        locale,
        metadata: metadataWithIds,
      });

      // 用和 webhook 一样的逻辑，从 metadata 生成 CreateOrderDto
      const orderDto = buildOrderDtoFromMetadata(
        metadataWithIds,
        orderStableId,
      );
      orderDto.clientRequestId = clientRequestId;

      // 创建并立即标记为已支付（内部会计算金额 + 调 loyalty.settleOnPaid）
      const order = await this.orders.createImmediatePaid(orderDto);

      this.logger.log(
        `Loyalty-only order created via Clover hosted checkout. orderId=${order.id} orderStableId=${order.orderStableId ?? 'null'}`,
      );

      // 更新 CheckoutIntent 状态为已完成（LOYALTY_ONLY）
      await this.checkoutIntents.markProcessed({
        intentId: intent.id,
        orderId: order.id,
        status: 'completed',
        result: 'LOYALTY_ONLY',
      });

      // thank-you 页参数：优先用稳定号，其次 UUID
      const routeLocale = locale ?? 'zh';
      const orderParam = order.orderStableId;
      if (!orderParam) {
        throw new BadGatewayException('orderStableId missing');
      }
      const checkoutUrl = `/${routeLocale}/thank-you/${encodeURIComponent(
        orderParam,
      )}`;

      return {
        checkoutUrl,
        checkoutId: null,
        orderStableId: orderParam,
        orderNumber: clientRequestId,
      };
    }

    // ⭐ 金额 > 0 的情况：正常走 Clover Hosted Checkout
    const checkoutRequest = {
      ...dtoRest,
      returnUrl,
      referenceId: clientRequestId,
      description: dto.description ?? `San Qin online order ${clientRequestId}`,
      orderId: orderStableId,
      metadata: metadataWithIds,
    };

    const result = await this.clover.createHostedCheckout(checkoutRequest);

    if (!result.ok) {
      const friendly = interpretCheckoutFailure(result.reason);

      if (friendly?.type === 'card-declined') {
        throw new BadRequestException({
          code: friendly.code,
          message: friendly.message,
          reason: friendly.reason,
        });
      }

      throw new BadGatewayException({
        code: 'CLOVER_CHECKOUT_FAILED',
        message: `Failed to create Clover hosted checkout: ${result.reason}`,
        reason: result.reason,
      });
    }

    const referenceId = clientRequestId;

    await this.checkoutIntents.recordIntent({
      referenceId,
      checkoutSessionId: result.checkoutSessionId,
      amountCents: dto.amountCents,
      currency,
      locale,
      metadata: metadataWithIds,
    });

    return {
      checkoutUrl: result.href,
      checkoutId: result.checkoutSessionId,
      orderStableId,
      orderNumber: clientRequestId,
    };
  }
}

type FailureInsight =
  | {
      type: 'card-declined';
      code: string;
      message: string;
      reason: string;
    }
  | undefined;

function interpretCheckoutFailure(reason: unknown): FailureInsight {
  if (typeof reason !== 'string' || reason.trim() === '') return undefined;

  const meta = extractCloverErrorMeta(reason);
  const haystack = `${reason} ${meta?.message ?? ''}`.toLowerCase();
  const matchedCardDecline =
    (meta?.code ?? '').toLowerCase() === 'card_declined' ||
    (meta?.declineCode ?? '').toLowerCase() === 'issuer_declined' ||
    haystack.includes('card_declined') ||
    (haystack.includes('decline') && haystack.includes('card'));

  if (!matchedCardDecline) return undefined;

  const limitHit = haystack.includes(
    'sale count per card is greater than configured amount',
  );

  const zhMessage = limitHit
    ? '银行卡支付失败：该卡今日交易次数已达到银行设定上限，请尝试使用其他银行卡或联系发卡行。'
    : '银行卡支付失败：银行拒绝了本次交易，请尝试更换银行卡或联系发卡行确认。';
  const enMessage = limitHit
    ? 'Card declined: this card has reached the bank’s allowed number of sales today. Please try a different card or contact your bank.'
    : 'Card declined by the issuing bank. Please try a different card or contact your bank for assistance.';

  return {
    type: 'card-declined',
    code: 'CLOVER_CARD_DECLINED',
    message: `${zhMessage} ${enMessage}`,
    reason: String(reason),
  };
}

type CloverErrorMeta = {
  code?: string;
  declineCode?: string;
  message?: string;
};

function extractCloverErrorMeta(reason: string): CloverErrorMeta | undefined {
  const attempts = collectReasonCandidates(reason);

  for (const candidate of attempts) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      const meta = normalizeCloverErrorPayload(parsed);
      if (meta) return meta;
    } catch {
      const cleaned = candidate.replace(/\\"/g, '"');
      try {
        const parsed: unknown = JSON.parse(cleaned);
        const meta = normalizeCloverErrorPayload(parsed);
        if (meta) return meta;
      } catch {
        continue;
      }
    }
  }

  return undefined;
}

function collectReasonCandidates(reason: string): string[] {
  const trimmed = reason.trim();
  const candidates: string[] = [];

  if (trimmed) {
    candidates.push(trimmed);
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      candidates.push(trimmed.slice(1, -1));
    }
  }

  const jsonMatch = reason.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const match = jsonMatch[0];
    candidates.push(match);
    if (match.startsWith('"') && match.endsWith('"')) {
      candidates.push(match.slice(1, -1));
    }
  }

  return Array.from(new Set(candidates)).filter((entry) => entry.trim() !== '');
}

function normalizeCloverErrorPayload(
  payload: unknown,
): CloverErrorMeta | undefined {
  if (!payload || typeof payload !== 'object') return undefined;

  const record = payload as Record<string, unknown>;
  const errorRaw = record.error;
  const error =
    errorRaw && typeof errorRaw === 'object'
      ? (errorRaw as Record<string, unknown>)
      : undefined;

  const code = typeof error?.code === 'string' ? error.code : undefined;
  const declineCode =
    typeof error?.declineCode === 'string' ? error.declineCode : undefined;
  const message =
    typeof error?.message === 'string'
      ? error.message
      : typeof record.message === 'string'
        ? record.message
        : undefined;

  if (!code && !declineCode && !message) return undefined;

  return { code, declineCode, message };
}
