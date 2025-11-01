import { Injectable, Logger } from '@nestjs/common';
import { CreateHostedCheckoutDto as HostedCheckoutRequest } from './dto/create-hosted-checkout.dto'; // ✅ 复用 DTO，当作请求类型

interface HostedCheckoutApiResponse {
  redirectUrls?: { href?: string };
  checkoutSessionId?: string;
  message?: string;
  error?: string | { message?: string };
}

export type HostedCheckoutResult =
  | { ok: true; href: string; checkoutSessionId: string }
  | { ok: false; reason: string };

@Injectable()
export class CloverService {
  private readonly logger = new Logger(CloverService.name);
  private readonly apiBase = process.env.CLOVER_API_BASE ?? 'https://api.clover.com';
  private readonly apiKey = process.env.CLOVER_API_KEY ?? '';

  async createHostedCheckout(req: HostedCheckoutRequest): Promise<HostedCheckoutResult> {
    try {
      const url = `${this.apiBase}/v1/hosted-checkout`;

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          currency: req.currency,
          amount: req.amountCents,         // ✅ 与 DTO 字段保持一致
          referenceId: req.referenceId,
          description: req.description,
          returnUrl: req.returnUrl,
          metadata: req.metadata,
        }),
      });

      const data = (await resp.json()) as HostedCheckoutApiResponse;

      if (!resp.ok) {
        const reason =
          (typeof data.error === 'string' ? data.error : data.error?.message) ||
          data.message ||
          'request-failed';
        return { ok: false, reason };
      }

      const href = data.redirectUrls?.href;
      const checkoutSessionId = data.checkoutSessionId;

      if (!href || !checkoutSessionId) {
        const msg =
          (typeof data.error === 'string' ? data.error : data.error?.message) ||
          data.message ||
          'missing-fields';
        return { ok: false, reason: msg };
      }

      return { ok: true, href, checkoutSessionId };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown-error';
      this.logger.error(`createHostedCheckout failed: ${msg}`);
      return { ok: false, reason: msg };
    }
  }
}
