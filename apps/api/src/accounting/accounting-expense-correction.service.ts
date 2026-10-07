import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  AccountingDocumentStatus,
  AccountingJournalSource,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  normalizeAccountingExpenseCorrectionTarget,
  type AccountingExpenseCorrectionTargetInputV1,
  type AccountingExpenseCorrectionTargetV1,
} from './accounting-expense-correction-target.policy';
import { AccountingExpenseCorrectionAdapter } from './accounting-expense-correction.adapter';
import {
  CANONICAL_EXPENSE_SOURCE_FACT_TYPE,
  CANONICAL_EXPENSE_SOURCE_FACT_TYPE_V2,
} from './accounting-expense-journal.policy';
import {
  AccountingPostedCorrectionReasonCode,
  AccountingPostedCorrectionStatus,
  AccountingPostedCorrectionTargetKind,
  type AccountingPostedCorrectionPreviewPlanV1,
} from './accounting-posted-financial-correction.contract';
import { AccountingPostedFinancialCorrectionService } from './accounting-posted-financial-correction.service';

const EXPENSE_TARGET_KIND = AccountingPostedCorrectionTargetKind.EXPENSE;

const reasonCodes = new Set<string>(
  Object.values(AccountingPostedCorrectionReasonCode),
);

const requireValue = (raw: unknown, field: string, maxLength = 250): string => {
  if (typeof raw !== 'string') {
    throw new BadRequestException(`${field} must be a string`);
  }
  const value = raw.trim();
  if (!value) throw new BadRequestException(`${field} is required`);
  if (value.length > maxLength) {
    throw new BadRequestException(
      `${field} must not exceed ${maxLength} characters`,
    );
  }
  return value;
};

const parseReasonCode = (
  raw: unknown,
): AccountingPostedCorrectionReasonCode => {
  const value = requireValue(raw, 'reasonCode', 100);
  if (!reasonCodes.has(value)) {
    throw new BadRequestException('reasonCode is unsupported');
  }
  if (value === AccountingPostedCorrectionReasonCode.DUPLICATE_POSTING) {
    throw new BadRequestException(
      'Expense correction does not support DUPLICATE_POSTING in C2',
    );
  }
  return value as AccountingPostedCorrectionReasonCode;
};

const requirePositiveInteger = (raw: unknown, field: string): number => {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 1) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }
  return raw;
};

const requireSha256 = (raw: unknown, field: string): string => {
  const value = requireValue(raw, field, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new BadRequestException(
      `${field} must be a lowercase SHA-256 hex digest`,
    );
  }
  return value;
};

const noteValue = (raw: unknown): string | null => {
  if (raw == null) return null;
  if (typeof raw !== 'string') {
    throw new BadRequestException('note must be a string or null');
  }
  const note = raw.trim();
  if (note.length > 2_000) {
    throw new BadRequestException('note must not exceed 2000 characters');
  }
  return note || null;
};

const memoValue = (raw: unknown): string | null => {
  if (raw == null) return null;
  if (typeof raw !== 'string') {
    throw new BadRequestException('target.memo must be a string or null');
  }
  const memo = raw.trim();
  if (memo.length > 2_000) {
    throw new BadRequestException(
      'target.memo must not exceed 2000 characters',
    );
  }
  return memo || null;
};

const parseDraftInput = (
  raw: unknown,
): AccountingExpenseCorrectionTargetInputV1 => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException('target must be an object');
  }
  const target = raw as Record<string, unknown>;
  if (target.version !== 1 || !Array.isArray(target.splits)) {
    throw new BadRequestException(
      'target must use version 1 and include a splits array',
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(target, 'paymentAllocations') &&
    !Array.isArray(target.paymentAllocations)
  ) {
    throw new BadRequestException('target.paymentAllocations must be an array');
  }
  return {
    version: 1,
    expectedBaseAuthorityHash: requireSha256(
      target.expectedBaseAuthorityHash,
      'target.expectedBaseAuthorityHash',
    ),
    totalCents: requirePositiveInteger(target.totalCents, 'target.totalCents'),
    ...(Object.prototype.hasOwnProperty.call(target, 'memo')
      ? { memo: memoValue(target.memo) }
      : {}),
    splits: target.splits as AccountingExpenseCorrectionTargetInputV1['splits'],
    ...(Object.prototype.hasOwnProperty.call(target, 'paymentAllocations')
      ? {
          paymentAllocations:
            target.paymentAllocations as AccountingExpenseCorrectionTargetInputV1['paymentAllocations'],
        }
      : {}),
  };
};

