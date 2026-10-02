import { createId } from '@paralleldrive/cuid2';
import {
  AccountingArtifactAcquisitionMode,
  AccountingArtifactKind,
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
  Prisma,
} from '@prisma/client';
import {
  AccountingInboxWriterConflictError,
  AccountingInboxWriterNotFoundError,
} from './accounting-inbox-core.writer';
import { assessAccountingExpenseEvidenceReadiness } from './accounting-expense-evidence.policy';

type AccountingTx = Prisma.TransactionClient;

export async function linkExpenseEvidenceSourceInTx(
  tx: AccountingTx,
  notificationInboxItemStableId: string,
  sourceArtifactStableId: string,
  operatorUserStableId: string,
) {
  const notification = await tx.accountingInboxItem.findUnique({
    where: { inboxItemStableId: notificationInboxItemStableId },
    select: {
      id: true,
      status: true,
      classification: true,
      selectedProvider: true,
      materializedEntityType: true,
      materializedEntityStableId: true,
      artifact: {
        select: {
          kind: true,
          acquisitionMode: true,
          storedUrl: true,
          bodyText: true,
          emailSubject: true,
          parseRuns: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { resultJson: true },
          },
        },
      },
      expenseEvidenceNotificationLink: {
        select: {
          linkStableId: true,
          sourceInboxItem: {
            select: {
              inboxItemStableId: true,
              artifact: { select: { artifactStableId: true } },
            },
          },
        },
      },
    },
  });
  if (!notification) {
    throw new AccountingInboxWriterNotFoundError(
      'expense notification inbox item not found',
    );
  }
  if (
    notification.status !== AccountingInboxStatus.PENDING_REVIEW ||
    notification.classification !==
      AccountingInboxClassification.EXPENSE_DOCUMENT ||
    notification.selectedProvider ||
    notification.materializedEntityType ||
    notification.materializedEntityStableId
  ) {
    throw new AccountingInboxWriterConflictError(
      'expense notification is not eligible for supplemental evidence',
    );
  }
  if (
    notification.artifact.kind !== AccountingArtifactKind.EMAIL_BODY ||
    notification.artifact.acquisitionMode !==
      AccountingArtifactAcquisitionMode.EMAIL
  ) {
    throw new AccountingInboxWriterConflictError(
      'supplemental expense evidence can only be linked from an email-body notification',
    );
  }

  if (notification.expenseEvidenceNotificationLink) {
    if (
      notification.expenseEvidenceNotificationLink.sourceInboxItem.artifact
        .artifactStableId === sourceArtifactStableId
    ) {
      return {
        linkStableId: notification.expenseEvidenceNotificationLink.linkStableId,
        notificationInboxItemStableId,
        sourceInboxItemStableId:
          notification.expenseEvidenceNotificationLink.sourceInboxItem
            .inboxItemStableId,
        sourceArtifactStableId,
        replayed: true,
      };
    }
    throw new AccountingInboxWriterConflictError(
      'expense notification already has a linked source document',
    );
  }

  const notificationReadiness = assessAccountingExpenseEvidenceReadiness({
    artifact: notification.artifact,
    extraction: jsonRecord(notification.artifact.parseRuns[0]?.resultJson),
  });
  if (notificationReadiness.status !== 'SUPPLEMENT_REQUIRED') {
    throw new AccountingInboxWriterConflictError(
      'expense email already has sufficient standalone source evidence',
    );
  }

  const sourceArtifact = await tx.accountingSourceArtifact.findUnique({
    where: { artifactStableId: sourceArtifactStableId },
    select: {
      id: true,
      artifactStableId: true,
      acquisitionMode: true,
      kind: true,
      storedUrl: true,
      inboxItem: {
        select: {
          id: true,
          inboxItemStableId: true,
          status: true,
          classification: true,
          selectedProvider: true,
          materializedEntityType: true,
          materializedEntityStableId: true,
          expenseEvidenceSourceLink: {
            select: { linkStableId: true },
          },
          artifact: {
            select: {
              parseRuns: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { resultJson: true },
              },
            },
          },
        },
      },
    },
  });
  if (!sourceArtifact?.inboxItem) {
    throw new AccountingInboxWriterNotFoundError(
      'supplemental expense source artifact not found',
    );
  }
  const source = sourceArtifact.inboxItem;
  if (
    source.id === notification.id ||
    source.status !== AccountingInboxStatus.PENDING_REVIEW ||
    source.materializedEntityType ||
    source.materializedEntityStableId
  ) {
    throw new AccountingInboxWriterConflictError(
      'supplemental expense source is not pending unmaterialized evidence',
    );
  }
  if (
    sourceArtifact.acquisitionMode ===
      AccountingArtifactAcquisitionMode.PROVIDER_API ||
    sourceArtifact.kind === AccountingArtifactKind.EMAIL_BODY ||
    !sourceArtifact.storedUrl
  ) {
    throw new AccountingInboxWriterConflictError(
      'supplemental expense source must be a retained file artifact',
    );
  }
  if (
    source.classification ===
      AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT ||
    source.selectedProvider
  ) {
    throw new AccountingInboxWriterConflictError(
      'provider financial evidence cannot be linked as an ordinary expense source',
    );
  }
  if (source.expenseEvidenceSourceLink) {
    throw new AccountingInboxWriterConflictError(
      'supplemental expense source is already linked to another notification',
    );
  }
  const extraction = jsonRecord(source.artifact.parseRuns[0]?.resultJson);
  if (extraction.requiresBatchExpenseImport === true) {
    throw new AccountingInboxWriterConflictError(
      'structured expense CSV batch cannot be linked as a single expense source',
    );
  }

  if (
    source.classification !== AccountingInboxClassification.EXPENSE_DOCUMENT
  ) {
    await tx.accountingInboxItem.update({
      where: { id: source.id },
      data: {
        classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
        selectedProvider: null,
        version: { increment: 1 },
      },
    });
  }

  const linkStableId = `acctexplink_${createId()}`;
  await tx.accountingExpenseEvidenceLink.create({
    data: {
      linkStableId,
      notificationInboxItemId: notification.id,
      sourceInboxItemId: source.id,
      linkedByUserStableId: operatorUserStableId,
    },
  });
  await tx.accountingAuditLog.create({
    data: {
      action: 'LINK_EXPENSE_SOURCE_EVIDENCE',
      entityType: 'ACCOUNTING_INBOX_ITEM',
      entityId: notificationInboxItemStableId,
      operatorActorRef: operatorUserStableId,
      afterJson: {
        linkStableId,
        sourceInboxItemStableId: source.inboxItemStableId,
        sourceArtifactStableId: sourceArtifact.artifactStableId,
      } as Prisma.InputJsonValue,
    },
  });

  return {
    linkStableId,
    notificationInboxItemStableId,
    sourceInboxItemStableId: source.inboxItemStableId,
    sourceArtifactStableId: sourceArtifact.artifactStableId,
    replayed: false,
  };
}

