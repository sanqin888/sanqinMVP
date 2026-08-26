import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type PaymentCheckoutAttempt as PaymentCheckoutAttemptRecord,
  type PaymentCheckoutAttemptStatus,
  type PaymentSource,
  type PaymentTransactionMethod,
} from '@prisma/client';
import type { CreateOrderInput } from '@shared/order';

import { LoyaltyService } from '../loyalty/loyalty.service';
import { MembershipService } from '../membership/membership.service';
import {
  OrdersService,
  type PreparedPaymentOrderSnapshot,
} from '../orders/orders.service';
import type { PaymentTransaction } from '../payments/domain/payment-transaction';
import { PrismaService } from '../prisma/prisma.service';

const PAYMENT_PREPARATION_TTL_MS = 20 * 60 * 1000;

export type PreparePaymentCheckoutInput = {
  source: 'POS_TERMINAL' | 'WEB_ECOMMERCE';
  paymentMethod: PaymentTransactionMethod;
  /** Business store identity: Store.storeStableId, never Store.id. */
  storeId: string;
  attemptId: string;
  clientIdempotencyKey: string;
  order: CreateOrderInput;
};

export type PreparedPaymentCheckout = {
  id: string;
  attemptId: string;
  idempotencyKey: string;
  source: PaymentSource;
  paymentMethod: PaymentTransactionMethod;
  /** Business store identity: Store.storeStableId, never Store.id. */
  storeId: string;
  status: PaymentCheckoutAttemptStatus;
  externalAmountCents: number;
  paymentTransactionId: string | null;
  plannedOrderId: string;
  orderId: string | null;
  orderStableId: string;
  expiresAt: Date;
  snapshot: PreparedPaymentOrderSnapshot;
};

type PaymentCheckoutRecord = PaymentCheckoutAttemptRecord;

