import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  AccountingFinancialProvider,
  AccountingJournalSource,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  AccountingCloverPreSyncAuthorityService,
  type CloverPreSyncAuthorityPeriodV1,
} from './accounting-clover-pre-sync-authority.service';
import {
  buildCloverAuthorityReplacementPreview,
  type CloverAuthorityReplacementBlockReason,
} from './accounting-clover-authority-replacement.policy';
import { hashAccountingJson } from './accounting-inbox-core.policy';
import { AccountingPeriodService } from './accounting-period.service';
import { AccountingProviderPendingReconciliationService } from './accounting-provider-pending-reconciliation.service';
import { AccountingProviderSettlementQueryService } from './accounting-provider-settlement-query.service';

const EXPECTED_ORDER_PENDING_SOURCE_FACT_TYPES = new Set([
  'order.financial_sale.v1',
  'order.financial_adjustment.v1',
  'order.financial_reversal.v1',
]);

const CLOVER_PENDING_ACCOUNT_STABLE_ID = 'account_clover_pending';
const STORE_CASH_ACCOUNT_STABLE_ID = 'account_store_cash';
const TIP_REVENUE_ACCOUNT_STABLE_ID = 'account_tip_revenue';
const SURCHARGE_REVENUE_ACCOUNT_STABLE_ID = 'account_card_surcharge_revenue';

type OrderAuthorityAnchor = {
  entryStableId: string;
  idempotencyKey: string;
  idempotencyHash: string;
  sourceFactType: string | null;
  sourceFactStableId: string | null;
  version: number;
  occurredAt: string;
  pendingMovementCents: number;
};

export type CloverAuthorityReplacementPreviewPeriodV1 = {
  statementDocumentStableId: string;
  statementBusinessIdentityKey: string;
  statementPeriod: {
    from: string;
    to: string;
  };
  authorityWindow: {
    from: string;
    to: string;
    truncatedAtAccountingStart: boolean;
    batchCount: number;
  };
  providerEvidence: {
    principalCents: number;
    tipsCents: number;
    surchargeCents: number | null;
    surchargeAuthority:
      | 'EXPLICIT_PROVIDER_EVIDENCE'
      | 'UNKNOWN_OR_PARTIAL_STATEMENT';
    refundCount: number;
    refundCents: number;
    batchDocumentStableIds: string[];
  };
  orderEvidence: {
    pendingMovementCents: number;
    storeCashMovementCents: number;
    tipRevenueCents: number;
    surchargeRevenueCents: number;
    anchors: OrderAuthorityAnchor[];
    unexpectedPendingSourceFactTypes: string[];
  };
  proposal: {
    status: 'READY' | 'BLOCKED';
    blockReasons: CloverAuthorityReplacementBlockReason[];
    pendingAuthorityDeltaCents: number;
    missingTipRevenueCents: number | null;
    missingSurchargeRevenueCents: number | null;
    storeCashReclassificationCents: number | null;
    draftJournal: ReturnType<
      typeof buildCloverAuthorityReplacementPreview
    >['draftJournal'];
  };
  pendingRollForward: {
    actualOpeningCents: number;
    actualPeriodMovementCents: number;
    actualClosingCents: number;
    simulatedOpeningAfterPriorAuthorityAdjustmentsCents: number;
    proposedAuthorityAdjustmentCents: number;
    simulatedProviderAuthorityClosingCents: number;
  };
};

export type CloverAuthorityReplacementPreviewReportV1 = {
  version: 1;
  mode: 'READ_ONLY_PREVIEW';
  status: 'READY_FOR_HUMAN_REVIEW' | 'BLOCKED';
  provider: 'CLOVER';
  storeStableId: string;
  accountingStartDate: string;
  providerPaymentFactCutoverAt: string | null;
  planHash: string;
  globalIssues: string[];
  periods: CloverAuthorityReplacementPreviewPeriodV1[];
  totals: {
    providerPrincipalCents: number;
    orderPendingMovementCents: number;
    proposedPendingAuthorityAdjustmentCents: number;
    providerTipsCents: number;
    providerExplicitSurchargeCents: number;
    readyPeriods: number;
    blockedPeriods: number;
  };
};

const safeSum = (values: number[], field: string): number => {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) {
      throw new ConflictException(`${field} contains an unsafe integer`);
    }
    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new ConflictException(`${field} exceeds safe integer range`);
    }
  }
  return total;
};