export async function unlinkExpenseEvidenceSourceInTx(
  tx: AccountingTx,
  notificationInboxItemStableId: string,
  operatorUserStableId: string,
) {
  const notification = await tx.accountingInboxItem.findUnique({
    where: { inboxItemStableId: notificationInboxItemStableId },
    select: {
      id: true,
      status: true,
      classification: true,
      selectedProvider: true,
      materializedEntityType: true,
      materializedEntityStableId: true,
      expenseEvidenceNotificationLink: {
        select: {
          id: true,
          linkStableId: true,
          sourceInboxItem: {
            select: {
              id: true,
              inboxItemStableId: true,
              status: true,
              materializedEntityType: true,
              materializedEntityStableId: true,
              artifact: { select: { acquisitionMode: true } },
            },
          },
        },
      },
    },
  });
  if (!notification?.expenseEvidenceNotificationLink) {
    throw new AccountingInboxWriterNotFoundError(
      'expense notification source evidence link not found',
    );
  }
  if (
    notification.status !== AccountingInboxStatus.PENDING_REVIEW ||
    notification.classification !==
      AccountingInboxClassification.EXPENSE_DOCUMENT ||
    notification.selectedProvider ||
    notification.materializedEntityType ||
    notification.materializedEntityStableId
  ) {
    throw new AccountingInboxWriterConflictError(
      'expense notification evidence link cannot be changed after review',
    );
  }

  const link = notification.expenseEvidenceNotificationLink;
  const source = link.sourceInboxItem;
  if (
    source.status !== AccountingInboxStatus.PENDING_REVIEW ||
    source.materializedEntityType ||
    source.materializedEntityStableId
  ) {
    throw new AccountingInboxWriterConflictError(
      'linked expense source evidence cannot be removed after review',
    );
  }

  await tx.accountingExpenseEvidenceLink.delete({
    where: { id: link.id },
  });

  const manualSource =
    source.artifact.acquisitionMode ===
    AccountingArtifactAcquisitionMode.MANUAL_UPLOAD;
  if (manualSource) {
    await tx.accountingInboxItem.update({
      where: { id: source.id },
      data: {
        status: AccountingInboxStatus.DISCARDED,
        reviewedAt: new Date(),
        reviewedByUserStableId: operatorUserStableId,
        version: { increment: 1 },
      },
    });
  }

  await tx.accountingAuditLog.create({
    data: {
      action: 'UNLINK_EXPENSE_SOURCE_EVIDENCE',
      entityType: 'ACCOUNTING_INBOX_ITEM',
      entityId: notificationInboxItemStableId,
      operatorActorRef: operatorUserStableId,
      beforeJson: {
        linkStableId: link.linkStableId,
        sourceInboxItemStableId: source.inboxItemStableId,
      } as Prisma.InputJsonValue,
      afterJson: {
        sourceDisposition: manualSource ? 'DISCARDED' : 'PENDING_REVIEW',
      } as Prisma.InputJsonValue,
    },
  });

  return {
    notificationInboxItemStableId,
    sourceInboxItemStableId: source.inboxItemStableId,
    unlinked: true,
    sourceDisposition: manualSource ? 'DISCARDED' : 'PENDING_REVIEW',
  };
}

