import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingDocumentStatus,
  AccountingJournalSource,
  AccountingTxType,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  ACCOUNTING_EXPENSE_CORRECTION_TARGET_SCHEMA,
  AccountingExpenseCorrectionTargetPolicyError,
  applyAccountingExpenseCorrectionTargetInput,
  hashAccountingExpenseCorrectionTarget,
  normalizeAccountingExpenseCorrectionTarget,
  toAccountingExpenseCorrectionDraftInput,
  type AccountingExpenseCorrectionTargetV1,
} from './accounting-expense-correction-target.policy';
import {
  buildCanonicalExpenseJournal,
  buildCanonicalExpenseJournalsV2,
  CANONICAL_EXPENSE_SOURCE_FACT_TYPE,
  CANONICAL_EXPENSE_SOURCE_FACT_TYPE_V2,
  CanonicalExpenseJournalPolicyError,
  type CanonicalExpenseFactV1,
  type CanonicalExpenseFactV2,
} from './accounting-expense-journal.policy';
import {
  assertCanonicalExpenseJournalAuthority,
  hashCanonicalExpenseJournalWrite,
  hashCanonicalExpenseJournalWriteAuthority,
  normalizeCanonicalExpenseJournalWriteAuthority,
  type CanonicalExpenseJournalWriteAuthority,
  type CanonicalExpenseJournalWriteAuthorityV1,
  type CanonicalExpenseJournalWriteAuthorityV2,
} from './accounting-expense-journal-write-authority';
import { hashAccountingJson } from './accounting-inbox-core.policy';
import {
  AccountingJournalPolicyError,
  normalizeJournalCreate,
  type AccountingJournalCreateInput,
} from './accounting-journal-policy';
import {
  AccountingPostedCorrectionReasonCode,
  AccountingPostedCorrectionStrategy,
  AccountingPostedCorrectionTargetKind,
  type AccountingPostedCorrectionPostedJournalAnchorV1,
} from './accounting-posted-financial-correction.contract';
import {
  accountingPostedCorrectionTargetKey,
  readAccountingPostedCorrectionProjections,
} from './accounting-posted-correction-read-model';
import type {
  AccountingPostedCorrectionOwnerActivationInputV1,
  AccountingPostedCorrectionOwnerDbClient,
  AccountingPostedCorrectionOwnerReadyTargetV1,
  AccountingPostedCorrectionOwnerRevisionTargetV1,
  AccountingPostedCorrectionOwnerTargetInputV1,
  AccountingPostedFinancialCorrectionOwnerAdapter,
} from './accounting-posted-financial-correction-owner-adapter';

const EXPENSE_DOCUMENT_SELECT = {
  documentStableId: true,
  status: true,
  fundingAttributionVersion: true,
  occurredAt: true,
  subtotalCents: true,
  taxCents: true,
  totalCents: true,
  currency: true,
  memo: true,
  splits: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    select: {
      splitStableId: true,
      amountCents: true,
      taxCents: true,
      category: {
        select: {
          categoryStableId: true,
        },
      },
      paidFromAccount: {
        select: {
          accountStableId: true,
          accountClass: true,
          type: true,
          currency: true,
          isActive: true,
        },
      },
    },
  },
  paymentAllocations: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    select: {
      paymentAllocationStableId: true,
      amountCents: true,
      account: {
        select: {
          accountStableId: true,
          currency: true,
          isActive: true,
        },
      },
    },
  },
} satisfies Prisma.AccountingExpenseDocumentSelect;

type ExpenseDocumentRow = Prisma.AccountingExpenseDocumentGetPayload<{
  select: typeof EXPENSE_DOCUMENT_SELECT;
}>;

const JOURNAL_SELECT = {
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
        select: {
          accountStableId: true,
        },
      },
      category: {
        select: {
          categoryStableId: true,
        },
      },
    },
  },
} satisfies Prisma.AccountingJournalEntrySelect;

type JournalRow = Prisma.AccountingJournalEntryGetPayload<{
  select: typeof JOURNAL_SELECT;
}>;

type ExpensePostingAuthorityRow = {
  journal: JournalRow;
  authority: CanonicalExpenseJournalWriteAuthority;
};

