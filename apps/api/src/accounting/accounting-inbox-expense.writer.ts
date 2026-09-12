import { createId } from '@paralleldrive/cuid2';
import {
  AccountingDocumentStatus,
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
  Prisma,
} from '@prisma/client';
import type { normalizeAccountingInboxExpenseMaterialization } from './accounting-inbox-core.policy';
import {
  AccountingInboxWriterConflictError,
  AccountingInboxWriterNotFoundError,
} from './accounting-inbox-core.writer';

type AccountingTx = Prisma.TransactionClient;
type NormalizedExpenseMaterialization = ReturnType<
  typeof normalizeAccountingInboxExpenseMaterialization
>;

export async function materializeInboxExpenseInTx(
  tx: AccountingTx,
  normalized: NormalizedExpenseMaterialization,
) {
  const artifact = await tx.accountingSourceArtifact.findUnique({
    where: { artifactStableId: normalized.artifactStableId },
    select: {
      contentHash: true,
      inboxItem: {
        select: {
          id: true,
          status: true,
          classification: true,
          materializedEntityType: true,
          materializedEntityStableId: true,
        },
      },
    },
  });
  if (!artifact?.inboxItem) {
    throw new AccountingInboxWriterNotFoundError(
      'accounting inbox artifact not found',
    );
  }
  const item = artifact.inboxItem;
  if (
    item.materializedEntityType ===
      AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT &&
    item.materializedEntityStableId
  ) {
    return {
      documentStableId: item.materializedEntityStableId,
      replayed: true,
    };
  }
  if (item.materializedEntityType || item.materializedEntityStableId) {
    throw new AccountingInboxWriterConflictError(
      'inbox artifact is already materialized as another entity',
    );
  }
  if (item.status !== AccountingInboxStatus.PENDING_REVIEW) {
    throw new AccountingInboxWriterConflictError(
      'inbox artifact is not eligible for expense materialization',
    );
  }

  const documentStableId = `expense_${createId()}`;
  await tx.accountingExpenseDocument.create({
    data: {
      documentStableId,
      source: normalized.source,
      status: AccountingDocumentStatus.PENDING_REVIEW,
      occurredAt: normalized.occurredAt,
      subtotalCents: normalized.subtotalCents,
      taxCents: normalized.taxCents,
      totalCents: normalized.totalCents,
      currency: normalized.currency,
      gmailMessageId: normalized.gmailMessageId,
      gmailAttachmentId: normalized.gmailAttachmentId,
      fileHash: artifact.contentHash,
      emailSubject: normalized.emailSubject,
      attachmentUrls: normalized.attachmentUrls,
      extractedText: normalized.extractedText,
      ...(normalized.extractionJson === undefined
        ? {}
        : {
            extractionJson:
              normalized.extractionJson as Prisma.InputJsonValue,
          }),
      memo: normalized.memo,
    },
  });
  await tx.accountingInboxItem.update({
    where: { id: item.id },
    data: {
      classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
      materializedEntityType:
        AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
      materializedEntityStableId: documentStableId,
      version: { increment: 1 },
    },
  });
  return { documentStableId, replayed: false };
}

export async function readInboxExpenseMaterializationReplay(
  tx: AccountingTx,
  normalized: NormalizedExpenseMaterialization,
) {
  const artifact = await tx.accountingSourceArtifact.findUnique({
    where: { artifactStableId: normalized.artifactStableId },
    select: {
      inboxItem: {
        select: {
          materializedEntityType: true,
          materializedEntityStableId: true,
        },
      },
    },
  });
  if (
    artifact?.inboxItem?.materializedEntityType !==
      AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT ||
    !artifact.inboxItem.materializedEntityStableId
  ) {
    throw new AccountingInboxWriterConflictError(
      'expense materialization conflict',
    );
  }
  return {
    documentStableId: artifact.inboxItem.materializedEntityStableId,
    replayed: true,
  };
}

