import {
  AccountingArtifactAcquisitionMode,
  AccountingInboxClassification,
  AccountingInboxStatus,
  Prisma,
} from '@prisma/client';
import type { normalizeAccountingInboxClassificationSelection } from './accounting-inbox-core.policy';
import {
  AccountingInboxWriterConflictError,
  AccountingInboxWriterNotFoundError,
} from './accounting-inbox-core.writer';

type AccountingTx = Prisma.TransactionClient;
type NormalizedClassificationSelection = ReturnType<
  typeof normalizeAccountingInboxClassificationSelection
>;

export const ACCOUNTING_INBOX_CLASSIFIER_ACTOR =
  'system:accounting-inbox-classifier';

export async function suggestInboxClassificationInTx(
  tx: AccountingTx,
  artifactStableId: string,
  selection: NormalizedClassificationSelection,
) {
  const artifact = await tx.accountingSourceArtifact.findUnique({
    where: { artifactStableId },
    select: {
      inboxItem: {
        select: {
          id: true,
          inboxItemStableId: true,
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
    item.status !== AccountingInboxStatus.PENDING_REVIEW ||
    item.classification !== AccountingInboxClassification.UNKNOWN ||
    item.materializedEntityType ||
    item.materializedEntityStableId
  ) {
    return {
      inboxItemStableId: item.inboxItemStableId,
      classification: item.classification,
      selectedProvider: item.selectedProvider,
      applied: false,
    };
  }
  const operatorDecision = await tx.accountingAuditLog.findFirst({
    where: {
      action: 'CLASSIFY',
      entityType: 'ACCOUNTING_INBOX_ITEM',
      entityId: item.inboxItemStableId,
    },
    select: { id: true },
  });
  if (operatorDecision) {
    return {
      inboxItemStableId: item.inboxItemStableId,
      classification: item.classification,
      selectedProvider: item.selectedProvider,
      applied: false,
    };
  }

  await tx.accountingInboxItem.update({
    where: { id: item.id },
    data: {
      classification: selection.classification,
      selectedProvider: selection.selectedProvider,
      version: { increment: 1 },
    },
  });
  await tx.accountingAuditLog.create({
    data: {
      action: 'SUGGEST_CLASSIFICATION',
      entityType: 'ACCOUNTING_INBOX_ITEM',
      entityId: item.inboxItemStableId,
      operatorActorRef: ACCOUNTING_INBOX_CLASSIFIER_ACTOR,
      beforeJson: {
        classification: item.classification,
        selectedProvider: item.selectedProvider,
      },
      afterJson: {
        classification: selection.classification,
        selectedProvider: selection.selectedProvider,
      },
    },
  });
  return {
    inboxItemStableId: item.inboxItemStableId,
    classification: selection.classification,
    selectedProvider: selection.selectedProvider,
    applied: true,
  };
}

export async function setInboxClassificationInTx(
  tx: AccountingTx,
  inboxItemStableId: string,
  selection: NormalizedClassificationSelection,
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
  if (item.status !== AccountingInboxStatus.PENDING_REVIEW) {
    throw new AccountingInboxWriterConflictError(
      'only pending inbox items can be classified',
    );
  }
  if (
    item.artifact.acquisitionMode ===
    AccountingArtifactAcquisitionMode.PROVIDER_API
  ) {
    throw new AccountingInboxWriterConflictError(
      'provider API evidence classification is provider-owned',
    );
  }
  if (item.materializedEntityType || item.materializedEntityStableId) {
    throw new AccountingInboxWriterConflictError(
      'materialized inbox evidence cannot be reclassified',
    );
  }
  if (item.expenseEvidenceNotificationLink || item.expenseEvidenceSourceLink) {
    throw new AccountingInboxWriterConflictError(
      'linked expense evidence cannot be reclassified independently',
    );
  }
  if (
    item.classification === selection.classification &&
    item.selectedProvider === selection.selectedProvider
  ) {
    return {
      inboxItemStableId,
      classification: item.classification,
      selectedProvider: item.selectedProvider,
      changed: false,
    };
  }

  await tx.accountingInboxItem.update({
    where: { id: item.id },
    data: {
      classification: selection.classification,
      selectedProvider: selection.selectedProvider,
      version: { increment: 1 },
    },
  });
  await tx.accountingAuditLog.create({
    data: {
      action: 'CLASSIFY',
      entityType: 'ACCOUNTING_INBOX_ITEM',
      entityId: inboxItemStableId,
      operatorActorRef: operatorUserStableId,
      beforeJson: {
        classification: item.classification,
        selectedProvider: item.selectedProvider,
      },
      afterJson: {
        classification: selection.classification,
        selectedProvider: selection.selectedProvider,
      },
    },
  });
  return {
    inboxItemStableId,
    classification: selection.classification,
    selectedProvider: selection.selectedProvider,
    changed: true,
  };
}

export async function confirmOtherGmailInboxItemsInTx(
  tx: AccountingTx,
  input: {
    primaryInboxItemStableId: string;
    inboxItemStableIds: string[];
    operatorUserStableId: string;
  },
) {
  const stableIds = [...new Set(input.inboxItemStableIds.filter(Boolean))];
  if (!stableIds.length) {
    throw new AccountingInboxWriterConflictError(
      'gmail inbox group has no reviewable evidence',
    );
  }
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
      expenseEvidenceNotificationLink: { select: { linkStableId: true } },
      expenseEvidenceSourceLink: { select: { linkStableId: true } },
      artifact: { select: { acquisitionMode: true } },
    },
  });
  if (rows.length !== stableIds.length) {
    throw new AccountingInboxWriterNotFoundError(
      'gmail inbox group evidence not found',
    );
  }
  const primary = rows.find(
    (row) => row.inboxItemStableId === input.primaryInboxItemStableId,
  );
  if (!primary) {
    throw new AccountingInboxWriterNotFoundError(
      'gmail inbox group primary item not found',
    );
  }
  if (primary.classification !== AccountingInboxClassification.OTHER_DOCUMENT) {
    throw new AccountingInboxWriterConflictError(
      'gmail inbox group primary item must be classified as other evidence',
    );
  }
  for (const row of rows) {
    if (
      row.status !== AccountingInboxStatus.PENDING_REVIEW ||
      row.selectedProvider ||
      row.materializedEntityType ||
      row.materializedEntityStableId ||
      row.expenseEvidenceNotificationLink ||
      row.expenseEvidenceSourceLink ||
      row.artifact.acquisitionMode ===
        AccountingArtifactAcquisitionMode.PROVIDER_API ||
      row.classification ===
        AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT
    ) {
      throw new AccountingInboxWriterConflictError(
        'gmail inbox group cannot be confirmed as other evidence',
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
      'gmail inbox group changed during other-document confirmation',
    );
  }
  await tx.accountingAuditLog.create({
    data: {
      action: 'CONFIRM_GMAIL_OTHER_DOCUMENT',
      entityType: 'ACCOUNTING_INBOX_ITEM',
      entityId: input.primaryInboxItemStableId,
      operatorActorRef: input.operatorUserStableId,
      afterJson: {
        inboxItemStableIds: rows.map((row) => row.inboxItemStableId),
        classification: AccountingInboxClassification.OTHER_DOCUMENT,
        reviewedAt: reviewedAt.toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
  return {
    inboxItemStableId: input.primaryInboxItemStableId,
    confirmed: true,
    replayed: false,
    groupedInboxItemStableIds: rows.map((row) => row.inboxItemStableId),
  };
}

export async function confirmOtherInboxItemInTx(
  tx: AccountingTx,
  inboxItemStableId: string,
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
  if (item.status === AccountingInboxStatus.CONFIRMED) {
    if (
      item.classification === AccountingInboxClassification.OTHER_DOCUMENT &&
      !item.selectedProvider &&
      !item.materializedEntityType &&
      !item.materializedEntityStableId
    ) {
      return { inboxItemStableId, confirmed: true, replayed: true };
    }
    throw new AccountingInboxWriterConflictError(
      'confirmed inbox item is not other-document evidence',
    );
  }
  if (item.status !== AccountingInboxStatus.PENDING_REVIEW) {
    throw new AccountingInboxWriterConflictError(
      'only pending inbox items can be confirmed',
    );
  }
  if (item.expenseEvidenceNotificationLink || item.expenseEvidenceSourceLink) {
    throw new AccountingInboxWriterConflictError(
      'linked expense evidence cannot be confirmed independently',
    );
  }
  if (
    item.artifact.acquisitionMode ===
    AccountingArtifactAcquisitionMode.PROVIDER_API
  ) {
    throw new AccountingInboxWriterConflictError(
      'provider API evidence cannot be confirmed as other evidence',
    );
  }
  if (
    item.classification !== AccountingInboxClassification.OTHER_DOCUMENT ||
    item.selectedProvider ||
    item.materializedEntityType ||
    item.materializedEntityStableId
  ) {
    throw new AccountingInboxWriterConflictError(
      'inbox item is not eligible for other-document confirmation',
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
      action: 'CONFIRM_OTHER_DOCUMENT',
      entityType: 'ACCOUNTING_INBOX_ITEM',
      entityId: inboxItemStableId,
      operatorActorRef: operatorUserStableId,
      afterJson: {
        classification: AccountingInboxClassification.OTHER_DOCUMENT,
        reviewedAt: reviewedAt.toISOString(),
      },
    },
  });
  return { inboxItemStableId, confirmed: true, replayed: false };
}
