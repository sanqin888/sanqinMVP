import { ConflictException, Inject, Injectable } from '@nestjs/common';

import { runSerializableAccountingWrite } from './accounting-atomic-write';
import {
  AccountingFinancialDocumentType,
  AccountingFinancialProvider,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
  AccountingJournalSource,
  AccountingProviderFinancialReviewStatus,
} from './accounting-contracts';
import { writeAccountingAuditLog } from './accounting-audit-writer';
import {
  ACCOUNTING_DB,
  type AccountingDb,
  type AccountingTransactionClient,
} from './accounting-db';
import {
  advanceProviderFinancialCompleteThroughInTx,
  recordProviderPaymentFactCutoverInTx,
} from './accounting-inbox-core.writer';
import { resolveProviderFinancialCoverageFrontier } from './accounting-provider-financial-coverage.policy';
import { PROVIDER_FINANCIAL_SOURCE_FACT_TYPE } from './accounting-provider-settlement.policy';

export type ProviderFinancialCoverageReconciliationResult = {
  status: 'NOT_PROVISIONED' | 'UNCHANGED' | 'ADVANCED';
  provider: AccountingFinancialProvider;
  storeStableId: string;
  financialHistoryRequiredFrom: string | null;
  previousFinancialCompleteThrough: string | null;
  financialCompleteThrough: string | null;
  evidenceDocumentStableIds: string[];
};

export type ProviderPaymentFactCutoverRecordResult = {
  status: 'RECORDED' | 'UNCHANGED';
  provider: AccountingFinancialProvider;
  storeStableId: string;
  providerPaymentFactCutoverAt: string;
};

const dateOnly = (value: Date | null): string | null =>
  value?.toISOString().slice(0, 10) ?? null;

@Injectable()
export class AccountingProviderFinancialCoverageService {
  constructor(@Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb) {}

