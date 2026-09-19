import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';

import {
  LOYALTY_FINANCIAL_FACTS_READER,
  type LoyaltyFinancialFactV1,
  type LoyaltyFinancialFactsReaderPort,
} from '../loyalty/public-api';
import {
  ORDER_FINANCIAL_CHANGE_FACTS_READER,
  ORDER_FINANCIAL_FACTS_READER,
  type OrderFinancialChangeFactV1,
  type OrderFinancialChangeFactsReaderPort,
  type OrderFinancialFactV1,
  type OrderFinancialFactsReaderPort,
} from '../orders/public-api';
import {
  PAYMENT_FINANCIAL_FACTS_READER,
  PAYMENT_REVERSAL_FINANCIAL_FACTS_READER,
  type PaymentFinancialFactV1,
  type PaymentFinancialFactsReaderPort,
  type PaymentReversalFinancialFactV1,
  type PaymentReversalFinancialFactsReaderPort,
} from '../payments/public-api';
import {
  BRAND_STORE_CONFIG_READER,
  type BrandStoreConfigReaderPort,
} from '../store/public-api';
import {
  hashJournalCreatePayload,
  normalizeJournalCreate,
  type AccountingJournalCreateInput,
} from './accounting-journal-policy';
import {
  buildCanonicalChangeJournalPreview,
  type CanonicalCardSettlementEvidenceMode,
  type CanonicalChangeBlockReason,
  type CanonicalChangeClassification,
} from './accounting-canonical-change-journal.policy';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingPeriodService } from './accounting-period.service';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PREVIEW_RANGE_DAYS = 370;

export type CanonicalChangeShadowPreviewInput = {
  fromDate?: string;
  toDateExclusive: string;
  storeStableId: string;
};

type PaymentFactRef = {
  factStableId: string;
  attemptId: string;
  source: PaymentFinancialFactV1['source'];
  paymentMethod: PaymentFinancialFactV1['paymentMethod'];
  operation: PaymentFinancialFactV1['operation'];
  occurredAt: string;
  sourceUpdatedAt: string;
};

type PaymentReversalRef = {
  factStableId: string;
  originalSaleAttemptId: string;
  reversalAttemptId: string | null;
  providerEventId: string | null;
  occurredAt: string;
  evidence: PaymentReversalFinancialFactV1['evidence'];
  baseRefundCents: number;
  additionalChargeRefundCents: number | null;
  customerRefundTotalCents: number | null;
};

type LoyaltyFactRef = {
  factStableId: string;
  kind: LoyaltyFinancialFactV1['kind'];
  sourceKey: string;
  occurredAt: string;
  amountCents: number;
};

export type CanonicalChangeShadowEntry = {
  changeFactStableId: string;
  orderStableId: string;
  storeStableId: string | null;
  kind: OrderFinancialChangeFactV1['kind'];
  action: OrderFinancialChangeFactV1['action'];
  occurredAt: string;
  occurrenceEvidence: OrderFinancialChangeFactV1['occurrenceEvidence'];
  status: 'READY' | 'BLOCKED';
  classification: CanonicalChangeClassification;
  cardSettlementEvidenceMode: CanonicalCardSettlementEvidenceMode | null;
  blockReasons: CanonicalChangeBlockReason[];
  ordersFactReference: {
    factType: 'order.financial_adjustment.v1' | 'order.financial_reversal.v1';
    factStableId: string;
    version: 1;
  };
  originalSale: {
    factStableId: string | null;
    sourceUpdatedAt: string | null;
    journalEntryStableId: string | null;
    posCardExecutionEvidence:
      | OrderFinancialFactV1['posCardExecutionEvidence']
      | null;
  };
  paymentFacts: PaymentFactRef[];
  paymentReversalFacts: PaymentReversalRef[];
  loyaltyFacts: LoyaltyFactRef[];
  matchedPaymentReversalFactStableIds: string[];
  matchedLoyaltyFactStableIds: string[];
  draftJournal: AccountingJournalCreateInput | null;
  draftHash: string | null;
  debitCents: number;
  creditCents: number;
};

