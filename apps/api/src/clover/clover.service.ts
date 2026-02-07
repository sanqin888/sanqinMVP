//Users/apple/sanqinMVP/apps/api/src/clover/clover.service.ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';

/**
 * Clover Hosted Checkout - type-safe minimal service
 * - Adds redirectUrls
 * - Matches unit tests & ESLint constraints
 */

// ===== Types =====
type Locale = 'zh' | 'en';

export interface InLineItem {
  name?: string;
  description?: string;
  referenceId?: string;
  amountCents?: number; // cents
  priceCents?: number; // cents (alias)
  price?: number; // cents (alias)
  amount?: number; // cents (alias)
  quantity?: number;
  note?: string;
}

export interface HostedCheckoutRequest {
  customer?: unknown;
  locale?: string; // will be narrowed to 'zh' | 'en'
  orderId?: string;
  id?: string;
  referenceId?: string;
  description?: string;
  price?: number;
  priceCents?: number;
  amount?: number;
  amountCents?: number;
  note?: unknown;
  lineItems?: InLineItem[];
}

type HostedCheckoutResult =
  | { ok: true; href: string; checkoutSessionId?: string }
  | { ok: false; reason: string };

interface HostedCheckoutApiResponse {
  href: string;
  checkoutSessionId?: string;
  // allow passthrough
  [k: string]: unknown;
}

interface CloverOrder {
  id: string;
  currency?: string;
  total?: number;
  paymentState?: string;
  state?: string; // LOCKED, etc.
  payments?: Array<{
    id: string;
    result?: string;
    amount?: number;
  }>;
}

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

const isHostedCheckoutApiResponse = (
  x: unknown,
): x is HostedCheckoutApiResponse =>
  isPlainObject(x) && typeof x.href === 'string' && x.href.length > 0;

const pickOrderId = (r: HostedCheckoutRequest): string => {
  const candidate = [r.orderId, r.id, r.referenceId].find(
    (x): x is string => typeof x === 'string' && x.trim().length > 0,
  );
  return candidate ?? '';
};
const normalizeLocale = (x: unknown): 'zh' | 'en' => {
  if (typeof x !== 'string') return 'en';
  const s = x.toLowerCase();
  if (s.startsWith('zh')) return 'zh';
  if (s.startsWith('en')) return 'en';
  return 'en';
};

const extractLocaleFromUrl = (u: unknown): 'zh' | 'en' | undefined => {
  if (typeof u !== 'string') return undefined;
  const m = u.match(/\/(zh|en)(?=\/)/i);
  return m ? normalizeLocale(m[1]) : undefined;
};

const errToString = (e: unknown): string =>
  e instanceof Error
    ? e.message
    : typeof e === 'string'
      ? e
      : JSON.stringify(e);

// ===== Service =====
@Injectable()
export class CloverService {
  private readonly logger = new Logger('CloverService');

  private readonly apiBase: string;
  private readonly merchantId: string | undefined;
  private readonly apiToken: string | undefined;
  private readonly privateKey: string | undefined;

  private readonly taxId: string | undefined;
  private readonly taxName: string | undefined;
  private readonly taxRateInt: number | undefined; // millionths (0.13 -> 1300000)

