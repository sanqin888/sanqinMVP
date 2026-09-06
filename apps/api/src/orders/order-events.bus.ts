import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export type OrderPaidVerifiedPayload = {
  orderId: string;
  pickupTime?: string;
  userId?: string;
  amountCents?: number;
  redeemValueCents?: number;
};

type OrderPaidListener = (
  payload: OrderPaidVerifiedPayload,
) => Promise<void> | void;

/** Private same-process bus retained only for the Uber Direct paid-order fast path. */
@Injectable()
export class OrderEventsBus {
  private readonly emitter = new EventEmitter();
  private readonly paidListeners = new Map<
    OrderPaidListener,
    (...args: unknown[]) => void
  >();

  emitOrderPaidVerified(payload: OrderPaidVerifiedPayload): void {
    this.emitter.emit('order.paid.verified', payload);
  }

  onOrderPaidVerified(listener: OrderPaidListener): void {
    const wrapped = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      void listener(payload as OrderPaidVerifiedPayload);
    };
    this.paidListeners.set(listener, wrapped);
    this.emitter.on('order.paid.verified', wrapped);
  }

  offOrderPaidVerified(listener: OrderPaidListener): void {
    const wrapped = this.paidListeners.get(listener);
    if (!wrapped) return;
    this.emitter.off('order.paid.verified', wrapped);
    this.paidListeners.delete(listener);
  }
}
