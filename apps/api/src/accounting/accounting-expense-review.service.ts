import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingExpenseReviewStatus,
  AccountingInboxClassification,
  AccountingInboxStatus,
  AccountingTxType,
} from './accounting-contracts';
import {
  ACCOUNTING_DB,
  type AccountingDb,
  type AccountingJsonValue,
  type AccountingTransactionClient,
} from './accounting-db';
import { runSerializableAccountingWrite } from './accounting-atomic-write';
import { hashAccountingJson } from './accounting-inbox-core.policy';
import {
  AccountingExpenseReviewPolicyError,
  normalizeAccountingExpenseReviewDraft,
  parseStoredAccountingExpenseReviewEffective,
  type AccountingExpenseReviewDraftInput,
  type NormalizedAccountingExpenseReviewEffective,
} from './accounting-expense-review.policy';

const toAccountingJson = (value: unknown): AccountingJsonValue =>
  value as AccountingJsonValue;

const requireStableValue = (value: string, field: string): string => {
  const normalized = value?.trim();
  if (!normalized) throw new BadRequestException(`${field} is required`);
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

type ExpenseReviewRevisionRow = {
  reviewRevisionStableId: string;
  revision: number;
  status: string;
  sourceInboxVersion: number;
  sourceParseRunStableId: string | null;
  sourceResultHash: string | null;
  reviewHash: string;
  note: string | null;
  effectiveJson: unknown;
  createdByUserStableId: string;
  confirmedByUserStableId: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AccountingExpenseReviewAuthority = {
  reviewRevisionStableId: string;
  revision: number;
  status: 'DRAFT' | 'CONFIRMED' | 'SUPERSEDED';
  sourceInboxVersion: number;
  sourceParseRunStableId: string | null;
  sourceResultHash: string | null;
  reviewHash: string;
  note: string | null;
  effective: NormalizedAccountingExpenseReviewEffective;
  createdByUserStableId: string;
  confirmedByUserStableId: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toReviewDto(
  row: ExpenseReviewRevisionRow,
): AccountingExpenseReviewAuthority {
  const status =
    row.status === AccountingExpenseReviewStatus.DRAFT ||
    row.status === AccountingExpenseReviewStatus.CONFIRMED ||
    row.status === AccountingExpenseReviewStatus.SUPERSEDED
      ? row.status
      : (() => {
          throw new Error('invalid persisted expense review status');
        })();
  return {
    reviewRevisionStableId: row.reviewRevisionStableId,
    revision: row.revision,
    status,
    sourceInboxVersion: row.sourceInboxVersion,
    sourceParseRunStableId: row.sourceParseRunStableId,
    sourceResultHash: row.sourceResultHash,
    reviewHash: row.reviewHash,
    note: row.note,
    effective: parseStoredAccountingExpenseReviewEffective(row.effectiveJson),
    createdByUserStableId: row.createdByUserStableId,
    confirmedByUserStableId: row.confirmedByUserStableId,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertEffectiveReferencesInTx(
  tx: AccountingTransactionClient,
  effective: NormalizedAccountingExpenseReviewEffective,
) {
  const categoryStableIds = Array.from(
    new Set(effective.splits.map((split) => split.categoryStableId)),
  );
  const categories = await tx.accountingCategory.findMany({
    where: {
      categoryStableId: { in: categoryStableIds },
      type: AccountingTxType.EXPENSE,
      isActive: true,
    },
    select: { categoryStableId: true },
  });
  const validCategoryIds = new Set(
    categories.map((category) => category.categoryStableId),
  );
  if (
    categoryStableIds.some(
      (categoryStableId) => !validCategoryIds.has(categoryStableId),
    )
  ) {
    throw new BadRequestException(
      'expense review contains an invalid or inactive EXPENSE category',
    );
  }

  const accountStableIds = Array.from(
    new Set(
      effective.paymentAllocations.map(
        (allocation) => allocation.accountStableId,
      ),
    ),
  );
  if (!accountStableIds.length) return;
  const accounts = await tx.accountingAccount.findMany({
    where: { accountStableId: { in: accountStableIds } },
    select: {
      accountStableId: true,
      currency: true,
      isActive: true,
    },
  });
  const accountByStableId = new Map(
    accounts.map((account) => [account.accountStableId, account] as const),
  );
  for (const accountStableId of accountStableIds) {
    const account = accountByStableId.get(accountStableId);
    if (!account?.isActive) {
      throw new BadRequestException(
        `expense review payment account is invalid: ${accountStableId}`,
      );
    }
    if (account.currency !== 'CAD') {
      throw new BadRequestException(
        'expense review payment accounts must use CAD functional currency',
      );
    }
  }
}

const REVIEW_SELECT = {
  reviewRevisionStableId: true,
  revision: true,
  status: true,
  sourceInboxVersion: true,
  sourceParseRunStableId: true,
  sourceResultHash: true,
  reviewHash: true,
  note: true,
  effectiveJson: true,
  createdByUserStableId: true,
  confirmedByUserStableId: true,
  confirmedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function readLatestExpenseReviewAuthorityInTx(
  tx: AccountingTransactionClient,
  inboxItemId: string,
): Promise<AccountingExpenseReviewAuthority | null> {
  const row = await tx.accountingExpenseReviewRevision.findFirst({
    where: { inboxItemId },
    orderBy: { revision: 'desc' },
    select: REVIEW_SELECT,
  });
  return row ? toReviewDto(row) : null;
}

@Injectable()
export class AccountingExpenseReviewService {
  constructor(@Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb) {}

  async listReviewRevisions(inboxItemStableId: string) {
    const stableId = requireStableValue(inboxItemStableId, 'inboxItemStableId');
    const inbox = await this.prisma.accountingInboxItem.findUnique({
      where: { inboxItemStableId: stableId },
      select: { id: true },
    });
    if (!inbox) throw new NotFoundException('accounting inbox item not found');
    const rows = await this.prisma.accountingExpenseReviewRevision.findMany({
      where: { inboxItemId: inbox.id },
      select: REVIEW_SELECT,
      orderBy: { revision: 'desc' },
    });
    return rows.map((row) => toReviewDto(row));
  }

  async createDraft(
    inboxItemStableId: string,
    input: AccountingExpenseReviewDraftInput,
    operatorUserStableId: string,
  ) {
    const stableId = requireStableValue(inboxItemStableId, 'inboxItemStableId');
    const operator = requireStableValue(
      operatorUserStableId,
      'operatorUserStableId',
    );

    try {
      const normalized = normalizeAccountingExpenseReviewDraft(input);
      return await runSerializableAccountingWrite(this.prisma, async (tx) => {
        const inbox = await tx.accountingInboxItem.findUnique({
          where: { inboxItemStableId: stableId },
          select: {
            id: true,
            inboxItemStableId: true,
            version: true,
            status: true,
            classification: true,
            selectedProvider: true,
            materializedEntityType: true,
            materializedEntityStableId: true,
            artifact: {
              select: {
                acquisitionMode: true,
                parseRuns: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: {
                    parseRunStableId: true,
                    resultHash: true,
                  },
                },
              },
            },
          },
        });
        if (!inbox) {
          throw new NotFoundException('accounting inbox item not found');
        }
        this.assertReviewableInbox(inbox);
        if (normalized.expectedInboxVersion !== inbox.version) {
          throw new ConflictException(
            'inbox item changed before expense review draft creation',
          );
        }
        await assertEffectiveReferencesInTx(tx, normalized.effective);

        const latestReview = await tx.accountingExpenseReviewRevision.findFirst(
          {
            where: { inboxItemId: inbox.id },
            orderBy: { revision: 'desc' },
            select: { revision: true },
          },
        );
        const reviewRevision = (latestReview?.revision ?? 0) + 1;
        const sourceParse = inbox.artifact.parseRuns[0] ?? null;
        const reviewHash = hashAccountingJson({
          version: 1,
          inboxItemStableId: inbox.inboxItemStableId,
          sourceInboxVersion: inbox.version,
          sourceParseRunStableId: sourceParse?.parseRunStableId ?? null,
          sourceResultHash: sourceParse?.resultHash ?? null,
          reviewRevision,
          note: normalized.note,
          effective: normalized.effective,
        });

        await tx.accountingExpenseReviewRevision.updateMany({
          where: {
            inboxItemId: inbox.id,
            status: AccountingExpenseReviewStatus.DRAFT,
          },
          data: { status: AccountingExpenseReviewStatus.SUPERSEDED },
        });

        const created = await tx.accountingExpenseReviewRevision.create({
          data: {
            inboxItemId: inbox.id,
            revision: reviewRevision,
            status: AccountingExpenseReviewStatus.DRAFT,
            sourceInboxVersion: inbox.version,
            sourceParseRunStableId: sourceParse?.parseRunStableId ?? null,
            sourceResultHash: sourceParse?.resultHash ?? null,
            reviewHash,
            note: normalized.note,
            effectiveJson: toAccountingJson(normalized.effective),
            createdByUserStableId: operator,
          },
          select: REVIEW_SELECT,
        });
        await tx.accountingAuditLog.create({
          data: {
            action: 'CREATE_REVIEW_DRAFT',
            entityType: 'ACCOUNTING_EXPENSE_REVIEW_REVISION',
            entityId: created.reviewRevisionStableId,
            operatorActorRef: operator,
            afterJson: toAccountingJson({
              inboxItemStableId: inbox.inboxItemStableId,
              reviewRevision: created.revision,
              reviewHash: created.reviewHash,
              sourceInboxVersion: created.sourceInboxVersion,
              sourceParseRunStableId: created.sourceParseRunStableId,
              sourceResultHash: created.sourceResultHash,
              effective: normalized.effective,
            }),
          },
        });
        return toReviewDto(created);
      });
    } catch (error) {
      if (error instanceof AccountingExpenseReviewPolicyError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async confirmRevision(
    inboxItemStableId: string,
    reviewRevisionStableId: string,
    expectedReviewHash: string,
    operatorUserStableId: string,
  ) {
    const stableId = requireStableValue(inboxItemStableId, 'inboxItemStableId');
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
      const review = await tx.accountingExpenseReviewRevision.findUnique({
        where: { reviewRevisionStableId: reviewStableId },
        select: {
          id: true,
          inboxItemId: true,
          ...REVIEW_SELECT,
          inboxItem: {
            select: {
              inboxItemStableId: true,
              version: true,
              status: true,
              classification: true,
              selectedProvider: true,
              materializedEntityType: true,
              materializedEntityStableId: true,
              artifact: {
                select: {
                  acquisitionMode: true,
                  parseRuns: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: {
                      parseRunStableId: true,
                      resultHash: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!review || review.inboxItem.inboxItemStableId !== stableId) {
        throw new NotFoundException('expense review revision not found');
      }
      if (
        review.status === AccountingExpenseReviewStatus.CONFIRMED &&
        review.reviewHash === expectedHash
      ) {
        return toReviewDto(review);
      }
      if (review.status !== AccountingExpenseReviewStatus.DRAFT) {
        throw new ConflictException(
          'only the current DRAFT expense review revision can be confirmed',
        );
      }
      if (review.reviewHash !== expectedHash) {
        throw new ConflictException(
          'expense review content changed before confirmation',
        );
      }
      this.assertReviewableInbox(review.inboxItem);
      if (review.sourceInboxVersion !== review.inboxItem.version) {
        throw new ConflictException(
          'inbox item changed before expense review confirmation',
        );
      }
      const currentParse = review.inboxItem.artifact.parseRuns[0] ?? null;
      if (
        review.sourceParseRunStableId !==
          (currentParse?.parseRunStableId ?? null) ||
        review.sourceResultHash !== (currentParse?.resultHash ?? null)
      ) {
        throw new ConflictException(
          'machine extraction changed before expense review confirmation',
        );
      }

      const latest = await tx.accountingExpenseReviewRevision.findFirst({
        where: { inboxItemId: review.inboxItemId },
        orderBy: { revision: 'desc' },
        select: {
          reviewRevisionStableId: true,
          revision: true,
          status: true,
        },
      });
      if (
        latest?.reviewRevisionStableId !== review.reviewRevisionStableId ||
        latest.revision !== review.revision ||
        latest.status !== AccountingExpenseReviewStatus.DRAFT
      ) {
        throw new ConflictException(
          'a newer expense review revision exists; confirm the latest draft instead',
        );
      }

      const effective = parseStoredAccountingExpenseReviewEffective(
        review.effectiveJson,
      );
      await assertEffectiveReferencesInTx(tx, effective);
      await tx.accountingExpenseReviewRevision.updateMany({
        where: {
          inboxItemId: review.inboxItemId,
          status: AccountingExpenseReviewStatus.CONFIRMED,
          NOT: { id: review.id },
        },
        data: { status: AccountingExpenseReviewStatus.SUPERSEDED },
      });
      const confirmedAt = new Date();
      const confirmed = await tx.accountingExpenseReviewRevision.update({
        where: { id: review.id },
        data: {
          status: AccountingExpenseReviewStatus.CONFIRMED,
          confirmedAt,
          confirmedByUserStableId: operator,
        },
        select: REVIEW_SELECT,
      });
      await tx.accountingAuditLog.create({
        data: {
          action: 'CONFIRM_REVIEW_REVISION',
          entityType: 'ACCOUNTING_EXPENSE_REVIEW_REVISION',
          entityId: confirmed.reviewRevisionStableId,
          operatorActorRef: operator,
          beforeJson: toAccountingJson({
            status: AccountingExpenseReviewStatus.DRAFT,
            reviewHash: confirmed.reviewHash,
          }),
          afterJson: toAccountingJson({
            status: AccountingExpenseReviewStatus.CONFIRMED,
            reviewHash: confirmed.reviewHash,
            confirmedAt: confirmedAt.toISOString(),
            effective,
          }),
        },
      });
      return toReviewDto(confirmed);
    });
  }

  private assertReviewableInbox(inbox: {
    status: string;
    classification: string;
    selectedProvider: unknown;
    materializedEntityType: unknown;
    materializedEntityStableId: unknown;
    artifact: { acquisitionMode: string };
  }) {
    if (inbox.status !== AccountingInboxStatus.PENDING_REVIEW) {
      throw new ConflictException(
        'only pending inbox items can be reviewed as expenses',
      );
    }
    if (
      inbox.classification !== AccountingInboxClassification.EXPENSE_DOCUMENT ||
      inbox.selectedProvider
    ) {
      throw new ConflictException(
        'inbox item must be classified as an expense before human review',
      );
    }
    if (inbox.materializedEntityType || inbox.materializedEntityStableId) {
      throw new ConflictException(
        'materialized inbox evidence cannot create a new expense review',
      );
    }
    if (inbox.artifact.acquisitionMode === 'PROVIDER_API') {
      throw new ConflictException(
        'provider API evidence cannot be reviewed as an expense',
      );
    }
  }
}
