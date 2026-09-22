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
  AccountingDocumentStatus,
  AccountingJournalEntryKind,
  AccountingJournalSource,
  AccountingProviderFinancialReviewStatus,
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
  CANONICAL_EXPENSE_SOURCE_FACT_TYPE,
  CANONICAL_EXPENSE_SOURCE_FACT_TYPE_V2,
} from './accounting-expense-journal.policy';
import {
  assertCanonicalExpenseJournalAuthority,
  buildCanonicalExpenseJournalWritePlansV2,
  hashCanonicalExpenseJournalWrite,
  hashCanonicalExpenseJournalWriteAuthority,
  normalizeCanonicalExpenseJournalWriteAuthority,
  type CanonicalExpenseFundingAccountFactV2,
  type CanonicalExpenseJournalWriteAuthority,
} from './accounting-expense-journal-write-authority';
import {
  buildProviderSettlementJournalWriteAuthority,
  hashProviderSettlementJournalWrite,
  normalizeProviderSettlementReplacementGroupAuthority,
  type ProviderFinancialHumanReviewAuthorityV1,
  type ProviderSettlementJournalWriteAuthorityV1,
  type ProviderSettlementReplacementGroupAuthorityV1,
  type ProviderSettlementReplacementGroupWriteInput,
} from './accounting-provider-settlement-write-authority';
import {
  PROVIDER_FINANCIAL_SOURCE_FACT_TYPE,
  UBER_PRE_CUTOVER_REVERSAL_SOURCE_FACT_TYPE,
} from './accounting-provider-settlement.policy';
import { AccountingPeriodService } from './accounting-period.service';
import {
  assertPayrollRunAccrualJournalAuthority,
  hashPayrollRunAccrualJournalWrite,
  normalizePayrollRunAccrualWriteAuthority,
  type PayrollRunAccrualJournalWriteAuthorityV1,
} from './payroll/payroll-journal-write-authority';
import {
  assertPayrollEmployeePaymentJournalAuthority,
  hashPayrollEmployeePaymentJournalWrite,
  normalizePayrollEmployeePaymentWriteAuthority,
  type PayrollEmployeePaymentJournalWriteAuthorityV1,
} from './payroll/payroll-employee-payment-journal-authority';
import {
  assertPayrollCraRemittanceJournalAuthority,
  hashPayrollCraRemittanceJournalWrite,
  normalizePayrollCraRemittanceWriteAuthority,
  type PayrollCraRemittanceJournalWriteAuthorityV1,
} from './payroll/payroll-cra-remittance-journal-authority';
import {
  assertPayrollRunReversalJournalAuthority,
  hashPayrollRunReversalJournalWrite,
  normalizePayrollRunReversalWriteAuthority,
  type PayrollRunReversalJournalWriteAuthorityV1,
} from './payroll/payroll-reversal-journal-authority';
import { PayrollRunStatus } from './payroll/payroll-contracts';

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
    if (input.source === AccountingJournalSource.EXPENSE_DOCUMENT) {
      throw new BadRequestException(
        'canonical Expense Journals require Expense-specific write authority',
      );
    }
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

  async createCanonicalExpenseJournalEntryInTx(
    input: AccountingJournalCreateInput,
    operatorActorRef: string,
    authority: CanonicalExpenseJournalWriteAuthority,
    tx: Prisma.TransactionClient,
  ): Promise<AccountingJournalRow> {
    const normalizedAuthority = this.applyJournalPolicy(() =>
      normalizeCanonicalExpenseJournalWriteAuthority(authority),
    );
    const normalized = this.applyJournalPolicy(() =>
      normalizeJournalCreate(input),
    );
    this.applyJournalPolicy(() =>
      assertCanonicalExpenseJournalAuthority(normalized, normalizedAuthority),
    );
    await this.assertCanonicalExpenseAuthorityInTx(normalizedAuthority, tx);

    const operator = this.requireJournalValue(
      operatorActorRef,
      'operatorActorRef',
    );
    const timezone = await this.period.getBusinessTimezone();
    const journal = await this.createPreparedJournalEntryInTx(
      {
        normalized,
        idempotencyHash: hashCanonicalExpenseJournalWrite(
          normalized,
          normalizedAuthority,
        ),
        auditAuthority: normalizedAuthority as unknown as Prisma.InputJsonValue,
      },
      operator,
      tx,
      timezone,
    );
    if (journal.deletedAt) {
      throw new ConflictException(
        'canonical Expense Journal was deleted and cannot be replayed',
      );
    }
    return journal;
  }

  async createPayrollRunAccrualJournalInTx(
    input: AccountingJournalCreateInput,
    operatorActorRef: string,
    authority: PayrollRunAccrualJournalWriteAuthorityV1,
    tx: Prisma.TransactionClient,
  ): Promise<AccountingJournalRow> {
    const normalizedAuthority = this.applyJournalPolicy(() =>
      normalizePayrollRunAccrualWriteAuthority(authority),
    );
    const normalized = this.applyJournalPolicy(() =>
      normalizeJournalCreate(input),
    );
    this.applyJournalPolicy(() =>
      assertPayrollRunAccrualJournalAuthority(normalized, normalizedAuthority),
    );
    await this.assertPayrollRunAccrualAuthorityInTx(normalizedAuthority, tx);

    const operator = this.requireJournalValue(
      operatorActorRef,
      'operatorActorRef',
    );
    const timezone = await this.period.getBusinessTimezone();
    const journal = await this.createPreparedJournalEntryInTx(
      {
        normalized,
        idempotencyHash: hashPayrollRunAccrualJournalWrite(
          normalized,
          normalizedAuthority,
        ),
        auditAuthority: normalizedAuthority as unknown as Prisma.InputJsonValue,
      },
      operator,
      tx,
      timezone,
    );
    if (journal.deletedAt) {
      throw new ConflictException(
        'Payroll accrual Journal was deleted and cannot be replayed',
      );
    }
    return journal;
  }

  async createPayrollRunReversalJournalInTx(
    input: AccountingJournalCreateInput,
    operatorActorRef: string,
    authority: PayrollRunReversalJournalWriteAuthorityV1,
    tx: Prisma.TransactionClient,
  ): Promise<AccountingJournalRow> {
    const normalizedAuthority = this.applyJournalPolicy(() =>
      normalizePayrollRunReversalWriteAuthority(authority),
    );
    const normalized = this.applyJournalPolicy(() =>
      normalizeJournalCreate(input),
    );
    this.applyJournalPolicy(() =>
      assertPayrollRunReversalJournalAuthority(normalized, normalizedAuthority),
    );
    await this.assertPayrollRunReversalAuthorityInTx(normalizedAuthority, tx);

    const operator = this.requireJournalValue(
      operatorActorRef,
      'operatorActorRef',
    );
    const timezone = await this.period.getBusinessTimezone();
    const journal = await this.createPreparedJournalEntryInTx(
      {
        normalized,
        idempotencyHash: hashPayrollRunReversalJournalWrite(
          normalized,
          normalizedAuthority,
        ),
        auditAuthority: normalizedAuthority as unknown as Prisma.InputJsonValue,
      },
      operator,
      tx,
      timezone,
    );
    if (journal.deletedAt) {
      throw new ConflictException(
        'Payroll reversal Journal was deleted and cannot be replayed',
      );
    }
    return journal;
  }

  async createPayrollEmployeePaymentJournalInTx(
    input: AccountingJournalCreateInput,
    operatorActorRef: string,
    authority: PayrollEmployeePaymentJournalWriteAuthorityV1,
    tx: Prisma.TransactionClient,
  ): Promise<AccountingJournalRow> {
    const normalizedAuthority = this.applyJournalPolicy(() =>
      normalizePayrollEmployeePaymentWriteAuthority(authority),
    );
    const normalized = this.applyJournalPolicy(() =>
      normalizeJournalCreate(input),
    );
    this.applyJournalPolicy(() =>
      assertPayrollEmployeePaymentJournalAuthority(
        normalized,
        normalizedAuthority,
      ),
    );
    await this.assertPayrollEmployeePaymentAuthorityInTx(
      normalizedAuthority,
      tx,
    );

    const operator = this.requireJournalValue(
      operatorActorRef,
      'operatorActorRef',
    );
    const timezone = await this.period.getBusinessTimezone();
    const journal = await this.createPreparedJournalEntryInTx(
      {
        normalized,
        idempotencyHash: hashPayrollEmployeePaymentJournalWrite(
          normalized,
          normalizedAuthority,
        ),
        auditAuthority: normalizedAuthority as unknown as Prisma.InputJsonValue,
      },
      operator,
      tx,
      timezone,
    );
    if (journal.deletedAt) {
      throw new ConflictException(
        'Payroll employee payment Journal was deleted and cannot be replayed',
      );
    }
    return journal;
  }

  async createPayrollCraRemittanceJournalInTx(
    input: AccountingJournalCreateInput,
    operatorActorRef: string,
    authority: PayrollCraRemittanceJournalWriteAuthorityV1,
    tx: Prisma.TransactionClient,
  ): Promise<AccountingJournalRow> {
    const normalizedAuthority = this.applyJournalPolicy(() =>
      normalizePayrollCraRemittanceWriteAuthority(authority),
    );
    const normalized = this.applyJournalPolicy(() =>
      normalizeJournalCreate(input),
    );
    this.applyJournalPolicy(() =>
      assertPayrollCraRemittanceJournalAuthority(
        normalized,
        normalizedAuthority,
      ),
    );
    await this.assertPayrollCraRemittanceAuthorityInTx(normalizedAuthority, tx);

    const operator = this.requireJournalValue(
      operatorActorRef,
      'operatorActorRef',
    );
    const timezone = await this.period.getBusinessTimezone();
    const journal = await this.createPreparedJournalEntryInTx(
      {
        normalized,
        idempotencyHash: hashPayrollCraRemittanceJournalWrite(
          normalized,
          normalizedAuthority,
        ),
        auditAuthority: normalizedAuthority as unknown as Prisma.InputJsonValue,
      },
      operator,
      tx,
      timezone,
    );
    if (journal.deletedAt) {
      throw new ConflictException(
        'Payroll CRA remittance Journal was deleted and cannot be replayed',
      );
    }
    return journal;
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
      if (existing.source === AccountingJournalSource.EXPENSE_DOCUMENT) {
        throw new ConflictException(
          'canonical Expense Journals cannot be updated in place',
        );
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
      if (existing.source === AccountingJournalSource.EXPENSE_DOCUMENT) {
        throw new ConflictException(
          'canonical Expense Journals cannot be deleted in place',
        );
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

  private async assertPayrollCraRemittanceAuthorityInTx(
    authority: PayrollCraRemittanceJournalWriteAuthorityV1,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const fact = authority.fact;
    const remittance = await tx.payrollCraRemittance.findUnique({
      where: { remittanceStableId: fact.remittanceStableId },
      select: {
        remitterType: true,
        remittancePolicyVersion: true,
        periodStart: true,
        periodEnd: true,
        dueDate: true,
        incomeTaxCents: true,
        employeeCppCents: true,
        employeeCpp2Cents: true,
        employerCppCents: true,
        employerCpp2Cents: true,
        employeeEiCents: true,
        employerEiCents: true,
        totalAmountCents: true,
        currency: true,
        evidenceHash: true,
        paymentAccountStableId: true,
        paymentDate: true,
        journalEntryStableId: true,
        employer: { select: { employerStableId: true } },
        runs: {
          select: {
            employerConfigStableId: true,
            calculationHash: true,
            postedAccrualJournalEntryStableId: true,
            payDate: true,
            incomeTaxCents: true,
            employeeCppCents: true,
            employeeCpp2Cents: true,
            employerCppCents: true,
            employerCpp2Cents: true,
            employeeEiCents: true,
            employerEiCents: true,
            craRemittanceCents: true,
            run: {
              select: {
                runStableId: true,
                status: true,
                employerConfigStableId: true,
                calculationHash: true,
                postedJournalEntryStableId: true,
                postedAt: true,
                payDate: true,
                incomeTaxCents: true,
                employeeCppCents: true,
                employeeCpp2Cents: true,
                employerCppCents: true,
                employerCpp2Cents: true,
                employeeEiCents: true,
                employerEiCents: true,
                craRemittanceCents: true,
              },
            },
          },
        },
      },
    });
    const dateOnly = (value: Date | null): string | null =>
      value?.toISOString().slice(0, 10) ?? null;
    if (
      !remittance ||
      remittance.journalEntryStableId !== null ||
      remittance.employer.employerStableId !== fact.employerStableId ||
      remittance.remitterType !== fact.remitterType ||
      remittance.remittancePolicyVersion !== fact.remittancePolicyVersion ||
      dateOnly(remittance.periodStart) !== fact.periodStart ||
      dateOnly(remittance.periodEnd) !== fact.periodEnd ||
      dateOnly(remittance.dueDate) !== fact.dueDate ||
      remittance.incomeTaxCents !== fact.incomeTaxCents ||
      remittance.employeeCppCents !== fact.employeeCppCents ||
      remittance.employeeCpp2Cents !== fact.employeeCpp2Cents ||
      remittance.employerCppCents !== fact.employerCppCents ||
      remittance.employerCpp2Cents !== fact.employerCpp2Cents ||
      remittance.employeeEiCents !== fact.employeeEiCents ||
      remittance.employerEiCents !== fact.employerEiCents ||
      remittance.totalAmountCents !== fact.totalAmountCents ||
      remittance.currency !== 'CAD' ||
      remittance.evidenceHash !== fact.evidenceHash ||
      remittance.paymentAccountStableId !== fact.paymentAccountStableId ||
      dateOnly(remittance.paymentDate) !== fact.paymentDate
    ) {
      throw new ConflictException(
        'Payroll CRA remittance authority changed before Journal posting',
      );
    }

    const expectedRuns = new Map(
      fact.includedRuns.map((run) => [run.runStableId, run] as const),
    );
    if (
      remittance.runs.length !== fact.includedRuns.length ||
      remittance.runs.length !== expectedRuns.size
    ) {
      throw new ConflictException(
        'Payroll CRA remittance included-run authority changed before Journal posting',
      );
    }
    for (const evidence of remittance.runs) {
      const runStableId = evidence.run.runStableId;
      const expected = expectedRuns.get(runStableId);
      if (
        !expected ||
        evidence.employerConfigStableId !== expected.employerConfigStableId ||
        evidence.calculationHash !== expected.calculationHash ||
        evidence.postedAccrualJournalEntryStableId !==
          expected.postedAccrualJournalEntryStableId ||
        dateOnly(evidence.payDate) !== expected.payDate ||
        evidence.incomeTaxCents !== expected.incomeTaxCents ||
        evidence.employeeCppCents !== expected.employeeCppCents ||
        evidence.employeeCpp2Cents !== expected.employeeCpp2Cents ||
        evidence.employerCppCents !== expected.employerCppCents ||
        evidence.employerCpp2Cents !== expected.employerCpp2Cents ||
        evidence.employeeEiCents !== expected.employeeEiCents ||
        evidence.employerEiCents !== expected.employerEiCents ||
        evidence.craRemittanceCents !== expected.craRemittanceCents ||
        evidence.run.status !== 'POSTED' ||
        evidence.run.employerConfigStableId !==
          expected.employerConfigStableId ||
        evidence.run.calculationHash !== expected.calculationHash ||
        evidence.run.postedJournalEntryStableId !==
          expected.postedAccrualJournalEntryStableId ||
        !evidence.run.postedAt ||
        dateOnly(evidence.run.payDate) !== expected.payDate ||
        evidence.run.incomeTaxCents !== expected.incomeTaxCents ||
        evidence.run.employeeCppCents !== expected.employeeCppCents ||
        evidence.run.employeeCpp2Cents !== expected.employeeCpp2Cents ||
        evidence.run.employerCppCents !== expected.employerCppCents ||
        evidence.run.employerCpp2Cents !== expected.employerCpp2Cents ||
        evidence.run.employeeEiCents !== expected.employeeEiCents ||
        evidence.run.employerEiCents !== expected.employerEiCents ||
        evidence.run.craRemittanceCents !== expected.craRemittanceCents
      ) {
        throw new ConflictException(
          `Payroll CRA remittance run authority changed before Journal posting: ${runStableId}`,
        );
      }
    }

    const accrualJournals = await tx.accountingJournalEntry.findMany({
      where: {
        entryStableId: {
          in: fact.includedRuns.map(
            (run) => run.postedAccrualJournalEntryStableId,
          ),
        },
      },
      select: {
        entryStableId: true,
        source: true,
        sourceFactType: true,
        sourceFactStableId: true,
        deletedAt: true,
      },
    });
    const accrualByStableId = new Map(
      accrualJournals.map((entry) => [entry.entryStableId, entry] as const),
    );
    for (const run of fact.includedRuns) {
      const accrual = accrualByStableId.get(
        run.postedAccrualJournalEntryStableId,
      );
      if (
        !accrual ||
        accrual.deletedAt ||
        accrual.source !== AccountingJournalSource.PAYROLL ||
        accrual.sourceFactType !== 'payroll.run.accrual.v1' ||
        accrual.sourceFactStableId !== run.runStableId
      ) {
        throw new ConflictException(
          `Payroll accrual Journal authority is not active for CRA remittance: ${run.runStableId}`,
        );
      }
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
        type: true,
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
        current.type !== prerequisite.actual.accountType ||
        current.currency !== prerequisite.actual.currency ||
        current.isActive !== prerequisite.actual.isActive
      ) {
        throw new ConflictException(
          `Payroll CRA remittance account authority changed before posting: ${prerequisite.accountStableId}`,
        );
      }
    }
  }

  private async assertPayrollRunReversalAuthorityInTx(
    authority: PayrollRunReversalJournalWriteAuthorityV1,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const fact = authority.fact;
    const run = await tx.payrollRun.findUnique({
      where: { runStableId: fact.runStableId },
      select: {
        employeeId: true,
        correctionSequence: true,
        status: true,
        calculationHash: true,
        approvedAt: true,
        postedJournalEntryStableId: true,
        postedAt: true,
        reversalJournalEntryStableId: true,
        reversedByActorRef: true,
        reversalReason: true,
        reversedAt: true,
        storeStableId: true,
        payDate: true,
        periodEnd: true,
        grossPayCents: true,
        totalEmployeeDeductionsCents: true,
        netPayCents: true,
        incomeTaxCents: true,
        employeeCppCents: true,
        employeeCpp2Cents: true,
        employeeEiCents: true,
        employerCppCents: true,
        employerCpp2Cents: true,
        employerEiCents: true,
        vacationPayAccruedCents: true,
        compensationExpenseCents: true,
        craRemittanceCents: true,
        supportedEmployerPayrollCostCents: true,
        employeePayment: { select: { paymentStableId: true } },
        craRemittanceEvidence: { select: { id: true } },
      },
    });
    const dateOnly = (value: Date | null): string | null =>
      value?.toISOString().slice(0, 10) ?? null;
    const reversalStateIsValid =
      run?.status === PayrollRunStatus.POSTED
        ? run.reversalJournalEntryStableId === null
        : run?.status === PayrollRunStatus.REVERSED &&
          Boolean(run.reversalJournalEntryStableId);

    if (
      !run ||
      !reversalStateIsValid ||
      run.calculationHash !== fact.calculationHash ||
      run.approvedAt?.toISOString() !== fact.approvedAt ||
      !run.postedAt ||
      run.postedJournalEntryStableId !==
        fact.postedAccrualJournalEntryStableId ||
      run.reversedAt?.toISOString() !== fact.reversedAt ||
      run.reversedByActorRef !== fact.reversedByActorRef ||
      run.reversalReason !== fact.reversalReason ||
      run.storeStableId !== fact.storeStableId ||
      dateOnly(run.payDate) !== fact.payDate ||
      dateOnly(run.periodEnd) !== fact.accrualDate ||
      run.grossPayCents !== fact.grossPayCents ||
      run.totalEmployeeDeductionsCents !== fact.totalEmployeeDeductionsCents ||
      run.netPayCents !== fact.netPayCents ||
      run.incomeTaxCents !== fact.incomeTaxCents ||
      run.employeeCppCents !== fact.employeeCppCents ||
      run.employeeCpp2Cents !== fact.employeeCpp2Cents ||
      run.employeeEiCents !== fact.employeeEiCents ||
      run.employerCppCents !== fact.employerCppCents ||
      run.employerCpp2Cents !== fact.employerCpp2Cents ||
      run.employerEiCents !== fact.employerEiCents ||
      run.vacationPayAccruedCents !== fact.vacationPayAccruedCents ||
      run.compensationExpenseCents !== fact.compensationExpenseCents ||
      run.craRemittanceCents !== fact.craRemittanceCents ||
      run.supportedEmployerPayrollCostCents !==
        fact.supportedEmployerPayrollCostCents ||
      run.employeePayment !== null ||
      run.craRemittanceEvidence !== null
    ) {
      throw new ConflictException(
        'Payroll reversal authority changed before Journal posting',
      );
    }

    if (run.status === PayrollRunStatus.POSTED) {
      const laterFinalized = await tx.payrollRun.findFirst({
        where: {
          employeeId: run.employeeId,
          status: {
            in: [
              PayrollRunStatus.APPROVED,
              PayrollRunStatus.POSTED,
              PayrollRunStatus.REVERSED,
            ],
          },
          OR: [
            { payDate: { gt: run.payDate } },
            {
              payDate: run.payDate,
              correctionSequence: { gt: run.correctionSequence },
            },
          ],
        },
        select: { runStableId: true },
      });
      if (laterFinalized) {
        throw new ConflictException(
          'Cannot reverse this run after a later Payroll run has been finalized',
        );
      }
    }

    const accrualJournal = await tx.accountingJournalEntry.findUnique({
      where: { entryStableId: fact.postedAccrualJournalEntryStableId },
      select: {
        source: true,
        sourceFactType: true,
        sourceFactStableId: true,
        sourceFactVersion: true,
        deletedAt: true,
      },
    });
    if (
      !accrualJournal ||
      accrualJournal.deletedAt ||
      accrualJournal.source !== AccountingJournalSource.PAYROLL ||
      accrualJournal.sourceFactType !== 'payroll.run.accrual.v1' ||
      accrualJournal.sourceFactStableId !== fact.runStableId ||
      accrualJournal.sourceFactVersion !== 1
    ) {
      throw new ConflictException(
        'Payroll accrual Journal authority is not active for reversal',
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
          `Payroll reversal account authority changed before posting: ${prerequisite.accountStableId}`,
        );
      }
    }
  }

  private async assertPayrollEmployeePaymentAuthorityInTx(
    authority: PayrollEmployeePaymentJournalWriteAuthorityV1,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const fact = authority.fact;
    const payment = await tx.payrollEmployeePayment.findUnique({
      where: { paymentStableId: fact.paymentStableId },
      select: {
        paymentAccountStableId: true,
        amountCents: true,
        currency: true,
        paymentDate: true,
        journalEntryStableId: true,
        run: {
          select: {
            runStableId: true,
            status: true,
            calculationHash: true,
            postedJournalEntryStableId: true,
            storeStableId: true,
            netPayCents: true,
          },
        },
      },
    });
    const paymentDate = payment?.paymentDate.toISOString().slice(0, 10) ?? null;
    if (
      !payment ||
      payment.journalEntryStableId !== null ||
      payment.paymentAccountStableId !== fact.paymentAccountStableId ||
      payment.amountCents !== fact.amountCents ||
      payment.currency !== 'CAD' ||
      paymentDate !== fact.paymentDate ||
      payment.run.runStableId !== fact.runStableId ||
      payment.run.status !== 'POSTED' ||
      payment.run.calculationHash !== fact.calculationHash ||
      payment.run.postedJournalEntryStableId !==
        fact.postedAccrualJournalEntryStableId ||
      payment.run.storeStableId !== fact.storeStableId ||
      payment.run.netPayCents !== fact.amountCents
    ) {
      throw new ConflictException(
        'Payroll employee payment authority changed before Journal posting',
      );
    }

    const accrualJournal = await tx.accountingJournalEntry.findUnique({
      where: { entryStableId: fact.postedAccrualJournalEntryStableId },
      select: {
        source: true,
        sourceFactType: true,
        sourceFactStableId: true,
        deletedAt: true,
      },
    });
    if (
      !accrualJournal ||
      accrualJournal.deletedAt ||
      accrualJournal.source !== AccountingJournalSource.PAYROLL ||
      accrualJournal.sourceFactType !== 'payroll.run.accrual.v1' ||
      accrualJournal.sourceFactStableId !== fact.runStableId
    ) {
      throw new ConflictException(
        'Payroll accrual Journal authority is not active for employee payment',
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
        type: true,
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
        current.type !== prerequisite.actual.accountType ||
        current.currency !== prerequisite.actual.currency ||
        current.isActive !== prerequisite.actual.isActive
      ) {
        throw new ConflictException(
          `Payroll employee payment account authority changed before posting: ${prerequisite.accountStableId}`,
        );
      }
    }
  }

  private async assertCanonicalExpenseAuthorityInTx(
    authority: CanonicalExpenseJournalWriteAuthority,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const document = await tx.accountingExpenseDocument.findUnique({
      where: { documentStableId: authority.fact.documentStableId },
      select: {
        status: true,
        fundingAttributionVersion: true,
        occurredAt: true,
        subtotalCents: true,
        taxCents: true,
        totalCents: true,
        currency: true,
        memo: true,
        splits: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            splitStableId: true,
            amountCents: true,
            taxCents: true,
            category: { select: { categoryStableId: true } },
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
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            paymentAllocationStableId: true,
            amountCents: true,
            account: { select: { accountStableId: true } },
          },
        },
      },
    });
    if (
      !document ||
      document.status !== AccountingDocumentStatus.CONFIRMED ||
      !document.occurredAt ||
      document.subtotalCents == null ||
      document.taxCents == null ||
      document.totalCents == null
    ) {
      throw new ConflictException(
        'canonical Expense authority changed before Journal posting',
      );
    }

    const fundingAttributionVersion = document.fundingAttributionVersion ?? 1;
    const existingExpenseAnchors = await tx.accountingJournalEntry.findMany({
      where: {
        source: AccountingJournalSource.EXPENSE_DOCUMENT,
        sourceFactStableId: authority.fact.documentStableId,
        deletedAt: null,
      },
      select: {
        idempotencyKey: true,
        sourceFactType: true,
        sourceFactVersion: true,
      },
    });
    const expectedSourceFactType =
      authority.version === 1
        ? CANONICAL_EXPENSE_SOURCE_FACT_TYPE
        : CANONICAL_EXPENSE_SOURCE_FACT_TYPE_V2;
    const expectedAnchorKeys =
      authority.version === 1
        ? new Set([`canonical-expense:${authority.fact.documentStableId}:v1`])
        : new Set(
            authority.fact.splits.map(
              (split) =>
                `canonical-expense:${authority.fact.documentStableId}:funding:${split.paidFromAccountStableId}:v2`,
            ),
          );
    if (
      existingExpenseAnchors.some(
        (entry) =>
          entry.sourceFactType !== expectedSourceFactType ||
          entry.sourceFactVersion !== authority.version,
      )
    ) {
      throw new ConflictException(
        'canonical Expense source fact version cannot change after Journal posting',
      );
    }
    if (
      existingExpenseAnchors.some(
        (entry) => !expectedAnchorKeys.has(entry.idempotencyKey),
      )
    ) {
      throw new ConflictException(
        'canonical Expense source authority cannot change after Journal posting',
      );
    }

    if (authority.version === 1) {
      if (fundingAttributionVersion !== 1) {
        throw new ConflictException(
          'canonical Expense authority changed before Journal posting',
        );
      }
      let currentAuthority: CanonicalExpenseJournalWriteAuthority;
      try {
        currentAuthority = normalizeCanonicalExpenseJournalWriteAuthority({
          version: 1,
          role: 'EXPENSE_DOCUMENT',
          fact: {
            version: 1,
            documentStableId: authority.fact.documentStableId,
            occurredAt: document.occurredAt.toISOString(),
            currency: document.currency,
            subtotalCents: document.subtotalCents,
            taxCents: document.taxCents,
            totalCents: document.totalCents,
            memo: document.memo,
            splits: document.splits.map((split) => ({
              categoryStableId: split.category.categoryStableId,
              amountCents: split.amountCents,
              taxCents: split.taxCents,
            })),
            paymentAllocations: document.paymentAllocations.map(
              (allocation) => ({
                accountStableId: allocation.account.accountStableId,
                amountCents: allocation.amountCents,
              }),
            ),
          },
          splitStableIds: document.splits.map((split) => split.splitStableId),
          paymentAllocationStableIds: document.paymentAllocations.map(
            (allocation) => allocation.paymentAllocationStableId,
          ),
        });
      } catch {
        throw new ConflictException(
          'canonical Expense authority changed before Journal posting',
        );
      }
      if (
        hashCanonicalExpenseJournalWriteAuthority(currentAuthority) !==
        hashCanonicalExpenseJournalWriteAuthority(authority)
      ) {
        throw new ConflictException(
          'canonical Expense authority changed before Journal posting',
        );
      }
      return;
    }

    if (
      fundingAttributionVersion !== 2 ||
      document.paymentAllocations.length > 0 ||
      document.splits.some((split) => !split.paidFromAccount)
    ) {
      throw new ConflictException(
        'canonical Expense authority changed before Journal posting',
      );
    }

    const fundingAccountFactsByStableId = new Map<
      string,
      CanonicalExpenseFundingAccountFactV2
    >();
    for (const split of document.splits) {
      const account = split.paidFromAccount;
      if (!account) {
        throw new ConflictException(
          'canonical Expense authority changed before Journal posting',
        );
      }
      fundingAccountFactsByStableId.set(account.accountStableId, {
        accountStableId: account.accountStableId,
        accountClass: account.accountClass,
        accountType: account.type,
        currency: account.currency,
        isActive: account.isActive,
      });
    }

    let currentAuthority: CanonicalExpenseJournalWriteAuthority | undefined;
    try {
      const plans = buildCanonicalExpenseJournalWritePlansV2({
        fact: {
          version: 2,
          documentStableId: authority.fact.documentStableId,
          occurredAt: document.occurredAt.toISOString(),
          currency: document.currency,
          subtotalCents: document.subtotalCents,
          taxCents: document.taxCents,
          totalCents: document.totalCents,
          memo: document.memo,
          splits: document.splits.map((split) => {
            const account = split.paidFromAccount;
            if (!account) {
              throw new ConflictException(
                'canonical Expense authority changed before Journal posting',
              );
            }
            return {
              splitStableId: split.splitStableId,
              categoryStableId: split.category.categoryStableId,
              paidFromAccountStableId: account.accountStableId,
              amountCents: split.amountCents,
              taxCents: split.taxCents,
            };
          }),
        },
        fundingAccountFacts: [...fundingAccountFactsByStableId.values()],
      });
      currentAuthority = plans.find(
        (plan) =>
          plan.authority.fundingAccountStableId ===
          authority.fundingAccountStableId,
      )?.authority;
    } catch {
      throw new ConflictException(
        'canonical Expense authority changed before Journal posting',
      );
    }

    if (
      !currentAuthority ||
      hashCanonicalExpenseJournalWriteAuthority(currentAuthority) !==
        hashCanonicalExpenseJournalWriteAuthority(authority)
    ) {
      throw new ConflictException(
        'canonical Expense authority changed before Journal posting',
      );
    }
  }

  private async assertPayrollRunAccrualAuthorityInTx(
    authority: PayrollRunAccrualJournalWriteAuthorityV1,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const fact = authority.fact;
    const run = await tx.payrollRun.findUnique({
      where: { runStableId: fact.runStableId },
      select: {
        status: true,
        calculationHash: true,
        approvedAt: true,
        storeStableId: true,
        payDate: true,
        periodEnd: true,
        grossPayCents: true,
        totalEmployeeDeductionsCents: true,
        netPayCents: true,
        incomeTaxCents: true,
        employeeCppCents: true,
        employeeCpp2Cents: true,
        employeeEiCents: true,
        employerCppCents: true,
        employerCpp2Cents: true,
        employerEiCents: true,
        vacationPayAccruedCents: true,
        compensationExpenseCents: true,
        craRemittanceCents: true,
        supportedEmployerPayrollCostCents: true,
      },
    });
    const dateOnly = (value: Date | null): string | null =>
      value?.toISOString().slice(0, 10) ?? null;
    if (
      !run ||
      (run.status !== 'APPROVED' && run.status !== 'POSTED') ||
      run.calculationHash !== fact.calculationHash ||
      run.approvedAt?.toISOString() !== fact.approvedAt ||
      run.storeStableId !== fact.storeStableId ||
      dateOnly(run.payDate) !== fact.payDate ||
      dateOnly(run.periodEnd) !== fact.accrualDate ||
      run.grossPayCents !== fact.grossPayCents ||
      run.totalEmployeeDeductionsCents !== fact.totalEmployeeDeductionsCents ||
      run.netPayCents !== fact.netPayCents ||
      run.incomeTaxCents !== fact.incomeTaxCents ||
      run.employeeCppCents !== fact.employeeCppCents ||
      run.employeeCpp2Cents !== fact.employeeCpp2Cents ||
      run.employeeEiCents !== fact.employeeEiCents ||
      run.employerCppCents !== fact.employerCppCents ||
      run.employerCpp2Cents !== fact.employerCpp2Cents ||
      run.employerEiCents !== fact.employerEiCents ||
      run.vacationPayAccruedCents !== fact.vacationPayAccruedCents ||
      run.compensationExpenseCents !== fact.compensationExpenseCents ||
      run.craRemittanceCents !== fact.craRemittanceCents ||
      run.supportedEmployerPayrollCostCents !==
        fact.supportedEmployerPayrollCostCents
    ) {
      throw new ConflictException(
        'Payroll run authority changed before Journal posting',
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
          `Payroll account authority changed before posting: ${prerequisite.accountStableId}`,
        );
      }
    }
  }

  private async assertProviderSettlementAuthorityInTx(
    authority: ProviderSettlementReplacementGroupAuthorityV1,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const document = await tx.accountingProviderFinancialDocument.findUnique({
      where: { documentStableId: authority.documentStableId },
      select: {
        id: true,
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

    await this.assertProviderFinancialHumanReviewAuthorityInTx(
      document.id,
      authority.humanReviewRevision,
      tx,
      authority.documentStableId,
    );

    for (const evidence of authority.supplementaryEvidenceDocuments ?? []) {
      const supplementary =
        await tx.accountingProviderFinancialDocument.findUnique({
          where: { documentStableId: evidence.documentStableId },
          select: {
            id: true,
            documentStableId: true,
            provider: true,
            documentType: true,
            businessIdentityKey: true,
            revision: true,
            storeStableId: true,
            providerDocumentRef: true,
            periodStart: true,
            periodEnd: true,
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
      const supplementaryLatest =
        await tx.accountingProviderFinancialDocument.findFirst({
          where: {
            provider: evidence.provider,
            documentType: evidence.documentType,
            businessIdentityKey: evidence.businessIdentityKey,
          },
          orderBy: { revision: 'desc' },
          select: { documentStableId: true, revision: true },
        });
      const supplementaryReview = supplementary?.artifact.inboxItem ?? null;
      if (
        !supplementary ||
        supplementary.provider !== evidence.provider ||
        supplementary.documentType !== evidence.documentType ||
        supplementary.businessIdentityKey !== evidence.businessIdentityKey ||
        supplementary.revision !== evidence.revision ||
        supplementary.storeStableId !== evidence.storeStableId ||
        supplementary.providerDocumentRef !== evidence.providerDocumentRef ||
        dateOnly(supplementary.periodStart) !== evidence.periodStart ||
        dateOnly(supplementary.periodEnd) !== evidence.periodEnd ||
        supplementaryLatest?.documentStableId !== evidence.documentStableId ||
        supplementaryLatest?.revision !== evidence.revision ||
        !supplementaryReview ||
        supplementaryReview.inboxItemStableId !==
          evidence.reviewEvidence.inboxItemStableId ||
        supplementaryReview.status !== evidence.reviewEvidence.status ||
        supplementaryReview.materializedEntityType !==
          evidence.reviewEvidence.materializedEntityType ||
        supplementaryReview.materializedEntityStableId !==
          evidence.reviewEvidence.materializedEntityStableId ||
        supplementaryReview.reviewedAt?.toISOString() !==
          evidence.reviewEvidence.reviewedAt ||
        supplementaryReview.reviewedByUserStableId !==
          evidence.reviewEvidence.reviewedByUserStableId ||
        supplementaryReview.version !== evidence.reviewEvidence.version
      ) {
        throw new ConflictException(
          `provider settlement supplementary evidence changed after preview: ${evidence.documentStableId}`,
        );
      }

      await this.assertProviderFinancialHumanReviewAuthorityInTx(
        supplementary.id,
        evidence.humanReviewRevision,
        tx,
        evidence.documentStableId,
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

  private async assertProviderFinancialHumanReviewAuthorityInTx(
    documentDbId: string,
    authority: ProviderFinancialHumanReviewAuthorityV1 | undefined,
    tx: Prisma.TransactionClient,
    documentStableId: string,
  ): Promise<void> {
    const confirmed =
      await tx.accountingProviderFinancialReviewRevision.findMany({
        where: {
          documentId: documentDbId,
          status: AccountingProviderFinancialReviewStatus.CONFIRMED,
        },
        orderBy: { revision: 'desc' },
        take: 2,
        select: {
          reviewRevisionStableId: true,
          revision: true,
          reviewHash: true,
          confirmedAt: true,
          confirmedByUserStableId: true,
        },
      });

    if (!authority) {
      if (confirmed.length > 0) {
        throw new ConflictException(
          `provider financial human review authority changed after preview: ${documentStableId}`,
        );
      }
      return;
    }

    const current = confirmed[0] ?? null;
    if (
      confirmed.length !== 1 ||
      !current ||
      current.reviewRevisionStableId !== authority.reviewRevisionStableId ||
      current.revision !== authority.revision ||
      current.reviewHash !== authority.reviewHash ||
      current.confirmedAt?.toISOString() !== authority.confirmedAt ||
      current.confirmedByUserStableId !== authority.confirmedByUserStableId
    ) {
      throw new ConflictException(
        `provider financial human review authority changed after preview: ${documentStableId}`,
      );
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
