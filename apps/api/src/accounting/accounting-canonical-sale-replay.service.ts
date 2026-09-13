import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
import {
  LOYALTY_FINANCIAL_FACTS_READER,
  type LoyaltyFinancialFactV1,
  type LoyaltyFinancialFactsReaderPort,
} from '../loyalty/public-api';
import {
  ORDER_FINANCIAL_FACTS_READER,
  type OrderFinancialFactV1,
  type OrderFinancialFactsReaderPort,
  type OrderFinancialReplayCandidateV1,
} from '../orders/public-api';
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
  buildCanonicalSalePostingPreview,
  type CanonicalSalePostingBlockCode,
  type CanonicalSalePostingPreview,
} from './accounting-canonical-sale-posting.service';
import {
  CANONICAL_SALE_SYSTEM_ACTOR,
  type CanonicalSaleJournalPolicyErrorCode,
} from './accounting-canonical-sale-journal.policy';
import { AccountingService } from './accounting.service';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PREVIEW_RANGE_DAYS = 370;

export type CanonicalSaleReplayPreviewInput = {
  fromDate?: string;
  toDateExclusive: string;
  storeStableId: string;
};

export type CanonicalSaleReplayExecuteInput =
  CanonicalSaleReplayPreviewInput & {
    expectedPlanHash: string;
    acknowledgedBlockedOrderStableIds: string[];
  };

export type CanonicalSaleReplayException = {
  orderStableId: string;
  factStableId: string;
  occurredAt: string;
  sourceUpdatedAt: string;
  sourceEvidence: OrderFinancialFactV1['sourceEvidence'];
  pricingEvidence: OrderFinancialFactV1['pricingEvidence'];
  replayEligibility: OrderFinancialReplayCandidateV1['replayEligibility'];
  pricingResolution: OrderFinancialReplayCandidateV1['pricingResolution'];
  blockCode: CanonicalSalePostingBlockCode;
  policyCode: CanonicalSaleJournalPolicyErrorCode | null;
  observedOrderTotalCents: number;
};

export type CanonicalSaleReplayPreviewReport = {
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
  writeAuthority: {
    canonicalJournalReplayEnabled: true;
    legacyAccountingTransactionAccrualStillActive: false;
    note: string;
  };
  counts: {
    total: number;
    ready: number;
    blocked: number;
    byBlockCode: Record<string, number>;
    byPricingResolution: Record<string, number>;
    byChannel: Record<string, number>;
    byPaymentMethod: Record<string, number>;
  };
  amounts: {
    observedSourceOrderTotalCents: number;
    readyOrderTotalCents: number;
    blockedObservedOrderTotalCents: number;
    readyPaymentTotalCents: number;
    readyGrossSalesRevenueCents: number;
    readySalesDiscountCents: number;
    readyTaxCents: number;
    readyDeliveryRevenueCents: number;
    readyCardSurchargeCents: number;
    readyStoreBalanceRedeemedCents: number;
    readyStoreBalanceReturnedCents: number;
    readyJournalDebitCents: number;
    readyJournalCreditCents: number;
    legacyComparableOrderTotalCents: number;
    canonicalComparableOrderTotalCents: number;
    parityDeltaCents: number;
  };
  exceptions: CanonicalSaleReplayException[];
};

export type CanonicalSaleReplayExecutionReport =
  CanonicalSaleReplayPreviewReport & {
    execution: {
      postedOrReplayed: number;
      blockedAcknowledged: number;
    };
  };

type ReadyJournal = {
  journal: AccountingJournalCreateInput;
};

type CanonicalSaleReplayPlan = {
  report: CanonicalSaleReplayPreviewReport;
  readyJournals: ReadyJournal[];
};

type ReplayPlanEntry = {
  orderStableId: string;
  factStableId: string;
  sourceUpdatedAt: string;
  observedOrderTotalCents: number;
  replayEligibility: OrderFinancialReplayCandidateV1['replayEligibility'];
  pricingResolution: OrderFinancialReplayCandidateV1['pricingResolution'];
  status: CanonicalSalePostingPreview['status'];
  blockCode: CanonicalSalePostingBlockCode | null;
  policyCode: CanonicalSaleJournalPolicyErrorCode | null;
  storeBalanceRedeemedCents: number | null;
  storeBalanceReturnedCents: number | null;
  journalHash: string | null;
};