const normalizePersistedTarget = (
  value: Prisma.JsonValue,
): AccountingExpenseCorrectionTargetV1 =>
  normalizeAccountingExpenseCorrectionTarget(
    value as unknown as AccountingExpenseCorrectionTargetV1,
  );

const toRevisionDraftInput = (
  target: AccountingExpenseCorrectionTargetV1,
): AccountingExpenseCorrectionTargetInputV1 => ({
  version: 1,
  expectedBaseAuthorityHash: target.basedOnAuthorityHash,
  totalCents: target.document.totalCents,
  memo: target.document.memo,
  splits: target.splits.map((split) => ({
    splitStableId: split.splitStableId,
    categoryStableId: split.categoryStableId,
    amountCents: split.amountCents,
    taxCents: split.taxCents,
    paidFromAccountStableId: split.paidFromAccountStableId,
  })),
  ...(target.document.fundingAttributionVersion === 1
    ? {
        paymentAllocations: target.paymentAllocations.map((allocation) => ({
          paymentAllocationStableId: allocation.paymentAllocationStableId,
          accountStableId: allocation.accountStableId,
          amountCents: allocation.amountCents,
        })),
      }
    : {}),
});

const CORRECTION_HISTORY_SELECT = {
  correctionStableId: true,
  version: true,
  targetVersion: true,
  status: true,
  reasonCode: true,
  note: true,
  strategy: true,
  planHash: true,
  readyPreviewJson: true,
  createdByActorRef: true,
  readyByActorRef: true,
  readyAt: true,
  postedByActorRef: true,
  postedAt: true,
  cancelledByActorRef: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  revisions: {
    orderBy: { revision: 'asc' as const },
    select: {
      correctionRevisionStableId: true,
      revision: true,
      targetAuthoritySchema: true,
      targetAuthorityHash: true,
      targetJson: true,
      createdByActorRef: true,
      createdAt: true,
    },
  },
  journalOutputs: {
    orderBy: [{ role: 'asc' as const }, { sequence: 'asc' as const }],
    select: {
      outputStableId: true,
      role: true,
      sequence: true,
      journalEntry: {
        select: {
          entryStableId: true,
          occurredAt: true,
          currency: true,
          memo: true,
          lines: {
            orderBy: { lineNo: 'asc' as const },
            select: {
              lineNo: true,
              debitCents: true,
              creditCents: true,
              account: {
                select: {
                  accountStableId: true,
                  name: true,
                },
              },
              category: {
                select: {
                  categoryStableId: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.AccountingCorrectionCaseSelect;

type CorrectionHistoryRow = Prisma.AccountingCorrectionCaseGetPayload<{
  select: typeof CORRECTION_HISTORY_SELECT;
}>;

const JOURNAL_DISPLAY_SELECT = {
  entryStableId: true,
  occurredAt: true,
  currency: true,
  memo: true,
  lines: {
    orderBy: { lineNo: 'asc' as const },
    select: {
      lineNo: true,
      debitCents: true,
      creditCents: true,
      account: {
        select: {
          accountStableId: true,
          name: true,
        },
      },
      category: {
        select: {
          categoryStableId: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.AccountingJournalEntrySelect;

type JournalDisplayRow = Prisma.AccountingJournalEntryGetPayload<{
  select: typeof JOURNAL_DISPLAY_SELECT;
}>;

const serializeJournal = (journal: JournalDisplayRow) => ({
  entryStableId: journal.entryStableId,
  occurredAt: journal.occurredAt.toISOString(),
  currency: journal.currency,
  memo: journal.memo,
  lines: journal.lines.map((line) => ({
    lineNo: line.lineNo,
    accountStableId: line.account.accountStableId,
    accountName: line.account.name,
    categoryStableId: line.category?.categoryStableId ?? null,
    categoryName: line.category?.name ?? null,
    debitCents: line.debitCents,
    creditCents: line.creditCents,
  })),
});

const serializeCase = (row: CorrectionHistoryRow) => ({
  correctionStableId: row.correctionStableId,
  version: row.version,
  targetVersion: row.targetVersion,
  status: row.status,
  reasonCode: row.reasonCode,
  note: row.note,
  strategy: row.strategy,
  planHash: row.planHash,
  readyPreview: row.readyPreviewJson
    ? (row.readyPreviewJson as unknown as AccountingPostedCorrectionPreviewPlanV1)
    : null,
  createdByActorRef: row.createdByActorRef,
  readyByActorRef: row.readyByActorRef,
  readyAt: row.readyAt?.toISOString() ?? null,
  postedByActorRef: row.postedByActorRef,
  postedAt: row.postedAt?.toISOString() ?? null,
  cancelledByActorRef: row.cancelledByActorRef,
  cancelledAt: row.cancelledAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  revisions: row.revisions.map((revision) => {
    const target = normalizePersistedTarget(revision.targetJson);
    return {
      correctionRevisionStableId: revision.correctionRevisionStableId,
      revision: revision.revision,
      targetAuthoritySchema: revision.targetAuthoritySchema,
      targetAuthorityHash: revision.targetAuthorityHash,
      draftInput: toRevisionDraftInput(target),
      createdByActorRef: revision.createdByActorRef,
      createdAt: revision.createdAt.toISOString(),
    };
  }),
  journalOutputs: row.journalOutputs.map((output) => ({
    outputStableId: output.outputStableId,
    role: output.role,
    sequence: output.sequence,
    journal: serializeJournal(output.journalEntry),
  })),
});

@Injectable()
export class AccountingExpenseCorrectionService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly correction: AccountingPostedFinancialCorrectionService,
    private readonly adapter: AccountingExpenseCorrectionAdapter,
  ) {}

  async readRecord(documentStableIdRaw: string) {
    const documentStableId = requireValue(
      documentStableIdRaw,
      'documentStableId',
    );
    const document = await this.prisma.accountingExpenseDocument.findUnique({
      where: { documentStableId },
      select: {
        documentStableId: true,
        status: true,
        fundingAttributionVersion: true,
        occurredAt: true,
        subtotalCents: true,
        taxCents: true,
        totalCents: true,
        currency: true,
        memo: true,
        confirmedAt: true,
        paymentAllocations: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            paymentAllocationStableId: true,
            amountCents: true,
            account: {
              select: { accountStableId: true, name: true },
            },
          },
        },
        splits: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            splitStableId: true,
            amountCents: true,
            taxCents: true,
            category: {
              select: { categoryStableId: true, name: true },
            },
            paidFromAccount: {
              select: { accountStableId: true, name: true },
            },
          },
        },
      },
    });
    if (!document) {
      throw new NotFoundException('Expense document not found');
    }

    const targetVersion =
      document.fundingAttributionVersion === 2 ? (2 as const) : (1 as const);
    const sourceFactType =
      targetVersion === 2
        ? CANONICAL_EXPENSE_SOURCE_FACT_TYPE_V2
        : CANONICAL_EXPENSE_SOURCE_FACT_TYPE;

    const [corrections, originalJournals] = await Promise.all([
      this.prisma.accountingCorrectionCase.findMany({
        where: {
          targetKind: EXPENSE_TARGET_KIND,
          targetStableId: documentStableId,
          targetVersion,
        },
        select: CORRECTION_HISTORY_SELECT,
        orderBy: [{ createdAt: 'asc' }, { correctionStableId: 'asc' }],
      }),
      this.prisma.accountingJournalEntry.findMany({
        where: {
          source: AccountingJournalSource.EXPENSE_DOCUMENT,
          sourceFactType,
          sourceFactStableId: documentStableId,
          sourceFactVersion: targetVersion,
          deletedAt: null,
        },
        select: JOURNAL_DISPLAY_SELECT,
        orderBy: [{ idempotencyKey: 'asc' }, { entryStableId: 'asc' }],
      }),
    ]);

    const baseRecord = {
      version: 1 as const,
      document: {
        documentStableId: document.documentStableId,
        status: document.status,
        fundingAttributionVersion: targetVersion,
        occurredAt: document.occurredAt?.toISOString() ?? null,
        currency: document.currency,
        confirmedAt: document.confirmedAt?.toISOString() ?? null,
      },
      originalPersisted: {
        subtotalCents: document.subtotalCents,
        taxCents: document.taxCents,
        totalCents: document.totalCents,
        memo: document.memo,
        splits: document.splits.map((split) => ({
          splitStableId: split.splitStableId,
          categoryStableId: split.category.categoryStableId,
          categoryName: split.category.name,
          amountCents: split.amountCents,
          taxCents: split.taxCents,
          paidFromAccountStableId:
            split.paidFromAccount?.accountStableId ?? null,
          paidFromAccountName: split.paidFromAccount?.name ?? null,
        })),
        paymentAllocations: document.paymentAllocations.map((allocation) => ({
          paymentAllocationStableId: allocation.paymentAllocationStableId,
          accountStableId: allocation.account.accountStableId,
          accountName: allocation.account.name,
          amountCents: allocation.amountCents,
        })),
      },
      originalJournals: originalJournals.map(serializeJournal),
      corrections: corrections.map(serializeCase),
    };

    if (document.status !== AccountingDocumentStatus.CONFIRMED) {
      return {
        ...baseRecord,
        status: 'BLOCKED' as const,
        blockReason: 'Expense document is not confirmed',
        currentEffective: null,
      };
    }
    if (originalJournals.length === 0) {
      return {
        ...baseRecord,
        status: 'BLOCKED' as const,
        blockReason:
          'Expense correction requires an already-posted canonical Expense Journal',
        currentEffective: null,
      };
    }

    try {
      const current = await this.adapter.readCurrentEffectiveTarget(
        documentStableId,
        targetVersion,
      );
      return {
        ...baseRecord,
        status: 'READY' as const,
        blockReason: null,
        currentEffective: {
          targetAuthorityHash: current.targetAuthorityHash,
          draftInput: current.draftInput,
        },
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        return {
          ...baseRecord,
          status: 'BLOCKED' as const,
          blockReason: error.message,
          currentEffective: null,
        };
      }
      throw error;
    }
  }

  async createDraft(
    documentStableIdRaw: string,
    body: { reasonCode?: unknown; note?: unknown; target?: unknown },
    operatorActorRef: string,
  ) {
    const record = await this.requireWritableRecord(documentStableIdRaw);
    const activeCorrection = record.corrections.find(
      (correction) =>
        correction.status === AccountingPostedCorrectionStatus.DRAFT ||
        correction.status === AccountingPostedCorrectionStatus.READY,
    );
    if (activeCorrection) {
      throw new ConflictException(
        'Expense already has an active DRAFT or READY correction',
      );
    }
    const target = parseDraftInput(body.target);
    if (
      target.expectedBaseAuthorityHash !==
      record.currentEffective.targetAuthorityHash
    ) {
      throw new ConflictException(
        'Expense correction editor is stale; reload current effective values',
      );
    }
    await this.correction.createDraft(
      {
        targetStableId: record.document.documentStableId,
        targetVersion: record.document.fundingAttributionVersion,
        reasonCode: parseReasonCode(body.reasonCode),
        note: noteValue(body.note),
        targetJson: target,
      },
      operatorActorRef,
      this.adapter,
    );
    return this.readRecord(record.document.documentStableId);
  }

  async reviseDraft(
    documentStableIdRaw: string,
    correctionStableIdRaw: string,
    body: {
      expectedVersion?: unknown;
      reasonCode?: unknown;
      note?: unknown;
      target?: unknown;
    },
    operatorActorRef: string,
  ) {
    const { documentStableId, correctionStableId } =
      await this.requireCorrection(documentStableIdRaw, correctionStableIdRaw);
    await this.correction.reviseDraft(
      correctionStableId,
      {
        expectedVersion: requirePositiveInteger(
          body.expectedVersion,
          'expectedVersion',
        ),
        reasonCode: parseReasonCode(body.reasonCode),
        note: noteValue(body.note),
        targetJson: parseDraftInput(body.target),
      },
      operatorActorRef,
      this.adapter,
    );
    return this.readRecord(documentStableId);
  }

  async previewCase(
    documentStableIdRaw: string,
    correctionStableIdRaw: string,
  ) {
    const { correctionStableId } = await this.requireCorrection(
      documentStableIdRaw,
      correctionStableIdRaw,
    );
    return this.correction.previewCase(correctionStableId, this.adapter);
  }

  async markReady(
    documentStableIdRaw: string,
    correctionStableIdRaw: string,
    body: { expectedVersion?: unknown; expectedPlanHash?: unknown },
    operatorActorRef: string,
  ) {
    const { documentStableId, correctionStableId } =
      await this.requireCorrection(documentStableIdRaw, correctionStableIdRaw);
    await this.correction.markReady(
      correctionStableId,
      {
        expectedVersion: requirePositiveInteger(
          body.expectedVersion,
          'expectedVersion',
        ),
        expectedPlanHash: requireSha256(
          body.expectedPlanHash,
          'expectedPlanHash',
        ),
      },
      operatorActorRef,
      this.adapter,
    );
    return this.readRecord(documentStableId);
  }

  async executeCase(
    documentStableIdRaw: string,
    correctionStableIdRaw: string,
    body: { expectedPlanHash?: unknown },
    operatorActorRef: string,
  ) {
    const { documentStableId, correctionStableId } =
      await this.requireCorrection(documentStableIdRaw, correctionStableIdRaw);
    const result = await this.correction.executeCase(
      correctionStableId,
      {
        expectedPlanHash: requireSha256(
          body.expectedPlanHash,
          'expectedPlanHash',
        ),
      },
      operatorActorRef,
      this.adapter,
    );
    return {
      replayed: result.replayed,
      record: await this.readRecord(documentStableId),
    };
  }

  async cancelCase(
    documentStableIdRaw: string,
    correctionStableIdRaw: string,
    body: { expectedVersion?: unknown },
    operatorActorRef: string,
  ) {
    const { documentStableId, correctionStableId } =
      await this.requireCorrection(documentStableIdRaw, correctionStableIdRaw);
    await this.correction.cancelCase(
      correctionStableId,
      {
        expectedVersion: requirePositiveInteger(
          body.expectedVersion,
          'expectedVersion',
        ),
      },
      operatorActorRef,
    );
    return this.readRecord(documentStableId);
  }

  private async requireWritableRecord(documentStableIdRaw: string) {
    const record = await this.readRecord(documentStableIdRaw);
    if (record.status !== 'READY' || !record.currentEffective) {
      throw new ConflictException(
        record.blockReason ?? 'posted Expense cannot be corrected',
      );
    }
    return record;
  }

  private async requireCorrection(
    documentStableIdRaw: string,
    correctionStableIdRaw: string,
  ) {
    const documentStableId = requireValue(
      documentStableIdRaw,
      'documentStableId',
    );
    const correctionStableId = requireValue(
      correctionStableIdRaw,
      'correctionStableId',
    );
    const correction = await this.prisma.accountingCorrectionCase.findFirst({
      where: {
        correctionStableId,
        targetKind: EXPENSE_TARGET_KIND,
        targetStableId: documentStableId,
      },
      select: {
        correctionStableId: true,
        targetStableId: true,
      },
    });
    if (!correction) {
      throw new NotFoundException(
        'Expense posted correction does not belong to this Expense',
      );
    }
    return {
      documentStableId: correction.targetStableId,
      correctionStableId: correction.correctionStableId,
    };
  }
}
