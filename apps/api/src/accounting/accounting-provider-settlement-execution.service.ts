import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
} from './accounting-contracts';

import type {
  ProviderSettlementAccountAuthorityV1,
  ProviderSettlementHistoricalJournalAnchorV1,
  ProviderSettlementReplacementGroupAuthorityV1,
} from './accounting-provider-settlement-write-authority';
import {
  AccountingProviderSettlementPreviewService,
  type ProviderSettlementShadowPreviewInput,
} from './accounting-provider-settlement-preview.service';
import { AccountingJournalService } from './accounting-journal.service';

export const PROVIDER_SETTLEMENT_SYSTEM_ACTOR =
  'system:accounting-provider-settlement';

type ProviderSettlementPreviewReport = Awaited<
  ReturnType<AccountingProviderSettlementPreviewService['previewRange']>
>;
type ProviderDocumentPlan =
  ProviderSettlementPreviewReport['providerDocuments'][number];
type UberReversalPlan =
  ProviderSettlementPreviewReport['uberPreCutoverOrderReversals'][number];

export type ProviderSettlementExecutionInput =
  ProviderSettlementShadowPreviewInput & {
    expectedPlanHash: string;
  };

export type ProviderSettlementExecutionReport =
  ProviderSettlementPreviewReport & {
    execution: {
      replacementGroupsExecuted: number;
      journalEntriesPostedOrReplayed: number;
      providerDocumentsPostedOrReplayed: number;
      uberReversalsPostedOrReplayed: number;
      noopProviderDocumentsNotWritten: number;
      blockedProviderDocumentsNotWritten: number;
      alreadyPostedProviderDocumentsNotWritten: number;
      blockedUberReversalsNotWritten: number;
      alreadyReversedUberReversalsNotWritten: number;
    };
  };

@Injectable()
export class AccountingProviderSettlementExecutionService {
  constructor(
    private readonly preview: AccountingProviderSettlementPreviewService,
    private readonly journal: AccountingJournalService,
  ) {}