@Injectable()
export class PaymentCheckoutAttemptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly loyalty: LoyaltyService,
    private readonly membership: MembershipService,
  ) {}

  async prepare(
    input: PreparePaymentCheckoutInput,
  ): Promise<PreparedPaymentCheckout> {
    const normalized = this.normalizeInput(input);
    const identity = this.buildIdentity(normalized);
    const existing = await this.prisma.paymentCheckoutAttempt.findUnique({
      where: { attemptId: normalized.attemptId },
    });
    if (existing) {
      this.assertIdentity(existing.idempotencyKey, identity);
      return this.resumePreparation(this.mapRecord(existing));
    }

    await this.releaseExpiredPreProviderAttempts(normalized.storeId);

    const snapshot = await this.orders.preparePaymentOrder(
      normalized.order,
      normalized.storeId,
    );
    const expiresAt = new Date(Date.now() + PAYMENT_PREPARATION_TTL_MS);
    const orderStableId = this.orderStableIdForAttempt(normalized.attemptId);
    const plannedOrderId = randomUUID();

    try {
      const created = await this.prisma.paymentCheckoutAttempt.create({
        data: {
          attemptId: normalized.attemptId,
          idempotencyKey: identity,
          source: normalized.source,
          storeId: normalized.storeId,
          paymentMethod: normalized.paymentMethod,
          currency: 'CAD',
          orderDraftJson: this.toJson({
            version: snapshot.version,
            order: snapshot.order,
            userId: snapshot.userId,
            storeId: snapshot.storeId,
            items: snapshot.items,
            promotionSnapshot: snapshot.promotionSnapshot,
            coupon: snapshot.coupon,
            preparedAt: snapshot.preparedAt,
          }),
          pricingSnapshotJson: this.toJson(snapshot.pricing),
          tenderAllocationJson: this.toJson(snapshot.tender),
          externalAmountCents: snapshot.tender.externalCents,
          plannedOrderId,
          orderStableId,
          expiresAt,
        },
      });
      return this.completeReservations(this.mapRecord(created));
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;

      const winner = await this.prisma.paymentCheckoutAttempt.findFirst({
        where: {
          OR: [
            { attemptId: normalized.attemptId },
            { idempotencyKey: identity },
          ],
        },
      });
      if (!winner) throw error;
      this.assertIdentity(winner.idempotencyKey, identity);
      if (winner.attemptId !== normalized.attemptId) {
        throw new ConflictException({
          code: 'PAYMENT_IDEMPOTENCY_REUSED_WITH_NEW_ATTEMPT',
          message:
            'The same payment idempotency identity was reused with a different attemptId.',
          savedAttemptId: winner.attemptId,
        });
      }
      return this.resumePreparation(this.mapRecord(winner));
    }
  }

  async requireForInput(
    input: PreparePaymentCheckoutInput,
  ): Promise<PreparedPaymentCheckout> {
    const normalized = this.normalizeInput(input);
    const record = await this.prisma.paymentCheckoutAttempt.findUnique({
      where: { attemptId: normalized.attemptId },
    });
    if (!record) {
      throw new NotFoundException({
        code: 'PAYMENT_CHECKOUT_NOT_FOUND',
        message: 'Payment checkout attempt was not found',
      });
    }
    this.assertIdentity(record.idempotencyKey, this.buildIdentity(normalized));
    return this.resumePreparation(this.mapRecord(record));
  }

  async findByAttemptId(
    attemptIdRaw: string,
  ): Promise<PreparedPaymentCheckout> {
    const attemptId = attemptIdRaw.trim();
    const record = await this.prisma.paymentCheckoutAttempt.findUnique({
      where: { attemptId },
    });
    if (!record) {
      throw new NotFoundException({
        code: 'PAYMENT_CHECKOUT_NOT_FOUND',
        message: 'Payment checkout attempt was not found',
      });
    }
    return this.mapRecord(record);
  }

  async claimProviderStart(attemptId: string): Promise<{
    checkout: PreparedPaymentCheckout;
    claimed: boolean;
  }> {
    const claimed = await this.prisma.paymentCheckoutAttempt.updateMany({
      where: { attemptId, status: 'PREPARED' },
      data: { status: 'PROCESSING' },
    });
    return {
      checkout: await this.findByAttemptId(attemptId),
      claimed: claimed.count === 1,
    };
  }

  async markFromPayment(
    attemptId: string,
    payment: PaymentTransaction,
  ): Promise<PreparedPaymentCheckout> {
    const checkout = await this.findByAttemptId(attemptId);
    const paymentSnapshot = payment.toSnapshot();
    if (
      paymentSnapshot.attemptId !== checkout.attemptId ||
      paymentSnapshot.idempotencyKey !== checkout.idempotencyKey ||
      paymentSnapshot.source !== checkout.source ||
      paymentSnapshot.paymentMethod !== checkout.paymentMethod ||
      paymentSnapshot.amountCents !== checkout.externalAmountCents ||
      paymentSnapshot.currency !== 'CAD'
    ) {
      throw new ConflictException({
        code: 'PAYMENT_TRANSACTION_CHECKOUT_MISMATCH',
        message:
          'Payment transaction facts do not match the prepared checkout attempt.',
      });
    }

    if (checkout.status === 'COMPLETED') return checkout;
    if (checkout.status === 'FINALIZING' && payment.status === 'SUCCEEDED') {
      return checkout;
    }

    const status = this.checkoutStatusForPayment(payment.status);
    const updated = await this.prisma.paymentCheckoutAttempt.update({
      where: { attemptId },
      data: {
        status,
        paymentTransactionId: payment.id,
      },
    });
    return this.mapRecord(updated);
  }

  async cancelBeforeProvider(attemptId: string): Promise<{
    checkout: PreparedPaymentCheckout;
    cancelled: boolean;
  }> {
    const cancelled = await this.prisma.paymentCheckoutAttempt.updateMany({
      where: { attemptId, status: 'PREPARED' },
      data: { status: 'CANCELLED' },
    });
    if (cancelled.count === 1) {
      await this.releaseReservations(attemptId);
    }
    return {
      checkout: await this.findByAttemptId(attemptId),
      cancelled: cancelled.count === 1,
    };
  }

  async markSucceededWithoutExternalPayment(
    attemptId: string,
  ): Promise<PreparedPaymentCheckout> {
    await this.prisma.paymentCheckoutAttempt.updateMany({
      where: {
        attemptId,
        externalAmountCents: 0,
        status: { in: ['PREPARED', 'PROCESSING'] },
      },
      data: { status: 'SUCCEEDED' },
    });
    return this.findByAttemptId(attemptId);
  }

  async markFinalizing(attemptId: string): Promise<PreparedPaymentCheckout> {
    await this.prisma.paymentCheckoutAttempt.updateMany({
      where: {
        attemptId,
        status: { in: ['SUCCEEDED', 'FINALIZING'] },
      },
      data: { status: 'FINALIZING' },
    });
    return this.findByAttemptId(attemptId);
  }

  async markCompleted(params: {
    attemptId: string;
    orderId: string;
  }): Promise<PreparedPaymentCheckout> {
    const updated = await this.prisma.paymentCheckoutAttempt.update({
      where: { attemptId: params.attemptId },
      data: {
        status: 'COMPLETED',
        orderId: params.orderId,
        finalizedAt: new Date(),
      },
    });
    return this.mapRecord(updated);
  }

  async markDefinitiveFailureAndRelease(
    attemptId: string,
    status: 'DECLINED' | 'CANCELLED' | 'FAILED',
  ): Promise<PreparedPaymentCheckout> {
    const allowedCurrentStatuses: PaymentCheckoutAttemptStatus[] =
      status === 'FAILED' ? ['PREPARED', 'FAILED'] : [status];
    const failed = await this.prisma.paymentCheckoutAttempt.updateMany({
      where: {
        attemptId,
        status: { in: allowedCurrentStatuses },
      },
      data: { status },
    });
    if (failed.count === 1) {
      await this.releaseReservations(attemptId);
    }
    return this.findByAttemptId(attemptId);
  }

  async releaseReservations(attemptId: string): Promise<void> {
    await Promise.all([
      this.loyalty.releasePaymentTender(attemptId),
      this.membership.releasePaymentCoupons(attemptId),
    ]);
  }

  private async releaseExpiredPreProviderAttempts(
    storeId: string,
  ): Promise<void> {
    const expired = await this.prisma.paymentCheckoutAttempt.findMany({
      where: {
        storeId,
        expiresAt: { lt: new Date() },
        status: { in: ['PREPARING', 'PREPARED'] },
      },
      orderBy: { expiresAt: 'asc' },
      take: 20,
      select: { id: true, attemptId: true },
    });

    for (const candidate of expired) {
      const failed = await this.prisma.paymentCheckoutAttempt.updateMany({
        where: {
          id: candidate.id,
          status: { in: ['PREPARING', 'PREPARED'] },
        },
        data: { status: 'FAILED' },
      });
      if (failed.count === 1) {
        await this.releaseReservations(candidate.attemptId);
      }
    }
  }

  private async resumePreparation(
    checkout: PreparedPaymentCheckout,
  ): Promise<PreparedPaymentCheckout> {
    if (
      (checkout.status === 'PREPARING' || checkout.status === 'PREPARED') &&
      checkout.expiresAt.getTime() < Date.now()
    ) {
      const expired = await this.prisma.paymentCheckoutAttempt.updateMany({
        where: {
          id: checkout.id,
          status: checkout.status,
        },
        data: { status: 'FAILED' },
      });
      if (expired.count === 1) {
        await this.releaseReservations(checkout.attemptId);
        throw new ConflictException({
          code: 'PAYMENT_PREPARATION_EXPIRED',
          message: 'Payment preparation expired before provider processing.',
        });
      }
      checkout = await this.findByAttemptId(checkout.attemptId);
    }

    if (checkout.status !== 'PREPARING') return checkout;
    return this.completeReservations(checkout);
  }

  private async completeReservations(
    checkout: PreparedPaymentCheckout,
  ): Promise<PreparedPaymentCheckout> {
    if (checkout.status !== 'PREPARING') return checkout;
    const snapshot = checkout.snapshot;
    try {
      await this.loyalty.holdPaymentTender({
        attemptId: checkout.attemptId,
        userStableId: snapshot.order.userStableId,
        pointsValueCents: snapshot.tender.pointsCents,
        balanceCents: snapshot.tender.balanceCents,
        expiresAt: checkout.expiresAt,
      });
      await this.membership.holdPaymentCoupons({
        attemptId: checkout.attemptId,
        userId: snapshot.userId ?? undefined,
        userStableId: snapshot.order.userStableId,
        couponStableId: snapshot.order.couponStableId,
        selectedUserCouponId: snapshot.order.selectedUserCouponId,
        expiresAt: checkout.expiresAt,
      });
      const prepared = await this.prisma.paymentCheckoutAttempt.updateMany({
        where: { id: checkout.id, status: 'PREPARING' },
        data: { status: 'PREPARED' },
      });
      if (prepared.count === 0) {
        const current = await this.findByAttemptId(checkout.attemptId);
        if (current.status === 'FAILED' || current.status === 'CANCELLED') {
          await this.releaseReservations(checkout.attemptId);
        }
        return current;
      }
      return this.findByAttemptId(checkout.attemptId);
    } catch (error) {
      await this.releaseReservations(checkout.attemptId);
      await this.prisma.paymentCheckoutAttempt.updateMany({
        where: { id: checkout.id, status: 'PREPARING' },
        data: { status: 'FAILED' },
      });
      throw error;
    }
  }

  private mapRecord(record: PaymentCheckoutRecord): PreparedPaymentCheckout {
    const draft = record.orderDraftJson as Record<string, unknown>;
    const snapshot = {
      version: draft.version,
      order: draft.order,
      userId: draft.userId,
      storeId: draft.storeId,
      items: draft.items,
      promotionSnapshot: draft.promotionSnapshot,
      coupon: draft.coupon,
      preparedAt: draft.preparedAt,
      pricing: record.pricingSnapshotJson,
      tender: record.tenderAllocationJson,
    } as PreparedPaymentOrderSnapshot;

    return {
      id: record.id,
      attemptId: record.attemptId,
      idempotencyKey: record.idempotencyKey,
      source: record.source,
      paymentMethod: record.paymentMethod,
      storeId: record.storeId,
      status: record.status,
      externalAmountCents: record.externalAmountCents,
      paymentTransactionId: record.paymentTransactionId,
      plannedOrderId: record.plannedOrderId,
      orderId: record.orderId,
      orderStableId: record.orderStableId,
      expiresAt: record.expiresAt,
      snapshot,
    };
  }

  private checkoutStatusForPayment(
    status: PaymentTransaction['status'],
  ): PaymentCheckoutAttemptStatus {
    switch (status) {
      case 'CREATED':
        return 'PREPARED';
      case 'PROCESSING':
        return 'PROCESSING';
      case 'SUCCEEDED':
        return 'SUCCEEDED';
      case 'DECLINED':
        return 'DECLINED';
      case 'CANCELLED':
        return 'CANCELLED';
      case 'UNKNOWN':
        return 'UNKNOWN';
      case 'RECONCILING':
        return 'RECONCILING';
      case 'FAILED':
        return 'FAILED';
    }
  }

  private normalizeInput(input: PreparePaymentCheckoutInput) {
    const attemptId = input.attemptId.trim();
    const storeStableId = input.storeId.trim();
    const clientIdempotencyKey = input.clientIdempotencyKey.trim();
    if (!attemptId || !storeStableId || !clientIdempotencyKey) {
      throw new BadRequestException(
        'attemptId, storeId and idempotencyKey are required',
      );
    }
    return {
      ...input,
      attemptId,
      storeId: storeStableId,
      clientIdempotencyKey,
    };
  }

  private buildIdentity(input: {
    source: PreparePaymentCheckoutInput['source'];
    paymentMethod: PaymentTransactionMethod;
    storeId: string;
    clientIdempotencyKey: string;
    order: CreateOrderInput;
  }): string {
    const canonicalOrder = JSON.stringify(this.canonicalize(input.order));
    const digest = createHash('sha256')
      .update(
        `${input.source}\n${input.paymentMethod}\n${input.storeId}\n${input.clientIdempotencyKey}\n${canonicalOrder}`,
      )
      .digest('hex');
    return `checkout_${digest}`;
  }

  private orderStableIdForAttempt(attemptId: string): string {
    const suffix = createHash('sha256')
      .update(`payment-order:${attemptId}`)
      .digest('hex')
      .slice(0, 24);
    return `c${suffix}`;
  }

  private assertIdentity(saved: string, incoming: string): void {
    if (saved === incoming) return;
    throw new ConflictException({
      code: 'PAYMENT_CHECKOUT_IDENTITY_MISMATCH',
      message: 'Payment attempt identity does not match the saved checkout.',
    });
  }

  private canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.canonicalize(item));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, this.canonicalize(item)]),
      );
    }
    return value;
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
