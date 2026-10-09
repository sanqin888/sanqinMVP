import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  AccountingPostedCorrectionReasonCode,
  AccountingPostedCorrectionStatus,
  AccountingPostedCorrectionTargetKind,
} from './accounting-posted-financial-correction.contract';
import { AccountingPostedFinancialCorrectionService } from './accounting-posted-financial-correction.service';
import {
  accountingPostedCorrectionTargetKey,
  readAccountingPostedCorrectionHistories,
  type AccountingPostedCorrectionHistoryCaseV1,
} from './accounting-posted-correction-read-model';
import { AccountingProviderSettlementCorrectionAdapter } from './accounting-provider-settlement-correction.adapter';
import {
  type ProviderSettlementCorrectionTargetInputV1,
  type ProviderSettlementCorrectionTargetV1,
} from './accounting-provider-settlement-correction-target.policy';
import {
  ACCOUNTING_PROVIDER_SETTLEMENT_STRUCTURAL_TARGET_SCHEMA,
  type ProviderStructuralTargetChangeV2,
  type ProviderSettlementStructuralTargetV2,
} from './accounting-provider-settlement-structural-target.policy';
import {
  readProviderCurrentAuthority,
  currentProviderEffectiveLines,
} from './accounting-provider-settlement-current-authority.policy';

const PROVIDER_TARGET_KIND =
  AccountingPostedCorrectionTargetKind.PROVIDER_SETTLEMENT;

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

type ProviderDraftInput =
  | ProviderSettlementCorrectionTargetInputV1
  | ProviderStructuralTargetChangeV2;

const parseDraftInput = (raw: unknown): ProviderDraftInput => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException('target must be an object');
  }
  const target = raw as Record<string, unknown>;
  if (target.version === 2 && Array.isArray(target.changes)) {
    return {
      version: 2,
      expectedBaseAuthorityHash: requireSha256(
        target.expectedBaseAuthorityHash,
        'target.expectedBaseAuthorityHash',
      ),
      changes: target.changes as ProviderStructuralTargetChangeV2['changes'],
    };
  }
  if (target.version !== 1 || !Array.isArray(target.lines)) {
    throw new BadRequestException(
      'target must use version 1 lines or version 2 changes',
    );
  }
  return {
    version: 1,
    expectedBaseAuthorityHash: requireSha256(
      target.expectedBaseAuthorityHash,
      'target.expectedBaseAuthorityHash',
    ),
    lines: target.lines as ProviderSettlementCorrectionTargetInputV1['lines'],
  };
};

const toDraftInput = (
  target: ProviderSettlementCorrectionTargetV1 | ProviderSettlementStructuralTargetV2,
): ProviderDraftInput => {
  if (target.version === 2) {
    return {
      version: 2,
      expectedBaseAuthorityHash: target.basedOnAuthorityHash,
      changes: target.lines
        .filter((line) => line.origin === 'CORRECTION_ADDED')
        .map((line) => ({
          action: 'ADD' as const,
          values: {
            evidenceDocumentStableId: line.evidenceDocumentStableId,
            rawCode: line.rawCode,
            rawName: line.rawName,
            component: line.component,
            postingTreatment: line.postingTreatment,
            taxRole: line.taxRole,
            amountCents: line.amountCents,
          },
        })),
    };
  }
  return {
    version: 1,
    expectedBaseAuthorityHash: target.basedOnAuthorityHash,
    lines: target.lines.map((line) => ({
      lineStableId: line.lineStableId,
      rawCode: line.rawCode,
      rawName: line.rawName,
      component: line.component,
      postingTreatment: line.postingTreatment,
      taxRole: line.taxRole,
      amountCents: line.amountCents,
    })),
  };
};

