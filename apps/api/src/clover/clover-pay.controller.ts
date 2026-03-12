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
  UnauthorizedException,
} from '@nestjs/common';
import { AppLogger } from '../common/app-logger';
import { CloverService, type CloverChargeStatusResult } from './clover.service';
import {
  CLOVER_PAYMENT_CURRENCY,
  CreateCardTokenPaymentDto,
} from './dto/create-card-token-payment.dto';
import { CheckoutIntentsService } from './checkout-intents.service';
import {
  parseCheckoutMetadata,
  type CheckoutMetadata,
  buildOrderDtoFromMetadata,
} from './checkout-metadata';
import { OrdersService } from '../orders/orders.service';
import { generateStableId } from '../common/utils/stable-id';
import { buildClientRequestId } from '../common/utils/client-request-id';
import { CreateOnlinePricingQuoteDto } from './dto/create-online-pricing-quote.dto';
import { CreatePaymentSessionDto } from './dto/create-payment-session.dto';
import { PricingTokenService } from './pricing-token.service';
import { EmailService } from '../email/email.service';
import { MessagingTemplateType } from '@prisma/client';
import {
  type ChargeAmountReconcileResult,
  reconcileChargeAmount,
} from './reconcile-charge';

@Controller('clover')
export class CloverPayController implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new AppLogger(CloverPayController.name);
  private reconcileTimer: NodeJS.Timeout | null = null;
  private static readonly PROCESSING_RECONCILE_SAFETY_WINDOW_MS = 30_000;

  constructor(
    private readonly clover: CloverService,
    private readonly checkoutIntents: CheckoutIntentsService,
    private readonly orders: OrdersService,
    private readonly pricingTokens: PricingTokenService,
    private readonly emailService: EmailService,
  ) {}

  @Post('pay/online/session')
  async createPaymentSession(@Body() dto: CreatePaymentSessionDto) {
    let metadata: CheckoutMetadata;
    try {
      metadata = parseCheckoutMetadata(dto.metadata);
    } catch (error) {
      throw new BadRequestException({
        code: 'INVALID_CHECKOUT_METADATA',
        message:
          error instanceof Error
            ? error.message
            : 'invalid checkout metadata payload',
      });
    }

    const checkoutIntentId =
      typeof dto.checkoutIntentId === 'string' &&
      dto.checkoutIntentId.trim().length > 0
        ? dto.checkoutIntentId.trim()
        : buildClientRequestId();

    const orderStableId = metadata.orderStableId ?? generateStableId();
    const orderDto = buildOrderDtoFromMetadata(metadata, orderStableId);
    orderDto.clientRequestId = checkoutIntentId;
    const quote = await this.orders.quoteOrderPricing(orderDto);
    const fingerprint = buildPricingFingerprint(orderDto);
    const token = this.pricingTokens.issue({
      totalCents: quote.totalCents,
      fingerprint,
      checkoutIntentId,
    });

    const sessionId = generateStableId();
    const metadataWithSession = {
      ...metadata,
      orderStableId,
      paymentMethod: dto.paymentMethod,
      paymentSessionId: sessionId,
      paymentSessionCreatedAt: new Date().toISOString(),
    } as CheckoutMetadata & Record<string, unknown>;

    await this.checkoutIntents.recordIntent({
      referenceId: checkoutIntentId,
      checkoutSessionId: sessionId,
      amountCents: quote.totalCents,
      currency: CLOVER_PAYMENT_CURRENCY,
      locale: metadata.locale,
      metadata: metadataWithSession as CheckoutMetadata,
    });

    this.logger.debug(
      `[session.create] ok sessionId=${sessionId} method=${dto.paymentMethod} intent=${checkoutIntentId} total=${quote.totalCents}`,
    );

    return {
      sessionId,
      paymentMethod: dto.paymentMethod,
      checkoutIntentId,
      orderStableId,
      currency: CLOVER_PAYMENT_CURRENCY,
      quote,
      pricingToken: token.pricingToken,
      pricingTokenExpiresAt: token.expiresAt,
    };
  }

  @Get('pay/online/session')
  async getPaymentSession(
    @Query('sessionId') sessionId?: string,
    @Query('paymentMethod') paymentMethod?: 'APPLE_PAY' | 'GOOGLE_PAY' | 'CARD',
  ) {
    const id = sessionId?.trim();
    if (!id) {
      throw new BadRequestException({
        code: 'PAYMENT_SESSION_REQUIRED',
        message: 'sessionId is required',
      });
    }

    const intent = await this.checkoutIntents.findByIdentifiers({
      checkoutSessionId: id,
    });

    if (!intent) {
      throw new NotFoundException({
        code: 'PAYMENT_SESSION_NOT_FOUND',
        message: 'payment session not found',
      });
    }

    if (intent.status === 'expired') {
      throw new UnauthorizedException({
        code: 'PAYMENT_SESSION_EXPIRED',
        message: 'payment session expired, please requote from checkout',
      });
    }

    const metadata = intent.metadata as CheckoutMetadata &
      Record<string, unknown>;

    if (
      paymentMethod &&
      typeof metadata.paymentMethod === 'string' &&
      metadata.paymentMethod !== paymentMethod
    ) {
      throw new BadRequestException({
        code: 'PAYMENT_METHOD_MISMATCH',
        message: 'payment method does not match the session',
      });
    }

    const orderStableId = metadata.orderStableId ?? generateStableId();
    const orderDto = buildOrderDtoFromMetadata(metadata, orderStableId);
    orderDto.clientRequestId = intent.referenceId;

    const quote = await this.orders.quoteOrderPricing(orderDto);
    const fingerprint = buildPricingFingerprint(orderDto);
    const token = this.pricingTokens.issue({
      totalCents: quote.totalCents,
      fingerprint,
      checkoutIntentId: intent.referenceId,
    });

    const resolvedMethod =
      typeof paymentMethod === 'string'
        ? paymentMethod
        : typeof metadata.paymentMethod === 'string'
          ? metadata.paymentMethod
          : 'unknown';

    this.logger.debug(
      `[session.fetch] ok sessionId=${id} method=${resolvedMethod} intent=${intent.referenceId} total=${quote.totalCents}`,
    );

    return {
      sessionId: id,
      paymentMethod:
        typeof metadata.paymentMethod === 'string'
          ? metadata.paymentMethod
          : (paymentMethod ?? null),
      checkoutIntentId: intent.referenceId,
      orderStableId,
      currency: intent.currency ?? CLOVER_PAYMENT_CURRENCY,
      quote,
      pricingToken: token.pricingToken,
      pricingTokenExpiresAt: token.expiresAt,
      metadata,
    };
  }

  @Post('pay/online/quote')
  async createOnlinePricingQuote(@Body() dto: CreateOnlinePricingQuoteDto) {
    let metadata: CheckoutMetadata;
    try {
      metadata = parseCheckoutMetadata(dto.metadata);
    } catch (error) {
      throw new BadRequestException({
        code: 'INVALID_CHECKOUT_METADATA',
        message:
          error instanceof Error
            ? error.message
            : 'invalid checkout metadata payload',
      });
    }

    const checkoutIntentId =
      typeof dto.checkoutIntentId === 'string' &&
      dto.checkoutIntentId.trim().length > 0
        ? dto.checkoutIntentId.trim()
        : buildClientRequestId();

    const orderStableId = metadata.orderStableId ?? generateStableId();
    const orderDto = buildOrderDtoFromMetadata(metadata, orderStableId);
    orderDto.clientRequestId = checkoutIntentId;
    const quote = await this.orders.quoteOrderPricing(orderDto);
    const fingerprint = buildPricingFingerprint(orderDto);
    const token = this.pricingTokens.issue({
      totalCents: quote.totalCents,
      fingerprint,
      checkoutIntentId,
    });

    return {
      orderStableId,
      currency: CLOVER_PAYMENT_CURRENCY,
      quote,
      pricingToken: token.pricingToken,
      pricingTokenExpiresAt: token.expiresAt,
      checkoutIntentId,
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
    currency: string;
    metadata: CheckoutMetadata;
    amountCents: number;
    referenceId: string;
  }) {
    if (
      ['processing', 'creating_order'].includes(intent.status) &&
      !intent.orderId
    ) {
      const paymentMeta = extractPaymentMeta(intent.metadata);
      const processingStartedAtMs =
        typeof paymentMeta.paymentStartedAt === 'string'
          ? Date.parse(paymentMeta.paymentStartedAt)
          : Number.NaN;
      const processingWithinSafetyWindow =
        intent.status === 'processing' &&
        Number.isFinite(processingStartedAtMs) &&
        Date.now() - processingStartedAtMs <
          CloverPayController.PROCESSING_RECONCILE_SAFETY_WINDOW_MS;
      if (processingWithinSafetyWindow || paymentMeta.inFlight) {
        this.logger.debug(
          `[payment.clover.reconcile.skip] intent=${intent.referenceId} reason=${paymentMeta.inFlight ? 'in_flight' : 'safety_window'}`,
        );
        return {
          status: intent.status,
          result: intent.result,
          orderStableId: intent.metadata?.orderStableId ?? null,
          orderNumber: intent.referenceId,
        };
      }

      const chargeStatus = await this.clover.getChargeStatus({
        paymentId: paymentMeta.cloverPaymentId ?? undefined,
        externalPaymentId: paymentMeta.externalPaymentId ?? intent.referenceId,
      });

      if (chargeStatus.ok) {
        const paymentMethod =
          typeof (intent.metadata as Record<string, unknown>).paymentMethod ===
          'string'
            ? String(
                (intent.metadata as Record<string, unknown>).paymentMethod,
              ).toUpperCase()
            : undefined;
        const requireCapturedForWallet =
          paymentMethod === 'APPLE_PAY' || paymentMethod === 'GOOGLE_PAY';
        if (
          paymentMeta.cloverPaymentId &&
          chargeStatus.paymentId &&
          chargeStatus.paymentId !== paymentMeta.cloverPaymentId
        ) {
          this.logger.warn(
            `[payment.clover.status.mismatch] stage=reconcileIntent intent=${intent.referenceId} expectedPaymentId=${paymentMeta.cloverPaymentId} actualPaymentId=${chargeStatus.paymentId}`,
          );
          return {
            status: intent.status,
            result: intent.result,
            orderStableId: intent.metadata?.orderStableId ?? null,
            orderNumber: intent.referenceId,
          };
        }
        if (
          paymentMeta.externalPaymentId &&
          chargeStatus.externalPaymentId &&
          chargeStatus.externalPaymentId !== paymentMeta.externalPaymentId
        ) {
          this.logger.warn(
            `[payment.clover.status.mismatch] stage=reconcileIntent intent=${intent.referenceId} expectedExternalPaymentId=${paymentMeta.externalPaymentId} actualExternalPaymentId=${chargeStatus.externalPaymentId}`,
          );
          return {
            status: intent.status,
            result: intent.result,
            orderStableId: intent.metadata?.orderStableId ?? null,
            orderNumber: intent.referenceId,
          };
        }
        if (
          chargeStatus.currency &&
          intent.currency &&
          chargeStatus.currency.toUpperCase() !== intent.currency.toUpperCase()
        ) {
          await this.checkoutIntents.markFailed({
            intentId: intent.id,
            result: 'CURRENCY_MISMATCH',
          });
          return {
            status: 'failed',
            result: 'CURRENCY_MISMATCH',
            orderStableId: intent.metadata?.orderStableId ?? null,
            orderNumber: intent.referenceId,
          };
        }
        if (
          typeof chargeStatus.baseAmountCents === 'number' &&
          chargeStatus.baseAmountCents !== intent.amountCents
        ) {
          await this.checkoutIntents.markFailed({
            intentId: intent.id,
            result: 'AMOUNT_MISMATCH',
          });
          return {
            status: 'failed',
            result: 'AMOUNT_MISMATCH',
            orderStableId: intent.metadata?.orderStableId ?? null,
            orderNumber: intent.referenceId,
          };
        }
        const normalizedStatus = normalizeChargeStatus(chargeStatus.status);
        const isSuccess = isChargeSucceeded({
          status: normalizedStatus,
          captured: chargeStatus.captured,
          requireCaptured: requireCapturedForWallet,
        });
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

          const chargeReconcile =
            typeof chargeStatus.chargedTotalCents === 'number' &&
            chargeStatus.chargedTotalCents > 0
              ? reconcileChargeAmount({
                  intentAmountCents: intent.amountCents,
                  chargedAmountCents: chargeStatus.chargedTotalCents,
                  allowRateFallbackWhenEqual: false,
                })
              : null;

          this.logger.log(
            `[payment.clover.success] stage=reconcileIntent intent=${intent.referenceId} response=${stableStringify(
              chargeStatus,
            )}`,
          );

          if (chargeReconcile?.mismatchBeyondTolerance) {
            await this.sendChargeMismatchAlert({
              stage: 'reconcileIntent',
              checkoutIntentId: intent.referenceId,
              intentId: intent.id,
              intentAmountCents: intent.amountCents,
              chargedAmountCents: chargeStatus.chargedTotalCents,
              chargeStatus,
              cloverPaymentId: chargeStatus.paymentId ?? null,
              detail: chargeReconcile,
            });
          }

          const surchargeForSummary = chargeReconcile?.surchargeCents ?? 0;
          if (surchargeForSummary > 0) {
            await this.checkoutIntents.updateMetadata(intent.id, {
              ...intent.metadata,
              creditCardSurchargeCents: surchargeForSummary,
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
        this.logger.warn(
          `[payment.clover.status.unhandled] stage=reconcileIntent intent=${intent.referenceId} status=${normalizedStatus ?? 'unknown'} captured=${String(chargeStatus.captured ?? 'unknown')} paymentId=${chargeStatus.paymentId ?? 'N/A'}`,
        );
      }

      if (!chargeStatus.ok) {
        const failedStatus = chargeStatus;
        this.logger.warn(
          `[payment.clover.status.failed] stage=reconcileIntent intent=${intent.referenceId} reason=${failedStatus.reason} code=${failedStatus.code ?? 'unknown'}`,
        );
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
    this.logger.debug(
      `[payment.request] card-token received amount=${dto.amountCents ?? 'N/A'} checkoutIntentId=${dto.checkoutIntentId ?? 'N/A'}`,
    );

    if (!dto.metadata) {
      throw new BadRequestException({
        code: 'CHECKOUT_METADATA_REQUIRED',
        message: 'metadata is required to create a card payment',
      });
    }

    let metadata: CheckoutMetadata;
    try {
      metadata = parseCheckoutMetadata(dto.metadata);
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

    const existingIntent = await this.checkoutIntents.findByIdentifiers({
      referenceId,
    });

    try {
      this.pricingTokens.verify(dto.pricingToken, {
        expectedFingerprint: fingerprint,
        expectedTotalCents,
        expectedCheckoutIntentId: referenceId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : String(error);
      if (message.includes('pricingtoken is expired')) {
        if (existingIntent && existingIntent.orderId === null) {
          await this.checkoutIntents.markExpired(existingIntent.id);
        }
        throw new UnauthorizedException({
          code: 'PAYMENT_SESSION_EXPIRED',
          message: 'payment session expired, please requote from checkout',
        });
      }
      throw error;
    }

    if (
      typeof dto.amountCents === 'number' &&
      Number.isFinite(dto.amountCents) &&
      Math.round(dto.amountCents) !== expectedTotalCents
    ) {
      throw new BadRequestException({
        code: 'AMOUNT_MISMATCH',
        message: 'amountCents does not match pricing quote',
      });
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
    const externalPaymentId = `${referenceId}_${paymentAttempt}`;

    const metadataWithIds = {
      ...metadata,
      customer: {
        ...metadata.customer,
        email: finalEmail,
      },
      orderStableId,
      paymentAttempt,
      lastIdempotencyKey: idempotencyKey,
      externalPaymentId,
      inFlight: true,
      paymentStartedAt: new Date().toISOString(),
      serverQuotedTotalCents: expectedTotalCents,
      pricingFingerprint: fingerprint,
    } satisfies CheckoutMetadata & CheckoutIntentPaymentMeta;

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
        externalPaymentId,
        idempotencyKey,
        description: `Order ${referenceId} - Online`,
      });
    } catch (err: unknown) {
      await this.checkoutIntents.markFailed({
        intentId: intent.id,
        result: 'UPSTREAM_ERROR',
      });
      await this.checkoutIntents.updateMetadata(intent.id, {
        ...metadataWithIds,
        inFlight: false,
      });
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
          cloverPaymentId: paymentResult.paymentId ?? null,
          inFlight: false,
        } satisfies CheckoutMetadata & CheckoutIntentPaymentMeta;
        await this.checkoutIntents.updateMetadata(intent.id, updatedMetadata);

        this.logger.debug(
          `[payment.3ds] challenge_required intent=${referenceId}`,
        );
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
      await this.checkoutIntents.updateMetadata(intent.id, {
        ...metadataWithIds,
        lastPaymentId: paymentResult.paymentId ?? null,
        cloverPaymentId: paymentResult.paymentId ?? null,
        inFlight: false,
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

    let chargeStatus: CloverChargeStatusResult =
      await this.clover.getChargeStatus({
        paymentId: paymentResult.paymentId,
        externalPaymentId,
      });
    let chargeStatusAttempts = 1;
    while (!chargeStatus.ok && chargeStatusAttempts < 3) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      chargeStatus = await this.clover.getChargeStatus({
        paymentId: paymentResult.paymentId,
        externalPaymentId,
      });
      chargeStatusAttempts += 1;
    }

    if (!chargeStatus.ok) {
      await this.checkoutIntents.markFailed({
        intentId: intent.id,
        result: 'CHARGE_STATUS_UNVERIFIED',
      });
      await this.checkoutIntents.updateMetadata(intent.id, {
        ...metadataWithIds,
        lastPaymentId: paymentResult.paymentId ?? null,
        cloverPaymentId: paymentResult.paymentId ?? null,
        inFlight: false,
        chargeStatusUnverified: true,
        chargeStatusUnverifiedReason: chargeStatus.reason,
      });
      throw new BadRequestException({
        code: 'CHARGE_STATUS_UNVERIFIED',
        message: 'payment status verification failed',
        details: {
          attempts: chargeStatusAttempts,
          reason: chargeStatus.reason,
          paymentId: paymentResult.paymentId ?? null,
          externalPaymentId,
        },
      });
    }

    const paymentMethod =
      typeof (metadataWithIds as Record<string, unknown>).paymentMethod ===
      'string'
        ? String((metadataWithIds as Record<string, unknown>).paymentMethod)
            .trim()
            .toUpperCase()
        : undefined;
    const requireCapturedForWallet =
      paymentMethod === 'APPLE_PAY' || paymentMethod === 'GOOGLE_PAY';

    if (
      paymentResult.paymentId &&
      chargeStatus.paymentId &&
      chargeStatus.paymentId !== paymentResult.paymentId
    ) {
      await this.checkoutIntents.markFailed({
        intentId: intent.id,
        result: 'PAYMENT_ID_MISMATCH',
      });
      throw new ConflictException({
        code: 'PAYMENT_ID_MISMATCH',
        message: 'payment id mismatch during verification',
      });
    }

    if (
      chargeStatus.externalPaymentId &&
      chargeStatus.externalPaymentId !== externalPaymentId
    ) {
      await this.checkoutIntents.markFailed({
        intentId: intent.id,
        result: 'EXTERNAL_PAYMENT_ID_MISMATCH',
      });
      throw new ConflictException({
        code: 'EXTERNAL_PAYMENT_ID_MISMATCH',
        message: 'external payment id mismatch during verification',
      });
    }

    if (
      chargeStatus.currency &&
      chargeStatus.currency.toUpperCase() !== currency.toUpperCase()
    ) {
      await this.checkoutIntents.markFailed({
        intentId: intent.id,
        result: 'CURRENCY_MISMATCH',
      });
      throw new ConflictException({
        code: 'CURRENCY_MISMATCH',
        message: 'payment currency mismatch during verification',
      });
    }

    if (
      typeof chargeStatus.baseAmountCents === 'number' &&
      chargeStatus.baseAmountCents !== expectedTotalCents
    ) {
      await this.checkoutIntents.markFailed({
        intentId: intent.id,
        result: 'AMOUNT_MISMATCH',
      });
      throw new ConflictException({
        code: 'AMOUNT_MISMATCH',
        message: 'payment amount mismatch during verification',
      });
    }

    const normalizedChargeStatus = normalizeChargeStatus(chargeStatus.status);
    const chargeSucceeded = isChargeSucceeded({
      status: normalizedChargeStatus,
      captured: chargeStatus.captured,
      requireCaptured: requireCapturedForWallet,
    });
    if (!chargeSucceeded) {
      await this.checkoutIntents.markFailed({
        intentId: intent.id,
        result: chargeStatus.status ?? 'FAILED',
      });
      throw new BadRequestException({
        code: 'payment_not_settled',
        message: 'payment status is not in a final successful state',
      });
    }

    const chargeReconcile =
      typeof chargeStatus.chargedTotalCents === 'number' &&
      chargeStatus.chargedTotalCents > 0
        ? reconcileChargeAmount({
            intentAmountCents: expectedTotalCents,
            chargedAmountCents: chargeStatus.chargedTotalCents,
            allowRateFallbackWhenEqual: false,
          })
        : null;

    this.logger.log(
      `[payment.clover.success] stage=payWithCardToken intent=${referenceId} response=${stableStringify(
        chargeStatus,
      )}`,
    );

    if (chargeReconcile?.mismatchBeyondTolerance) {
      const chargedAmountCents = chargeStatus.chargedTotalCents;
      await this.sendChargeMismatchAlert({
        stage: 'payWithCardToken',
        checkoutIntentId: referenceId,
        intentId: intent.id,
        intentAmountCents: expectedTotalCents,
        chargedAmountCents,
        chargeStatus,
        cloverPaymentId: paymentResult.paymentId ?? null,
        detail: chargeReconcile,
      });
    }

    const surchargeCentsValue = chargeReconcile?.surchargeCents ?? 0;
    const surchargeMeta =
      surchargeCentsValue > 0
        ? {
            creditCardSurchargeCents: surchargeCentsValue,
          }
        : {};

    await this.checkoutIntents.updateMetadata(intent.id, {
      ...metadataWithIds,
      lastPaymentId: paymentResult.paymentId,
      cloverPaymentId: paymentResult.paymentId,
      chargeStatusUnverified: false,
      chargeStatusUnverifiedReason: null,
      inFlight: false,
      ...surchargeMeta,
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

    this.logger.debug(
      `[payment.complete] intent=${referenceId} order=${orderStableId} status=${paymentResult.status ?? 'SUCCESS'}`,
    );

    return {
      orderStableId,
      orderNumber: referenceId,
      paymentId: paymentResult.paymentId,
      status: paymentResult.status ?? 'SUCCESS',
    };
  }
  private async sendChargeMismatchAlert(params: {
    stage: 'reconcileIntent' | 'payWithCardToken';
    checkoutIntentId: string;
    intentId: string;
    intentAmountCents: number;
    chargedAmountCents?: number;
    cloverPaymentId?: string | null;
    chargeStatus: unknown;
    detail: ChargeAmountReconcileResult;
  }): Promise<void> {
    const payload = {
      ...params,
      timestamp: new Date().toISOString(),
    };
    const text = [
      'Clover 扣款金额与订单金额不一致（超过±1分容差），但订单已继续创建。',
      JSON.stringify(payload, null, 2),
    ].join('\n\n');

    try {
      await this.emailService.sendEmail({
        to: 'admin@sanq.ca',
        subject: `[支付告警] Clover 金额不一致 intent=${params.checkoutIntentId}`,
        text,
        templateType: MessagingTemplateType.SIGNUP_WELCOME,
        metadata: payload,
        skipSuppression: true,
      });
    } catch (error) {
      this.logger.error(
        `[payment.alert] send mismatch email failed intent=${params.checkoutIntentId} reason=${error instanceof Error ? error.message : String(error)}`,
      );
    }
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

function normalizeChargeStatus(status: string | undefined): string | undefined {
  return typeof status === 'string' ? status.trim().toLowerCase() : undefined;
}

function isChargeSucceeded(params: {
  status?: string;
  captured?: boolean;
  requireCaptured?: boolean;
}): boolean {
  if (params.requireCaptured && params.captured !== true) {
    return false;
  }
  if (params.captured === true) return true;
  if (!params.status) return false;

  return ['succeeded', 'success', 'paid', 'captured', 'completed'].includes(
    params.status,
  );
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
  cloverPaymentId?: string | null;
  externalPaymentId?: string | null;
  inFlight?: boolean;
  paymentStartedAt?: string;
  serverQuotedTotalCents?: number;
  pricingFingerprint?: string;
  creditCardSurchargeCents?: number;
  creditCardSurchargeRate?: number;
  chargeStatusUnverified?: boolean;
  chargeStatusUnverifiedReason?: string | null;
};

function extractPaymentMeta(
  metadata?: CheckoutMetadata | null,
): CheckoutIntentPaymentMeta {
  if (!metadata) return {};
  const meta = metadata as CheckoutMetadata & CheckoutIntentPaymentMeta;
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
    cloverPaymentId:
      typeof meta.cloverPaymentId === 'string'
        ? meta.cloverPaymentId
        : undefined,
    externalPaymentId:
      typeof meta.externalPaymentId === 'string'
        ? meta.externalPaymentId
        : undefined,
    inFlight: typeof meta.inFlight === 'boolean' ? meta.inFlight : undefined,
    paymentStartedAt:
      typeof meta.paymentStartedAt === 'string'
        ? meta.paymentStartedAt
        : undefined,
    creditCardSurchargeCents:
      typeof meta.creditCardSurchargeCents === 'number' &&
      Number.isFinite(meta.creditCardSurchargeCents) &&
      meta.creditCardSurchargeCents > 0
        ? Math.round(meta.creditCardSurchargeCents)
        : undefined,
    creditCardSurchargeRate:
      typeof meta.creditCardSurchargeRate === 'number' &&
      Number.isFinite(meta.creditCardSurchargeRate) &&
      meta.creditCardSurchargeRate >= 0
        ? Math.round(meta.creditCardSurchargeRate * 10) / 10
        : undefined,
    chargeStatusUnverified:
      typeof meta.chargeStatusUnverified === 'boolean'
        ? meta.chargeStatusUnverified
        : undefined,
    chargeStatusUnverifiedReason:
      typeof meta.chargeStatusUnverifiedReason === 'string'
        ? meta.chargeStatusUnverifiedReason
        : undefined,
  };
}

function extractPaymentAttempt(metadata?: CheckoutMetadata | null): number {
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
