import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export type OrderPaidVerifiedPayload = {
  orderId: string;
  pickupTime?: string;
  userId?: string;
};

type OrderPaidListener = (
  payload: OrderPaidVerifiedPayload,
) => Promise<void> | void;

@Injectable()
export class OrderEventsBus {
  private readonly emitter = new EventEmitter();
  private readonly wrappedListeners = new Map<
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
    this.wrappedListeners.set(listener, wrapped);
    this.emitter.on('order.paid.verified', wrapped);
  }

  offOrderPaidVerified(listener: OrderPaidListener): void {
    const wrapped = this.wrappedListeners.get(listener);
    if (!wrapped) return;
    this.emitter.off('order.paid.verified', wrapped);
    this.wrappedListeners.delete(listener);
  }
}
