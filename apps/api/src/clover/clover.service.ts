// apps/api/src/clover/clover.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';

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
}