function addSafe(total: number, value: number, field: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new BadRequestException(`${field} must be a safe integer`);
  }
  const next = total + value;
  if (!Number.isSafeInteger(next)) {
    throw new BadRequestException(`${field} exceeds safe integer range`);
  }
  return next;
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function groupLoyaltyFacts(
  facts: LoyaltyFinancialFactV1[],
): Map<string, LoyaltyFinancialFactV1[]> {
  const grouped = new Map<string, LoyaltyFinancialFactV1[]>();
  for (const fact of facts) {
    const orderStableId = fact.orderStableId?.trim();
    if (!orderStableId) continue;
    const existing = grouped.get(orderStableId) ?? [];
    existing.push(fact);
    grouped.set(orderStableId, existing);
  }
  return grouped;
}

function parseLocalDate(
  raw: string,
  timezone: string,
  field: string,
): DateTime {
  if (!ISO_DATE.test(raw)) {
    throw new BadRequestException(`${field} must use YYYY-MM-DD`);
  }
  const value = DateTime.fromISO(raw, { zone: timezone }).startOf('day');
  if (!value.isValid || value.toISODate() !== raw) {
    throw new BadRequestException(`Invalid ${field}: ${raw}`);
  }
  return value;
}

function replayPlanHash(params: {
  accountingStartAt: Date;
  timezone: string;
  fromDate: string;
  toDateExclusive: string;
  storeStableId: string;
  entries: ReplayPlanEntry[];
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: 1,
        accountingStartAt: params.accountingStartAt.toISOString(),
        timezone: params.timezone,
        fromDate: params.fromDate,
        toDateExclusive: params.toDateExclusive,
        storeStableId: params.storeStableId,
        entries: params.entries,
      }),
    )
    .digest('hex');
}

// @compat accounting.order-revenue-journal-cutover.v1
@Injectable()
export class AccountingCanonicalSaleReplayService {
  constructor(
    private readonly accounting: AccountingService,
    @Inject(ORDER_FINANCIAL_FACTS_READER)
    private readonly orders: OrderFinancialFactsReaderPort,
    @Inject(LOYALTY_FINANCIAL_FACTS_READER)
    private readonly loyalty: LoyaltyFinancialFactsReaderPort,
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly storeConfig: BrandStoreConfigReaderPort,
  ) {}

