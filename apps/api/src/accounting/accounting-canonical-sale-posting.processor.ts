import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  ORDER_FINANCIAL_FACTS_READER,
  type OrderFinancialFactV1,
  type OrderFinancialFactsReaderPort,
} from '../orders/public-api';
import {
  BRAND_STORE_CONFIG_READER,
  type BrandStoreConfigReaderPort,
} from '../store/public-api';
import { AccountingFinancialProvider } from './accounting-contracts';
import { AccountingCanonicalSalePostingService } from './accounting-canonical-sale-posting.service';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingPeriodService } from './accounting-period.service';
import { AccountingProviderSettlementQueryService } from './accounting-provider-settlement-query.service';

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_RECENT_LOOKBACK_MS = 48 * 60 * 60 * 1_000;
const DEFAULT_FULL_RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const FULL_RECONCILE_CHUNK_MS = 7 * 24 * 60 * 60 * 1_000;
const DEFAULT_POST_LIMIT = 25;

export type AccountingCanonicalSalePostingProcessorMode = 'RECENT' | 'FULL';

export type AccountingCanonicalSalePostingProcessorRun = {
  mode: AccountingCanonicalSalePostingProcessorMode;
  scanned: number;
  immutable: number;
  alreadyPosted: number;
  legacyDeferred: number;
  authorityDeferred: number;
  blocked: number;
  posted: number;
  failed: number;
  complete: boolean;
};

type ProcessOnceOptions = {
  mode?: AccountingCanonicalSalePostingProcessorMode;
  now?: Date;
  postLimit?: number;
};

type ProviderAuthorityState = {
  uberCoverageLoaded: boolean;
  uberLiveOrderFactCutoverAt: Date | null;
};

type MutableRun = Omit<
  AccountingCanonicalSalePostingProcessorRun,
  'mode' | 'complete'
>;

