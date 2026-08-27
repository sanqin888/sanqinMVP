import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';

import type { OrderDto } from '../orders/dto/order.dto';
import { OrdersService } from '../orders/orders.service';
import type { PaymentTransaction } from '../payments/domain/payment-transaction';
import {
  PaymentReversalPreflightError,
  RefundPaymentService,
} from '../payments/application/refund-payment.service';
import {
  PAYMENT_TRANSACTION_REPOSITORY,
  type PaymentTransactionRepository,
} from '../payments/application/payment-transaction.repository';
import type {
  PaymentOperation,
  PaymentStatus,
} from '../payments/domain/payment.types';
import { PaymentCheckoutAttemptService } from './payment-checkout-attempt.service';

const CLOVER_VOID_WINDOW_MS = 25 * 60 * 1000;
const POS_OPERATOR_REASON_MARKER = ' · 操作人:';

export type PosManagedCardRefundInput = {
  reason: string;
  operatorName: string;
  refundMethod: PaymentMethod;
  refundAmountCents?: number;
  originalPaymentMethod?: PaymentMethod;
};

export type PosManagedCardRefundView = {
  mode: 'MANAGED' | 'LEGACY_MANUAL_REQUIRED';
  status: PaymentStatus | null;
  operation: Extract<PaymentOperation, 'REFUND' | 'VOID'> | null;
  order: OrderDto;
  refundedCardBaseCents: number | null;
  refundedAdditionalChargeCents: number | null;
  refundedCustomerTotalCents: number | null;
  failureCode: string | null;
  failureMessage: string | null;
};

@Injectable()
export class PosCardRefundOrchestrationService {
  constructor(
    private readonly checkouts: PaymentCheckoutAttemptService,
    private readonly refunds: RefundPaymentService,
    @Inject(PAYMENT_TRANSACTION_REPOSITORY)
    private readonly paymentTransactions: PaymentTransactionRepository,
    private readonly orders: OrdersService,
  ) {}

