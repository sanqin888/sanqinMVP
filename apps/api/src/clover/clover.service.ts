import { Injectable, HttpException } from "@nestjs/common";

type HostedCheckoutCreateInput = {
  amountCents?: number;
  currency?: "CAD" | "USD";
  referenceId?: string;
  description?: string;
  returnUrl?: string;
  metadata?: {
    locale?: string;
    fulfillment?: "pickup" | "delivery";
    schedule?: string;
    customer?: { name?: string; phone?: string; address?: string };
    items: { id: string; name: string; quantity: number; price: number; notes?: string }[];
    subtotal?: number;
    serviceFee?: number;
    deliveryFee?: number;

    // ✅ 新增：前端传来的税额与税率（可选）
    tax?: number;
    taxRate?: number;
  };
};

@Injectable()
export class CloverService {
  private readonly base = process.env.CLOVER_API_BASE ?? "https://apisandbox.dev.clover.com";
  private readonly merchantId = process.env.CLOVER_MERCHANT_ID!;
  private readonly privateKey = process.env.CLOVER_PRIVATE_KEY!;

  private get headers() {
    return {
      accept: "application/json",
      "content-type": "application/json",
      "X-Clover-Merchant-Id": this.merchantId,
      authorization: `Bearer ${this.privateKey}`,
    };
  }

  /**
   * 创建 Hosted Checkout 会话并返回跳转链接
   * 文档：/invoicingcheckoutservice/v1/checkouts（返回 href 和 checkoutSessionId）
   */
  async createHostedCheckout(input: HostedCheckoutCreateInput) {
    if (!this.merchantId || !this.privateKey) {
      throw new HttpException("Clover credentials are missing on server", 500);
    }

    const items = input.metadata?.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      throw new HttpException("No items provided for Hosted Checkout", 400);
    }

    // 组装 lineItems（价格单位为“分”）

const itemLines = items.map((it) => ({
  name: it.name || "Item",
  price: Math.round(it.price * 100), // 元->分
  unitQty: Math.max(1, Math.floor(it.quantity || 1)),
  note: [input.referenceId, input.description, it.notes].filter(Boolean).join(" | "),
}));

const extraLines: Array<{ name: string; price: number; unitQty: number }> = [];

// 打包费（你现在为 0 则不会加入）
if (input.metadata?.serviceFee && input.metadata.serviceFee > 0) {
  extraLines.push({
    name: input.metadata?.locale === "zh" ? "打包服务费" : "Packaging fee",
    price: Math.round(input.metadata.serviceFee * 100),
    unitQty: 1,
  });
}

// 配送费
if (input.metadata?.deliveryFee && input.metadata.deliveryFee > 0) {
  extraLines.push({
    name: input.metadata?.locale === "zh" ? "配送费" : "Delivery fee",
    price: Math.round(input.metadata.deliveryFee * 100),
    unitQty: 1,
  });
}

// 税费（优先用前端传来的 tax；没有则用后端 SALES_TAX_RATE 兜底）
const DEFAULT_TAX_RATE = Number.parseFloat(process.env.SALES_TAX_RATE ?? "0");
const hasTaxFromClient = typeof input.metadata?.tax === "number";

let taxValue = 0;
if (hasTaxFromClient) {
  taxValue = Math.max(0, input.metadata!.tax!);
} else if (DEFAULT_TAX_RATE > 0) {
  const itemsTotal = items.reduce((s, it) => s + it.price * (it.quantity || 1), 0);
  const feeBase = (input.metadata?.serviceFee || 0) + (input.metadata?.deliveryFee || 0);
  taxValue = Math.round((itemsTotal + feeBase) * DEFAULT_TAX_RATE * 100) / 100;
}

if (taxValue > 0) {
  extraLines.push({
    name: input.metadata?.locale === "zh" ? "税费（HST）" : "Tax (HST)",
    price: Math.round(taxValue * 100),
    unitQty: 1,
  });
}

const lineItems = [...itemLines, ...extraLines];

    // 客户信息（HCO 可空；若启用“收集客户信息”功能，传 firstName/lastName/email 等）
    const [firstName, ...lastParts] = (input?.metadata?.customer?.name || "").trim().split(/\s+/);
    const lastName = lastParts.join(" ");
    const customer =
      firstName || lastName || input?.metadata?.customer?.phone
        ? {
            firstName: firstName || undefined,
            lastName: lastName || undefined,
            phoneNumber: input?.metadata?.customer?.phone || undefined,
          }
        : {}; // 空对象也合法（见文档）

    const body: any = {
      customer,
      shoppingCart: { lineItems },
    };

    // 可选：支付完成后的跳转（注意 Clover 要求 HTTPS）
    if (input.returnUrl?.startsWith("https://")) {
      body.redirectUrls = {
        success: input.returnUrl,
        failure: input.returnUrl,
      };
    }

    const url = `${this.base}/hosted-checkout-service/v1/checkouts`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let json: any = {};
    try { json = text ? JSON.parse(text) : {}; } catch {}

    if (!res.ok) {
      // 将 Clover 的错误透出一点，便于你在 Network 面板排查
      const msg = json?.message || json?.error || `${res.status} ${res.statusText}`;
      throw new HttpException(`Clover HCO create failed: ${msg}`, res.status);
    }

    // 期待得到 href（跳转 URL）与 checkoutSessionId
    const href: string | undefined = json?.href;
    const checkoutId: string | undefined = json?.checkoutSessionId;

    if (!href) {
      throw new HttpException("Clover HCO: response missing href", 502);
    }

    return { checkoutUrl: href, checkoutId };
  }
}
