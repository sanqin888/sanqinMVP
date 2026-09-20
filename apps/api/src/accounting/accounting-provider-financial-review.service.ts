import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACCOUNTING_DB,
  type AccountingDb,
  type AccountingTransactionClient,
} from './accounting-db';
import { runSerializableAccountingWrite } from './accounting-atomic-write';
import {
  AccountingProviderFinancialReviewStatus,
  type AccountingProviderFinancialReviewStatus as AccountingProviderFinancialReviewStatusValue,
} from './accounting-contracts';
import { hashAccountingJson } from './accounting-inbox-core.policy';
import {
  AccountingProviderFinancialReviewPolicyError,
  normalizeProviderFinancialReviewDraft,
  type ProviderFinancialReviewDraftInput,
} from './accounting-provider-financial-review.policy';

const PROVIDER_FINANCIAL_SOURCE_FACT_TYPE =
  'accounting.provider_financial_document.v1';

const requireStableValue = (value: string, field: string): string => {
  const normalized = value?.trim();
  if (!normalized) {
    throw new BadRequestException(`${field} is required`);
  }
  return normalized;
};

const requireReviewHash = (value: string): string => {
  const normalized = value?.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new BadRequestException(
      'expectedReviewHash must be a lowercase SHA-256 hex digest',
    );
  }
  return normalized;
};

@Injectable()
export class AccountingProviderFinancialReviewService {
  constructor(@Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb) {}

  async listReviewRevisions(documentStableId: string) {
    const stableId = requireStableValue(documentStableId, 'documentStableId');
    const document =
      await this.prisma.accountingProviderFinancialDocument.findUnique({
        where: { documentStableId: stableId },
        select: { id: true },
      });
    if (!document) {
      throw new NotFoundException('provider financial document not found');
    }
    const rows =
      await this.prisma.accountingProviderFinancialReviewRevision.findMany({
        where: { documentId: document.id },
        select: {
          reviewRevisionStableId: true,
          revision: true,
          status: true,
          reviewHash: true,
          note: true,
          createdByUserStableId: true,
          confirmedByUserStableId: true,
          confirmedAt: true,
          createdAt: true,
          updatedAt: true,
          corrections: {
            select: {
              correctionStableId: true,
              sourceLineStableId: true,
              reason: true,
              note: true,
              effectiveRawCode: true,
              effectiveRawName: true,
              effectiveComponent: true,
              effectivePostingTreatment: true,
              effectiveTaxRole: true,
              effectiveAmountCents: true,
            },
            orderBy: { sourceLineStableId: 'asc' },
          },
        },
        orderBy: { revision: 'desc' },
      });
    return rows.map((row) => this.toReviewRevisionDto(row));
  }

