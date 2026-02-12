import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export type OrderPaidVerifiedPayload = {
  orderId: string;
  pickupTime?: string;
  userId?: string;
  amountCents?: number;
  redeemValueCents?: number;
};

export type OrderAcceptedPayload = {
  orderId: string;
  stableId: string;
};

type OrderPaidListener = (
  payload: OrderPaidVerifiedPayload,
) => Promise<void> | void;

type OrderAcceptedListener = (
  payload: OrderAcceptedPayload,
) => Promise<void> | void;

@Injectable()
export class OrderEventsBus {
  private readonly emitter = new EventEmitter();
  private readonly paidListeners = new Map<
    OrderPaidListener,
    (...args: unknown[]) => void
  >();
  private readonly acceptedListeners = new Map<
    OrderAcceptedListener,
    (...args: unknown[]) => void
  >();

  emitOrderPaidVerified(payload: OrderPaidVerifiedPayload): void {
    this.emitter.emit('order.paid.verified', payload);
  }

  emitOrderAccepted(payload: OrderAcceptedPayload): void {
    this.emitter.emit('order.accepted', payload);
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

  onOrderAccepted(listener: OrderAcceptedListener): void {
    const wrapped = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      void listener(payload as OrderAcceptedPayload);
    };
    this.acceptedListeners.set(listener, wrapped);
    this.emitter.on('order.accepted', wrapped);
  }

  offOrderAccepted(listener: OrderAcceptedListener): void {
    const wrapped = this.acceptedListeners.get(listener);
    if (!wrapped) return;
    this.emitter.off('order.accepted', wrapped);
    this.acceptedListeners.delete(listener);
  }
}
