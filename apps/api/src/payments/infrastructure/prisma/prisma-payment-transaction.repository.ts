import { Injectable } from '@nestjs/common';
import type { PaymentTransaction as PrismaPaymentTransactionRecord } from '@prisma/client';

import {
  PaymentProviderTransactionIdentityConflictError,
  type PaymentProviderTransactionLookup,
} from '../../application/payment-provider-transaction-lookup.port';
import type { PaymentReverseSyncPersistence } from '../../application/payment-reverse-sync-persistence.port';
import type {
  PaymentFinancialFactV1,
  PaymentFinancialFactsRangeV1,
  PaymentFinancialFactsReaderPort,
} from '../../application/payment-financial-facts-reader.contract';
import type {
  PaymentReversalFinancialFactV1,
  PaymentReversalFinancialFactsRangeV1,
  PaymentReversalFinancialFactsReaderPort,
} from '../../application/payment-reversal-financial-facts-reader.contract';
import {
  PAYMENT_PROVIDER_WEBHOOK_EVENT_SOURCE,
  PAYMENT_REVERSE_SYNC_COMPLETED_EVENT,
  paymentWebhookEventIdempotencyKey,
} from '../../application/payment-webhook-event.repository';
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
    tipCents: row.tipCents,
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

type PaymentCheckoutIdentity = {
  orderStableId: string;
  storeId: string;
};

type PaymentFinancialContext = {
  originalSale: PrismaPaymentTransactionRecord | null;
  identity: PaymentCheckoutIdentity | null;
};

