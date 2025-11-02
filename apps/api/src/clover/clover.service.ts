import { Injectable, Logger } from '@nestjs/common';
import { CreateHostedCheckoutDto as HostedCheckoutRequest } from './dto/create-hosted-checkout.dto';

// ==== Types ====
type HostedCheckoutResult =
  | { ok: true; href: string; checkoutSessionId: string }
  | { ok: false; reason: string };

interface HostedCheckoutApiResponse {
  href?: string;
  checkoutSessionId?: string;
  message?: string;
  error?: string | { message?: string };
}

interface InLineItem {
  name?: unknown;
  title?: unknown;
  note?: unknown;
  price?: unknown; // cents
  priceCents?: unknown; // cents
  amountCents?: unknown; // cents
  unitQty?: unknown;
  qty?: unknown;
  quantity?: unknown;
  type?: unknown;
}

interface OutLineItem {
  name: string;
  price: number; // cents
  unitQty: number;
  note?: string;
  taxRates?: Array<{ id: string; name: string; rate: number }>;
}

// 仅在运行时可选读取这些字段，不改变你的正式 DTO
type ExtRequest = HostedCheckoutRequest & {
  lineItems?: InLineItem[];
  description?: unknown;
  referenceId?: unknown;
  amountCents?: unknown;
  customer?: unknown;
  note?: unknown;
};

// ==== Safe helpers ====
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function asString(v: unknown): string | undefined {
  if (typeof v === 'string') {
    const s = v.trim();
    return s.length ? s : undefined;
  }
  if (
    typeof v === 'number' ||
    typeof v === 'bigint' ||
    typeof v === 'boolean'
  ) {
    return String(v);
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString();
  }
  return undefined; // 不对对象/函数做 base-to-string
}
function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return undefined;
}
function asPositiveInt(v: unknown, fallback = 1): number {
  const n = asNumber(v);
  if (n === undefined) return fallback;
  const i = Math.floor(n);
  return i > 0 ? i : fallback;
}
function readNote(v: unknown): string {
  const s = asString(v);
  return s ?? '';
}
function errToString(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    const j = JSON.stringify(e);
    return j ?? Object.prototype.toString.call(e);
  } catch {
    return Object.prototype.toString.call(e);
  }
}
function isHostedCheckoutApiResponse(
  v: unknown,
): v is HostedCheckoutApiResponse {
  return isObject(v);
}

@Injectable()
export class CloverService {
  private readonly logger = new Logger(CloverService.name);

  // 环境域名
  private readonly apiBase =
    (process.env.CLOVER_ENV || 'sandbox').toLowerCase() === 'production'
      ? 'https://api.clover.com'
      : 'https://apisandbox.dev.clover.com';

  // 关键 env
  private readonly merchantId = (process.env.CLOVER_MERCHANT_ID || '').trim();
  private readonly privateKey = (process.env.CLOVER_PRIVATE_TOKEN || '').trim();

  // 税配置（由 Clover 计算税）
  private readonly taxId = (process.env.CLOVER_TAX_ID || '').trim();
  private readonly taxName = (process.env.SALES_TAX_NAME || 'HST').trim();
  private readonly taxRateInt = (() => {
    const raw = process.env.SALES_TAX_RATE;
    if (!raw) return 0;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const f = n > 1 ? n / 100 : n; // 13 -> 0.13
    return Math.round(f * 10_000_000); // 10% -> 1_000_000
  })();

  // 含税→税前反算（前端若传含税价时开启）
  private readonly pricesIncludeTax = /^(1|true|yes)$/i.test(
    (process.env.PRICES_INCLUDE_TAX || '').trim(),
  );
  private preTaxCents(grossCents: number): number {
    if (this.pricesIncludeTax && this.taxRateInt > 0) {
      return Math.round(grossCents / (1 + this.taxRateInt / 10_000_000));
    }
    return Math.round(grossCents);
  }

  private pickGrossCents(li: InLineItem): number {
    const c =
      asNumber(li.price) ??
      asNumber(li.priceCents) ??
      asNumber(li.amountCents) ??
      0;
    return Math.round(c);
  }