type OriginalPostingContext = {
  document: ExpenseDocumentRow;
  sourceTarget: AccountingExpenseCorrectionTargetV1;
  sourcePostingAuthorityHash: string;
  originalJournals: AccountingPostedCorrectionPostedJournalAnchorV1[];
};

type CurrentBusinessAuthority = {
  context: OriginalPostingContext;
  baseTarget: AccountingExpenseCorrectionTargetV1;
  baseAuthorityHash: string;
};

const jsonRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const requireTargetStableId = (raw: string): string => {
  const value = raw?.trim();
  if (!value) throw new BadRequestException('targetStableId is required');
  if (value.length > 250) {
    throw new BadRequestException(
      'targetStableId must not exceed 250 characters',
    );
  }
  return value;
};

const requireTargetVersion = (raw: number): 1 | 2 => {
  if (raw !== 1 && raw !== 2) {
    throw new BadRequestException(
      'Expense correction targetVersion must be 1 or 2',
    );
  }
  return raw;
};

const journalToCreateInput = (
  journal: JournalRow,
): AccountingJournalCreateInput => ({
  idempotencyKey: journal.idempotencyKey,
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
    accountStableId: line.account.accountStableId,
    categoryStableId: line.category?.categoryStableId ?? null,
    debitCents: line.debitCents,
    creditCents: line.creditCents,
    memo: line.memo,
  })),
});

const journalToAnchor = (
  journal: JournalRow,
): AccountingPostedCorrectionPostedJournalAnchorV1 => ({
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
});

const assertSameImmutableIdentity = (
  source: AccountingExpenseCorrectionTargetV1,
  target: AccountingExpenseCorrectionTargetV1,
): void => {
  if (
    source.document.documentStableId !== target.document.documentStableId ||
    source.document.fundingAttributionVersion !==
      target.document.fundingAttributionVersion ||
    source.document.occurredAt !== target.document.occurredAt ||
    source.document.currency !== target.document.currency ||
    source.document.sourcePostingAuthorityHash !==
      target.document.sourcePostingAuthorityHash
  ) {
    throw new ConflictException(
      'normal Expense DELTA correction cannot change document identity, booking date, currency, funding version, or source posting authority',
    );
  }
};

const targetToFactV1 = (
  target: AccountingExpenseCorrectionTargetV1,
): CanonicalExpenseFactV1 => ({
  version: 1,
  documentStableId: target.document.documentStableId,
  occurredAt: target.document.occurredAt,
  currency: target.document.currency,
  subtotalCents: target.document.subtotalCents,
  taxCents: target.document.taxCents,
  totalCents: target.document.totalCents,
  memo: target.document.memo,
  splits: target.splits.map((split) => ({
    categoryStableId: split.categoryStableId,
    amountCents: split.amountCents,
    taxCents: split.taxCents,
  })),
  paymentAllocations: target.paymentAllocations.map((allocation) => ({
    accountStableId: allocation.accountStableId,
    amountCents: allocation.amountCents,
  })),
});

const targetToFactV2 = (
  target: AccountingExpenseCorrectionTargetV1,
): CanonicalExpenseFactV2 => {
  if (target.splits.some((split) => !split.paidFromAccountStableId)) {
    throw new ConflictException(
      'Expense v2 correction requires complete split funding before READY',
    );
  }
  return {
    version: 2,
    documentStableId: target.document.documentStableId,
    occurredAt: target.document.occurredAt,
    currency: target.document.currency,
    subtotalCents: target.document.subtotalCents,
    taxCents: target.document.taxCents,
    totalCents: target.document.totalCents,
    memo: target.document.memo,
    splits: target.splits.map((split) => ({
      splitStableId: split.splitStableId,
      categoryStableId: split.categoryStableId,
      paidFromAccountStableId: split.paidFromAccountStableId!,
      amountCents: split.amountCents,
      taxCents: split.taxCents,
    })),
  };
};

@Injectable()
export class AccountingExpenseCorrectionAdapter implements AccountingPostedFinancialCorrectionOwnerAdapter {
  readonly targetKind = AccountingPostedCorrectionTargetKind.EXPENSE;

