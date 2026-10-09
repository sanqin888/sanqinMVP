import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { runSerializableAccountingWrite } from './accounting-atomic-write';
import { writeAccountingAuditLog } from './accounting-audit-writer';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import type { AccountingJournalCreateInput } from './accounting-journal-policy';
import { AccountingJournalService } from './accounting-journal.service';
import {
  ACCOUNTING_POSTED_FINANCIAL_CORRECTION_READY_PREVIEW_SCHEMA,
  ACCOUNTING_POSTED_FINANCIAL_CORRECTION_SOURCE_FACT_TYPE,
  AccountingPostedCorrectionStatus,
  type AccountingPostedCorrectionPostedJournalAnchorV1,
  type AccountingPostedCorrectionPreviewPlanV1,
  type AccountingPostedCorrectionReasonCode,
  type AccountingPostedCorrectionTargetKind,
  type AccountingPostedCorrectionTargetJournalSnapshotV1,
} from './accounting-posted-financial-correction.contract';
import {
  buildPostedCorrectionExecutionJournalDrafts,
  AccountingPostedFinancialCorrectionExecutionPolicyError,
} from './accounting-posted-financial-correction-execution.policy';
import { buildPostedCorrectionJournalWritePlan } from './accounting-posted-financial-correction-journal-authority';
import type {
  AccountingPostedCorrectionOwnerDbClient,
  AccountingPostedCorrectionOwnerReadyTargetV1,
  AccountingPostedCorrectionOwnerRevisionTargetV1,
  AccountingPostedFinancialCorrectionOwnerAdapter,
} from './accounting-posted-financial-correction-owner-adapter';
import {
  AccountingPostedFinancialCorrectionPolicyError,
  buildPostedFinancialCorrectionPreviewPlan,
} from './accounting-posted-financial-correction.policy';
import { hashAccountingJson } from './accounting-inbox-core.policy';

const CORRECTION_CASE_ENTITY_TYPE = 'ACCOUNTING_CORRECTION_CASE';
const MAX_NOTE_LENGTH = 2_000;

const CORRECTION_CASE_SELECT = {
  id: true,
  correctionStableId: true,
  version: true,
  targetKind: true,
  targetStableId: true,
  targetVersion: true,
  status: true,
  reasonCode: true,
  note: true,
  strategy: true,
  baseAuthoritySchema: true,
  baseAuthorityHash: true,
  baseJournalSetHash: true,
  readyRevisionId: true,
  targetAuthoritySchema: true,
  targetAuthorityHash: true,
  readyPreviewSchema: true,
  readyPreviewJson: true,
  planHash: true,
  createdByActorRef: true,
  readyByActorRef: true,
  readyAt: true,
  postedByActorRef: true,
  postedAt: true,
  cancelledByActorRef: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  readyRevision: {
    select: {
      id: true,
      correctionRevisionStableId: true,
      correctionCaseId: true,
      revision: true,
      targetAuthoritySchema: true,
      targetAuthorityHash: true,
      targetJson: true,
      createdByActorRef: true,
      createdAt: true,
    },
  },
  revisions: {
    orderBy: { revision: 'asc' as const },
    select: {
      id: true,
      correctionRevisionStableId: true,
      correctionCaseId: true,
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
          idempotencyKey: true,
        },
      },
    },
  },
} satisfies Prisma.AccountingCorrectionCaseSelect;

type AccountingCorrectionCaseRow = Prisma.AccountingCorrectionCaseGetPayload<{
  select: typeof CORRECTION_CASE_SELECT;
}>;

type AccountingCorrectionRevisionRow =
  AccountingCorrectionCaseRow['revisions'][number];

type AccountingCorrectionReadyRevisionRow = NonNullable<
  AccountingCorrectionCaseRow['readyRevision']
>;

