// apps/api/src/clover/clover.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import { CreateHostedCheckoutDto } from './dto/create-hosted-checkout.dto';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export type SimResult = 'SUCCESS' | 'FAILURE';

export interface SimulateOnlinePaymentPayload {
  orderId: string;
  result?: SimResult;
}

export interface PaymentSimulation {
  ok: boolean;
  markedPaid: boolean;
  reason?: string;
}

@Injectable()
export class CloverService {
  private readonly logger = new Logger(CloverService.name);

  constructor(private readonly orders: OrdersService) {}

  /**
   * Simulate an online payment and (optionally) mark order as paid.
   * Purely local logic; no network calls here to keep types strictly safe.
   */
  public async simulateOnlinePayment(
    payload: SimulateOnlinePaymentPayload,
  ): Promise<PaymentSimulation> {
    const { orderId, result = 'SUCCESS' } = payload;

    if (!orderId) {
      return Promise.resolve({
        ok: false,
        markedPaid: false,
        reason: 'Missing orderId',
      });
    }

    if (result !== 'SUCCESS') {
      this.logger.warn(`Simulated payment FAILURE for order ${orderId}`);
      return Promise.resolve({
        ok: false,
        markedPaid: false,
        reason: 'Simulated FAILURE',
      });
    }

    // In a real impl, you might look up the order in db and mark paid.
    // Here just log and return typed result to avoid any/unknown leakage.
    this.logger.log(`Simulated payment SUCCESS for order ${orderId}`);

    try {
      let order = await this.orders.advance(orderId);

      // pending -> paid (advance once), then paid -> making (advance again)
      if (order.status === 'paid') {
        order = await this.orders.advance(orderId);
      }

      const markedPaid = order.status !== 'pending';
      return { ok: true, markedPaid };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to advance order ${orderId} after simulated payment: ${message}`,
      );
      return {
        ok: false,
        markedPaid: false,
        reason: `Failed to advance order ${orderId}: ${message}`,
      };
    }
  }

  /**
   * Backwards compatible helper matching the previous public API used by the controller.
   */
  public simulateByChargeAndMarkIfSuccess(
    orderId: string,
    result: SimResult = 'SUCCESS',
  ): Promise<PaymentSimulation> {
    return this.simulateOnlinePayment({ orderId, result });
  }

  public async createHostedCheckout(
    dto: CreateHostedCheckoutDto,
  ): Promise<{ checkoutUrl: string; checkoutId?: string }> {
    if (!Number.isFinite(dto.amountCents) || dto.amountCents <= 0) {
      throw new Error('amountCents must be a positive integer');
    }

    const template = process.env.CLOVER_HCO_URL_TEMPLATE;
    if (template) {
      const amount = (dto.amountCents / 100).toFixed(2);
      const checkoutUrl = template
        .replace(/\{amountCents\}/g, String(dto.amountCents))
        .replace(/\{amount\}/g, amount)
        .replace(/\{referenceId\}/g, dto.referenceId ?? '')
        .replace(/\{orderId\}/g, dto.referenceId ?? '');
      return { checkoutUrl };
    }

    const merchantId = process.env.CLOVER_MERCHANT_ID;
    const accessToken = process.env.CLOVER_ACCESS_TOKEN;
    const apiBase = (
      process.env.CLOVER_API_BASE_URL ?? 'https://sandbox.dev.clover.com/v3'
    ).replace(/\/$/, '');

    if (!merchantId || !accessToken) {
      throw new Error(
        'Missing Clover credentials: please configure CLOVER_MERCHANT_ID and CLOVER_ACCESS_TOKEN.',
      );
    }

    const url = `${apiBase}/merchants/${merchantId}/pay/onlinecheckout`;
    const payload: Record<string, unknown> = {
      amount: dto.amountCents,
      currency: dto.currency ?? 'CNY',
      channel: 'WEB',
      metadata: dto.metadata ?? {},
    };

    if (dto.referenceId) payload.externalReferenceId = dto.referenceId;
    if (dto.description) payload.description = dto.description;
    if (dto.returnUrl) {
      payload.redirectUrl = dto.returnUrl;
      payload.returnUrl = dto.returnUrl;
    }
    if (dto.cancelUrl) payload.cancelUrl = dto.cancelUrl;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    let parsed: unknown = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch (error) {
        this.logger.warn(
          `Failed to parse Clover response as JSON: ${(error as Error).message}`,
        );
        parsed = rawText;
      }
    }

    if (!response.ok) {
      const reason =
        typeof parsed === 'string'
          ? parsed
          : isRecord(parsed)
            ? JSON.stringify(parsed)
            : rawText || response.statusText;
      throw new Error(
        `Failed to create Clover hosted checkout: ${response.status} ${reason}`,
      );
    }

    let checkoutUrl: string | undefined;
    let checkoutId: string | undefined;

    if (isRecord(parsed)) {
      const checkout = isRecord(parsed.checkout) ? parsed.checkout : undefined;

      if (typeof parsed.checkoutUrl === 'string') {
        checkoutUrl = parsed.checkoutUrl;
      } else if (typeof parsed.url === 'string') {
        checkoutUrl = parsed.url;
      } else if (checkout && typeof checkout.checkoutPageUrl === 'string') {
        checkoutUrl = checkout.checkoutPageUrl;
      } else if (checkout && typeof checkout.href === 'string') {
        checkoutUrl = checkout.href;
      }

      if (typeof parsed.checkoutId === 'string') {
        checkoutId = parsed.checkoutId;
      } else if (checkout && typeof checkout.id === 'string') {
        checkoutId = checkout.id;
      } else if (typeof parsed.id === 'string') {
        checkoutId = parsed.id;
      }
    }

    if (!checkoutUrl) {
      throw new Error('Clover response missing checkout URL');
    }

    return { checkoutUrl, checkoutId };
  }
}
