import { createId } from '@paralleldrive/cuid2';
import {
  AccountingArtifactAcquisitionMode,
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
          selectedProvider: true,
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
  if (
    item.classification !== AccountingInboxClassification.EXPENSE_DOCUMENT ||
    item.selectedProvider
  ) {
    throw new AccountingInboxWriterConflictError(
      'inbox artifact must be classified as an expense before materialization',
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
            extractionJson: normalized.extractionJson as Prisma.InputJsonValue,
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

export async function linkAndConfirmInboxExpenseInTx(
  tx: AccountingTx,
  inboxItemStableId: string,
  documentStableId: string,
  operatorUserStableId: string,
) {
  const updated = await tx.accountingInboxItem.updateMany({
    where: {
      inboxItemStableId,
      status: AccountingInboxStatus.PENDING_REVIEW,
      classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
      selectedProvider: null,
      materializedEntityType: null,
      materializedEntityStableId: null,
    },
    data: {
      status: AccountingInboxStatus.CONFIRMED,
      classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
      materializedEntityType:
        AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
      materializedEntityStableId: documentStableId,
      reviewedAt: new Date(),
      reviewedByUserStableId: operatorUserStableId,
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) {
    throw new AccountingInboxWriterConflictError(
      'pending inbox expense could not be linked and confirmed',
    );
  }
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

export async function prepareGmailExpenseSourceInTx(
  tx: AccountingTx,
  inboxItemStableId: string,
) {
  const item = await tx.accountingInboxItem.findUnique({
    where: { inboxItemStableId },
    select: {
      id: true,
      status: true,
      classification: true,
      selectedProvider: true,
      materializedEntityType: true,
      materializedEntityStableId: true,
    },
  });
  if (!item) {
    throw new AccountingInboxWriterNotFoundError(
      'gmail expense source inbox item not found',
    );
  }
  if (
    item.status !== AccountingInboxStatus.PENDING_REVIEW ||
    item.selectedProvider ||
    item.materializedEntityType ||
    item.materializedEntityStableId ||
    item.classification ===
      AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT
  ) {
    throw new AccountingInboxWriterConflictError(
      'gmail expense source is not eligible for expense review',
    );
  }
  if (item.classification === AccountingInboxClassification.EXPENSE_DOCUMENT) {
    return;
  }
  await tx.accountingInboxItem.update({
    where: { id: item.id },
    data: {
      classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
      version: { increment: 1 },
    },
  });
}

export async function closeGmailMessageSupportingEvidenceInTx(
  tx: AccountingTx,
  input: {
    inboxItemStableIds: string[];
    documentStableId: string;
    operatorUserStableId: string;
  },
) {
  const stableIds = [...new Set(input.inboxItemStableIds.filter(Boolean))];
  if (!stableIds.length) return;

  const rows = await tx.accountingInboxItem.findMany({
    where: { inboxItemStableId: { in: stableIds } },
    select: {
      id: true,
      inboxItemStableId: true,
      status: true,
      classification: true,
      selectedProvider: true,
      materializedEntityType: true,
      materializedEntityStableId: true,
    },
  });
  if (rows.length !== stableIds.length) {
    throw new AccountingInboxWriterNotFoundError(
      'gmail supporting evidence inbox item not found',
    );
  }
  for (const row of rows) {
    if (
      row.status !== AccountingInboxStatus.PENDING_REVIEW ||
      row.selectedProvider ||
      row.materializedEntityType ||
      row.materializedEntityStableId ||
      row.classification ===
        AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT
    ) {
      throw new AccountingInboxWriterConflictError(
        'gmail supporting evidence cannot be closed independently',
      );
    }
  }

  const reviewedAt = new Date();
  const updated = await tx.accountingInboxItem.updateMany({
    where: {
      id: { in: rows.map((row) => row.id) },
      status: AccountingInboxStatus.PENDING_REVIEW,
      selectedProvider: null,
      materializedEntityType: null,
      materializedEntityStableId: null,
      classification: {
        not: AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
      },
    },
    data: {
      status: AccountingInboxStatus.CONFIRMED,
      classification: AccountingInboxClassification.OTHER_DOCUMENT,
      reviewedAt,
      reviewedByUserStableId: input.operatorUserStableId,
      version: { increment: 1 },
    },
  });
  if (updated.count !== rows.length) {
    throw new AccountingInboxWriterConflictError(
      'gmail supporting evidence changed during expense review handoff',
    );
  }

  await tx.accountingAuditLog.create({
    data: {
      action: 'BEGIN_GMAIL_EXPENSE_REVIEW',
      entityType: 'ACCOUNTING_INBOX_ITEM',
      entityId: rows[0]!.inboxItemStableId,
      operatorActorRef: input.operatorUserStableId,
      afterJson: {
        documentStableId: input.documentStableId,
        supportingInboxItemStableIds: rows.map(
          (row) => row.inboxItemStableId,
        ),
        reviewedAt: reviewedAt.toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
}

export async function markInboxExpenseReviewStartedInTx(
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
      classification: true,
      selectedProvider: true,
      materializedEntityType: true,
      materializedEntityStableId: true,
    },
  });
  if (!item) {
    throw new AccountingInboxWriterNotFoundError(
      'accounting inbox item not found',
    );
  }
  if (
    item.materializedEntityType !==
      AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT ||
    item.materializedEntityStableId !== documentStableId
  ) {
    throw new AccountingInboxWriterConflictError(
      'inbox item is not linked to the pending expense review',
    );
  }
  if (
    item.classification !== AccountingInboxClassification.EXPENSE_DOCUMENT ||
    item.selectedProvider
  ) {
    throw new AccountingInboxWriterConflictError(
      'inbox item is not eligible to enter expense review',
    );
  }
  if (item.status === AccountingInboxStatus.CONFIRMED) return;
  if (item.status !== AccountingInboxStatus.PENDING_REVIEW) {
    throw new AccountingInboxWriterConflictError(
      'only pending inbox items can enter expense review',
    );
  }

  const reviewedAt = new Date();
  await tx.accountingInboxItem.update({
    where: { id: item.id },
    data: {
      status: AccountingInboxStatus.CONFIRMED,
      reviewedAt,
      reviewedByUserStableId: operatorUserStableId,
      version: { increment: 1 },
    },
  });
  await tx.accountingAuditLog.create({
    data: {
      action: 'BEGIN_EXPENSE_REVIEW',
      entityType: 'ACCOUNTING_INBOX_ITEM',
      entityId: inboxItemStableId,
      operatorActorRef: operatorUserStableId,
      afterJson: {
        documentStableId,
        reviewedAt: reviewedAt.toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
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
    throw new AccountingInboxWriterNotFoundError(
      'accounting inbox item not found',
    );
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
      expenseEvidenceNotificationLink: { select: { linkStableId: true } },
      expenseEvidenceSourceLink: { select: { linkStableId: true } },
      artifact: { select: { acquisitionMode: true } },
    },
  });
  if (!item) {
    throw new AccountingInboxWriterNotFoundError(
      'accounting inbox item not found',
    );
  }
  if (item.status === AccountingInboxStatus.DISCARDED) {
    return { inboxItemStableId, discarded: true, replayed: true };
  }
  if (item.expenseEvidenceNotificationLink || item.expenseEvidenceSourceLink) {
    throw new AccountingInboxWriterConflictError(
      'linked expense evidence cannot be discarded independently',
    );
  }
  const isManualUploadError =
    item.status === AccountingInboxStatus.ERROR &&
    item.artifact.acquisitionMode ===
      AccountingArtifactAcquisitionMode.MANUAL_UPLOAD;
  if (
    item.status !== AccountingInboxStatus.PENDING_REVIEW &&
    item.status !== AccountingInboxStatus.QUARANTINED &&
    !isManualUploadError
  ) {
    throw new AccountingInboxWriterConflictError(
      'only pending, quarantined, or manual-upload error inbox items can be discarded',
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
      operatorActorRef: operatorUserStableId,
    },
  });
  return { inboxItemStableId, discarded: true, replayed: false };
}
