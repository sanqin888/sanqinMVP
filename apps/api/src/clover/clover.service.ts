//Users/apple/sanqinMVP/apps/api/src/clover/clover.service.ts
import { Injectable } from '@nestjs/common';

type CloverPaymentCreateResult =
  | { ok: true; paymentId: string; status?: string }
  | {
      ok: false;
      reason: string;
      status?: string;
    };

// ===== Service =====
@Injectable()
export class CloverService {
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
    description?: string;
  }): Promise<CloverPaymentCreateResult> {
    if (!this.apiToken) {
      return { ok: false, reason: 'missing-credentials' };
    }

    const url = `${this.apiBase}/v1/charges`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiToken}`,
        'Idempotency-Key': params.orderId,
      },
      body: JSON.stringify({
        amount: params.amountCents,
        currency: params.currency.toLowerCase(),
        source: params.source,
        description: params.description || `Online Order ${params.orderId}`,
      }),
    });

    const rawText = await resp.text();
    let parsed: Record<string, unknown> | undefined;
    try {
      parsed = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      return { ok: false, reason: rawText };
    }

    if (!resp.ok) {
      const cloverError =
        parsed && typeof parsed.error === 'object'
          ? (parsed.error as Record<string, unknown>)
          : undefined;
      const reason =
        (cloverError && typeof cloverError.message === 'string'
          ? cloverError.message
          : undefined) ||
        (cloverError && typeof cloverError.decline_code === 'string'
          ? cloverError.decline_code
          : undefined) ||
        rawText;
      return { ok: false, reason };
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
}
