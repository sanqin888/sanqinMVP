import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { CreateOrderInput } from '@shared/order';

import {
  PAYMENT_ORDER_FINALIZATION,
  POS_ORDER_OPERATIONS,
  type ConfirmedPaymentOrderView,
  type PaymentOrderFinalizationPort,
  type PosOrderOperationsPort,
} from '../orders/public-api';
import { TerminalPaymentService } from '../payments/application/create-payment-attempt.use-case';
import {
  PAYMENT_TRANSACTION_REPOSITORY,
  type PaymentTransactionRepository,
} from '../payments/application/payment-transaction.repository';
import type { PaymentTransaction } from '../payments/domain/payment-transaction';
import { PosCardPaymentFeatureConfig } from '../pos/pos-card-payment-feature.config';
import {
  POS_PAYMENT_REALTIME,
  type PosPaymentRealtimePort,
} from '../pos/public-api';
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
  customerRetryRequested?: boolean;
  customerPromptPending?: boolean;
  canResumeOriginalSale: boolean;
  /** UI-only hint: original Sale HTTP 504 ended device interaction, not funds. */
  terminalInteractionTimedOut: boolean;
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
  retryPromptEnabled?: boolean;
  asyncTerminalFlow?: boolean;
  order: CreateOrderInput;
};

@Injectable()
export class PosCardPaymentOrchestrationService {
  private readonly activeCustomerPrompts = new Set<string>();
  private readonly activeSaleAttempts = new Set<string>();

  constructor(
    private readonly featureConfig: PosCardPaymentFeatureConfig,
    private readonly checkouts: PaymentCheckoutAttemptService,
    private readonly terminalPayments: TerminalPaymentService,
    @Inject(PAYMENT_TRANSACTION_REPOSITORY)
    private readonly paymentTransactions: PaymentTransactionRepository,
    @Inject(PAYMENT_ORDER_FINALIZATION)
    private readonly orderFinalization: PaymentOrderFinalizationPort,
    @Inject(POS_ORDER_OPERATIONS)
    private readonly orderOperations: PosOrderOperationsPort,
    @Inject(POS_PAYMENT_REALTIME)
    private readonly paymentRealtime: PosPaymentRealtimePort,
  ) {}

  getConfig(storeStableId: string) {
    return {
      enabled: this.featureConfig.isEnabled(),
      storeId: storeStableId,
    };
  }

  async getAvailability(storeStableId: string) {
    if (!this.featureConfig.isEnabled()) {
      return {
        enabled: false,
        storeId: storeStableId,
        state: 'DISABLED',
        configured: false,
        available: false,
        failureCode: null,
        failureMessage: null,
      };
    }

    return {
      enabled: true,
      storeId: storeStableId,
      ...(await this.terminalPayments.getAvailability()),
    };
  }

  /** Read-only queue; intentionally available even if the Terminal flag is off. */
  async getBenefitsReview(storeStableId: string) {
    return {
      items: await this.checkouts.findPosCardPaymentReviewItems(storeStableId),
    };
  }

  async start(
    storeStableId: string,
    input: PosCardPaymentStartInput,
  ): Promise<PosCardPaymentView> {
    this.requireEnabled();
    this.requireTerminalCardOrder(input.order);

    const checkout = await this.checkouts.prepare(
      this.toCheckoutInput(storeStableId, input),
    );
    return this.continueCheckout(
      storeStableId,
      checkout,
      'START',
      // Legacy POS clients must not see a Retry button they cannot handle.
      input.retryPromptEnabled === true,
      input.asyncTerminalFlow === true,
    );
  }

  async recover(
    storeStableId: string,
    input: PosCardPaymentStartInput,
  ): Promise<PosCardPaymentView> {
    this.requireEnabled();
    this.requireTerminalCardOrder(input.order);

    const checkout = await this.checkouts.requireForInput(
      this.toCheckoutInput(storeStableId, input),
    );
    return this.continueCheckout(storeStableId, checkout, 'RECOVER');
  }

  async resumeOriginalSale(
    storeStableId: string,
    input: PosCardPaymentStartInput,
  ): Promise<PosCardPaymentView> {
    this.requireEnabled();
    this.requireTerminalCardOrder(input.order);
    const checkout = await this.checkouts.requireForInput(
      this.toCheckoutInput(storeStableId, input),
    );
    const payment = await this.findPaymentForCheckout(checkout);
    if (!payment) {
      throw new ConflictException({
        code: 'POS_CARD_ORIGINAL_SALE_MISSING',
        message:
          'Original Clover Sale is missing; do not issue another payment.',
      });
    }
    if (!this.terminalPayments.canResumeOriginal504Sale(payment)) {
      return this.handlePayment(storeStableId, checkout, payment);
    }
    if (this.activeSaleAttempts.has(checkout.attemptId)) {
      return this.toView(checkout, payment, undefined, {
        status: 'RECONCILING',
        canResumeOriginalSale: false,
      });
    }
    this.activeSaleAttempts.add(checkout.attemptId);
    // Publish the acknowledgement before the background coroutine can emit
    // its (potentially terminal) result.
    const view = this.toView(checkout, payment, undefined, {
      status: 'RECONCILING',
      canResumeOriginalSale: false,
    });
    this.publish(storeStableId, view);
    void this.runBackgroundOriginalResume(storeStableId, checkout);
    return view;
  }