@Injectable()
export class AccountingCanonicalSalePostingProcessor
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(
    AccountingCanonicalSalePostingProcessor.name,
  );
  private readonly pollIntervalMs = this.readPositiveMs(
    process.env.ACCOUNTING_CANONICAL_SALE_POLL_MS,
    DEFAULT_POLL_INTERVAL_MS,
  );
  private readonly recentLookbackMs = this.readPositiveMs(
    process.env.ACCOUNTING_CANONICAL_SALE_RECENT_LOOKBACK_MS,
    DEFAULT_RECENT_LOOKBACK_MS,
  );
  private readonly fullReconcileIntervalMs = this.readPositiveMs(
    process.env.ACCOUNTING_CANONICAL_SALE_FULL_RECONCILE_MS,
    DEFAULT_FULL_RECONCILE_INTERVAL_MS,
  );
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private lastFullReconcileAtMs: number | null = null;
  private readonly reportedBlockedOrderStableIds = new Set<string>();

  constructor(
    private readonly period: AccountingPeriodService,
    private readonly journal: AccountingJournalService,
    private readonly posting: AccountingCanonicalSalePostingService,
    private readonly settlementQuery: AccountingProviderSettlementQueryService,
    @Inject(ORDER_FINANCIAL_FACTS_READER)
    private readonly orders: OrderFinancialFactsReaderPort,
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly storeConfig: BrandStoreConfigReaderPort,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.pollSafely(), this.pollIntervalMs);
    this.timer.unref();
    void this.pollSafely();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Reconciles durable immutable SALE facts to canonical Journal anchors.
   *
   * Public for deterministic worker/recovery tests and operator-directed draining.
   * Historical LEGACY_CURRENT_ORDER reconstruction intentionally remains on the
   * controlled replay path rather than entering automatic posting.
   */
  async processOnce(
    options: ProcessOnceOptions = {},
  ): Promise<AccountingCanonicalSalePostingProcessorRun> {
    const now = options.now ?? new Date();
    const postLimit = this.readPositiveInteger(
      options.postLimit,
      DEFAULT_POST_LIMIT,
    );
    const accountingStartAt =
      await this.period.requireCanonicalFinancialPostingStartAt();
    const store = await this.storeConfig.getConfiguredStoreSnapshot();
    const mode = options.mode ?? this.resolveMode(now);
    const fromInclusive =
      mode === 'FULL'
        ? accountingStartAt
        : new Date(
            Math.max(
              accountingStartAt.getTime(),
              now.getTime() - this.recentLookbackMs,
            ),
          );

    const run: MutableRun = {
      scanned: 0,
      immutable: 0,
      alreadyPosted: 0,
      legacyDeferred: 0,
      authorityDeferred: 0,
      blocked: 0,
      posted: 0,
      failed: 0,
    };
    if (now.getTime() <= fromInclusive.getTime()) {
      if (mode === 'FULL') this.lastFullReconcileAtMs = now.getTime();
      return { mode, ...run, complete: true };
    }

    const providerAuthority: ProviderAuthorityState = {
      uberCoverageLoaded: false,
      uberLiveOrderFactCutoverAt: null,
    };
    let cursor = fromInclusive;
    let complete = true;

    while (cursor.getTime() < now.getTime()) {
      const toExclusive =
        mode === 'FULL'
          ? new Date(
              Math.min(
                cursor.getTime() + FULL_RECONCILE_CHUNK_MS,
                now.getTime(),
              ),
            )
          : now;

      const rangeComplete = await this.processRange({
        fromInclusive: cursor,
        toExclusive,
        storeStableId: store.storeStableId,
        providerAuthority,
        postLimit,
        run,
      });

      if (!rangeComplete) {
        complete = false;
        break;
      }
      cursor = toExclusive;
    }

    if (mode === 'FULL' && complete) {
      this.lastFullReconcileAtMs = now.getTime();
    }
    if (run.posted > 0 || run.blocked > 0 || run.failed > 0) {
      this.logger.log({
        event: 'accounting_canonical_sale_posting_reconciled',
        storeStableId: store.storeStableId,
        mode,
        ...run,
        complete,
      });
    }
    return { mode, ...run, complete };
  }

  private async processRange(params: {
    fromInclusive: Date;
    toExclusive: Date;
    storeStableId: string;
    providerAuthority: ProviderAuthorityState;
    postLimit: number;
    run: MutableRun;
  }): Promise<boolean> {
    const facts = await this.orders.readFactsForRange({
      fromInclusive: params.fromInclusive,
      toExclusive: params.toExclusive,
      storeStableId: params.storeStableId,
    });
    params.run.scanned += facts.length;

    const immutableFacts = facts.filter(
      (fact) => fact.sourceEvidence === 'IMMUTABLE_SALE_SNAPSHOT',
    );
    params.run.immutable += immutableFacts.length;
    params.run.legacyDeferred += facts.length - immutableFacts.length;
    if (immutableFacts.length === 0) return true;

    const anchors = await this.journal.readCanonicalSaleJournalAnchors(
      immutableFacts.map((fact) => fact.factStableId),
    );
    const postedFactStableIds = new Set(
      anchors.map((anchor) => anchor.sourceFactStableId),
    );
    params.run.alreadyPosted += immutableFacts.filter((fact) =>
      postedFactStableIds.has(fact.factStableId),
    ).length;

    const missingFacts = immutableFacts.filter(
      (fact) => !postedFactStableIds.has(fact.factStableId),
    );
    if (missingFacts.length === 0) return true;

    const missingUberFacts = missingFacts.filter(
      (fact) => fact.channel === 'ubereats',
    );
    let uberAuthorityReadable = true;
    if (missingUberFacts.length > 0) {
      try {
        await this.loadUberAuthority(
          params.storeStableId,
          params.providerAuthority,
        );
      } catch (error) {
        uberAuthorityReadable = false;
        params.run.failed += missingUberFacts.length;
        this.logger.error({
          event: 'accounting_canonical_sale_provider_authority_read_failed',
          provider: AccountingFinancialProvider.UBER_EATS,
          storeStableId: params.storeStableId,
          affectedFacts: missingUberFacts.length,
          errorType: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }

    for (const fact of missingFacts) {
      if (params.run.posted >= params.postLimit) return false;
      if (fact.channel === 'ubereats' && !uberAuthorityReadable) continue;
      if (
        !this.isAutomaticPostingAuthoritative(fact, params.providerAuthority)
      ) {
        params.run.authorityDeferred += 1;
        continue;
      }

      try {
        const preview = await this.posting.previewCanonicalSale(
          fact.orderStableId,
        );
        if (preview.status !== 'READY') {
          params.run.blocked += 1;
          this.logBlockedOnce(
            fact.orderStableId,
            preview.block?.code ?? 'UNKNOWN',
          );
          continue;
        }

        await this.posting.postCanonicalSale(fact.orderStableId);
        params.run.posted += 1;
        this.reportedBlockedOrderStableIds.delete(fact.orderStableId);
      } catch (error) {
        params.run.failed += 1;
        this.logger.error({
          event: 'accounting_canonical_sale_posting_failed',
          orderStableId: fact.orderStableId,
          errorType: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }
    return true;
  }

  private async loadUberAuthority(
    storeStableId: string,
    state: ProviderAuthorityState,
  ): Promise<void> {
    if (state.uberCoverageLoaded) return;
    const rows = await this.settlementQuery.readProviderFinancialCoverage({
      storeStableId,
      providers: [AccountingFinancialProvider.UBER_EATS],
    });
    state.uberCoverageLoaded = true;
    state.uberLiveOrderFactCutoverAt =
      rows.find((row) => row.provider === AccountingFinancialProvider.UBER_EATS)
        ?.liveOrderFactCutoverAt ?? null;
  }

  private isAutomaticPostingAuthoritative(
    fact: OrderFinancialFactV1,
    state: ProviderAuthorityState,
  ): boolean {
    if (fact.channel !== 'ubereats') return true;
    const cutover = state.uberLiveOrderFactCutoverAt;
    return Boolean(cutover && fact.occurredAt.getTime() >= cutover.getTime());
  }

  private resolveMode(now: Date): AccountingCanonicalSalePostingProcessorMode {
    if (
      this.lastFullReconcileAtMs === null ||
      now.getTime() - this.lastFullReconcileAtMs >= this.fullReconcileIntervalMs
    ) {
      return 'FULL';
    }
    return 'RECENT';
  }

  private async pollSafely(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.processOnce();
    } catch (error) {
      this.logger.error({
        event: 'accounting_canonical_sale_posting_processor_failed',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
    } finally {
      this.polling = false;
    }
  }

  private logBlockedOnce(orderStableId: string, blockCode: string): void {
    if (this.reportedBlockedOrderStableIds.has(orderStableId)) return;
    this.reportedBlockedOrderStableIds.add(orderStableId);
    this.logger.warn({
      event: 'accounting_canonical_sale_posting_blocked',
      orderStableId,
      blockCode,
    });
  }

  private readPositiveMs(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private readPositiveInteger(
    raw: number | undefined,
    fallback: number,
  ): number {
    return Number.isInteger(raw) && (raw ?? 0) > 0 ? (raw as number) : fallback;
  }
}
