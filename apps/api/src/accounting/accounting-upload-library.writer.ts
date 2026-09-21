import {
  AccountingArtifactAcquisitionMode,
  AccountingDocumentStatus,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
  Prisma,
} from '@prisma/client';
import {
  AccountingInboxWriterConflictError,
  AccountingInboxWriterNotFoundError,
} from './accounting-inbox-core.writer';

type AccountingTx = Prisma.TransactionClient;

export async function permanentlyDeleteManualUploadInTx(
  tx: AccountingTx,
  inboxItemStableId: string,
) {
  const item = await tx.accountingInboxItem.findUnique({
    where: { inboxItemStableId },
    select: {
      id: true,
      inboxItemStableId: true,
      status: true,
      materializedEntityType: true,
      materializedEntityStableId: true,
      expenseReviewRevisions: {
        select: { reviewRevisionStableId: true },
      },
      artifact: {
        select: {
          id: true,
          artifactStableId: true,
          acquisitionMode: true,
          contentHash: true,
          storedUrl: true,
          financialDocument: {
            select: { id: true, documentStableId: true },
          },
          binaryRetention: {
            select: {
              id: true,
              candidateStoredUrl: true,
              retainedStoredUrl: true,
            },
          },
          duplicateInboxItems: {
            select: {
              id: true,
              inboxItemStableId: true,
              status: true,
              materializedEntityType: true,
              materializedEntityStableId: true,
              expenseReviewRevisions: {
                select: { reviewRevisionStableId: true },
              },
              artifact: {
                select: {
                  id: true,
                  artifactStableId: true,
                  acquisitionMode: true,
                  storedUrl: true,
                  binaryRetention: {
                    select: {
                      id: true,
                      candidateStoredUrl: true,
                      retainedStoredUrl: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!item) {
    throw new AccountingInboxWriterNotFoundError(
      'accounting inbox item not found',
    );
  }
  if (
    item.artifact.acquisitionMode !==
    AccountingArtifactAcquisitionMode.MANUAL_UPLOAD
  ) {
    throw new AccountingInboxWriterConflictError(
      'only manual uploads can be permanently deleted from the upload library',
    );
  }
  if (item.status === AccountingInboxStatus.CONFIRMED) {
    throw new AccountingInboxWriterConflictError(
      'confirmed accounting evidence cannot be permanently deleted',
    );
  }
  if (
    item.materializedEntityType ===
      AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT ||
    item.artifact.financialDocument
  ) {
    throw new AccountingInboxWriterConflictError(
      'provider financial evidence cannot be permanently deleted from the upload library',
    );
  }

  for (const duplicate of item.artifact.duplicateInboxItems) {
    if (
      duplicate.artifact.acquisitionMode !==
      AccountingArtifactAcquisitionMode.MANUAL_UPLOAD
    ) {
      throw new AccountingInboxWriterConflictError(
        'manual upload is referenced by non-manual duplicate evidence',
      );
    }
    if (
      duplicate.status === AccountingInboxStatus.CONFIRMED ||
      duplicate.materializedEntityType ||
      duplicate.materializedEntityStableId
    ) {
      throw new AccountingInboxWriterConflictError(
        'manual upload is referenced by protected duplicate evidence',
      );
    }
  }

  let expenseDocument: {
    id: string;
    documentStableId: string;
    status: AccountingDocumentStatus;
    _count: { transactions: number };
  } | null = null;
  if (
    item.materializedEntityType ===
      AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT &&
    item.materializedEntityStableId
  ) {
    expenseDocument = await tx.accountingExpenseDocument.findUnique({
      where: { documentStableId: item.materializedEntityStableId },
      select: {
        id: true,
        documentStableId: true,
        status: true,
        _count: { select: { transactions: true } },
      },
    });
  } else if (item.status === AccountingInboxStatus.DISCARDED) {
    expenseDocument = await tx.accountingExpenseDocument.findUnique({
      where: { fileHash: item.artifact.contentHash },
      select: {
        id: true,
        documentStableId: true,
        status: true,
        _count: { select: { transactions: true } },
      },
    });
  }
  if (expenseDocument?.status === AccountingDocumentStatus.CONFIRMED) {
    throw new AccountingInboxWriterConflictError(
      'confirmed expense evidence cannot be permanently deleted',
    );
  }
  if (expenseDocument?._count.transactions) {
    throw new AccountingInboxWriterConflictError(
      'expense evidence with accounting transactions cannot be permanently deleted',
    );
  }

  const duplicateInboxIds = item.artifact.duplicateInboxItems.map(
    (duplicate) => duplicate.id,
  );
  const duplicateInboxStableIds = item.artifact.duplicateInboxItems.map(
    (duplicate) => duplicate.inboxItemStableId,
  );
  const duplicateArtifactIds = item.artifact.duplicateInboxItems.map(
    (duplicate) => duplicate.artifact.id,
  );
  const duplicateArtifactStableIds = item.artifact.duplicateInboxItems.map(
    (duplicate) => duplicate.artifact.artifactStableId,
  );
  const artifactIds = [item.artifact.id, ...duplicateArtifactIds];
  const artifactStableIds = [
    item.artifact.artifactStableId,
    ...duplicateArtifactStableIds,
  ];
  const reviewRevisionStableIds = [
    ...item.expenseReviewRevisions.map(
      (review) => review.reviewRevisionStableId,
    ),
    ...item.artifact.duplicateInboxItems.flatMap((duplicate) =>
      duplicate.expenseReviewRevisions.map(
        (review) => review.reviewRevisionStableId,
      ),
    ),
  ];
  const auditEntityIds = [
    item.inboxItemStableId,
    ...duplicateInboxStableIds,
    ...artifactStableIds,
    ...reviewRevisionStableIds,
    ...(expenseDocument ? [expenseDocument.documentStableId] : []),
  ];
  const storedUrls = uniqueStoredUrls([
    item.artifact.storedUrl,
    item.artifact.binaryRetention?.candidateStoredUrl,
    item.artifact.binaryRetention?.retainedStoredUrl,
    ...item.artifact.duplicateInboxItems.flatMap((duplicate) => [
      duplicate.artifact.storedUrl,
      duplicate.artifact.binaryRetention?.candidateStoredUrl,
      duplicate.artifact.binaryRetention?.retainedStoredUrl,
    ]),
  ]);

  await tx.accountingAuditLog.deleteMany({
    where: { entityId: { in: auditEntityIds } },
  });
  if (expenseDocument) {
    await tx.accountingExpenseDocument.delete({
      where: { id: expenseDocument.id },
    });
  }
  await tx.accountingParseRun.deleteMany({
    where: { artifactId: { in: artifactIds } },
  });
  await tx.accountingArtifactBinaryRetention.deleteMany({
    where: { artifactId: { in: artifactIds } },
  });
  if (duplicateInboxIds.length) {
    await tx.accountingInboxItem.deleteMany({
      where: { id: { in: duplicateInboxIds } },
    });
  }
  await tx.accountingInboxItem.delete({ where: { id: item.id } });
  await tx.accountingSourceArtifact.deleteMany({
    where: { id: { in: artifactIds } },
  });

  return {
    inboxItemStableId,
    deleted: true,
    deletedArtifactStableIds: artifactStableIds,
    removedDuplicateCount: duplicateInboxIds.length,
    storedUrls,
  };
}

function uniqueStoredUrls(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}
