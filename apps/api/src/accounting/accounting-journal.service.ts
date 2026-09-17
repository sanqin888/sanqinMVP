import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { Prisma } from '@prisma/client';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import { runSerializableAccountingWrite } from './accounting-atomic-write';
import { writeAccountingAuditLog } from './accounting-audit-writer';
import {
  AccountingJournalPolicyError,
  hashJournalCreatePayload,
  normalizeJournalCreate,
  normalizeJournalUpdate,
  type AccountingJournalCreateInput,
  type AccountingJournalUpdateInput,
  type NormalizedJournalCreate,
  type NormalizedJournalLine,
} from './accounting-journal-policy';
import {
  hashCanonicalChangeJournalWrite,
  normalizeCanonicalChangeJournalWriteAuthority,
  type CanonicalChangeJournalWriteAuthorityV1,
} from './accounting-canonical-change-write-authority';
import { CANONICAL_SALE_SOURCE_FACT_TYPE } from './accounting-canonical-sale-journal.policy';
import {
  buildProviderSettlementJournalWriteAuthority,
  hashProviderSettlementJournalWrite,
  normalizeProviderSettlementReplacementGroupAuthority,
  type ProviderSettlementJournalWriteAuthorityV1,
  type ProviderSettlementReplacementGroupAuthorityV1,
  type ProviderSettlementReplacementGroupWriteInput,
} from './accounting-provider-settlement-write-authority';
import {
  PROVIDER_FINANCIAL_SOURCE_FACT_TYPE,
  UBER_PRE_CUTOVER_REVERSAL_SOURCE_FACT_TYPE,
} from './accounting-provider-settlement.policy';
import { AccountingPeriodService } from './accounting-period.service';

const ACCOUNTING_JOURNAL_PUBLIC_SELECT = {
  entryStableId: true,
  idempotencyKey: true,
  kind: true,
  source: true,
  sourceFactType: true,
  sourceFactStableId: true,
  sourceFactVersion: true,
  storeStableId: true,
  occurredAt: true,
  currency: true,
  memo: true,
  createdByActorRef: true,
  updatedByActorRef: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  deletedAt: true,
  lines: {
    orderBy: { lineNo: 'asc' as const },
    select: {
      lineNo: true,
      debitCents: true,
      creditCents: true,
      memo: true,
      account: {
        select: {
          accountStableId: true,
          name: true,
          type: true,
          accountClass: true,
          currency: true,
        },
      },
      category: {
        select: {
          categoryStableId: true,
          name: true,
          type: true,
        },
      },
    },
  },
} satisfies Prisma.AccountingJournalEntrySelect;

const ACCOUNTING_JOURNAL_INTERNAL_SELECT = {
  id: true,
  idempotencyHash: true,
  ...ACCOUNTING_JOURNAL_PUBLIC_SELECT,
} satisfies Prisma.AccountingJournalEntrySelect;

type AccountingJournalRow = Prisma.AccountingJournalEntryGetPayload<{
  select: typeof ACCOUNTING_JOURNAL_PUBLIC_SELECT;
}>;

type AccountingJournalInternalRow = Prisma.AccountingJournalEntryGetPayload<{
  select: typeof ACCOUNTING_JOURNAL_INTERNAL_SELECT;
}>;

type ResolvedJournalLine = NormalizedJournalLine & {
  accountId: string;
  categoryId: string | null;
};

type AccountingDbClient = AccountingDb | Prisma.TransactionClient;

type PreparedJournalWrite = {
  normalized: NormalizedJournalCreate;
  idempotencyHash: string;
  auditAuthority: Prisma.InputJsonValue | null;
};