  private async buildRangePlan(
    input: CanonicalSaleReplayPreviewInput,
  ): Promise<CanonicalSaleReplayPlan> {
    const accountingStartAt =
      await this.accounting.requireCanonicalFinancialPostingStartAt();
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
        `Replay preview range cannot exceed ${MAX_PREVIEW_RANGE_DAYS} days`,
      );
    }

    const candidates = await this.orders.readReplayCandidatesForRange({
      fromInclusive,
      toExclusive,
      storeStableId,
    });
    const loyaltyFacts = await this.loyalty.readFactsByOrderStableIds(
      candidates.map(({ sourceFact }) => sourceFact.orderStableId),
    );
    const loyaltyByOrder = groupLoyaltyFacts(loyaltyFacts);
    const previews = candidates.map((candidate) =>
      buildCanonicalSalePostingPreview({
        candidate,
        accountingStartAt,
        loyaltyFacts:
          loyaltyByOrder.get(candidate.sourceFact.orderStableId) ?? [],
      }),
    );

    const byBlockCode: Record<string, number> = {};
    const byPricingResolution: Record<string, number> = {};
    const byChannel: Record<string, number> = {};
    const byPaymentMethod: Record<string, number> = {};
    const exceptions: CanonicalSaleReplayException[] = [];
    const planEntries: ReplayPlanEntry[] = [];
    const readyJournals: ReadyJournal[] = [];

    let ready = 0;
    let observedSourceOrderTotalCents = 0;
    let readyOrderTotalCents = 0;
    let blockedObservedOrderTotalCents = 0;
    let readyPaymentTotalCents = 0;
    let readyGrossSalesRevenueCents = 0;
    let readySalesDiscountCents = 0;
    let readyTaxCents = 0;
    let readyDeliveryRevenueCents = 0;
    let readyCardSurchargeCents = 0;
    let readyStoreBalanceRedeemedCents = 0;
    let readyStoreBalanceReturnedCents = 0;
    let readyJournalDebitCents = 0;
    let readyJournalCreditCents = 0;

    candidates.forEach((candidate, index) => {
      const preview = previews[index];
      const source = candidate.sourceFact;
      observedSourceOrderTotalCents = addSafe(
        observedSourceOrderTotalCents,
        source.orderTotalCents,
        'observedSourceOrderTotalCents',
      );
      increment(byPricingResolution, candidate.pricingResolution);
      increment(byChannel, source.channel);
      increment(byPaymentMethod, source.paymentMethod);

      let journalHash: string | null = null;
      if (
        preview.status === 'READY' &&
        preview.journal &&
        candidate.resolvedFact
      ) {
        const fact = candidate.resolvedFact;
        ready += 1;
        readyOrderTotalCents = addSafe(
          readyOrderTotalCents,
          fact.orderTotalCents,
          'readyOrderTotalCents',
        );
        readyPaymentTotalCents = addSafe(
          readyPaymentTotalCents,
          fact.paymentTotalCents,
          'readyPaymentTotalCents',
        );
        readyGrossSalesRevenueCents = addSafe(
          readyGrossSalesRevenueCents,
          fact.nominalSubtotalCents ?? 0,
          'readyGrossSalesRevenueCents',
        );
        readySalesDiscountCents = addSafe(
          readySalesDiscountCents,
          fact.discounts.totalCents ?? 0,
          'readySalesDiscountCents',
        );
        readyTaxCents = addSafe(readyTaxCents, fact.taxCents, 'readyTaxCents');
        readyDeliveryRevenueCents = addSafe(
          readyDeliveryRevenueCents,
          fact.deliveryRevenueCents,
          'readyDeliveryRevenueCents',
        );
        readyCardSurchargeCents = addSafe(
          readyCardSurchargeCents,
          fact.cardSurchargeCents,
          'readyCardSurchargeCents',
        );
        readyStoreBalanceRedeemedCents = addSafe(
          readyStoreBalanceRedeemedCents,
          preview.loyalty?.storeBalanceRedeemedCents ?? 0,
          'readyStoreBalanceRedeemedCents',
        );
        readyStoreBalanceReturnedCents = addSafe(
          readyStoreBalanceReturnedCents,
          preview.loyalty?.storeBalanceReturnedCents ?? 0,
          'readyStoreBalanceReturnedCents',
        );
        for (const line of preview.journal.lines) {
          readyJournalDebitCents = addSafe(
            readyJournalDebitCents,
            line.debitCents ?? 0,
            'readyJournalDebitCents',
          );
          readyJournalCreditCents = addSafe(
            readyJournalCreditCents,
            line.creditCents ?? 0,
            'readyJournalCreditCents',
          );
        }
        journalHash = hashJournalCreatePayload(
          normalizeJournalCreate(preview.journal),
        );
        readyJournals.push({ journal: preview.journal });
      } else {
        blockedObservedOrderTotalCents = addSafe(
          blockedObservedOrderTotalCents,
          source.orderTotalCents,
          'blockedObservedOrderTotalCents',
        );
        const block = preview.block;
        if (!block) {
          throw new BadRequestException(
            `Blocked canonical SALE preview has no reason: ${source.orderStableId}`,
          );
        }
        increment(byBlockCode, block.code);
        exceptions.push({
          orderStableId: source.orderStableId,
          factStableId: source.factStableId,
          occurredAt: source.occurredAt.toISOString(),
          sourceUpdatedAt: source.sourceUpdatedAt.toISOString(),
          sourceEvidence: source.sourceEvidence,
          pricingEvidence: source.pricingEvidence,
          replayEligibility: candidate.replayEligibility,
          pricingResolution: candidate.pricingResolution,
          blockCode: block.code,
          policyCode: block.policyCode ?? null,
          observedOrderTotalCents: source.orderTotalCents,
        });
      }

      planEntries.push({
        orderStableId: source.orderStableId,
        factStableId: source.factStableId,
        sourceUpdatedAt: source.sourceUpdatedAt.toISOString(),
        observedOrderTotalCents: source.orderTotalCents,
        replayEligibility: candidate.replayEligibility,
        pricingResolution: candidate.pricingResolution,
        status: preview.status,
        blockCode: preview.block?.code ?? null,
        policyCode: preview.block?.policyCode ?? null,
        storeBalanceRedeemedCents:
          preview.loyalty?.storeBalanceRedeemedCents ?? null,
        storeBalanceReturnedCents:
          preview.loyalty?.storeBalanceReturnedCents ?? null,
        journalHash,
      });
    });

    const canonicalComparableOrderTotalCents =
      readyGrossSalesRevenueCents -
      readySalesDiscountCents +
      readyTaxCents +
      readyDeliveryRevenueCents;
    if (!Number.isSafeInteger(canonicalComparableOrderTotalCents)) {
      throw new BadRequestException(
        'canonicalComparableOrderTotalCents exceeds safe integer range',
      );
    }
    const parityDeltaCents =
      canonicalComparableOrderTotalCents - readyOrderTotalCents;

    const report: CanonicalSaleReplayPreviewReport = {
      version: 1,
      planHash: replayPlanHash({
        accountingStartAt,
        timezone,
        fromDate,
        toDateExclusive,
        storeStableId,
        entries: planEntries,
      }),
      range: {
        timezone,
        accountingStartAt: accountingStartAt.toISOString(),
        fromDate,
        toDateExclusive,
        fromInclusive: fromInclusive.toISOString(),
        toExclusive: toExclusive.toISOString(),
        storeStableId,
      },
      writeAuthority: {
        canonicalJournalReplayEnabled: true,
        legacyAccountingTransactionAccrualStillActive: false,
        note: 'B2B source cutover enables canonical Journal replay only through an exact preview plan hash; the provisional Order.totalCents accrual route is retired.',
      },
      counts: {
        total: candidates.length,
        ready,
        blocked: candidates.length - ready,
        byBlockCode,
        byPricingResolution,
        byChannel,
        byPaymentMethod,
      },
      amounts: {
        observedSourceOrderTotalCents,
        readyOrderTotalCents,
        blockedObservedOrderTotalCents,
        readyPaymentTotalCents,
        readyGrossSalesRevenueCents,
        readySalesDiscountCents,
        readyTaxCents,
        readyDeliveryRevenueCents,
        readyCardSurchargeCents,
        readyStoreBalanceRedeemedCents,
        readyStoreBalanceReturnedCents,
        readyJournalDebitCents,
        readyJournalCreditCents,
        legacyComparableOrderTotalCents: readyOrderTotalCents,
        canonicalComparableOrderTotalCents,
        parityDeltaCents,
      },
      exceptions,
    };
    return { report, readyJournals };
  }

  async previewRange(
    input: CanonicalSaleReplayPreviewInput,
  ): Promise<CanonicalSaleReplayPreviewReport> {
    return (await this.buildRangePlan(input)).report;
  }

  async executeRange(
    input: CanonicalSaleReplayExecuteInput,
  ): Promise<CanonicalSaleReplayExecutionReport> {
    const expectedPlanHash =
      typeof input.expectedPlanHash === 'string'
        ? input.expectedPlanHash.trim()
        : '';
    if (!/^[a-f0-9]{64}$/.test(expectedPlanHash)) {
      throw new BadRequestException(
        'expectedPlanHash must be a lowercase SHA-256 hex digest',
      );
    }
    if (
      !Array.isArray(input.acknowledgedBlockedOrderStableIds) ||
      input.acknowledgedBlockedOrderStableIds.some(
        (value) => typeof value !== 'string',
      )
    ) {
      throw new BadRequestException(
        'acknowledgedBlockedOrderStableIds must be an array of Order stable IDs',
      );
    }

    const { report, readyJournals } = await this.buildRangePlan(input);
    if (report.planHash !== expectedPlanHash) {
      throw new ConflictException(
        'Canonical sale replay plan changed after preview; rerun preview and review the new planHash',
      );
    }
    if (
      report.amounts.parityDeltaCents !== 0 ||
      report.amounts.readyJournalDebitCents !==
        report.amounts.readyJournalCreditCents
    ) {
      throw new ConflictException(
        'Canonical sale replay requires zero amount parity delta and balanced Journal drafts',
      );
    }

    const unexpectedBlock = report.exceptions.find(
      ({ blockCode }) => blockCode !== 'POST_SALE_MUTATION',
    );
    if (unexpectedBlock) {
      throw new ConflictException(
        `Canonical sale replay has unresolved block ${unexpectedBlock.blockCode} for ${unexpectedBlock.orderStableId}`,
      );
    }

    const acknowledgedBlockedOrderStableIds = [
      ...new Set(
        input.acknowledgedBlockedOrderStableIds
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ].sort();
    const blockedOrderStableIds = report.exceptions
      .map(({ orderStableId }) => orderStableId)
      .sort();
    if (
      acknowledgedBlockedOrderStableIds.length !==
        input.acknowledgedBlockedOrderStableIds.length ||
      acknowledgedBlockedOrderStableIds.length !==
        blockedOrderStableIds.length ||
      acknowledgedBlockedOrderStableIds.some(
        (value, index) => value !== blockedOrderStableIds[index],
      )
    ) {
      throw new ConflictException(
        'acknowledgedBlockedOrderStableIds must exactly match the current POST_SALE_MUTATION exception inventory',
      );
    }

    await this.accounting.assertNoLegacyOrderRevenueAccrual();
    for (const { journal } of readyJournals) {
      await this.accounting.createJournalEntry(
        journal,
        CANONICAL_SALE_SYSTEM_ACTOR,
      );
    }

    return {
      ...report,
      execution: {
        postedOrReplayed: readyJournals.length,
        blockedAcknowledged: blockedOrderStableIds.length,
      },
    };
  }
}