export async function markInboxExpenseConfirmedInTx(
  tx: AccountingTx,
  inboxItemStableId: string,
  documentStableId: string,
  operatorUserStableId: string,
) {
  const item = await tx.accountingInboxItem.findUnique({
    where: { inboxItemStableId },
    select: {
      id: true,
      status: true,
      materializedEntityType: true,
      materializedEntityStableId: true,
    },
  });
  if (!item) {
    throw new AccountingInboxWriterNotFoundError('accounting inbox item not found');
  }
  if (
    item.materializedEntityType !==
      AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT ||
    item.materializedEntityStableId !== documentStableId
  ) {
    throw new AccountingInboxWriterConflictError(
      'inbox item is not linked to the expense document',
    );
  }
  if (item.status === AccountingInboxStatus.CONFIRMED) return;
  if (item.status !== AccountingInboxStatus.PENDING_REVIEW) {
    throw new AccountingInboxWriterConflictError(
      'only pending inbox items can be confirmed',
    );
  }
  await tx.accountingInboxItem.update({
    where: { id: item.id },
    data: {
      status: AccountingInboxStatus.CONFIRMED,
      reviewedAt: new Date(),
      reviewedByUserStableId: operatorUserStableId,
      version: { increment: 1 },
    },
  });
}

export async function discardInboxItemInTx(
  tx: AccountingTx,
  inboxItemStableId: string,
  operatorUserStableId: string,
) {
  const item = await tx.accountingInboxItem.findUnique({
    where: { inboxItemStableId },
    select: {
      id: true,
      status: true,
      materializedEntityType: true,
      materializedEntityStableId: true,
    },
  });
  if (!item) {
    throw new AccountingInboxWriterNotFoundError('accounting inbox item not found');
  }
  if (item.status === AccountingInboxStatus.DISCARDED) {
    return { inboxItemStableId, discarded: true, replayed: true };
  }
  if (
    item.status !== AccountingInboxStatus.PENDING_REVIEW &&
    item.status !== AccountingInboxStatus.QUARANTINED
  ) {
    throw new AccountingInboxWriterConflictError(
      'only pending or quarantined inbox items can be discarded',
    );
  }
  if (
    item.materializedEntityType ===
      AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT
  ) {
    throw new AccountingInboxWriterConflictError(
      'materialized provider financial documents cannot be discarded here',
    );
  }
  const hasExpenseMaterialization =
    item.materializedEntityType ===
      AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT &&
    Boolean(item.materializedEntityStableId);
  if (hasExpenseMaterialization && item.materializedEntityStableId) {
    const expense = await tx.accountingExpenseDocument.findUnique({
      where: { documentStableId: item.materializedEntityStableId },
      select: { id: true, status: true },
    });
    if (!expense) {
      throw new AccountingInboxWriterNotFoundError(
        'materialized expense document not found',
      );
    }
    if (expense.status === AccountingDocumentStatus.CONFIRMED) {
      throw new AccountingInboxWriterConflictError(
        'confirmed expense documents cannot be discarded from inbox',
      );
    }
    await tx.accountingExpenseDocument.update({
      where: { id: expense.id },
      data: { status: AccountingDocumentStatus.DISCARDED },
    });
  }
  await tx.accountingInboxItem.update({
    where: { id: item.id },
    data: {
      status: AccountingInboxStatus.DISCARDED,
      ...(hasExpenseMaterialization
        ? {
            classification: AccountingInboxClassification.UNKNOWN,
            materializedEntityType: null,
            materializedEntityStableId: null,
          }
        : {}),
      reviewedAt: new Date(),
      reviewedByUserStableId: operatorUserStableId,
      version: { increment: 1 },
    },
  });
  await tx.accountingAuditLog.create({
    data: {
      action: 'DISCARD',
      entityType: 'ACCOUNTING_INBOX_ITEM',
      entityId: inboxItemStableId,
      operatorUserId: operatorUserStableId,
    },
  });
  return { inboxItemStableId, discarded: true, replayed: false };
}