export async function closeExpenseNotificationForReviewInTx(
  tx: AccountingTx,
  input: {
    notificationInboxItemStableId: string;
    sourceInboxItemStableId: string;
    documentStableId: string;
    operatorUserStableId: string;
  },
) {
  const notification = await tx.accountingInboxItem.findUnique({
    where: { inboxItemStableId: input.notificationInboxItemStableId },
    select: {
      id: true,
      status: true,
      classification: true,
      selectedProvider: true,
      materializedEntityType: true,
      materializedEntityStableId: true,
      expenseEvidenceNotificationLink: {
        select: {
          linkStableId: true,
          sourceInboxItem: {
            select: {
              inboxItemStableId: true,
              materializedEntityType: true,
              materializedEntityStableId: true,
            },
          },
        },
      },
    },
  });
  const link = notification?.expenseEvidenceNotificationLink;
  if (!notification || !link) {
    throw new AccountingInboxWriterConflictError(
      'expense notification has no linked source evidence',
    );
  }
  if (
    link.sourceInboxItem.inboxItemStableId !== input.sourceInboxItemStableId ||
    link.sourceInboxItem.materializedEntityType !==
      AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT ||
    link.sourceInboxItem.materializedEntityStableId !== input.documentStableId
  ) {
    throw new AccountingInboxWriterConflictError(
      'linked expense source is not materialized for this review',
    );
  }
  if (
    notification.status !== AccountingInboxStatus.PENDING_REVIEW ||
    notification.classification !==
      AccountingInboxClassification.EXPENSE_DOCUMENT ||
    notification.selectedProvider ||
    notification.materializedEntityType ||
    notification.materializedEntityStableId
  ) {
    throw new AccountingInboxWriterConflictError(
      'expense notification cannot be closed for review',
    );
  }

  const reviewedAt = new Date();
  await tx.accountingInboxItem.update({
    where: { id: notification.id },
    data: {
      status: AccountingInboxStatus.CONFIRMED,
      classification: AccountingInboxClassification.OTHER_DOCUMENT,
      selectedProvider: null,
      reviewedAt,
      reviewedByUserStableId: input.operatorUserStableId,
      version: { increment: 1 },
    },
  });
  await tx.accountingAuditLog.create({
    data: {
      action: 'BEGIN_EXPENSE_REVIEW_WITH_EVIDENCE',
      entityType: 'ACCOUNTING_INBOX_ITEM',
      entityId: input.notificationInboxItemStableId,
      operatorActorRef: input.operatorUserStableId,
      afterJson: {
        linkStableId: link.linkStableId,
        sourceInboxItemStableId: input.sourceInboxItemStableId,
        documentStableId: input.documentStableId,
        notificationClassification:
          AccountingInboxClassification.OTHER_DOCUMENT,
        notificationReviewedAt: reviewedAt.toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
}

export async function resolveLinkedExpenseEvidenceInTx(
  tx: AccountingTx,
  input: {
    notificationInboxItemStableId: string;
    sourceInboxItemStableId: string;
    documentStableId: string;
    operatorUserStableId: string;
  },
) {
  const notification = await tx.accountingInboxItem.findUnique({
    where: { inboxItemStableId: input.notificationInboxItemStableId },
    select: {
      id: true,
      status: true,
      classification: true,
      selectedProvider: true,
      materializedEntityType: true,
      materializedEntityStableId: true,
      expenseEvidenceNotificationLink: {
        select: {
          linkStableId: true,
          sourceInboxItem: {
            select: { id: true, inboxItemStableId: true },
          },
        },
      },
    },
  });
  if (!notification?.expenseEvidenceNotificationLink) {
    throw new AccountingInboxWriterConflictError(
      'expense notification has no linked source evidence',
    );
  }
  const source = notification.expenseEvidenceNotificationLink.sourceInboxItem;
  if (source.inboxItemStableId !== input.sourceInboxItemStableId) {
    throw new AccountingInboxWriterConflictError(
      'expense notification source evidence changed during confirmation',
    );
  }

  const sourceUpdated = await tx.accountingInboxItem.updateMany({
    where: {
      id: source.id,
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
      classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
      selectedProvider: null,
      materializedEntityType:
        AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
      materializedEntityStableId: input.documentStableId,
      reviewedAt: new Date(),
      reviewedByUserStableId: input.operatorUserStableId,
      version: { increment: 1 },
    },
  });
  if (sourceUpdated.count !== 1) {
    throw new AccountingInboxWriterConflictError(
      'linked expense source could not be confirmed',
    );
  }

  const notificationReviewedAt = new Date();
  const notificationUpdated = await tx.accountingInboxItem.updateMany({
    where: {
      id: notification.id,
      status: AccountingInboxStatus.PENDING_REVIEW,
      classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
      selectedProvider: null,
      materializedEntityType: null,
      materializedEntityStableId: null,
    },
    data: {
      status: AccountingInboxStatus.CONFIRMED,
      classification: AccountingInboxClassification.OTHER_DOCUMENT,
      selectedProvider: null,
      reviewedAt: notificationReviewedAt,
      reviewedByUserStableId: input.operatorUserStableId,
      version: { increment: 1 },
    },
  });
  if (notificationUpdated.count !== 1) {
    throw new AccountingInboxWriterConflictError(
      'expense notification could not be resolved',
    );
  }

  await tx.accountingAuditLog.create({
    data: {
      action: 'RESOLVE_EXPENSE_NOTIFICATION_WITH_EVIDENCE',
      entityType: 'ACCOUNTING_INBOX_ITEM',
      entityId: input.notificationInboxItemStableId,
      operatorActorRef: input.operatorUserStableId,
      afterJson: {
        linkStableId: notification.expenseEvidenceNotificationLink.linkStableId,
        sourceInboxItemStableId: input.sourceInboxItemStableId,
        documentStableId: input.documentStableId,
        notificationClassification:
          AccountingInboxClassification.OTHER_DOCUMENT,
        notificationReviewedAt: notificationReviewedAt.toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
}

function jsonRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
