import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  type OrderFinancialReplayEligibilityV1,
  type OrderFinancialReplayPricingResolutionV1,
} from '../orders/public-api';
import { AccountingService } from './accounting.service';
import {
  buildCanonicalSaleJournal,
  CANONICAL_SALE_SYSTEM_ACTOR,
  CanonicalSaleJournalPolicyError,
  type CanonicalSaleJournalPolicyErrorCode,
} from './accounting-canonical-sale-journal.policy';
import type { AccountingJournalCreateInput } from './accounting-journal-policy';

export type CanonicalSalePostingBlockCode =
  | 'POST_SALE_MUTATION'
  | 'PRICING_MANUAL_OVERRIDE'
  | 'PRICING_UNRESOLVED'
  | 'BEFORE_ACCOUNTING_START_DATE'
  | 'STORE_BALANCE_TOPUP_ON_SALE'
  | 'JOURNAL_POLICY';

export type CanonicalSalePostingBlock = {
  code: CanonicalSalePostingBlockCode;
  message: string;
  policyCode?: CanonicalSaleJournalPolicyErrorCode;
};

export type CanonicalSalePostingPreview = {
  orderStableId: string;
  status: 'READY' | 'BLOCKED';
  accountingStartAt: string;
  replayEligibility: OrderFinancialReplayEligibilityV1;
  pricingResolution: OrderFinancialReplayPricingResolutionV1;
  source: {
    factStableId: string;
    sourceEvidence: OrderFinancialFactV1['sourceEvidence'];
    pricingEvidence: OrderFinancialFactV1['pricingEvidence'];
    storeStableId: string | null;
    channel: OrderFinancialFactV1['channel'];
    paymentMethod: OrderFinancialFactV1['paymentMethod'];
    occurredAt: string;
  };
  loyalty: {
    storeBalanceRedeemedCents: number;
    storeBalanceReturnedCents: number;
  } | null;
  journal: AccountingJournalCreateInput | null;
  block: CanonicalSalePostingBlock | null;
};

function sourceSummary(fact: OrderFinancialFactV1) {
  return {
    factStableId: fact.factStableId,
    sourceEvidence: fact.sourceEvidence,
    pricingEvidence: fact.pricingEvidence,
    storeStableId: fact.storeStableId,
    channel: fact.channel,
    paymentMethod: fact.paymentMethod,
    occurredAt: fact.occurredAt.toISOString(),
  };
}

function safeFactSum(
  facts: LoyaltyFinancialFactV1[],
  kind: LoyaltyFinancialFactV1['kind'],
): number {
  let total = 0;
  for (const fact of facts) {
    if (fact.kind !== kind) continue;
    if (!Number.isSafeInteger(fact.amountCents) || fact.amountCents < 0) {
      throw new ConflictException(
        `Invalid Loyalty financial fact amount for ${fact.factStableId}`,
      );
    }
    total += fact.amountCents;
    if (!Number.isSafeInteger(total)) {
      throw new ConflictException(
        'Store Balance fact total exceeds safe range',
      );
    }
  }
  return total;
}

@Injectable()
export class AccountingCanonicalSalePostingService {
  constructor(
    private readonly accounting: AccountingService,
    @Inject(ORDER_FINANCIAL_FACTS_READER)
    private readonly orders: OrderFinancialFactsReaderPort,
    @Inject(LOYALTY_FINANCIAL_FACTS_READER)
    private readonly loyalty: LoyaltyFinancialFactsReaderPort,
  ) {}

