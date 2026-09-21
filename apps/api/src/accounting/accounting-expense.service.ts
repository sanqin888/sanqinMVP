import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { Prisma } from '@prisma/client';
import {
  AccountingArtifactKind,
  AccountingDocumentSource,
  AccountingDocumentStatus,
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
  AccountingSourceType,
  AccountingTxType,
} from './accounting-contracts';
import { runSerializableAccountingWrite } from './accounting-atomic-write';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  linkAndConfirmInboxExpenseInTx,
  markInboxExpenseConfirmedInTx,
} from './accounting-inbox-expense.writer';
import {
  accountingJsonRecord,
  accountingOptionalString,
  readAccountingInboxExpenseContext,
} from './accounting-inbox-query';
import { AccountingPeriodService } from './accounting-period.service';
import type {
  AccountingExpenseInput,
  AccountingExpensePaymentAllocationInput,
} from './accounting-expense.contracts';
import {
  listAccountingExpenseDocuments,
  readAccountingExpenseDocument,
} from './accounting-expense.query';
import {
  assertAccountingExpenseMoney,
  normalizeAccountingExpenseAttachmentUrls,
  parseAccountingExpenseDate,
} from './accounting-expense-input';
import { createAccountingExpensePaymentAllocationsInTx } from './accounting-expense-payment-allocation.writer';

type NormalizedExpensePaymentAllocation =
  AccountingExpensePaymentAllocationInput & {
    sortOrder: number;
  };

type ResolvedExpensePaymentAllocation = NormalizedExpensePaymentAllocation & {
  accountDbId: string;
};

function optionalMachineInteger(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : null;
}

function buildExpenseCorrectionAudit(input: {
  extraction: Record<string, unknown>;
  occurredAt: Date;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  reviewedSourceCurrency: string | null;
  splits: Array<{
    categoryStableId: string;
    amountCents: number;
    taxCents: number;
  }>;
  operatorUserStableId: string;
  confirmedAt: Date;
}) {
  const machineDate = accountingOptionalString(input.extraction.date);
  const machineSourceCurrency = accountingOptionalString(
    input.extraction.sourceCurrency,
  )?.toUpperCase() ?? null;
  const machineSubtotalCents = optionalMachineInteger(
    input.extraction,
    'subtotalCents',
  );
  const machineTaxCents = optionalMachineInteger(input.extraction, 'taxCents');
  const machineTotalCents = optionalMachineInteger(
    input.extraction,
    'totalCents',
  );
  const suggestedCategoryStableId = accountingOptionalString(
    input.extraction.suggestedCategoryStableId,
  );
  const textractEvidence = input.extraction.textractEvidence;
  const textractFinancialConsistency =
    textractEvidence &&
    typeof textractEvidence === 'object' &&
    !Array.isArray(textractEvidence)
      ? accountingOptionalString(
          (textractEvidence as Record<string, unknown>).financialConsistency,
        )
      : null;
  const machineFinancialConsistency =
    accountingOptionalString(input.extraction.financialConsistency) ??
    textractFinancialConsistency;
  const occurredAtDate = input.occurredAt.toISOString().slice(0, 10);
  const correctedFields: string[] = [];

  if (machineDate && machineDate !== occurredAtDate) {
    correctedFields.push('occurredAt');
  }
  if (
    machineSourceCurrency &&
    input.reviewedSourceCurrency &&
    machineSourceCurrency !== input.reviewedSourceCurrency
  ) {
    correctedFields.push('sourceCurrency');
  }

  const comparableAmountCurrency =
    machineSourceCurrency ?? input.reviewedSourceCurrency ?? 'CAD';
  if (comparableAmountCurrency === 'CAD') {
    if (
      machineSubtotalCents != null &&
      machineSubtotalCents !== input.subtotalCents
    ) {
      correctedFields.push('subtotalCents');
    }
    if (machineTaxCents != null && machineTaxCents !== input.taxCents) {
      correctedFields.push('taxCents');
    }
    if (machineTotalCents != null && machineTotalCents !== input.totalCents) {
      correctedFields.push('totalCents');
    }
  }

  const reviewedCategoryStableIds = Array.from(
    new Set(input.splits.map((split) => split.categoryStableId)),
  );
  if (
    suggestedCategoryStableId &&
    (reviewedCategoryStableIds.length !== 1 ||
      reviewedCategoryStableIds[0] !== suggestedCategoryStableId)
  ) {
    correctedFields.push('categoryStableId');
  }

  return {
    version: 1,
    machineFinancialConsistency,
    machine: {
      date: machineDate,
      subtotalCents: machineSubtotalCents,
      taxCents: machineTaxCents,
      totalCents: machineTotalCents,
      sourceCurrency: machineSourceCurrency,
      suggestedCategoryStableId,
    },
    reviewedBooking: {
      occurredAt: occurredAtDate,
      subtotalCents: input.subtotalCents,
      taxCents: input.taxCents,
      totalCents: input.totalCents,
      currency: 'CAD',
      sourceCurrency: input.reviewedSourceCurrency,
      categoryStableIds: reviewedCategoryStableIds,
    },
    correctedFields,
    operatorUserStableId: input.operatorUserStableId,
    confirmedAt: input.confirmedAt.toISOString(),
  };
}

