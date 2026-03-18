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

export type CloverChargeStatusResult =
  | {
      ok: true;
      paymentId?: string;
      externalPaymentId?: string;
      status?: string;
      captured?: boolean;
      currency?: string;
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
    externalPaymentId?: string;
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
          externalPaymentId: params.externalPaymentId,
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

    // HTTP 2xx：先识别 Clover 返回的失败结构
    const hasFailurePayload = isFailurePayload(parsed);
    if (hasFailurePayload) {
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
    externalPaymentId?: string;
    paymentId?: string;
    idempotencyKey?: string;
  }): Promise<CloverChargeStatusResult> {
    if (!this.apiToken) {
      return { ok: false, reason: 'missing-credentials' };
    }

    const externalPaymentId = params.externalPaymentId?.trim();
    const paymentId = params.paymentId?.trim();
    const idempotencyKey = params.idempotencyKey?.trim();
    if (!externalPaymentId && !paymentId && !idempotencyKey) {
      return { ok: false, reason: 'missing-identifiers' };
    }

    if (externalPaymentId) {
      const byExternalPaymentId = await this.queryChargeStatusByFilters([
        {
          query: `externalPaymentId=${encodeURIComponent(externalPaymentId)}`,
          matcher: (charge) =>
            charge.externalPaymentId === externalPaymentId ||
            charge.paymentId === externalPaymentId,
        },
        {
          query: `external_payment_id=${encodeURIComponent(externalPaymentId)}`,
          matcher: (charge) =>
            charge.externalPaymentId === externalPaymentId ||
            charge.paymentId === externalPaymentId,
        },
      ]);
      if (byExternalPaymentId.ok) {
        return byExternalPaymentId.result;
      }

      if (paymentId) {
        const byPaymentIdFallback = await this.queryChargeStatusByFilters([
          {
            query: `id=${encodeURIComponent(paymentId)}`,
            matcher: (charge) => charge.paymentId === paymentId,
          },
          {
            query: `paymentId=${encodeURIComponent(paymentId)}`,
            matcher: (charge) => charge.paymentId === paymentId,
          },
        ]);

        if (byPaymentIdFallback.ok) {
          return byPaymentIdFallback.result;
        }
      }

      return {
        ok: false,
        reason: `externalPaymentId_not_found:${externalPaymentId}`,
        status: 'FAILED',
        code: 'EXTERNAL_PAYMENT_ID_NOT_FOUND',
        message: 'payment status not found by externalPaymentId',
      };
    }

    const resolvedPaymentId =
      paymentId ??
      (await this.resolvePaymentIdByIdempotencyKey(idempotencyKey));
    if (!resolvedPaymentId) {
      return { ok: false, reason: 'missing-payment-id' };
    }

    const byPaymentId = await this.queryChargeStatusByFilters([
      {
        query: `id=${encodeURIComponent(resolvedPaymentId)}`,
        matcher: (charge) => charge.paymentId === resolvedPaymentId,
      },
      {
        query: `paymentId=${encodeURIComponent(resolvedPaymentId)}`,
        matcher: (charge) => charge.paymentId === resolvedPaymentId,
      },
    ]);
    if (byPaymentId.ok) {
      return byPaymentId.result;
    }

    return {
      ok: false,
      reason: `payment_not_found:${resolvedPaymentId}`,
      status: 'FAILED',
      code: 'PAYMENT_NOT_FOUND',
      message: 'payment status not found by paymentId',
    };
  }

  private async queryChargeStatusByFilters(
    filters: Array<{
      query: string;
      matcher: (charge: CloverChargeStatusResult & { ok: true }) => boolean;
    }>,
  ): Promise<
    | {
        ok: true;
        result: CloverChargeStatusResult;
      }
    | { ok: false }
  > {
    if (!this.apiToken) {
      return { ok: false };
    }

    for (const filter of filters) {
      const url = `${this.apiBase}/v1/charges?limit=20&${filter.query}`;
      const responses = await this.fetchV1ChargeStatuses(url);
      if (!responses || responses.length === 0) continue;
      const matched = responses.find(
        (response): response is CloverChargeStatusResult & { ok: true } =>
          response.ok && filter.matcher(response),
      );
      if (matched) {
        return { ok: true, result: matched };
      }
    }

    return { ok: false };
  }

  private async fetchV1ChargeStatuses(
    url: string,
  ): Promise<CloverChargeStatusResult[] | null> {
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
      this.logger.error(
        `[CloverService] charge status request failed reason=${reason}`,
      );
      return [{ ok: false, status: 'FAILED', reason }];
    }

    const rawText = await resp.text();
    let parsed: Record<string, unknown> | undefined;
    try {
      const json = JSON.parse(rawText) as unknown;
      if (json && typeof json === 'object' && !Array.isArray(json)) {
        parsed = json as Record<string, unknown>;
      }
    } catch {
      return null;
    }

    if (!resp.ok) {
      if (resp.status === 404) {
        return null;
      }

      const errorDetails = extractCloverErrorDetails(parsed);
      const reason = stringifyReason(parsed, rawText, errorDetails.message);
      return [
        {
          ok: false,
          reason,
          status: errorDetails.status ?? 'FAILED',
          code: errorDetails.code,
          message: errorDetails.message,
        },
      ];
    }

    if (!parsed) {
      return null;
    }

    const charges = extractChargeRecords(parsed);
    if (charges.length === 0) {
      return null;
    }

    return charges.map((charge) => toChargeStatusSuccess(charge));
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
      const record = extractChargeRecords(payload)[0];
      if (!record) return undefined;
      return typeof record.id === 'string' ? record.id : undefined;
    } catch {
      return undefined;
    }
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

function extractChargeRecords(
  payload: Record<string, unknown>,
): Record<string, unknown>[] {
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
): CloverChargeStatusResult {
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

function isFailurePayload(payload: Record<string, unknown>): boolean {
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