export type CanonicalChangeShadowPreviewReport = {
  version: 1;
  planHash: string;
  range: {
    timezone: string;
    accountingStartAt: string;
    fromDate: string;
    toDateExclusive: string;
    fromInclusive: string;
    toExclusive: string;
    storeStableId: string;
  };
  counts: {
    candidates: number;
    ready: number;
    blocked: number;
    unmatchedPaymentReversals: number;
    byClassification: Record<string, number>;
    byAction: Record<string, number>;
    byPaymentMethod: Record<string, number>;
  };
  amounts: {
    readyDebitCents: number;
    readyCreditCents: number;
  };
  entries: CanonicalChangeShadowEntry[];
  unmatchedPaymentReversals: Array<{
    factStableId: string;
    orderStableId: string | null;
    storeStableId: string | null;
    occurredAt: string;
    classification: 'WAITING_FOR_ORDER_EVIDENCE' | 'UNMATCHED_PAYMENT_REVERSAL';
    baseRefundCents: number;
    additionalChargeRefundCents: number | null;
    customerRefundTotalCents: number | null;
  }>;
};

const parseLocalDate = (
  raw: string,
  timezone: string,
  field: string,
): DateTime => {
  if (!ISO_DATE.test(raw)) {
    throw new BadRequestException(`${field} must use YYYY-MM-DD`);
  }
  const value = DateTime.fromISO(raw, { zone: timezone }).startOf('day');
  if (!value.isValid || value.toISODate() !== raw) {
    throw new BadRequestException(`Invalid ${field}: ${raw}`);
  }
  return value;
};

const groupByOrder = <T extends { orderStableId: string | null }>(
  facts: T[],
) => {
  const grouped = new Map<string, T[]>();
  for (const fact of facts) {
    const key = fact.orderStableId?.trim();
    if (!key) continue;
    grouped.set(key, [...(grouped.get(key) ?? []), fact]);
  }
  return grouped;
};

const journalTotals = (journal: AccountingJournalCreateInput | null) => {
  if (!journal) return { debitCents: 0, creditCents: 0 };
  return journal.lines.reduce(
    (totals, line) => ({
      debitCents: totals.debitCents + (line.debitCents ?? 0),
      creditCents: totals.creditCents + (line.creditCents ?? 0),
    }),
    { debitCents: 0, creditCents: 0 },
  );
};

const increment = (target: Record<string, number>, key: string) => {
  target[key] = (target[key] ?? 0) + 1;
};

const addSafeCents = (left: number, right: number, field: string): number => {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
    throw new BadRequestException(`${field} must use safe integer cents`);
  }
  const next = left + right;
  if (!Number.isSafeInteger(next)) {
    throw new BadRequestException(`${field} exceeds safe integer range`);
  }
  return next;
};

const changeUsesCardSettlement = (
  change: OrderFinancialChangeFactV1,
): boolean =>
  change.settlement.previousOrderPaymentMethod === 'CARD' ||
  change.settlement.resultingOrderPaymentMethod === 'CARD' ||
  change.settlement.declaredSettlementPaymentMethod === 'CARD';

const resolveCardSettlementEvidenceMode = (params: {
  change: OrderFinancialChangeFactV1;
  originalSale: OrderFinancialFactV1 | null;
  paymentFacts: PaymentFinancialFactV1[];
}): CanonicalCardSettlementEvidenceMode | null => {
  const { change, originalSale, paymentFacts } = params;
  if (!changeUsesCardSettlement(change)) return null;

  if (change.channel !== 'in_store' || originalSale?.channel !== 'in_store') {
    return 'STRICT_PAYMENT_EVIDENCE';
  }

  const cardSaleFacts = paymentFacts.filter(
    (fact) =>
      fact.orderStableId === change.orderStableId &&
      fact.paymentMethod === 'CARD' &&
      fact.operation === 'SALE',
  );
  if (cardSaleFacts.length > 1) return 'UNRESOLVED';
  if (originalSale?.posCardExecutionEvidence === 'UNIFIED_PAYMENT_CORE') {
    return 'STRICT_PAYMENT_EVIDENCE';
  }
  if (originalSale?.posCardExecutionEvidence === 'LEGACY_DIRECT_PAID') {
    return cardSaleFacts.length === 0 ? 'LEGACY_ORDER_DECLARED' : 'UNRESOLVED';
  }
  if (cardSaleFacts.length === 1) return 'STRICT_PAYMENT_EVIDENCE';

  return originalSale?.paymentMethod === 'CARD'
    ? 'LEGACY_ORDER_DECLARED'
    : 'STRICT_PAYMENT_EVIDENCE';
};