@Injectable()
export class AccountingJournalService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly period: AccountingPeriodService,
  ) {}

  async readCanonicalSaleJournalAnchors(sourceFactStableIds: string[]): Promise<
    Array<{
      entryStableId: string;
      sourceFactStableId: string;
      idempotencyKey: string;
    }>
  > {
    const stableIds = [
      ...new Set(
        sourceFactStableIds.map((value) => value.trim()).filter(Boolean),
      ),
    ].sort();
    if (stableIds.length === 0) return [];

    const rows = await this.prisma.accountingJournalEntry.findMany({
      where: {
        deletedAt: null,
        source: AccountingJournalSource.ORDER,
        sourceFactType: 'order.financial_sale.v1',
        sourceFactStableId: { in: stableIds },
      },
      select: {
        entryStableId: true,
        idempotencyKey: true,
        sourceFactStableId: true,
      },
      orderBy: { entryStableId: 'asc' },
    });

    const anchors = rows.flatMap((row) => {
      const sourceFactStableId = row.sourceFactStableId?.trim();
      if (!sourceFactStableId) return [];
      return [
        {
          entryStableId: row.entryStableId,
          sourceFactStableId,
          idempotencyKey: row.idempotencyKey,
        },
      ];
    });
    const seen = new Set<string>();
    for (const anchor of anchors) {
      if (seen.has(anchor.sourceFactStableId)) {
        throw new ConflictException(
          `Duplicate canonical sale Journal anchor for ${anchor.sourceFactStableId}`,
        );
      }
      seen.add(anchor.sourceFactStableId);
    }
    return anchors;
  }

  async createJournalEntry(
    input: AccountingJournalCreateInput,
    operatorActorRef: string,
  ): Promise<AccountingJournalRow> {
    return this.createJournalEntryInternal(input, operatorActorRef, null);
  }

  async createCanonicalChangeJournalEntry(
    input: AccountingJournalCreateInput,
    operatorActorRef: string,
    authority: CanonicalChangeJournalWriteAuthorityV1,
  ): Promise<AccountingJournalRow> {
    const normalizedAuthority = this.applyJournalPolicy(() =>
      normalizeCanonicalChangeJournalWriteAuthority(authority),
    );
    return this.createJournalEntryInternal(
      input,
      operatorActorRef,
      normalizedAuthority,
    );
  }

  async createProviderSettlementReplacementGroup(
    input: ProviderSettlementReplacementGroupWriteInput,
    operatorActorRef: string,
    authority: ProviderSettlementReplacementGroupAuthorityV1,
  ): Promise<AccountingJournalRow[]> {
    const normalizedAuthority = this.applyJournalPolicy(() =>
      normalizeProviderSettlementReplacementGroupAuthority(authority),
    );
    const documentAuthority = this.applyJournalPolicy(() =>
      buildProviderSettlementJournalWriteAuthority({
        group: normalizedAuthority,
        role: 'PROVIDER_DOCUMENT',
      }),
    );
    const documentJournal = this.prepareProviderSettlementJournalWrite(
      input.documentJournal,
      documentAuthority,
    );
    const reversals = [...input.uberPreCutoverReversals]
      .sort((left, right) =>
        left.originalJournalEntryStableId.localeCompare(
          right.originalJournalEntryStableId,
        ),
      )
      .map((reversal) => {
        const writeAuthority = this.applyJournalPolicy(() =>
          buildProviderSettlementJournalWriteAuthority({
            group: normalizedAuthority,
            role: 'UBER_PRE_CUTOVER_REVERSAL',
            originalJournalEntryStableId: reversal.originalJournalEntryStableId,
          }),
        );
        return this.prepareProviderSettlementJournalWrite(
          reversal.journal,
          writeAuthority,
        );
      });
    const prepared = [documentJournal, ...reversals];
    const idempotencyKeys = prepared.map(
      (item) => item.normalized.idempotencyKey,
    );
    if (new Set(idempotencyKeys).size !== idempotencyKeys.length) {
      throw new BadRequestException(
        'provider settlement replacement group contains duplicate idempotency keys',
      );
    }
    if (
      reversals.length !== normalizedAuthority.historicalReversalAnchors.length
    ) {
      throw new BadRequestException(
        'provider settlement replacement group reversal count does not match its authority anchors',
      );
    }

    const operator = this.requireJournalValue(
      operatorActorRef,
      'operatorActorRef',
    );
    const timezone = await this.period.getBusinessTimezone();
    const writeGroup = (tx: Prisma.TransactionClient) =>
      this.createProviderSettlementReplacementGroupInTx(
        prepared,
        normalizedAuthority,
        operator,
        tx,
        timezone,
      );

    try {
      return await runSerializableAccountingWrite(this.prisma, writeGroup);
    } catch (error) {
      if (!this.isJournalUniqueConstraintError(error)) throw error;
      return runSerializableAccountingWrite(this.prisma, writeGroup);
    }
  }

  private async createJournalEntryInternal(
    input: AccountingJournalCreateInput,
    operatorActorRef: string,
    writeAuthority: CanonicalChangeJournalWriteAuthorityV1 | null,
  ): Promise<AccountingJournalRow> {
    const normalized = this.applyJournalPolicy(() =>
      normalizeJournalCreate(input),
    );
    if (writeAuthority) {
      this.assertCanonicalChangeJournalAuthority(normalized, writeAuthority);
    }
    const idempotencyHash = writeAuthority
      ? hashCanonicalChangeJournalWrite(normalized, writeAuthority)
      : hashJournalCreatePayload(normalized);
    const operator = this.requireJournalValue(
      operatorActorRef,
      'operatorActorRef',
    );
    const timezone = await this.period.getBusinessTimezone();
    const prepared: PreparedJournalWrite = {
      normalized,
      idempotencyHash,
      auditAuthority: writeAuthority
        ? (writeAuthority as unknown as Prisma.InputJsonValue)
        : null,
    };

    try {
      return await runSerializableAccountingWrite(this.prisma, (tx) =>
        this.createPreparedJournalEntryInTx(prepared, operator, tx, timezone),
      );
    } catch (error) {
      if (!this.isJournalUniqueConstraintError(error)) throw error;
      const existing = await this.prisma.accountingJournalEntry.findUnique({
        where: { idempotencyKey: normalized.idempotencyKey },
        select: ACCOUNTING_JOURNAL_INTERNAL_SELECT,
      });
      if (!existing) throw error;
      return this.assertJournalIdempotentReplay(existing, idempotencyHash);
    }
  }

  private async createPreparedJournalEntryInTx(
    prepared: PreparedJournalWrite,
    operator: string,
    tx: Prisma.TransactionClient,
    timezone: string,
  ): Promise<AccountingJournalRow> {
    const { normalized, idempotencyHash, auditAuthority } = prepared;
    const existing = await tx.accountingJournalEntry.findUnique({
      where: { idempotencyKey: normalized.idempotencyKey },
      select: ACCOUNTING_JOURNAL_INTERNAL_SELECT,
    });
    if (existing) {
      return this.assertJournalIdempotentReplay(existing, idempotencyHash);
    }

    await this.period.assertOnOrAfterAccountingStartDate(
      normalized.occurredAt,
      tx,
    );
    await this.period.assertJournalEditableForPeriod(
      normalized.occurredAt,
      normalized.kind,
      tx,
      timezone,
    );
    const lines = await this.resolveJournalLines(
      tx,
      normalized.currency,
      normalized.lines,
    );

    const created = await tx.accountingJournalEntry.create({
      data: {
        entryStableId: `journal_${createId()}`,
        idempotencyKey: normalized.idempotencyKey,
        idempotencyHash,
        kind: normalized.kind,
        source: normalized.source,
        sourceFactType: normalized.sourceFactType,
        sourceFactStableId: normalized.sourceFactStableId,
        sourceFactVersion: normalized.sourceFactVersion,
        storeStableId: normalized.storeStableId,
        occurredAt: normalized.occurredAt,
        currency: normalized.currency,
        memo: normalized.memo,
        createdByActorRef: operator,
        updatedByActorRef: operator,
        lines: {
          create: lines.map((line, index) => ({
            lineNo: index + 1,
            accountId: line.accountId,
            categoryId: line.categoryId,
            debitCents: line.debitCents,
            creditCents: line.creditCents,
            memo: line.memo,
          })),
        },
      },
      select: ACCOUNTING_JOURNAL_PUBLIC_SELECT,
    });

    const afterJson = auditAuthority
      ? ({
          journal: created,
          writeAuthority: auditAuthority,
        } as unknown as Prisma.InputJsonValue)
      : (created as unknown as Prisma.InputJsonValue);
    await writeAccountingAuditLog(tx, {
      action: 'CREATE',
      entityType: 'ACCOUNTING_JOURNAL_ENTRY',
      entityId: created.entryStableId,
      operatorActorRef: operator,
      afterJson,
    });
    return created;
  }

  async updateJournalEntry(
    entryStableId: string,
    input: AccountingJournalUpdateInput,
    operatorActorRef: string,
  ): Promise<AccountingJournalRow> {
    const stableId = this.requireJournalValue(entryStableId, 'entryStableId');
    const operator = this.requireJournalValue(
      operatorActorRef,
      'operatorActorRef',
    );
    const expectedUpdatedAt = this.parseDate(input.lastKnownUpdatedAt);
    if (!expectedUpdatedAt) {
      throw new BadRequestException('lastKnownUpdatedAt is required');
    }
    const normalized = this.applyJournalPolicy(() =>
      normalizeJournalUpdate(input),
    );
    const timezone = await this.period.getBusinessTimezone();

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const existing = await tx.accountingJournalEntry.findUnique({
        where: { entryStableId: stableId },
        select: ACCOUNTING_JOURNAL_INTERNAL_SELECT,
      });
      if (!existing || existing.deletedAt) {
        throw new NotFoundException('Journal entry not found');
      }
      const existingDbId = existing.id;
      const existingPublic = this.toJournalPublic(existing);

      await this.period.assertOnOrAfterAccountingStartDate(
        existingPublic.occurredAt,
        tx,
      );
      await this.period.assertOnOrAfterAccountingStartDate(
        normalized.occurredAt,
        tx,
      );
      await this.period.assertJournalEditableForPeriod(
        existingPublic.occurredAt,
        existingPublic.kind,
        tx,
        timezone,
      );
      await this.period.assertJournalEditableForPeriod(
        normalized.occurredAt,
        normalized.kind,
        tx,
        timezone,
      );
      const lines = await this.resolveJournalLines(
        tx,
        normalized.currency,
        normalized.lines,
      );
      const updatedIdempotencyHash = hashJournalCreatePayload({
        idempotencyKey: existingPublic.idempotencyKey,
        source: existingPublic.source,
        ...normalized,
      });

      const updateResult = await tx.accountingJournalEntry.updateMany({
        where: {
          entryStableId: stableId,
          deletedAt: null,
          updatedAt: expectedUpdatedAt,
        },
        data: {
          kind: normalized.kind,
          sourceFactType: normalized.sourceFactType,
          sourceFactStableId: normalized.sourceFactStableId,
          sourceFactVersion: normalized.sourceFactVersion,
          storeStableId: normalized.storeStableId,
          occurredAt: normalized.occurredAt,
          currency: normalized.currency,
          memo: normalized.memo,
          idempotencyHash: updatedIdempotencyHash,
          updatedByActorRef: operator,
          version: { increment: 1 },
        },
      });
      if (updateResult.count === 0) {
        throw new ConflictException(
          'Journal entry has been modified by another operation, please refresh and retry',
        );
      }

      await tx.accountingJournalLine.deleteMany({
        where: { entryId: existingDbId },
      });
      await tx.accountingJournalLine.createMany({
        data: lines.map((line, index) => ({
          entryId: existingDbId,
          lineNo: index + 1,
          accountId: line.accountId,
          categoryId: line.categoryId,
          debitCents: line.debitCents,
          creditCents: line.creditCents,
          memo: line.memo,
        })),
      });

      const updated = await tx.accountingJournalEntry.findUnique({
        where: { entryStableId: stableId },
        select: ACCOUNTING_JOURNAL_PUBLIC_SELECT,
      });
      if (!updated) throw new NotFoundException('Journal entry not found');

      await writeAccountingAuditLog(tx, {
        action: 'UPDATE',
        entityType: 'ACCOUNTING_JOURNAL_ENTRY',
        entityId: stableId,
        operatorActorRef: operator,
        beforeJson: existingPublic as unknown as Prisma.InputJsonValue,
        afterJson: updated as unknown as Prisma.InputJsonValue,
      });
      return updated;
    });
  }

  async deleteJournalEntry(
    entryStableId: string,
    operatorActorRef: string,
  ): Promise<{ ok: true }> {
    const stableId = this.requireJournalValue(entryStableId, 'entryStableId');
    const operator = this.requireJournalValue(
      operatorActorRef,
      'operatorActorRef',
    );
    const timezone = await this.period.getBusinessTimezone();

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const existing = await tx.accountingJournalEntry.findUnique({
        where: { entryStableId: stableId },
        select: ACCOUNTING_JOURNAL_PUBLIC_SELECT,
      });
      if (!existing || existing.deletedAt) {
        throw new NotFoundException('Journal entry not found');
      }

      await this.period.assertOnOrAfterAccountingStartDate(
        existing.occurredAt,
        tx,
      );
      await this.period.assertJournalEditableForPeriod(
        existing.occurredAt,
        existing.kind,
        tx,
        timezone,
      );

      const deleted = await tx.accountingJournalEntry.update({
        where: { entryStableId: stableId },
        data: {
          deletedAt: new Date(),
          updatedByActorRef: operator,
          version: { increment: 1 },
        },
        select: ACCOUNTING_JOURNAL_PUBLIC_SELECT,
      });

      await writeAccountingAuditLog(tx, {
        action: 'DELETE',
        entityType: 'ACCOUNTING_JOURNAL_ENTRY',
        entityId: stableId,
        operatorActorRef: operator,
        beforeJson: existing as unknown as Prisma.InputJsonValue,
        afterJson: deleted as unknown as Prisma.InputJsonValue,
      });
      return { ok: true };
    });
  }

  private async resolveJournalLines(
    db: AccountingDbClient,
    currency: string,
    lines: NormalizedJournalLine[],
  ): Promise<ResolvedJournalLine[]> {
    const accountStableIds = [
      ...new Set(lines.map((line) => line.accountStableId)),
    ];
    const categoryStableIds = [
      ...new Set(
        lines
          .map((line) => line.categoryStableId)
          .filter((value): value is string => value !== null),
      ),
    ];
    const accounts = await db.accountingAccount.findMany({
      where: {
        accountStableId: { in: accountStableIds },
        isActive: true,
      },
      select: {
        id: true,
        accountStableId: true,
        currency: true,
      },
    });
    const categories = categoryStableIds.length
      ? await db.accountingCategory.findMany({
          where: {
            categoryStableId: { in: categoryStableIds },
            isActive: true,
          },
          select: { id: true, categoryStableId: true },
        })
      : [];

    const accountByStableId = new Map(
      accounts.map((account) => [account.accountStableId, account]),
    );
    const categoryByStableId = new Map(
      categories.map((category) => [category.categoryStableId, category]),
    );

    return lines.map((line) => {
      const account = accountByStableId.get(line.accountStableId);
      if (!account) {
        throw new BadRequestException(
          `accountStableId is inactive or invalid: ${line.accountStableId}`,
        );
      }
      if (account.currency !== currency) {
        throw new BadRequestException(
          `account currency mismatch for ${line.accountStableId}`,
        );
      }
      const category = line.categoryStableId
        ? categoryByStableId.get(line.categoryStableId)
        : null;
      if (line.categoryStableId && !category) {
        throw new BadRequestException(
          `categoryStableId is inactive or invalid: ${line.categoryStableId}`,
        );
      }
      return {
        ...line,
        accountId: account.id,
        categoryId: category?.id ?? null,
      };
    });
  }

  private toJournalPublic(
    existing: AccountingJournalInternalRow,
  ): AccountingJournalRow {
    const { id, idempotencyHash, ...publicRow } = existing;
    void id;
    void idempotencyHash;
    return publicRow;
  }

  private assertJournalIdempotentReplay(
    existing: AccountingJournalInternalRow,
    requestedHash: string,
  ): AccountingJournalRow {
    if (existing.idempotencyHash !== requestedHash) {
      throw new ConflictException(
        'idempotencyKey is already bound to different journal content or write authority',
      );
    }
    return this.toJournalPublic(existing);
  }

  private prepareProviderSettlementJournalWrite(
    input: AccountingJournalCreateInput,
    authority: ProviderSettlementJournalWriteAuthorityV1,
  ): PreparedJournalWrite {
    const normalized = this.applyJournalPolicy(() =>
      normalizeJournalCreate(input),
    );
    this.assertProviderSettlementJournalAuthority(normalized, authority);
    return {
      normalized,
      idempotencyHash: hashProviderSettlementJournalWrite(
        normalized,
        authority,
      ),
      auditAuthority: authority as unknown as Prisma.InputJsonValue,
    };
  }

  private async createProviderSettlementReplacementGroupInTx(
    prepared: PreparedJournalWrite[],
    authority: ProviderSettlementReplacementGroupAuthorityV1,
    operator: string,
    tx: Prisma.TransactionClient,
    timezone: string,
  ): Promise<AccountingJournalRow[]> {
    await this.assertProviderSettlementAuthorityInTx(authority, tx);
    await this.assertProviderSettlementHistoricalAnchorsInTx(authority, tx);

    const existing = await tx.accountingJournalEntry.findMany({
      where: {
        idempotencyKey: {
          in: prepared.map((item) => item.normalized.idempotencyKey),
        },
      },
      select: ACCOUNTING_JOURNAL_INTERNAL_SELECT,
    });
    if (existing.length > 0 && existing.length !== prepared.length) {
      throw new ConflictException(
        'provider settlement replacement group is only partially persisted; review the existing Journals before retrying',
      );
    }
    if (existing.length === prepared.length) {
      const existingByKey = new Map(
        existing.map((journal) => [journal.idempotencyKey, journal] as const),
      );
      return prepared.map((item) => {
        const replay = existingByKey.get(item.normalized.idempotencyKey);
        if (!replay) {
          throw new ConflictException(
            'provider settlement replacement group replay is missing an expected Journal',
          );
        }
        return this.assertJournalIdempotentReplay(replay, item.idempotencyHash);
      });
    }

    const rows: AccountingJournalRow[] = [];
    for (const item of prepared) {
      rows.push(
        await this.createPreparedJournalEntryInTx(item, operator, tx, timezone),
      );
    }
    return rows;
  }

  private async assertProviderSettlementAuthorityInTx(
    authority: ProviderSettlementReplacementGroupAuthorityV1,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const document = await tx.accountingProviderFinancialDocument.findUnique({
      where: { documentStableId: authority.documentStableId },
      select: {
        documentStableId: true,
        provider: true,
        documentType: true,
        businessIdentityKey: true,
        revision: true,
        storeStableId: true,
        providerDocumentRef: true,
        periodStart: true,
        periodEnd: true,
        currency: true,
        artifact: {
          select: {
            inboxItem: {
              select: {
                inboxItemStableId: true,
                status: true,
                materializedEntityType: true,
                materializedEntityStableId: true,
                reviewedAt: true,
                reviewedByUserStableId: true,
                version: true,
              },
            },
          },
        },
      },
    });
    const latestRevision =
      await tx.accountingProviderFinancialDocument.findFirst({
        where: {
          provider: authority.provider,
          documentType: authority.documentType,
          businessIdentityKey: authority.businessIdentityKey,
        },
        orderBy: { revision: 'desc' },
        select: { documentStableId: true, revision: true },
      });
    const review = document?.artifact.inboxItem ?? null;
    const dateOnly = (value: Date | null): string | null =>
      value?.toISOString().slice(0, 10) ?? null;
    if (
      !document ||
      document.provider !== authority.provider ||
      document.documentType !== authority.documentType ||
      document.businessIdentityKey !== authority.businessIdentityKey ||
      document.revision !== authority.revision ||
      document.storeStableId !== authority.storeStableId ||
      document.providerDocumentRef !== authority.providerDocumentRef ||
      dateOnly(document.periodStart) !== authority.periodStart ||
      dateOnly(document.periodEnd) !== authority.periodEnd ||
      document.currency !== 'CAD' ||
      latestRevision?.documentStableId !== authority.documentStableId ||
      latestRevision?.revision !== authority.revision ||
      !review ||
      review.inboxItemStableId !== authority.reviewEvidence.inboxItemStableId ||
      review.status !== authority.reviewEvidence.status ||
      review.materializedEntityType !==
        authority.reviewEvidence.materializedEntityType ||
      review.materializedEntityStableId !==
        authority.reviewEvidence.materializedEntityStableId ||
      review.reviewedAt?.toISOString() !==
        authority.reviewEvidence.reviewedAt ||
      review.reviewedByUserStableId !==
        authority.reviewEvidence.reviewedByUserStableId ||
      review.version !== authority.reviewEvidence.version
    ) {
      throw new ConflictException(
        'provider settlement document/review authority changed after preview',
      );
    }

    const coverage = await tx.accountingProviderFinancialCoverage.findFirst({
      where: {
        provider: authority.provider,
        storeStableId: authority.storeStableId,
      },
      select: {
        coverageStableId: true,
        financialHistoryRequiredFrom: true,
        financialCompleteThrough: true,
        liveOrderFactCutoverAt: true,
        orderDetailCoverageFrom: true,
        updatedAt: true,
      },
    });
    if (
      !coverage ||
      coverage.coverageStableId !==
        authority.coverageEvidence.coverageStableId ||
      dateOnly(coverage.financialHistoryRequiredFrom) !==
        authority.coverageEvidence.financialHistoryRequiredFrom ||
      dateOnly(coverage.financialCompleteThrough) !==
        authority.coverageEvidence.financialCompleteThrough ||
      (coverage.liveOrderFactCutoverAt?.toISOString() ?? null) !==
        authority.coverageEvidence.liveOrderFactCutoverAt ||
      dateOnly(coverage.orderDetailCoverageFrom) !==
        authority.coverageEvidence.orderDetailCoverageFrom ||
      coverage.updatedAt.toISOString() !== authority.coverageEvidence.updatedAt
    ) {
      throw new ConflictException(
        'provider settlement coverage authority changed after preview',
      );
    }

    const currentAccounts = await tx.accountingAccount.findMany({
      where: {
        accountStableId: {
          in: authority.accountPrerequisites.map(
            (account) => account.accountStableId,
          ),
        },
      },
      select: {
        accountStableId: true,
        accountClass: true,
        currency: true,
        isActive: true,
      },
    });
    const currentByStableId = new Map(
      currentAccounts.map(
        (account) => [account.accountStableId, account] as const,
      ),
    );
    for (const prerequisite of authority.accountPrerequisites) {
      const current = currentByStableId.get(prerequisite.accountStableId);
      if (
        !current ||
        current.accountClass !== prerequisite.actual.accountClass ||
        current.currency !== prerequisite.actual.currency ||
        current.isActive !== prerequisite.actual.isActive
      ) {
        throw new ConflictException(
          `provider settlement account authority changed after preview: ${prerequisite.accountStableId}`,
        );
      }
    }
  }

  private async assertProviderSettlementHistoricalAnchorsInTx(
    authority: ProviderSettlementReplacementGroupAuthorityV1,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (authority.historicalReversalAnchors.length === 0) return;
    const rows = await tx.accountingJournalEntry.findMany({
      where: {
        entryStableId: {
          in: authority.historicalReversalAnchors.map(
            (anchor) => anchor.originalJournalEntryStableId,
          ),
        },
      },
      select: {
        entryStableId: true,
        idempotencyKey: true,
        idempotencyHash: true,
        version: true,
        source: true,
        sourceFactType: true,
        sourceFactStableId: true,
        deletedAt: true,
      },
    });
    const byStableId = new Map(
      rows.map((row) => [row.entryStableId, row] as const),
    );
    for (const anchor of authority.historicalReversalAnchors) {
      const current = byStableId.get(anchor.originalJournalEntryStableId);
      if (
        !current ||
        current.deletedAt !== null ||
        current.source !== AccountingJournalSource.ORDER ||
        current.sourceFactType !== CANONICAL_SALE_SOURCE_FACT_TYPE ||
        current.sourceFactStableId !== anchor.sourceFactStableId ||
        current.idempotencyKey !== anchor.idempotencyKey ||
        current.idempotencyHash !== anchor.idempotencyHash ||
        current.version !== anchor.version
      ) {
        throw new ConflictException(
          `historical Uber SALE Journal authority changed after preview: ${anchor.originalJournalEntryStableId}`,
        );
      }
    }
  }

  private assertProviderSettlementJournalAuthority(
    journal: NormalizedJournalCreate,
    authority: ProviderSettlementJournalWriteAuthorityV1,
  ): void {
    const group = authority.group;
    if (authority.role === 'PROVIDER_DOCUMENT') {
      const expectedKey = `provider-settlement:${group.documentStableId}:r${group.revision}:v1`;
      if (
        journal.kind !== AccountingJournalEntryKind.ADJUSTMENT ||
        journal.source !== AccountingJournalSource.PLATFORM_STATEMENT ||
        journal.sourceFactType !== PROVIDER_FINANCIAL_SOURCE_FACT_TYPE ||
        journal.sourceFactStableId !== group.documentStableId ||
        journal.sourceFactVersion !== group.revision ||
        journal.storeStableId !== group.storeStableId ||
        journal.currency !== 'CAD' ||
        journal.idempotencyKey !== expectedKey
      ) {
        throw new BadRequestException(
          'provider settlement document authority does not match the Journal source identity',
        );
      }
      return;
    }

    const originalJournalEntryStableId = authority.originalJournalEntryStableId;
    const expectedKey = `uber-pre-cutover-order-reversal:${originalJournalEntryStableId}:v1`;
    if (
      !originalJournalEntryStableId ||
      journal.kind !== AccountingJournalEntryKind.ADJUSTMENT ||
      journal.source !== AccountingJournalSource.SYSTEM ||
      journal.sourceFactType !== UBER_PRE_CUTOVER_REVERSAL_SOURCE_FACT_TYPE ||
      journal.sourceFactStableId !== originalJournalEntryStableId ||
      journal.sourceFactVersion !== 1 ||
      journal.storeStableId !== group.storeStableId ||
      journal.currency !== 'CAD' ||
      journal.idempotencyKey !== expectedKey
    ) {
      throw new BadRequestException(
        'provider settlement reversal authority does not match the Journal source identity',
      );
    }
  }

  private assertCanonicalChangeJournalAuthority(
    journal: NormalizedJournalCreate,
    authority: CanonicalChangeJournalWriteAuthorityV1,
  ): void {
    const expectedIdempotencyKey = `${
      authority.changeFactType === 'order.financial_reversal.v1'
        ? 'canonical-reversal'
        : 'canonical-adjustment'
    }:${authority.changeFactStableId}:v1`;
    if (
      journal.kind !== AccountingJournalEntryKind.ADJUSTMENT ||
      journal.source !== AccountingJournalSource.ORDER ||
      journal.sourceFactType !== authority.changeFactType ||
      journal.sourceFactStableId !== authority.changeFactStableId ||
      journal.sourceFactVersion !== 1 ||
      journal.idempotencyKey !== expectedIdempotencyKey
    ) {
      throw new BadRequestException(
        'canonical change write authority does not match the Journal source identity',
      );
    }
  }

  private applyJournalPolicy<T>(work: () => T): T {
    try {
      return work();
    } catch (error) {
      if (error instanceof AccountingJournalPolicyError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private requireJournalValue(raw: string, field: string): string {
    const value = raw?.trim();
    if (!value) throw new BadRequestException(`${field} is required`);
    return value;
  }

  private parseDate(raw: string | undefined): Date | undefined {
    if (!raw) return undefined;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid date: ${raw}`);
    }
    if (raw.length <= 10) {
      date.setHours(0, 0, 0, 0);
    }
    return date;
  }

  private isJournalUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }
}
