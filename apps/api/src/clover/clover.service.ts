//Users/apple/sanqinMVP/apps/api/src/clover/clover.service.ts
import { Injectable } from '@nestjs/common';

type CloverLineItemInput = {
  name: string;
  price: number;
  unitQty: number;
  note?: string;
};

type CloverOrderCreateResult =
  | { ok: true; orderId: string }
  | { ok: false; reason: string };

type CloverPaymentCreateResult =
  | { ok: true; paymentId: string; status?: string }
  | { ok: false; reason: string; status?: string };

// ===== Guards & utils =====
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

// ===== Service =====
@Injectable()
export class CloverService {
  private readonly apiBase: string;
  private readonly merchantId: string | undefined;
  private readonly apiToken: string | undefined;

  constructor() {
    this.apiBase =
      (process.env.CLOVER_BASE && process.env.CLOVER_BASE.trim()) ||
      'https://api.clover.com';

    this.merchantId = process.env.CLOVER_MERCHANT_ID?.trim();
    this.apiToken = process.env.CLOVER_ACCESS_TOKEN?.trim();
  }

  private normalizeStatus(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.toUpperCase() : undefined;
  }

  private interpretStatus(value: unknown): boolean | undefined {
    const evaluate = (v: unknown): boolean | undefined => {
      const normalized = this.normalizeStatus(v);
      if (!normalized) return undefined;

      const successStates = ['APPROVED', 'PAID', 'COMPLETED'];
      const failureStates = [
        'DECLINED',
        'FAILED',
        'VOID',
        'VOIDED',
        'CANCELLED',
        'CANCELED',
      ];

      if (successStates.includes(normalized)) return true;
      if (failureStates.includes(normalized)) return false;
      return undefined;
    };

    const directVerdict = evaluate(value);
    if (typeof directVerdict === 'boolean') return directVerdict;

    if (!value || typeof value !== 'object') return undefined;

    const record = value as Record<string, unknown>;

    // Clover 官方字段：顶层 status
    const statusVerdict = evaluate(record.status);
    if (typeof statusVerdict === 'boolean') return statusVerdict;

    // Clover Checkout 详情里的订单状态：order.state
    const orderStateVerdict = isPlainObject(record.order)
      ? evaluate(record.order.state)
      : undefined;
    if (typeof orderStateVerdict === 'boolean') return orderStateVerdict;

    // 兼容部分接口的 result 字段（非官方首选）
    const resultVerdict = evaluate(record.result);
    if (typeof resultVerdict === 'boolean') return resultVerdict;

    return undefined;
  }

  async createOrder(params: {
    currency: string;
    lineItems: CloverLineItemInput[];
  }): Promise<CloverOrderCreateResult> {
    if (!this.apiToken || !this.merchantId) {
      return { ok: false, reason: 'missing-credentials' };
    }

    const url = `${this.apiBase}/v3/merchants/${this.merchantId}/orders`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiToken}`,
      },
      body: JSON.stringify({
        currency: params.currency,
      }),
    });

    const rawText = await resp.text();
    let parsed: unknown = undefined;
    try {
      parsed = rawText ? JSON.parse(rawText) : undefined;
    } catch {
      parsed = undefined;
    }

    if (!resp.ok) {
      const reason =
        (isPlainObject(parsed) && typeof parsed.message === 'string'
          ? parsed.message
          : rawText) || `http-${resp.status}`;
      return { ok: false, reason };
    }

    const orderId =
      isPlainObject(parsed) && typeof parsed.id === 'string'
        ? parsed.id
        : undefined;
    if (!orderId) {
      return { ok: false, reason: 'missing-order-id' };
    }

    for (const item of params.lineItems) {
      const itemResp = await fetch(
        `${this.apiBase}/v3/merchants/${this.merchantId}/orders/${orderId}/line_items`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiToken}`,
          },
          body: JSON.stringify({
            name: item.name,
            price: item.price,
            unitQty: item.unitQty,
            ...(item.note ? { note: item.note } : {}),
          }),
        },
      );

      if (!itemResp.ok) {
        const itemText = await itemResp.text();
        const reason = itemText || `line-item-http-${itemResp.status}`;
        return { ok: false, reason };
      }
    }

    return { ok: true, orderId };
  }

  async createCardPayment(params: {
    amountCents: number;
    currency: string;
    source: string;
    sourceType: string;
    orderId: string;
    cardholderName: string;
    postalCode?: string;
    threeds?: Record<string, unknown>;
    referenceId?: string;
    description?: string;
    email?: string;
    clientIp?: string;
  }): Promise<CloverPaymentCreateResult> {
    if (!this.apiToken || !this.merchantId) {
      return { ok: false, reason: 'missing-credentials' };
    }

    const url = `${this.apiBase}/v3/merchants/${this.merchantId}/payments`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiToken}`,
    };
    if (params.referenceId) {
      headers['Idempotency-Key'] = params.referenceId;
    }
    if (params.clientIp) {
      headers['x-forwarded-for'] = params.clientIp;
    }

    const body = {
      amount: params.amountCents,
      currency: params.currency,
      orderId: params.orderId,
      source: params.source,
      sourceType: params.sourceType,
      cardholderName: params.cardholderName,
      ...(params.description ? { description: params.description } : {}),
      ...(params.email ? { email: params.email } : {}),
      ...(params.postalCode ? { postalCode: params.postalCode } : {}),
      ...(params.threeds ? { threeds: params.threeds } : {}),
      ...(params.referenceId
        ? { externalReferenceId: params.referenceId }
        : {}),
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const rawText = await resp.text();
    let parsed: unknown = undefined;
    try {
      parsed = rawText ? JSON.parse(rawText) : undefined;
    } catch {
      parsed = undefined;
    }

    if (!resp.ok) {
      const reason =
        (isPlainObject(parsed) && typeof parsed.message === 'string'
          ? parsed.message
          : rawText) || `http-${resp.status}`;
      return { ok: false, reason };
    }

    const paymentId =
      isPlainObject(parsed) && typeof parsed.id === 'string'
        ? parsed.id
        : undefined;
    const status = this.normalizeStatus(
      isPlainObject(parsed) ? (parsed.result ?? parsed.status) : undefined,
    );

    const verdict = this.interpretStatus(parsed);
    if (verdict === false) {
      return {
        ok: false,
        reason: rawText || 'payment-declined',
        status,
      };
    }

    if (status === 'CHALLENGE_REQUIRED') {
      return {
        ok: false,
        reason: rawText || 'challenge-required',
        status,
      };
    }

    if (!paymentId) {
      return { ok: false, reason: 'missing-payment-id', status };
    }

    return { ok: true, paymentId, status };
  }
}