  constructor() {
    this.apiBase =
      (process.env.CLOVER_BASE && process.env.CLOVER_BASE.trim()) ||
      'https://api.clover.com';

    this.merchantId = process.env.CLOVER_MERCHANT_ID?.trim();
    this.privateKey = process.env.CLOVER_PRIVATE_TOKEN?.trim();
    this.apiToken = process.env.CLOVER_ACCESS_TOKEN?.trim();

    // tax config
    this.taxId = process.env.CLOVER_TAX_ID?.trim();
    // ⭐ 默认名改为 HST（测试期望）
    this.taxName = (process.env.CLOVER_TAX_NAME || 'HST').trim();
    const salesRate = Number(process.env.SALES_TAX_RATE); // e.g. "0.13"
    this.taxRateInt = Number.isFinite(salesRate)
      ? Math.round(salesRate * 1_000_000)
      : undefined;
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

  private isCheckoutPaid(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object') return false;
    const verdict = this.interpretStatus(payload);
    return verdict === true;
  }

  /**
   * 通过 Order ID 验证支付状态 (使用 /v3/ 接口)
   */
  async verifyOrderPaid(orderId: string): Promise<boolean> {
    if (!orderId || !this.apiToken || !this.merchantId) {
      this.logger.warn('verifyOrderPaid: missing args or credentials');
      return false;
    }

    // 使用标准的 Order API
    const url = `${this.apiBase}/v3/merchants/${this.merchantId}/orders/${orderId}?expand=payments`;
    this.logger.log(`Checking Order Status -> GET ${url}`);

    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiToken}`, // 必须用 Access Token
        },
      });

      if (!resp.ok) {
        this.logger.error(`Failed to fetch order: ${resp.status}`);
        return false;
      }

      // 🟢 修复: 强制转换为 CloverOrder 类型，解决 "Unsafe assignment of any value"
      const orderData = (await resp.json()) as CloverOrder;

      // 逻辑：检查订单状态是否为 PAID 或有成功的支付记录
      // 🟢 修复: 现在 orderData 有了类型，这些访问不再报错
      const isPaid =
        orderData.paymentState === 'PAID' || orderData.state === 'LOCKED';

      // 或者检查 payments 数组里是否有成功的支付
      // 🟢 修复: 给 p 指定类型，或者通过接口自动推断
      const hasSuccessPayment =
        Array.isArray(orderData.payments) &&
        orderData.payments.some(
          (p) => p.result === 'SUCCESS' || p.result === 'APPROVED',
        );

      // 🟢 修复: 明确返回 boolean
      return !!(isPaid || hasSuccessPayment);
    } catch (error) {
      this.logger.error(`verifyOrderPaid error: ${errToString(error)}`);
      return false;
    }
  }

  /**
   * 通过 Payment ID 查询 Order ID
   */
  async getOrderIdByPaymentId(paymentId: string): Promise<string | null> {
    if (!paymentId || !this.apiToken || !this.merchantId) {
      return null;
    }
    // 使用 Payments API
    const url = `${this.apiBase}/v3/merchants/${this.merchantId}/payments/${paymentId}`;
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiToken}`,
        },
      });

      if (!resp.ok) {
        this.logger.warn(`getOrderIdByPaymentId failed: ${resp.status}`);
        return null;
      }

      const data = (await resp.json()) as { order?: { id: string } };
      return data.order?.id ?? null;
    } catch (error) {
      this.logger.error(
        `getOrderIdByPaymentId exception: ${errToString(error)}`,
      );
      return null;
    }
  }

  /**
   * 通过 Payment ID 验证订单支付，并返回 Order ID
   */
  async verifyOrderId(
    paymentId: string,
  ): Promise<{ verified: boolean; orderId?: string | null }> {
    if (!paymentId) {
      return { verified: false, orderId: null };
    }

    const orderId = await this.getOrderIdByPaymentId(paymentId);
    if (!orderId) {
      return { verified: false, orderId: null };
    }

    const verified = await this.verifyOrderPaid(orderId);
    return { verified, orderId };
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

    const body = {
      amount: params.amountCents,
      currency: params.currency,
      orderId: params.orderId,
      source: params.source,
      sourceType: params.sourceType,
      cardholderName: params.cardholderName,
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

  /**
   * Create Hosted Checkout with redirectUrls to your thank-you page.
   * success: {WEB_BASE_URL}/{locale}/thank-you/{orderId}
   * failure: {WEB_BASE_URL}/{locale}/payment-failed/{orderId}
   */
  async createHostedCheckout(
    req: HostedCheckoutRequest,
  ): Promise<HostedCheckoutResult> {
    try {
      if (!this.privateKey) {
        return { ok: false, reason: 'missing-private-key' };
      }
      if (!this.merchantId) {
        return { ok: false, reason: 'missing-merchant-id' };
      }
      const url = `${this.apiBase}/invoicingcheckoutservice/v1/checkouts`;

      // redirect URLs
      const webBase = (process.env.WEB_BASE_URL || '').replace(/\/+$/, '');

      // 从 req / metadata / returnUrl 里推导 locale
      const rq = req as Record<string, unknown>;
      const metaLocale = isPlainObject(rq.metadata)
        ? rq.metadata.locale
        : undefined;

      const locale: Locale = normalizeLocale(
        rq.locale ?? metaLocale ?? extractLocaleFromUrl(rq.returnUrl),
      );

      const orderId = pickOrderId(req);

      const successUrl = `${webBase}/${locale}/thank-you/${encodeURIComponent(
        orderId,
      )}`;
      const failureUrl = `${webBase}/${locale}/payment-failed/${encodeURIComponent(
        orderId,
      )}`;

      // ===== build lineItems with fallback =====
      const noteFallback = (() => {
        const n = rq.note;
        return typeof n === 'string' && n.trim() ? n : undefined;
      })();

      const fallbackName =
        typeof rq.description === 'string' && rq.description.trim()
          ? rq.description.trim()
          : typeof rq.referenceId === 'string' && rq.referenceId.trim()
            ? rq.referenceId.trim()
            : 'Online order';

      const fallbackAmount =
        typeof rq.amountCents === 'number'
          ? rq.amountCents
          : typeof rq.priceCents === 'number'
            ? rq.priceCents
            : typeof rq.price === 'number'
              ? rq.price
              : typeof rq.amount === 'number'
                ? rq.amount
                : 0;

      const src: Array<Record<string, unknown>> =
        Array.isArray(req.lineItems) && req.lineItems.length > 0
          ? (req.lineItems as Array<Record<string, unknown>>)
          : [
              {
                name: fallbackName,
                amountCents: fallbackAmount,
                quantity: 1,
                note: noteFallback,
              } as Record<string, unknown>,
            ];

      type OutLineItem = {
        name: string;
        price: number; // cents
        unitQty: number;
        note?: string;
        description?: string;
        referenceId?: string;
      };

      const lineItems: OutLineItem[] = src.reduce<OutLineItem[]>((acc, it) => {
        // name
        const rawName = it?.name;
        const name =
          typeof rawName === 'string' && rawName.trim()
            ? rawName.trim()
            : 'Item';

        // amount in cents: accept several aliases
        let amount = Number.NaN;
        if (typeof it?.amountCents === 'number') amount = it.amountCents;
        else if (typeof it?.priceCents === 'number') amount = it.priceCents;
        else if (typeof it?.price === 'number') amount = it.price;
        else if (typeof it?.amount === 'number') amount = it.amount;

        if (!Number.isFinite(amount)) return acc;

        // quantity
        const qtyRaw = it?.quantity;
        const unitQty = typeof qtyRaw === 'number' && qtyRaw > 0 ? qtyRaw : 1;

        // optionals
        const note =
          typeof it?.note === 'string' && it.note.trim()
            ? it.note
            : noteFallback;

        const description =
          typeof it?.description === 'string' && it.description.trim()
            ? it.description
            : undefined;

        const referenceId =
          typeof it?.referenceId === 'string' && it.referenceId.trim()
            ? it.referenceId
            : undefined;

        acc.push({
          name,
          price: Math.round(amount),
          unitQty,
          ...(note ? { note } : {}),
          ...(description ? { description } : {}),
          ...(referenceId ? { referenceId } : {}),
        });
        return acc;
      }, []);

      // ===== request body =====
      const metaCustomer =
        isPlainObject(rq.metadata) && isPlainObject(rq.metadata.customer)
          ? rq.metadata.customer
          : undefined;

      const reqCustomer = isPlainObject(req.customer)
        ? req.customer
        : undefined;

      const pickStr = (v: unknown): string | undefined =>
        typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;

      const firstName =
        pickStr(metaCustomer?.firstName) ??
        pickStr(reqCustomer?.firstName) ??
        pickStr(rq?.firstName);

      const lastName =
        pickStr(metaCustomer?.lastName) ??
        pickStr(reqCustomer?.lastName) ??
        pickStr(rq?.lastName);

      const email =
        pickStr(metaCustomer?.email) ??
        pickStr(reqCustomer?.email) ??
        pickStr(rq?.email) ??
        (isPlainObject(rq.metadata) ? pickStr(rq.metadata.email) : undefined);

      const phone =
        pickStr(metaCustomer?.phone) ??
        pickStr(reqCustomer?.phone) ??
        pickStr(rq?.phone) ??
        (isPlainObject(rq.metadata) ? pickStr(rq.metadata.phone) : undefined);

      if (!firstName || !lastName || !email) {
        throw new BadRequestException(
          'customer firstName, lastName, and email are required',
        );
      }

      // ✅ 生产排查（不泄露内容）：只打“是否存在”
      this.logger.log(
        `[HCO] customer-present first=${!!firstName} last=${!!lastName} email=${!!email} phone=${!!phone}`,
      );

      const body = {
        customer: {
          firstName,
          lastName,
          // email 是 Clover 固定必填；如果这里是 undefined，你一定会遇到各种奇怪的支付错误
          email,
          ...(phone ? { phoneNumber: phone } : {}),
        },
        shoppingCart: {
          lineItems,
        },
        redirectUrls: {
          success: successUrl,
          failure: failureUrl,
        },
        ...(isPlainObject(rq.metadata) ? { metadata: rq.metadata } : {}),
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Clover-Merchant-Id': this.merchantId,
          Authorization: `Bearer ${this.privateKey}`,
        },
        body: JSON.stringify(body),
      });

      const rawText = await resp.text();

      // parse body (may be non-JSON)
      let parsedUnknown: unknown = undefined;
      try {
        parsedUnknown = rawText ? JSON.parse(rawText) : undefined;
      } catch {
        // non-JSON, keep as undefined
      }

      const apiData: HostedCheckoutApiResponse | undefined =
        isHostedCheckoutApiResponse(parsedUnknown) ? parsedUnknown : undefined;

      if (!resp.ok) {
        const preview = rawText.slice(0, 200);

        if (parsedUnknown === undefined && rawText) {
          this.logger.warn(
            `createHostedCheckout non-JSON response captured: ${preview}`,
          );
        }

        this.logger.warn(
          `createHostedCheckout failed: status=${resp.status} response captured: ${preview}`,
        );

        // reason prefers API message, falls back to status text then http-<code>
        const fallbackStatus = resp.statusText?.trim()
          ? resp.statusText
          : `http-${resp.status}`;
        let reason = fallbackStatus;
        if (isPlainObject(parsedUnknown)) {
          const m = parsedUnknown.message;
          if (typeof m === 'string' && m.trim()) reason = m;
        }

        return { ok: false, reason };
      }

      // 2xx but missing redirect link
      if (!apiData || !apiData.href || apiData.href.length === 0) {
        return { ok: false, reason: 'missing redirect' };
      }

      // success (no raw in return)
      return {
        ok: true,
        href: apiData.href,
        checkoutSessionId: apiData.checkoutSessionId,
      };
    } catch (e: unknown) {
      const msg = errToString(e);
      this.logger.error(`createHostedCheckout exception: ${msg}`);
      return { ok: false, reason: msg };
    }
  }
}
