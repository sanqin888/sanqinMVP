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
      baseAmountCents?: number;
      chargedTotalCents?: number;
      creditSurchargeCents?: number;
      creditSurchargeRate?: number;
    }
  | {
      ok: false;
      reason: string;
      status?: string;
      code?: string;
      message?: string;
    };

// ===== Service =====
@Injectable()
export class CloverService {
  private readonly logger = new AppLogger(CloverService.name);
  private readonly apiBase: string;
  private readonly apiToken: string | undefined;
  private readonly v3ApiToken: string | undefined;
  private readonly merchantId: string | undefined;

  constructor() {
    this.apiBase =
      (process.env.CLOVER_BASE && process.env.CLOVER_BASE.trim()) ||
      'https://api.clover.com';

    this.apiToken = process.env.CLOVER_ACCESS_TOKEN?.trim();
    this.v3ApiToken = process.env.CLOVER_V3_ACCESS_TOKEN?.trim();
    this.merchantId = process.env.CLOVER_MERCHANT_ID?.trim();
  }

  async createCardPayment(params: {
    amountCents: number;
    currency: string;
    source: string;
    orderId: string;
    idempotencyKey?: string;
    description?: string;
  }): Promise<CloverPaymentCreateResult> {
    // ---- helpers: no any, safe access ----
    const isRecord = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' && v !== null;

    const getString = (
      obj: Record<string, unknown>,
      key: string,
    ): string | undefined => {
      const v = obj[key];
      return typeof v === 'string' ? v : undefined;
    };

    const getBoolean = (
      obj: Record<string, unknown>,
      key: string,
    ): boolean | undefined => {
      const v = obj[key];
      return typeof v === 'boolean' ? v : undefined;
    };

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

      this.logger.error(
        `[CloverService] charge request failed reason=${reason}`,
      );

      return {
        ok: false,
        status: 'FAILED',
        reason,
      };
    }

    // ✅ fetch 成功后，一定先拿到 rawText
    const rawText = await resp.text();

    if (resp.status === 204) {
      const headersObj: Record<string, string> = {};
      resp.headers.forEach((v, k) => {
        headersObj[k] = v;
      });

      this.logger.error(
        `[CloverService] charge returned 204 No Content. headers=${JSON.stringify(headersObj)}`,
      );

      return {
        ok: false,
        status: 'FAILED',
        code: 'CLOVER_NO_CONTENT',
        reason: 'Clover returned 204 No Content (unexpected for charge create)',
      };
    }

    let parsed: Record<string, unknown>;
    try {
      const v: unknown = JSON.parse(rawText);
      if (!isRecord(v)) {
        const ct = resp.headers.get('content-type') ?? '';
        const snippet = (rawText ?? '')
          .slice(0, 400)
          .replace(/\s+/g, ' ')
          .trim();
        this.logger.error(
          `[CloverService] charge non-object json response: status=${resp.status} ${resp.statusText ?? ''} content-type=${ct} body_snippet="${snippet}"`,
        );
        return {
          ok: false,
          status: 'FAILED',
          reason:
            snippet.length > 0
              ? `Non-object JSON from Clover: HTTP ${resp.status} ${resp.statusText ?? ''}; ${ct}; ${snippet}`
              : `Non-object JSON from Clover: HTTP ${resp.status} ${resp.statusText ?? ''}; ${ct}`,
        };
      }
      parsed = v;
    } catch {
      const ct = resp.headers.get('content-type') ?? '';
      const snippet = (rawText ?? '').slice(0, 400).replace(/\s+/g, ' ').trim();
      this.logger.error(
        `[CloverService] charge non-json response: status=${resp.status} ${resp.statusText ?? ''} content-type=${ct} body_snippet="${snippet}"`,
      );
      return {
        ok: false,
        status: 'FAILED',
        reason:
          snippet.length > 0
            ? `Non-JSON response from Clover: HTTP ${resp.status} ${resp.statusText ?? ''}; ${ct}; ${snippet}`
            : `Non-JSON response from Clover: HTTP ${resp.status} ${resp.statusText ?? ''}; ${ct}`,
      };
    }

