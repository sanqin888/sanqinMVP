// apps/api/src/clover/clover-pay.controller.ts
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  Ip,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
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
import { CreateOnlinePricingQuoteDto } from './dto/create-online-pricing-quote.dto';
import { PricingTokenService } from './pricing-token.service';

@Controller('clover')
export class CloverPayController implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new AppLogger(CloverPayController.name);
  private reconcileTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly clover: CloverService,
    private readonly checkoutIntents: CheckoutIntentsService,
    private readonly orders: OrdersService,
    private readonly pricingTokens: PricingTokenService,
  ) {}

  @Post('pay/online/quote')
  async createOnlinePricingQuote(@Body() dto: CreateOnlinePricingQuoteDto) {
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

    const orderStableId = metadata.orderStableId ?? generateStableId();
    const orderDto = buildOrderDtoFromMetadata(metadata, orderStableId);
    const quote = await this.orders.quoteOrderPricing(orderDto);
    const fingerprint = buildPricingFingerprint(orderDto);
    const token = this.pricingTokens.issue({
      totalCents: quote.totalCents,
      fingerprint,
    });

    return {
      orderStableId,
      currency: CLOVER_PAYMENT_CURRENCY,
      quote,
      pricingToken: token.pricingToken,
      pricingTokenExpiresAt: token.expiresAt,
    };
  }

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

    return this.reconcileIntent(intent);
  }

  onModuleInit() {
    this.reconcileTimer = setInterval(() => {
      void this.reconcilePendingIntents();
    }, 5000);
  }

  onModuleDestroy() {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
  }

  private async reconcilePendingIntents(): Promise<void> {
    try {
      const intents =
        await this.checkoutIntents.listUnresolvedForReconciliation(10);
      for (const intent of intents) {
        try {
          await this.reconcileIntent(intent);
        } catch (error) {
          this.logger.warn(
            `checkout intent reconcile failed id=${intent.id} ref=${intent.referenceId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `checkout intent reconcile loop failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async reconcileIntent(intent: {
    id: string;
    status: string;
    result: string | null;
    orderId: string | null;
    metadata: HostedCheckoutMetadata;
    amountCents: number;
    referenceId: string;
  }) {
    if (
      ['processing', 'creating_order'].includes(intent.status) &&
      !intent.orderId
    ) {
      const paymentMeta = extractPaymentMeta(intent.metadata);
      const chargeStatus = await this.clover.getChargeStatus({
        paymentId: paymentMeta.lastPaymentId ?? undefined,
        idempotencyKey: paymentMeta.lastIdempotencyKey ?? undefined,
      });

      if (chargeStatus.ok) {
        const normalizedStatus = chargeStatus.status?.toLowerCase();
        const isSuccess =
          normalizedStatus === 'succeeded' || chargeStatus.captured === true;
        if (isSuccess) {
          const claimed =
            intent.status === 'creating_order'
              ? true
              : await this.checkoutIntents.claimOrderCreation(intent.id);
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

          const preFinalizeQuote =
            await this.orders.quoteOrderPricing(orderDto);
          if (preFinalizeQuote.totalCents !== intent.amountCents) {
            await this.checkoutIntents.markFailed({
              intentId: intent.id,
              result: 'AMOUNT_MISMATCH',
            });
            throw new ConflictException({
              code: 'FINALIZE_AMOUNT_MISMATCH',
              message: 'server total changed after payment authorization',
            });
          }

          if (
            typeof chargeStatus.amountCents === 'number' &&
            chargeStatus.amountCents !== intent.amountCents
          ) {
            await this.checkoutIntents.markFailed({
              intentId: intent.id,
              result: 'CHARGED_AMOUNT_MISMATCH',
            });
            throw new ConflictException({
              code: 'CHARGED_AMOUNT_MISMATCH',
              message: 'charged amount does not match checkout intent amount',
            });
          }

          const order = await this.orders.createImmediatePaid(
            {
              ...orderDto,
              checkoutIntentId: intent.referenceId,
            },
            intent.referenceId,
          );

          if (order.totalCents !== intent.amountCents) {
            await this.checkoutIntents.markFailed({
              intentId: intent.id,
              result: 'ORDER_AMOUNT_MISMATCH',
            });
            throw new ConflictException({
              code: 'ORDER_AMOUNT_MISMATCH',
              message: 'order total does not match charged amount',
            });
          }

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

    const metadataPostalCode = normalizeCanadianPostalCode(
      metadata.customer.postalCode,
    );
    const normalizedPostalCode =
      normalizeCanadianPostalCode(dto.postalCode) || metadataPostalCode;
    if (
      metadata.fulfillment === 'delivery' &&
      (!normalizedPostalCode ||
        !isValidCanadianPostalCode(normalizedPostalCode))
    ) {
      throw new BadRequestException({
        code: 'INVALID_POSTAL_CODE',
        message: 'postalCode must be a valid Canadian postal code for delivery',
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

    const orderDto = buildOrderDtoFromMetadata(metadata, orderStableId);
    orderDto.clientRequestId = referenceId;
    const quote = await this.orders.quoteOrderPricing(orderDto);
    const expectedTotalCents = quote.totalCents;
    const fingerprint = buildPricingFingerprint(orderDto);
    this.pricingTokens.verify(dto.pricingToken, {
      expectedFingerprint: fingerprint,
      expectedTotalCents,
    });

    if (
      typeof dto.amountCents === 'number' &&
      Number.isFinite(dto.amountCents) &&
      Math.round(dto.amountCents) !== expectedTotalCents
    ) {
      this.logger.warn(
        `Client sent mismatched amountCents=${dto.amountCents}, serverTotal=${expectedTotalCents}. Ignoring client amount.`,
      );
    }

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
      serverQuotedTotalCents: expectedTotalCents,
      pricingFingerprint: fingerprint,
    } satisfies HostedCheckoutMetadata & CheckoutIntentPaymentMeta;

    const intent =
      existingIntent ??
      (await this.checkoutIntents.recordIntent({
        referenceId,
        checkoutSessionId: null,
        amountCents: expectedTotalCents,
        currency,
        locale: metadata.locale,
        metadata: metadataWithIds,
      }));

    const claimed = await this.checkoutIntents.claimProcessing(intent.id);
    if (!claimed) {
      throw new ConflictException({
        code: 'CHECKOUT_IN_PROGRESS',
        message: 'checkout intent is already being processed',
        checkoutIntentId: intent.referenceId,
      });
    }

    await this.checkoutIntents.updateMetadata(intent.id, metadataWithIds);

    let paymentResult: Awaited<ReturnType<CloverService['createCardPayment']>>;
    try {
      paymentResult = await this.clover.createCardPayment({
        amountCents: expectedTotalCents,
        currency,
        source: dto.source,
        orderId: referenceId,
        idempotencyKey,
        description: `Order ${referenceId} - Online`,
      });
    } catch (err: unknown) {
      const response =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { status?: unknown; data?: unknown } })
              .response
          : undefined;
      const status =
        typeof response?.status === 'number' ? response.status : null;
      const data = isPlainObject(response?.data) ? response.data : null;
      const message =
        typeof err === 'object' && err !== null && 'message' in err
          ? typeof (err as { message?: unknown }).message === 'string'
            ? (err as { message: string }).message
            : ''
          : '';
      const stack =
        err instanceof Error
          ? err.stack
          : typeof err === 'object' && err !== null && 'stack' in err
            ? typeof (err as { stack?: unknown }).stack === 'string'
              ? (err as { stack: string }).stack
              : undefined
            : undefined;

      this.logger.error(
        `Clover upstream error: status=${status} message=${message} data=${JSON.stringify(data)}`,
        stack,
      );

      throw new BadRequestException({
        code: 'payment_failed',
        message: 'Payment failed',
        details: {
          code: typeof data?.code === 'string' ? data.code : 'payment_failed',
          reason:
            (typeof data?.message === 'string' ? data.message : undefined) ??
            (typeof data?.error === 'string' ? data.error : undefined) ??
            message,
          upstreamStatus: status,
          upstream: data,
        },
      });
    }

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
        details: {
          code: errorCode,
          reason: paymentResult.reason ?? '',
          declineCode: meta?.declineCode ?? null,
        },
      });
    }

    await this.checkoutIntents.updateMetadata(intent.id, {
      ...metadataWithIds,
      lastPaymentId: paymentResult.paymentId,
    });

    const orderForCreation = buildOrderDtoFromMetadata(
      metadataWithIds,
      orderStableId,
    );
    orderForCreation.clientRequestId = referenceId;
    orderForCreation.checkoutIntentId = intent.referenceId;
    const order = await this.orders.createImmediatePaid(
      orderForCreation,
      referenceId,
    );

    if (order.totalCents !== expectedTotalCents) {
      await this.checkoutIntents.markFailed({
        intentId: intent.id,
        result: 'ORDER_AMOUNT_MISMATCH',
      });
      throw new ConflictException({
        code: 'ORDER_AMOUNT_MISMATCH',
        message: 'order total does not match charged amount',
      });
    }

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

function buildPricingFingerprint(
  orderDto: ReturnType<typeof buildOrderDtoFromMetadata>,
): string {
  return stableStringify({
    userStableId: orderDto.userStableId ?? null,
    fulfillmentType: orderDto.fulfillmentType,
    deliveryType: orderDto.deliveryType ?? null,
    couponStableId: orderDto.couponStableId ?? null,
    selectedUserCouponId: orderDto.selectedUserCouponId ?? null,
    pointsToRedeem: orderDto.pointsToRedeem ?? null,
    redeemValueCents: orderDto.redeemValueCents ?? null,
    items: (orderDto.items ?? []).map((item) => ({
      productStableId: item.productStableId,
      qty: item.qty,
      options: item.options ?? null,
    })),
    deliveryDestination: orderDto.deliveryDestination
      ? {
          addressStableId: orderDto.deliveryDestination.addressStableId ?? null,
          addressLine1: orderDto.deliveryDestination.addressLine1,
          addressLine2: orderDto.deliveryDestination.addressLine2 ?? null,
          city: orderDto.deliveryDestination.city,
          province: orderDto.deliveryDestination.province,
          postalCode: orderDto.deliveryDestination.postalCode,
          placeId: orderDto.deliveryDestination.placeId ?? null,
          latitude: orderDto.deliveryDestination.latitude ?? null,
          longitude: orderDto.deliveryDestination.longitude ?? null,
        }
      : null,
  });
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`,
      );
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
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
  serverQuotedTotalCents?: number;
  pricingFingerprint?: string;
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
