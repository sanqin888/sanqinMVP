import { Injectable } from '@nestjs/common';

import { AppLogger } from '../../../../common/app-logger';
import type {
  CancelPaymentRequest,
  GetPaymentStatusRequest,
  PaymentTerminalAvailability,
  RefundPaymentRequest,
  StartPaymentRequest,
  VoidPaymentRequest,
} from '../../../application/payment-provider.port';
import type { PaymentProviderOutcome } from '../../../domain/payment.types';
import { CloverProviderConfig } from '../clover-provider.config';

type CloverTerminalHttpResult = {
  httpStatus: number;
  ok: boolean;
  body: Record<string, unknown> | null;
  rawText: string;
};

type CloverTerminalPaymentRequest = {
  amount: number;
  externalPaymentId: string;
};

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

const paymentRecord = (
  body: Record<string, unknown> | null,
): Record<string, unknown> | null => asRecord(body?.payment) ?? body;

const additionalChargeRecords = (
  payment: Record<string, unknown> | null,
): Record<string, unknown>[] => {
  const charges = payment?.additionalCharges;
  if (Array.isArray(charges)) {
    return charges
      .map(asRecord)
      .filter((value): value is Record<string, unknown> => value !== null);
  }
  const elements = asRecord(charges)?.elements;
  if (!Array.isArray(elements)) return [];
  return elements
    .map(asRecord)
    .filter((value): value is Record<string, unknown> => value !== null);
};

