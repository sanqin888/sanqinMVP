import { Injectable } from '@nestjs/common';

import { AppLogger } from '../../../common/app-logger';
import type {
  CancelPaymentRequest,
  GetPaymentStatusRequest,
  PaymentProvider,
  PaymentTerminalAvailability,
  PaymentTerminalProvider,
  RefundPaymentRequest,
  StartPaymentRequest,
  VoidPaymentRequest,
} from '../../application/payment-provider.port';
import type { PaymentProviderOutcome } from '../../domain/payment.types';
import { CloverProviderConfig } from './clover-provider.config';
import { CloverEcommerceTransport } from './ecommerce/clover-ecommerce.transport';
import {
  toProviderOutcomeFromCreate,
  toProviderOutcomeFromStatus,
} from './ecommerce/clover-ecommerce.mapper';
import { CloverTerminalTransport } from './terminal/clover-terminal.transport';

type CloverPlatformHttpResult = {
  httpStatus: number;
  ok: boolean;
  body: Record<string, unknown> | null;
};

type CloverPlatformCanonicalPaymentRequest = {
  paymentId: string;
  attemptId: string;
  idempotencyKey: string;
  externalPaymentId?: string | null;
  providerPaymentId?: string | null;
  amountCents: number;
  currency: string;
};

const PAYMENT_EXPAND = 'additionalCharges,cardTransaction,refunds,order';
const PLATFORM_TIMEOUT_MS = 10_000;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const stringValue = (
  record: Record<string, unknown> | null,
  key: string,
): string | undefined => {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const integerValue = (
  record: Record<string, unknown> | null,
  key: string,
): number | undefined => {
  const value = record?.[key];
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : undefined;
};

const recordsFromArray = (
  values: unknown[],
): Record<string, unknown>[] | null => {
  const rows: Record<string, unknown>[] = [];
  for (const value of values) {
    const row = asRecord(value);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
};

const elementRecords = (
  record: Record<string, unknown> | null,
  key: string,
): Record<string, unknown>[] | null => {
  const value = record?.[key];
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return recordsFromArray(value);
  const wrapper = asRecord(value);
  if (!wrapper) return null;
  const elements = wrapper.elements;
  if (elements === undefined || elements === null) return [];
  if (!Array.isArray(elements)) return null;
  return recordsFromArray(elements);
};

const canonicalBase = (
  request: CloverPlatformCanonicalPaymentRequest,
): Pick<
  PaymentProviderOutcome,
  'evidence' | 'paymentId' | 'attemptId' | 'idempotencyKey'
> => ({
  evidence: 'CANONICAL',
  paymentId: request.paymentId,
  attemptId: request.attemptId,
  idempotencyKey: request.idempotencyKey,
});

const platformPaymentUnknown = (
  request: CloverPlatformCanonicalPaymentRequest,
  failureCode: string,
  failureMessage: string,
  identifiers: {
    providerPaymentId?: string | null;
    externalPaymentId?: string | null;
    amountCents?: number;
    currency?: string;
  } = {},
): PaymentProviderOutcome => ({
  ...canonicalBase(request),
  status: 'UNKNOWN',
  providerPaymentId:
    identifiers.providerPaymentId ?? request.providerPaymentId ?? undefined,
  externalPaymentId:
    identifiers.externalPaymentId ?? request.externalPaymentId ?? undefined,
  amountCents: identifiers.amountCents,
  currency: identifiers.currency,
  failureCode,
  failureMessage,
});

const normalizePlatformResult = (
  raw: string | undefined,
): PaymentProviderOutcome['status'] => {
  switch (raw?.trim().toLowerCase()) {
    case 'success':
      return 'SUCCEEDED';
    case 'fail':
      return 'DECLINED';
    case 'voided':
      return 'CANCELLED';
    case 'void_failed':
      return 'FAILED';
    case 'initiated':
    case 'pending':
    case 'auth':
    case 'auth_completed':
    case 'discount':
    case 'offline_retrying':
    case 'voiding':
      return 'PROCESSING';
    default:
      return 'UNKNOWN';
  }
};

const sumMoney = (rows: Record<string, unknown>[]): number | null => {
  let total = 0;
  for (const row of rows) {
    const amount = integerValue(row, 'amount');
    if (amount === undefined || amount < 0) return null;
    total += amount;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
};

const mapPlatformPayment = (
  paymentValue: unknown,
  request: CloverPlatformCanonicalPaymentRequest,
): PaymentProviderOutcome => {
  const payment = asRecord(paymentValue);
  if (!payment) {
    return platformPaymentUnknown(
      request,
      'CLOVER_PLATFORM_PAYMENT_INVALID',
      'Clover Platform returned an invalid payment payload',
    );
  }

  const providerPaymentId = stringValue(payment, 'id');
  const externalPaymentId = stringValue(payment, 'externalPaymentId');
  const amountCents = integerValue(payment, 'amount');
  const order = asRecord(payment.order);
  const currency = (
    stringValue(payment, 'currency') ?? stringValue(order, 'currency')
  )?.toUpperCase();
  const resultCode = stringValue(payment, 'result');
  const identity = {
    providerPaymentId,
    externalPaymentId,
    amountCents,
    currency,
  };

  if (!providerPaymentId) {
    return platformPaymentUnknown(
      request,
      'CLOVER_PLATFORM_PAYMENT_ID_MISSING',
      'Clover Platform payment is missing its payment id',
      identity,
    );
  }
  if (
    request.providerPaymentId &&
    providerPaymentId !== request.providerPaymentId
  ) {
    return platformPaymentUnknown(
      request,
      'CLOVER_PLATFORM_PAYMENT_ID_MISMATCH',
      'Clover Platform returned a different provider payment id',
      identity,
    );
  }
  if (!externalPaymentId) {
    return platformPaymentUnknown(
      request,
      'CLOVER_PLATFORM_EXTERNAL_PAYMENT_ID_MISSING',
      'Clover Platform payment is missing externalPaymentId',
      identity,
    );
  }
  if (
    request.externalPaymentId &&
    externalPaymentId !== request.externalPaymentId
  ) {
    return platformPaymentUnknown(
      request,
      'CLOVER_PLATFORM_EXTERNAL_PAYMENT_ID_MISMATCH',
      'Clover Platform returned a different externalPaymentId',
      identity,
    );
  }
  if (amountCents === undefined || amountCents !== request.amountCents) {
    return platformPaymentUnknown(
      request,
      'CLOVER_PLATFORM_PAYMENT_AMOUNT_MISMATCH',
      'Clover Platform payment amount does not match the prepared external amount',
      identity,
    );
  }
  if (!currency || currency !== request.currency.toUpperCase()) {
    return platformPaymentUnknown(
      request,
      'CLOVER_PLATFORM_PAYMENT_CURRENCY_MISMATCH',
      'Clover Platform payment currency does not match the prepared payment currency',
      identity,
    );
  }

  const additionalCharges = elementRecords(payment, 'additionalCharges');
  if (!additionalCharges) {
    return platformPaymentUnknown(
      request,
      'CLOVER_PLATFORM_ADDITIONAL_CHARGES_INVALID',
      'Clover Platform returned invalid additionalCharges',
      identity,
    );
  }
  const additionalChargeCents = sumMoney(additionalCharges);
  if (additionalChargeCents === null) {
    return platformPaymentUnknown(
      request,
      'CLOVER_PLATFORM_ADDITIONAL_CHARGE_AMOUNT_INVALID',
      'Clover Platform returned an invalid additional charge amount',
      identity,
    );
  }
  const surchargeRows = additionalCharges.filter(
    (charge) =>
      stringValue(charge, 'type')?.trim().toUpperCase() === 'CREDIT_SURCHARGE',
  );
  const surchargeCents = sumMoney(surchargeRows);
  if (surchargeCents === null) {
    return platformPaymentUnknown(
      request,
      'CLOVER_PLATFORM_SURCHARGE_AMOUNT_INVALID',
      'Clover Platform returned an invalid credit surcharge amount',
      identity,
    );
  }
  const chargedTotalCents = amountCents + additionalChargeCents;
  if (!Number.isSafeInteger(chargedTotalCents)) {
    return platformPaymentUnknown(
      request,
      'CLOVER_PLATFORM_CHARGED_TOTAL_INVALID',
      'Clover Platform charged total is outside the supported money range',
      identity,
    );
  }

  const refunds = elementRecords(payment, 'refunds');
  if (!refunds) {
    return platformPaymentUnknown(
      request,
      'CLOVER_PLATFORM_REFUNDS_INVALID',
      'Clover Platform returned invalid refund facts',
      identity,
    );
  }
  const refundedAmountCents = sumMoney(refunds);
  if (refundedAmountCents === null) {
    return platformPaymentUnknown(
      request,
      'CLOVER_PLATFORM_REFUND_AMOUNT_INVALID',
      'Clover Platform returned an invalid refund amount',
      identity,
    );
  }

  const cardTransaction = asRecord(payment.cardTransaction);
  const status = normalizePlatformResult(resultCode);
  if (status === 'UNKNOWN') {
    return {
      ...platformPaymentUnknown(
        request,
        'CLOVER_PLATFORM_PAYMENT_RESULT_UNRESOLVED',
        'Clover Platform payment result is not a recognized canonical state',
        identity,
      ),
      resultCode: resultCode ?? null,
      surchargeCents,
      chargedTotalCents,
      refundedAmountCents,
    };
  }

  return {
    ...canonicalBase(request),
    status,
    externalPaymentId,
    providerPaymentId,
    providerOrderId: stringValue(order, 'id'),
    amountCents,
    currency,
    surchargeCents,
    chargedTotalCents,
    refundedAmountCents,
    cardBrand: stringValue(cardTransaction, 'cardType'),
    cardLast4: stringValue(cardTransaction, 'last4'),
    resultCode: resultCode ?? null,
    failureCode:
      status === 'DECLINED' ? 'CLOVER_PLATFORM_PAYMENT_DECLINED' : null,
    failureMessage:
      status === 'DECLINED' ? 'Clover declined the payment' : null,
  };
};

const mapPlatformPaymentCollection = (
  body: Record<string, unknown> | null,
  request: CloverPlatformCanonicalPaymentRequest,
): PaymentProviderOutcome => {
  const elements = body?.elements;
  if (!Array.isArray(elements)) {
    return platformPaymentUnknown(
      request,
      'CLOVER_PLATFORM_PAYMENT_COLLECTION_INVALID',
      'Clover Platform returned an invalid payment collection',
    );
  }
  if (elements.length === 0) {
    return platformPaymentUnknown(
      request,
      'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
      'Clover Platform has not exposed the payment yet',
    );
  }
  if (elements.length !== 1) {
    return platformPaymentUnknown(
      request,
      'CLOVER_PLATFORM_PAYMENT_IDENTITY_CONFLICT',
      'Clover Platform returned more than one payment for externalPaymentId',
    );
  }
  return mapPlatformPayment(elements[0], request);
};

@Injectable()
export class CloverPlatformPaymentsGateway {
  private readonly logger = new AppLogger(CloverPlatformPaymentsGateway.name);

  constructor(private readonly config: CloverProviderConfig) {}

  isConfigured(): boolean {
    return Boolean(this.config.merchantId && this.config.platformAccessToken);
  }

  async getCanonicalPayment(
    request: CloverPlatformCanonicalPaymentRequest,
  ): Promise<PaymentProviderOutcome> {
    const merchantId = this.config.merchantId;
    if (!merchantId || !this.config.platformAccessToken) {
      return platformPaymentUnknown(
        request,
        'CLOVER_PLATFORM_MISCONFIGURED',
        'Clover Platform payment read requires merchant id and Platform v3 access token',
      );
    }

    const providerPaymentId = request.providerPaymentId?.trim();
    const externalPaymentId = request.externalPaymentId?.trim();
    if (!providerPaymentId && !externalPaymentId) {
      return platformPaymentUnknown(
        request,
        'CLOVER_PLATFORM_PAYMENT_IDENTIFIERS_MISSING',
        'Clover Platform reconciliation requires providerPaymentId or externalPaymentId',
      );
    }

    if (providerPaymentId) {
      const single = await this.request(
        `/v3/merchants/${encodeURIComponent(merchantId)}/payments/${encodeURIComponent(providerPaymentId)}?expand=${encodeURIComponent(PAYMENT_EXPAND)}`,
      );
      if (!single) {
        return platformPaymentUnknown(
          request,
          'CLOVER_PLATFORM_PAYMENT_QUERY_UNCERTAIN',
          'Clover Platform payment query did not receive a response',
        );
      }
      if (single.ok) {
        return mapPlatformPayment(single.body?.payment ?? single.body, request);
      }
      if (single.httpStatus !== 404 || !externalPaymentId) {
        return this.httpUnknown(request, single);
      }
    }

    if (!externalPaymentId) {
      return platformPaymentUnknown(
        request,
        'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
        'Clover Platform did not find the requested payment',
      );
    }

    const params = new URLSearchParams({
      filter: `externalPaymentId=${externalPaymentId}`,
      expand: PAYMENT_EXPAND,
    });
    const collection = await this.request(
      `/v3/merchants/${encodeURIComponent(merchantId)}/payments?${params.toString()}`,
    );
    if (!collection) {
      return platformPaymentUnknown(
        request,
        'CLOVER_PLATFORM_PAYMENT_COLLECTION_QUERY_UNCERTAIN',
        'Clover Platform externalPaymentId query did not receive a response',
      );
    }
    if (!collection.ok) return this.httpUnknown(request, collection);
    return mapPlatformPaymentCollection(collection.body, request);
  }

  private httpUnknown(
    request: CloverPlatformCanonicalPaymentRequest,
    result: CloverPlatformHttpResult,
  ): PaymentProviderOutcome {
    return platformPaymentUnknown(
      request,
      result.httpStatus === 404
        ? 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND'
        : `CLOVER_PLATFORM_HTTP_${result.httpStatus}`,
      result.httpStatus === 404
        ? 'Clover Platform has not exposed the payment yet'
        : `Clover Platform returned HTTP ${result.httpStatus} while reading payment truth`,
    );
  }

  private async request(
    path: string,
  ): Promise<CloverPlatformHttpResult | null> {
    const token = this.config.platformAccessToken;
    if (!token) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PLATFORM_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${this.config.platformApiBase}${path}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'SanQ-Payments/1.0',
        },
        signal: controller.signal,
      });
    } catch (error) {
      this.logger.warn(
        `[CloverPlatformPaymentsGateway] request failed path=${path} reason=${this.errorMessage(error)}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }

    const rawText = await response.text();
    let body: Record<string, unknown> | null = null;
    if (rawText.trim()) {
      try {
        const parsed: unknown = JSON.parse(rawText);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          body = parsed as Record<string, unknown>;
        }
      } catch {
        this.logger.warn(
          `[CloverPlatformPaymentsGateway] non-json response path=${path} status=${response.status}`,
        );
      }
    }

    this.logger.debug(
      `[CloverPlatformPaymentsGateway] response path=${path} status=${response.status} keys=${JSON.stringify(Object.keys(body ?? {}).sort())}`,
    );
    return { httpStatus: response.status, ok: response.ok, body };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error && error.message.trim()
      ? error.message
      : 'request_failed';
  }
}

const unsupportedSource = (source: string): PaymentProviderOutcome => ({
  status: 'FAILED',
  failureCode: 'CLOVER_UNSUPPORTED_PAYMENT_SOURCE',
  failureMessage: `Clover provider does not support payment source ${source}`,
});

@Injectable()
export class CloverPaymentProviderAdapter
  implements PaymentProvider, PaymentTerminalProvider
{
  constructor(
    private readonly ecommerce: CloverEcommerceTransport,
    private readonly terminal: CloverTerminalTransport,
    private readonly platform: CloverPlatformPaymentsGateway,
  ) {}

  async getAvailability(): Promise<PaymentTerminalAvailability> {
    if (!this.platform.isConfigured()) {
      return {
        state: 'MISCONFIGURED',
        configured: false,
        available: false,
        failureCode: 'CLOVER_PLATFORM_MISCONFIGURED',
        failureMessage:
          'Clover Platform canonical payment read requires merchant id and Platform v3 access token',
      };
    }
    return this.terminal.getAvailability();
  }

  async startPayment(
    request: StartPaymentRequest,
  ): Promise<PaymentProviderOutcome> {
    if (request.source === 'POS_TERMINAL') {
      if (!this.platform.isConfigured()) {
        return {
          status: 'FAILED',
          paymentId: request.paymentId,
          attemptId: request.attemptId,
          idempotencyKey: request.idempotencyKey,
          externalPaymentId: request.externalPaymentId,
          amountCents: request.amountCents,
          currency: request.currency,
          failureCode: 'CLOVER_PLATFORM_MISCONFIGURED',
          failureMessage:
            'Terminal sale was not sent because Platform v3 canonical payment read is not configured',
        };
      }
      const execution = await this.terminal.startPayment(request);
      if (!this.shouldCanonicalizeTerminalExecution(execution)) {
        return execution;
      }
      const canonical = await this.platform.getCanonicalPayment({
        paymentId: request.paymentId,
        attemptId: request.attemptId,
        idempotencyKey: request.idempotencyKey,
        externalPaymentId:
          execution.externalPaymentId ?? request.externalPaymentId,
        providerPaymentId: execution.providerPaymentId,
        amountCents: request.amountCents,
        currency: request.currency,
      });
      return this.mergeTerminalObservation(execution, canonical);
    }

    if (request.source !== 'WEB_ECOMMERCE') {
      return unsupportedSource(request.source);
    }

    const paymentInstrumentToken = request.paymentInstrumentToken?.trim();
    if (!paymentInstrumentToken) {
      return {
        status: 'FAILED',
        externalPaymentId: request.externalPaymentId,
        failureCode: 'CLOVER_PAYMENT_INSTRUMENT_REQUIRED',
        failureMessage: 'Clover Ecommerce requires a payment instrument token',
      };
    }

    const result = await this.ecommerce.createCardPayment({
      amountCents: request.amountCents,
      currency: request.currency,
      source: paymentInstrumentToken,
      orderId: request.paymentId,
      externalPaymentId: request.externalPaymentId ?? undefined,
      idempotencyKey: request.idempotencyKey,
      description: request.description ?? undefined,
    });

    return toProviderOutcomeFromCreate(result, request.externalPaymentId);
  }

  async getPaymentStatus(
    request: GetPaymentStatusRequest,
  ): Promise<PaymentProviderOutcome> {
    if (request.source === 'POS_TERMINAL') {
      if (request.amountCents === undefined || !request.currency) {
        return {
          status: 'UNKNOWN',
          evidence: 'CANONICAL',
          paymentId: request.paymentId,
          attemptId: request.attemptId,
          idempotencyKey: request.idempotencyKey,
          externalPaymentId: request.externalPaymentId,
          providerPaymentId: request.providerPaymentId,
          failureCode: 'CLOVER_PLATFORM_EXPECTED_PAYMENT_FACTS_MISSING',
          failureMessage:
            'Canonical Clover reconciliation requires expected amount and currency',
        };
      }
      return this.platform.getCanonicalPayment({
        paymentId: request.paymentId,
        attemptId: request.attemptId,
        idempotencyKey: request.idempotencyKey,
        externalPaymentId: request.externalPaymentId,
        providerPaymentId: request.providerPaymentId,
        amountCents: request.amountCents,
        currency: request.currency,
      });
    }
    if (request.source !== 'WEB_ECOMMERCE') {
      return unsupportedSource(request.source);
    }

    const result = await this.ecommerce.getChargeStatus({
      paymentId: request.providerPaymentId ?? undefined,
      externalPaymentId: request.externalPaymentId ?? undefined,
      idempotencyKey: request.idempotencyKey,
    });
    return toProviderOutcomeFromStatus(result);
  }

  cancelPayment(
    request: CancelPaymentRequest,
  ): Promise<PaymentProviderOutcome> {
    if (request.source === 'POS_TERMINAL') {
      return this.terminal.cancelPayment(request);
    }
    return Promise.resolve({
      status: 'FAILED',
      failureCode: 'CLOVER_CANCEL_NOT_IMPLEMENTED',
      failureMessage: 'Clover Ecommerce cancel is not implemented',
    });
  }

  voidPayment(request: VoidPaymentRequest): Promise<PaymentProviderOutcome> {
    if (request.source === 'POS_TERMINAL') {
      return this.terminal.voidPayment(request);
    }
    return Promise.resolve({
      status: 'FAILED',
      failureCode: 'CLOVER_VOID_NOT_IMPLEMENTED',
      failureMessage: 'Clover Ecommerce void is deferred to Payment Phase E',
    });
  }

  refundPayment(
    request: RefundPaymentRequest,
  ): Promise<PaymentProviderOutcome> {
    if (request.source === 'POS_TERMINAL') {
      return this.terminal.refundPayment(request);
    }
    return Promise.resolve({
      status: 'FAILED',
      failureCode: 'CLOVER_REFUND_NOT_IMPLEMENTED',
      failureMessage: 'Clover Ecommerce refund is deferred to Payment Phase E',
    });
  }

  private shouldCanonicalizeTerminalExecution(
    outcome: PaymentProviderOutcome,
  ): boolean {
    return (
      outcome.status === 'SUCCEEDED' ||
      outcome.status === 'PROCESSING' ||
      outcome.status === 'UNKNOWN' ||
      Boolean(outcome.providerPaymentId)
    );
  }

  private mergeTerminalObservation(
    execution: PaymentProviderOutcome,
    canonical: PaymentProviderOutcome,
  ): PaymentProviderOutcome {
    return {
      ...canonical,
      externalPaymentId:
        canonical.externalPaymentId ?? execution.externalPaymentId,
      providerPaymentId:
        canonical.providerPaymentId ?? execution.providerPaymentId,
      providerOrderId: canonical.providerOrderId ?? execution.providerOrderId,
      terminalId: canonical.terminalId ?? execution.terminalId,
      cardBrand: canonical.cardBrand ?? execution.cardBrand,
      cardLast4: canonical.cardLast4 ?? execution.cardLast4,
      resultCode: canonical.resultCode ?? execution.resultCode,
    };
  }
}
