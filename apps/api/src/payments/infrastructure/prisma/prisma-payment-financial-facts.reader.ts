import { Injectable } from '@nestjs/common';
import {
  PaymentOperation,
  PaymentProvider,
  PaymentSource,
  PaymentTransactionMethod,
  PaymentTransactionStatus,
  type Prisma,
} from '@prisma/client';

import type {
  PaymentFinancialFactV1,
  PaymentFinancialFactsRangeV1,
  PaymentFinancialFactsReaderPort,
  PaymentFinancialMethodV1,
  PaymentFinancialOperationV1,
  PaymentFinancialProviderV1,
  PaymentFinancialSourceV1,
} from '../../application/payment-financial-facts-reader.contract';
import { PrismaService } from '../../../prisma/prisma.service';

const PAYMENT_FINANCIAL_SELECT = {
  id: true,
  attemptId: true,
  provider: true,
  source: true,
  paymentMethod: true,
  operation: true,
  amountCents: true,
  surchargeCents: true,
  chargedTotalCents: true,
  refundedAmountCents: true,
  currency: true,
  externalPaymentId: true,
  providerPaymentId: true,
  providerRefundId: true,
  completedAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentTransactionSelect;

type PaymentFinancialRow = Prisma.PaymentTransactionGetPayload<{
  select: typeof PAYMENT_FINANCIAL_SELECT;
}>;

type CheckoutIdentity = {
  orderStableId: string;
  storeId: string;
};

const toProvider = (provider: PaymentProvider): PaymentFinancialProviderV1 => {
  switch (provider) {
    case PaymentProvider.CLOVER:
      return 'CLOVER';
    case PaymentProvider.MANUAL:
      return 'MANUAL';
    default:
      throw new Error(`Unsupported payment provider: ${String(provider)}`);
  }
};

const toSource = (source: PaymentSource): PaymentFinancialSourceV1 => {
  switch (source) {
    case PaymentSource.POS_TERMINAL:
      return 'POS_TERMINAL';
    case PaymentSource.WEB_ECOMMERCE:
      return 'WEB_ECOMMERCE';
    case PaymentSource.ADMIN:
      return 'ADMIN';
    case PaymentSource.PROVIDER_WEBHOOK:
      return 'PROVIDER_WEBHOOK';
    case PaymentSource.RECONCILIATION:
      return 'RECONCILIATION';
    default:
      throw new Error(`Unsupported payment source: ${String(source)}`);
  }
};

const toMethod = (
  method: PaymentTransactionMethod,
): PaymentFinancialMethodV1 => {
  switch (method) {
    case PaymentTransactionMethod.CASH:
      return 'CASH';
    case PaymentTransactionMethod.CARD:
      return 'CARD';
    case PaymentTransactionMethod.WECHAT_ALIPAY:
      return 'WECHAT_ALIPAY';
    case PaymentTransactionMethod.STORE_BALANCE:
      return 'STORE_BALANCE';
    case PaymentTransactionMethod.UBEREATS:
      return 'UBEREATS';
    default:
      throw new Error(`Unsupported payment method: ${String(method)}`);
  }
};

const toOperation = (
  operation: PaymentOperation,
): PaymentFinancialOperationV1 => {
  switch (operation) {
    case PaymentOperation.SALE:
      return 'SALE';
    case PaymentOperation.REFUND:
      return 'REFUND';
    case PaymentOperation.VOID:
      return 'VOID';
    default:
      throw new Error(`Unsupported payment operation: ${String(operation)}`);
  }
};

@Injectable()
export class PrismaPaymentFinancialFactsReader
  implements PaymentFinancialFactsReaderPort
{
  constructor(private readonly prisma: PrismaService) {}

  async readFactByAttemptId(
    attemptId: string,
  ): Promise<PaymentFinancialFactV1 | null> {
    const stableAttemptId = attemptId.trim();
    if (!stableAttemptId) return null;

    const row = await this.prisma.paymentTransaction.findFirst({
      where: {
        attemptId: stableAttemptId,
        status: PaymentTransactionStatus.SUCCEEDED,
        completedAt: { not: null },
      },
      select: PAYMENT_FINANCIAL_SELECT,
    });
    if (!row || !row.completedAt) return null;

    const identity = await this.readCheckoutIdentity(row.id);
    return this.toFact(row, identity, row.completedAt);
  }

  async readFactsForRange(
    range: PaymentFinancialFactsRangeV1,
  ): Promise<PaymentFinancialFactV1[]> {
    if (range.toExclusive <= range.fromInclusive) {
      throw new Error('toExclusive must be after fromInclusive');
    }

    const storeStableId = range.storeStableId?.trim();
    let restrictedPaymentIds: string[] | undefined;
    if (storeStableId) {
      const checkoutRows = await this.prisma.paymentCheckoutAttempt.findMany({
        where: {
          storeId: storeStableId,
          paymentTransactionId: { not: null },
        },
        select: { paymentTransactionId: true },
      });
      restrictedPaymentIds = checkoutRows.flatMap((row) =>
        row.paymentTransactionId ? [row.paymentTransactionId] : [],
      );
      if (restrictedPaymentIds.length === 0) return [];
    }

    const rows = await this.prisma.paymentTransaction.findMany({
      where: {
        status: PaymentTransactionStatus.SUCCEEDED,
        completedAt: {
          not: null,
          gte: range.fromInclusive,
          lt: range.toExclusive,
        },
        ...(restrictedPaymentIds
          ? { id: { in: restrictedPaymentIds } }
          : {}),
      },
      select: PAYMENT_FINANCIAL_SELECT,
      orderBy: [{ completedAt: 'asc' }, { attemptId: 'asc' }],
    });

    const identities = await this.readCheckoutIdentities(rows.map((row) => row.id));
    return rows.flatMap((row) => {
      if (!row.completedAt) return [];
      return [
        this.toFact(row, identities.get(row.id) ?? null, row.completedAt),
      ];
    });
  }

  private async readCheckoutIdentity(
    paymentTransactionId: string,
  ): Promise<CheckoutIdentity | null> {
    const row = await this.prisma.paymentCheckoutAttempt.findUnique({
      where: { paymentTransactionId },
      select: { orderStableId: true, storeId: true },
    });
    return row ?? null;
  }

  private async readCheckoutIdentities(
    paymentTransactionIds: string[],
  ): Promise<Map<string, CheckoutIdentity>> {
    if (paymentTransactionIds.length === 0) return new Map();
    const rows = await this.prisma.paymentCheckoutAttempt.findMany({
      where: { paymentTransactionId: { in: paymentTransactionIds } },
      select: {
        paymentTransactionId: true,
        orderStableId: true,
        storeId: true,
      },
    });
    return new Map(
      rows.flatMap((row) =>
        row.paymentTransactionId
          ? [
              [
                row.paymentTransactionId,
                {
                  orderStableId: row.orderStableId,
                  storeId: row.storeId,
                },
              ] as const,
            ]
          : [],
      ),
    );
  }

  private toFact(
    row: PaymentFinancialRow,
    identity: CheckoutIdentity | null,
    occurredAt: Date,
  ): PaymentFinancialFactV1 {
    return {
      version: 1,
      factStableId: row.attemptId,
      attemptId: row.attemptId,
      orderStableId: identity?.orderStableId ?? null,
      storeStableId: identity?.storeId ?? null,
      occurredAt,
      sourceUpdatedAt: row.updatedAt,
      provider: toProvider(row.provider),
      source: toSource(row.source),
      paymentMethod: toMethod(row.paymentMethod),
      operation: toOperation(row.operation),
      amountCents: row.amountCents,
      surchargeCents: row.surchargeCents,
      chargedTotalCents: row.chargedTotalCents,
      refundedAmountCents: row.refundedAmountCents,
      currency: row.currency,
      externalPaymentId: row.externalPaymentId,
      providerPaymentId: row.providerPaymentId,
      providerRefundId: row.providerRefundId,
    };
  }
}