  async recordProviderPaymentFactCutover(params: {
    provider: AccountingFinancialProvider;
    storeStableId: string;
    providerPaymentFactCutoverAt: Date;
    operatorActorRef: string;
    operatorUserStableId: string | null;
  }): Promise<ProviderPaymentFactCutoverRecordResult> {
    const storeStableId = params.storeStableId.trim();
    const operatorActorRef = params.operatorActorRef.trim();
    const operatorUserStableId = params.operatorUserStableId?.trim() || null;
    const cutoverMillis = params.providerPaymentFactCutoverAt.getTime();

    if (params.provider !== AccountingFinancialProvider.CLOVER) {
      throw new ConflictException(
        'provider payment-fact cutover is currently supported only for CLOVER',
      );
    }
    if (!storeStableId) {
      throw new Error(
        'storeStableId is required for provider payment-fact cutover',
      );
    }
    if (!operatorActorRef) {
      throw new Error(
        'operatorActorRef is required for provider payment-fact cutover',
      );
    }
    if (!Number.isFinite(cutoverMillis)) {
      throw new Error('providerPaymentFactCutoverAt must be a valid Date');
    }

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const coverage = await tx.accountingProviderFinancialCoverage.findUnique({
        where: {
          provider_storeStableId: {
            provider: params.provider,
            storeStableId,
          },
        },
        select: {
          id: true,
          coverageStableId: true,
          financialHistoryRequiredFrom: true,
          providerPaymentFactCutoverAt: true,
        },
      });
      if (!coverage) {
        throw new ConflictException(
          'provider financial coverage must be provisioned before recording payment-fact cutover',
        );
      }
      if (
        params.providerPaymentFactCutoverAt <
        coverage.financialHistoryRequiredFrom
      ) {
        throw new ConflictException(
          'provider payment-fact cutover cannot precede financial history boundary',
        );
      }

      const existing = coverage.providerPaymentFactCutoverAt;
      if (existing) {
        if (existing.getTime() !== cutoverMillis) {
          throw new ConflictException(
            'provider payment-fact cutover is immutable once recorded',
          );
        }
        return {
          status: 'UNCHANGED',
          provider: params.provider,
          storeStableId,
          providerPaymentFactCutoverAt: existing.toISOString(),
        };
      }

      await recordProviderPaymentFactCutoverInTx(
        tx,
        coverage.id,
        params.providerPaymentFactCutoverAt,
        operatorUserStableId,
      );
      await writeAccountingAuditLog(tx, {
        action: 'RECORD_PROVIDER_PAYMENT_FACT_CUTOVER',
        entityType: 'ACCOUNTING_PROVIDER_FINANCIAL_COVERAGE',
        entityId: coverage.coverageStableId,
        operatorActorRef,
        beforeJson: {
          provider: params.provider,
          storeStableId,
          providerPaymentFactCutoverAt: null,
        },
        afterJson: {
          provider: params.provider,
          storeStableId,
          providerPaymentFactCutoverAt:
            params.providerPaymentFactCutoverAt.toISOString(),
        },
      });

      return {
        status: 'RECORDED',
        provider: params.provider,
        storeStableId,
        providerPaymentFactCutoverAt:
          params.providerPaymentFactCutoverAt.toISOString(),
      };
    });
  }

  async reconcilePostedCoverage(params: {
    provider: AccountingFinancialProvider;
    storeStableId: string;
    operatorActorRef: string;
  }): Promise<ProviderFinancialCoverageReconciliationResult> {
    const storeStableId = params.storeStableId.trim();
    const operatorActorRef = params.operatorActorRef.trim();
    if (!storeStableId) {
      throw new Error(
        'storeStableId is required for provider coverage reconciliation',
      );
    }
    if (!operatorActorRef) {
      throw new Error(
        'operatorActorRef is required for provider coverage reconciliation',
      );
    }

    return runSerializableAccountingWrite(this.prisma, (tx) =>
      this.reconcilePostedCoverageInTx(
        params.provider,
        storeStableId,
        operatorActorRef,
        tx,
      ),
    );
  }

  private async reconcilePostedCoverageInTx(
    provider: AccountingFinancialProvider,
    storeStableId: string,
    operatorActorRef: string,
    tx: AccountingTransactionClient,
  ): Promise<ProviderFinancialCoverageReconciliationResult> {
    const coverage = await tx.accountingProviderFinancialCoverage.findUnique({
      where: {
        provider_storeStableId: {
          provider,
          storeStableId,
        },
      },
      select: {
        id: true,
        coverageStableId: true,
        financialHistoryRequiredFrom: true,
        financialCompleteThrough: true,
      },
    });

    if (!coverage) {
      return {
        status: 'NOT_PROVISIONED',
        provider,
        storeStableId,
        financialHistoryRequiredFrom: null,
        previousFinancialCompleteThrough: null,
        financialCompleteThrough: null,
        evidenceDocumentStableIds: [],
      };
    }

    const documents = await tx.accountingProviderFinancialDocument.findMany({
      where: {
        provider,
        storeStableId,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        periodStart: { not: null },
        periodEnd: { not: null },
      },
      select: {
        documentStableId: true,
        businessIdentityKey: true,
        revision: true,
        periodStart: true,
        periodEnd: true,
        artifact: {
          select: {
            inboxItem: {
              select: {
                status: true,
                materializedEntityType: true,
                materializedEntityStableId: true,
                reviewedAt: true,
                reviewedByUserStableId: true,
              },
            },
          },
        },
        reviewRevisions: {
          orderBy: { revision: 'desc' },
          take: 1,
          select: {
            status: true,
            confirmedAt: true,
            confirmedByUserStableId: true,
          },
        },
      },
      orderBy: [
        { periodStart: 'asc' },
        { periodEnd: 'asc' },
        { revision: 'asc' },
      ],
    });

    const latestRevisionByBusinessIdentity = new Map<string, number>();
    for (const document of documents) {
      latestRevisionByBusinessIdentity.set(
        document.businessIdentityKey,
        Math.max(
          latestRevisionByBusinessIdentity.get(document.businessIdentityKey) ??
            0,
          document.revision,
        ),
      );
    }

    const documentStableIds = documents.map(
      (document) => document.documentStableId,
    );
    const journals =
      documentStableIds.length === 0
        ? []
        : await tx.accountingJournalEntry.findMany({
            where: {
              deletedAt: null,
              source: AccountingJournalSource.PLATFORM_STATEMENT,
              sourceFactType: PROVIDER_FINANCIAL_SOURCE_FACT_TYPE,
              sourceFactStableId: { in: documentStableIds },
            },
            select: {
              entryStableId: true,
              sourceFactStableId: true,
              sourceFactVersion: true,
              storeStableId: true,
            },
            orderBy: { entryStableId: 'asc' },
          });

    const journalsByDocumentStableId = new Map<string, typeof journals>();
    for (const journal of journals) {
      if (!journal.sourceFactStableId) continue;
      journalsByDocumentStableId.set(journal.sourceFactStableId, [
        ...(journalsByDocumentStableId.get(journal.sourceFactStableId) ?? []),
        journal,
      ]);
    }

    const intervals = documents.flatMap((document) => {
      const inbox = document.artifact.inboxItem;
      const latestDocumentRevision =
        latestRevisionByBusinessIdentity.get(document.businessIdentityKey) ??
        document.revision;
      // Historical machine-confirmed statements remain valid when no Human
      // Review exists. Once Human Review exists, the latest revision must be
      // explicitly confirmed before the statement can extend completeness.
      const latestHumanReview = document.reviewRevisions[0] ?? null;
      const humanReviewResolved =
        latestHumanReview === null ||
        (latestHumanReview.status ===
          AccountingProviderFinancialReviewStatus.CONFIRMED &&
          Boolean(latestHumanReview.confirmedAt) &&
          Boolean(latestHumanReview.confirmedByUserStableId));
      const anchors =
        journalsByDocumentStableId.get(document.documentStableId) ?? [];
      const anchor = anchors.length === 1 ? anchors[0] : null;
      if (
        !document.periodStart ||
        !document.periodEnd ||
        document.revision !== latestDocumentRevision ||
        !inbox ||
        inbox.status !== AccountingInboxStatus.CONFIRMED ||
        inbox.materializedEntityType !==
          AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT ||
        inbox.materializedEntityStableId !== document.documentStableId ||
        !inbox.reviewedAt ||
        !inbox.reviewedByUserStableId ||
        !humanReviewResolved ||
        !anchor ||
        anchor.sourceFactVersion !== document.revision ||
        anchor.storeStableId !== storeStableId
      ) {
        return [];
      }
      return [
        {
          documentStableId: document.documentStableId,
          periodStart: document.periodStart.toISOString().slice(0, 10),
          periodEnd: document.periodEnd.toISOString().slice(0, 10),
        },
      ];
    });

    const financialHistoryRequiredFrom = dateOnly(
      coverage.financialHistoryRequiredFrom,
    );
    if (!financialHistoryRequiredFrom) {
      throw new Error(
        'provider financial coverage is missing its history boundary',
      );
    }
    const previousFinancialCompleteThrough = dateOnly(
      coverage.financialCompleteThrough,
    );
    const resolved = resolveProviderFinancialCoverageFrontier({
      financialHistoryRequiredFrom,
      financialCompleteThrough: previousFinancialCompleteThrough,
      intervals,
    });

    if (
      resolved.financialCompleteThrough === previousFinancialCompleteThrough
    ) {
      return {
        status: 'UNCHANGED',
        provider,
        storeStableId,
        financialHistoryRequiredFrom,
        previousFinancialCompleteThrough,
        financialCompleteThrough: previousFinancialCompleteThrough,
        evidenceDocumentStableIds: resolved.evidenceDocumentStableIds,
      };
    }

    if (!resolved.financialCompleteThrough) {
      return {
        status: 'UNCHANGED',
        provider,
        storeStableId,
        financialHistoryRequiredFrom,
        previousFinancialCompleteThrough,
        financialCompleteThrough: previousFinancialCompleteThrough,
        evidenceDocumentStableIds: resolved.evidenceDocumentStableIds,
      };
    }

    await advanceProviderFinancialCompleteThroughInTx(
      tx,
      coverage.id,
      new Date(`${resolved.financialCompleteThrough}T00:00:00.000Z`),
    );
    await writeAccountingAuditLog(tx, {
      action: 'ADVANCE_FINANCIAL_COMPLETE_THROUGH',
      entityType: 'ACCOUNTING_PROVIDER_FINANCIAL_COVERAGE',
      entityId: coverage.coverageStableId,
      operatorActorRef,
      beforeJson: {
        provider,
        storeStableId,
        financialHistoryRequiredFrom,
        financialCompleteThrough: previousFinancialCompleteThrough,
      },
      afterJson: {
        provider,
        storeStableId,
        financialHistoryRequiredFrom,
        financialCompleteThrough: resolved.financialCompleteThrough,
        evidenceDocumentStableIds: resolved.evidenceDocumentStableIds,
      },
    });

    return {
      status: 'ADVANCED',
      provider,
      storeStableId,
      financialHistoryRequiredFrom,
      previousFinancialCompleteThrough,
      financialCompleteThrough: resolved.financialCompleteThrough,
      evidenceDocumentStableIds: resolved.evidenceDocumentStableIds,
    };
  }
}