type PaymentWebhookReversalPayload = {
  providerEventId: string;
  provider: PaymentReversalFinancialFactV1['provider'];
  providerPaymentId: string;
  externalReversal: PaymentReversalFinancialFactV1['kind'] | 'NONE';
  attemptId: string;
  paymentSource: PaymentReversalFinancialFactV1['originalPaymentSource'];
  paymentMethod: PaymentReversalFinancialFactV1['paymentMethod'];
  currency: string;
  externalPaymentId: string | null;
  previousRefundedAmountCents: number;
  refundedAmountCents: number;
  refundedDeltaCents: number;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const nonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const nonNegativeInteger = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;

const isReversalProvider = (
  value: unknown,
): value is PaymentReversalFinancialFactV1['provider'] =>
  value === 'CLOVER' || value === 'MANUAL';

const isReversalSource = (
  value: unknown,
): value is PaymentReversalFinancialFactV1['originalPaymentSource'] =>
  value === 'POS_TERMINAL' ||
  value === 'WEB_ECOMMERCE' ||
  value === 'ADMIN' ||
  value === 'PROVIDER_WEBHOOK' ||
  value === 'RECONCILIATION';

const isReversalMethod = (
  value: unknown,
): value is PaymentReversalFinancialFactV1['paymentMethod'] =>
  value === 'CASH' ||
  value === 'CARD' ||
  value === 'WECHAT_ALIPAY' ||
  value === 'STORE_BALANCE' ||
  value === 'UBEREATS';

const isReversalKind = (
  value: unknown,
): value is PaymentReversalFinancialFactV1['kind'] =>
  value === 'PARTIAL_REFUND' || value === 'FULL_REFUND' || value === 'VOID';

const managedReversalFactStableId = (attemptId: string): string =>
  `payment-reversal:managed:${attemptId}:v1`;
const webhookReversalFactStableId = (eventId: string): string =>
  `payment-reversal:webhook:${eventId}:v1`;

const managedAttemptIdFromFactStableId = (
  factStableId: string,
): string | null => {
  const prefix = 'payment-reversal:managed:';
  const suffix = ':v1';
  if (!factStableId.startsWith(prefix) || !factStableId.endsWith(suffix)) {
    return null;
  }
  return nonEmptyString(factStableId.slice(prefix.length, -suffix.length));
};

const webhookEventIdFromFactStableId = (
  factStableId: string,
): string | null => {
  const prefix = 'payment-reversal:webhook:';
  const suffix = ':v1';
  if (!factStableId.startsWith(prefix) || !factStableId.endsWith(suffix)) {
    return null;
  }
  return nonEmptyString(factStableId.slice(prefix.length, -suffix.length));
};

const parseWebhookReversalPayload = (
  payload: unknown,
): PaymentWebhookReversalPayload | null => {
  const value = asRecord(payload);
  if (!value) return null;
  const providerEventId = nonEmptyString(value.providerEventId);
  const providerPaymentId = nonEmptyString(value.providerPaymentId);
  const attemptId = nonEmptyString(value.attemptId);
  const currency = nonEmptyString(value.currency);
  const previousRefundedAmountCents = nonNegativeInteger(
    value.previousRefundedAmountCents,
  );
  const refundedAmountCents = nonNegativeInteger(value.refundedAmountCents);
  const refundedDeltaCents = nonNegativeInteger(value.refundedDeltaCents);
  if (
    !providerEventId ||
    !isReversalProvider(value.provider) ||
    !providerPaymentId ||
    (!isReversalKind(value.externalReversal) &&
      value.externalReversal !== 'NONE') ||
    !attemptId ||
    !isReversalSource(value.paymentSource) ||
    !isReversalMethod(value.paymentMethod) ||
    !currency ||
    previousRefundedAmountCents === null ||
    refundedAmountCents === null ||
    refundedDeltaCents === null ||
    refundedAmountCents < previousRefundedAmountCents ||
    refundedAmountCents - previousRefundedAmountCents !== refundedDeltaCents
  ) {
    return null;
  }
  return {
    providerEventId,
    provider: value.provider,
    providerPaymentId,
    externalReversal: value.externalReversal,
    attemptId,
    paymentSource: value.paymentSource,
    paymentMethod: value.paymentMethod,
    currency: currency.toUpperCase(),
    externalPaymentId:
      value.externalPaymentId === null
        ? null
        : nonEmptyString(value.externalPaymentId),
    previousRefundedAmountCents,
    refundedAmountCents,
    refundedDeltaCents,
  };
};

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
    PaymentReverseSyncPersistence,
    PaymentFinancialFactsReaderPort,
    PaymentReversalFinancialFactsReaderPort
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

  async readFactByAttemptId(
    attemptId: string,
  ): Promise<PaymentFinancialFactV1 | null> {
    const stableAttemptId = attemptId.trim();
    if (!stableAttemptId) return null;

    const row = await this.prisma.paymentTransaction.findFirst({
      where: {
        attemptId: stableAttemptId,
        status: 'SUCCEEDED',
        completedAt: { not: null },
      },
    });
    if (!row?.completedAt) return null;

    const contexts = await this.readFinancialContexts([row]);
    const context = contexts.get(row.id) ?? {
      originalSale: null,
      identity: null,
    };
    this.assertFinalTransactionIdentity(row, context);
    return this.toFinancialFact(row, context.identity, row.completedAt);
  }

  async readFactsByOrderStableIds(
    orderStableIds: string[],
  ): Promise<PaymentFinancialFactV1[]> {
    const stableIds = [
      ...new Set(orderStableIds.map((value) => value.trim()).filter(Boolean)),
    ].sort();
    if (stableIds.length === 0) return [];

    const checkoutRows = await this.prisma.paymentCheckoutAttempt.findMany({
      where: {
        orderStableId: { in: stableIds },
        paymentTransactionId: { not: null },
      },
      select: {
        paymentTransactionId: true,
      },
    });
    const saleIds = checkoutRows.flatMap(({ paymentTransactionId }) =>
      paymentTransactionId ? [paymentTransactionId] : [],
    );
    if (saleIds.length === 0) return [];

    const saleRows = await this.prisma.paymentTransaction.findMany({
      where: {
        id: { in: saleIds },
        operation: 'SALE',
        status: 'SUCCEEDED',
        completedAt: { not: null },
      },
    });
    const providerPairs = saleRows.flatMap((row) =>
      row.providerPaymentId
        ? [{ provider: row.provider, providerPaymentId: row.providerPaymentId }]
        : [],
    );
    const reversalRows =
      providerPairs.length === 0
        ? []
        : await this.prisma.paymentTransaction.findMany({
            where: {
              operation: { in: ['REFUND', 'VOID'] },
              status: 'SUCCEEDED',
              completedAt: { not: null },
              OR: providerPairs,
            },
          });
    const rows = [...saleRows, ...reversalRows];
    const contexts = await this.readFinancialContexts(rows);
    const requested = new Set(stableIds);

    return rows
      .flatMap((row) => {
        if (!row.completedAt) return [];
        const context = contexts.get(row.id) ?? {
          originalSale: null,
          identity: null,
        };
        this.assertFinalTransactionIdentity(row, context);
        if (
          !context.identity ||
          !requested.has(context.identity.orderStableId)
        ) {
          return [];
        }
        return [this.toFinancialFact(row, context.identity, row.completedAt)];
      })
      .sort(
        (left, right) =>
          left.occurredAt.getTime() - right.occurredAt.getTime() ||
          left.factStableId.localeCompare(right.factStableId),
      );
  }

  async readFactsForRange(
    range: PaymentFinancialFactsRangeV1,
  ): Promise<PaymentFinancialFactV1[]> {
    if (range.toExclusive <= range.fromInclusive) {
      throw new Error('toExclusive must be after fromInclusive');
    }

    const storeStableId = range.storeStableId?.trim();
    const rows = await this.prisma.paymentTransaction.findMany({
      where: {
        status: 'SUCCEEDED',
        completedAt: {
          not: null,
          gte: range.fromInclusive,
          lt: range.toExclusive,
        },
      },
      orderBy: [{ completedAt: 'asc' }, { attemptId: 'asc' }],
    });
    const contexts = await this.readFinancialContexts(rows);

    return rows.flatMap((row) => {
      if (!row.completedAt) return [];
      const context = contexts.get(row.id) ?? {
        originalSale: null,
        identity: null,
      };
      this.assertFinalTransactionIdentity(row, context);
      if (storeStableId && context.identity?.storeId !== storeStableId) {
        return [];
      }
      return [this.toFinancialFact(row, context.identity, row.completedAt)];
    });
  }

  async readReversalFactByStableId(
    factStableId: string,
  ): Promise<PaymentReversalFinancialFactV1 | null> {
    const stableId = factStableId.trim();
    if (!stableId) return null;

    const managedAttemptId = managedAttemptIdFromFactStableId(stableId);
    if (managedAttemptId) {
      const row = await this.prisma.paymentTransaction.findFirst({
        where: {
          attemptId: managedAttemptId,
          operation: { in: ['REFUND', 'VOID'] },
          status: 'SUCCEEDED',
          completedAt: { not: null },
        },
      });
      if (!row) return null;
      const contexts = await this.readFinancialContexts([row]);
      return this.toManagedReversalFact(
        row,
        contexts.get(row.id) ?? { originalSale: null, identity: null },
      );
    }

    const providerEventId = webhookEventIdFromFactStableId(stableId);
    if (!providerEventId) return null;
    const event = await this.prisma.opsEvent.findUnique({
      where: {
        idempotencyKey: paymentWebhookEventIdempotencyKey(providerEventId),
      },
      select: {
        source: true,
        eventName: true,
        payload: true,
        occurredAt: true,
      },
    });
    if (!event) return null;
    if (
      event.source !== PAYMENT_PROVIDER_WEBHOOK_EVENT_SOURCE ||
      event.eventName !== PAYMENT_REVERSE_SYNC_COMPLETED_EVENT
    ) {
      throw new Error(
        `Payment webhook reversal fact identity points to the wrong event: ${providerEventId}`,
      );
    }
    const fact = await this.toWebhookReversalFact(
      event.payload,
      event.occurredAt,
    );
    return fact?.factStableId === stableId ? fact : null;
  }

  async readReversalFactsByOrderStableIds(
    orderStableIds: string[],
  ): Promise<PaymentReversalFinancialFactV1[]> {
    const stableIds = [
      ...new Set(orderStableIds.map((value) => value.trim()).filter(Boolean)),
    ].sort();
    if (stableIds.length === 0) return [];

    const paymentFacts = await this.readFactsByOrderStableIds(stableIds);
    const requested = new Set(stableIds);
    const originalSaleAttemptIds = [
      ...new Set(
        paymentFacts
          .filter((fact) => fact.operation === 'SALE')
          .map((fact) => fact.attemptId),
      ),
    ].sort();
    const managedFacts: PaymentReversalFinancialFactV1[] = [];
    for (const fact of paymentFacts) {
      if (fact.operation !== 'REFUND' && fact.operation !== 'VOID') continue;
      const reversal = await this.readReversalFactByStableId(
        managedReversalFactStableId(fact.attemptId),
      );
      if (reversal?.orderStableId && requested.has(reversal.orderStableId)) {
        managedFacts.push(reversal);
      }
    }

    const webhookRows =
      originalSaleAttemptIds.length === 0
        ? []
        : await this.prisma.opsEvent.findMany({
            where: {
              source: PAYMENT_PROVIDER_WEBHOOK_EVENT_SOURCE,
              eventName: PAYMENT_REVERSE_SYNC_COMPLETED_EVENT,
              OR: originalSaleAttemptIds.map((attemptId) => ({
                payload: { path: ['attemptId'], equals: attemptId },
              })),
            },
            select: { payload: true, occurredAt: true },
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          });
    const webhookFacts: PaymentReversalFinancialFactV1[] = [];
    for (const event of webhookRows) {
      const fact = await this.toWebhookReversalFact(
        event.payload,
        event.occurredAt,
      );
      if (!fact?.orderStableId || !requested.has(fact.orderStableId)) continue;
      webhookFacts.push(fact);
    }

    const unique = new Map<string, PaymentReversalFinancialFactV1>();
    for (const fact of [...managedFacts, ...webhookFacts]) {
      unique.set(fact.factStableId, fact);
    }
    const facts = [...unique.values()].sort(
      (left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() ||
        left.factStableId.localeCompare(right.factStableId),
    );
    this.assertReversalFactTotals(facts);
    return facts;
  }

  async readReversalFactsForRange(
    range: PaymentReversalFinancialFactsRangeV1,
  ): Promise<PaymentReversalFinancialFactV1[]> {
    if (range.toExclusive <= range.fromInclusive) {
      throw new Error('toExclusive must be after fromInclusive');
    }
    const storeStableId = range.storeStableId?.trim();

    const managedRows = await this.prisma.paymentTransaction.findMany({
      where: {
        operation: { in: ['REFUND', 'VOID'] },
        status: 'SUCCEEDED',
        completedAt: {
          not: null,
          gte: range.fromInclusive,
          lt: range.toExclusive,
        },
      },
      orderBy: [{ completedAt: 'asc' }, { attemptId: 'asc' }],
    });
    const managedContexts = await this.readFinancialContexts(managedRows);
    const managedFacts = managedRows.flatMap((row) => {
      const fact = this.toManagedReversalFact(
        row,
        managedContexts.get(row.id) ?? { originalSale: null, identity: null },
      );
      if (storeStableId && fact.storeStableId !== storeStableId) return [];
      return [fact];
    });

    const webhookRows = await this.prisma.opsEvent.findMany({
      where: {
        source: PAYMENT_PROVIDER_WEBHOOK_EVENT_SOURCE,
        eventName: PAYMENT_REVERSE_SYNC_COMPLETED_EVENT,
        occurredAt: { gte: range.fromInclusive, lt: range.toExclusive },
      },
      select: { payload: true, occurredAt: true },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    const webhookFacts: PaymentReversalFinancialFactV1[] = [];
    for (const event of webhookRows) {
      const fact = await this.toWebhookReversalFact(
        event.payload,
        event.occurredAt,
      );
      if (!fact) continue;
      if (storeStableId && fact.storeStableId !== storeStableId) continue;
      webhookFacts.push(fact);
    }

    const facts = [...managedFacts, ...webhookFacts].sort(
      (left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() ||
        left.factStableId.localeCompare(right.factStableId),
    );
    this.assertReversalFactTotals(facts);
    return facts;
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
          tipCents: snapshot.tipCents,
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

  private async readFinancialContexts(
    rows: PrismaPaymentTransactionRecord[],
  ): Promise<Map<string, PaymentFinancialContext>> {
    if (rows.length === 0) return new Map();

    const reversalKeys = new Map<
      string,
      {
        provider: PrismaPaymentTransactionRecord['provider'];
        providerPaymentId: string;
      }
    >();
    for (const row of rows) {
      if (row.operation === 'SALE' || !row.providerPaymentId) continue;
      reversalKeys.set(
        this.providerPaymentKey(row.provider, row.providerPaymentId),
        { provider: row.provider, providerPaymentId: row.providerPaymentId },
      );
    }

    const correlatedSales =
      reversalKeys.size === 0
        ? []
        : await this.prisma.paymentTransaction.findMany({
            where: {
              operation: 'SALE',
              OR: [...reversalKeys.values()].map((key) => ({
                provider: key.provider,
                providerPaymentId: key.providerPaymentId,
              })),
            },
          });
    const saleByProviderPayment = new Map<
      string,
      PrismaPaymentTransactionRecord
    >();
    for (const sale of correlatedSales) {
      if (!sale.providerPaymentId) continue;
      const key = this.providerPaymentKey(
        sale.provider,
        sale.providerPaymentId,
      );
      if (saleByProviderPayment.has(key)) {
        throw new PaymentProviderTransactionIdentityConflictError(
          parsePaymentProviderName(sale.provider),
          sale.providerPaymentId,
        );
      }
      saleByProviderPayment.set(key, sale);
    }

    const originalSaleByTransactionId = new Map<
      string,
      PrismaPaymentTransactionRecord | null
    >();
    const originalSaleIds = new Set<string>();
    for (const row of rows) {
      const originalSale =
        row.operation === 'SALE'
          ? row
          : row.providerPaymentId
            ? (saleByProviderPayment.get(
                this.providerPaymentKey(row.provider, row.providerPaymentId),
              ) ?? null)
            : null;
      originalSaleByTransactionId.set(row.id, originalSale);
      if (originalSale) originalSaleIds.add(originalSale.id);
    }

    const checkoutRows =
      originalSaleIds.size === 0
        ? []
        : await this.prisma.paymentCheckoutAttempt.findMany({
            where: { paymentTransactionId: { in: [...originalSaleIds] } },
            select: {
              paymentTransactionId: true,
              orderStableId: true,
              storeId: true,
            },
          });
    const identityBySaleId = new Map<string, PaymentCheckoutIdentity>();
    for (const checkout of checkoutRows) {
      if (!checkout.paymentTransactionId) continue;
      identityBySaleId.set(checkout.paymentTransactionId, {
        orderStableId: checkout.orderStableId,
        storeId: checkout.storeId,
      });
    }

    return new Map(
      rows.map((row) => {
        const originalSale = originalSaleByTransactionId.get(row.id) ?? null;
        return [
          row.id,
          {
            originalSale,
            identity: originalSale
              ? (identityBySaleId.get(originalSale.id) ?? null)
              : null,
          },
        ] as const;
      }),
    );
  }

  private providerPaymentKey(
    provider: PrismaPaymentTransactionRecord['provider'],
    providerPaymentId: string,
  ): string {
    return `${provider}:${providerPaymentId}`;
  }

  private assertFinalTransactionIdentity(
    row: PrismaPaymentTransactionRecord,
    context: PaymentFinancialContext,
  ): void {
    if (
      row.operation !== 'SALE' &&
      (!context.originalSale || !context.identity)
    ) {
      throw new Error(
        `Final Payment reversal cannot resolve stable checkout identity: ${row.attemptId}`,
      );
    }
  }

  private toManagedReversalFact(
    row: PrismaPaymentTransactionRecord,
    context: PaymentFinancialContext,
  ): PaymentReversalFinancialFactV1 {
    const originalSale = context.originalSale;
    const identity = context.identity;
    if (
      (row.operation !== 'REFUND' && row.operation !== 'VOID') ||
      row.status !== 'SUCCEEDED' ||
      !row.completedAt ||
      !row.providerPaymentId ||
      !originalSale ||
      originalSale.operation !== 'SALE' ||
      originalSale.status !== 'SUCCEEDED' ||
      originalSale.provider !== row.provider ||
      originalSale.providerPaymentId !== row.providerPaymentId ||
      originalSale.currency !== row.currency ||
      originalSale.paymentMethod !== row.paymentMethod ||
      row.refundedAmountCents <= 0 ||
      row.refundedAmountCents !== row.amountCents ||
      row.amountCents > originalSale.amountCents ||
      (row.operation === 'VOID' &&
        row.amountCents !== originalSale.amountCents) ||
      row.chargedTotalCents === null ||
      row.chargedTotalCents < row.refundedAmountCents ||
      (row.tipCents !== null &&
        row.chargedTotalCents < row.refundedAmountCents + row.tipCents) ||
      (originalSale.chargedTotalCents !== null &&
        row.chargedTotalCents > originalSale.chargedTotalCents) ||
      !identity
    ) {
      throw new Error(
        `Malformed managed Payment reversal fact: ${row.attemptId}`,
      );
    }
    const kind: PaymentReversalFinancialFactV1['kind'] =
      row.operation === 'VOID'
        ? 'VOID'
        : row.refundedAmountCents >= originalSale.amountCents
          ? 'FULL_REFUND'
          : 'PARTIAL_REFUND';
    return {
      version: 1,
      factStableId: managedReversalFactStableId(row.attemptId),
      originalSaleAttemptId: originalSale.attemptId,
      reversalAttemptId: row.attemptId,
      providerEventId: null,
      orderStableId: identity.orderStableId,
      storeStableId: identity.storeId,
      occurredAt: row.completedAt,
      evidence: 'MANAGED_TRANSACTION',
      provider: parsePaymentProviderName(row.provider),
      originalPaymentSource: parsePaymentSource(originalSale.source),
      paymentMethod: parsePaymentMethod(row.paymentMethod),
      kind,
      originalSaleBaseAmountCents: originalSale.amountCents,
      originalSaleCustomerTotalCents: originalSale.chargedTotalCents,
      baseRefundCents: row.refundedAmountCents,
      tipRefundCents: row.tipCents,
      additionalChargeRefundCents:
        row.tipCents === null
          ? null
          : row.chargedTotalCents - row.refundedAmountCents - row.tipCents,
      customerRefundTotalCents: row.chargedTotalCents,
      currency: row.currency,
      externalPaymentId: originalSale.externalPaymentId,
      providerPaymentId: row.providerPaymentId,
      providerRefundId: row.providerRefundId,
    };
  }

  private async toWebhookReversalFact(
    rawPayload: unknown,
    occurredAt: Date,
  ): Promise<PaymentReversalFinancialFactV1 | null> {
    const payload = parseWebhookReversalPayload(rawPayload);
    if (!payload) {
      const raw = asRecord(rawPayload);
      if (
        raw?.externalReversal === undefined ||
        raw.externalReversal === 'NONE'
      ) {
        return null;
      }
      throw new Error('Malformed provider webhook Payment reversal evidence');
    }
    if (
      payload.externalReversal === 'NONE' ||
      payload.refundedDeltaCents === 0
    ) {
      return null;
    }

    const originalSale = await this.prisma.paymentTransaction.findUnique({
      where: { attemptId: payload.attemptId },
    });
    if (
      !originalSale ||
      originalSale.operation !== 'SALE' ||
      originalSale.status !== 'SUCCEEDED' ||
      parsePaymentProviderName(originalSale.provider) !== payload.provider ||
      originalSale.providerPaymentId !== payload.providerPaymentId ||
      parsePaymentSource(originalSale.source) !== payload.paymentSource ||
      parsePaymentMethod(originalSale.paymentMethod) !==
        payload.paymentMethod ||
      originalSale.currency.toUpperCase() !== payload.currency ||
      payload.refundedAmountCents > originalSale.amountCents ||
      (payload.externalReversal === 'VOID' &&
        payload.refundedAmountCents !== originalSale.amountCents) ||
      (payload.externalPaymentId !== null &&
        originalSale.externalPaymentId !== payload.externalPaymentId)
    ) {
      throw new Error(
        `Provider webhook reversal cannot be correlated to original sale attempt ${payload.attemptId}`,
      );
    }

    if (await this.hasSucceededManagedReversal(originalSale)) {
      return null;
    }

    const contexts = await this.readFinancialContexts([originalSale]);
    const identity = contexts.get(originalSale.id)?.identity ?? null;
    const kind: PaymentReversalFinancialFactV1['kind'] =
      payload.externalReversal === 'VOID'
        ? 'VOID'
        : payload.previousRefundedAmountCents === 0 &&
            payload.refundedDeltaCents >= originalSale.amountCents
          ? 'FULL_REFUND'
          : 'PARTIAL_REFUND';
    return {
      version: 1,
      factStableId: webhookReversalFactStableId(payload.providerEventId),
      originalSaleAttemptId: originalSale.attemptId,
      reversalAttemptId: null,
      providerEventId: payload.providerEventId,
      orderStableId: identity?.orderStableId ?? null,
      storeStableId: identity?.storeId ?? null,
      occurredAt,
      evidence: 'PROVIDER_WEBHOOK',
      provider: payload.provider,
      originalPaymentSource: payload.paymentSource,
      paymentMethod: payload.paymentMethod,
      kind,
      originalSaleBaseAmountCents: originalSale.amountCents,
      originalSaleCustomerTotalCents: originalSale.chargedTotalCents,
      baseRefundCents: payload.refundedDeltaCents,
      tipRefundCents: null,
      additionalChargeRefundCents: null,
      customerRefundTotalCents: null,
      currency: payload.currency,
      externalPaymentId: originalSale.externalPaymentId,
      providerPaymentId: payload.providerPaymentId,
      providerRefundId: null,
    };
  }

  private async hasSucceededManagedReversal(
    originalSale: PrismaPaymentTransactionRecord,
  ): Promise<boolean> {
    if (!originalSale.providerPaymentId) return false;
    const existing = await this.prisma.paymentTransaction.findFirst({
      where: {
        provider: originalSale.provider,
        providerPaymentId: originalSale.providerPaymentId,
        operation: { in: ['REFUND', 'VOID'] },
        status: 'SUCCEEDED',
        completedAt: { not: null },
      },
      select: { id: true },
    });
    return Boolean(existing);
  }

  private assertReversalFactTotals(
    facts: PaymentReversalFinancialFactV1[],
  ): void {
    const totals = new Map<
      string,
      { originalBaseCents: number; reversedBaseCents: number }
    >();
    for (const fact of facts) {
      const current = totals.get(fact.originalSaleAttemptId);
      if (
        current &&
        current.originalBaseCents !== fact.originalSaleBaseAmountCents
      ) {
        throw new Error(
          `Payment reversal facts disagree on original sale amount: ${fact.originalSaleAttemptId}`,
        );
      }
      const next = (current?.reversedBaseCents ?? 0) + fact.baseRefundCents;
      if (next > fact.originalSaleBaseAmountCents) {
        throw new Error(
          `Payment reversal facts exceed original sale amount: ${fact.originalSaleAttemptId}`,
        );
      }
      totals.set(fact.originalSaleAttemptId, {
        originalBaseCents: fact.originalSaleBaseAmountCents,
        reversedBaseCents: next,
      });
    }
  }

  private toFinancialFact(
    row: PrismaPaymentTransactionRecord,
    identity: PaymentCheckoutIdentity | null,
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
      provider: parsePaymentProviderName(row.provider),
      source: parsePaymentSource(row.source),
      paymentMethod: parsePaymentMethod(row.paymentMethod),
      operation: parsePaymentOperation(row.operation),
      amountCents: row.amountCents,
      tipCents: row.tipCents,
      surchargeCents: row.surchargeCents,
      chargedTotalCents: row.chargedTotalCents,
      refundedAmountCents: row.refundedAmountCents,
      currency: row.currency,
      externalPaymentId: row.externalPaymentId,
      providerPaymentId: row.providerPaymentId,
      providerRefundId: row.providerRefundId,
    };
  }

  private mutableData(transaction: PaymentTransaction) {
    const snapshot = transaction.toSnapshot();
    return {
      status: snapshot.status,
      tipCents: snapshot.tipCents,
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
