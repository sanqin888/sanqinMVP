import { Injectable } from '@nestjs/common';

import { AppLogger } from '../../../../common/app-logger';
import { CloverProviderConfig } from '../clover-provider.config';
import type {
  CloverEcommerceChargeStatusResult,
  CloverEcommerceCreateChargeRequest,
  CloverEcommerceGetChargeStatusRequest,
  CloverEcommercePaymentCreateResult,
} from './clover-ecommerce.contracts';
import {
  extractChargeRecords,
  extractCloverErrorDetails,
  isFailurePayload,
  safeLogKeys,
  stringifyReason,
  toChargeStatusSuccess,
} from './clover-ecommerce.mapper';

@Injectable()
export class CloverEcommerceTransport {
  private readonly logger = new AppLogger(CloverEcommerceTransport.name);

  constructor(private readonly config: CloverProviderConfig) {}

  async createCardPayment(
    params: CloverEcommerceCreateChargeRequest,
  ): Promise<CloverEcommercePaymentCreateResult> {
    const isRecord = (value: unknown): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null;

    const getString = (
      obj: Record<string, unknown>,
      key: string,
    ): string | undefined => {
      const value = obj[key];
      return typeof value === 'string' ? value : undefined;
    };

    const getBoolean = (
      obj: Record<string, unknown>,
      key: string,
    ): boolean | undefined => {
      const value = obj[key];
      return typeof value === 'boolean' ? value : undefined;
    };

    const apiToken = this.config.accessToken;
    if (!apiToken) {
      return { ok: false, reason: 'missing-credentials' };
    }

    const url = `${this.config.ecommerceApiBase}/v1/charges`;
    const idempotencyKey = params.idempotencyKey ?? params.orderId;

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
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
        `[CloverEcommerceTransport] charge request failed reason=${reason}`,
      );

      return {
        ok: false,
        status: 'FAILED',
        reason,
      };
    }

    const rawText = await resp.text();

    if (resp.status === 204) {
      const headersObj: Record<string, string> = {};
      resp.headers.forEach((value, key) => {
        headersObj[key] = value;
      });

      this.logger.error(
        `[CloverEcommerceTransport] charge returned 204 No Content. headers=${JSON.stringify(headersObj)}`,
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
      const value: unknown = JSON.parse(rawText);
      if (!isRecord(value)) {
        const contentType = resp.headers.get('content-type') ?? '';
        const snippet = (rawText ?? '')
          .slice(0, 400)
          .replace(/\s+/g, ' ')
          .trim();
        this.logger.error(
          `[CloverEcommerceTransport] charge non-object json response: status=${resp.status} ${resp.statusText ?? ''} content-type=${contentType} body_snippet="${snippet}"`,
        );
        return {
          ok: false,
          status: 'FAILED',
          reason:
            snippet.length > 0
              ? `Non-object JSON from Clover: HTTP ${resp.status} ${resp.statusText ?? ''}; ${contentType}; ${snippet}`
              : `Non-object JSON from Clover: HTTP ${resp.status} ${resp.statusText ?? ''}; ${contentType}`,
        };
      }
      parsed = value;
    } catch {
      const contentType = resp.headers.get('content-type') ?? '';
      const snippet = (rawText ?? '').slice(0, 400).replace(/\s+/g, ' ').trim();
      this.logger.error(
        `[CloverEcommerceTransport] charge non-json response: status=${resp.status} ${resp.statusText ?? ''} content-type=${contentType} body_snippet="${snippet}"`,
      );
      return {
        ok: false,
        status: 'FAILED',
        reason:
          snippet.length > 0
            ? `Non-JSON response from Clover: HTTP ${resp.status} ${resp.statusText ?? ''}; ${contentType}; ${snippet}`
            : `Non-JSON response from Clover: HTTP ${resp.status} ${resp.statusText ?? ''}; ${contentType}`,
      };
    }

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

    if (isFailurePayload(parsed)) {
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

    const status = getString(parsed, 'status');
    const captured = getBoolean(parsed, 'captured');
    const paymentId = getString(parsed, 'id');
    const isSuccess = status === 'succeeded' || captured === true;

    if (!isSuccess) {
      this.logger.error(
        `[CloverEcommerceTransport] charge 200 but not captured: status=${status ?? ''} captured=${String(
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
        `[CloverEcommerceTransport] charge succeeded but missing payment id raw=${rawText}`,
      );
      return { ok: false, reason: 'missing-payment-id', status };
    }

    return { ok: true, paymentId, status };
  }

  async getChargeStatus(
    params: CloverEcommerceGetChargeStatusRequest,
  ): Promise<CloverEcommerceChargeStatusResult> {
    if (!this.config.accessToken) {
      return { ok: false, reason: 'missing-credentials' };
    }

    const externalPaymentId = params.externalPaymentId?.trim();
    const paymentId = params.paymentId?.trim();
    const idempotencyKey = params.idempotencyKey?.trim();
    if (!externalPaymentId && !paymentId && !idempotencyKey) {
      return { ok: false, reason: 'missing-identifiers' };
    }

    if (externalPaymentId) {
      if (paymentId) {
        const byPaymentId = await this.queryChargeStatusByFilters([
          {
            query: `id=${encodeURIComponent(paymentId)}`,
            matcher: (charge) => charge.paymentId === paymentId,
          },
          {
            query: `paymentId=${encodeURIComponent(paymentId)}`,
            matcher: (charge) => charge.paymentId === paymentId,
          },
        ]);

        if (byPaymentId.ok) {
          return byPaymentId.result;
        }
      }

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
      matcher: (
        charge: CloverEcommerceChargeStatusResult & { ok: true },
      ) => boolean;
    }>,
  ): Promise<
    | {
        ok: true;
        result: CloverEcommerceChargeStatusResult;
      }
    | { ok: false }
  > {
    if (!this.config.accessToken) {
      return { ok: false };
    }

    for (const filter of filters) {
      const url = `${this.config.ecommerceApiBase}/v1/charges?limit=20&${filter.query}`;
      const responses = await this.fetchV1ChargeStatuses(url);
      if (!responses || responses.length === 0) continue;
      const matched = responses.find(
        (response): response is CloverEcommerceChargeStatusResult & {
          ok: true;
        } => response.ok && filter.matcher(response),
      );
      if (matched) {
        return { ok: true, result: matched };
      }
    }

    return { ok: false };
  }

  private async fetchV1ChargeStatuses(
    url: string,
  ): Promise<CloverEcommerceChargeStatusResult[] | null> {
    const apiToken = this.config.accessToken;
    if (!apiToken) return null;

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Clover request failed';
      this.logger.error(
        `[CloverEcommerceTransport] charge status request failed reason=${reason}`,
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

    this.logger.debug(
      `[CloverEcommerceTransport] charge status response url=${url} ok=${resp.ok} status=${resp.status} chargeCount=${extractChargeRecords(parsed).length}`,
    );

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
    const apiToken = this.config.accessToken;
    if (!apiToken || !idempotencyKey) return undefined;

    const url = `${this.config.ecommerceApiBase}/v1/charges?limit=1&idempotency_key=${encodeURIComponent(idempotencyKey)}`;
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiToken}`,
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
