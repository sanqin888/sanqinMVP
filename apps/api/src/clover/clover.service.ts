// apps/api/src/clover/clover.service.ts
import { Injectable, Logger } from '@nestjs/common';

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

  /**
   * Simulate an online payment and (optionally) mark order as paid.
   * Purely local logic; no network calls here to keep types strictly safe.
   */
  public async simulateOnlinePayment(payload: SimulateOnlinePaymentPayload): Promise<PaymentSimulation> {
    const { orderId, result = 'SUCCESS' } = payload;

    if (!orderId) {
      return { ok: false, markedPaid: false, reason: 'Missing orderId' };
    }

    if (result !== 'SUCCESS') {
      this.logger.warn(`Simulated payment FAILURE for order ${orderId}`);
      return { ok: false, markedPaid: false, reason: 'Simulated FAILURE' };
    }

    // In a real impl, you might look up the order in db and mark paid.
    // Here just log and return typed result to avoid any/unknown leakage.
    this.logger.log(`Simulated payment SUCCESS for order ${orderId}`);
    return { ok: true, markedPaid: true };
  }
}