  async refundFullOrder(
    storeStableId: string,
    orderStableId: string,
    input: PosManagedCardRefundInput,
  ): Promise<PosManagedCardRefundView> {
    const order = await this.orders.getByStableId(orderStableId);
    const checkout = await this.checkouts.findByOrderStableId(orderStableId);
    if (!checkout) return this.legacyView(order);
    if (checkout.status !== 'COMPLETED') {
      return this.managedBlockedView(
        order,
        'POS_MANAGED_CARD_CHECKOUT_NOT_COMPLETED',
        `Unified payment checkout is ${checkout.status}; complete payment recovery before refunding this order.`,
      );
    }
    if (!checkout.orderId) {
      throw new ConflictException({
        code: 'POS_MANAGED_CARD_CHECKOUT_FACTS_MISSING',
        message:
          'The unified payment checkout is completed but is missing its order binding.',
      });
    }
    if (
      checkout.storeId !== storeStableId ||
      checkout.source !== 'POS_TERMINAL' ||
      checkout.paymentMethod !== 'CARD' ||
      checkout.externalAmountCents < 0
    ) {
      throw new ConflictException({
        code: 'POS_MANAGED_CARD_CHECKOUT_FACTS_INVALID',
        message:
          'The unified payment checkout does not match this POS device or Clover card order.',
      });
    }
    if (
      order.channel !== 'in_store' ||
      order.paymentMethod !== PaymentMethod.CARD
    ) {
      throw new ConflictException({
        code: 'POS_MANAGED_CARD_ORDER_FACTS_INVALID',
        message:
          'The order facts do not match the unified Clover card checkout.',
      });
    }
    if (
      input.originalPaymentMethod !== undefined &&
      input.originalPaymentMethod !== PaymentMethod.CARD
    ) {
      throw new BadRequestException(
        'originalPaymentMethod does not match order',
      );
    }
    if (
      input.refundAmountCents !== undefined &&
      input.refundAmountCents !== order.totalCents
    ) {
      throw new BadRequestException(
        'full refund amount must equal order total',
      );
    }

    const reason = input.reason.trim();
    const operatorName = input.operatorName.trim();
    if (!reason || !operatorName) {
      throw new BadRequestException('reason and operatorName are required');
    }
    if (input.refundMethod !== PaymentMethod.CARD) {
      return {
        mode: 'MANAGED',
        status: 'FAILED',
        operation: null,
        order,
        refundedCardBaseCents: null,
        refundedAdditionalChargeCents: null,
        refundedCustomerTotalCents: null,
        failureCode: 'POS_MANAGED_CARD_REFUND_REQUIRES_CARD',
        failureMessage:
          'Unified Clover card payments must be refunded back through Clover to the original card.',
      };
    }

    if (checkout.externalAmountCents === 0) {
      if (checkout.paymentTransactionId) {
        throw new ConflictException({
          code: 'POS_MANAGED_ZERO_EXTERNAL_PAYMENT_CONFLICT',
          message:
            'The zero-external-tender checkout unexpectedly references a payment transaction.',
        });
      }
      const finalized = await this.finalizeOrderRefund(
        order,
        reason,
        operatorName,
      );
      return {
        mode: 'MANAGED',
        status: 'SUCCEEDED',
        operation: null,
        order: finalized,
        refundedCardBaseCents: 0,
        refundedAdditionalChargeCents: 0,
        refundedCustomerTotalCents: 0,
        failureCode: null,
        failureMessage: null,
      };
    }

    if (!checkout.paymentTransactionId) {
      throw new ConflictException({
        code: 'POS_MANAGED_CARD_PAYMENT_MISSING',
        message:
          'The completed unified checkout has external card tender but no payment transaction binding.',
      });
    }
    const original = await this.paymentTransactions.findById(
      checkout.paymentTransactionId,
    );
    if (!original) {
      throw new ConflictException({
        code: 'POS_MANAGED_CARD_PAYMENT_MISSING',
        message: 'The original unified card payment transaction is missing.',
      });
    }
    const originalSnapshot = original.toSnapshot();
    if (
      originalSnapshot.provider !== 'CLOVER' ||
      originalSnapshot.source !== 'POS_TERMINAL' ||
      originalSnapshot.paymentMethod !== 'CARD' ||
      originalSnapshot.operation !== 'SALE' ||
      originalSnapshot.status !== 'SUCCEEDED' ||
      originalSnapshot.amountCents !== checkout.externalAmountCents ||
      !originalSnapshot.providerPaymentId ||
      originalSnapshot.chargedTotalCents === null ||
      originalSnapshot.chargedTotalCents < originalSnapshot.amountCents
    ) {
      throw new ConflictException({
        code: 'POS_MANAGED_CARD_PAYMENT_FACTS_INVALID',
        message:
          'The original unified card payment does not contain complete canonical Clover facts.',
      });
    }

    const { identity, existing } =
      await this.resolveRefundIdentity(orderStableId);
    const operation = existing
      ? this.requireExistingOperation(existing.toSnapshot().operation)
      : this.chooseOperation(originalSnapshot.completedAt);
    const expectedAdditionalChargeRefundCents =
      originalSnapshot.chargedTotalCents - originalSnapshot.amountCents;

    let reversal: PaymentTransaction;
    try {
      reversal = await this.refunds.startOrRecover({
        attemptId: identity.attemptId,
        idempotencyKey: identity.idempotencyKey,
        orderId: checkout.orderId,
        originalPaymentId: originalSnapshot.id,
        operation,
        amountCents: originalSnapshot.amountCents,
        currency: originalSnapshot.currency,
        originalProviderPaymentId: originalSnapshot.providerPaymentId,
        expectedAdditionalChargeRefundCents,
      });
    } catch (error) {
      if (error instanceof PaymentReversalPreflightError) {
        return {
          mode: 'MANAGED',
          status: 'UNKNOWN',
          operation,
          order,
          refundedCardBaseCents: null,
          refundedAdditionalChargeCents: null,
          refundedCustomerTotalCents: null,
          failureCode: error.failureCode,
          failureMessage: error.failureMessage,
        };
      }
      throw error;
    }

    const reversalSnapshot = reversal.toSnapshot();
    if (reversal.status !== 'SUCCEEDED') {
      return {
        mode: 'MANAGED',
        status: reversal.status,
        operation,
        order,
        refundedCardBaseCents: reversalSnapshot.refundedAmountCents || null,
        refundedAdditionalChargeCents:
          reversalSnapshot.chargedTotalCents === null
            ? null
            : Math.max(
                0,
                reversalSnapshot.chargedTotalCents -
                  reversalSnapshot.refundedAmountCents,
              ),
        refundedCustomerTotalCents: reversalSnapshot.chargedTotalCents,
        failureCode: reversalSnapshot.failureCode,
        failureMessage: reversalSnapshot.failureMessage,
      };
    }

    const finalized = await this.finalizeOrderRefund(
      order,
      reason,
      operatorName,
    );
    return {
      mode: 'MANAGED',
      status: 'SUCCEEDED',
      operation,
      order: finalized,
      refundedCardBaseCents: reversalSnapshot.refundedAmountCents,
      refundedAdditionalChargeCents: expectedAdditionalChargeRefundCents,
      refundedCustomerTotalCents: reversalSnapshot.chargedTotalCents,
      failureCode: null,
      failureMessage: null,
    };
  }

