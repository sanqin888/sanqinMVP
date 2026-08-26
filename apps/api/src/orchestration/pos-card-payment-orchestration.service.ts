import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { CreateOrderInput } from '@shared/order';

import type { OrderDto } from '../orders/dto/order.dto';
import { OrdersService } from '../orders/orders.service';
import { PrintPosPayloadService } from '../orders/print-pos-payload.service';
import { TerminalPaymentService } from '../payments/application/create-payment-attempt.use-case';
import {
  PAYMENT_TRANSACTION_REPOSITORY,
  type PaymentTransactionRepository,
} from '../payments/application/payment-transaction.repository';
import type { PaymentTransaction } from '../payments/domain/payment-transaction';
import { PosCardPaymentFeatureConfig } from '../pos/pos-card-payment-feature.config';
import { PosGateway } from '../pos/pos.gateway';
import {
  PaymentCheckoutAttemptService,
  type PreparePaymentCheckoutInput,
  type PreparedPaymentCheckout,
} from './payment-checkout-attempt.service';

const PROCESSING_RECONCILE_AFTER_MS = 330 * 1000;

export type PosCardPaymentStatus =
  | 'CREATED'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'UNKNOWN'
  | 'RECONCILING'
  | 'FAILED';

export type PosCardPaymentView = {
  attemptId: string;
  paymentId: string | null;
  status: PosCardPaymentStatus;
  failureCode: string | null;
  failureMessage: string | null;
  externalAmountCents: number;
  surchargeCents: number | null;
  chargedTotalCents: number | null;
  pointsCents: number;
  balanceCents: number;
  couponDiscountCents: number;
  orderStableId: string | null;
  orderNumber: string | null;
  pickupCode: string | null;
};

export type PosCardPaymentStartInput = {
  attemptId: string;
  idempotencyKey: string;
  order: CreateOrderInput;
};

@Injectable()
export class PosCardPaymentOrchestrationService {
  constructor(
    private readonly featureConfig: PosCardPaymentFeatureConfig,
    private readonly checkouts: PaymentCheckoutAttemptService,
    private readonly terminalPayments: TerminalPaymentService,
    @Inject(PAYMENT_TRANSACTION_REPOSITORY)
    private readonly paymentTransactions: PaymentTransactionRepository,
    private readonly orders: OrdersService,
    private readonly printPosPayloadService: PrintPosPayloadService,
    private readonly posGateway: PosGateway,
  ) {}

  getConfig(storeId: string) {
    return {
      enabled: this.featureConfig.isEnabled(),
      storeId,
    };
  }

  async getAvailability(storeId: string) {
    if (!this.featureConfig.isEnabled()) {
      return {
        enabled: false,
        storeId,
        state: 'DISABLED',
        configured: false,
        available: false,
        failureCode: null,
        failureMessage: null,
      };
    }

    return {
      enabled: true,
      storeId,
      ...(await this.terminalPayments.getAvailability()),
    };
  }

  async start(
    storeId: string,
    input: PosCardPaymentStartInput,
  ): Promise<PosCardPaymentView> {
    this.requireEnabled();
    this.requireTerminalCardOrder(input.order);

    const checkout = await this.checkouts.prepare(
      this.toCheckoutInput(storeId, input),
    );
    return this.continueCheckout(storeId, checkout, 'START');
  }

  async recover(
    storeId: string,
    input: PosCardPaymentStartInput,
  ): Promise<PosCardPaymentView> {
    this.requireEnabled();
    this.requireTerminalCardOrder(input.order);

    const checkout = await this.checkouts.requireForInput(
      this.toCheckoutInput(storeId, input),
    );
    return this.continueCheckout(storeId, checkout, 'RECOVER');
  }

