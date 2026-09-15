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
      operatorUserId: ACCOUNTING_INBOX_CLASSIFIER_ACTOR,
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
      operatorUserId: operatorUserStableId,
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
      artifact: { select: { acquisitionMode: true } },
    },
  });
  if (!item) {
    throw new AccountingInboxWriterNotFoundError(
      'accounting inbox item not found',
    );
  }
  if (item.status === AccountingInboxStatus.CONFIRMED) {
    return { inboxItemStableId, confirmed: true, replayed: true };
  }
  if (item.status !== AccountingInboxStatus.PENDING_REVIEW) {
    throw new AccountingInboxWriterConflictError(
      'only pending inbox items can be confirmed',
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
      operatorUserId: operatorUserStableId,
      afterJson: {
        classification: AccountingInboxClassification.OTHER_DOCUMENT,
        reviewedAt: reviewedAt.toISOString(),
      },
    },
  });
  return { inboxItemStableId, confirmed: true, replayed: false };
}