  private async finalizeOrderRefund(
    order: OrderDto,
    reason: string,
    operatorName: string,
  ): Promise<OrderDto> {
    if (order.status === 'refunded') return order;
    try {
      const result = await this.orders.createFullRefund({
        orderStableId: order.orderStableId,
        reason: `${reason}${POS_OPERATOR_REASON_MARKER}${operatorName}`,
        refundAmountCents: order.totalCents,
        originalPaymentMethod: PaymentMethod.CARD,
        refundMethod: PaymentMethod.CARD,
      });
      return result.order;
    } catch (error) {
      if (error instanceof ConflictException) {
        const current = await this.orders.getByStableId(order.orderStableId);
        if (current.status === 'refunded') return current;
      }
      throw error;
    }
  }

  private managedBlockedView(
    order: OrderDto,
    failureCode: string,
    failureMessage: string,
  ): PosManagedCardRefundView {
    return {
      mode: 'MANAGED',
      status: 'UNKNOWN',
      operation: null,
      order,
      refundedCardBaseCents: null,
      refundedAdditionalChargeCents: null,
      refundedCustomerTotalCents: null,
      failureCode,
      failureMessage,
    };
  }

  private legacyView(order: OrderDto): PosManagedCardRefundView {
    return {
      mode: 'LEGACY_MANUAL_REQUIRED',
      status: null,
      operation: null,
      order,
      refundedCardBaseCents: null,
      refundedAdditionalChargeCents: null,
      refundedCustomerTotalCents: null,
      failureCode: null,
      failureMessage: null,
    };
  }

  private async resolveRefundIdentity(orderStableId: string): Promise<{
    identity: { attemptId: string; idempotencyKey: string };
    existing: PaymentTransaction | null;
  }> {
    let identity = this.refundIdentity(orderStableId);
    for (let retry = 0; retry < 8; retry += 1) {
      const existing = await this.paymentTransactions.findByAttemptId(
        identity.attemptId,
      );
      if (!existing) return { identity, existing: null };

      const snapshot = existing.toSnapshot();
      this.requireExistingOperation(snapshot.operation);
      if (!['DECLINED', 'CANCELLED', 'FAILED'].includes(snapshot.status)) {
        return { identity, existing };
      }
      identity = this.retryRefundIdentity(orderStableId, snapshot.id);
    }

    throw new ConflictException({
      code: 'POS_MANAGED_REFUND_RETRY_LIMIT_REACHED',
      message:
        'Too many definitive Clover refund attempts exist for this order. Manual review is required before another financial action.',
    });
  }

  private refundIdentity(orderStableId: string): {
    attemptId: string;
    idempotencyKey: string;
  } {
    return this.refundIdentityFromSeed(`pos-full-refund\n${orderStableId}`);
  }

  private retryRefundIdentity(
    orderStableId: string,
    previousPaymentTransactionId: string,
  ): { attemptId: string; idempotencyKey: string } {
    return this.refundIdentityFromSeed(
      `pos-full-refund-retry\n${orderStableId}\n${previousPaymentTransactionId}`,
    );
  }

  private refundIdentityFromSeed(seed: string): {
    attemptId: string;
    idempotencyKey: string;
  } {
    const digest = createHash('sha256').update(seed).digest('hex');
    return {
      attemptId: `refund_${digest.slice(0, 48)}`,
      idempotencyKey: `refund_${digest}`,
    };
  }

  private chooseOperation(
    completedAt: Date | null,
  ): Extract<PaymentOperation, 'REFUND' | 'VOID'> {
    if (
      completedAt &&
      Date.now() - completedAt.getTime() >= 0 &&
      Date.now() - completedAt.getTime() <= CLOVER_VOID_WINDOW_MS
    ) {
      return 'VOID';
    }
    return 'REFUND';
  }

  private requireExistingOperation(
    operation: PaymentOperation,
  ): Extract<PaymentOperation, 'REFUND' | 'VOID'> {
    if (operation === 'REFUND' || operation === 'VOID') return operation;
    throw new ConflictException({
      code: 'POS_MANAGED_REFUND_IDENTITY_CONFLICT',
      message:
        'The managed refund identity is already used by another payment operation.',
    });
  }
}