  async cancel(
    storeId: string,
    input: PosCardPaymentStartInput,
  ): Promise<PosCardPaymentView> {
    this.requireEnabled();
    this.requireTerminalCardOrder(input.order);

    let checkout = await this.checkouts.requireForInput(
      this.toCheckoutInput(storeId, input),
    );

    if (
      checkout.status === 'COMPLETED' ||
      checkout.status === 'FINALIZING' ||
      checkout.status === 'SUCCEEDED'
    ) {
      return this.finalizeCheckout(storeId, checkout);
    }

    if (checkout.status === 'PREPARED') {
      const cancelled = await this.checkouts.cancelBeforeProvider(
        checkout.attemptId,
      );
      checkout = cancelled.checkout;
      if (cancelled.cancelled) {
        const view = this.toView(checkout);
        this.publish(storeId, view);
        return view;
      }
    }

    if (checkout.externalAmountCents === 0) {
      checkout = await this.checkouts.markDefinitiveFailureAndRelease(
        checkout.attemptId,
        'CANCELLED',
      );
      const view = this.toView(checkout);
      this.publish(storeId, view);
      return view;
    }

    const payment = await this.findPaymentForCheckout(checkout);
    if (!payment) {
      const view = this.toView(checkout, undefined, undefined, {
        status: checkout.status === 'PROCESSING' ? 'PROCESSING' : 'UNKNOWN',
        failureCode: 'PAYMENT_CANCEL_WAITING_FOR_PROVIDER_ATTEMPT',
        failureMessage:
          'Payment start is still being established. Recheck before retrying or changing payment method.',
      });
      this.publish(storeId, view);
      return view;
    }

    const cancelled = await this.terminalPayments.cancel(payment.id);
    return this.handlePayment(storeId, checkout, cancelled);
  }

  private async continueCheckout(
    storeId: string,
    initialCheckout: PreparedPaymentCheckout,
    mode: 'START' | 'RECOVER',
  ): Promise<PosCardPaymentView> {
    let checkout = initialCheckout;

    if (checkout.status === 'COMPLETED') {
      return this.finalizeCheckout(storeId, checkout);
    }
    if (checkout.status === 'FINALIZING' || checkout.status === 'SUCCEEDED') {
      return this.finalizeCheckout(storeId, checkout);
    }
    if (
      checkout.status === 'DECLINED' ||
      checkout.status === 'CANCELLED' ||
      checkout.status === 'FAILED'
    ) {
      checkout = await this.checkouts.markDefinitiveFailureAndRelease(
        checkout.attemptId,
        checkout.status,
      );
      const payment = await this.findPaymentForCheckout(checkout);
      const view = this.toView(checkout, payment ?? undefined);
      this.publish(storeId, view);
      return view;
    }

    if (checkout.externalAmountCents === 0) {
      checkout = await this.checkouts.markSucceededWithoutExternalPayment(
        checkout.attemptId,
      );
      return this.finalizeCheckout(storeId, checkout);
    }

    const existingPayment = await this.findPaymentForCheckout(checkout);
    if (existingPayment) {
      if (
        mode === 'RECOVER' &&
        ['UNKNOWN', 'RECONCILING'].includes(existingPayment.status)
      ) {
        const reconciled = await this.terminalPayments.reconcile(
          existingPayment.id,
        );
        return this.handlePayment(storeId, checkout, reconciled);
      }
      if (
        mode === 'RECOVER' &&
        existingPayment.status === 'PROCESSING' &&
        this.processingCanBeReconciled(existingPayment)
      ) {
        const reconciled = await this.terminalPayments.reconcile(
          existingPayment.id,
        );
        return this.handlePayment(storeId, checkout, reconciled);
      }
      if (mode === 'RECOVER' && existingPayment.status === 'CREATED') {
        return this.startExternalSale(storeId, checkout);
      }
      return this.handlePayment(storeId, checkout, existingPayment);
    }

    if (checkout.status === 'UNKNOWN' || checkout.status === 'RECONCILING') {
      const view = this.toView(checkout, undefined, undefined, {
        status: 'UNKNOWN',
        failureCode: 'PAYMENT_TRANSACTION_MISSING_DURING_RECOVERY',
        failureMessage:
          'Payment state is uncertain and requires reconciliation before another charge.',
      });
      this.publish(storeId, view);
      return view;
    }

    if (checkout.status === 'PREPARED') {
      const availability = await this.terminalPayments.getAvailability();
      if (!availability.available) {
        checkout = await this.checkouts.markDefinitiveFailureAndRelease(
          checkout.attemptId,
          'FAILED',
        );
        const view = this.toView(checkout, undefined, undefined, {
          status: 'FAILED',
          failureCode:
            availability.failureCode ?? 'POS_CLOVER_TERMINAL_UNAVAILABLE',
          failureMessage: 'Clover Terminal is unavailable',
        });
        this.publish(storeId, view);
        return view;
      }

      const claimed = await this.checkouts.claimProviderStart(
        checkout.attemptId,
      );
      checkout = claimed.checkout;
      if (claimed.claimed) {
        const processingView = this.toView(checkout, undefined, undefined, {
          status: 'PROCESSING',
        });
        this.publish(storeId, processingView);
        return this.startExternalSale(storeId, checkout);
      }
    }

    if (checkout.status === 'PROCESSING') {
      if (mode === 'RECOVER') {
        return this.startExternalSale(storeId, checkout);
      }
      const view = this.toView(checkout, undefined, undefined, {
        status: 'PROCESSING',
      });
      this.publish(storeId, view);
      return view;
    }

    const view = this.toView(checkout);
    this.publish(storeId, view);
    return view;
  }

