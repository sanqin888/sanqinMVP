//Users/apple/sanqinMVP/apps/api/src/clover/clover.service.ts
import { Injectable } from '@nestjs/common';
import { AppLogger } from '../common/app-logger';

type CloverPaymentCreateResult =
  | { ok: true; paymentId: string; status?: string }
  | {
      ok: false;
      reason: string;
      status?: string;
      code?: string;
      challengeUrl?: string | null;
      paymentId?: string;
    };

type CloverChargeStatusResult =
  | {
      ok: true;
      paymentId?: string;
      status?: string;
      captured?: boolean;
    }
  | {
      ok: false;
      reason: string;
      status?: string;
    };

// ===== Service =====
@Injectable()
export class CloverService {
  private readonly logger = new AppLogger(CloverService.name);
  private readonly apiBase: string;
  private readonly apiToken: string | undefined;

  constructor() {
    this.apiBase =
      (process.env.CLOVER_BASE && process.env.CLOVER_BASE.trim()) ||
      'https://api.clover.com';

    this.apiToken = process.env.CLOVER_ACCESS_TOKEN?.trim();
  }

  async createCardPayment(params: {
    amountCents: number;
    currency: string;
    source: string;
    orderId: string;
    idempotencyKey?: string;
    description?: string;
  }): Promise<CloverPaymentCreateResult> {
    if (!this.apiToken) {
      return { ok: false, reason: 'missing-credentials' };
    }

    const url = `${this.apiBase}/v1/charges`;
    const idempotencyKey = params.idempotencyKey ?? params.orderId;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiToken}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          amount: params.amountCents,
          currency: params.currency.toLowerCase(),
          source: params.source,
          description: params.description || `Online Order ${params.orderId}`,
        }),
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Clover request failed';
      this.logger.error(`[CloverService] charge request failed reason=${reason}`);
      return {
        ok: false,
        status: 'FAILED',
        reason,
      };
    }

    const rawText = await resp.text();
    let parsed: Record<string, unknown> | undefined;
    try {
      parsed = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      return { ok: false, reason: rawText };
    }

    if (!resp.ok) {
      this.logger.warn(
        `Unexpected Clover charge response keys: ${JSON.stringify(
          safeLogKeys(parsed),
        )}`,
      );
      const errorDetails = extractCloverErrorDetails(parsed);
      const reason = stringifyReason(parsed, rawText, errorDetails.message);
      return {
        ok: false,
        reason,
        status: errorDetails.status ?? 'FAILED',
        code: errorDetails.code,
        challengeUrl: errorDetails.challengeUrl ?? null,
        paymentId: errorDetails.paymentId,
      };
    }

    const status =
      typeof parsed.status === 'string' ? parsed.status : undefined;
    const captured =
      typeof parsed.captured === 'boolean' ? parsed.captured : undefined;
    const paymentId = typeof parsed.id === 'string' ? parsed.id : undefined;

    const isSuccess = status === 'succeeded' || captured === true;
    if (!isSuccess) {
      return {
        ok: false,
        reason: 'payment_not_captured',
        status,
      };
    }

    if (!paymentId) {
      return { ok: false, reason: 'missing-payment-id', status };
    }

    return { ok: true, paymentId, status };
  }

  async getChargeStatus(params: {
    paymentId?: string;
    idempotencyKey?: string;
  }): Promise<CloverChargeStatusResult> {
    if (!this.apiToken) {
      return { ok: false, reason: 'missing-credentials' };
    }

    const paymentId = params.paymentId?.trim();
    const idempotencyKey = params.idempotencyKey?.trim();
    if (!paymentId && !idempotencyKey) {
      return { ok: false, reason: 'missing-identifiers' };
    }

    const url = paymentId
      ? `${this.apiBase}/v1/charges/${encodeURIComponent(paymentId)}`
      : `${this.apiBase}/v1/charges?limit=1&idempotency_key=${encodeURIComponent(
          idempotencyKey ?? '',
        )}`;

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiToken}`,
        },
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Clover request failed';
      this.logger.error(`[CloverService] status request failed reason=${reason}`);
      return {
        ok: false,
        status: 'FAILED',
        reason,
      };
    }

    const rawText = await resp.text();
    let parsed: Record<string, unknown> | undefined;
    try {
      parsed = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      return { ok: false, reason: rawText };
    }

    if (!resp.ok) {
      this.logger.warn(
        `Unexpected Clover status response keys: ${JSON.stringify(
          safeLogKeys(parsed),
        )}`,
      );
      const errorDetails = extractCloverErrorDetails(parsed);
      const reason = stringifyReason(parsed, rawText, errorDetails.message);
      return { ok: false, reason, status: errorDetails.status ?? 'FAILED' };
    }

    const record = extractChargeRecord(parsed);
    if (!record) {
      return { ok: false, reason: 'missing-charge' };
    }

    const status =
      typeof record.status === 'string' ? record.status : undefined;
    const captured =
      typeof record.captured === 'boolean' ? record.captured : undefined;
    const recordPaymentId =
      typeof record.id === 'string' ? record.id : undefined;

    return {
      ok: true,
      status,
      captured,
      paymentId: recordPaymentId,
    };
  }
}

type CloverErrorDetails = {
  message?: string;
  code?: string;
  declineCode?: string;
  challengeUrl?: string;
  paymentId?: string;
  status?: string;
};

function extractCloverErrorDetails(
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

function extractChargeRecord(
  payload: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const data = payload.data;
  if (Array.isArray(data)) {
    const first = data[0] as unknown;
    return first && typeof first === 'object'
      ? (first as Record<string, unknown>)
      : undefined;
  }

  const charges = payload.charges;
  if (Array.isArray(charges)) {
    const first = charges[0] as unknown;
    return first && typeof first === 'object'
      ? (first as Record<string, unknown>)
      : undefined;
  }

  return payload;
}

function safeLogKeys(
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

function stringifyReason(
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
      // ignore serialization failure and continue fallback chain
    }
  }

  if (typeof rawText === 'string' && rawText.trim().length > 0) {
    return rawText;
  }

  return fallbackMessage?.trim() || 'Clover request failed';
}