const hashCanonicalChangeDraft = (
  journal: AccountingJournalCreateInput,
  cardSettlementEvidenceMode: CanonicalCardSettlementEvidenceMode | null,
): string => {
  const normalizedJournal = normalizeJournalCreate(journal);
  if (cardSettlementEvidenceMode === null) {
    return hashJournalCreatePayload(normalizedJournal);
  }
  return createHash('sha256')
    .update(
      JSON.stringify({
        journal: normalizedJournal,
        cardSettlementEvidenceMode,
      }),
    )
    .digest('hex');
};

@Injectable()
export class AccountingCanonicalChangePreviewService {
  constructor(
    private readonly period: AccountingPeriodService,
    private readonly journal: AccountingJournalService,
    @Inject(ORDER_FINANCIAL_CHANGE_FACTS_READER)
    private readonly changes: OrderFinancialChangeFactsReaderPort,
    @Inject(ORDER_FINANCIAL_FACTS_READER)
    private readonly orders: OrderFinancialFactsReaderPort,
    @Inject(PAYMENT_FINANCIAL_FACTS_READER)
    private readonly payments: PaymentFinancialFactsReaderPort,
    @Inject(PAYMENT_REVERSAL_FINANCIAL_FACTS_READER)
    private readonly paymentReversals: PaymentReversalFinancialFactsReaderPort,
    @Inject(LOYALTY_FINANCIAL_FACTS_READER)
    private readonly loyalty: LoyaltyFinancialFactsReaderPort,
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly storeConfig: BrandStoreConfigReaderPort,
  ) {}