  async createDraft(
    documentStableId: string,
    input: ProviderFinancialReviewDraftInput,
    operatorUserStableId: string,
  ) {
    const stableId = requireStableValue(documentStableId, 'documentStableId');
    const operator = requireStableValue(
      operatorUserStableId,
      'operatorUserStableId',
    );
    try {
      return await runSerializableAccountingWrite(this.prisma, async (tx) => {
        const document =
          await tx.accountingProviderFinancialDocument.findUnique({
            where: { documentStableId: stableId },
            select: {
              id: true,
              documentStableId: true,
              provider: true,
              documentType: true,
              businessIdentityKey: true,
              revision: true,
              lines: {
                select: {
                  lineStableId: true,
                  lineNo: true,
                  rawCode: true,
                  rawName: true,
                  component: true,
                  postingTreatment: true,
                  taxRole: true,
                  amountCents: true,
                },
                orderBy: { lineNo: 'asc' },
              },
            },
          });
        if (!document) {
          throw new NotFoundException('provider financial document not found');
        }

        const latestDocument =
          await tx.accountingProviderFinancialDocument.findFirst({
            where: {
              provider: document.provider,
              documentType: document.documentType,
              businessIdentityKey: document.businessIdentityKey,
            },
            orderBy: { revision: 'desc' },
            select: { documentStableId: true, revision: true },
          });
        if (
          latestDocument?.documentStableId !== document.documentStableId ||
          latestDocument.revision !== document.revision
        ) {
          throw new ConflictException(
            'human review must target the latest provider document revision',
          );
        }

        const normalized = normalizeProviderFinancialReviewDraft({
          documentType: document.documentType,
          sourceLines: document.lines,
          input,
        });
        if (normalized.expectedDocumentRevision !== document.revision) {
          throw new ConflictException(
            'provider document revision changed before human review draft creation',
          );
        }

        await this.assertDocumentNotPostedInTx(tx, document.documentStableId);

        const latestReview =
          await tx.accountingProviderFinancialReviewRevision.findFirst({
            where: { documentId: document.id },
            orderBy: { revision: 'desc' },
            select: { revision: true },
          });
        const reviewRevision = (latestReview?.revision ?? 0) + 1;
        const reviewHash = hashAccountingJson({
          version: 1,
          documentStableId: document.documentStableId,
          documentRevision: document.revision,
          reviewRevision,
          note: normalized.note,
          corrections: normalized.corrections,
        });
        const auditCorrections = normalized.corrections.map((correction) => {
          const sourceLine =
            document.lines.find(
              (line) => line.lineStableId === correction.sourceLineStableId,
            ) ?? null;
          return {
            sourceLineStableId: correction.sourceLineStableId,
            reason: correction.reason,
            note: correction.note,
            before: sourceLine
              ? {
                  rawCode: sourceLine.rawCode,
                  rawName: sourceLine.rawName,
                  component: sourceLine.component,
                  postingTreatment: sourceLine.postingTreatment,
                  taxRole: sourceLine.taxRole,
                  amountCents: sourceLine.amountCents,
                }
              : null,
            effective: {
              rawCode: correction.effectiveRawCode,
              rawName: correction.effectiveRawName,
              component: correction.effectiveComponent,
              postingTreatment: correction.effectivePostingTreatment,
              taxRole: correction.effectiveTaxRole,
              amountCents: correction.effectiveAmountCents,
            },
          };
        });

        await tx.accountingProviderFinancialReviewRevision.updateMany({
          where: {
            documentId: document.id,
            status: AccountingProviderFinancialReviewStatus.DRAFT,
          },
          data: {
            status: AccountingProviderFinancialReviewStatus.SUPERSEDED,
          },
        });

        const created =
          await tx.accountingProviderFinancialReviewRevision.create({
            data: {
              documentId: document.id,
              revision: reviewRevision,
              status: AccountingProviderFinancialReviewStatus.DRAFT,
              reviewHash,
              note: normalized.note,
              createdByUserStableId: operator,
              ...(normalized.corrections.length > 0
                ? {
                    corrections: {
                      create: normalized.corrections.map((correction) => ({
                        sourceLineStableId: correction.sourceLineStableId,
                        reason: correction.reason,
                        note: correction.note,
                        effectiveRawCode: correction.effectiveRawCode,
                        effectiveRawName: correction.effectiveRawName,
                        effectiveComponent: correction.effectiveComponent,
                        effectivePostingTreatment:
                          correction.effectivePostingTreatment,
                        effectiveTaxRole: correction.effectiveTaxRole,
                        effectiveAmountCents: correction.effectiveAmountCents,
                      })),
                    },
                  }
                : {}),
            },
            select: {
              reviewRevisionStableId: true,
              revision: true,
              status: true,
              reviewHash: true,
              note: true,
              createdByUserStableId: true,
              confirmedByUserStableId: true,
              confirmedAt: true,
              createdAt: true,
              updatedAt: true,
              corrections: {
                select: {
                  correctionStableId: true,
                  sourceLineStableId: true,
                  reason: true,
                  note: true,
                  effectiveRawCode: true,
                  effectiveRawName: true,
                  effectiveComponent: true,
                  effectivePostingTreatment: true,
                  effectiveTaxRole: true,
                  effectiveAmountCents: true,
                },
                orderBy: { sourceLineStableId: 'asc' },
              },
            },
          });

        await tx.accountingAuditLog.create({
          data: {
            action: 'CREATE_REVIEW_DRAFT',
            entityType: 'ACCOUNTING_PROVIDER_FINANCIAL_REVIEW_REVISION',
            entityId: created.reviewRevisionStableId,
            operatorActorRef: operator,
            afterJson: {
              documentStableId: document.documentStableId,
              documentRevision: document.revision,
              reviewRevision: created.revision,
              reviewHash: created.reviewHash,
              correctionCount: created.corrections.length,
              corrections: auditCorrections,
            },
          },
        });

        return this.toReviewRevisionDto(created);
      });
    } catch (error) {
      if (error instanceof AccountingProviderFinancialReviewPolicyError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async confirmRevision(
    documentStableId: string,
    reviewRevisionStableId: string,
    expectedReviewHash: string,
    operatorUserStableId: string,
  ) {
    const stableId = requireStableValue(documentStableId, 'documentStableId');
    const reviewStableId = requireStableValue(
      reviewRevisionStableId,
      'reviewRevisionStableId',
    );
    const expectedHash = requireReviewHash(expectedReviewHash);
    const operator = requireStableValue(
      operatorUserStableId,
      'operatorUserStableId',
    );

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const review =
        await tx.accountingProviderFinancialReviewRevision.findUnique({
          where: { reviewRevisionStableId: reviewStableId },
          select: {
            id: true,
            reviewRevisionStableId: true,
            revision: true,
            status: true,
            reviewHash: true,
            documentId: true,
            document: {
              select: {
                documentStableId: true,
                provider: true,
                documentType: true,
                businessIdentityKey: true,
                revision: true,
              },
            },
          },
        });
      if (!review || review.document.documentStableId !== stableId) {
        throw new NotFoundException(
          'provider financial review revision not found',
        );
      }
      if (
        review.status === AccountingProviderFinancialReviewStatus.CONFIRMED &&
        review.reviewHash === expectedHash
      ) {
        return this.readRevisionInTx(tx, reviewStableId);
      }
      if (review.status !== AccountingProviderFinancialReviewStatus.DRAFT) {
        throw new ConflictException(
          'only the current DRAFT human review revision can be confirmed',
        );
      }
      if (review.reviewHash !== expectedHash) {
        throw new ConflictException(
          'human review content changed before confirmation',
        );
      }

      const latestReview =
        await tx.accountingProviderFinancialReviewRevision.findFirst({
          where: { documentId: review.documentId },
          orderBy: { revision: 'desc' },
          select: {
            reviewRevisionStableId: true,
            revision: true,
            status: true,
          },
        });
      if (
        latestReview?.reviewRevisionStableId !== review.reviewRevisionStableId ||
        latestReview.revision !== review.revision ||
        latestReview.status !== AccountingProviderFinancialReviewStatus.DRAFT
      ) {
        throw new ConflictException(
          'a newer human review revision exists; confirm the latest draft instead',
        );
      }

      const latestDocument =
        await tx.accountingProviderFinancialDocument.findFirst({
          where: {
            provider: review.document.provider,
            documentType: review.document.documentType,
            businessIdentityKey: review.document.businessIdentityKey,
          },
          orderBy: { revision: 'desc' },
          select: { documentStableId: true, revision: true },
        });
      if (
        latestDocument?.documentStableId !== review.document.documentStableId ||
        latestDocument.revision !== review.document.revision
      ) {
        throw new ConflictException(
          'provider document changed before human review confirmation',
        );
      }

      await this.assertDocumentNotPostedInTx(
        tx,
        review.document.documentStableId,
      );

      await tx.accountingProviderFinancialReviewRevision.updateMany({
        where: {
          documentId: review.documentId,
          status: AccountingProviderFinancialReviewStatus.CONFIRMED,
          NOT: { id: review.id },
        },
        data: {
          status: AccountingProviderFinancialReviewStatus.SUPERSEDED,
        },
      });
      const confirmedAt = new Date();
      await tx.accountingProviderFinancialReviewRevision.update({
        where: { id: review.id },
        data: {
          status: AccountingProviderFinancialReviewStatus.CONFIRMED,
          confirmedAt,
          confirmedByUserStableId: operator,
        },
      });
      await tx.accountingAuditLog.create({
        data: {
          action: 'CONFIRM_REVIEW',
          entityType: 'ACCOUNTING_PROVIDER_FINANCIAL_REVIEW_REVISION',
          entityId: review.reviewRevisionStableId,
          operatorActorRef: operator,
          afterJson: {
            documentStableId: review.document.documentStableId,
            documentRevision: review.document.revision,
            reviewRevision: review.revision,
            reviewHash: review.reviewHash,
            confirmedAt: confirmedAt.toISOString(),
          },
        },
      });

      return this.readRevisionInTx(tx, reviewStableId);
    });
  }

  private async assertDocumentNotPostedInTx(
    tx: AccountingTransactionClient,
    documentStableId: string,
  ) {
    const existing = await tx.accountingJournalEntry.findFirst({
      where: {
        deletedAt: null,
        sourceFactType: PROVIDER_FINANCIAL_SOURCE_FACT_TYPE,
        sourceFactStableId: documentStableId,
      },
      select: { entryStableId: true },
    });
    if (existing) {
      throw new ConflictException(
        'posted provider financial evidence cannot be changed by human review',
      );
    }
  }

  private async readRevisionInTx(
    tx: AccountingTransactionClient,
    reviewRevisionStableId: string,
  ) {
    const row = await tx.accountingProviderFinancialReviewRevision.findUnique({
      where: { reviewRevisionStableId },
      select: {
        reviewRevisionStableId: true,
        revision: true,
        status: true,
        reviewHash: true,
        note: true,
        createdByUserStableId: true,
        confirmedByUserStableId: true,
        confirmedAt: true,
        createdAt: true,
        updatedAt: true,
        corrections: {
          select: {
            correctionStableId: true,
            sourceLineStableId: true,
            reason: true,
            note: true,
            effectiveRawCode: true,
            effectiveRawName: true,
            effectiveComponent: true,
            effectivePostingTreatment: true,
            effectiveTaxRole: true,
            effectiveAmountCents: true,
          },
          orderBy: { sourceLineStableId: 'asc' },
        },
      },
    });
    if (!row) {
      throw new NotFoundException(
        'provider financial review revision not found',
      );
    }
    return this.toReviewRevisionDto(row);
  }

  private toReviewRevisionDto(row: {
    reviewRevisionStableId: string;
    revision: number;
    status: AccountingProviderFinancialReviewStatusValue;
    reviewHash: string;
    note: string | null;
    createdByUserStableId: string;
    confirmedByUserStableId: string | null;
    confirmedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    corrections: Array<{
      correctionStableId: string;
      sourceLineStableId: string;
      reason: string;
      note: string | null;
      effectiveRawCode: string | null;
      effectiveRawName: string | null;
      effectiveComponent: string;
      effectivePostingTreatment: string;
      effectiveTaxRole: string;
      effectiveAmountCents: number;
    }>;
  }) {
    return {
      ...row,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
