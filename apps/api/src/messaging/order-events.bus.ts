import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export type OrderPaidVerifiedPayload = {
  orderId: string;
  pickupTime?: string;
  userId?: string;
  amountCents?: number;
  redeemValueCents?: number;
};

/** @deprecated Compatibility name: same-process production starts are prep_started. */
export type OrderAcceptedPayload = {
  orderId: string;
  stableId: string;
};

export type OrderPrepStartedPayload = OrderAcceptedPayload;

type OrderPaidListener = (
  payload: OrderPaidVerifiedPayload,
) => Promise<void> | void;

type OrderAcceptedListener = (
  payload: OrderAcceptedPayload,
) => Promise<void> | void;

type OrderPrepStartedListener = (
  payload: OrderPrepStartedPayload,
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
  private readonly prepStartedListeners = new Map<
    OrderPrepStartedListener,
    (...args: unknown[]) => void
  >();

  emitOrderPaidVerified(payload: OrderPaidVerifiedPayload): void {
    this.emitter.emit('order.paid.verified', payload);
  }

  /**
   * Compatibility facade for existing POS/Web callers that invoke this only
   * after status has entered making. The actual in-process event is prep_started.
   */
  emitOrderAccepted(payload: OrderAcceptedPayload): void {
    this.emitter.emit('order.prep_started', payload);
  }

  emitOrderPrepStarted(payload: OrderPrepStartedPayload): void {
    this.emitter.emit('order.prep_started', payload);
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

  /** @deprecated Subscribe to the prep_started channel for legacy processors. */
  onOrderAccepted(listener: OrderAcceptedListener): void {
    const wrapped = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      void listener(payload as OrderAcceptedPayload);
    };
    this.acceptedListeners.set(listener, wrapped);
    this.emitter.on('order.prep_started', wrapped);
  }

  offOrderAccepted(listener: OrderAcceptedListener): void {
    const wrapped = this.acceptedListeners.get(listener);
    if (!wrapped) return;
    this.emitter.off('order.prep_started', wrapped);
    this.acceptedListeners.delete(listener);
  }

  onOrderPrepStarted(listener: OrderPrepStartedListener): void {
    const wrapped = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      void listener(payload as OrderPrepStartedPayload);
    };
    this.prepStartedListeners.set(listener, wrapped);
    this.emitter.on('order.prep_started', wrapped);
  }

  offOrderPrepStarted(listener: OrderPrepStartedListener): void {
    const wrapped = this.prepStartedListeners.get(listener);
    if (!wrapped) return;
    this.emitter.off('order.prep_started', wrapped);
    this.prepStartedListeners.delete(listener);
  }
}
