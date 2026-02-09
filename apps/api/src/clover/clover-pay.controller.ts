// apps/api/src/clover/clover-pay.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  NotFoundException,
  Post,
  Query,
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

  @Get('pay/online/status')
  async getCheckoutIntentStatus(
    @Query('checkoutIntentId') checkoutIntentId?: string,
  ) {
    const referenceId = checkoutIntentId?.trim();
    if (!referenceId) {
      throw new BadRequestException({
        code: 'CHECKOUT_INTENT_REQUIRED',
        message: 'checkoutIntentId is required',
      });
    }

    const intent = await this.checkoutIntents.findByIdentifiers({
      referenceId,
    });
    if (!intent) {
      throw new NotFoundException({
        code: 'CHECKOUT_INTENT_NOT_FOUND',
        message: 'checkout intent not found',
      });
    }

    if (intent.status === 'processing' && !intent.orderId) {
      const paymentMeta = extractPaymentMeta(intent.metadata);
      const chargeStatus = await this.clover.getChargeStatus({
        paymentId: paymentMeta.lastPaymentId,
        idempotencyKey: paymentMeta.lastIdempotencyKey,
      });

      if (chargeStatus.ok) {
        const normalizedStatus = chargeStatus.status?.toLowerCase();
        const isSuccess =
          normalizedStatus === 'succeeded' || chargeStatus.captured === true;
        if (isSuccess) {
          const claimed = await this.checkoutIntents.claimOrderCreation(
            intent.id,
          );
          if (!claimed) {
            return {
              status: intent.status,
              result: intent.result,
              orderStableId: intent.metadata?.orderStableId ?? null,
              orderNumber: intent.referenceId,
            };
          }

          const orderStableId =
            intent.metadata?.orderStableId ?? generateStableId();
          const orderDto = buildOrderDtoFromMetadata(
            intent.metadata,
            orderStableId,
          );
          orderDto.clientRequestId = intent.referenceId;
          const order = await this.orders.createImmediatePaid(
            orderDto,
            intent.referenceId,
          );

          await this.checkoutIntents.markCompleted({
            intentId: intent.id,
            orderId: order.id,
            result: chargeStatus.status ?? 'SUCCESS',
          });

          return {
            status: 'completed',
            result: chargeStatus.status ?? 'SUCCESS',
            orderStableId,
            orderNumber: intent.referenceId,
          };
        }

        if (
          normalizedStatus &&
          ['pending', 'requires_action', 'requires_authentication'].includes(
            normalizedStatus,
          )
        ) {
          return {
            status: 'awaiting_authentication',
            result: chargeStatus.status ?? intent.result,
            orderStableId: intent.metadata?.orderStableId ?? null,
            orderNumber: intent.referenceId,
          };
        }

        if (
          normalizedStatus &&
          ['failed', 'declined', 'canceled', 'cancelled'].includes(
            normalizedStatus,
          )
        ) {
          await this.checkoutIntents.markFailed({
            intentId: intent.id,
            result: chargeStatus.status ?? 'FAILED',
          });

          return {
            status: 'failed',
            result: chargeStatus.status ?? 'FAILED',
            orderStableId: intent.metadata?.orderStableId ?? null,
            orderNumber: intent.referenceId,
          };
        }
      }
    }

    return {
      status: intent.status,
      result: intent.result,
      orderStableId: intent.metadata?.orderStableId ?? null,
      orderNumber: intent.referenceId,
    };
  }

  @Post('pay/online/card-token')
  async payWithCardToken(
    @Body() dto: CreateCardTokenPaymentDto,
    @Headers('cf-connecting-ip') cfConnectingIp: string | string[] | undefined,
    @Ip() rawIp: string,
  ) {
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
    const cfClientIp = normalizeClientIp(cfConnectingIp);
    let clientIp = cfClientIp ?? normalizeClientIp(rawIp);
    if (!clientIp) {
      clientIp = '127.0.0.1';
    }
    const cfConnectingIpDisplay = Array.isArray(cfConnectingIp)
      ? cfConnectingIp.join(', ')
      : (cfConnectingIp ?? 'N/A');
    this.logger.log(
      `Processing payment from IP: ${clientIp} (CF: ${cfConnectingIpDisplay}, Raw: ${rawIp ?? 'N/A'})`,
    );

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

    if (
      existingIntent &&
      ['failed', 'expired'].includes(existingIntent.status)
    ) {
      await this.checkoutIntents.resetForRetry(existingIntent.id);
    }

    const existingAttempt = extractPaymentAttempt(existingIntent?.metadata);
    const paymentAttempt =
      existingIntent && ['failed', 'expired'].includes(existingIntent.status)
        ? existingAttempt + 1
        : existingAttempt > 0
          ? existingAttempt
          : 1;
    const idempotencyKey = `${referenceId}_${paymentAttempt}`;

    const metadataWithIds = {
      ...metadata,
      customer: {
        ...metadata.customer,
        email: finalEmail,
      },
      orderStableId,
      paymentAttempt,
      lastIdempotencyKey: idempotencyKey,
    } satisfies HostedCheckoutMetadata & CheckoutIntentPaymentMeta;

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

    const expectedTotalCents = Math.round(
      metadata.totalCents ??
        metadata.subtotalCents +
          metadata.taxCents +
          (metadata.serviceFeeCents ?? 0) +
          (metadata.deliveryFeeCents ?? 0),
    );
    if (expectedTotalCents !== dto.amountCents) {
      throw new BadRequestException({
        code: 'AMOUNT_MISMATCH',
        message: `amountCents does not match metadata total (${expectedTotalCents})`,
      });
    }

    await this.checkoutIntents.updateMetadata(intent.id, metadataWithIds);

    const paymentResult = await this.clover.createCardPayment({
      amountCents: dto.amountCents,
      currency,
      source: dto.source,
      orderId: referenceId,
      idempotencyKey,
      description: `Order ${referenceId} - Online`,
    });

    if (!paymentResult.ok) {
      const meta = extractCloverErrorMeta(paymentResult.reason);
      const errorCode =
        paymentResult.code?.toLowerCase() ??
        meta?.code?.toLowerCase() ??
        meta?.declineCode?.toLowerCase() ??
        paymentResult.status?.toLowerCase() ??
        'payment_failed';

      if (errorCode === 'challenge_required') {
        const updatedMetadata = {
          ...metadataWithIds,
          lastPaymentId: paymentResult.paymentId ?? null,
        } satisfies HostedCheckoutMetadata & CheckoutIntentPaymentMeta;
        await this.checkoutIntents.updateMetadata(intent.id, updatedMetadata);

        return {
          orderStableId,
          orderNumber: referenceId,
          status: 'CHALLENGE_REQUIRED',
          challengeUrl: paymentResult.challengeUrl ?? null,
        };
      }

      await this.checkoutIntents.markFailed({
        intentId: intent.id,
        result: paymentResult.status ?? 'FAILED',
      });

      throw new BadRequestException({
        code: errorCode,
        message: meta?.message ?? 'Payment failed',
        reason: paymentResult.reason,
        declineCode: meta?.declineCode,
      });
    }

    await this.checkoutIntents.updateMetadata(intent.id, {
      ...metadataWithIds,
      lastPaymentId: paymentResult.paymentId,
    });

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

function normalizeClientIp(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    const firstValid = value.find(
      (entry): entry is string =>
        typeof entry === 'string' && entry.trim().length > 0,
    );
    return firstValid?.trim();
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return undefined;
}

function isValidCanadianPostalCode(value: string): boolean {
  return /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/.test(value.trim().toUpperCase());
}

type CloverErrorMeta = {
  code?: string;
  declineCode?: string;
  message?: string;
};

type CheckoutIntentPaymentMeta = {
  paymentAttempt?: number;
  lastIdempotencyKey?: string | null;
  lastPaymentId?: string | null;
};

function extractPaymentMeta(
  metadata?: HostedCheckoutMetadata | null,
): CheckoutIntentPaymentMeta {
  if (!metadata) return {};
  const meta = metadata as HostedCheckoutMetadata & CheckoutIntentPaymentMeta;
  return {
    paymentAttempt:
      typeof meta.paymentAttempt === 'number' && meta.paymentAttempt > 0
        ? meta.paymentAttempt
        : undefined,
    lastIdempotencyKey:
      typeof meta.lastIdempotencyKey === 'string'
        ? meta.lastIdempotencyKey
        : undefined,
    lastPaymentId:
      typeof meta.lastPaymentId === 'string' ? meta.lastPaymentId : undefined,
  };
}

function extractPaymentAttempt(
  metadata?: HostedCheckoutMetadata | null,
): number {
  return extractPaymentMeta(metadata).paymentAttempt ?? 0;
}

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
