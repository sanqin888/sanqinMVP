import { Injectable } from '@nestjs/common';

import { AppLogger } from '../../../../common/app-logger';
import type { PaymentProviderOutcome } from '../../../domain/payment.types';
import { CloverProviderConfig } from '../clover-provider.config';
import { CloverMerchantAccessTokenService } from '../oauth/clover-merchant-access-token.service';

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

type CloverPlatformCanonicalReversalRequest =
  CloverPlatformCanonicalPaymentRequest & {
    operation: 'REFUND' | 'VOID';
    providerRefundId?: string | null;
    expectedAdditionalChargeRefundCents: number;
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
    providerRefundId?: string | null;
    externalPaymentId?: string | null;
    amountCents?: number;
    currency?: string;
  } = {},
): PaymentProviderOutcome => ({
  ...canonicalBase(request),
  status: 'UNKNOWN',
  providerPaymentId:
    identifiers.providerPaymentId ?? request.providerPaymentId ?? undefined,
  providerRefundId: identifiers.providerRefundId ?? undefined,
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

const reversalUnknown = (
  request: CloverPlatformCanonicalReversalRequest,
  failureCode: string,
  failureMessage: string,
  providerRefundId?: string | null,
): PaymentProviderOutcome =>
  platformPaymentUnknown(request, failureCode, failureMessage, {
    providerPaymentId: request.providerPaymentId,
    providerRefundId,
    amountCents: request.amountCents,
    currency: request.currency,
  });

const mapPlatformRefund = (
  refundValue: unknown,
  request: CloverPlatformCanonicalReversalRequest,
  resultCode = 'CLOVER_REFUND_CONFIRMED',
): PaymentProviderOutcome => {
  const refund = asRecord(refundValue);
  if (!refund) {
    return reversalUnknown(
      request,
      'CLOVER_PLATFORM_REFUND_INVALID',
      'Clover Platform returned an invalid refund payload',
    );
  }

  const providerRefundId = stringValue(refund, 'id');
  const amountCents = integerValue(refund, 'amount');
  const payment = asRecord(refund.payment);
  const providerPaymentId = stringValue(payment, 'id');
  if (!providerRefundId) {
    return reversalUnknown(
      request,
      'CLOVER_PLATFORM_REFUND_ID_MISSING',
      'Clover Platform refund is missing its refund id',
    );
  }
  if (
    request.providerRefundId &&
    providerRefundId !== request.providerRefundId
  ) {
    return reversalUnknown(
      request,
      'CLOVER_PLATFORM_REFUND_ID_MISMATCH',
      'Clover Platform returned a different refund id',
      providerRefundId,
    );
  }
  if (!providerPaymentId || providerPaymentId !== request.providerPaymentId) {
    return reversalUnknown(
      request,
      'CLOVER_PLATFORM_REFUND_PAYMENT_ID_MISMATCH',
      'Clover Platform refund does not reference the expected payment',
      providerRefundId,
    );
  }
  if (amountCents !== request.amountCents) {
    return reversalUnknown(
      request,
      'CLOVER_PLATFORM_REFUND_AMOUNT_MISMATCH',
      'Clover Platform refund amount does not match the requested full refund',
      providerRefundId,
    );
  }

  const additionalCharges = elementRecords(refund, 'additionalCharges');
  if (!additionalCharges) {
    return reversalUnknown(
      request,
      'CLOVER_PLATFORM_REFUND_ADDITIONAL_CHARGES_INVALID',
      'Clover Platform returned invalid refund additional charges',
      providerRefundId,
    );
  }
  const additionalChargeRefundCents = sumMoney(additionalCharges);
  if (
    additionalChargeRefundCents === null ||
    additionalChargeRefundCents !== request.expectedAdditionalChargeRefundCents
  ) {
    return reversalUnknown(
      request,
      'CLOVER_PLATFORM_REFUND_ADDITIONAL_CHARGE_MISMATCH',
      'Clover Platform refund additional charges do not match the original canonical charge facts',
      providerRefundId,
    );
  }
  const surchargeRows = additionalCharges.filter(
    (charge) =>
      stringValue(charge, 'type')?.trim().toUpperCase() === 'CREDIT_SURCHARGE',
  );
  const surchargeCents = sumMoney(surchargeRows);
  if (surchargeCents === null) {
    return reversalUnknown(
      request,
      'CLOVER_PLATFORM_REFUND_SURCHARGE_INVALID',
      'Clover Platform returned an invalid refunded surcharge amount',
      providerRefundId,
    );
  }
  const refundedCustomerTotalCents = amountCents + additionalChargeRefundCents;
  if (!Number.isSafeInteger(refundedCustomerTotalCents)) {
    return reversalUnknown(
      request,
      'CLOVER_PLATFORM_REFUND_TOTAL_INVALID',
      'Clover Platform refund total is outside the supported money range',
      providerRefundId,
    );
  }

  return {
    ...canonicalBase(request),
    status: 'SUCCEEDED',
    providerPaymentId,
    providerRefundId,
    amountCents,
    currency: request.currency,
    surchargeCents,
    chargedTotalCents: refundedCustomerTotalCents,
    refundedAmountCents: amountCents,
    resultCode,
    failureCode: null,
    failureMessage: null,
  };
};

@Injectable()
export class CloverPlatformPaymentsGateway {
  private readonly logger = new AppLogger(CloverPlatformPaymentsGateway.name);

  constructor(
    private readonly config: CloverProviderConfig,
    private readonly accessTokens: CloverMerchantAccessTokenService,
  ) {}

  async isConfigured(): Promise<boolean> {
    const merchantId = this.config.unifiedMerchantId;
    return Boolean(
      merchantId &&
      this.config.unifiedPlatformApiBase &&
      (await this.accessTokens.hasUsableCredential(merchantId)),
    );
  }

  async getCanonicalPayment(
    request: CloverPlatformCanonicalPaymentRequest,
  ): Promise<PaymentProviderOutcome> {
    const merchantId = this.config.unifiedMerchantId;
    if (!merchantId || !(await this.isConfigured())) {
      return platformPaymentUnknown(
        request,
        'CLOVER_PLATFORM_MISCONFIGURED',
        'Clover Platform payment read requires an active merchant OAuth authorization',
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

  async getCanonicalReversal(
    request: CloverPlatformCanonicalReversalRequest,
  ): Promise<PaymentProviderOutcome> {
    const merchantId = this.config.unifiedMerchantId;
    if (!merchantId || !(await this.isConfigured())) {
      return reversalUnknown(
        request,
        'CLOVER_PLATFORM_MISCONFIGURED',
        'Clover Platform reversal read requires an active merchant OAuth authorization',
      );
    }
    const providerPaymentId = request.providerPaymentId?.trim();
    if (!providerPaymentId) {
      return reversalUnknown(
        request,
        'CLOVER_PLATFORM_REVERSAL_PAYMENT_ID_MISSING',
        'Canonical Clover reversal read requires the original payment id',
      );
    }

    const knownRefundId = request.providerRefundId?.trim();
    if (knownRefundId) {
      return this.getCanonicalRefundById(
        request,
        knownRefundId,
        request.operation === 'VOID'
          ? 'CLOVER_VOID_CONVERTED_TO_REFUND'
          : 'CLOVER_REFUND_CONFIRMED',
      );
    }

    const paymentResult = await this.request(
      `/v3/merchants/${encodeURIComponent(merchantId)}/payments/${encodeURIComponent(providerPaymentId)}?expand=${encodeURIComponent(PAYMENT_EXPAND)}`,
    );
    if (!paymentResult) {
      return reversalUnknown(
        request,
        'CLOVER_PLATFORM_REVERSAL_QUERY_UNCERTAIN',
        'Clover Platform reversal reconciliation did not receive a response',
      );
    }
    if (!paymentResult.ok) {
      return reversalUnknown(
        request,
        paymentResult.httpStatus === 404
          ? 'CLOVER_PLATFORM_REVERSAL_PAYMENT_NOT_FOUND'
          : `CLOVER_PLATFORM_REVERSAL_HTTP_${paymentResult.httpStatus}`,
        `Clover Platform returned HTTP ${paymentResult.httpStatus} while reading reversal truth`,
      );
    }

    const payment = asRecord(paymentResult.body?.payment ?? paymentResult.body);
    const canonicalPaymentId = stringValue(payment, 'id');
    const paymentAmount = integerValue(payment, 'amount');
    const order = asRecord(payment?.order);
    const currency = (
      stringValue(payment, 'currency') ?? stringValue(order, 'currency')
    )?.toUpperCase();
    if (
      canonicalPaymentId !== providerPaymentId ||
      paymentAmount !== request.amountCents ||
      !currency ||
      currency !== request.currency.toUpperCase()
    ) {
      return reversalUnknown(
        request,
        'CLOVER_PLATFORM_REVERSAL_PAYMENT_FACT_MISMATCH',
        'Clover Platform payment facts do not match the original canonical payment',
      );
    }

    const resultCode = stringValue(payment, 'result');
    const normalizedResult = normalizePlatformResult(resultCode);
    if (request.operation === 'VOID' && normalizedResult === 'CANCELLED') {
      const additionalCharges = elementRecords(payment, 'additionalCharges');
      if (!additionalCharges) {
        return reversalUnknown(
          request,
          'CLOVER_PLATFORM_VOID_ADDITIONAL_CHARGE_MISMATCH',
          'Clover Platform void facts do not match the original additional charges',
        );
      }
      const additionalChargeCents = sumMoney(additionalCharges);
      if (
        additionalChargeCents === null ||
        additionalChargeCents !== request.expectedAdditionalChargeRefundCents
      ) {
        return reversalUnknown(
          request,
          'CLOVER_PLATFORM_VOID_ADDITIONAL_CHARGE_MISMATCH',
          'Clover Platform void facts do not match the original additional charges',
        );
      }
      const surchargeRows = additionalCharges.filter(
        (charge) =>
          stringValue(charge, 'type')?.trim().toUpperCase() ===
          'CREDIT_SURCHARGE',
      );
      const surchargeCents = sumMoney(surchargeRows);
      if (surchargeCents === null) {
        return reversalUnknown(
          request,
          'CLOVER_PLATFORM_VOID_SURCHARGE_INVALID',
          'Clover Platform returned an invalid surcharge on the voided payment',
        );
      }
      return {
        ...canonicalBase(request),
        status: 'SUCCEEDED',
        providerPaymentId,
        amountCents: request.amountCents,
        currency: request.currency,
        refundedAmountCents: request.amountCents,
        surchargeCents,
        chargedTotalCents: request.amountCents + additionalChargeCents,
        resultCode: 'CLOVER_VOID_CONFIRMED',
        failureCode: null,
        failureMessage: null,
      };
    }

    const refunds = elementRecords(payment, 'refunds');
    if (!refunds) {
      return reversalUnknown(
        request,
        'CLOVER_PLATFORM_REVERSAL_REFUNDS_INVALID',
        'Clover Platform returned invalid reversal refund facts',
      );
    }
    if (refunds.length === 0) {
      if (normalizedResult === 'FAILED') {
        return {
          ...canonicalBase(request),
          status: 'FAILED',
          providerPaymentId,
          amountCents: request.amountCents,
          currency: request.currency,
          resultCode: resultCode ?? 'CLOVER_REVERSAL_FAILED',
          failureCode: 'CLOVER_PLATFORM_REVERSAL_FAILED',
          failureMessage: 'Clover Platform reports that the reversal failed',
        };
      }
      return reversalUnknown(
        request,
        'CLOVER_PLATFORM_REVERSAL_NOT_YET_VISIBLE',
        'Clover Platform has not exposed a canonical void or refund yet',
      );
    }
    if (refunds.length !== 1) {
      return reversalUnknown(
        request,
        'CLOVER_PLATFORM_REVERSAL_REFUND_IDENTITY_CONFLICT',
        'Clover Platform exposed multiple refunds for a managed full refund',
      );
    }
    const discoveredRefundId = stringValue(refunds[0], 'id');
    if (!discoveredRefundId) {
      return reversalUnknown(
        request,
        'CLOVER_PLATFORM_REVERSAL_REFUND_ID_MISSING',
        'Clover Platform refund relation is missing its refund id',
      );
    }
    return this.getCanonicalRefundById(
      request,
      discoveredRefundId,
      request.operation === 'VOID'
        ? 'CLOVER_VOID_CONVERTED_TO_REFUND'
        : 'CLOVER_REFUND_CONFIRMED',
    );
  }

  private async getCanonicalRefundById(
    request: CloverPlatformCanonicalReversalRequest,
    providerRefundId: string,
    resultCode = 'CLOVER_REFUND_CONFIRMED',
  ): Promise<PaymentProviderOutcome> {
    const merchantId = this.config.unifiedMerchantId;
    if (!merchantId) {
      return reversalUnknown(
        request,
        'CLOVER_PLATFORM_MERCHANT_ID_MISSING',
        'Clover merchant id is unavailable for refund reconciliation',
        providerRefundId,
      );
    }
    const refundResult = await this.request(
      `/v3/merchants/${encodeURIComponent(merchantId)}/refunds/${encodeURIComponent(providerRefundId)}?expand=${encodeURIComponent('additionalCharges,payment')}`,
    );
    if (!refundResult) {
      return reversalUnknown(
        request,
        'CLOVER_PLATFORM_REFUND_QUERY_UNCERTAIN',
        'Clover Platform refund query did not receive a response',
        providerRefundId,
      );
    }
    if (!refundResult.ok) {
      return reversalUnknown(
        request,
        refundResult.httpStatus === 404
          ? 'CLOVER_PLATFORM_REFUND_NOT_FOUND'
          : `CLOVER_PLATFORM_REFUND_HTTP_${refundResult.httpStatus}`,
        `Clover Platform returned HTTP ${refundResult.httpStatus} while reading refund truth`,
        providerRefundId,
      );
    }
    return mapPlatformRefund(
      refundResult.body?.refund ?? refundResult.body,
      request,
      resultCode,
    );
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
    const merchantId = this.config.unifiedMerchantId;
    if (!merchantId) return null;
    try {
      const credential = await this.accessTokens.getAccessToken(merchantId);
      if (!credential) return null;
      let result = await this.requestWithToken(path, credential.token);
      if (result?.httpStatus === 401) {
        const refreshed = await this.accessTokens.getAccessToken(merchantId, {
          forceRefresh: true,
        });
        if (refreshed) {
          result = await this.requestWithToken(path, refreshed.token);
        }
      }
      return result;
    } catch (error) {
      this.logger.warn(
        `[CloverPlatformPaymentsGateway] request unavailable path=${path} reason=${this.errorMessage(error)}`,
      );
      return null;
    }
  }

  private async requestWithToken(
    path: string,
    token: string,
  ): Promise<CloverPlatformHttpResult | null> {
    const apiBase = this.config.unifiedPlatformApiBase;
    if (!apiBase) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PLATFORM_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${apiBase}${path}`, {
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