@Injectable()
export class AccountingExpenseService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly period: AccountingPeriodService,
  ) {}

  async confirmUnifiedInboxExpense(
    inboxItemStableId: string,
    input: AccountingExpenseInput,
    operatorUserStableId: string,
  ) {
    this.assertNoLegacyExpensePaymentAccount(input);
    const occurredAt = parseAccountingExpenseDate(input.occurredAt);
    assertAccountingExpenseMoney(input.totalCents, 'totalCents');
    const normalizedPaymentAllocations =
      this.normalizeExpensePaymentAllocations(
        input.paymentAllocations,
        input.totalCents,
      );
    if (!input.splits.length) {
      throw new BadRequestException('at least one expense split is required');
    }
    const normalizedSplits = input.splits.map((split) => {
      assertAccountingExpenseMoney(split.amountCents, 'split.amountCents');
      const taxCents = split.taxCents ?? 0;
      assertAccountingExpenseMoney(taxCents, 'split.taxCents');
      return { ...split, taxCents };
    });
    const subtotalCents = normalizedSplits.reduce(
      (sum, split) => sum + split.amountCents,
      0,
    );
    const taxCents = normalizedSplits.reduce(
      (sum, split) => sum + split.taxCents,
      0,
    );
    if (subtotalCents + taxCents !== input.totalCents) {
      throw new BadRequestException(
        'expense splits do not match CAD booking total',
      );
    }
    const requestedSourceCurrency =
      input.sourceCurrency?.trim().toUpperCase() || null;
    if (
      requestedSourceCurrency &&
      !/^[A-Z]{3}$/.test(requestedSourceCurrency)
    ) {
      throw new BadRequestException('sourceCurrency must be a 3-letter code');
    }

    const documentStableId = `expense_${createId()}`;
    await runSerializableAccountingWrite(this.prisma, async (tx) => {
      const inbox = await readAccountingInboxExpenseContext(
        tx,
        inboxItemStableId,
      );
      if (!inbox)
        throw new NotFoundException('accounting inbox item not found');
      if (inbox.status !== AccountingInboxStatus.PENDING_REVIEW) {
        throw new ConflictException(
          'only pending inbox items can be confirmed',
        );
      }
      if (
        inbox.classification !==
          AccountingInboxClassification.EXPENSE_DOCUMENT ||
        inbox.selectedProvider
      ) {
        throw new ConflictException(
          'inbox item must be classified as an expense before confirmation',
        );
      }
      if (inbox.materializedEntityType || inbox.materializedEntityStableId) {
        throw new ConflictException(
          'pending inbox expenses must not already be materialized',
        );
      }
      if (inbox.artifact.acquisitionMode === 'PROVIDER_API') {
        throw new ConflictException(
          'provider API evidence cannot be confirmed as an expense',
        );
      }
      const extraction = accountingJsonRecord(
        inbox.artifact.parseRuns[0]?.resultJson,
      );
      if (extraction.requiresBatchExpenseImport === true) {
        throw new ConflictException(
          'structured expense CSV batch cannot be confirmed as a single expense',
        );
      }

      await this.period.assertOnOrAfterAccountingStartDate(occurredAt, tx);
      await this.period.assertEditableForPeriod(
        occurredAt,
        AccountingTxType.EXPENSE,
        tx,
      );

      const categories = await tx.accountingCategory.findMany({
        where: {
          categoryStableId: {
            in: normalizedSplits.map((split) => split.categoryStableId),
          },
          type: AccountingTxType.EXPENSE,
          isActive: true,
        },
        select: { id: true, categoryStableId: true },
      });
      const categoryMap = new Map(
        categories.map((row) => [row.categoryStableId, row.id]),
      );
      if (
        normalizedSplits.some(
          (split) => !categoryMap.has(split.categoryStableId),
        )
      ) {
        throw new BadRequestException(
          'one or more expense categories are invalid',
        );
      }

      const resolvedPaymentAllocations =
        await this.resolveExpensePaymentAllocations(
          tx,
          normalizedPaymentAllocations,
        );

      const metadata = accountingJsonRecord(inbox.artifact.metadataJson);
      const extractedSourceCurrency = accountingOptionalString(
        extraction.sourceCurrency,
      )?.toUpperCase();
      const reviewedSourceCurrency =
        requestedSourceCurrency ?? extractedSourceCurrency ?? null;
      if (
        reviewedSourceCurrency &&
        !/^[A-Z]{3}$/.test(reviewedSourceCurrency)
      ) {
        throw new BadRequestException('sourceCurrency must be a 3-letter code');
      }

      const confirmedAt = new Date();
      const correctionAudit = buildExpenseCorrectionAudit({
        extraction,
        occurredAt,
        subtotalCents,
        taxCents,
        totalCents: input.totalCents,
        reviewedSourceCurrency,
        splits: normalizedSplits,
        operatorUserStableId,
        confirmedAt,
      });

      const artifactUrl = inbox.artifact.storedUrl
        ? inbox.artifact.kind === AccountingArtifactKind.IMAGE
          ? `/api/v1/accounting/inbox/artifacts/${encodeURIComponent(inbox.artifact.artifactStableId)}/content`
          : inbox.artifact.storedUrl
        : null;
      const attachmentUrls = Array.from(
        new Set(
          [
            artifactUrl,
            ...normalizeAccountingExpenseAttachmentUrls(input.attachmentUrls),
          ].filter((value): value is string => Boolean(value)),
        ),
      );
      const extractionJson = {
        ...extraction,
        reviewedSourceCurrency,
        bookedCurrency: 'CAD',
        bookedSubtotalCents: subtotalCents,
        bookedTaxCents: taxCents,
        bookedTotalCents: input.totalCents,
        bookingReview: correctionAudit,
      } satisfies Record<string, unknown>;

      const created = await tx.accountingExpenseDocument.create({
        data: {
          documentStableId,
          source:
            inbox.artifact.acquisitionMode === 'EMAIL'
              ? AccountingDocumentSource.GMAIL
              : AccountingDocumentSource.MANUAL,
          status: AccountingDocumentStatus.CONFIRMED,
          occurredAt,
          subtotalCents,
          taxCents,
          totalCents: input.totalCents,
          currency: 'CAD',
          gmailMessageId: accountingOptionalString(metadata.gmailMessageId),
          gmailAttachmentId: accountingOptionalString(
            metadata.gmailAttachmentId,
          ),
          fileHash: inbox.artifact.contentHash,
          emailSubject: inbox.artifact.emailSubject,
          attachmentUrls,
          extractedText:
            accountingOptionalString(extraction.extractedText) ??
            inbox.artifact.bodyText,
          extractionJson: extractionJson as Prisma.InputJsonValue,
          memo: input.memo?.trim() || null,
          confirmedAt,
          confirmedByUserStableId: operatorUserStableId,
        },
        select: { id: true },
      });
      await createAccountingExpensePaymentAllocationsInTx(
        tx,
        created.id,
        resolvedPaymentAllocations,
      );

      const splitRows = normalizedSplits.map((split, index) => ({
        txStableId: `accttx_${createId()}`,
        type: AccountingTxType.EXPENSE,
        source: AccountingSourceType.MANUAL,
        amountCents: split.amountCents,
        taxCents: split.taxCents,
        currency: 'CAD',
        occurredAt,
        categoryId: categoryMap.get(split.categoryStableId)!,
        documentId: created.id,
        idempotencyKey: `expense:${documentStableId}:${index}`,
        externalRef: documentStableId,
        memo: input.memo?.trim() || null,
        attachmentUrls,
        createdByUserStableId: operatorUserStableId,
        updatedByUserStableId: operatorUserStableId,
      }));
      await tx.accountingTransaction.createMany({ data: splitRows });
      await tx.accountingAuditLog.createMany({
        data: [
          {
            action: 'CONFIRM_EXPENSE_BOOKING',
            entityType: 'ACCOUNTING_EXPENSE_DOCUMENT',
            entityId: documentStableId,
            operatorActorRef: operatorUserStableId,
            afterJson: correctionAudit as Prisma.InputJsonValue,
          },
          ...splitRows.map((row, index) => ({
            action: 'CREATE',
            entityType: 'ACCOUNTING_TRANSACTION',
            entityId: row.txStableId,
            operatorActorRef: operatorUserStableId,
            afterJson: {
              txStableId: row.txStableId,
              type: row.type,
              source: row.source,
              amountCents: row.amountCents,
              taxCents: row.taxCents,
              currency: row.currency,
              occurredAt: occurredAt.toISOString(),
              categoryStableId: normalizedSplits[index].categoryStableId,
              documentStableId,
              idempotencyKey: row.idempotencyKey,
              externalRef: row.externalRef,
              attachmentUrls,
            } as Prisma.InputJsonValue,
          })),
        ],
      });
      await linkAndConfirmInboxExpenseInTx(
        tx,
        inboxItemStableId,
        documentStableId,
        operatorUserStableId,
      );
    });

    return this.getExpenseDocument(documentStableId);
  }

  async createExpense(
    input: AccountingExpenseInput,
    operatorUserStableId: string,
  ) {
    this.assertNoLegacyExpensePaymentAccount(input);
    const occurredAt = parseAccountingExpenseDate(input.occurredAt);
    assertAccountingExpenseMoney(input.totalCents, 'totalCents');
    const normalizedPaymentAllocations =
      this.normalizeExpensePaymentAllocations(
        input.paymentAllocations,
        input.totalCents,
      );
    if (!input.splits.length) {
      throw new BadRequestException('at least one expense split is required');
    }

    const normalizedSplits = input.splits.map((split) => {
      assertAccountingExpenseMoney(split.amountCents, 'split.amountCents');
      const taxCents = split.taxCents ?? 0;
      assertAccountingExpenseMoney(taxCents, 'split.taxCents');
      return { ...split, taxCents };
    });
    const subtotalCents = normalizedSplits.reduce(
      (sum, split) => sum + split.amountCents,
      0,
    );
    const taxCents = normalizedSplits.reduce(
      (sum, split) => sum + split.taxCents,
      0,
    );
    if (subtotalCents + taxCents !== input.totalCents) {
      throw new BadRequestException(
        `expense does not balance: subtotal(${subtotalCents}) + tax(${taxCents}) != total(${input.totalCents})`,
      );
    }

    const categoryRows = await this.prisma.accountingCategory.findMany({
      where: {
        categoryStableId: {
          in: normalizedSplits.map((split) => split.categoryStableId),
        },
        isActive: true,
      },
      select: { id: true, categoryStableId: true, type: true },
    });
    const categoryMap = new Map(
      categoryRows.map((row) => [row.categoryStableId, row]),
    );
    for (const split of normalizedSplits) {
      const category = categoryMap.get(split.categoryStableId);
      if (!category || category.type !== AccountingTxType.EXPENSE) {
        throw new BadRequestException(
          `invalid EXPENSE categoryStableId: ${split.categoryStableId}`,
        );
      }
    }

    const attachmentUrls = normalizeAccountingExpenseAttachmentUrls(
      input.attachmentUrls,
    );
    const documentStableId = `expense_${createId()}`;
    const document = await runSerializableAccountingWrite(
      this.prisma,
      async (tx) => {
        await this.period.assertOnOrAfterAccountingStartDate(occurredAt, tx);
        await this.period.assertEditableForPeriod(
          occurredAt,
          AccountingTxType.EXPENSE,
          tx,
        );
        const resolvedPaymentAllocations =
          await this.resolveExpensePaymentAllocations(
            tx,
            normalizedPaymentAllocations,
          );

        const created = await tx.accountingExpenseDocument.create({
          data: {
            documentStableId,
            source: AccountingDocumentSource.MANUAL,
            status: AccountingDocumentStatus.CONFIRMED,
            occurredAt,
            subtotalCents,
            taxCents,
            totalCents: input.totalCents,
            currency: 'CAD',
            attachmentUrls,
            memo: input.memo?.trim() || null,
            confirmedAt: new Date(),
            confirmedByUserStableId: operatorUserStableId,
          },
        });
        await createAccountingExpensePaymentAllocationsInTx(
          tx,
          created.id,
          resolvedPaymentAllocations,
        );

        const splitRows = normalizedSplits.map((split, index) => ({
          txStableId: `accttx_${createId()}`,
          type: AccountingTxType.EXPENSE,
          source: AccountingSourceType.MANUAL,
          amountCents: split.amountCents,
          taxCents: split.taxCents,
          currency: 'CAD',
          occurredAt,
          categoryId: categoryMap.get(split.categoryStableId)!.id,
          documentId: created.id,
          idempotencyKey: `expense:${documentStableId}:${index}`,
          externalRef: documentStableId,
          memo: input.memo?.trim() || null,
          attachmentUrls,
          createdByUserStableId: operatorUserStableId,
          updatedByUserStableId: operatorUserStableId,
        }));
        await tx.accountingTransaction.createMany({ data: splitRows });
        await tx.accountingAuditLog.createMany({
          data: splitRows.map((row, index) => ({
            action: 'CREATE',
            entityType: 'ACCOUNTING_TRANSACTION',
            entityId: row.txStableId,
            operatorActorRef: operatorUserStableId,
            afterJson: {
              txStableId: row.txStableId,
              type: row.type,
              source: row.source,
              amountCents: row.amountCents,
              taxCents: row.taxCents,
              currency: row.currency,
              occurredAt: occurredAt.toISOString(),
              categoryStableId: normalizedSplits[index].categoryStableId,
              documentStableId,
              idempotencyKey: row.idempotencyKey,
              externalRef: row.externalRef,
              attachmentUrls,
            } as Prisma.InputJsonValue,
          })),
        });
        return created;
      },
    );

    return this.getExpenseDocument(document.documentStableId);
  }

  async listExpenseDocuments(params: {
    status?: AccountingDocumentStatus;
    limit?: number;
  }) {
    const startAt = await this.period.clampAccountingFromDate(undefined);
    return listAccountingExpenseDocuments(this.prisma, {
      ...params,
      startAt,
    });
  }

  async getExpenseDocument(documentStableId: string) {
    const document = await readAccountingExpenseDocument(
      this.prisma,
      documentStableId,
    );
    if (!document) throw new NotFoundException('expense document not found');
    return document;
  }

  async confirmInboxDocument(
    documentStableId: string,
    input: AccountingExpenseInput,
    operatorUserStableId: string,
  ) {
    this.assertNoLegacyExpensePaymentAccount(input);
    const existing = await this.prisma.accountingExpenseDocument.findUnique({
      where: { documentStableId },
      select: { id: true, status: true, attachmentUrls: true },
    });
    if (!existing) throw new NotFoundException('expense document not found');
    if (existing.status === AccountingDocumentStatus.CONFIRMED) {
      throw new ConflictException('expense document is already confirmed');
    }

    const occurredAt = parseAccountingExpenseDate(input.occurredAt);
    assertAccountingExpenseMoney(input.totalCents, 'totalCents');
    const normalizedPaymentAllocations =
      this.normalizeExpensePaymentAllocations(
        input.paymentAllocations,
        input.totalCents,
      );
    if (!input.splits.length) {
      throw new BadRequestException('at least one expense split is required');
    }
    const normalizedSplits = input.splits.map((split) => {
      assertAccountingExpenseMoney(split.amountCents, 'split.amountCents');
      const taxCents = split.taxCents ?? 0;
      assertAccountingExpenseMoney(taxCents, 'split.taxCents');
      return { ...split, taxCents };
    });
    const subtotalCents = normalizedSplits.reduce(
      (sum, split) => sum + split.amountCents,
      0,
    );
    const taxCents = normalizedSplits.reduce(
      (sum, split) => sum + split.taxCents,
      0,
    );
    if (subtotalCents + taxCents !== input.totalCents) {
      throw new BadRequestException(
        'expense splits do not match document total',
      );
    }

    const categories = await this.prisma.accountingCategory.findMany({
      where: {
        categoryStableId: {
          in: normalizedSplits.map((split) => split.categoryStableId),
        },
        type: AccountingTxType.EXPENSE,
        isActive: true,
      },
      select: { id: true, categoryStableId: true },
    });
    const categoryMap = new Map(
      categories.map((row) => [row.categoryStableId, row.id]),
    );
    if (
      normalizedSplits.some((split) => !categoryMap.has(split.categoryStableId))
    ) {
      throw new BadRequestException(
        'one or more expense categories are invalid',
      );
    }

    const newAttachmentUrls = normalizeAccountingExpenseAttachmentUrls(
      input.attachmentUrls,
    );

    await runSerializableAccountingWrite(this.prisma, async (tx) => {
      await this.period.assertOnOrAfterAccountingStartDate(occurredAt, tx);
      await this.period.assertEditableForPeriod(
        occurredAt,
        AccountingTxType.EXPENSE,
        tx,
      );
      const resolvedPaymentAllocations =
        await this.resolveExpensePaymentAllocations(
          tx,
          normalizedPaymentAllocations,
        );

      const current = await tx.accountingExpenseDocument.findUnique({
        where: { id: existing.id },
        select: { status: true, attachmentUrls: true },
      });
      if (!current) throw new NotFoundException('expense document not found');
      if (current.status === AccountingDocumentStatus.CONFIRMED) {
        throw new ConflictException('expense document is already confirmed');
      }

      const attachmentUrls = Array.from(
        new Set([...current.attachmentUrls, ...newAttachmentUrls]),
      );
      const replacedRows = await tx.accountingTransaction.findMany({
        where: { documentId: existing.id, deletedAt: null },
        select: {
          txStableId: true,
          type: true,
          source: true,
          amountCents: true,
          taxCents: true,
          currency: true,
          occurredAt: true,
          idempotencyKey: true,
          externalRef: true,
          attachmentUrls: true,
        },
      });
      await tx.accountingTransaction.deleteMany({
        where: { documentId: existing.id, deletedAt: null },
      });
      await tx.accountingExpensePaymentAllocation.deleteMany({
        where: { expenseDocumentId: existing.id },
      });
      await tx.accountingExpenseDocument.update({
        where: { id: existing.id },
        data: {
          status: AccountingDocumentStatus.CONFIRMED,
          occurredAt,
          subtotalCents,
          taxCents,
          totalCents: input.totalCents,
          currency: 'CAD',
          attachmentUrls,
          memo: input.memo?.trim() || null,
          confirmedAt: new Date(),
          confirmedByUserStableId: operatorUserStableId,
        },
      });
      await createAccountingExpensePaymentAllocationsInTx(
        tx,
        existing.id,
        resolvedPaymentAllocations,
      );
      const splitRows = normalizedSplits.map((split, index) => ({
        txStableId: `accttx_${createId()}`,
        type: AccountingTxType.EXPENSE,
        source: AccountingSourceType.MANUAL,
        amountCents: split.amountCents,
        taxCents: split.taxCents,
        currency: 'CAD',
        occurredAt,
        categoryId: categoryMap.get(split.categoryStableId)!,
        documentId: existing.id,
        idempotencyKey: `expense:${documentStableId}:${index}`,
        externalRef: documentStableId,
        memo: input.memo?.trim() || null,
        attachmentUrls,
        createdByUserStableId: operatorUserStableId,
        updatedByUserStableId: operatorUserStableId,
      }));
      await tx.accountingTransaction.createMany({ data: splitRows });
      await tx.accountingAuditLog.createMany({
        data: [
          ...replacedRows.map((row) => ({
            action: 'DELETE',
            entityType: 'ACCOUNTING_TRANSACTION',
            entityId: row.txStableId,
            operatorActorRef: operatorUserStableId,
            beforeJson: {
              txStableId: row.txStableId,
              type: row.type,
              source: row.source,
              amountCents: row.amountCents,
              taxCents: row.taxCents,
              currency: row.currency,
              occurredAt: row.occurredAt.toISOString(),
              documentStableId,
              idempotencyKey: row.idempotencyKey,
              externalRef: row.externalRef,
              attachmentUrls: row.attachmentUrls,
            } as Prisma.InputJsonValue,
          })),
          ...splitRows.map((row, index) => ({
            action: 'CREATE',
            entityType: 'ACCOUNTING_TRANSACTION',
            entityId: row.txStableId,
            operatorActorRef: operatorUserStableId,
            afterJson: {
              txStableId: row.txStableId,
              type: row.type,
              source: row.source,
              amountCents: row.amountCents,
              taxCents: row.taxCents,
              currency: row.currency,
              occurredAt: occurredAt.toISOString(),
              categoryStableId: normalizedSplits[index].categoryStableId,
              documentStableId,
              idempotencyKey: row.idempotencyKey,
              externalRef: row.externalRef,
              attachmentUrls,
            } as Prisma.InputJsonValue,
          })),
        ],
      });
      const linkedInbox = await tx.accountingInboxItem.findFirst({
        where: {
          materializedEntityType:
            AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
          materializedEntityStableId: documentStableId,
        },
        select: { inboxItemStableId: true },
      });
      if (linkedInbox) {
        await markInboxExpenseConfirmedInTx(
          tx,
          linkedInbox.inboxItemStableId,
          documentStableId,
          operatorUserStableId,
        );
      }
    });

    return this.getExpenseDocument(documentStableId);
  }

  private assertNoLegacyExpensePaymentAccount(input: AccountingExpenseInput) {
    if (
      Object.prototype.hasOwnProperty.call(
        input as unknown as Record<string, unknown>,
        'accountStableId',
      )
    ) {
      throw new BadRequestException(
        'accountStableId is no longer supported for expenses; use paymentAllocations',
      );
    }
  }

  private normalizeExpensePaymentAllocations(
    input: AccountingExpensePaymentAllocationInput[] | undefined,
    totalCents: number,
  ): NormalizedExpensePaymentAllocation[] {
    if (input === undefined) return [];
    if (!Array.isArray(input)) {
      throw new BadRequestException('paymentAllocations must be an array');
    }

    const seenAccounts = new Set<string>();
    const normalized = input.map((allocation, sortOrder) => {
      if (!allocation || typeof allocation !== 'object') {
        throw new BadRequestException('payment allocation is invalid');
      }
      const accountStableId = allocation.accountStableId?.trim();
      if (!accountStableId) {
        throw new BadRequestException(
          'payment allocation accountStableId is required',
        );
      }
      if (seenAccounts.has(accountStableId)) {
        throw new BadRequestException(
          'paymentAllocations must not repeat an account',
        );
      }
      seenAccounts.add(accountStableId);
      if (
        !Number.isInteger(allocation.amountCents) ||
        allocation.amountCents <= 0
      ) {
        throw new BadRequestException(
          'payment allocation amountCents must be a positive integer',
        );
      }
      return {
        accountStableId,
        amountCents: allocation.amountCents,
        sortOrder,
      };
    });

    if (
      normalized.length > 0 &&
      normalized.reduce(
        (sum, allocation) => sum + allocation.amountCents,
        0,
      ) !== totalCents
    ) {
      throw new BadRequestException(
        'payment allocations do not match CAD booking total',
      );
    }
    return normalized;
  }

  private async resolveExpensePaymentAllocations(
    tx: Prisma.TransactionClient,
    allocations: NormalizedExpensePaymentAllocation[],
  ): Promise<ResolvedExpensePaymentAllocation[]> {
    if (!allocations.length) return [];
    const accounts = await tx.accountingAccount.findMany({
      where: {
        accountStableId: {
          in: allocations.map((allocation) => allocation.accountStableId),
        },
      },
      select: {
        id: true,
        accountStableId: true,
        currency: true,
        isActive: true,
      },
    });
    const accountByStableId = new Map(
      accounts.map((account) => [account.accountStableId, account]),
    );
    return allocations.map((allocation) => {
      const account = accountByStableId.get(allocation.accountStableId);
      if (!account || !account.isActive) {
        throw new BadRequestException(
          `payment account is invalid: ${allocation.accountStableId}`,
        );
      }
      if (account.currency !== 'CAD') {
        throw new BadRequestException(
          'expense payment accounts must use CAD functional currency',
        );
      }
      return {
        ...allocation,
        accountDbId: account.id,
      };
    });
  }
}