const PRIOR_CORRECTION_SELECT = {
  id: true,
  correctionStableId: true,
  targetKind: true,
  targetStableId: true,
  targetVersion: true,
  reasonCode: true,
  strategy: true,
  baseAuthoritySchema: true,
  baseAuthorityHash: true,
  baseJournalSetHash: true,
  planHash: true,
  targetAuthoritySchema: true,
  targetAuthorityHash: true,
  readyPreviewSchema: true,
  readyPreviewJson: true,
  postedAt: true,
  readyRevision: {
    select: {
      revision: true,
    },
  },
  journalOutputs: {
    orderBy: [{ role: 'asc' as const }, { sequence: 'asc' as const }],
    select: {
      role: true,
      sequence: true,
      journalEntry: {
        select: {
          entryStableId: true,
          idempotencyKey: true,
          idempotencyHash: true,
          version: true,
          kind: true,
          source: true,
          sourceFactType: true,
          sourceFactStableId: true,
          sourceFactVersion: true,
          storeStableId: true,
          occurredAt: true,
          currency: true,
          memo: true,
          deletedAt: true,
          lines: {
            orderBy: { lineNo: 'asc' as const },
            select: {
              lineNo: true,
              debitCents: true,
              creditCents: true,
              memo: true,
              account: {
                select: { accountStableId: true },
              },
              category: {
                select: { categoryStableId: true },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.AccountingCorrectionCaseSelect;

type PriorCorrectionRow = Prisma.AccountingCorrectionCaseGetPayload<{
  select: typeof PRIOR_CORRECTION_SELECT;
}>;

export type CreatePostedFinancialCorrectionDraftInput = {
  targetStableId: string;
  targetVersion: number;
  reasonCode: AccountingPostedCorrectionReasonCode;
  note?: string | null;
  targetJson: unknown;
};

export type RevisePostedFinancialCorrectionDraftInput = {
  expectedVersion: number;
  reasonCode: AccountingPostedCorrectionReasonCode;
  note?: string | null;
  targetJson: unknown;
};

export type ReadyPostedFinancialCorrectionInput = {
  expectedVersion: number;
  expectedPlanHash: string;
};

export type CancelPostedFinancialCorrectionInput = {
  expectedVersion: number;
};

export type ExecutePostedFinancialCorrectionInput = {
  expectedPlanHash: string;
};

export type PostedFinancialCorrectionExecuteResult = {
  correction: AccountingCorrectionCaseRow;
  replayed: boolean;
};

const requireValue = (raw: unknown, field: string, maxLength = 500): string => {
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

const requirePositiveInteger = (value: number, field: string): number => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }
  return value;
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

const normalizeNote = (raw?: string | null): string | null => {
  if (raw == null) return null;
  if (typeof raw !== 'string') {
    throw new BadRequestException('note must be a string');
  }
  const note = raw.trim();
  if (note.length > MAX_NOTE_LENGTH) {
    throw new BadRequestException(
      `note must not exceed ${MAX_NOTE_LENGTH} characters`,
    );
  }
  return note || null;
};

const toInputJson = (value: unknown): Prisma.InputJsonValue => {
  if (value === undefined) {
    throw new BadRequestException('targetJson is required');
  }
  return value as Prisma.InputJsonValue;
};

const targetSnapshotToCreateInput = (
  journal: AccountingPostedCorrectionTargetJournalSnapshotV1,
): AccountingJournalCreateInput => ({
  idempotencyKey: journal.idempotencyKey,
  kind: journal.kind,
  source: journal.source,
  sourceFactType: journal.sourceFactType,
  sourceFactStableId: journal.sourceFactStableId,
  sourceFactVersion: journal.sourceFactVersion,
  storeStableId: journal.storeStableId,
  occurredAt: journal.occurredAt,
  currency: journal.currency,
  memo: journal.memo,
  lines: journal.lines.map((line) => ({
    accountStableId: line.accountStableId,
    categoryStableId: line.categoryStableId,
    debitCents: line.debitCents,
    creditCents: line.creditCents,
    memo: line.memo,
  })),
});

const postedAnchorToCreateInput = (
  journal: AccountingPostedCorrectionPostedJournalAnchorV1,
): AccountingJournalCreateInput => ({
  idempotencyKey: journal.idempotencyKey,
  kind: journal.kind,
  source: journal.source,
  sourceFactType: journal.sourceFactType,
  sourceFactStableId: journal.sourceFactStableId,
  sourceFactVersion: journal.sourceFactVersion,
  storeStableId: journal.storeStableId,
  occurredAt: journal.occurredAt,
  currency: journal.currency,
  memo: journal.memo,
  lines: journal.lines.map((line) => ({
    accountStableId: line.accountStableId,
    categoryStableId: line.categoryStableId,
    debitCents: line.debitCents,
    creditCents: line.creditCents,
    memo: line.memo,
  })),
});

@Injectable()
export class AccountingPostedFinancialCorrectionService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly journal: AccountingJournalService,
  ) {}

  async createDraft(
    input: CreatePostedFinancialCorrectionDraftInput,
    operatorActorRef: string,
    adapter: AccountingPostedFinancialCorrectionOwnerAdapter,
  ): Promise<AccountingCorrectionCaseRow> {
    const actorRef = requireValue(operatorActorRef, 'operatorActorRef', 250);
    const targetStableId = requireValue(
      input.targetStableId,
      'targetStableId',
      250,
    );
    const targetVersion = requirePositiveInteger(
      input.targetVersion,
      'targetVersion',
    );
    const note = normalizeNote(input.note);

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const target = await this.normalizeRevisionTarget(
        adapter,
        {
          targetStableId,
          targetVersion,
          reasonCode: input.reasonCode,
          targetJson: input.targetJson,
        },
        tx,
      );
      const created = await tx.accountingCorrectionCase.create({
        data: {
          targetKind: target.targetKind,
          targetStableId: target.targetStableId,
          targetVersion: target.targetVersion,
          status: AccountingPostedCorrectionStatus.DRAFT,
          reasonCode: input.reasonCode,
          note,
          createdByActorRef: actorRef,
        },
        select: { id: true, correctionStableId: true },
      });
      await tx.accountingCorrectionRevision.create({
        data: {
          correctionCaseId: created.id,
          revision: 1,
          targetAuthoritySchema: target.targetAuthoritySchema,
          targetAuthorityHash: target.targetAuthorityHash,
          targetJson: target.targetJson,
          createdByActorRef: actorRef,
        },
      });
      const correction = await this.requireCaseInTx(
        created.correctionStableId,
        tx,
      );
      await writeAccountingAuditLog(tx, {
        action: 'POSTED_CORRECTION_CREATE',
        entityType: CORRECTION_CASE_ENTITY_TYPE,
        entityId: correction.correctionStableId,
        operatorActorRef: actorRef,
        afterJson: correction as unknown as Prisma.InputJsonValue,
      });
      return correction;
    });
  }

  async reviseDraft(
    correctionStableIdRaw: string,
    input: RevisePostedFinancialCorrectionDraftInput,
    operatorActorRef: string,
    adapter: AccountingPostedFinancialCorrectionOwnerAdapter,
  ): Promise<AccountingCorrectionCaseRow> {
    const correctionStableId = requireValue(
      correctionStableIdRaw,
      'correctionStableId',
      250,
    );
    const actorRef = requireValue(operatorActorRef, 'operatorActorRef', 250);
    const expectedVersion = requirePositiveInteger(
      input.expectedVersion,
      'expectedVersion',
    );
    const note = normalizeNote(input.note);

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const current = await this.requireCaseInTx(correctionStableId, tx);
      this.assertAdapterKind(adapter, current.targetKind);
      this.assertMutable(current);
      if (current.version !== expectedVersion) {
        throw new ConflictException(
          'posted correction Case changed; reload before editing',
        );
      }

      const target = await this.normalizeRevisionTarget(
        adapter,
        {
          targetStableId: current.targetStableId,
          targetVersion: current.targetVersion,
          reasonCode: input.reasonCode,
          targetJson: input.targetJson,
        },
        tx,
      );
      this.assertStableTarget(current, target);

      const nextRevision =
        current.revisions.reduce(
          (max, revision) => Math.max(max, revision.revision),
          0,
        ) + 1;
      await tx.accountingCorrectionRevision.create({
        data: {
          correctionCaseId: current.id,
          revision: nextRevision,
          targetAuthoritySchema: target.targetAuthoritySchema,
          targetAuthorityHash: target.targetAuthorityHash,
          targetJson: target.targetJson,
          createdByActorRef: actorRef,
        },
      });
      const updated = await tx.accountingCorrectionCase.updateMany({
        where: {
          id: current.id,
          version: expectedVersion,
          status: current.status,
        },
        data: {
          version: { increment: 1 },
          status: AccountingPostedCorrectionStatus.DRAFT,
          reasonCode: input.reasonCode,
          note,
          strategy: null,
          baseAuthoritySchema: null,
          baseAuthorityHash: null,
          baseJournalSetHash: null,
          readyRevisionId: null,
          targetAuthoritySchema: null,
          targetAuthorityHash: null,
          readyPreviewSchema: null,
          readyPreviewJson: Prisma.DbNull,
          planHash: null,
          readyByActorRef: null,
          readyAt: null,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'posted correction Case changed while editing; retry from the latest version',
        );
      }
      const correction = await this.requireCaseInTx(correctionStableId, tx);
      await writeAccountingAuditLog(tx, {
        action: 'POSTED_CORRECTION_REVISE',
        entityType: CORRECTION_CASE_ENTITY_TYPE,
        entityId: correctionStableId,
        operatorActorRef: actorRef,
        beforeJson: current as unknown as Prisma.InputJsonValue,
        afterJson: correction as unknown as Prisma.InputJsonValue,
      });
      return correction;
    });
  }

  async previewCase(
    correctionStableIdRaw: string,
    adapter: AccountingPostedFinancialCorrectionOwnerAdapter,
  ): Promise<AccountingPostedCorrectionPreviewPlanV1> {
    const correctionStableId = requireValue(
      correctionStableIdRaw,
      'correctionStableId',
      250,
    );
    const correction = await this.requireCase(correctionStableId);
    this.assertAdapterKind(adapter, correction.targetKind);
    if (
      correction.status === AccountingPostedCorrectionStatus.POSTED ||
      correction.status === AccountingPostedCorrectionStatus.CANCELLED
    ) {
      throw new ConflictException(
        'terminal posted correction Cases cannot be previewed',
      );
    }
    const revision = this.latestRevision(correction);
    return this.buildPlan(correction, revision, adapter, this.prisma);
  }

  async markReady(
    correctionStableIdRaw: string,
    input: ReadyPostedFinancialCorrectionInput,
    operatorActorRef: string,
    adapter: AccountingPostedFinancialCorrectionOwnerAdapter,
  ): Promise<AccountingCorrectionCaseRow> {
    const correctionStableId = requireValue(
      correctionStableIdRaw,
      'correctionStableId',
      250,
    );
    const actorRef = requireValue(operatorActorRef, 'operatorActorRef', 250);
    const expectedVersion = requirePositiveInteger(
      input.expectedVersion,
      'expectedVersion',
    );
    const expectedPlanHash = requireSha256(
      input.expectedPlanHash,
      'expectedPlanHash',
    );

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const current = await this.requireCaseInTx(correctionStableId, tx);
      this.assertAdapterKind(adapter, current.targetKind);
      if (current.status !== AccountingPostedCorrectionStatus.DRAFT) {
        throw new ConflictException(
          'only DRAFT posted correction Cases can become READY',
        );
      }
      if (current.version !== expectedVersion) {
        throw new ConflictException(
          'posted correction Case changed; rerun Preview before READY',
        );
      }

      const revision = this.latestRevision(current);
      const plan = await this.buildPlan(current, revision, adapter, tx);
      if (plan.status !== 'READY') {
        throw new ConflictException(
          'posted correction Preview is NOOP and cannot become READY',
        );
      }
      if (plan.planHash !== expectedPlanHash) {
        throw new ConflictException(
          'posted correction plan changed after Preview; rerun Preview',
        );
      }
      await this.assertExecutionPlan(plan, current, tx);

      const readyAt = new Date();
      const updated = await tx.accountingCorrectionCase.updateMany({
        where: {
          id: current.id,
          version: expectedVersion,
          status: AccountingPostedCorrectionStatus.DRAFT,
        },
        data: {
          version: { increment: 1 },
          status: AccountingPostedCorrectionStatus.READY,
          strategy: plan.authority.strategy,
          baseAuthoritySchema: plan.authority.baseAuthoritySchema,
          baseAuthorityHash: plan.authority.baseAuthorityHash,
          baseJournalSetHash: plan.authority.baseJournalSetHash,
          readyRevisionId: revision.id,
          targetAuthoritySchema: plan.authority.targetAuthoritySchema,
          targetAuthorityHash: plan.authority.targetAuthorityHash,
          readyPreviewSchema:
            ACCOUNTING_POSTED_FINANCIAL_CORRECTION_READY_PREVIEW_SCHEMA,
          readyPreviewJson: plan as unknown as Prisma.InputJsonValue,
          planHash: plan.planHash,
          readyByActorRef: actorRef,
          readyAt,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'posted correction Case changed while becoming READY',
        );
      }
      const correction = await this.requireCaseInTx(correctionStableId, tx);
      await writeAccountingAuditLog(tx, {
        action: 'POSTED_CORRECTION_READY',
        entityType: CORRECTION_CASE_ENTITY_TYPE,
        entityId: correctionStableId,
        operatorActorRef: actorRef,
        beforeJson: current as unknown as Prisma.InputJsonValue,
        afterJson: correction as unknown as Prisma.InputJsonValue,
      });
      return correction;
    });
  }

  async cancelCase(
    correctionStableIdRaw: string,
    input: CancelPostedFinancialCorrectionInput,
    operatorActorRef: string,
  ): Promise<AccountingCorrectionCaseRow> {
    const correctionStableId = requireValue(
      correctionStableIdRaw,
      'correctionStableId',
      250,
    );
    const actorRef = requireValue(operatorActorRef, 'operatorActorRef', 250);
    const expectedVersion = requirePositiveInteger(
      input.expectedVersion,
      'expectedVersion',
    );

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const current = await this.requireCaseInTx(correctionStableId, tx);
      if (
        current.status !== AccountingPostedCorrectionStatus.DRAFT &&
        current.status !== AccountingPostedCorrectionStatus.READY
      ) {
        throw new ConflictException(
          'only DRAFT or READY posted correction Cases can be cancelled',
        );
      }
      if (current.version !== expectedVersion) {
        throw new ConflictException(
          'posted correction Case changed; reload before cancelling',
        );
      }
      const cancelledAt = new Date();
      const updated = await tx.accountingCorrectionCase.updateMany({
        where: {
          id: current.id,
          version: expectedVersion,
          status: current.status,
        },
        data: {
          version: { increment: 1 },
          status: AccountingPostedCorrectionStatus.CANCELLED,
          cancelledByActorRef: actorRef,
          cancelledAt,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'posted correction Case changed while cancelling',
        );
      }
      const correction = await this.requireCaseInTx(correctionStableId, tx);
      await writeAccountingAuditLog(tx, {
        action: 'POSTED_CORRECTION_CANCEL',
        entityType: CORRECTION_CASE_ENTITY_TYPE,
        entityId: correctionStableId,
        operatorActorRef: actorRef,
        beforeJson: current as unknown as Prisma.InputJsonValue,
        afterJson: correction as unknown as Prisma.InputJsonValue,
      });
      return correction;
    });
  }

  async executeCase(
    correctionStableIdRaw: string,
    input: ExecutePostedFinancialCorrectionInput,
    operatorActorRef: string,
    adapter: AccountingPostedFinancialCorrectionOwnerAdapter,
  ): Promise<PostedFinancialCorrectionExecuteResult> {
    const correctionStableId = requireValue(
      correctionStableIdRaw,
      'correctionStableId',
      250,
    );
    const actorRef = requireValue(operatorActorRef, 'operatorActorRef', 250);
    const expectedPlanHash = requireSha256(
      input.expectedPlanHash,
      'expectedPlanHash',
    );

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const current = await this.requireCaseInTx(correctionStableId, tx);
      this.assertAdapterKind(adapter, current.targetKind);

      if (current.status === AccountingPostedCorrectionStatus.POSTED) {
        if (current.planHash !== expectedPlanHash) {
          throw new ConflictException(
            'posted correction is already POSTED under a different planHash',
          );
        }
        return { correction: current, replayed: true };
      }
      if (current.status !== AccountingPostedCorrectionStatus.READY) {
        throw new ConflictException(
          'only READY posted correction Cases can be executed',
        );
      }
      if (current.planHash !== expectedPlanHash) {
        throw new ConflictException(
          'posted correction READY plan does not match expectedPlanHash',
        );
      }

      const revision = this.requireReadyRevision(current);
      const frozenPlan = this.requireFrozenReadyPlan(current);
      const rebuiltPlan = await this.buildPlan(current, revision, adapter, tx);
      if (
        rebuiltPlan.status !== 'READY' ||
        rebuiltPlan.planHash !== expectedPlanHash ||
        hashAccountingJson(rebuiltPlan) !== hashAccountingJson(frozenPlan)
      ) {
        throw new ConflictException(
          'posted correction authority changed after READY; return to DRAFT and Preview again',
        );
      }

      const currentBusinessJournals = await this.readCurrentBusinessJournals(
        current,
        rebuiltPlan,
        tx,
      );
      const drafts = this.applyExecutionPolicy(() =>
        buildPostedCorrectionExecutionJournalDrafts({
          plan: rebuiltPlan,
          currentBusinessJournals,
        }),
      );

      if (current.journalOutputs.length > 0) {
        throw new ConflictException(
          'READY posted correction already has Journal outputs; review partial evidence',
        );
      }

      for (const draft of drafts) {
        const writePlan = this.applyExecutionPolicy(() =>
          buildPostedCorrectionJournalWritePlan({
            correctionStableId: current.correctionStableId,
            correctionRevisionStableId: revision.correctionRevisionStableId,
            correctionRevision: revision.revision,
            targetKind: current.targetKind,
            targetStableId: current.targetStableId,
            targetVersion: current.targetVersion,
            planHash: expectedPlanHash,
            draft,
          }),
        );
        const journal =
          await this.journal.createPostedCorrectionJournalEntryInTx(
            writePlan.journal,
            actorRef,
            writePlan.authority,
            tx,
          );
        const journalIdentity = await tx.accountingJournalEntry.findUnique({
          where: { entryStableId: journal.entryStableId },
          select: { id: true },
        });
        if (!journalIdentity) {
          throw new ConflictException(
            'posted correction Journal was created without a persisted identity',
          );
        }
        await tx.accountingCorrectionJournalOutput.create({
          data: {
            correctionCaseId: current.id,
            role: draft.role,
            sequence: draft.sequence,
            journalEntryId: journalIdentity.id,
          },
        });
      }

      await adapter.activateTargetInTx(
        {
          correctionStableId: current.correctionStableId,
          correctionRevisionStableId: revision.correctionRevisionStableId,
          correctionRevision: revision.revision,
          targetStableId: current.targetStableId,
          targetVersion: current.targetVersion,
          targetAuthoritySchema: revision.targetAuthoritySchema,
          targetAuthorityHash: revision.targetAuthorityHash,
          targetJson: revision.targetJson,
          plan: rebuiltPlan,
        },
        tx,
      );

      const postedAt = new Date();
      const updated = await tx.accountingCorrectionCase.updateMany({
        where: {
          id: current.id,
          version: current.version,
          status: AccountingPostedCorrectionStatus.READY,
          planHash: expectedPlanHash,
        },
        data: {
          version: { increment: 1 },
          status: AccountingPostedCorrectionStatus.POSTED,
          postedByActorRef: actorRef,
          postedAt,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'posted correction Case changed during execution',
        );
      }

      const correction = await this.requireCaseInTx(correctionStableId, tx);
      await writeAccountingAuditLog(tx, {
        action: 'POSTED_CORRECTION_POST',
        entityType: CORRECTION_CASE_ENTITY_TYPE,
        entityId: correctionStableId,
        operatorActorRef: actorRef,
        beforeJson: current as unknown as Prisma.InputJsonValue,
        afterJson: {
          correction,
          plan: rebuiltPlan,
        } as unknown as Prisma.InputJsonValue,
      });
      return { correction, replayed: false };
    });
  }

  private async normalizeRevisionTarget(
    adapter: AccountingPostedFinancialCorrectionOwnerAdapter,
    input: {
      targetStableId: string;
      targetVersion: number;
      reasonCode: AccountingPostedCorrectionReasonCode;
      targetJson: unknown;
    },
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<AccountingPostedCorrectionOwnerRevisionTargetV1> {
    const target = await adapter.normalizeRevisionTarget(input, db);
    if (target.targetKind !== adapter.targetKind) {
      throw new ConflictException(
        'posted correction owner adapter returned a mismatched targetKind',
      );
    }
    if (
      target.targetStableId !== input.targetStableId ||
      target.targetVersion !== input.targetVersion
    ) {
      throw new ConflictException(
        'posted correction owner adapter changed the stable target identity',
      );
    }
    if (
      !target.targetAuthoritySchema.trim() ||
      !/^[a-f0-9]{64}$/.test(target.targetAuthorityHash)
    ) {
      throw new ConflictException(
        'posted correction owner adapter returned invalid target authority',
      );
    }
    toInputJson(target.targetJson);
    return target;
  }

  private async resolveReadyTarget(
    adapter: AccountingPostedFinancialCorrectionOwnerAdapter,
    correction: AccountingCorrectionCaseRow,
    revision: AccountingCorrectionRevisionRow,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<AccountingPostedCorrectionOwnerReadyTargetV1> {
    const resolved = await adapter.resolveReadyTarget(
      {
        targetStableId: correction.targetStableId,
        targetVersion: correction.targetVersion,
        reasonCode: correction.reasonCode,
        targetJson: revision.targetJson,
      },
      db,
    );
    if (resolved.targetKind !== adapter.targetKind) {
      throw new ConflictException(
        'posted correction owner adapter returned a mismatched READY targetKind',
      );
    }
    return resolved;
  }

  private async buildPlan(
    correction: AccountingCorrectionCaseRow,
    revision: AccountingCorrectionRevisionRow,
    adapter: AccountingPostedFinancialCorrectionOwnerAdapter,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<AccountingPostedCorrectionPreviewPlanV1> {
    const readyTarget = await this.resolveReadyTarget(
      adapter,
      correction,
      revision,
      db,
    );
    this.assertReadyTargetMatchesRevision(correction, revision, readyTarget);

    const prior = await this.readPriorPostedCorrections(correction, db);
    const priorJournalAnchors = this.toPriorCorrectionJournalAnchors(prior);
    this.assertPriorAuthorityChain(prior, readyTarget);

    try {
      return buildPostedFinancialCorrectionPreviewPlan({
        correctionStableId: correction.correctionStableId,
        targetKind: correction.targetKind,
        targetStableId: correction.targetStableId,
        targetVersion: correction.targetVersion,
        strategy: readyTarget.strategy,
        reasonCode: correction.reasonCode,
        baseAuthoritySchema: readyTarget.baseAuthoritySchema,
        baseAuthorityHash: readyTarget.baseAuthorityHash,
        targetAuthoritySchema: readyTarget.targetAuthoritySchema,
        targetAuthorityHash: readyTarget.targetAuthorityHash,
        ...(readyTarget.schemaTransition
          ? { schemaTransition: readyTarget.schemaTransition }
          : {}),
        currency: readyTarget.currency,
        originalJournals: readyTarget.originalJournals,
        priorCorrectionJournals: priorJournalAnchors,
        targetJournals: readyTarget.targetJournals,
      });
    } catch (error) {
      if (error instanceof AccountingPostedFinancialCorrectionPolicyError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private async assertExecutionPlan(
    plan: AccountingPostedCorrectionPreviewPlanV1,
    correction: AccountingCorrectionCaseRow,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<void> {
    const currentBusinessJournals = await this.readCurrentBusinessJournals(
      correction,
      plan,
      db,
    );
    this.applyExecutionPolicy(() =>
      buildPostedCorrectionExecutionJournalDrafts({
        plan,
        currentBusinessJournals,
      }),
    );
  }

  private async readCurrentBusinessJournals(
    correction: AccountingCorrectionCaseRow,
    plan: AccountingPostedCorrectionPreviewPlanV1,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<AccountingJournalCreateInput[]> {
    const prior = await this.readPriorPostedCorrections(correction, db);
    if (prior.length === 0) {
      return plan.originalJournalSet.journals.map(postedAnchorToCreateInput);
    }
    const latest = prior[prior.length - 1];
    const preview = this.requirePriorPostedPlan(latest);
    return preview.targetJournalSet.journals.map(targetSnapshotToCreateInput);
  }

  private async readPriorPostedCorrections(
    correction: AccountingCorrectionCaseRow,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<PriorCorrectionRow[]> {
    return db.accountingCorrectionCase.findMany({
      where: {
        targetKind: correction.targetKind,
        targetStableId: correction.targetStableId,
        targetVersion: correction.targetVersion,
        status: AccountingPostedCorrectionStatus.POSTED,
        NOT: { id: correction.id },
      },
      select: PRIOR_CORRECTION_SELECT,
      orderBy: [{ postedAt: 'asc' }, { correctionStableId: 'asc' }],
    });
  }

  private toPriorCorrectionJournalAnchors(
    prior: PriorCorrectionRow[],
  ): AccountingPostedCorrectionPostedJournalAnchorV1[] {
    return prior.flatMap((correction) => {
      const revision = correction.readyRevision;
      if (!revision) {
        throw new ConflictException(
          `POSTED correction is missing its READY revision: ${correction.correctionStableId}`,
        );
      }
      this.requirePriorPostedPlan(correction);
      return correction.journalOutputs.map((output) => {
        const journal = output.journalEntry;
        if (
          journal.deletedAt ||
          journal.sourceFactType !==
            ACCOUNTING_POSTED_FINANCIAL_CORRECTION_SOURCE_FACT_TYPE ||
          journal.sourceFactStableId !== correction.correctionStableId ||
          journal.sourceFactVersion !== revision.revision
        ) {
          throw new ConflictException(
            `POSTED correction Journal chain is stale or invalid: ${correction.correctionStableId}`,
          );
        }
        return {
          entryStableId: journal.entryStableId,
          idempotencyKey: journal.idempotencyKey,
          idempotencyHash: journal.idempotencyHash,
          version: journal.version,
          kind: journal.kind,
          source: journal.source,
          sourceFactType: journal.sourceFactType,
          sourceFactStableId: journal.sourceFactStableId,
          sourceFactVersion: journal.sourceFactVersion,
          storeStableId: journal.storeStableId,
          occurredAt: journal.occurredAt.toISOString(),
          currency: journal.currency,
          memo: journal.memo,
          lines: journal.lines.map((line) => ({
            lineNo: line.lineNo,
            accountStableId: line.account.accountStableId,
            categoryStableId: line.category?.categoryStableId ?? null,
            debitCents: line.debitCents,
            creditCents: line.creditCents,
            memo: line.memo,
          })),
        };
      });
    });
  }

  private assertPriorAuthorityChain(
    prior: PriorCorrectionRow[],
    readyTarget: AccountingPostedCorrectionOwnerReadyTargetV1,
  ): void {
    if (prior.length === 0) return;
    const latest = prior[prior.length - 1];
    if (
      latest.targetAuthoritySchema !== readyTarget.baseAuthoritySchema ||
      latest.targetAuthorityHash !== readyTarget.baseAuthorityHash
    ) {
      throw new ConflictException(
        'current business authority no longer matches the latest POSTED correction',
      );
    }
  }

  private requirePriorPostedPlan(
    correction: PriorCorrectionRow,
  ): AccountingPostedCorrectionPreviewPlanV1 {
    if (
      correction.readyPreviewSchema !==
        ACCOUNTING_POSTED_FINANCIAL_CORRECTION_READY_PREVIEW_SCHEMA ||
      !correction.planHash ||
      !correction.readyPreviewJson
    ) {
      throw new ConflictException(
        `POSTED correction is missing frozen Preview evidence: ${correction.correctionStableId}`,
      );
    }
    const plan =
      correction.readyPreviewJson as unknown as AccountingPostedCorrectionPreviewPlanV1;
    if (
      plan.version !== 1 ||
      plan.status !== 'READY' ||
      plan.planHash !== correction.planHash ||
      hashAccountingJson(plan.authority) !== correction.planHash ||
      plan.authority.correctionStableId !== correction.correctionStableId ||
      plan.authority.targetKind !== correction.targetKind ||
      plan.authority.targetStableId !== correction.targetStableId ||
      plan.authority.targetVersion !== correction.targetVersion ||
      plan.authority.strategy !== correction.strategy ||
      plan.authority.reasonCode !== correction.reasonCode ||
      plan.authority.baseAuthoritySchema !== correction.baseAuthoritySchema ||
      plan.authority.baseAuthorityHash !== correction.baseAuthorityHash ||
      plan.authority.baseJournalSetHash !== correction.baseJournalSetHash ||
      plan.authority.targetAuthoritySchema !==
        correction.targetAuthoritySchema ||
      plan.authority.targetAuthorityHash !== correction.targetAuthorityHash
    ) {
      throw new ConflictException(
        `POSTED correction frozen Preview is invalid: ${correction.correctionStableId}`,
      );
    }
    return plan;
  }

  private requireFrozenReadyPlan(
    correction: AccountingCorrectionCaseRow,
  ): AccountingPostedCorrectionPreviewPlanV1 {
    if (
      correction.readyPreviewSchema !==
        ACCOUNTING_POSTED_FINANCIAL_CORRECTION_READY_PREVIEW_SCHEMA ||
      !correction.planHash ||
      !correction.readyPreviewJson
    ) {
      throw new ConflictException(
        'READY posted correction is missing frozen Preview evidence',
      );
    }
    const plan =
      correction.readyPreviewJson as unknown as AccountingPostedCorrectionPreviewPlanV1;
    if (
      plan.version !== 1 ||
      plan.status !== 'READY' ||
      plan.planHash !== correction.planHash ||
      hashAccountingJson(plan.authority) !== correction.planHash ||
      plan.authority.correctionStableId !== correction.correctionStableId ||
      plan.authority.targetKind !== correction.targetKind ||
      plan.authority.targetStableId !== correction.targetStableId ||
      plan.authority.targetVersion !== correction.targetVersion ||
      plan.authority.strategy !== correction.strategy ||
      plan.authority.reasonCode !== correction.reasonCode ||
      plan.authority.baseAuthoritySchema !== correction.baseAuthoritySchema ||
      plan.authority.baseAuthorityHash !== correction.baseAuthorityHash ||
      plan.authority.baseJournalSetHash !== correction.baseJournalSetHash ||
      plan.authority.targetAuthoritySchema !==
        correction.targetAuthoritySchema ||
      plan.authority.targetAuthorityHash !== correction.targetAuthorityHash
    ) {
      throw new ConflictException(
        'READY posted correction frozen Preview evidence is inconsistent',
      );
    }
    return plan;
  }

  private assertReadyTargetMatchesRevision(
    correction: AccountingCorrectionCaseRow,
    revision: AccountingCorrectionRevisionRow,
    target: AccountingPostedCorrectionOwnerReadyTargetV1,
  ): void {
    if (
      target.targetKind !== correction.targetKind ||
      target.targetStableId !== correction.targetStableId ||
      target.targetVersion !== correction.targetVersion ||
      target.targetAuthoritySchema !== revision.targetAuthoritySchema ||
      target.targetAuthorityHash !== revision.targetAuthorityHash ||
      hashAccountingJson(target.targetJson) !==
        hashAccountingJson(revision.targetJson)
    ) {
      throw new ConflictException(
        'posted correction owner READY target no longer matches the selected Revision',
      );
    }
    if (
      !target.baseAuthoritySchema.trim() ||
      !/^[a-f0-9]{64}$/.test(target.baseAuthorityHash)
    ) {
      throw new ConflictException(
        'posted correction owner adapter returned invalid base authority',
      );
    }
  }

  private assertStableTarget(
    correction: AccountingCorrectionCaseRow,
    target: AccountingPostedCorrectionOwnerRevisionTargetV1,
  ): void {
    if (
      target.targetKind !== correction.targetKind ||
      target.targetStableId !== correction.targetStableId ||
      target.targetVersion !== correction.targetVersion
    ) {
      throw new ConflictException(
        'posted correction target identity cannot change inside one Case',
      );
    }
  }

  private requireReadyRevision(
    correction: AccountingCorrectionCaseRow,
  ): AccountingCorrectionReadyRevisionRow {
    const revision = correction.readyRevision;
    if (!revision || revision.correctionCaseId !== correction.id) {
      throw new ConflictException(
        'READY posted correction revision does not belong to its Case',
      );
    }
    return revision;
  }

  private latestRevision(
    correction: AccountingCorrectionCaseRow,
  ): AccountingCorrectionRevisionRow {
    const revision = correction.revisions[correction.revisions.length - 1];
    if (!revision || revision.correctionCaseId !== correction.id) {
      throw new ConflictException(
        'posted correction Case is missing a valid target Revision',
      );
    }
    return revision;
  }

  private assertMutable(correction: AccountingCorrectionCaseRow): void {
    if (
      correction.status === AccountingPostedCorrectionStatus.POSTED ||
      correction.status === AccountingPostedCorrectionStatus.CANCELLED
    ) {
      throw new ConflictException(
        'POSTED and CANCELLED correction Cases are terminal',
      );
    }
  }

  private assertAdapterKind(
    adapter: AccountingPostedFinancialCorrectionOwnerAdapter,
    targetKind: AccountingPostedCorrectionTargetKind,
  ): void {
    if (adapter.targetKind !== targetKind) {
      throw new ConflictException(
        'posted correction owner adapter does not match targetKind',
      );
    }
  }

  private async requireCase(
    correctionStableId: string,
  ): Promise<AccountingCorrectionCaseRow> {
    const correction = await this.prisma.accountingCorrectionCase.findUnique({
      where: { correctionStableId },
      select: CORRECTION_CASE_SELECT,
    });
    if (!correction) throw new NotFoundException('posted correction not found');
    return correction;
  }

  private async requireCaseInTx(
    correctionStableId: string,
    tx: Prisma.TransactionClient,
  ): Promise<AccountingCorrectionCaseRow> {
    const correction = await tx.accountingCorrectionCase.findUnique({
      where: { correctionStableId },
      select: CORRECTION_CASE_SELECT,
    });
    if (!correction) throw new NotFoundException('posted correction not found');
    return correction;
  }

  private applyExecutionPolicy<T>(work: () => T): T {
    try {
      return work();
    } catch (error) {
      if (
        error instanceof AccountingPostedFinancialCorrectionExecutionPolicyError
      ) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