  async executeRange(
    input: ProviderSettlementExecutionInput,
  ): Promise<ProviderSettlementExecutionReport> {
    const expectedPlanHash =
      typeof input.expectedPlanHash === 'string'
        ? input.expectedPlanHash.trim()
        : '';
    if (!/^[a-f0-9]{64}$/.test(expectedPlanHash)) {
      throw new BadRequestException(
        'expectedPlanHash must be a lowercase SHA-256 hex digest',
      );
    }

    const report = await this.preview.previewRange(input);
    if (report.planHash !== expectedPlanHash) {
      throw new ConflictException(
        'Provider settlement plan changed after preview; rerun shadow preview and review the new planHash',
      );
    }
    if (
      report.amounts.readyProviderDebitCents !==
        report.amounts.readyProviderCreditCents ||
      report.amounts.readyUberReversalDebitCents !==
        report.amounts.readyUberReversalCreditCents
    ) {
      throw new ConflictException(
        'Provider settlement execution requires balanced READY Journal drafts',
      );
    }

    const readyDocuments = report.providerDocuments
      .filter((plan) => plan.status === 'READY')
      .sort((left, right) =>
        left.documentStableId.localeCompare(right.documentStableId),
      );
    const readyDocumentIds = new Set(
      readyDocuments.map((plan) => plan.documentStableId),
    );
    const readyReversals = report.uberPreCutoverOrderReversals
      .filter((plan) => plan.status === 'READY')
      .sort((left, right) =>
        left.originalJournalEntryStableId.localeCompare(
          right.originalJournalEntryStableId,
        ),
      );
    for (const reversal of readyReversals) {
      if (
        !reversal.coveredByDocumentStableId ||
        !readyDocumentIds.has(reversal.coveredByDocumentStableId)
      ) {
        throw new ConflictException(
          `READY Uber reversal is not owned by a READY authoritative provider document: ${reversal.originalJournalEntryStableId}`,
        );
      }
    }
    for (const document of readyDocuments) {
      if (
        !document.periodStart ||
        !document.periodEnd ||
        report.range.fromDate > document.periodStart ||
        report.range.toDateExclusive <= document.periodEnd
      ) {
        throw new ConflictException(
          `Provider settlement replay range must fully contain the READY document period: ${document.documentStableId}`,
        );
      }
      const relatedReversals = report.uberPreCutoverOrderReversals.filter(
        (reversal) =>
          reversal.coveringDocumentStableIds.includes(
            document.documentStableId,
          ),
      );
      const nonReadyRelatedReversals = relatedReversals.filter(
        (reversal) => reversal.status !== 'READY',
      );
      if (nonReadyRelatedReversals.length > 0) {
        throw new ConflictException(
          `READY provider document has historical Uber reversals outside the atomic READY set: ${document.documentStableId}`,
        );
      }
    }

    if (readyDocuments.length > 0) {
      await this.journal.assertNoLegacyOrderRevenueAccrual();
    }

    let journalEntriesPostedOrReplayed = 0;
    let providerDocumentsPostedOrReplayed = 0;
    let uberReversalsPostedOrReplayed = 0;
    for (const document of readyDocuments) {
      const reversals = readyReversals.filter(
        (reversal) =>
          reversal.coveredByDocumentStableId === document.documentStableId,
      );
      const authority = this.buildReplacementGroupAuthority(
        report,
        document,
        reversals,
        expectedPlanHash,
      );
      const documentJournal = document.draftJournal;
      if (!documentJournal) {
        throw new ConflictException(
          `READY provider document is missing its Journal draft: ${document.documentStableId}`,
        );
      }
      const reversalWrites = reversals.map((reversal) => {
        if (!reversal.draftJournal) {
          throw new ConflictException(
            `READY Uber reversal is missing its Journal draft: ${reversal.originalJournalEntryStableId}`,
          );
        }
        return {
          journal: reversal.draftJournal,
          originalJournalEntryStableId: reversal.originalJournalEntryStableId,
        };
      });
      const rows =
        await this.journal.createProviderSettlementReplacementGroup(
          {
            documentJournal,
            uberPreCutoverReversals: reversalWrites,
          },
          PROVIDER_SETTLEMENT_SYSTEM_ACTOR,
          authority,
        );
      if (rows.length !== 1 + reversalWrites.length) {
        throw new ConflictException(
          `Provider settlement replacement group returned an unexpected Journal count: ${document.documentStableId}`,
        );
      }
      journalEntriesPostedOrReplayed += rows.length;
      providerDocumentsPostedOrReplayed += 1;
      uberReversalsPostedOrReplayed += reversalWrites.length;
    }

    return {
      ...report,
      execution: {
        replacementGroupsExecuted: readyDocuments.length,
        journalEntriesPostedOrReplayed,
        providerDocumentsPostedOrReplayed,
        uberReversalsPostedOrReplayed,
        noopProviderDocumentsNotWritten: report.providerDocuments.filter(
          (plan) => plan.status === 'NOOP',
        ).length,
        blockedProviderDocumentsNotWritten: report.providerDocuments.filter(
          (plan) => plan.status === 'BLOCKED',
        ).length,
        alreadyPostedProviderDocumentsNotWritten:
          report.providerDocuments.filter(
            (plan) => plan.status === 'ALREADY_POSTED',
          ).length,
        blockedUberReversalsNotWritten:
          report.uberPreCutoverOrderReversals.filter(
            (plan) => plan.status === 'BLOCKED',
          ).length,
        alreadyReversedUberReversalsNotWritten:
          report.uberPreCutoverOrderReversals.filter(
            (plan) => plan.status === 'ALREADY_REVERSED',
          ).length,
      },
    };
  }

