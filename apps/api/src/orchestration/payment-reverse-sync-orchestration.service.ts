import { ConflictException, Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';

import { OrdersService } from '../orders/orders.service';
import type { PaymentReverseSyncResult } from '../payments/application/payment-reverse-sync.service';
import { PosGateway } from '../pos/pos.gateway';
import {
  PaymentCheckoutAttemptService,
  type PreparedPaymentCheckout,
} from './payment-checkout-attempt.service';
import { PosCardPaymentOrchestrationService } from './pos-card-payment-orchestration.service';

export type PaymentReverseSyncOrderAction =
  | 'NONE'
  | 'CHECKOUT_UPDATED'
  | 'CHECKOUT_CANCELLED'
  | 'ORDER_REFUNDED'
  | 'ORDER_ALREADY_REFUNDED'
  | 'PARTIAL_REFUND_REVIEW_REQUIRED'
  | 'PAYMENT_ONLY_NO_CHECKOUT';

export type PaymentReverseSyncOrchestrationResult = {
  action: PaymentReverseSyncOrderAction;
  orderStableId: string | null;
};

export class PaymentReverseSyncRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentReverseSyncRetryableError';
  }
}

@Injectable()
export class PaymentReverseSyncOrchestrationService {
  constructor(
    private readonly checkouts: PaymentCheckoutAttemptService,
    private readonly cardPayments: PosCardPaymentOrchestrationService,
    private readonly orders: OrdersService,
    private readonly posGateway: PosGateway,
  ) {}

  async apply(
    result: PaymentReverseSyncResult,
  ): Promise<PaymentReverseSyncOrchestrationResult> {
    if (!result.payment || result.processingResult === 'CONFLICT') {
      return { action: 'NONE', orderStableId: null };
    }

    const payment = result.payment;
    const snapshot = payment.toSnapshot();
    if (snapshot.source !== 'POS_TERMINAL' || snapshot.operation !== 'SALE') {
      return { action: 'NONE', orderStableId: null };
    }

    if (result.externalReversal === 'NONE') {
      const view = await this.cardPayments.applyReverseSyncedPayment(payment);
      return {
        action: view ? 'CHECKOUT_UPDATED' : 'PAYMENT_ONLY_NO_CHECKOUT',
        orderStableId: view?.orderStableId ?? null,
      };
    }

    let checkout: PreparedPaymentCheckout;
    try {
      checkout = await this.checkouts.findByAttemptId(snapshot.attemptId);
    } catch {
      return { action: 'PAYMENT_ONLY_NO_CHECKOUT', orderStableId: null };
    }

    if (checkout.status === 'FINALIZING') {
      throw new PaymentReverseSyncRetryableError(
        'Payment checkout is finalizing while Clover reports an external reversal; retry after finalization settles.',
      );
    }

    if (checkout.status !== 'COMPLETED') {
      checkout = await this.checkouts.markExternallyReversedAndRelease(
        checkout.attemptId,
      );
      if (checkout.status === 'FINALIZING') {
        throw new PaymentReverseSyncRetryableError(
          'Payment checkout entered finalization while applying an external reversal.',
        );
      }
      if (checkout.status === 'COMPLETED') {
        return this.refundCompletedOrder(result, checkout.orderStableId);
      }

      this.publishCheckoutReversalStatus(result, checkout);
      this.publishReverseSync(
        result,
        checkout.storeId,
        checkout.orderStableId,
        null,
      );
      return {
        action:
          result.externalReversal === 'PARTIAL_REFUND'
            ? 'PARTIAL_REFUND_REVIEW_REQUIRED'
            : 'CHECKOUT_CANCELLED',
        orderStableId: checkout.orderStableId,
      };
    }

    if (result.externalReversal === 'PARTIAL_REFUND') {
      const order = await this.orders.getByStableId(checkout.orderStableId);
      this.publishReverseSync(
        result,
        checkout.storeId,
        checkout.orderStableId,
        order.status,
      );
      return {
        action: 'PARTIAL_REFUND_REVIEW_REQUIRED',
        orderStableId: checkout.orderStableId,
      };
    }

    return this.refundCompletedOrder(result, checkout.orderStableId);
  }