  private async runBackgroundOriginalResume(
    storeStableId: string,
    checkout: PreparedPaymentCheckout,
  ): Promise<void> {
    try {
      const payment = await this.findPaymentForCheckout(checkout);
      if (!payment) return;
      const result = await this.terminalPayments.resumeOriginal504Sale(
        payment.id,
      );
      await this.handlePayment(storeStableId, checkout, result);
    } catch {
      // A failed read/device reset/provider interaction is not a failed Sale.
      // Keep the persisted state and do not release any reservation.
      try {
        const current = await this.checkouts.findByAttemptId(
          checkout.attemptId,
        );
        const payment = await this.findPaymentForCheckout(current);
        this.publish(
          storeStableId,
          this.toView(current, payment ?? undefined, undefined, {
            status: 'RECONCILING',
            canResumeOriginalSale: false,
            failureCode: 'POS_CARD_ORIGINAL_RESUME_UNCERTAIN',
            failureMessage:
              'Original Clover payment requires reconciliation; do not start a new Sale.',
          }),
        );
      } catch {
        // Durable Payments truth wins if even this read fails.
      }
    } finally {
      this.activeSaleAttempts.delete(checkout.attemptId);
    }
  }

  async applyReverseSyncedPayment(
    payment: PaymentTransaction,
  ): Promise<PosCardPaymentView | null> {
    const snapshot = payment.toSnapshot();
    if (snapshot.source !== 'POS_TERMINAL' || snapshot.operation !== 'SALE') {
      return null;
    }

    let checkout: PreparedPaymentCheckout;
    try {
      checkout = await this.checkouts.findByAttemptId(snapshot.attemptId);
    } catch {
      return null;
    }

    if (
      checkout.source !== snapshot.source ||
      checkout.paymentMethod !== snapshot.paymentMethod ||
      checkout.externalAmountCents !== snapshot.amountCents ||
      (checkout.paymentTransactionId !== null &&
        checkout.paymentTransactionId !== snapshot.id)
    ) {
      throw new ConflictException({
        code: 'PAYMENT_REVERSE_SYNC_CHECKOUT_MISMATCH',
        message:
          'The reverse-synced payment does not match its persisted checkout attempt.',
      });
    }

    return this.handlePayment(checkout.storeId, checkout, payment);
  }

  async cancel(
    storeStableId: string,
    input: PosCardPaymentStartInput,
  ): Promise<PosCardPaymentView> {
    this.requireEnabled();
    this.requireTerminalCardOrder(input.order);

    let checkout = await this.checkouts.requireForInput(
      this.toCheckoutInput(storeStableId, input),
    );

    if (
      checkout.status === 'COMPLETED' ||
      checkout.status === 'FINALIZING' ||
      checkout.status === 'SUCCEEDED'
    ) {
      return this.finalizeCheckout(storeStableId, checkout);
    }

    if (checkout.status === 'PREPARED') {
      const cancelled = await this.checkouts.cancelBeforeProvider(
        checkout.attemptId,
      );
      checkout = cancelled.checkout;
      if (cancelled.cancelled) {
        const view = this.toView(checkout);
        this.publish(storeStableId, view);
        return view;
      }
    }

    if (checkout.externalAmountCents === 0) {
      checkout = await this.checkouts.markDefinitiveFailureAndRelease(
        checkout.attemptId,
        'CANCELLED',
      );
      const view = this.toView(checkout);
      this.publish(storeStableId, view);
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
      this.publish(storeStableId, view);
      return view;
    }

    if (
      ['DECLINED', 'FAILED', 'CANCELLED'].includes(payment.status) &&
      this.activeCustomerPrompts.has(checkout.attemptId)
    ) {
      await this.terminalPayments.cancelCustomerConfirmation();
      return {
        ...this.toView(checkout, payment),
        customerPromptPending: this.activeCustomerPrompts.has(
          checkout.attemptId,
        ),
      };
    }
    const cancelled = await this.terminalPayments.cancel(payment.id);
    return this.handlePayment(storeStableId, checkout, cancelled);
  }