const normalizePersistedTarget = (params: {
  value: Prisma.JsonValue;
  schema: string;
  hash: string;
}) => {
  try {
    return readProviderCurrentAuthority({
      targetJson: params.value,
      schema: params.schema,
      expectedHash: params.hash,
    });
  } catch (error) {
    throw new ConflictException(
      'persisted Provider correction target is invalid: ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
};

const serializeCase = (row: AccountingPostedCorrectionHistoryCaseV1) => ({
  correctionStableId: row.correctionStableId,
  version: row.version,
  targetVersion: row.targetVersion,
  status: row.status,
  reasonCode: row.reasonCode,
  note: row.note,
  strategy: row.strategy,
  planHash: row.planHash,
  readyPreview: row.readyPreview,
  createdByActorRef: row.createdByActorRef,
  readyByActorRef: row.readyByActorRef,
  readyAt: row.readyAt,
  postedByActorRef: row.postedByActorRef,
  postedAt: row.postedAt,
  cancelledByActorRef: row.cancelledByActorRef,
  cancelledAt: row.cancelledAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  revisions: row.revisions.map((revision) => {
    const authority = normalizePersistedTarget({
      value: revision.targetJson,
      schema: revision.targetAuthoritySchema,
      hash: revision.targetAuthorityHash,
    });
    return {
      correctionRevisionStableId: revision.correctionRevisionStableId,
      revision: revision.revision,
      targetAuthoritySchema: revision.targetAuthoritySchema,
      targetAuthorityHash: revision.targetAuthorityHash,
      draftInput: toDraftInput(authority.target),
      ...(authority.target.version === 2
        ? { effectiveLines: currentProviderEffectiveLines(authority) }
        : {}),
      createdByActorRef: revision.createdByActorRef,
      createdAt: revision.createdAt,
    };
  }),
  journalOutputs: row.journalOutputs.map((output) => ({
    outputStableId: output.outputStableId,
    role: output.role,
    sequence: output.sequence,
    journal: output.journal,
  })),
});

@Injectable()
export class AccountingProviderSettlementCorrectionService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly correction: AccountingPostedFinancialCorrectionService,
    private readonly adapter: AccountingProviderSettlementCorrectionAdapter,
  ) {}

  async readRecord(documentStableIdRaw: string) {
    const documentStableId = requireValue(
      documentStableIdRaw,
      'documentStableId',
    );
    const document =
      await this.prisma.accountingProviderFinancialDocument.findUnique({
        where: { documentStableId },
        select: {
          documentStableId: true,
          revision: true,
          provider: true,
          documentType: true,
          storeStableId: true,
          periodStart: true,
          periodEnd: true,
          currency: true,
        },
      });
    if (!document) {
      throw new NotFoundException('posted Provider Statement not found');
    }

    const ref = {
      targetKind: PROVIDER_TARGET_KIND,
      targetStableId: documentStableId,
      targetVersion: document.revision,
    } as const;
    const histories = await readAccountingPostedCorrectionHistories(
      this.prisma,
      [ref],
    );
    const corrections =
      histories.get(accountingPostedCorrectionTargetKey(ref)) ?? [];

    try {
      const current = await this.adapter.readCurrentEffectiveTarget(
        documentStableId,
        document.revision,
      );
      return {
        version: 1 as const,
        status: 'READY' as const,
        blockReason: null,
        document: {
          documentStableId: document.documentStableId,
          revision: document.revision,
          provider: document.provider,
          documentType: document.documentType,
          storeStableId: document.storeStableId,
          periodStart: document.periodStart?.toISOString().slice(0, 10) ?? null,
          periodEnd: document.periodEnd?.toISOString().slice(0, 10) ?? null,
          currency: document.currency,
        },
        currentEffective: {
          targetAuthorityHash: current.targetAuthorityHash,
          draftInput: current.draftInput,
          ...(current.targetAuthoritySchema ===
          ACCOUNTING_PROVIDER_SETTLEMENT_STRUCTURAL_TARGET_SCHEMA
            ? {
                targetAuthoritySchema: current.targetAuthoritySchema,
                effectiveLines: current.effectiveLines,
              }
            : {}),
          ...(current.structuralBaseAuthorityHash
            ? {
                structuralBaseAuthorityHash:
                  current.structuralBaseAuthorityHash,
              }
            : {}),
        },
        corrections: corrections.map(serializeCase),
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        return {
          version: 1 as const,
          status: 'BLOCKED' as const,
          blockReason: error.message,
          document: {
            documentStableId: document.documentStableId,
            revision: document.revision,
            provider: document.provider,
            documentType: document.documentType,
            storeStableId: document.storeStableId,
            periodStart:
              document.periodStart?.toISOString().slice(0, 10) ?? null,
            periodEnd: document.periodEnd?.toISOString().slice(0, 10) ?? null,
            currency: document.currency,
          },
          currentEffective: null,
          corrections: corrections.map(serializeCase),
        };
      }
      throw error;
    }
  }

  async createDraft(
    documentStableIdRaw: string,
    body: {
      reasonCode?: unknown;
      note?: unknown;
      target?: unknown;
    },
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
        'Provider Statement already has an active DRAFT or READY correction',
      );
    }
    const reasonCode = parseReasonCode(body.reasonCode);
    const target = parseDraftInput(body.target);
    const expectedAuthorityHash =
      target.version === 2
        ? record.currentEffective.structuralBaseAuthorityHash
        : record.currentEffective.targetAuthorityHash;
    if (
      !expectedAuthorityHash ||
      target.expectedBaseAuthorityHash !== expectedAuthorityHash
    ) {
      throw new ConflictException(
        'Provider correction editor is stale or structural target is not available; reload current effective values',
      );
    }
    await this.correction.createDraft(
      {
        targetStableId: record.document.documentStableId,
        targetVersion: record.document.revision,
        reasonCode,
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
    body: {
      expectedVersion?: unknown;
      expectedPlanHash?: unknown;
    },
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
        record.blockReason ?? 'posted Provider Statement cannot be corrected',
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
        targetKind: PROVIDER_TARGET_KIND,
        targetStableId: documentStableId,
      },
      select: {
        correctionStableId: true,
        targetStableId: true,
      },
    });
    if (!correction) {
      throw new NotFoundException(
        'Provider posted correction does not belong to this Statement',
      );
    }
    return {
      documentStableId: correction.targetStableId,
      correctionStableId: correction.correctionStableId,
    };
  }
}