  private async refundCompletedOrder(
    result: PaymentReverseSyncResult,
    orderStableId: string,
  ): Promise<PaymentReverseSyncOrchestrationResult> {
    const payment = result.payment;
    if (!payment) return { action: 'NONE', orderStableId: null };

    const snapshot = payment.toSnapshot();
    const checkout = await this.checkouts.findByOrderStableId(orderStableId);
    if (!checkout || checkout.attemptId !== snapshot.attemptId) {
      throw new ConflictException({
        code: 'PAYMENT_REVERSE_SYNC_ORDER_CHECKOUT_MISMATCH',
        message:
          'The externally reversed payment does not match the completed order checkout.',
      });
    }

    let order = await this.orders.getByStableId(orderStableId);
    if (order.status === 'refunded') {
      this.publishReverseSync(
        result,
        checkout.storeId,
        orderStableId,
        order.status,
      );
      return { action: 'ORDER_ALREADY_REFUNDED', orderStableId };
    }

    try {
      const refunded = await this.orders.createFullRefund({
        orderStableId,
        reason:
          result.externalReversal === 'VOID'
            ? 'Clover external void confirmed by payment reverse sync'
            : 'Clover external full refund confirmed by payment reverse sync',
        refundAmountCents: order.totalCents,
        originalPaymentMethod: PaymentMethod.CARD,
        refundMethod: PaymentMethod.CARD,
      });
      order = refunded.order;
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
      order = await this.orders.getByStableId(orderStableId);
      if (order.status !== 'refunded') throw error;
      this.publishReverseSync(
        result,
        checkout.storeId,
        orderStableId,
        order.status,
      );
      return { action: 'ORDER_ALREADY_REFUNDED', orderStableId };
    }

    this.publishReverseSync(
      result,
      checkout.storeId,
      orderStableId,
      order.status,
    );
    return { action: 'ORDER_REFUNDED', orderStableId };
  }

  private publishCheckoutReversalStatus(
    result: PaymentReverseSyncResult,
    checkout: PreparedPaymentCheckout,
  ): void {
    const payment = result.payment;
    if (!payment) return;
    const snapshot = payment.toSnapshot();
    try {
      this.posGateway.publishCardPaymentStatus(checkout.storeId, {
        attemptId: snapshot.attemptId,
        paymentId: snapshot.id,
        status: 'CANCELLED',
        failureCode:
          result.externalReversal === 'PARTIAL_REFUND'
            ? 'PAYMENT_EXTERNALLY_PARTIALLY_REFUNDED'
            : 'PAYMENT_EXTERNALLY_REVERSED',
        failureMessage:
          result.externalReversal === 'PARTIAL_REFUND'
            ? 'Clover reports a partial external refund. Manual review is required.'
            : 'Clover reports the payment was externally reversed.',
      });
    } catch {
      // Realtime is advisory. Persisted Payment/checkout state remains canonical.
    }
  }

  private publishReverseSync(
    result: PaymentReverseSyncResult,
    storeStableId: string,
    orderStableId: string | null,
    orderStatus: string | null,
  ): void {
    const payment = result.payment;
    if (!payment || result.externalReversal === 'NONE') return;
    const snapshot = payment.toSnapshot();
    try {
      this.posGateway.publishCardPaymentReverseSync(storeStableId, {
        attemptId: snapshot.attemptId,
        paymentId: snapshot.id,
        externalReversal: result.externalReversal,
        refundedAmountCents: snapshot.refundedAmountCents,
        orderStableId,
        orderStatus,
        requiresManualReview: result.externalReversal === 'PARTIAL_REFUND',
      });
    } catch {
      // Realtime is advisory. Persisted Payment/Order state remains canonical.
    }
  }
}