  private normalizeLineItem(
    li: InLineItem,
    req: ExtRequest,
    idx: number,
  ): OutLineItem {
    // 先把候选名聚合成可空字符串，再用 ?? 收敛为 string
    const nameCandidate: string | undefined =
      asString(li.name) ||
      asString(li.title) ||
      asString(req.description) ||
      asString(req.referenceId);

    const name: string = nameCandidate ?? `Item ${idx + 1}`;

    const price: number = this.preTaxCents(this.pickGrossCents(li));
    const unitQty: number = asPositiveInt(
      li.unitQty ?? li.qty ?? li.quantity,
      1,
    );
    const note: string = readNote(li.note);

    // 显式构造 OutLineItem，避免 any 推断
    const ret: OutLineItem = { name, price, unitQty, note };
    return ret;
  }
  async createHostedCheckout(
    req: HostedCheckoutRequest,
  ): Promise<HostedCheckoutResult> {
    try {
      if (!this.privateKey) return { ok: false, reason: 'missing-private-key' };
      if (!this.merchantId) return { ok: false, reason: 'missing-merchant-id' };
      if (!this.taxId || !this.taxRateInt)
        return { ok: false, reason: 'missing-tax-config' };

      const url = `${this.apiBase}/invoicingcheckoutservice/v1/checkouts`;
      const r = req as ExtRequest;

      const noteFallback = readNote((r as { note?: unknown }).note);

      // 原始 items：为空则退化为单条整单
      const src: InLineItem[] =
        Array.isArray(r.lineItems) && r.lineItems.length > 0
          ? r.lineItems
          : [
              {
                name:
                  asString(r.description) ??
                  asString(r.referenceId) ??
                  'Online order',
                price: asNumber(r.amountCents) ?? 0,
                unitQty: 1,
                note: noteFallback,
              },
            ];

      // 清洗 -> 规范化 -> 最终确保类型
      const cleaned: OutLineItem[] = src
        .filter((li) => isObject(li))
        .filter((li) => {
          const t = asString((li as InLineItem).type)?.toLowerCase();
          return t !== 'tax' && t !== 'fee' && t !== 'service_charge';
        })
        .map((li, i) => this.normalizeLineItem(li as InLineItem, r, i))
        .map((li, i) => {
          const name: string = asString(li.name) ?? `Item ${i + 1}`;
          const price: number = Math.max(0, Math.round(li.price));
          const unitQty: number = asPositiveInt(li.unitQty, 1);
          const note: string = readNote(li.note);
          const out: OutLineItem = { name, price, unitQty, note };
          return out;
        });

      if (cleaned.length === 0) return { ok: false, reason: 'no-line-items' };

      // 行项目挂税（id + name + rate）
      const lineItems: OutLineItem[] = cleaned.map((li) => ({
        ...li,
        taxRates: [
          { id: this.taxId, name: this.taxName, rate: this.taxRateInt },
        ],
      }));

      // 购物车层级默认税（双保险）
      const body: {
        customer: Record<string, unknown>;
        shoppingCart: {
          lineItems: OutLineItem[];
          defaultTaxRates: Array<{ id: string; name: string; rate: number }>;
        };
      } = {
        customer: isObject(r.customer) ? r.customer : {},
        shoppingCart: {
          lineItems,
          defaultTaxRates: [
            { id: this.taxId, name: this.taxName, rate: this.taxRateInt },
          ],
        },
      };

      this.logger.log(
        `HCO: items=${lineItems.length}, includeTax=${this.pricesIncludeTax}, taxRateInt=${this.taxRateInt}, usingTaxId=${this.taxId}, taxName=${this.taxName}; ` +
          `itemsPreview=${JSON.stringify(
            lineItems.map((x) => ({
              name: x.name,
              price: x.price,
              unitQty: x.unitQty,
              hasTax: !!x.taxRates,
            })),
          )}`,
      );

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.privateKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Clover-Merchant-Id': this.merchantId,
        },
        body: JSON.stringify(body),
      });

      const rawText = await resp.text();
      let data: HostedCheckoutApiResponse | undefined;
      try {
        const parsed: unknown = rawText ? JSON.parse(rawText) : undefined;
        if (isHostedCheckoutApiResponse(parsed)) data = parsed;
      } catch (e: unknown) {
        this.logger.warn(
          `createHostedCheckout non-JSON response captured: ${errToString(e)}`,
        );
      }

      if (!resp.ok) {
        const reason =
          (typeof data?.error === 'string'
            ? data.error
            : data?.error &&
                isObject(data.error) &&
                typeof (data.error as { message?: unknown }).message ===
                  'string'
              ? String((data.error as { message?: unknown }).message)
              : undefined) ||
          data?.message ||
          resp.statusText ||
          (resp.status ? `http-${resp.status}` : 'request-failed');

        this.logger.warn(
          `createHostedCheckout failed: status=${resp.status} env=${process.env.CLOVER_ENV} base=${this.apiBase} mid=****${this.merchantId.slice(
            -4,
          )} reason=${reason}`,
        );
        return { ok: false, reason };
      }

      if (!data?.href || !data?.checkoutSessionId) {
        return { ok: false, reason: 'missing-fields' };
      }
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
