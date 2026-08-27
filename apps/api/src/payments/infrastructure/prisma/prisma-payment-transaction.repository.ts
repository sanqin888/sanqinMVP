import { Injectable } from '@nestjs/common';
import type { PaymentTransaction as PrismaPaymentTransactionRecord } from '@prisma/client';

import {
  PaymentProviderTransactionIdentityConflictError,
  type PaymentProviderTransactionLookup,
} from '../../application/payment-provider-transaction-lookup.port';
import type { PaymentReverseSyncPersistence } from '../../application/payment-reverse-sync-persistence.port';
import {
  PaymentTransactionUniquenessError,
  type PaymentTransactionRepository,
} from '../../application/payment-transaction.repository';
import { PaymentTransaction } from '../../domain/payment-transaction';
import {
  parsePaymentMethod,
  parsePaymentOperation,
  parsePaymentProviderName,
  parsePaymentSource,
  parsePaymentStatus,
  type PaymentProviderName,
  type PaymentStatus,
} from '../../domain/payment.types';
import { PrismaService } from '../../../prisma/prisma.service';

const toDomain = (row: PrismaPaymentTransactionRecord): PaymentTransaction =>
  PaymentTransaction.restore({
    id: row.id,
    attemptId: row.attemptId,
    idempotencyKey: row.idempotencyKey,
    orderId: row.orderId,
    checkoutIntentId: row.checkoutIntentId,
    provider: parsePaymentProviderName(row.provider),
    source: parsePaymentSource(row.source),
    paymentMethod: parsePaymentMethod(row.paymentMethod),
    operation: parsePaymentOperation(row.operation),
    amountCents: row.amountCents,
    surchargeCents: row.surchargeCents,
    chargedTotalCents: row.chargedTotalCents,
    refundedAmountCents: row.refundedAmountCents,
    currency: row.currency,
    status: parsePaymentStatus(row.status),
    externalPaymentId: row.externalPaymentId,
    providerPaymentId: row.providerPaymentId,
    providerRefundId: row.providerRefundId,
    providerOrderId: row.providerOrderId,
    resultCode: row.resultCode,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    terminalId: row.terminalId,
    cardBrand: row.cardBrand,
    cardLast4: row.cardLast4,
    processedAt: row.processedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

const uniqueField = (
  error: unknown,
): 'attemptId' | 'idempotencyKey' | 'externalPaymentId' | null => {
  if (
    !error ||
    typeof error !== 'object' ||
    !('code' in error) ||
    error.code !== 'P2002'
  ) {
    return null;
  }

  const meta = 'meta' in error ? error.meta : undefined;
  const target =
    meta && typeof meta === 'object' && 'target' in meta
      ? meta.target
      : undefined;
  const targetText = Array.isArray(target)
    ? target
        .filter((value): value is string => typeof value === 'string')
        .join(',')
    : typeof target === 'string'
      ? target
      : '';
  if (targetText.includes('attemptId')) return 'attemptId';
  if (targetText.includes('idempotencyKey')) return 'idempotencyKey';
  if (targetText.includes('externalPaymentId')) return 'externalPaymentId';
  return null;
};

@Injectable()
export class PrismaPaymentTransactionRepository
  implements
    PaymentTransactionRepository,
    PaymentProviderTransactionLookup,
    PaymentReverseSyncPersistence
{
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<PaymentTransaction | null> {
    const row = await this.prisma.paymentTransaction.findUnique({
      where: { id },
    });
    return row ? toDomain(row) : null;
  }

  async findByAttemptId(attemptId: string): Promise<PaymentTransaction | null> {
    const row = await this.prisma.paymentTransaction.findUnique({
      where: { attemptId },
    });
    return row ? toDomain(row) : null;
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<PaymentTransaction | null> {
    const row = await this.prisma.paymentTransaction.findUnique({
      where: { idempotencyKey },
    });
    return row ? toDomain(row) : null;
  }

  async findSaleByProviderPaymentId(
    provider: PaymentProviderName,
    providerPaymentId: string,
  ): Promise<PaymentTransaction | null> {
    const normalizedProviderPaymentId = providerPaymentId.trim();
    if (!normalizedProviderPaymentId) return null;
    const rows = await this.prisma.paymentTransaction.findMany({
      where: {
        provider,
        providerPaymentId: normalizedProviderPaymentId,
        operation: 'SALE',
      },
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    if (rows.length > 1) {
      throw new PaymentProviderTransactionIdentityConflictError(
        provider,
        normalizedProviderPaymentId,
      );
    }
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async create(transaction: PaymentTransaction): Promise<PaymentTransaction> {
    const snapshot = transaction.toSnapshot();
    try {
      const row = await this.prisma.paymentTransaction.create({
        data: {
          id: snapshot.id,
          attemptId: snapshot.attemptId,
          idempotencyKey: snapshot.idempotencyKey,
          orderId: snapshot.orderId,
          checkoutIntentId: snapshot.checkoutIntentId,
          provider: snapshot.provider,
          source: snapshot.source,
          paymentMethod: snapshot.paymentMethod,
          operation: snapshot.operation,
          amountCents: snapshot.amountCents,
          surchargeCents: snapshot.surchargeCents,
          chargedTotalCents: snapshot.chargedTotalCents,
          refundedAmountCents: snapshot.refundedAmountCents,
          currency: snapshot.currency,
          status: snapshot.status,
          externalPaymentId: snapshot.externalPaymentId ?? null,
          providerPaymentId: snapshot.providerPaymentId ?? null,
          providerRefundId: snapshot.providerRefundId ?? null,
          providerOrderId: snapshot.providerOrderId ?? null,
          resultCode: snapshot.resultCode,
          failureCode: snapshot.failureCode,
          failureMessage: snapshot.failureMessage,
          terminalId: snapshot.terminalId ?? null,
          cardBrand: snapshot.cardBrand ?? null,
          cardLast4: snapshot.cardLast4 ?? null,
          processedAt: snapshot.processedAt,
          completedAt: snapshot.completedAt,
          createdAt: snapshot.createdAt,
        },
      });
      return toDomain(row);
    } catch (error) {
      const field = uniqueField(error);
      if (field) throw new PaymentTransactionUniquenessError(field);
      throw error;
    }
  }

  async save(transaction: PaymentTransaction): Promise<PaymentTransaction> {
    const snapshot = transaction.toSnapshot();
    try {
      const row = await this.prisma.paymentTransaction.update({
        where: { id: snapshot.id },
        data: this.mutableData(transaction),
      });
      return toDomain(row);
    } catch (error) {
      const field = uniqueField(error);
      if (field) throw new PaymentTransactionUniquenessError(field);
      throw error;
    }
  }

  async saveIfCurrentStatus(
    transaction: PaymentTransaction,
    expectedStatus: PaymentStatus,
  ): Promise<{ updated: boolean; transaction: PaymentTransaction }> {
    const snapshot = transaction.toSnapshot();
    try {
      const result = await this.prisma.paymentTransaction.updateMany({
        where: { id: snapshot.id, status: expectedStatus },
        data: this.mutableData(transaction),
      });
      const current = await this.findById(snapshot.id);
      if (!current) {
        throw new Error(
          `Payment transaction ${snapshot.id} disappeared during save`,
        );
      }
      return { updated: result.count === 1, transaction: current };
    } catch (error) {
      const field = uniqueField(error);
      if (field) throw new PaymentTransactionUniquenessError(field);
      throw error;
    }
  }

  async saveSuccessfulSaleObservation(
    transaction: PaymentTransaction,
  ): Promise<{ updated: boolean; transaction: PaymentTransaction }> {
    const snapshot = transaction.toSnapshot();
    if (snapshot.status !== 'SUCCEEDED' || snapshot.operation !== 'SALE') {
      throw new Error(
        'Reverse-sync monotonic observation save requires a successful SALE transaction',
      );
    }

    try {
      const result = await this.prisma.paymentTransaction.updateMany({
        where: {
          id: snapshot.id,
          status: 'SUCCEEDED',
          refundedAmountCents: { lte: snapshot.refundedAmountCents },
        },
        data: this.mutableData(transaction),
      });
      const current = await this.findById(snapshot.id);
      if (!current) {
        throw new Error(
          `Payment transaction ${snapshot.id} disappeared during reverse-sync save`,
        );
      }
      return { updated: result.count === 1, transaction: current };
    } catch (error) {
      const field = uniqueField(error);
      if (field) throw new PaymentTransactionUniquenessError(field);
      throw error;
    }
  }

  private mutableData(transaction: PaymentTransaction) {
    const snapshot = transaction.toSnapshot();
    return {
      status: snapshot.status,
      surchargeCents: snapshot.surchargeCents,
      chargedTotalCents: snapshot.chargedTotalCents,
      refundedAmountCents: snapshot.refundedAmountCents,
      externalPaymentId: snapshot.externalPaymentId ?? null,
      providerPaymentId: snapshot.providerPaymentId ?? null,
      providerRefundId: snapshot.providerRefundId ?? null,
      providerOrderId: snapshot.providerOrderId ?? null,
      resultCode: snapshot.resultCode,
      failureCode: snapshot.failureCode,
      failureMessage: snapshot.failureMessage,
      terminalId: snapshot.terminalId ?? null,
      cardBrand: snapshot.cardBrand ?? null,
      cardLast4: snapshot.cardLast4 ?? null,
      processedAt: snapshot.processedAt,
      completedAt: snapshot.completedAt,
    };
  }
}
