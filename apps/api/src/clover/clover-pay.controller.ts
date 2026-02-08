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
  CLOVER_PAYMENT_CURRENCY,
  CreateCardTokenPaymentDto,
} from './dto/create-card-token-payment.dto';
import { CheckoutIntentsService } from './checkout-intents.service';
import {
  parseHostedCheckoutMetadata,
  type HostedCheckoutMetadata,
  buildOrderDtoFromMetadata,
} from './hco-metadata';
import { OrdersService } from '../orders/orders.service';
import { generateStableId } from '../common/utils/stable-id';
import { buildClientRequestId } from '../common/utils/client-request-id';

@Controller('clover')
export class CloverPayController {
  private readonly logger = new AppLogger(CloverPayController.name);

  constructor(
    private readonly clover: CloverService,
    private readonly checkoutIntents: CheckoutIntentsService,
    private readonly orders: OrdersService,
  ) {}

  @Post('pay/online/card-token')
  async payWithCardToken(@Body() dto: CreateCardTokenPaymentDto) {
    this.logger.log(
      `Incoming card-token payment request: amountCents=${dto.amountCents ?? 'N/A'}`,
    );

    if (!dto.metadata) {
      throw new BadRequestException({
        code: 'CHECKOUT_METADATA_REQUIRED',
        message: 'metadata is required to create a card payment',
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
            : 'invalid checkout metadata payload',
      });
    }

    const isPlainObject = (v: unknown): v is Record<string, unknown> =>
      !!v && typeof v === 'object' && !Array.isArray(v);

    const normalizedName = dto.cardholderName?.trim() ?? '';
    if (!normalizedName) {
      throw new BadRequestException({
        code: 'CARDHOLDER_NAME_REQUIRED',
        message: 'cardholderName is required',
      });
    }

    const normalizedPostalCode = normalizeCanadianPostalCode(dto.postalCode);
    if (
      !normalizedPostalCode ||
      !isValidCanadianPostalCode(normalizedPostalCode)
    ) {
      throw new BadRequestException({
        code: 'INVALID_POSTAL_CODE',
        message: 'postalCode must be a valid Canadian postal code',
      });
    }

    const threeds = isPlainObject(dto.threeds) ? dto.threeds : undefined;
    const browserInfo =
      threeds && isPlainObject(threeds.browserInfo)
        ? threeds.browserInfo
        : undefined;
    if (!browserInfo || typeof browserInfo.browserOrigin !== 'string') {
      throw new BadRequestException({
        code: 'BROWSER_INFO_REQUIRED',
        message: 'threeds.browserInfo with browserOrigin is required',
      });
    }

    const rawEmail = (() => {
      const meta = dto.metadata;
      if (!isPlainObject(meta)) return undefined;

      const customer = meta.customer;
      if (!isPlainObject(customer)) return undefined;

      const email = customer.email;
      return typeof email === 'string' && email.trim().length > 0
        ? email.trim()
        : undefined;
    })();

    const parsedEmail = metadata.customer.email;
    const finalEmail = parsedEmail ?? rawEmail;

    if (!finalEmail) {
      throw new BadRequestException({
        code: 'CUSTOMER_EMAIL_REQUIRED',
        message: 'customer email is required for online payment',
      });
    }

    const currency = dto.currency ?? CLOVER_PAYMENT_CURRENCY;
    const referenceId = dto.checkoutIntentId?.trim() || buildClientRequestId();
    const orderStableId = metadata.orderStableId ?? generateStableId();

    const metadataWithIds = {
      ...metadata,
      customer: {
        ...metadata.customer,
        email: finalEmail,
      },
      orderStableId,
    } satisfies HostedCheckoutMetadata;

    const existingIntent = await this.checkoutIntents.findByIdentifiers({
      referenceId,
    });

    if (existingIntent?.orderId) {
      return {
        orderStableId: existingIntent.metadata.orderStableId ?? orderStableId,
        orderNumber: referenceId,
        paymentId: existingIntent.orderId ?? 'UNKNOWN',
        status: 'COMPLETED',
      };
    }

    const intent =
      existingIntent ??
      (await this.checkoutIntents.recordIntent({
        referenceId,
        checkoutSessionId: null,
        amountCents: dto.amountCents,
        currency,
        locale: metadata.locale,
        metadata: metadataWithIds,
      }));

    const claimed = await this.checkoutIntents.claimProcessing(intent.id);
    if (!claimed) {
      throw new BadRequestException({
        code: 'CHECKOUT_IN_PROGRESS',
        message: 'checkout intent is already being processed',
      });
    }

    const lineItems = metadata.items.map((item) => ({
      name: item.displayName || item.nameZh || item.nameEn || 'Item',
      price: Math.round(item.priceCents),
      unitQty: Math.max(1, Math.round(item.quantity)),
      ...(item.notes ? { note: item.notes } : {}),
    }));
    if (metadata.serviceFeeCents && metadata.serviceFeeCents > 0) {
      lineItems.push({
        name: 'Service fee',
        price: Math.round(metadata.serviceFeeCents),
        unitQty: 1,
      });
    }
    if (metadata.deliveryFeeCents && metadata.deliveryFeeCents > 0) {
      lineItems.push({
        name: 'Delivery fee',
        price: Math.round(metadata.deliveryFeeCents),
        unitQty: 1,
      });
    }
    if (metadata.taxCents && metadata.taxCents > 0) {
      lineItems.push({
        name: 'Tax',
        price: Math.round(metadata.taxCents),
        unitQty: 1,
      });
    }

    const cloverOrder = await this.clover.createOrder({
      currency,
      lineItems,
    });

    if (!cloverOrder.ok) {
      await this.checkoutIntents.markFailed({
        intentId: intent.id,
        result: 'ORDER_FAILED',
      });
      throw new BadGatewayException({
        code: 'CLOVER_ORDER_FAILED',
        message: `Failed to create Clover order: ${cloverOrder.reason}`,
      });
    }

    const paymentResult = await this.clover.createCardPayment({
      amountCents: dto.amountCents,
      currency,
      source: dto.source,
      sourceType: dto.sourceType,
      orderId: cloverOrder.orderId,
      cardholderName: normalizedName,
      postalCode: normalizedPostalCode,
      threeds: {
        ...threeds,
        browserInfo,
      },
      referenceId,
    });

    if (!paymentResult.ok) {
      await this.checkoutIntents.markFailed({
        intentId: intent.id,
        result: paymentResult.status ?? 'FAILED',
      });

      const meta = extractCloverErrorMeta(paymentResult.reason);
      const errorCode =
        meta?.code?.toLowerCase() ??
        meta?.declineCode?.toLowerCase() ??
        paymentResult.status?.toLowerCase() ??
        'payment_failed';

      throw new BadRequestException({
        code: errorCode,
        message: meta?.message ?? 'Payment failed',
        reason: paymentResult.reason,
        declineCode: meta?.declineCode,
      });
    }

    const orderDto = buildOrderDtoFromMetadata(metadataWithIds, orderStableId);
    orderDto.clientRequestId = referenceId;
    const order = await this.orders.createImmediatePaid(orderDto, referenceId);

    await this.checkoutIntents.markProcessed({
      intentId: intent.id,
      orderId: order.id,
      status: 'completed',
      result: paymentResult.status ?? 'SUCCESS',
    });

    return {
      orderStableId,
      orderNumber: referenceId,
      paymentId: paymentResult.paymentId,
      status: paymentResult.status ?? 'SUCCESS',
    };
  }
}

function normalizeCanadianPostalCode(value?: string): string {
  if (typeof value !== 'string') return '';
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length >= 6) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)}`;
  }
  return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
}

function isValidCanadianPostalCode(value: string): boolean {
  return /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/.test(value.trim().toUpperCase());
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