  private async startExternalSale(
    storeId: string,
    checkout: PreparedPaymentCheckout,
  ): Promise<PosCardPaymentView> {
    const payment = await this.terminalPayments.startSale({
      attemptId: checkout.attemptId,
      idempotencyKey: checkout.idempotencyKey,
      amountCents: checkout.externalAmountCents,
      currency: 'CAD',
      description: 'SanQ POS card sale',
    });
    return this.handlePayment(storeId, checkout, payment);
  }

  private async handlePayment(
    storeId: string,
    checkout: PreparedPaymentCheckout,
    payment: PaymentTransaction,
  ): Promise<PosCardPaymentView> {
    checkout = await this.checkouts.markFromPayment(
      checkout.attemptId,
      payment,
    );

    if (
      payment.status === 'DECLINED' ||
      payment.status === 'CANCELLED' ||
      payment.status === 'FAILED'
    ) {
      checkout = await this.checkouts.markDefinitiveFailureAndRelease(
        checkout.attemptId,
        payment.status,
      );
    }

    if (payment.status === 'SUCCEEDED') {
      return this.finalizeCheckout(storeId, checkout, payment);
    }

    const view = this.toView(checkout, payment);
    this.publish(storeId, view);
    return view;
  }

  private async finalizeCheckout(
    storeId: string,
    initialCheckout: PreparedPaymentCheckout,
    knownPayment?: PaymentTransaction,
  ): Promise<PosCardPaymentView> {
    let checkout = initialCheckout;

    if (checkout.orderId || checkout.status === 'COMPLETED') {
      const existingOrder = await this.orders.getByStableId(
        checkout.orderStableId,
      );
      const payment =
        knownPayment ??
        (await this.findPaymentForCheckout(checkout)) ??
        undefined;
      await this.printOrderOnce(checkout, existingOrder);
      const view = this.toView(checkout, payment, existingOrder, {
        status: 'SUCCEEDED',
      });
      this.publish(storeId, view);
      return view;
    }

    if (checkout.status !== 'SUCCEEDED' && checkout.status !== 'FINALIZING') {
      const view = this.toView(checkout, knownPayment);
      this.publish(storeId, view);
      return view;
    }

    checkout = await this.checkouts.markFinalizing(checkout.attemptId);
    let payment = knownPayment;
    if (checkout.externalAmountCents > 0) {
      payment =
        payment ?? (await this.findPaymentForCheckout(checkout)) ?? undefined;
      if (!payment || payment.status !== 'SUCCEEDED') {
        const view = this.toView(checkout, payment, undefined, {
          status: 'UNKNOWN',
          failureCode: 'PAYMENT_SUCCESS_FACT_MISSING',
          failureMessage:
            'The checkout expects a successful external payment but the payment fact is unavailable.',
        });
        this.publish(storeId, view);
        return view;
      }
    }

    const paymentSnapshot = payment?.toSnapshot();
    const surchargeCents = paymentSnapshot?.surchargeCents ?? 0;
    const chargedTotalCents =
      checkout.externalAmountCents === 0
        ? 0
        : (paymentSnapshot?.chargedTotalCents ??
          checkout.externalAmountCents + surchargeCents);
    const expectedChargedTotalCents =
      checkout.externalAmountCents + surchargeCents;
    if (chargedTotalCents !== expectedChargedTotalCents) {
      const view = this.toView(checkout, payment, undefined, {
        status: 'UNKNOWN',
        failureCode: 'POS_CARD_CHARGED_TOTAL_MISMATCH',
        failureMessage:
          'Clover confirmed a charged total that does not match the prepared external tender. Do not charge the card again.',
      });
      this.publish(storeId, view);
      return view;
    }

    const created = await this.orders.createFromConfirmedPaymentSnapshot(
      checkout.snapshot,
      {
        attemptId: checkout.attemptId,
        internalOrderId: checkout.plannedOrderId,
        orderStableId: checkout.orderStableId,
        cardSurchargeCents: surchargeCents,
        chargedTotalCents,
      },
    );

    checkout = await this.checkouts.markCompleted({
      attemptId: checkout.attemptId,
      orderId: created.internalOrderId,
    });
    await this.printOrderOnce(checkout, created.order);

    const view = this.toView(checkout, payment, created.order, {
      status: 'SUCCEEDED',
    });
    this.publish(storeId, view);
    return view;
  }