  async previewRange(
    input: CanonicalChangeShadowPreviewInput,
  ): Promise<CanonicalChangeShadowPreviewReport> {
    const accountingStartAt =
      await this.period.requireCanonicalFinancialPostingStartAt();
    const storeStableId = input.storeStableId.trim();
    if (!storeStableId) {
      throw new BadRequestException('storeStableId is required');
    }

    const configuredStore = await this.storeConfig.getConfiguredStoreSnapshot();
    if (configuredStore.storeStableId !== storeStableId) {
      throw new BadRequestException(
        'storeStableId must match the configured Accounting store',
      );
    }
    const timezone = configuredStore.timezone.trim() || 'America/Toronto';
    const startDate = DateTime.fromJSDate(accountingStartAt, {
      zone: timezone,
    }).toISODate();
    if (!startDate) {
      throw new BadRequestException('Unable to resolve accounting start date');
    }

    const fromDate = input.fromDate?.trim() || startDate;
    const toDateExclusive = input.toDateExclusive.trim();
    if (!toDateExclusive) {
      throw new BadRequestException('toDateExclusive is required');
    }
    const fromLocal = parseLocalDate(fromDate, timezone, 'fromDate');
    const toLocal = parseLocalDate(
      toDateExclusive,
      timezone,
      'toDateExclusive',
    );
    const fromInclusive = fromLocal.toUTC().toJSDate();
    const toExclusive = toLocal.toUTC().toJSDate();
    if (fromInclusive < accountingStartAt) {
      throw new BadRequestException(
        `fromDate cannot be before accounting start ${startDate}`,
      );
    }
    if (toExclusive <= fromInclusive) {
      throw new BadRequestException('toDateExclusive must be after fromDate');
    }
    if (toLocal.diff(fromLocal, 'days').days > MAX_PREVIEW_RANGE_DAYS) {
      throw new BadRequestException(
        `Shadow preview range cannot exceed ${MAX_PREVIEW_RANGE_DAYS} days`,
      );
    }

    const [changeFacts, rangePaymentReversals] = await Promise.all([
      this.changes.readFactsForRange({
        fromInclusive,
        toExclusive,
        storeStableId,
      }),
      this.paymentReversals.readReversalFactsForRange({
        fromInclusive,
        toExclusive,
        storeStableId,
      }),
    ]);
    const rangeChangeFactStableIds = new Set(
      changeFacts.map((fact) => fact.factStableId),
    );
    const matchingOrderStableIds = [
      ...new Set([
        ...changeFacts.map((fact) => fact.orderStableId),
        ...rangePaymentReversals.flatMap((fact) =>
          fact.orderStableId ? [fact.orderStableId] : [],
        ),
      ]),
    ].sort();
    const orderChangeFacts = await this.changes.readFactsByOrderStableIds(
      matchingOrderStableIds,
    );
    const matchingChangeByStableId = new Map<
      string,
      OrderFinancialChangeFactV1
    >();
    for (const fact of [...changeFacts, ...orderChangeFacts]) {
      matchingChangeByStableId.set(fact.factStableId, fact);
    }
    const matchingChangeFacts = [...matchingChangeByStableId.values()].sort(
      (left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() ||
        left.factStableId.localeCompare(right.factStableId),
    );
    const orderStableIds = [
      ...new Set(matchingChangeFacts.map((fact) => fact.orderStableId)),
    ].sort();

    const salePairs = await Promise.all(
      orderStableIds.map(
        async (orderStableId) =>
          [
            orderStableId,
            await this.orders.readFactByOrderStableId(orderStableId),
          ] as const,
      ),
    );
    const saleByOrder = new Map<string, OrderFinancialFactV1 | null>(salePairs);
    const saleFactStableIds = salePairs.flatMap(([, fact]) =>
      fact ? [fact.factStableId] : [],
    );
    const [anchors, paymentFacts, paymentReversalFacts, loyaltyFacts] =
      await Promise.all([
        this.journal.readCanonicalSaleJournalAnchors(saleFactStableIds),
        this.payments.readFactsByOrderStableIds(orderStableIds),
        this.paymentReversals.readReversalFactsByOrderStableIds(orderStableIds),
        this.loyalty.readFactsByOrderStableIds(orderStableIds),
      ]);
    const anchorBySaleFact = new Map(
      anchors.map((anchor) => [anchor.sourceFactStableId, anchor] as const),
    );
    const paymentsByOrder = groupByOrder(paymentFacts);
    const reversalsByOrder = groupByOrder(paymentReversalFacts);
    const loyaltyByOrder = groupByOrder(loyaltyFacts);

    const internalEntries = matchingChangeFacts.map((change) => {
      const orderPayments = paymentsByOrder.get(change.orderStableId) ?? [];
      const orderReversals = reversalsByOrder.get(change.orderStableId) ?? [];
      const orderLoyalty = loyaltyByOrder.get(change.orderStableId) ?? [];
      const originalSale = saleByOrder.get(change.orderStableId) ?? null;
      const anchor = originalSale
        ? (anchorBySaleFact.get(originalSale.factStableId) ?? null)
        : null;
      const cardSettlementEvidenceMode = resolveCardSettlementEvidenceMode({
        change,
        originalSale,
        paymentFacts: orderPayments,
      });
      const policy = buildCanonicalChangeJournalPreview({
        change,
        originalSale,
        originalSaleJournalEntryStableId: anchor?.entryStableId ?? null,
        paymentFacts: orderPayments,
        paymentReversalFacts: orderReversals,
        loyaltyFacts: orderLoyalty,
        cardSettlementEvidenceMode,
      });
      const draftHash = policy.journal
        ? hashCanonicalChangeDraft(
            policy.journal,
            policy.cardSettlementEvidenceMode,
          )
        : null;
      const totals = journalTotals(policy.journal);
      const entry: CanonicalChangeShadowEntry = {
        changeFactStableId: change.factStableId,
        orderStableId: change.orderStableId,
        storeStableId: change.storeStableId,
        kind: change.kind,
        action: change.action,
        occurredAt: change.occurredAt.toISOString(),
        occurrenceEvidence: change.occurrenceEvidence,
        status: policy.status,
        classification: policy.classification,
        cardSettlementEvidenceMode: policy.cardSettlementEvidenceMode,
        blockReasons: policy.blockReasons,
        ordersFactReference: {
          factType:
            change.kind === 'REVERSAL'
              ? 'order.financial_reversal.v1'
              : 'order.financial_adjustment.v1',
          factStableId: change.factStableId,
          version: 1,
        },
        originalSale: {
          factStableId: originalSale?.factStableId ?? null,
          sourceUpdatedAt: originalSale?.sourceUpdatedAt.toISOString() ?? null,
          journalEntryStableId: anchor?.entryStableId ?? null,
          posCardExecutionEvidence:
            originalSale?.posCardExecutionEvidence ?? null,
        },
        paymentFacts: orderPayments.map((fact) => ({
          factStableId: fact.factStableId,
          attemptId: fact.attemptId,
          source: fact.source,
          paymentMethod: fact.paymentMethod,
          operation: fact.operation,
          occurredAt: fact.occurredAt.toISOString(),
          sourceUpdatedAt: fact.sourceUpdatedAt.toISOString(),
        })),
        paymentReversalFacts: orderReversals.map((fact) => ({
          factStableId: fact.factStableId,
          originalSaleAttemptId: fact.originalSaleAttemptId,
          reversalAttemptId: fact.reversalAttemptId,
          providerEventId: fact.providerEventId,
          occurredAt: fact.occurredAt.toISOString(),
          evidence: fact.evidence,
          baseRefundCents: fact.baseRefundCents,
          additionalChargeRefundCents: fact.additionalChargeRefundCents,
          customerRefundTotalCents: fact.customerRefundTotalCents,
        })),
        loyaltyFacts: orderLoyalty.map((fact) => ({
          factStableId: fact.factStableId,
          kind: fact.kind,
          sourceKey: fact.sourceKey,
          occurredAt: fact.occurredAt.toISOString(),
          amountCents: fact.amountCents,
        })),
        matchedPaymentReversalFactStableIds:
          policy.matchedPaymentReversalFactStableIds,
        matchedLoyaltyFactStableIds: policy.matchedLoyaltyFactStableIds,
        draftJournal: policy.journal,
        draftHash,
        ...totals,
      };
      return {
        entry,
        matchedPaymentReversalFactStableIds:
          policy.matchedPaymentReversalFactStableIds,
        matchedLoyaltyFactStableIds: policy.matchedLoyaltyFactStableIds,
      };
    });

    this.blockReusedEvidence(internalEntries);
    const matchedPaymentReversalFactStableIds = new Set(
      internalEntries.flatMap(
        ({ matchedPaymentReversalFactStableIds }) =>
          matchedPaymentReversalFactStableIds,
      ),
    );
    const entries = internalEntries
      .filter(({ entry }) =>
        rangeChangeFactStableIds.has(entry.changeFactStableId),
      )
      .map(({ entry }) => entry);
    const orderIdsWithAnyChangeEvidence = new Set(
      matchingChangeFacts.map((fact) => fact.orderStableId),
    );
    const unmatchedPaymentReversals = rangePaymentReversals
      .filter(
        (fact) => !matchedPaymentReversalFactStableIds.has(fact.factStableId),
      )
      .map((fact) => ({
        factStableId: fact.factStableId,
        orderStableId: fact.orderStableId,
        storeStableId: fact.storeStableId,
        occurredAt: fact.occurredAt.toISOString(),
        classification:
          fact.orderStableId &&
          !orderIdsWithAnyChangeEvidence.has(fact.orderStableId)
            ? ('WAITING_FOR_ORDER_EVIDENCE' as const)
            : ('UNMATCHED_PAYMENT_REVERSAL' as const),
        baseRefundCents: fact.baseRefundCents,
        additionalChargeRefundCents: fact.additionalChargeRefundCents,
        customerRefundTotalCents: fact.customerRefundTotalCents,
      }));

    const byClassification: Record<string, number> = {};
    const byAction: Record<string, number> = {};
    const byPaymentMethod: Record<string, number> = {};
    let readyDebitCents = 0;
    let readyCreditCents = 0;
    for (const entry of entries) {
      increment(byClassification, entry.classification);
      increment(byAction, entry.action);
      const change = changeFacts.find(
        (fact) => fact.factStableId === entry.changeFactStableId,
      );
      if (change) {
        increment(
          byPaymentMethod,
          change.settlement.declaredSettlementPaymentMethod ??
            change.after.paymentMethod,
        );
      }
      if (entry.status === 'READY') {
        readyDebitCents = addSafeCents(
          readyDebitCents,
          entry.debitCents,
          'readyDebitCents',
        );
        readyCreditCents = addSafeCents(
          readyCreditCents,
          entry.creditCents,
          'readyCreditCents',
        );
      }
    }
    for (const unmatched of unmatchedPaymentReversals) {
      increment(byClassification, unmatched.classification);
    }

    const range = {
      timezone,
      accountingStartAt: accountingStartAt.toISOString(),
      fromDate,
      toDateExclusive,
      fromInclusive: fromInclusive.toISOString(),
      toExclusive: toExclusive.toISOString(),
      storeStableId,
    };
    const planHash = createHash('sha256')
      .update(
        JSON.stringify({
          version: 1,
          range,
          entries: entries.map((entry) => ({
            changeFactStableId: entry.changeFactStableId,
            orderStableId: entry.orderStableId,
            occurredAt: entry.occurredAt,
            status: entry.status,
            classification: entry.classification,
            cardSettlementEvidenceMode: entry.cardSettlementEvidenceMode,
            blockReasons: entry.blockReasons.map((reason) => reason.code),
            originalSale: entry.originalSale,
            paymentFacts: entry.paymentFacts,
            paymentReversalFacts: entry.paymentReversalFacts,
            loyaltyFacts: entry.loyaltyFacts,
            matchedPaymentReversalFactStableIds:
              entry.matchedPaymentReversalFactStableIds,
            matchedLoyaltyFactStableIds: entry.matchedLoyaltyFactStableIds,
            draftHash: entry.draftHash,
          })),
          unmatchedPaymentReversals,
        }),
      )
      .digest('hex');

    const ready = entries.filter((entry) => entry.status === 'READY').length;
    return {
      version: 1,
      planHash,
      range,
      counts: {
        candidates: entries.length,
        ready,
        blocked: entries.length - ready,
        unmatchedPaymentReversals: unmatchedPaymentReversals.length,
        byClassification,
        byAction,
        byPaymentMethod,
      },
      amounts: { readyDebitCents, readyCreditCents },
      entries,
      unmatchedPaymentReversals,
    };
  }

  private blockReusedEvidence(
    entries: Array<{
      entry: CanonicalChangeShadowEntry;
      matchedPaymentReversalFactStableIds: string[];
      matchedLoyaltyFactStableIds: string[];
    }>,
  ): void {
    const paymentUsage = new Map<string, CanonicalChangeShadowEntry[]>();
    const loyaltyUsage = new Map<string, CanonicalChangeShadowEntry[]>();
    for (const candidate of entries) {
      for (const factStableId of candidate.matchedPaymentReversalFactStableIds) {
        paymentUsage.set(factStableId, [
          ...(paymentUsage.get(factStableId) ?? []),
          candidate.entry,
        ]);
      }
      for (const factStableId of candidate.matchedLoyaltyFactStableIds) {
        loyaltyUsage.set(factStableId, [
          ...(loyaltyUsage.get(factStableId) ?? []),
          candidate.entry,
        ]);
      }
    }
    for (const [factStableId, affected] of paymentUsage) {
      if (affected.length < 2) continue;
      for (const entry of affected) {
        this.blockEntry(
          entry,
          'AMBIGUOUS_PAYMENT_REVERSAL',
          `Payments reversal ${factStableId} would be reused by multiple Order changes`,
        );
      }
    }
    for (const [factStableId, affected] of loyaltyUsage) {
      if (affected.length < 2) continue;
      for (const entry of affected) {
        this.blockEntry(
          entry,
          'WAITING_FOR_LOYALTY_EVIDENCE',
          `Loyalty fact ${factStableId} would be reused by multiple Order changes`,
        );
      }
    }
  }

  private blockEntry(
    entry: CanonicalChangeShadowEntry,
    classification: Extract<
      CanonicalChangeClassification,
      'AMBIGUOUS_PAYMENT_REVERSAL' | 'WAITING_FOR_LOYALTY_EVIDENCE'
    >,
    message: string,
  ): void {
    entry.status = 'BLOCKED';
    entry.classification = classification;
    entry.blockReasons = [
      ...entry.blockReasons,
      { code: classification, message },
    ];
    entry.draftJournal = null;
    entry.draftHash = null;
    entry.debitCents = 0;
    entry.creditCents = 0;
  }
}