  private buildReplacementGroupAuthority(
    report: ProviderSettlementPreviewReport,
    document: ProviderDocumentPlan,
    reversals: UberReversalPlan[],
    expectedPlanHash: string,
  ): ProviderSettlementReplacementGroupAuthorityV1 {
    const review = document.reviewEvidence;
    const coverage = document.coverageEvidence;
    if (
      !review ||
      review.status !== AccountingInboxStatus.CONFIRMED ||
      review.materializedEntityType !==
        AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT ||
      review.materializedEntityStableId !== document.documentStableId ||
      !review.reviewedAt ||
      !review.reviewedByUserStableId
    ) {
      throw new ConflictException(
        `READY provider document is missing confirmed review authority: ${document.documentStableId}`,
      );
    }
    if (
      !coverage ||
      !coverage.financialHistoryRequiredFrom ||
      !document.periodStart ||
      !document.periodEnd
    ) {
      throw new ConflictException(
        `READY provider document is missing coverage/period authority: ${document.documentStableId}`,
      );
    }
    const accountAuthorityByStableId = new Map<
      string,
      ProviderSettlementAccountAuthorityV1
    >();
    const accountPlans = [
      ...document.accountPrerequisites,
      ...reversals.flatMap((reversal) => reversal.accountPrerequisites),
    ];
    for (const account of accountPlans) {
      if (account.status !== 'READY' || !account.expected || !account.actual) {
        throw new ConflictException(
          `READY provider settlement group has an unresolved account prerequisite: ${account.accountStableId}`,
        );
      }
      const next: ProviderSettlementAccountAuthorityV1 = {
        accountStableId: account.accountStableId,
        expected: account.expected,
        actual: account.actual,
      };
      const existing = accountAuthorityByStableId.get(account.accountStableId);
      if (existing && JSON.stringify(existing) !== JSON.stringify(next)) {
        throw new ConflictException(
          `Provider settlement account authority is inconsistent across the replacement group: ${account.accountStableId}`,
        );
      }
      accountAuthorityByStableId.set(account.accountStableId, next);
    }
    const accountPrerequisites = Array.from(
      accountAuthorityByStableId.values(),
    ).sort((left, right) =>
      left.accountStableId.localeCompare(right.accountStableId),
    );
    const historicalReversalAnchors: ProviderSettlementHistoricalJournalAnchorV1[] =
      reversals.map((reversal) => {
        const anchor = reversal.originalJournalAnchor;
        if (!anchor.sourceFactStableId) {
          throw new ConflictException(
            `READY Uber reversal is missing its original SALE source fact: ${reversal.originalJournalEntryStableId}`,
          );
        }
        return {
          originalJournalEntryStableId: reversal.originalJournalEntryStableId,
          idempotencyKey: anchor.idempotencyKey,
          idempotencyHash: anchor.idempotencyHash,
          version: anchor.version,
          sourceFactStableId: anchor.sourceFactStableId,
        };
      });

    return {
      version: 1,
      expectedPlanHash,
      provider: document.provider,
      documentType: document.documentType,
      businessIdentityKey: document.businessIdentityKey,
      documentStableId: document.documentStableId,
      revision: document.revision,
      providerDocumentRef: document.providerDocumentRef,
      storeStableId: report.range.storeStableId,
      periodStart: document.periodStart,
      periodEnd: document.periodEnd,
      salesAuthority: document.salesAuthority,
      reviewEvidence: {
        inboxItemStableId: review.inboxItemStableId,
        status: AccountingInboxStatus.CONFIRMED,
        materializedEntityType:
          AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT,
        materializedEntityStableId: document.documentStableId,
        reviewedAt: review.reviewedAt,
        reviewedByUserStableId: review.reviewedByUserStableId,
        version: review.version,
      },
      coverageEvidence: {
        coverageStableId: coverage.coverageStableId,
        financialHistoryRequiredFrom: coverage.financialHistoryRequiredFrom,
        financialCompleteThrough: coverage.financialCompleteThrough,
        liveOrderFactCutoverAt: coverage.liveOrderFactCutoverAt,
        orderDetailCoverageFrom: coverage.orderDetailCoverageFrom,
        updatedAt: coverage.updatedAt,
      },
      accountPrerequisites,
      historicalReversalAnchors,
    };
  }
}