  private async findPaymentForCheckout(
    checkout: PreparedPaymentCheckout,
  ): Promise<PaymentTransaction | null> {
    if (checkout.paymentTransactionId) {
      try {
        return await this.terminalPayments.findById(
          checkout.paymentTransactionId,
        );
      } catch {
        return this.paymentTransactions.findByAttemptId(checkout.attemptId);
      }
    }
    return this.paymentTransactions.findByAttemptId(checkout.attemptId);
  }

  private processingCanBeReconciled(payment: PaymentTransaction): boolean {
    const updatedAt = payment.toSnapshot().updatedAt.getTime();
    return Date.now() - updatedAt >= PROCESSING_RECONCILE_AFTER_MS;
  }

  private async printOrderOnce(
    checkout: PreparedPaymentCheckout,
    order: OrderDto,
  ): Promise<void> {
    const payload = await this.printPosPayloadService.getByStableId(
      order.orderStableId,
      'zh',
    );
    await this.posGateway.sendPrintJob({
      orderId: checkout.orderId ?? checkout.plannedOrderId,
      orderStableId: order.orderStableId,
      storeId: checkout.storeId,
      kind: `PAYMENT_CHECKOUT:${checkout.attemptId}`,
      data: {
        ...payload,
        targets: { customer: true, kitchen: true },
      },
    });
  }

  private requireEnabled(): void {
    if (this.featureConfig.isEnabled()) return;
    throw new ConflictException({
      code: 'POS_CLOVER_TERMINAL_PAYMENT_DISABLED',
      message: 'Clover Terminal POS payment flow is disabled',
    });
  }

  private requireTerminalCardOrder(order: CreateOrderInput): void {
    if (order.channel !== 'in_store' || order.paymentMethod !== 'CARD') {
      throw new BadRequestException({
        code: 'POS_CARD_ORDER_REQUIRED',
        message: 'Unified POS card payment requires an in-store CARD checkout.',
      });
    }
  }

  private toCheckoutInput(
    storeId: string,
    input: PosCardPaymentStartInput,
  ): PreparePaymentCheckoutInput {
    return {
      source: 'POS_TERMINAL',
      paymentMethod: 'CARD',
      storeId,
      attemptId: input.attemptId,
      clientIdempotencyKey: input.idempotencyKey,
      order: input.order,
    };
  }

  private toView(
    checkout: PreparedPaymentCheckout,
    payment?: PaymentTransaction,
    order?: OrderDto,
    override?: Partial<
      Pick<PosCardPaymentView, 'status' | 'failureCode' | 'failureMessage'>
    >,
  ): PosCardPaymentView {
    const paymentSnapshot = payment?.toSnapshot();
    const tender = checkout.snapshot.tender;
    return {
      attemptId: checkout.attemptId,
      paymentId: payment?.id ?? checkout.paymentTransactionId,
      status: override?.status ?? this.publicStatus(checkout.status),
      failureCode:
        override?.failureCode ??
        paymentSnapshot?.failureCode ??
        (checkout.status === 'FAILED' ? 'PAYMENT_CHECKOUT_FAILED' : null),
      failureMessage:
        override?.failureMessage ?? paymentSnapshot?.failureMessage ?? null,
      externalAmountCents: checkout.externalAmountCents,
      surchargeCents: paymentSnapshot?.surchargeCents ?? null,
      chargedTotalCents: paymentSnapshot?.chargedTotalCents ?? null,
      pointsCents: tender.pointsCents,
      balanceCents: tender.balanceCents,
      couponDiscountCents: tender.couponDiscountCents,
      orderStableId: order?.orderStableId ?? null,
      orderNumber: order?.orderNumber ?? null,
      pickupCode: order?.pickupCode ?? null,
    };
  }

  private publicStatus(
    status: PreparedPaymentCheckout['status'],
  ): PosCardPaymentStatus {
    switch (status) {
      case 'PREPARING':
      case 'PREPARED':
        return 'CREATED';
      case 'FINALIZING':
        return 'PROCESSING';
      case 'COMPLETED':
        return 'SUCCEEDED';
      default:
        return status;
    }
  }

  private publish(storeId: string, view: PosCardPaymentView): void {
    try {
      this.posGateway.publishCardPaymentStatus(storeId, view);
    } catch {
      // Realtime delivery is best-effort; persisted checkout/payment/order truth wins.
    }
  }
}