  private async continueCheckout(
    storeId: string,
    initialCheckout: PreparedPaymentCheckout,
    mode: 'START' | 'RECOVER',
    allowRetry = false,
    asyncTerminalFlow = false,
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
      const view = {
        ...this.toView(checkout, payment ?? undefined),
        ...(this.activeCustomerPrompts.has(checkout.attemptId)
          ? { customerPromptPending: true }
          : {}),
      };
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
        this.activeSaleAttempts.has(checkout.attemptId)
      ) {
        const view = this.toView(checkout, existingPayment);
        this.publish(storeId, view);
        return view;
      }
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
        return this.startExternalSale(storeId, checkout, allowRetry);
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
        if (mode === 'START' && asyncTerminalFlow) {
          void this.runBackgroundSale(storeId, checkout, allowRetry);
          return processingView;
        }
        return this.startExternalSale(storeId, checkout, allowRetry);
      }
    }

    if (checkout.status === 'PROCESSING') {
      // Checkout claimed but PaymentTransaction not visible: do not issue a
      // second provider Sale. Recovery must wait for persisted evidence.
      if (mode === 'RECOVER') {
        const view = this.toView(checkout, undefined, undefined, {
          status: 'PROCESSING',
        });
        this.publish(storeId, view);
        return view;
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

  private async runBackgroundSale(
    storeId: string,
    checkout: PreparedPaymentCheckout,
    allowRetry: boolean,
  ): Promise<void> {
    this.activeSaleAttempts.add(checkout.attemptId);
    try {
      await this.startExternalSale(storeId, checkout, allowRetry);
    } catch {
      // A transport exception cannot establish payment failure. The checkout
      // remains recoverable; no new Sale is permitted without reconciliation.
      try {
        const current = await this.checkouts.findByAttemptId(
          checkout.attemptId,
        );
        const payment = await this.findPaymentForCheckout(current);
        if (current.status === 'COMPLETED') return;
        const view = this.toView(current, payment ?? undefined, undefined, {
          status: 'UNKNOWN',
          failureCode: 'POS_CARD_BACKGROUND_START_UNCERTAIN',
          failureMessage:
            'Payment execution needs reconciliation before retry.',
        });
        this.publish(storeId, view);
      } catch {
        // Preserve persistent source of truth; do not invent a final state.
      }
    } finally {
      this.activeSaleAttempts.delete(checkout.attemptId);
    }
  }

  private async startExternalSale(
    storeId: string,
    checkout: PreparedPaymentCheckout,
    allowRetry: boolean,
  ): Promise<PosCardPaymentView> {
    const payment = await this.terminalPayments.startSale({
      attemptId: checkout.attemptId,
      idempotencyKey: checkout.idempotencyKey,
      amountCents: checkout.externalAmountCents,
      currency: 'CAD',
      description: 'SanQ POS card sale',
    });
    return this.handlePayment(storeId, checkout, payment, true, allowRetry);
  }

  private async handlePayment(
    storeId: string,
    checkout: PreparedPaymentCheckout,
    payment: PaymentTransaction,
    interactive = false,
    allowRetry = false,
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

    const promptPending =
      interactive &&
      allowRetry &&
      checkout.externalAmountCents > 0 &&
      ['DECLINED', 'FAILED'].includes(payment.status) &&
      !this.activeCustomerPrompts.has(checkout.attemptId);
    if (promptPending) this.activeCustomerPrompts.add(checkout.attemptId);
    const view = {
      ...this.toView(checkout, payment),
      ...(promptPending ? { customerPromptPending: true } : {}),
    };
    this.publish(storeId, view);
    if (promptPending) {
      // Never await customer input inside the HTTP request. No second Sale is
      // initiated here; Retry is an explicit new POS attempt after confirmation.
      void this.waitForCustomerDecision(storeId, checkout, payment, view);
    } else if (
      interactive &&
      ['FAILED', 'DECLINED', 'CANCELLED'].includes(payment.status)
    ) {
      void this.terminalPayments.completeCustomerInteraction(
        payment.status as 'DECLINED' | 'CANCELLED' | 'FAILED',
        payment.toSnapshot().failureCode,
        false,
      );
    }
    return view;
  }

  private async waitForCustomerDecision(
    storeId: string,
    checkout: PreparedPaymentCheckout,
    payment: PaymentTransaction,
    waiting: PosCardPaymentView,
  ): Promise<void> {
    let customerRetryRequested = false;
    try {
      customerRetryRequested =
        await this.terminalPayments.completeCustomerInteraction(
          payment.status as 'DECLINED' | 'FAILED',
          payment.toSnapshot().failureCode,
          true,
        );
    } finally {
      this.activeCustomerPrompts.delete(checkout.attemptId);
      this.publish(storeId, {
        ...waiting,
        customerPromptPending: false,
        customerRetryRequested,
      });
    }
  }

  private async finalizeCheckout(
    storeId: string,
    initialCheckout: PreparedPaymentCheckout,
    knownPayment?: PaymentTransaction,
  ): Promise<PosCardPaymentView> {
    let checkout = initialCheckout;

    if (checkout.status === 'COMPLETED') {
      const existingOrder = await this.orderOperations.getByStableIdForStore(
        checkout.orderStableId,
        storeId,
      );
      const payment =
        knownPayment ??
        (await this.findPaymentForCheckout(checkout)) ??
        undefined;
      await this.orderOperations.activateImmediatePreparation(
        existingOrder.orderStableId,
        storeId,
      );
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
    if (checkout.status !== 'FINALIZING') {
      const currentPayment =
        (await this.findPaymentForCheckout(checkout)) ?? knownPayment;
      const view = this.toView(checkout, currentPayment ?? undefined);
      this.publish(storeId, view);
      return view;
    }

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
    if (
      checkout.externalAmountCents > 0 &&
      paymentSnapshot?.amountCents !== checkout.externalAmountCents
    ) {
      const view = this.toView(checkout, payment, undefined, {
        status: 'UNKNOWN',
        failureCode: 'POS_CARD_PAYMENT_AMOUNT_MISMATCH',
        failureMessage:
          'The canonical payment base amount does not match the prepared external tender. Do not charge the card again.',
      });
      this.publish(storeId, view);
      return view;
    }
    if (
      checkout.externalAmountCents > 0 &&
      (paymentSnapshot?.chargedTotalCents === null ||
        paymentSnapshot?.chargedTotalCents === undefined ||
        paymentSnapshot.surchargeCents === null ||
        paymentSnapshot.surchargeCents === undefined)
    ) {
      const view = this.toView(checkout, payment, undefined, {
        status: 'UNKNOWN',
        failureCode: 'POS_CARD_CANONICAL_CHARGE_FACTS_MISSING',
        failureMessage:
          'The successful payment is missing canonical Clover charge facts. Do not charge the card again.',
      });
      this.publish(storeId, view);
      return view;
    }
    const surchargeCents =
      checkout.externalAmountCents === 0
        ? 0
        : (paymentSnapshot?.surchargeCents ?? 0);
    const chargedTotalCents =
      checkout.externalAmountCents === 0
        ? 0
        : (paymentSnapshot?.chargedTotalCents ?? 0);

    const created = await this.orderFinalization.finalizeConfirmedPayment(
      checkout.snapshot,
      {
        attemptId: checkout.attemptId,
        orderStableId: checkout.orderStableId,
        cardSurchargeCents: surchargeCents,
        chargedTotalCents,
      },
    );

    checkout = await this.checkouts.markCompleted(checkout.attemptId);
    await this.orderOperations.activateImmediatePreparation(
      created.order.orderStableId,
      storeId,
    );
    if (checkout.externalAmountCents > 0) {
      // Financial finality and the order are already persisted; Welcome cannot undo them.
      await this.terminalPayments.completeCustomerInteraction('SUCCEEDED');
    }

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
    storeStableId: string,
    input: PosCardPaymentStartInput,
  ): PreparePaymentCheckoutInput {
    return {
      source: 'POS_TERMINAL',
      paymentMethod: 'CARD',
      storeId: storeStableId,
      attemptId: input.attemptId,
      clientIdempotencyKey: input.idempotencyKey,
      order: input.order,
    };
  }

  private toView(
    checkout: PreparedPaymentCheckout,
    payment?: PaymentTransaction,
    order?: ConfirmedPaymentOrderView,
    override?: Partial<
      Pick<
        PosCardPaymentView,
        'status' | 'failureCode' | 'failureMessage' | 'canResumeOriginalSale'
      >
    >,
  ): PosCardPaymentView {
    const paymentSnapshot = payment?.toSnapshot();
    const tender = checkout.snapshot.tender;
    return {
      attemptId: checkout.attemptId,
      paymentId: payment?.id ?? checkout.paymentTransactionId,
      status: override?.status ?? this.publicStatus(checkout.status),
      canResumeOriginalSale:
        override?.canResumeOriginalSale ??
        (payment
          ? this.terminalPayments.canResumeOriginal504Sale(payment)
          : false),
      terminalInteractionTimedOut:
        !!payment &&
        ['UNKNOWN', 'RECONCILING'].includes(payment.status) &&
        paymentSnapshot?.resultCode === 'CLOVER_TERMINAL_SALE_HTTP_504',
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

  private publish(storeStableId: string, view: PosCardPaymentView): void {
    try {
      this.paymentRealtime.publishCardPaymentStatus(storeStableId, view);
    } catch {
      // Realtime delivery is best-effort; persisted checkout/payment/order truth wins.
    }
  }
}