@Injectable()
export class AccountingCloverAuthorityReplacementService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly period: AccountingPeriodService,
    private readonly preSyncAuthority: AccountingCloverPreSyncAuthorityService,
    private readonly pendingReconciliation: AccountingProviderPendingReconciliationService,
    private readonly settlementQuery: AccountingProviderSettlementQueryService,
  ) {}

  async preview(input: {
    storeStableId: string;
  }): Promise<CloverAuthorityReplacementPreviewReportV1> {
    const storeStableId = input.storeStableId.trim();
    if (!storeStableId) {
      throw new BadRequestException('storeStableId is required');
    }

    const [accountingStartDate, timezone, authorityPeriods, coverageRows] =
      await Promise.all([
        this.period.getAccountingStartDate(),
        this.period.getBusinessTimezone(),
        this.preSyncAuthority.readAuthorityPeriods({ storeStableId }),
        this.settlementQuery.readProviderFinancialCoverage({
          storeStableId,
          providers: [AccountingFinancialProvider.CLOVER],
        }),
      ]);
    if (!accountingStartDate) {
      throw new ConflictException(
        'accountingStartDate must be configured before Clover authority replacement preview',
      );
    }
    const coverage = coverageRows[0] ?? null;
    if (!coverage) {
      throw new ConflictException(
        'Clover financial coverage must be provisioned before authority replacement preview',
      );
    }

    const financialCompleteThrough = coverage.financialCompleteThrough
      ?.toISOString()
      .slice(0, 10);
    const relevantAuthorityPeriods = authorityPeriods.filter((item) => {
      const statementPeriodEnd =
        item.status === 'CLOSED'
          ? item.statement.periodEnd
          : item.statementPeriodEnd;
      return (
        statementPeriodEnd === null ||
        financialCompleteThrough === undefined ||
        statementPeriodEnd <= financialCompleteThrough
      );
    });
    const globalIssues = this.globalCoverageIssues(
      relevantAuthorityPeriods,
      coverage.financialCompleteThrough,
    );
    const coverageHistoryStart = coverage.financialHistoryRequiredFrom
      ?.toISOString()
      .slice(0, 10);
    if (
      coverageHistoryStart !== undefined &&
      coverageHistoryStart !== accountingStartDate
    ) {
      globalIssues.push(
        `CLOVER_FINANCIAL_HISTORY_BOUNDARY_MISMATCH:${coverageHistoryStart}:${accountingStartDate}`,
      );
    }
    if (coverage.providerPaymentFactCutoverAt !== null) {
      globalIssues.push(
        'CLOVER_PAYMENT_FACT_CUTOVER_REQUIRES_EXPLICIT_PREVIEW_BOUNDARY',
      );
    }

    const closedPeriods = relevantAuthorityPeriods
      .filter(
        (
          item,
        ): item is Extract<
          CloverPreSyncAuthorityPeriodV1,
          { status: 'CLOSED' }
        > => item.status === 'CLOSED',
      )
      .sort((left, right) =>
        left.statement.periodStart.localeCompare(right.statement.periodStart),
      );

    const periods: CloverAuthorityReplacementPreviewPeriodV1[] = [];
    let cumulativeProposedPendingAdjustmentCents = 0;
    const claimedBatchIds = new Set<string>();

    for (const authority of closedPeriods) {
      const inScopeBatches = authority.selectedCloseoutBatches.filter(
        (batch) => batch.businessDate >= accountingStartDate,
      );
      if (inScopeBatches.length === 0) continue;

      const duplicateBatch = inScopeBatches.find((batch) =>
        claimedBatchIds.has(batch.batchId),
      );
      if (duplicateBatch) {
        globalIssues.push(
          `CLOVER_BATCH_REUSED_ACROSS_STATEMENTS:${duplicateBatch.batchId}`,
        );
        continue;
      }
      inScopeBatches.forEach((batch) => claimedBatchIds.add(batch.batchId));

      const authorityFrom = inScopeBatches[0].businessDate;
      const authorityTo =
        inScopeBatches[inScopeBatches.length - 1].businessDate;
      const fromLocal = DateTime.fromISO(authorityFrom, {
        zone: timezone,
      }).startOf('day');
      const toLocal = DateTime.fromISO(authorityTo, { zone: timezone }).endOf(
        'day',
      );
      if (!fromLocal.isValid || !toLocal.isValid) {
        throw new ConflictException(
          `Invalid Clover authority window ${authorityFrom}..${authorityTo}`,
        );
      }

      const [orderEvidence, reconciliation] = await Promise.all([
        this.readOrderEvidence({
          storeStableId,
          fromInclusive: fromLocal.toUTC().toJSDate(),
          toExclusive: toLocal.plus({ millisecond: 1 }).toUTC().toJSDate(),
        }),
        this.pendingReconciliation.reconcile({
          storeStableId,
          from: authorityFrom,
          to: authorityTo,
          provider: AccountingFinancialProvider.CLOVER,
        }),
      ]);
      const reconciliationRow = reconciliation.providers[0];
      if (!reconciliationRow) {
        throw new ConflictException(
          `Clover Pending reconciliation did not return ${authorityFrom}..${authorityTo}`,
        );
      }

      const providerPrincipalCents = safeSum(
        inScopeBatches.map((batch) => batch.salesCents),
        'Clover provider principal',
      );
      const providerTipsCents = safeSum(
        inScopeBatches.map((batch) => batch.tipsCents),
        'Clover provider tips',
      );
      const providerRefundCount = safeSum(
        inScopeBatches.map((batch) => batch.refundCount),
        'Clover provider refund count',
      );
      const providerRefundCents = safeSum(
        inScopeBatches.map((batch) => batch.refundCents),
        'Clover provider refunds',
      );
      const usesWholeStatementCoverage =
        inScopeBatches.length === authority.selectedCloseoutBatches.length;
      const providerSurchargeCents =
        usesWholeStatementCoverage &&
        authority.coverage.surcharge.status === 'EXPLICIT_PROVIDER_EVIDENCE'
          ? authority.coverage.surcharge.amountCents
          : null;

      const policy = buildCloverAuthorityReplacementPreview({
        statementDocumentStableId: authority.statement.documentStableId,
        authorityFrom,
        authorityTo,
        occurredAt:
          toLocal.toUTC().toISO() ?? toLocal.toUTC().toJSDate().toISOString(),
        storeStableId,
        providerPrincipalCents,
        providerTipsCents,
        providerSurchargeCents,
        providerRefundCount,
        providerRefundCents,
        orderPendingMovementCents: orderEvidence.pendingMovementCents,
        orderStoreCashMovementCents: orderEvidence.storeCashMovementCents,
        orderTipRevenueCents: orderEvidence.tipRevenueCents,
        orderSurchargeRevenueCents: orderEvidence.surchargeRevenueCents,
        unexpectedOrderPendingSourceFactTypes:
          orderEvidence.unexpectedPendingSourceFactTypes,
      });

      const simulatedOpeningAfterPriorAuthorityAdjustmentsCents =
        reconciliationRow.openingBalanceCents +
        cumulativeProposedPendingAdjustmentCents;
      const simulatedProviderAuthorityClosingCents =
        simulatedOpeningAfterPriorAuthorityAdjustmentsCents +
        reconciliationRow.periodNetMovementCents +
        policy.pendingAuthorityDeltaCents;

      periods.push({
        statementDocumentStableId: authority.statement.documentStableId,
        statementBusinessIdentityKey: authority.statement.businessIdentityKey,
        statementPeriod: {
          from: authority.statement.periodStart,
          to: authority.statement.periodEnd,
        },
        authorityWindow: {
          from: authorityFrom,
          to: authorityTo,
          truncatedAtAccountingStart: !usesWholeStatementCoverage,
          batchCount: inScopeBatches.length,
        },
        providerEvidence: {
          principalCents: providerPrincipalCents,
          tipsCents: providerTipsCents,
          surchargeCents: providerSurchargeCents,
          surchargeAuthority:
            providerSurchargeCents === null
              ? 'UNKNOWN_OR_PARTIAL_STATEMENT'
              : 'EXPLICIT_PROVIDER_EVIDENCE',
          refundCount: providerRefundCount,
          refundCents: providerRefundCents,
          batchDocumentStableIds: inScopeBatches.map(
            (batch) => batch.documentStableId,
          ),
        },
        orderEvidence: {
          pendingMovementCents: orderEvidence.pendingMovementCents,
          storeCashMovementCents: orderEvidence.storeCashMovementCents,
          tipRevenueCents: orderEvidence.tipRevenueCents,
          surchargeRevenueCents: orderEvidence.surchargeRevenueCents,
          anchors: orderEvidence.anchors,
          unexpectedPendingSourceFactTypes:
            orderEvidence.unexpectedPendingSourceFactTypes,
        },
        proposal: {
          status: policy.status,
          blockReasons: policy.blockReasons,
          pendingAuthorityDeltaCents: policy.pendingAuthorityDeltaCents,
          missingTipRevenueCents: policy.missingTipRevenueCents,
          missingSurchargeRevenueCents: policy.missingSurchargeRevenueCents,
          storeCashReclassificationCents: policy.storeCashReclassificationCents,
          draftJournal: policy.draftJournal,
        },
        pendingRollForward: {
          actualOpeningCents: reconciliationRow.openingBalanceCents,
          actualPeriodMovementCents: reconciliationRow.periodNetMovementCents,
          actualClosingCents: reconciliationRow.closingBalanceCents,
          simulatedOpeningAfterPriorAuthorityAdjustmentsCents,
          proposedAuthorityAdjustmentCents: policy.pendingAuthorityDeltaCents,
          simulatedProviderAuthorityClosingCents,
        },
      });

      cumulativeProposedPendingAdjustmentCents +=
        policy.pendingAuthorityDeltaCents;
      if (!Number.isSafeInteger(cumulativeProposedPendingAdjustmentCents)) {
        throw new ConflictException(
          'Clover proposed Pending authority adjustment exceeds safe integer range',
        );
      }
    }

    const material = {
      version: 1 as const,
      mode: 'READ_ONLY_PREVIEW' as const,
      provider: AccountingFinancialProvider.CLOVER,
      storeStableId,
      accountingStartDate,
      providerPaymentFactCutoverAt:
        coverage.providerPaymentFactCutoverAt?.toISOString() ?? null,
      globalIssues: [...new Set(globalIssues)].sort(),
      periods,
      totals: {
        providerPrincipalCents: safeSum(
          periods.map((item) => item.providerEvidence.principalCents),
          'Clover preview provider principal total',
        ),
        orderPendingMovementCents: safeSum(
          periods.map((item) => item.orderEvidence.pendingMovementCents),
          'Clover preview Order Pending total',
        ),
        proposedPendingAuthorityAdjustmentCents: safeSum(
          periods.map((item) => item.proposal.pendingAuthorityDeltaCents),
          'Clover preview Pending adjustment total',
        ),
        providerTipsCents: safeSum(
          periods.map((item) => item.providerEvidence.tipsCents),
          'Clover preview tips total',
        ),
        providerExplicitSurchargeCents: safeSum(
          periods.map((item) => item.providerEvidence.surchargeCents ?? 0),
          'Clover preview surcharge total',
        ),
        readyPeriods: periods.filter((item) => item.proposal.status === 'READY')
          .length,
        blockedPeriods: periods.filter(
          (item) => item.proposal.status === 'BLOCKED',
        ).length,
      },
    };
    const status =
      material.globalIssues.length === 0 &&
      material.periods.length > 0 &&
      material.totals.blockedPeriods === 0
        ? ('READY_FOR_HUMAN_REVIEW' as const)
        : ('BLOCKED' as const);

    return {
      ...material,
      status,
      planHash: hashAccountingJson({ ...material, status }),
    };
  }

  private globalCoverageIssues(
    authorityPeriods: CloverPreSyncAuthorityPeriodV1[],
    financialCompleteThrough: Date | null,
  ): string[] {
    const issues = authorityPeriods.flatMap((period) =>
      period.status === 'FAIL_CLOSED'
        ? period.issues.map(
            (issue) =>
              `STATEMENT_FAIL_CLOSED:${period.statementDocumentStableId}:${issue}`,
          )
        : [],
    );
    if (!financialCompleteThrough) {
      issues.push('CLOVER_FINANCIAL_COMPLETE_THROUGH_MISSING');
    }
    return issues;
  }

  private async readOrderEvidence(params: {
    storeStableId: string;
    fromInclusive: Date;
    toExclusive: Date;
  }) {
    const rows = await this.prisma.accountingJournalEntry.findMany({
      where: {
        deletedAt: null,
        storeStableId: params.storeStableId,
        source: AccountingJournalSource.ORDER,
        occurredAt: {
          gte: params.fromInclusive,
          lt: params.toExclusive,
        },
        lines: {
          some: {
            account: {
              accountStableId: {
                in: [
                  CLOVER_PENDING_ACCOUNT_STABLE_ID,
                  STORE_CASH_ACCOUNT_STABLE_ID,
                  TIP_REVENUE_ACCOUNT_STABLE_ID,
                  SURCHARGE_REVENUE_ACCOUNT_STABLE_ID,
                ],
              },
            },
          },
        },
      },
      select: {
        entryStableId: true,
        idempotencyKey: true,
        idempotencyHash: true,
        sourceFactType: true,
        sourceFactStableId: true,
        version: true,
        occurredAt: true,
        lines: {
          where: {
            account: {
              accountStableId: {
                in: [
                  CLOVER_PENDING_ACCOUNT_STABLE_ID,
                  STORE_CASH_ACCOUNT_STABLE_ID,
                  TIP_REVENUE_ACCOUNT_STABLE_ID,
                  SURCHARGE_REVENUE_ACCOUNT_STABLE_ID,
                ],
              },
            },
          },
          select: {
            debitCents: true,
            creditCents: true,
            account: {
              select: {
                accountStableId: true,
              },
            },
          },
          orderBy: { lineNo: 'asc' },
        },
      },
      orderBy: [{ occurredAt: 'asc' }, { entryStableId: 'asc' }],
    });

    let pendingMovementCents = 0;
    let storeCashMovementCents = 0;
    let tipRevenueCents = 0;
    let surchargeRevenueCents = 0;
    const unexpectedPendingSourceFactTypes = new Set<string>();
    const anchors: OrderAuthorityAnchor[] = [];

    for (const row of rows) {
      const pendingMovement = row.lines
        .filter(
          (line) => line.account.accountStableId === CLOVER_PENDING_ACCOUNT_STABLE_ID,
        )
        .reduce((sum, line) => sum + line.debitCents - line.creditCents, 0);
      const storeCashMovement = row.lines
        .filter(
          (line) =>
            line.account.accountStableId === STORE_CASH_ACCOUNT_STABLE_ID,
        )
        .reduce((sum, line) => sum + line.debitCents - line.creditCents, 0);
      const tipRevenue = row.lines
        .filter(
          (line) =>
            line.account.accountStableId === TIP_REVENUE_ACCOUNT_STABLE_ID,
        )
        .reduce((sum, line) => sum + line.creditCents - line.debitCents, 0);
      const surchargeRevenue = row.lines
        .filter(
          (line) =>
            line.account.accountStableId ===
            SURCHARGE_REVENUE_ACCOUNT_STABLE_ID,
        )
        .reduce((sum, line) => sum + line.creditCents - line.debitCents, 0);

      pendingMovementCents = safeSum(
        [pendingMovementCents, pendingMovement],
        'Order Clover Pending movement',
      );
      storeCashMovementCents = safeSum(
        [storeCashMovementCents, storeCashMovement],
        'Order Store Cash movement',
      );
      tipRevenueCents = safeSum(
        [tipRevenueCents, tipRevenue],
        'Order tip revenue',
      );
      surchargeRevenueCents = safeSum(
        [surchargeRevenueCents, surchargeRevenue],
        'Order surcharge revenue',
      );

      if (pendingMovement !== 0) {
        const sourceFactType = row.sourceFactType;
        if (
          !sourceFactType ||
          !EXPECTED_ORDER_PENDING_SOURCE_FACT_TYPES.has(sourceFactType)
        ) {
          unexpectedPendingSourceFactTypes.add(sourceFactType ?? 'NULL');
        }
        anchors.push({
          entryStableId: row.entryStableId,
          idempotencyKey: row.idempotencyKey,
          idempotencyHash: row.idempotencyHash,
          sourceFactType,
          sourceFactStableId: row.sourceFactStableId,
          version: row.version,
          occurredAt: row.occurredAt.toISOString(),
          pendingMovementCents: pendingMovement,
        });
      }
    }

    return {
      pendingMovementCents,
      storeCashMovementCents,
      tipRevenueCents,
      surchargeRevenueCents,
      anchors,
      unexpectedPendingSourceFactTypes: [
        ...unexpectedPendingSourceFactTypes,
      ].sort(),
    };
  }
}