    // HTTP 非 2xx：把 Clover 错误尽量带回来
    if (!resp.ok) {
      this.logger.warn(
        `Unexpected Clover charge response keys: ${JSON.stringify(safeLogKeys(parsed))}`,
      );

      const errorDetails = extractCloverErrorDetails(parsed);
      const reason = stringifyReason(
        parsed,
        rawText,
        errorDetails.message ?? 'Clover charge failed',
      );

      return {
        ok: false,
        reason,
        status: errorDetails.status ?? 'FAILED',
        code: errorDetails.code,
        challengeUrl: errorDetails.challengeUrl ?? null,
        paymentId: errorDetails.paymentId,
      };
    }

    // HTTP 2xx：但不一定已 capture/succeed
    const status = getString(parsed, 'status');
    const captured = getBoolean(parsed, 'captured');
    const paymentId = getString(parsed, 'id');

    const isSuccess = status === 'succeeded' || captured === true;

    if (!isSuccess) {
      // ✅ 关键日志：把 Clover 的 200 响应原样打出来
      this.logger.error(
        `[CloverService] charge 200 but not captured: status=${status ?? ''} captured=${String(
          captured,
        )} paymentId=${paymentId ?? ''} raw=${rawText}`,
      );

      const errorDetails = extractCloverErrorDetails(parsed);
      const reason = stringifyReason(
        parsed,
        rawText,
        errorDetails.message ?? 'payment_not_captured',
      );

      return {
        ok: false,
        reason,
        status,
        code: errorDetails.code,
        challengeUrl: errorDetails.challengeUrl ?? null,
        paymentId: paymentId ?? errorDetails.paymentId,
      };
    }

    if (!paymentId) {
      this.logger.error(
        `[CloverService] charge succeeded but missing payment id raw=${rawText}`,
      );
      return { ok: false, reason: 'missing-payment-id', status };
    }