  async previewCanonicalSale(
    orderStableId: string,
  ): Promise<CanonicalSalePostingPreview> {
    const stableId = orderStableId.trim();
    if (!stableId) {
      throw new NotFoundException('Order financial fact not found');
    }

    const accountingStartAt =
      await this.accounting.requireCanonicalFinancialPostingStartAt();
    const candidate =
      await this.orders.readReplayCandidateByOrderStableId(stableId);
    if (!candidate) {
      throw new NotFoundException('Order financial fact not found');
    }

    const source = sourceSummary(candidate.sourceFact);
    const base = {
      orderStableId: candidate.sourceFact.orderStableId,
      accountingStartAt: accountingStartAt.toISOString(),
      replayEligibility: candidate.replayEligibility,
      pricingResolution: candidate.pricingResolution,
      source,
    };

    const sourceBlock = this.sourceBlock(candidate);
    if (sourceBlock) {
      return {
        ...base,
        status: 'BLOCKED',
        loyalty: null,
        journal: null,
        block: sourceBlock,
      };
    }

    const fact = candidate.resolvedFact;
    if (!fact) {
      return {
        ...base,
        status: 'BLOCKED',
        loyalty: null,
        journal: null,
        block: {
          code: 'PRICING_UNRESOLVED',
          message: 'Owner replay candidate has no resolved SALE fact',
        },
      };
    }

    if (fact.occurredAt < accountingStartAt) {
      return {
        ...base,
        status: 'BLOCKED',
        loyalty: null,
        journal: null,
        block: {
          code: 'BEFORE_ACCOUNTING_START_DATE',
          message: `SALE occurred before accounting start ${accountingStartAt.toISOString()}`,
        },
      };
    }

    const loyaltyFacts = await this.loyalty.readFactsByOrderStableId(
      fact.orderStableId,
    );
    if (loyaltyFacts.some(({ kind }) => kind === 'STORE_BALANCE_TOPUP')) {
      return {
        ...base,
        status: 'BLOCKED',
        loyalty: null,
        journal: null,
        block: {
          code: 'STORE_BALANCE_TOPUP_ON_SALE',
          message:
            'SALE order unexpectedly carries Store Balance top-up principal',
        },
      };
    }

    const storeBalanceRedeemedCents = safeFactSum(
      loyaltyFacts,
      'STORE_BALANCE_REDEEMED',
    );
    const storeBalanceReturnedCents = safeFactSum(
      loyaltyFacts,
      'STORE_BALANCE_RETURNED',
    );
    const loyalty = {
      storeBalanceRedeemedCents,
      storeBalanceReturnedCents,
    };

    try {
      const draft = buildCanonicalSaleJournal({
        fact,
        storeBalanceRedeemedCents,
      });
      return {
        ...base,
        status: 'READY',
        loyalty,
        journal: draft.journal,
        block: null,
      };
    } catch (error) {
      if (!(error instanceof CanonicalSaleJournalPolicyError)) throw error;
      return {
        ...base,
        status: 'BLOCKED',
        loyalty,
        journal: null,
        block: {
          code: 'JOURNAL_POLICY',
          policyCode: error.code,
          message: error.message,
        },
      };
    }
  }

  async postCanonicalSale(orderStableId: string) {
    const preview = await this.previewCanonicalSale(orderStableId);
    if (preview.status !== 'READY' || !preview.journal) {
      throw new ConflictException(
        `Canonical sale posting blocked: ${preview.block?.code ?? 'UNKNOWN'}`,
      );
    }

    const entry = await this.accounting.createJournalEntry(
      preview.journal,
      CANONICAL_SALE_SYSTEM_ACTOR,
    );
    return {
      preview,
      journalEntry: {
        entryStableId: entry.entryStableId,
        idempotencyKey: entry.idempotencyKey,
        version: entry.version,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      },
    };
  }

  private sourceBlock(
    candidate: OrderFinancialReplayCandidateV1,
  ): CanonicalSalePostingBlock | null {
    if (candidate.replayEligibility === 'POST_SALE_MUTATION') {
      return {
        code: 'POST_SALE_MUTATION',
        message:
          'Original SALE cannot be replayed from a post-sale mutated Order',
      };
    }
    if (candidate.replayEligibility !== 'PRICING_UNRESOLVED') return null;
    if (candidate.pricingResolution === 'MANUAL_OVERRIDE') {
      return {
        code: 'PRICING_MANUAL_OVERRIDE',
        message: 'Historical SALE requires an explicit pricing override',
      };
    }
    return {
      code: 'PRICING_UNRESOLVED',
      message: 'Historical SALE pricing cannot be resolved without guessing',
    };
  }
}
