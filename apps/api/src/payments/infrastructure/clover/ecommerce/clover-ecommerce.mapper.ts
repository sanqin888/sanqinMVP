import type { PaymentProviderOutcome } from '../../../domain/payment.types';
import type {
  CloverEcommerceChargeStatusResult,
  CloverEcommercePaymentCreateResult,
} from './clover-ecommerce.contracts';

export type CloverErrorDetails = {
  message?: string;
  code?: string;
  declineCode?: string;
  challengeUrl?: string;
  paymentId?: string;
  status?: string;
};

export function extractCloverErrorDetails(
  payload: Record<string, unknown> | undefined,
): CloverErrorDetails {
  if (!payload) return {};
  const errorRaw = payload.error;
  const error =
    errorRaw && typeof errorRaw === 'object'
      ? (errorRaw as Record<string, unknown>)
      : undefined;

  const code = typeof error?.code === 'string' ? error.code : undefined;
  const declineCode =
    typeof error?.decline_code === 'string'
      ? error.decline_code
      : typeof error?.declineCode === 'string'
        ? error.declineCode
        : undefined;
  const message =
    typeof error?.message === 'string'
      ? error.message
      : typeof payload.message === 'string'
        ? payload.message
        : undefined;
  const status =
    typeof payload.status === 'string'
      ? payload.status
      : typeof error?.status === 'string'
        ? error.status
        : undefined;
  const paymentId =
    typeof payload.id === 'string'
      ? payload.id
      : typeof error?.payment_id === 'string'
        ? error.payment_id
        : typeof error?.paymentId === 'string'
          ? error.paymentId
          : undefined;

  const challengeUrl =
    pickString(error, [
      'challenge_url',
      'challengeUrl',
      'redirect_url',
      'redirectUrl',
      'authentication_url',
      'authenticationUrl',
      'three_d_secure_url',
      'threeDSecureUrl',
    ]) ??
    pickString(payload, [
      'challenge_url',
      'challengeUrl',
      'redirect_url',
      'redirectUrl',
      'authentication_url',
      'authenticationUrl',
      'three_d_secure_url',
      'threeDSecureUrl',
    ]);

  return { message, code, declineCode, challengeUrl, paymentId, status };
}

function pickString(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

export function extractChargeRecords(
  payload: Record<string, unknown> | undefined,
): Record<string, unknown>[] {
  if (!payload) return [];

  const data = payload.data;
  if (Array.isArray(data)) {
    return data.filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === 'object' && !Array.isArray(entry),
    );
  }

  const charges = payload.charges;
  if (Array.isArray(charges)) {
    return charges.filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === 'object' && !Array.isArray(entry),
    );
  }

  return [payload];
}

function toFiniteCents(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }

  return undefined;
}

function pickFirstFiniteCents(
  record: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = toFiniteCents(record[key]);
    if (typeof value === 'number') {
      return value;
    }
  }

  return undefined;
}

export function toChargeStatusSuccess(
  chargePayload: Record<string, unknown>,
): CloverEcommerceChargeStatusResult {
  const baseAmountCents = pickFirstFiniteCents(chargePayload, ['amount']);
  if (typeof baseAmountCents !== 'number') {
    return { ok: false, reason: 'missing-payment-amount' };
  }

  const explicitChargedTotalCents = pickFirstFiniteCents(chargePayload, [
    'chargedTotalCents',
    'charged_total_cents',
    'totalAmount',
    'total_amount',
    'amountTotal',
    'amount_total',
    'finalAmount',
    'final_amount',
    'total',
  ]);
  const chargedTotalCents = explicitChargedTotalCents ?? baseAmountCents;

  const status =
    typeof chargePayload.result === 'string'
      ? chargePayload.result
      : typeof chargePayload.status === 'string'
        ? chargePayload.status
        : undefined;
  const captured =
    typeof chargePayload.captured === 'boolean'
      ? chargePayload.captured
      : undefined;

  return {
    ok: true,
    status,
    captured,
    paymentId:
      typeof chargePayload.id === 'string' ? chargePayload.id : undefined,
    externalPaymentId:
      typeof chargePayload.externalPaymentId === 'string'
        ? chargePayload.externalPaymentId
        : typeof chargePayload.external_payment_id === 'string'
          ? chargePayload.external_payment_id
          : undefined,
    currency:
      typeof chargePayload.currency === 'string'
        ? chargePayload.currency
        : undefined,
    baseAmountCents,
    chargedTotalCents,
  };
}