    return { ok: true, paymentId, status };
  }

  async getChargeStatus(params: {
    paymentId?: string;
    idempotencyKey?: string;
  }): Promise<CloverChargeStatusResult> {
    if (!this.v3ApiToken || !this.merchantId) {
      return { ok: false, reason: 'missing-credentials' };
    }

    const paymentId = params.paymentId?.trim();
    const idempotencyKey = params.idempotencyKey?.trim();
    if (!paymentId && !idempotencyKey) {
      return { ok: false, reason: 'missing-identifiers' };
    }

    if (!paymentId && !this.apiToken) {
      return { ok: false, reason: 'missing-credentials' };
    }

    const resolvedPaymentId =
      paymentId ??
      (await this.resolvePaymentIdByIdempotencyKey(idempotencyKey));
    if (!resolvedPaymentId) {
      return { ok: false, reason: 'missing-payment-id' };
    }

    const url = `${this.apiBase}/v3/merchants/${encodeURIComponent(this.merchantId)}/payments/${encodeURIComponent(resolvedPaymentId)}?expand=additionalCharges`;

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.v3ApiToken}`,
        },
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Clover request failed';
      this.logger.error(
        `[CloverService] status request failed reason=${reason}`,
      );
      return { ok: false, status: 'FAILED', reason };
    }

    const rawText = await resp.text();
    let parsed: Record<string, unknown> | undefined;
    try {
      const json = JSON.parse(rawText) as unknown;
      if (!json || typeof json !== 'object' || Array.isArray(json)) {
        return { ok: false, reason: rawText, message: rawText };
      }
      parsed = json as Record<string, unknown>;
    } catch {
      return { ok: false, reason: rawText, message: rawText };
    }

    const directError = extractDirectApiError(parsed);
    if (directError) {
      return {
        ok: false,
        reason: rawText,
        status: 'FAILED',
        code: directError.code,
        message: directError.message,
      };
    }

    if (!resp.ok) {
      const errorDetails = extractCloverErrorDetails(parsed);
      const reason = stringifyReason(parsed, rawText, errorDetails.message);
      return {
        ok: false,
        reason,
        status: errorDetails.status ?? 'FAILED',
        code: errorDetails.code,
        message: errorDetails.message,
      };
    }

    const baseAmountCents =
      typeof parsed.amount === 'number' && Number.isFinite(parsed.amount)
        ? Math.round(parsed.amount)
        : undefined;
    if (typeof baseAmountCents !== 'number') {
      return { ok: false, reason: 'missing-payment-amount' };
    }

    const status =
      typeof parsed.result === 'string'
        ? parsed.result
        : typeof parsed.status === 'string'
          ? parsed.status
          : undefined;
    const captured =
      typeof parsed.captured === 'boolean' ? parsed.captured : undefined;
    const surcharge = this.extractCreditCardSurcharge(parsed);
    const surchargeAmount = surcharge?.amountCents ?? 0;

    return {
      ok: true,
      status,
      captured,
      paymentId: resolvedPaymentId,
      baseAmountCents,
      chargedTotalCents: baseAmountCents + surchargeAmount,
      creditSurchargeCents: surchargeAmount > 0 ? surchargeAmount : undefined,
      creditSurchargeRate: surcharge?.rate,
    };
  }

  private async resolvePaymentIdByIdempotencyKey(
    idempotencyKey?: string,
  ): Promise<string | undefined> {
    if (!this.apiToken || !idempotencyKey) return undefined;

    const url = `${this.apiBase}/v1/charges?limit=1&idempotency_key=${encodeURIComponent(idempotencyKey)}`;
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiToken}`,
        },
      });

      if (!resp.ok) {
        return undefined;
      }

      const payload = (await resp.json()) as Record<string, unknown>;
      const record = extractChargeRecord(payload);
      if (!record) return undefined;
      return typeof record.id === 'string' ? record.id : undefined;
    } catch {
      return undefined;
    }
  }

  private extractCreditCardSurcharge(
    paymentPayload: Record<string, unknown>,
  ): { amountCents: number; rate?: number } | undefined {
    const additionalCharges = paymentPayload.additionalCharges;
    if (!additionalCharges || typeof additionalCharges !== 'object') {
      return undefined;
    }

    const elements = (additionalCharges as Record<string, unknown>).elements;
    if (!Array.isArray(elements)) {
      return undefined;
    }

    let surchargeAmount = 0;
    let surchargeRateBps: number | undefined;
    for (const entry of elements) {
      if (!entry || typeof entry !== 'object') continue;
      const charge = entry as Record<string, unknown>;
      if (charge.type !== 'CREDIT_SURCHARGE') continue;
      if (typeof charge.amount === 'number' && Number.isFinite(charge.amount)) {
        surchargeAmount += Math.max(0, Math.round(charge.amount));
      }
      if (typeof charge.rate === 'number' && Number.isFinite(charge.rate) && charge.rate >= 0) {
        surchargeRateBps = Math.round(charge.rate);
      }
    }

    if (surchargeAmount <= 0) return undefined;

    return {
      amountCents: surchargeAmount,
      rate: typeof surchargeRateBps === 'number' ? surchargeRateBps / 10000 : undefined,
    };
  }
}

function extractDirectApiError(payload: Record<string, unknown>): {
  code?: string;
  message: string;
} | null {
  const message =
    typeof payload.message === 'string' ? payload.message.trim() : '';
  const errorCode =
    typeof payload.error === 'string' ? payload.error.trim() : '';
  if (!message && !errorCode) {
    return null;
  }
  return {
    message: message || 'Clover request failed',
    code: errorCode || undefined,
  };
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