  constructor(@Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb) {}

  async readCurrentEffectiveTarget(
    targetStableIdRaw: string,
    targetVersionRaw: number,
  ) {
    const targetStableId = requireTargetStableId(targetStableIdRaw);
    const targetVersion = requireTargetVersion(targetVersionRaw);
    const current = await this.readCurrentBusinessAuthority(
      targetStableId,
      targetVersion,
      this.prisma,
    );
    return {
      version: 1 as const,
      targetKind: this.targetKind,
      targetStableId,
      targetVersion,
      targetAuthoritySchema: ACCOUNTING_EXPENSE_CORRECTION_TARGET_SCHEMA,
      targetAuthorityHash: current.baseAuthorityHash,
      targetJson: current.baseTarget,
      draftInput: toAccountingExpenseCorrectionDraftInput(current.baseTarget),
    };
  }

  async normalizeRevisionTarget(
    input: AccountingPostedCorrectionOwnerTargetInputV1,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<AccountingPostedCorrectionOwnerRevisionTargetV1> {
    if (
      input.reasonCode ===
      AccountingPostedCorrectionReasonCode.DUPLICATE_POSTING
    ) {
      throw new BadRequestException(
        'Expense correction C1 normal DELTA does not support DUPLICATE_POSTING; use a future REVERSAL_ONLY flow',
      );
    }
    const current = await this.readCurrentBusinessAuthority(
      requireTargetStableId(input.targetStableId),
      requireTargetVersion(input.targetVersion),
      db,
    );
    let target: AccountingExpenseCorrectionTargetV1;
    try {
      target = applyAccountingExpenseCorrectionTargetInput({
        base: current.baseTarget,
        input: input.targetJson,
      });
    } catch (error) {
      if (error instanceof AccountingExpenseCorrectionTargetPolicyError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    assertSameImmutableIdentity(current.context.sourceTarget, target);
    await this.assertChangedDimensionsAreValid(current.baseTarget, target, db);

    return {
      version: 1,
      targetKind: this.targetKind,
      targetStableId: input.targetStableId,
      targetVersion: input.targetVersion,
      targetAuthoritySchema: ACCOUNTING_EXPENSE_CORRECTION_TARGET_SCHEMA,
      targetAuthorityHash: hashAccountingExpenseCorrectionTarget(target),
      targetJson: target as unknown as Prisma.InputJsonValue,
    };
  }

  async resolveReadyTarget(
    input: AccountingPostedCorrectionOwnerTargetInputV1,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<AccountingPostedCorrectionOwnerReadyTargetV1> {
    if (
      input.reasonCode ===
      AccountingPostedCorrectionReasonCode.DUPLICATE_POSTING
    ) {
      throw new ConflictException(
        'Expense correction C1 normal DELTA does not support DUPLICATE_POSTING; use a future REVERSAL_ONLY flow',
      );
    }
    const current = await this.readCurrentBusinessAuthority(
      requireTargetStableId(input.targetStableId),
      requireTargetVersion(input.targetVersion),
      db,
    );
    let target: AccountingExpenseCorrectionTargetV1;
    try {
      target = normalizeAccountingExpenseCorrectionTarget(
        input.targetJson as AccountingExpenseCorrectionTargetV1,
      );
    } catch (error) {
      if (error instanceof AccountingExpenseCorrectionTargetPolicyError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
    assertSameImmutableIdentity(current.context.sourceTarget, target);
    if (target.basedOnAuthorityHash !== current.baseAuthorityHash) {
      throw new ConflictException(
        'Expense correction target was edited from a stale current-effective authority; create a new Revision',
      );
    }
    try {
      await this.assertChangedDimensionsAreValid(
        current.baseTarget,
        target,
        db,
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
    await this.assertTargetDimensionsExist(target, db);

    let targetJournals: AccountingJournalCreateInput[];
    try {
      targetJournals =
        target.document.fundingAttributionVersion === 1
          ? [buildCanonicalExpenseJournal(targetToFactV1(target))]
          : buildCanonicalExpenseJournalsV2(targetToFactV2(target));
    } catch (error) {
      if (error instanceof CanonicalExpenseJournalPolicyError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }

    return {
      version: 1,
      targetKind: this.targetKind,
      targetStableId: input.targetStableId,
      targetVersion: input.targetVersion,
      targetAuthoritySchema: ACCOUNTING_EXPENSE_CORRECTION_TARGET_SCHEMA,
      targetAuthorityHash: hashAccountingExpenseCorrectionTarget(target),
      targetJson: target as unknown as Prisma.InputJsonValue,
      strategy: AccountingPostedCorrectionStrategy.DELTA,
      baseAuthoritySchema: ACCOUNTING_EXPENSE_CORRECTION_TARGET_SCHEMA,
      baseAuthorityHash: current.baseAuthorityHash,
      currency: target.document.currency,
      originalJournals: current.context.originalJournals,
      targetJournals,
    };
  }

  async activateTargetInTx(
    input: AccountingPostedCorrectionOwnerActivationInputV1,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (
      input.targetAuthoritySchema !==
      ACCOUNTING_EXPENSE_CORRECTION_TARGET_SCHEMA
    ) {
      throw new ConflictException(
        'Expense correction activation received an unexpected target schema',
      );
    }
    const target = normalizeAccountingExpenseCorrectionTarget(
      input.targetJson as AccountingExpenseCorrectionTargetV1,
    );
    if (
      hashAccountingExpenseCorrectionTarget(target) !==
      input.targetAuthorityHash
    ) {
      throw new ConflictException(
        'Expense correction activation target hash changed before POSTED',
      );
    }
    if (
      target.document.documentStableId !== input.targetStableId ||
      target.document.fundingAttributionVersion !== input.targetVersion
    ) {
      throw new ConflictException(
        'Expense correction activation target identity changed before POSTED',
      );
    }
    const current = await this.readCurrentBusinessAuthority(
      input.targetStableId,
      input.targetVersion,
      tx,
    );
    if (target.basedOnAuthorityHash !== current.baseAuthorityHash) {
      throw new ConflictException(
        'Expense correction current-effective authority changed before POSTED',
      );
    }
    assertSameImmutableIdentity(current.context.sourceTarget, target);
    // The original confirmed ExpenseDocument and ExpenseSplit rows remain immutable.
    // The POSTED Correction Case + ready Revision is the current-effective authority.
  }

  private async readCurrentBusinessAuthority(
    targetStableId: string,
    targetVersion: 1 | 2,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<CurrentBusinessAuthority> {
    const context = await this.readOriginalPostingContext(
      targetStableId,
      targetVersion,
      db,
    );
    const ref = {
      targetKind: AccountingPostedCorrectionTargetKind.EXPENSE,
      targetStableId,
      targetVersion,
    } as const;
    const projections = await readAccountingPostedCorrectionProjections(db, [
      ref,
    ]);
    const latest = projections.get(
      accountingPostedCorrectionTargetKey(ref),
    )?.latestPostedAuthority;

    if (!latest) {
      return {
        context,
        baseTarget: context.sourceTarget,
        baseAuthorityHash: hashAccountingExpenseCorrectionTarget(
          context.sourceTarget,
        ),
      };
    }
    if (
      latest.targetAuthoritySchema !==
      ACCOUNTING_EXPENSE_CORRECTION_TARGET_SCHEMA
    ) {
      throw new ConflictException(
        'latest POSTED Expense correction has an unsupported target schema',
      );
    }

    let target: AccountingExpenseCorrectionTargetV1;
    try {
      target = normalizeAccountingExpenseCorrectionTarget(
        latest.targetJson as AccountingExpenseCorrectionTargetV1,
      );
    } catch (error) {
      if (error instanceof AccountingExpenseCorrectionTargetPolicyError) {
        throw new ConflictException(
          'latest POSTED Expense correction target is invalid: ' +
            error.message,
        );
      }
      throw error;
    }
    const authorityHash = hashAccountingExpenseCorrectionTarget(target);
    if (latest.targetAuthorityHash !== authorityHash) {
      throw new ConflictException(
        'latest POSTED Expense correction authority hash is inconsistent',
      );
    }
    assertSameImmutableIdentity(context.sourceTarget, target);
    return {
      context,
      baseTarget: target,
      baseAuthorityHash: authorityHash,
    };
  }

  private async readOriginalPostingContext(
    targetStableId: string,
    targetVersion: 1 | 2,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<OriginalPostingContext> {
    const document = await db.accountingExpenseDocument.findUnique({
      where: { documentStableId: targetStableId },
      select: EXPENSE_DOCUMENT_SELECT,
    });
    if (!document) throw new NotFoundException('Expense document not found');
    if (document.status !== AccountingDocumentStatus.CONFIRMED) {
      throw new ConflictException('Expense document is not confirmed');
    }
    if ((document.fundingAttributionVersion ?? 1) !== targetVersion) {
      throw new ConflictException(
        'Expense correction targetVersion does not match persisted funding authority',
      );
    }

    const journals = await db.accountingJournalEntry.findMany({
      where: {
        source: AccountingJournalSource.EXPENSE_DOCUMENT,
        sourceFactStableId: targetStableId,
        deletedAt: null,
      },
      select: JOURNAL_SELECT,
      orderBy: [{ idempotencyKey: 'asc' }, { entryStableId: 'asc' }],
    });
    if (journals.length === 0) {
      throw new ConflictException(
        'Expense correction requires an already-posted canonical Expense Journal',
      );
    }
    const expectedSourceFactType =
      targetVersion === 1
        ? CANONICAL_EXPENSE_SOURCE_FACT_TYPE
        : CANONICAL_EXPENSE_SOURCE_FACT_TYPE_V2;
    if (
      journals.some(
        (journal) =>
          journal.sourceFactType !== expectedSourceFactType ||
          journal.sourceFactVersion !== targetVersion,
      )
    ) {
      throw new ConflictException(
        'Expense correction found mixed or unsupported canonical source authority',
      );
    }

    const authorityRows: ExpensePostingAuthorityRow[] = [];
    for (const journal of journals) {
      authorityRows.push({
        journal,
        authority: await this.readAndValidateJournalAuthority(
          journal,
          targetStableId,
          targetVersion,
          db,
        ),
      });
    }
    this.assertCompleteOriginalAuthoritySet(authorityRows, targetVersion);

    const sourcePostingAuthorityHash = hashAccountingJson(
      authorityRows
        .map(({ journal, authority }) => ({
          entryStableId: journal.entryStableId,
          authorityHash: hashCanonicalExpenseJournalWriteAuthority(authority),
        }))
        .sort((left, right) =>
          left.entryStableId.localeCompare(right.entryStableId),
        ),
    );
    const sourceTarget = this.buildSourceTarget(
      authorityRows,
      sourcePostingAuthorityHash,
      targetVersion,
    );
    this.assertPersistedDocumentMatchesSourceTarget(document, sourceTarget);

    return {
      document,
      sourceTarget,
      sourcePostingAuthorityHash,
      originalJournals: journals.map(journalToAnchor),
    };
  }

  private async readAndValidateJournalAuthority(
    journal: JournalRow,
    targetStableId: string,
    targetVersion: 1 | 2,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<CanonicalExpenseJournalWriteAuthority> {
    if (journal.deletedAt) {
      throw new ConflictException(
        'original canonical Expense Journal was deleted',
      );
    }
    const audit = await db.accountingAuditLog.findFirst({
      where: {
        action: 'CREATE',
        entityType: 'ACCOUNTING_JOURNAL_ENTRY',
        entityId: journal.entryStableId,
      },
      orderBy: { createdAt: 'asc' },
      select: { afterJson: true },
    });
    const writeAuthority = jsonRecord(
      jsonRecord(audit?.afterJson).writeAuthority,
    );
    let authority: CanonicalExpenseJournalWriteAuthority;
    try {
      authority = normalizeCanonicalExpenseJournalWriteAuthority(
        writeAuthority as unknown as CanonicalExpenseJournalWriteAuthority,
      );
      const normalizedJournal = normalizeJournalCreate(
        journalToCreateInput(journal),
      );
      assertCanonicalExpenseJournalAuthority(normalizedJournal, authority);
      if (
        hashCanonicalExpenseJournalWrite(normalizedJournal, authority) !==
        journal.idempotencyHash
      ) {
        throw new AccountingJournalPolicyError(
          'canonical Expense Journal idempotency authority hash mismatch',
        );
      }
    } catch (error) {
      if (error instanceof AccountingJournalPolicyError) {
        throw new ConflictException(
          'original canonical Expense Journal is missing valid typed CREATE authority: ' +
            error.message,
        );
      }
      throw error;
    }
    if (
      authority.version !== targetVersion ||
      authority.fact.documentStableId !== targetStableId
    ) {
      throw new ConflictException(
        'original canonical Expense Journal authority targets a different Expense fact',
      );
    }
    return authority;
  }

  private assertCompleteOriginalAuthoritySet(
    rows: ExpensePostingAuthorityRow[],
    targetVersion: 1 | 2,
  ): void {
    if (targetVersion === 1) {
      if (rows.length !== 1 || rows[0]?.authority.version !== 1) {
        throw new ConflictException(
          'Expense v1 correction requires exactly one canonical Expense Journal authority',
        );
      }
      return;
    }
    if (rows.some((row) => row.authority.version !== 2)) {
      throw new ConflictException(
        'Expense v2 correction requires only v2 canonical Expense authorities',
      );
    }
    const authorities = rows.map(
      (row) => row.authority as CanonicalExpenseJournalWriteAuthorityV2,
    );
    const factHash = hashAccountingJson(authorities[0]?.fact ?? {});
    if (
      authorities.some(
        (authority) => hashAccountingJson(authority.fact) !== factHash,
      )
    ) {
      throw new ConflictException(
        'Expense v2 original Journal groups disagree on canonical fact authority',
      );
    }
    const expectedFunding = new Set(
      (authorities[0]?.fact.splits ?? []).map(
        (split) => split.paidFromAccountStableId,
      ),
    );
    const actualFunding = new Set(
      authorities.map((authority) => authority.fundingAccountStableId),
    );
    if (
      rows.length !== actualFunding.size ||
      expectedFunding.size !== actualFunding.size ||
      [...expectedFunding].some(
        (accountStableId) => !actualFunding.has(accountStableId),
      )
    ) {
      throw new ConflictException(
        'Expense v2 original Journal groups do not cover every funding account exactly once',
      );
    }
  }

  private buildSourceTarget(
    rows: ExpensePostingAuthorityRow[],
    sourcePostingAuthorityHash: string,
    targetVersion: 1 | 2,
  ): AccountingExpenseCorrectionTargetV1 {
    const first = rows[0]?.authority;
    if (!first) {
      throw new ConflictException(
        'Expense source posting authority is missing',
      );
    }
    if (targetVersion === 1) {
      const authority = first as CanonicalExpenseJournalWriteAuthorityV1;
      return normalizeAccountingExpenseCorrectionTarget({
        version: 1,
        document: {
          documentStableId: authority.fact.documentStableId,
          fundingAttributionVersion: 1,
          occurredAt: authority.fact.occurredAt,
          currency: authority.fact.currency,
          subtotalCents: authority.fact.subtotalCents,
          taxCents: authority.fact.taxCents,
          totalCents: authority.fact.totalCents,
          memo: authority.fact.memo,
          sourcePostingAuthorityHash,
        },
        basedOnAuthorityHash: sourcePostingAuthorityHash,
        splits: authority.fact.splits.map((split, index) => ({
          splitStableId: authority.splitStableIds[index],
          categoryStableId: split.categoryStableId,
          amountCents: split.amountCents,
          taxCents: split.taxCents,
          paidFromAccountStableId: null,
        })),
        paymentAllocations: authority.fact.paymentAllocations.map(
          (allocation, index) => ({
            paymentAllocationStableId:
              authority.paymentAllocationStableIds[index],
            accountStableId: allocation.accountStableId,
            amountCents: allocation.amountCents,
          }),
        ),
      });
    }

    const authority = first as CanonicalExpenseJournalWriteAuthorityV2;
    return normalizeAccountingExpenseCorrectionTarget({
      version: 1,
      document: {
        documentStableId: authority.fact.documentStableId,
        fundingAttributionVersion: 2,
        occurredAt: authority.fact.occurredAt,
        currency: authority.fact.currency,
        subtotalCents: authority.fact.subtotalCents,
        taxCents: authority.fact.taxCents,
        totalCents: authority.fact.totalCents,
        memo: authority.fact.memo,
        sourcePostingAuthorityHash,
      },
      basedOnAuthorityHash: sourcePostingAuthorityHash,
      splits: authority.fact.splits.map((split) => ({
        splitStableId: split.splitStableId,
        categoryStableId: split.categoryStableId,
        amountCents: split.amountCents,
        taxCents: split.taxCents,
        paidFromAccountStableId: split.paidFromAccountStableId,
      })),
      paymentAllocations: [],
    });
  }

  private assertPersistedDocumentMatchesSourceTarget(
    document: ExpenseDocumentRow,
    sourceTarget: AccountingExpenseCorrectionTargetV1,
  ): void {
    if (
      !document.occurredAt ||
      document.subtotalCents == null ||
      document.taxCents == null ||
      document.totalCents == null
    ) {
      throw new ConflictException(
        'posted Expense source document is missing immutable booking facts',
      );
    }
    let persistedTarget: AccountingExpenseCorrectionTargetV1;
    try {
      persistedTarget = normalizeAccountingExpenseCorrectionTarget({
        version: 1,
        document: {
          documentStableId: document.documentStableId,
          fundingAttributionVersion: (document.fundingAttributionVersion ??
            1) as 1 | 2,
          occurredAt: document.occurredAt.toISOString(),
          currency: document.currency,
          subtotalCents: document.subtotalCents,
          taxCents: document.taxCents,
          totalCents: document.totalCents,
          memo: document.memo,
          sourcePostingAuthorityHash:
            sourceTarget.document.sourcePostingAuthorityHash,
        },
        basedOnAuthorityHash: sourceTarget.basedOnAuthorityHash,
        splits: document.splits.map((split) => ({
          splitStableId: split.splitStableId,
          categoryStableId: split.category.categoryStableId,
          amountCents: split.amountCents,
          taxCents: split.taxCents,
          paidFromAccountStableId:
            (document.fundingAttributionVersion ?? 1) === 2
              ? (split.paidFromAccount?.accountStableId ?? null)
              : null,
        })),
        paymentAllocations:
          (document.fundingAttributionVersion ?? 1) === 1
            ? document.paymentAllocations.map((allocation) => ({
                paymentAllocationStableId: allocation.paymentAllocationStableId,
                accountStableId: allocation.account.accountStableId,
                amountCents: allocation.amountCents,
              }))
            : [],
      });
    } catch (error) {
      if (error instanceof AccountingExpenseCorrectionTargetPolicyError) {
        throw new ConflictException(
          'persisted Expense source authority is inconsistent: ' +
            error.message,
        );
      }
      throw error;
    }
    if (
      hashAccountingExpenseCorrectionTarget(persistedTarget) !==
      hashAccountingExpenseCorrectionTarget(sourceTarget)
    ) {
      throw new ConflictException(
        'persisted Expense source authority changed after canonical posting',
      );
    }
  }

  private async assertChangedDimensionsAreValid(
    base: AccountingExpenseCorrectionTargetV1,
    target: AccountingExpenseCorrectionTargetV1,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<void> {
    const baseSplits = new Map(
      base.splits.map((split) => [split.splitStableId, split] as const),
    );
    const changedCategoryStableIds = Array.from(
      new Set(
        target.splits.flatMap((split) => {
          const previous = baseSplits.get(split.splitStableId);
          return !previous ||
            previous.categoryStableId !== split.categoryStableId
            ? [split.categoryStableId]
            : [];
        }),
      ),
    );
    if (changedCategoryStableIds.length > 0) {
      const categories = await db.accountingCategory.findMany({
        where: {
          categoryStableId: { in: changedCategoryStableIds },
          type: AccountingTxType.EXPENSE,
          isActive: true,
        },
        select: { categoryStableId: true },
      });
      if (categories.length !== changedCategoryStableIds.length) {
        throw new BadRequestException(
          'Expense correction references a new or changed category that is not an active Expense category',
        );
      }
    }

    if (target.document.fundingAttributionVersion === 2) {
      const changedFundingIds = Array.from(
        new Set(
          target.splits.flatMap((split) => {
            if (!split.paidFromAccountStableId) return [];
            const previous = baseSplits.get(split.splitStableId);
            return !previous ||
              previous.paidFromAccountStableId !== split.paidFromAccountStableId
              ? [split.paidFromAccountStableId]
              : [];
          }),
        ),
      );
      await this.assertNewV2FundingAccounts(changedFundingIds, db);
      return;
    }

    const baseAllocations = new Map(
      base.paymentAllocations.map(
        (allocation) =>
          [allocation.paymentAllocationStableId, allocation] as const,
      ),
    );
    const changedPaymentAccountIds = Array.from(
      new Set(
        target.paymentAllocations.flatMap((allocation) => {
          const previous = baseAllocations.get(
            allocation.paymentAllocationStableId,
          );
          return !previous ||
            previous.accountStableId !== allocation.accountStableId
            ? [allocation.accountStableId]
            : [];
        }),
      ),
    );
    if (changedPaymentAccountIds.length === 0) return;
    const accounts = await db.accountingAccount.findMany({
      where: { accountStableId: { in: changedPaymentAccountIds } },
      select: {
        accountStableId: true,
        currency: true,
        isActive: true,
      },
    });
    const byStableId = new Map(
      accounts.map((account) => [account.accountStableId, account] as const),
    );
    if (
      changedPaymentAccountIds.some((accountStableId) => {
        const account = byStableId.get(accountStableId);
        return !account || !account.isActive || account.currency !== 'CAD';
      })
    ) {
      throw new BadRequestException(
        'Expense v1 correction payment account must be an active CAD account',
      );
    }
  }

  private async assertNewV2FundingAccounts(
    accountStableIds: string[],
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<void> {
    if (accountStableIds.length === 0) return;
    const accounts = await db.accountingAccount.findMany({
      where: { accountStableId: { in: accountStableIds } },
      select: {
        accountStableId: true,
        accountClass: true,
        type: true,
        currency: true,
        isActive: true,
      },
    });
    const byStableId = new Map(
      accounts.map((account) => [account.accountStableId, account] as const),
    );
    if (
      accountStableIds.some((accountStableId) => {
        const account = byStableId.get(accountStableId);
        return (
          !account ||
          !account.isActive ||
          account.currency !== 'CAD' ||
          account.accountClass !== AccountingAccountClass.ASSET ||
          (account.type !== AccountingAccountType.CASH &&
            account.type !== AccountingAccountType.BANK &&
            account.type !== AccountingAccountType.PLATFORM_WALLET)
        );
      })
    ) {
      throw new BadRequestException(
        'Expense v2 correction funding account must be an active CAD operational ASSET account',
      );
    }
  }

  private async assertTargetDimensionsExist(
    target: AccountingExpenseCorrectionTargetV1,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<void> {
    const categoryStableIds = Array.from(
      new Set(target.splits.map((split) => split.categoryStableId)),
    );
    const categories = await db.accountingCategory.findMany({
      where: { categoryStableId: { in: categoryStableIds } },
      select: { categoryStableId: true },
    });
    if (categories.length !== categoryStableIds.length) {
      throw new ConflictException(
        'Expense correction target references a missing Accounting category',
      );
    }

    const accountStableIds =
      target.document.fundingAttributionVersion === 2
        ? Array.from(
            new Set(
              target.splits.flatMap((split) =>
                split.paidFromAccountStableId
                  ? [split.paidFromAccountStableId]
                  : [],
              ),
            ),
          )
        : Array.from(
            new Set(
              target.paymentAllocations.map(
                (allocation) => allocation.accountStableId,
              ),
            ),
          );
    if (accountStableIds.length === 0) return;
    const accounts = await db.accountingAccount.findMany({
      where: { accountStableId: { in: accountStableIds } },
      select: { accountStableId: true },
    });
    if (accounts.length !== accountStableIds.length) {
      throw new ConflictException(
        'Expense correction target references a missing Accounting account',
      );
    }
  }
}
