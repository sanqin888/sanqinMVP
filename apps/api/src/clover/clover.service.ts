import { Injectable, Logger } from '@nestjs/common';

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
  private readonly privateKey: string | undefined;

  private readonly taxId: string | undefined;
  private readonly taxName: string | undefined;
  private readonly taxRateInt: number | undefined; // millionths (0.13 -> 1300000)

  constructor() {
    this.apiBase =
      (process.env.CLOVER_BASE && process.env.CLOVER_BASE.trim()) ||
      'https://apisandbox.dev.clover.com';

    this.merchantId = process.env.CLOVER_MERCHANT_ID?.trim();
    this.privateKey = process.env.CLOVER_PRIVATE_TOKEN?.trim();

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

  private interpretStatus(value: unknown, depth = 0): boolean | undefined {
    if (depth > 5) return undefined;
    const normalized = this.normalizeStatus(value);
    if (normalized) {
      if (
        normalized.includes('SUCCESS') ||
        normalized.includes('SUCCEEDED') ||
        normalized.includes('PAID') ||
        normalized.includes('COMPLETE') ||
        normalized.includes('SETTLED') ||
        normalized.includes('APPROVED')
      ) {
        return true;
      }
      if (
        normalized.includes('FAIL') ||
        normalized.includes('DECLIN') ||
        normalized.includes('ERROR') ||
        normalized.includes('CANCEL') ||
        normalized.includes('VOID') ||
        normalized.includes('REJECT')
      ) {
        return false;
      }
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        const verdict = this.interpretStatus(entry, depth + 1);
        if (typeof verdict === 'boolean') return verdict;
      }
      return undefined;
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const prioritizedKeys = [
        'state',
        'status',
        'result',
        'paymentState',
        'paymentStatus',
        'checkoutState',
        'checkoutStatus',
        'lifecycleState',
      ];

      for (const key of prioritizedKeys) {
        if (!(key in record)) continue;
        const verdict = this.interpretStatus(record[key], depth + 1);
        if (typeof verdict === 'boolean') return verdict;
      }

      for (const [, nested] of Object.entries(record)) {
        const verdict = this.interpretStatus(nested, depth + 1);
        if (typeof verdict === 'boolean') return verdict;
      }
    }

    return undefined;
  }

  private isCheckoutPaid(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object') return false;
    const verdict = this.interpretStatus(payload);
    return verdict === true;
  }

  async verifyHostedCheckoutPaid(checkoutSessionId: string): Promise<boolean> {
    if (!checkoutSessionId) {
      this.logger.warn(
        'verifyHostedCheckoutPaid called without checkoutSessionId',
      );
      return false;
    }
    if (!this.privateKey || !this.merchantId) {
      this.logger.error(
        'Cannot verify checkout payment: missing Clover credentials',
      );
      return false;
    }

    const url = `${this.apiBase}/invoicingcheckoutservice/v1/checkouts/${encodeURIComponent(checkoutSessionId)}`;
    this.logger.log(`verifyHostedCheckoutPaid -> GET ${url}`);

    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Clover-Merchant-Id': this.merchantId,
          Authorization: `Bearer ${this.privateKey}`,
        },
      });

      const rawText = await resp.text();
      let parsed: unknown;
      try {
        parsed = rawText ? JSON.parse(rawText) : undefined;
      } catch {
        parsed = undefined;
      }

      if (!resp.ok) {
        const preview = rawText.slice(0, 200);
        this.logger.warn(
          `verifyHostedCheckoutPaid failed: status=${resp.status} response=${preview}`,
        );
        return false;
      }

      const paid = this.isCheckoutPaid(parsed);
      if (!paid) {
        this.logger.log(
          `verifyHostedCheckoutPaid indicates checkout ${checkoutSessionId} is not settled yet`,
        );
      }
      return paid;
    } catch (error) {
      this.logger.error(
        `verifyHostedCheckoutPaid exception for ${checkoutSessionId}: ${errToString(error)}`,
      );
      return false;
    }
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
      if (!this.privateKey) return { ok: false, reason: 'missing-private-key' };
      if (!this.merchantId) return { ok: false, reason: 'missing-merchant-id' };
      if (!this.taxId || !this.taxRateInt) {
        return { ok: false, reason: 'missing-tax-config' };
      }

      const url = `${this.apiBase}/invoicingcheckoutservice/v1/checkouts`;

      // redirect URLs
      const webBase = (process.env.WEB_BASE_URL || '').replace(/\/+$/, '');

      // 👇 提前拿到 rq，按优先级归一化 locale：req.locale → metadata.locale → returnUrl 路径
      const rq = req as Record<string, unknown>;
      const metaLocale = isPlainObject(rq.metadata)
        ? rq.metadata.locale
        : undefined;

      const locale: Locale = normalizeLocale(
        rq.locale ?? metaLocale ?? extractLocaleFromUrl(rq.returnUrl),
      );

      const orderId = pickOrderId(req);

      const successUrl = `${webBase}/${locale}/thank-you/${encodeURIComponent(orderId)}`;
      const failureUrl = `${webBase}/${locale}/payment-failed/${encodeURIComponent(orderId)}`;

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
      const body = {
        customer: isPlainObject(req.customer) ? req.customer : {},
        shoppingCart: {
          lineItems,
          defaultTaxRates: [
            { id: this.taxId, name: this.taxName, rate: this.taxRateInt },
          ],
        },
        redirectUrls: {
          success: successUrl,
          failure: failureUrl,
        },
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
      if (
        !apiData ||
        typeof apiData.href !== 'string' ||
        apiData.href.length === 0
      ) {
        return { ok: false, reason: 'missing redirect' };
      }

      // success (no raw in return)
      const data = apiData;
      return {
        ok: true,
        href: data.href,
        checkoutSessionId: data.checkoutSessionId,
      };
    } catch (e: unknown) {
      const msg = errToString(e);
      this.logger.error(`createHostedCheckout exception: ${msg}`);
      return { ok: false, reason: msg };
    }
  }
}