const errorText = (body: Record<string, unknown> | null): string =>
  [
    stringValue(body, 'message'),
    stringValue(body, 'reason'),
    stringValue(body, 'result'),
    stringValue(asRecord(body?.error), 'message'),
    stringValue(asRecord(body?.error), 'code'),
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');

const resultText = (
  body: Record<string, unknown> | null,
  payment: Record<string, unknown> | null,
): string =>
  stringValue(payment, 'result') ??
  stringValue(body, 'result') ??
  stringValue(payment, 'state') ??
  '';

const normalized = (value: string | undefined): string =>
  value?.trim().toUpperCase() ?? '';
const isCancelled = (text: string): boolean =>
  /CANCEL|VOID/.test(text.toUpperCase());
const isDeclined = (text: string): boolean =>
  /DECLIN|DO_NOT_HONOR|INSUFFICIENT|CARD_BLOCKED/.test(text.toUpperCase());

const failureOutcome = (
  result: CloverTerminalHttpResult,
  operation: 'SALE' | 'STATUS',
): PaymentProviderOutcome => {
  const message =
    errorText(result.body) || `Clover returned HTTP ${result.httpStatus}`;
  const code =
    stringValue(result.body, 'code') ??
    stringValue(asRecord(result.body?.error), 'code') ??
    `CLOVER_HTTP_${result.httpStatus}`;

  if (operation === 'STATUS') {
    return { status: 'UNKNOWN', failureCode: code, failureMessage: message };
  }
  if (result.httpStatus === 209 || isCancelled(message)) {
    return {
      status: 'CANCELLED',
      resultCode: code,
      failureCode: null,
      failureMessage: null,
    };
  }
  if (result.httpStatus === 500 || result.httpStatus === 504) {
    return { status: 'UNKNOWN', failureCode: code, failureMessage: message };
  }
  if (isDeclined(message)) {
    return {
      status: 'DECLINED',
      resultCode: code,
      failureCode: code,
      failureMessage: message,
    };
  }
  return { status: 'FAILED', failureCode: code, failureMessage: message };
};

export const mapTerminalPaymentResponse = (
  result: CloverTerminalHttpResult,
  expectedAmountCents: number,
  expectedExternalPaymentId: string,
  terminalId: string,
  operation: 'SALE' | 'STATUS' = 'SALE',
): PaymentProviderOutcome => {
  if (result.httpStatus === 209) {
    return {
      status: 'CANCELLED',
      terminalId,
      resultCode: 'CLOVER_CANCELLED',
      failureCode: null,
      failureMessage: null,
    };
  }
  if (!result.ok) return failureOutcome(result, operation);

  const payment = paymentRecord(result.body);
  const providerPaymentId = stringValue(payment, 'id');
  const externalPaymentId = stringValue(payment, 'externalPaymentId');
  const providerOrderId = stringValue(asRecord(payment?.order), 'id');
  const paymentAmount = integerValue(payment, 'amount');
  const cardTransaction = asRecord(payment?.cardTransaction);
  const cardBrand = stringValue(cardTransaction, 'cardType');
  const cardLast4 = stringValue(cardTransaction, 'last4');
  const resultCode = resultText(result.body, payment);
  const resultCodeUpper = normalized(resultCode);
  const details = `${resultCode} ${errorText(result.body)}`.trim();
  const charges = additionalChargeRecords(payment);
  const surchargeCents = charges
    .filter(
      (charge) =>
        normalized(stringValue(charge, 'type')) === 'CREDIT_SURCHARGE',
    )
    .reduce((sum, charge) => sum + (integerValue(charge, 'amount') ?? 0), 0);
  const additionalChargeCents = charges.reduce(
    (sum, charge) => sum + (integerValue(charge, 'amount') ?? 0),
    0,
  );
  const chargedTotalCents =
    paymentAmount === undefined
      ? undefined
      : paymentAmount + additionalChargeCents;
  const resolvedExternalPaymentId =
    externalPaymentId ?? (expectedExternalPaymentId || undefined);

  if (
    expectedExternalPaymentId &&
    externalPaymentId &&
    externalPaymentId !== expectedExternalPaymentId
  ) {
    return {
      status: 'UNKNOWN',
      failureCode: 'CLOVER_TERMINAL_EXTERNAL_PAYMENT_ID_MISMATCH',
      failureMessage: 'Clover returned a different externalPaymentId',
      terminalId,
    };
  }

  if (isCancelled(details)) {
    return {
      status: 'CANCELLED',
      externalPaymentId: resolvedExternalPaymentId,
      providerPaymentId,
      providerOrderId,
      terminalId,
      cardBrand,
      cardLast4,
      chargedTotalCents,
      surchargeCents,
      resultCode: resultCode || 'CANCELLED',
      failureCode: null,
      failureMessage: null,
    };
  }

  if (isDeclined(details)) {
    return {
      status: 'DECLINED',
      externalPaymentId: resolvedExternalPaymentId,
      providerPaymentId,
      providerOrderId,
      terminalId,
      cardBrand,
      cardLast4,
      chargedTotalCents,
      surchargeCents,
      resultCode: resultCode || 'DECLINED',
      failureCode:
        stringValue(result.body, 'code') ?? 'CLOVER_TERMINAL_DECLINED',
      failureMessage: errorText(result.body) || 'Clover declined the payment',
    };
  }

  if (resultCodeUpper === 'SUCCESS') {
    if (!providerPaymentId) {
      return {
        status: 'UNKNOWN',
        externalPaymentId: resolvedExternalPaymentId,
        terminalId,
        resultCode,
        failureCode: 'CLOVER_TERMINAL_PAYMENT_ID_MISSING',
        failureMessage: 'Clover reported success without a provider payment id',
      };
    }
    if (paymentAmount !== undefined && paymentAmount < expectedAmountCents) {
      return {
        status: 'UNKNOWN',
        externalPaymentId: resolvedExternalPaymentId,
        providerPaymentId,
        providerOrderId,
        terminalId,
        cardBrand,
        cardLast4,
        chargedTotalCents,
        surchargeCents,
        resultCode,
        failureCode: 'CLOVER_TERMINAL_AMOUNT_MISMATCH',
        failureMessage:
          'Clover success amount is lower than the requested sale amount',
      };
    }
    return {
      status: 'SUCCEEDED',
      externalPaymentId: resolvedExternalPaymentId,
      providerPaymentId,
      providerOrderId,
      terminalId,
      cardBrand,
      cardLast4,
      chargedTotalCents,
      surchargeCents,
      resultCode,
      failureCode: null,
      failureMessage: null,
    };
  }

  if (resultCodeUpper === 'FAIL' || resultCodeUpper === 'FAILED') {
    return {
      status: 'FAILED',
      externalPaymentId: resolvedExternalPaymentId,
      providerPaymentId,
      providerOrderId,
      terminalId,
      resultCode,
      failureCode: stringValue(result.body, 'code') ?? 'CLOVER_TERMINAL_FAILED',
      failureMessage: errorText(result.body) || 'Clover payment failed',
    };
  }

  return {
    status: 'UNKNOWN',
    externalPaymentId: resolvedExternalPaymentId,
    providerPaymentId,
    providerOrderId,
    terminalId,
    cardBrand,
    cardLast4,
    chargedTotalCents,
    surchargeCents,
    resultCode: resultCode || null,
    failureCode: 'CLOVER_TERMINAL_RESULT_UNRESOLVED',
    failureMessage:
      'Clover payment response did not establish final payment truth',
  };
};

export const mapTerminalAvailabilityResponse = (
  result: CloverTerminalHttpResult,
  terminalId: string,
): PaymentTerminalAvailability => {
  if (!result.ok) {
    const message =
      errorText(result.body) || `Clover returned HTTP ${result.httpStatus}`;
    return {
      state: result.httpStatus === 503 ? 'BUSY' : 'UNAVAILABLE',
      configured: true,
      available: false,
      terminalId,
      failureCode: `CLOVER_HTTP_${result.httpStatus}`,
      failureMessage: message,
    };
  }
  const providerState =
    stringValue(result.body, 'state') ??
    stringValue(result.body, 'status') ??
    stringValue(asRecord(result.body?.device), 'status') ??
    'AVAILABLE';
  const upper = normalized(providerState);
  const busy = /BUSY|IN_PROGRESS|PROCESSING/.test(upper);
  const unavailable = /OFFLINE|DISCONNECTED|UNAVAILABLE|ERROR/.test(upper);
  return {
    state: busy ? 'BUSY' : unavailable ? 'UNAVAILABLE' : 'AVAILABLE',
    configured: true,
    available: !busy && !unavailable,
    terminalId,
    providerState,
  };
};

const missingTerminalConfiguration = (): PaymentProviderOutcome => ({
  status: 'FAILED',
  failureCode: 'CLOVER_TERMINAL_MISCONFIGURED',
  failureMessage:
    'Clover Terminal requires an OAuth token, device id, and Remote Application ID',
});

const uncertain = (
  code: string,
  message: string,
  terminalId?: string,
): PaymentProviderOutcome => ({
  status: 'UNKNOWN',
  terminalId,
  failureCode: code,
  failureMessage: message,
});

@Injectable()
export class CloverTerminalTransport {
  private readonly logger = new AppLogger(CloverTerminalTransport.name);

  constructor(private readonly config: CloverProviderConfig) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.terminalAccessToken &&
      this.config.terminalDeviceId &&
      this.config.terminalPosId,
    );
  }

  async getAvailability(): Promise<PaymentTerminalAvailability> {
    const terminalId = this.config.terminalDeviceId;
    if (!this.isConfigured() || !terminalId) {
      return {
        state: 'MISCONFIGURED',
        configured: false,
        available: false,
        terminalId: terminalId ?? null,
        failureCode: 'CLOVER_TERMINAL_MISCONFIGURED',
        failureMessage:
          'Clover Terminal requires an OAuth token, device id, and Remote Application ID',
      };
    }
    const result = await this.request('/connect/v1/device/status', {
      method: 'GET',
    });
    if (!result) {
      return {
        state: 'UNKNOWN',
        configured: true,
        available: false,
        terminalId,
        failureCode: 'CLOVER_TERMINAL_STATUS_UNCERTAIN',
        failureMessage:
          'Clover Terminal status request did not receive a response',
      };
    }
    return mapTerminalAvailabilityResponse(result, terminalId);
  }

  async startPayment(
    request: StartPaymentRequest,
  ): Promise<PaymentProviderOutcome> {
    if (!this.isConfigured()) return missingTerminalConfiguration();
    const terminalId = this.config.terminalDeviceId;
    const externalPaymentId = request.externalPaymentId?.trim();
    if (!terminalId || !externalPaymentId) {
      return {
        status: 'FAILED',
        failureCode: 'CLOVER_TERMINAL_EXTERNAL_PAYMENT_ID_REQUIRED',
        failureMessage: 'Clover Terminal sale requires an externalPaymentId',
      };
    }
    if (externalPaymentId.length > 32) {
      return {
        status: 'FAILED',
        externalPaymentId,
        failureCode: 'CLOVER_TERMINAL_EXTERNAL_PAYMENT_ID_TOO_LONG',
        failureMessage:
          'Clover Terminal externalPaymentId must be 32 characters or fewer',
      };
    }

    const body: CloverTerminalPaymentRequest = {
      amount: request.amountCents,
      externalPaymentId,
    };
    const result = await this.request('/connect/v1/payments', {
      method: 'POST',
      idempotencyKey: request.idempotencyKey,
      body,
    });
    if (!result) {
      return uncertain(
        'CLOVER_TERMINAL_PAYMENT_REQUEST_UNCERTAIN',
        'Clover Terminal payment request did not receive a response',
        terminalId,
      );
    }
    return mapTerminalPaymentResponse(
      result,
      request.amountCents,
      externalPaymentId,
      terminalId,
    );
  }

  async getPaymentStatus(
    request: GetPaymentStatusRequest,
  ): Promise<PaymentProviderOutcome> {
    const terminalId = this.config.terminalDeviceId;
    if (!this.isConfigured() || !terminalId) {
      return uncertain(
        'CLOVER_TERMINAL_RECONCILIATION_MISCONFIGURED',
        'Clover Terminal is not configured for reconciliation',
        terminalId,
      );
    }
    const providerPaymentId = request.providerPaymentId?.trim();
    const externalPaymentId = request.externalPaymentId?.trim();
    if (!providerPaymentId && !externalPaymentId) {
      return uncertain(
        'CLOVER_TERMINAL_RECONCILIATION_IDENTIFIERS_MISSING',
        'Clover Terminal reconciliation requires providerPaymentId or externalPaymentId',
        terminalId,
      );
    }

    let result: CloverTerminalHttpResult | null = null;
    if (providerPaymentId) {
      result = await this.request(
        `/connect/v1/payments/${encodeURIComponent(providerPaymentId)}`,
        { method: 'GET' },
      );
      if (result?.httpStatus === 404 && externalPaymentId) result = null;
    }
    if (!result && externalPaymentId) {
      result = await this.request(
        `/connect/v1/payments/external/${encodeURIComponent(externalPaymentId)}`,
        { method: 'GET' },
      );
    }
    if (!result) {
      return uncertain(
        'CLOVER_TERMINAL_RECONCILIATION_QUERY_UNCERTAIN',
        'Clover Terminal reconciliation query did not receive a response',
        terminalId,
      );
    }
    return mapTerminalPaymentResponse(
      result,
      request.amountCents ?? 0,
      externalPaymentId ?? '',
      terminalId,
      'STATUS',
    );
  }

  async cancelPayment(
    request: CancelPaymentRequest,
  ): Promise<PaymentProviderOutcome> {
    const terminalId = this.config.terminalDeviceId;
    if (!this.isConfigured() || !terminalId) {
      return uncertain(
        'CLOVER_TERMINAL_CANCEL_MISCONFIGURED',
        'Clover Terminal is not configured for cancellation',
        terminalId,
      );
    }
    const result = await this.request('/connect/v1/device/cancel', {
      method: 'POST',
      idempotencyKey: `${request.idempotencyKey}:cancel`,
      body: {},
    });
    if (!result) {
      return uncertain(
        'CLOVER_TERMINAL_CANCEL_REQUEST_UNCERTAIN',
        'Clover Terminal cancel request did not receive a response',
        terminalId,
      );
    }
    if (result.httpStatus === 209) {
      return {
        status: 'CANCELLED',
        terminalId,
        resultCode: 'CLOVER_CANCELLED',
        failureCode: null,
        failureMessage: null,
      };
    }
    if (result.ok) {
      return uncertain(
        'CLOVER_TERMINAL_CANCEL_ACKNOWLEDGED',
        'Clover acknowledged the cancel request; payment truth still requires reconciliation',
        terminalId,
      );
    }
    return uncertain(
      `CLOVER_TERMINAL_CANCEL_HTTP_${result.httpStatus}`,
      'Clover did not establish final payment truth after the cancel request',
      terminalId,
    );
  }

  voidPayment(request: VoidPaymentRequest): Promise<PaymentProviderOutcome> {
    void request;
    return Promise.resolve({
      status: 'FAILED',
      failureCode: 'CLOVER_VOID_NOT_IMPLEMENTED',
      failureMessage: 'Clover Terminal void is deferred to Payment Phase E',
    });
  }

  refundPayment(
    request: RefundPaymentRequest,
  ): Promise<PaymentProviderOutcome> {
    void request;
    return Promise.resolve({
      status: 'FAILED',
      failureCode: 'CLOVER_REFUND_NOT_IMPLEMENTED',
      failureMessage: 'Clover Terminal refund is deferred to Payment Phase E',
    });
  }

  private async request(
    path: string,
    options: {
      method: 'GET' | 'POST';
      idempotencyKey?: string;
      body?: Record<string, unknown> | CloverTerminalPaymentRequest;
    },
  ): Promise<CloverTerminalHttpResult | null> {
    const token = this.config.terminalAccessToken;
    const terminalId = this.config.terminalDeviceId;
    const posId = this.config.terminalPosId;
    if (!token || !terminalId || !posId) return null;

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      (this.config.terminalTimeoutSeconds + 5) * 1000,
    );
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'SanQ-POS/1.0',
      'X-Clover-Device-Id': terminalId,
      'X-POS-Id': posId,
      'X-Clover-Timeout': String(this.config.terminalTimeoutSeconds),
    };
    if (options.method === 'POST') headers['Content-Type'] = 'application/json';
    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    let response: Response;
    try {
      response = await fetch(`${this.config.terminalApiBase}${path}`, {
        method: options.method,
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } catch (error) {
      this.logger.warn(
        `[CloverTerminalTransport] request failed path=${path} reason=${this.errorMessage(error)}`,
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
          `[CloverTerminalTransport] non-json response path=${path} status=${response.status}`,
        );
      }
    }

    this.logger.debug(
      `[CloverTerminalTransport] response path=${path} status=${response.status} keys=${JSON.stringify(Object.keys(body ?? {}).sort())}`,
    );
    return { httpStatus: response.status, ok: response.ok, body, rawText };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error && error.message.trim()
      ? error.message
      : 'request_failed';
  }
}