export function isFailurePayload(payload: Record<string, unknown>): boolean {
  const errorRaw = payload.error;
  const error =
    errorRaw && typeof errorRaw === 'object'
      ? (errorRaw as Record<string, unknown>)
      : undefined;
  const hasDeclineCode =
    typeof payload.declineCode === 'string' ||
    typeof payload.decline_code === 'string' ||
    typeof error?.declineCode === 'string' ||
    typeof error?.decline_code === 'string';
  const hasErrorObject = Boolean(error);
  const hasErrorCode =
    typeof payload.code === 'string' || typeof error?.code === 'string';
  const hasMessageAndError =
    typeof payload.message === 'string' && hasErrorObject;
  return hasDeclineCode || hasErrorObject || hasErrorCode || hasMessageAndError;
}

export function safeLogKeys(
  payload: Record<string, unknown> | undefined,
): { rootKeys: string[]; errorKeys: string[] } | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const rootKeys = Object.keys(payload);
  const errorRaw = payload.error;
  const errorKeys =
    errorRaw && typeof errorRaw === 'object'
      ? Object.keys(errorRaw as Record<string, unknown>)
      : [];
  return { rootKeys, errorKeys };
}

export function stringifyReason(
  parsed: Record<string, unknown> | undefined,
  rawText: string,
  fallbackMessage?: string,
): string {
  if (parsed) {
    try {
      const serialized = JSON.stringify(parsed);
      if (serialized && serialized !== '{}') {
        return serialized;
      }
    } catch {
      // Ignore serialization failure and continue the legacy fallback chain.
    }
  }

  if (typeof rawText === 'string' && rawText.trim().length > 0) {
    return rawText;
  }

  return fallbackMessage?.trim() || 'Clover request failed';
}

const normalizeStatus = (
  status: string | undefined,
  captured?: boolean,
): PaymentProviderOutcome['status'] => {
  if (captured === true) return 'SUCCEEDED';

  switch (status?.trim().toLowerCase()) {
    case 'succeeded':
    case 'success':
    case 'paid':
      return 'SUCCEEDED';
    case 'declined':
      return 'DECLINED';
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED';
    case 'pending':
    case 'processing':
    case 'authorized':
      return 'PROCESSING';
    case 'unknown':
      return 'UNKNOWN';
    default:
      return 'FAILED';
  }
};

export function toProviderOutcomeFromCreate(
  result: CloverEcommercePaymentCreateResult,
  externalPaymentId?: string | null,
): PaymentProviderOutcome {
  if (result.ok) {
    return {
      status: normalizeStatus(result.status, true),
      externalPaymentId,
      providerPaymentId: result.paymentId,
      resultCode: result.status ?? null,
    };
  }

  return {
    status: normalizeStatus(result.status),
    externalPaymentId,
    providerPaymentId: result.paymentId,
    resultCode: result.status ?? null,
    failureCode: result.code ?? null,
    failureMessage: result.reason,
  };
}

export function toProviderOutcomeFromStatus(
  result: CloverEcommerceChargeStatusResult,
): PaymentProviderOutcome {
  if (!result.ok) {
    return {
      status: normalizeStatus(result.status),
      resultCode: result.status ?? null,
      failureCode: result.code ?? null,
      failureMessage: result.message ?? result.reason,
    };
  }

  return {
    status: normalizeStatus(result.status, result.captured),
    externalPaymentId: result.externalPaymentId,
    providerPaymentId: result.paymentId,
    chargedTotalCents: result.chargedTotalCents,
    surchargeCents: result.creditSurchargeCents,
    resultCode: result.status ?? null,
  };
}
