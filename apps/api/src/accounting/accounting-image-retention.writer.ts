import {
  AccountingArtifactBinaryRetentionState,
  AccountingArtifactKind,
  AccountingDocumentStatus,
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
  Prisma,
} from '@prisma/client';
import {
  AccountingInboxWriterConflictError,
  AccountingInboxWriterNotFoundError,
} from './accounting-inbox-core.writer';

type AccountingTx = Prisma.TransactionClient;

export type AccountingImageRetentionCandidateInput = {
  inboxItemStableId: string;
  operatorUserStableId: string;
  originalWidth: number;
  originalHeight: number;
  storedUrl: string;
  contentHash: string;
  byteSize: number;
  mimeType: 'image/webp';
  width: number;
  height: number;
  profile: string;
  maxDimension: number;
  quality: number;
};

export async function stageAccountingImageRetentionCandidateInTx(
  tx: AccountingTx,
  input: AccountingImageRetentionCandidateInput,
) {
  const context = await requireConfirmedImageExpense(
    tx,
    input.inboxItemStableId,
  );
  const previousCandidateStoredUrl =
    context.artifact.binaryRetention?.candidateStoredUrl ?? null;
  const currentState =
    context.artifact.binaryRetention?.state ??
    AccountingArtifactBinaryRetentionState.ORIGINAL_PRESENT;
  if (
    currentState === AccountingArtifactBinaryRetentionState.PURGE_PENDING ||
    currentState === AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY
  ) {
    throw new AccountingInboxWriterConflictError(
      'image evidence is no longer eligible for a new compression candidate',
    );
  }

  const data = {
    state: AccountingArtifactBinaryRetentionState.CANDIDATE_READY,
    originalWidth: input.originalWidth,
    originalHeight: input.originalHeight,
    candidateStoredUrl: input.storedUrl,
    candidateContentHash: input.contentHash,
    candidateByteSize: input.byteSize,
    candidateMimeType: input.mimeType,
    candidateWidth: input.width,
    candidateHeight: input.height,
    candidateProfile: input.profile,
    candidateMaxDimension: input.maxDimension,
    candidateQuality: input.quality,
  };
  await tx.accountingArtifactBinaryRetention.upsert({
    where: { artifactId: context.artifact.id },
    create: {
      artifactId: context.artifact.id,
      ...data,
    },
    update: data,
  });
  await tx.accountingAuditLog.create({
    data: {
      action: 'IMAGE_RETENTION_CANDIDATE',
      entityType: 'ACCOUNTING_SOURCE_ARTIFACT',
      entityId: context.artifact.artifactStableId,
      operatorUserId: input.operatorUserStableId,
      afterJson: {
        state: AccountingArtifactBinaryRetentionState.CANDIDATE_READY,
        contentHash: input.contentHash,
        byteSize: input.byteSize,
        mimeType: input.mimeType,
        width: input.width,
        height: input.height,
        profile: input.profile,
        maxDimension: input.maxDimension,
        quality: input.quality,
      },
    },
  });

  return {
    artifactStableId: context.artifact.artifactStableId,
    previousCandidateStoredUrl,
    state: AccountingArtifactBinaryRetentionState.CANDIDATE_READY,
  };
}

export async function discardAccountingImageRetentionCandidateInTx(
  tx: AccountingTx,
  inboxItemStableId: string,
  operatorUserStableId: string,
) {
  const context = await requireConfirmedImageExpense(tx, inboxItemStableId);
  const retention = context.artifact.binaryRetention;
  if (!retention) {
    return { candidateStoredUrl: null, replayed: true };
  }
  if (
    retention.state === AccountingArtifactBinaryRetentionState.ORIGINAL_PRESENT
  ) {
    return { candidateStoredUrl: null, replayed: true };
  }
  if (
    retention.state !== AccountingArtifactBinaryRetentionState.CANDIDATE_READY
  ) {
    throw new AccountingInboxWriterConflictError(
      'image compression candidate cannot be discarded after purge acceptance',
    );
  }

  const candidateStoredUrl = retention.candidateStoredUrl;
  await tx.accountingArtifactBinaryRetention.update({
    where: { id: retention.id },
    data: {
      state: AccountingArtifactBinaryRetentionState.ORIGINAL_PRESENT,
      candidateStoredUrl: null,
      candidateContentHash: null,
      candidateByteSize: null,
      candidateMimeType: null,
      candidateWidth: null,
      candidateHeight: null,
      candidateProfile: null,
      candidateMaxDimension: null,
      candidateQuality: null,
    },
  });
  await tx.accountingAuditLog.create({
    data: {
      action: 'IMAGE_RETENTION_CANDIDATE_DISCARDED',
      entityType: 'ACCOUNTING_SOURCE_ARTIFACT',
      entityId: context.artifact.artifactStableId,
      operatorUserId: operatorUserStableId,
      beforeJson: {
        state: retention.state,
        candidateContentHash: retention.candidateContentHash,
        candidateByteSize: retention.candidateByteSize,
      },
      afterJson: {
        state: AccountingArtifactBinaryRetentionState.ORIGINAL_PRESENT,
      },
    },
  });
  return { candidateStoredUrl, replayed: false };
}

export async function beginAccountingImageOriginalPurgeInTx(
  tx: AccountingTx,
  inboxItemStableId: string,
  operatorUserStableId: string,
  compressionPolicyVersion: number,
) {
  const context = await requireConfirmedImageExpense(tx, inboxItemStableId);
  const retention = context.artifact.binaryRetention;
  if (!retention) {
    throw new AccountingInboxWriterConflictError(
      'image compression candidate is not available',
    );
  }
  if (
    retention.state === AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY
  ) {
    return {
      artifactStableId: context.artifact.artifactStableId,
      originalStoredUrl: context.artifact.storedUrl,
      retainedStoredUrl: retention.retainedStoredUrl,
      state: retention.state,
      replayed: true,
    };
  }
  if (
    retention.state === AccountingArtifactBinaryRetentionState.PURGE_PENDING
  ) {
    return {
      artifactStableId: context.artifact.artifactStableId,
      originalStoredUrl: context.artifact.storedUrl,
      retainedStoredUrl: retention.retainedStoredUrl,
      state: retention.state,
      replayed: true,
    };
  }
  if (
    retention.state !==
      AccountingArtifactBinaryRetentionState.CANDIDATE_READY ||
    !retention.candidateStoredUrl ||
    !retention.candidateContentHash ||
    !retention.candidateByteSize ||
    !retention.candidateMimeType ||
    !retention.candidateWidth ||
    !retention.candidateHeight ||
    !retention.candidateProfile ||
    !retention.candidateMaxDimension ||
    !retention.candidateQuality
  ) {
    throw new AccountingInboxWriterConflictError(
      'image compression candidate is incomplete',
    );
  }

  const acceptedAt = new Date();
  await tx.accountingArtifactBinaryRetention.update({
    where: { id: retention.id },
    data: {
      state: AccountingArtifactBinaryRetentionState.PURGE_PENDING,
      retainedStoredUrl: retention.candidateStoredUrl,
      retainedContentHash: retention.candidateContentHash,
      retainedByteSize: retention.candidateByteSize,
      retainedMimeType: retention.candidateMimeType,
      retainedWidth: retention.candidateWidth,
      retainedHeight: retention.candidateHeight,
      retainedProfile: retention.candidateProfile,
      retainedMaxDimension: retention.candidateMaxDimension,
      retainedQuality: retention.candidateQuality,
      compressionPolicyVersion,
      acceptedAt,
      acceptedByUserStableId: operatorUserStableId,
      candidateStoredUrl: null,
      candidateContentHash: null,
      candidateByteSize: null,
      candidateMimeType: null,
      candidateWidth: null,
      candidateHeight: null,
      candidateProfile: null,
      candidateMaxDimension: null,
      candidateQuality: null,
    },
  });
  await tx.accountingAuditLog.create({
    data: {
      action: 'IMAGE_RETENTION_ACCEPTED',
      entityType: 'ACCOUNTING_SOURCE_ARTIFACT',
      entityId: context.artifact.artifactStableId,
      operatorUserId: operatorUserStableId,
      beforeJson: {
        state: retention.state,
        originalContentHash: context.artifact.contentHash,
        originalByteSize: context.artifact.byteSize,
      },
      afterJson: {
        state: AccountingArtifactBinaryRetentionState.PURGE_PENDING,
        retainedContentHash: retention.candidateContentHash,
        retainedByteSize: retention.candidateByteSize,
        retainedMimeType: retention.candidateMimeType,
        retainedWidth: retention.candidateWidth,
        retainedHeight: retention.candidateHeight,
        retainedProfile: retention.candidateProfile,
        retainedMaxDimension: retention.candidateMaxDimension,
        retainedQuality: retention.candidateQuality,
        compressionPolicyVersion,
        acceptedAt: acceptedAt.toISOString(),
      },
    },
  });
  return {
    artifactStableId: context.artifact.artifactStableId,
    originalStoredUrl: context.artifact.storedUrl,
    retainedStoredUrl: retention.candidateStoredUrl,
    state: AccountingArtifactBinaryRetentionState.PURGE_PENDING,
    replayed: false,
  };
}

export async function finalizeAccountingImageOriginalPurgeInTx(
  tx: AccountingTx,
  inboxItemStableId: string,
  operatorUserStableId: string,
) {
  const context = await requireConfirmedImageExpense(tx, inboxItemStableId);
  const retention = context.artifact.binaryRetention;
  if (!retention) {
    throw new AccountingInboxWriterConflictError(
      'image retention state is missing',
    );
  }
  if (
    retention.state === AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY
  ) {
    return {
      artifactStableId: context.artifact.artifactStableId,
      state: retention.state,
      replayed: true,
    };
  }
  if (
    retention.state !== AccountingArtifactBinaryRetentionState.PURGE_PENDING
  ) {
    throw new AccountingInboxWriterConflictError(
      'image original purge has not been accepted',
    );
  }

  const originalPurgedAt = new Date();
  await tx.accountingArtifactBinaryRetention.update({
    where: { id: retention.id },
    data: {
      state: AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY,
      originalPurgedAt,
    },
  });
  await tx.accountingAuditLog.create({
    data: {
      action: 'IMAGE_ORIGINAL_BINARY_PURGED',
      entityType: 'ACCOUNTING_SOURCE_ARTIFACT',
      entityId: context.artifact.artifactStableId,
      operatorUserId: retention.acceptedByUserStableId ?? operatorUserStableId,
      beforeJson: {
        state: AccountingArtifactBinaryRetentionState.PURGE_PENDING,
        originalContentHash: context.artifact.contentHash,
        originalByteSize: context.artifact.byteSize,
      },
      afterJson: {
        state: AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY,
        retainedContentHash: retention.retainedContentHash,
        retainedByteSize: retention.retainedByteSize,
        originalPurgedAt: originalPurgedAt.toISOString(),
        finalizedByUserStableId: operatorUserStableId,
      },
    },
  });
  return {
    artifactStableId: context.artifact.artifactStableId,
    state: AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY,
    replayed: false,
  };
}

async function requireConfirmedImageExpense(
  tx: AccountingTx,
  inboxItemStableId: string,
) {
  const item = await tx.accountingInboxItem.findUnique({
    where: { inboxItemStableId },
    select: {
      status: true,
      classification: true,
      selectedProvider: true,
      materializedEntityType: true,
      materializedEntityStableId: true,
      artifact: {
        select: {
          id: true,
          artifactStableId: true,
          kind: true,
          contentHash: true,
          mimeType: true,
          byteSize: true,
          storedUrl: true,
          binaryRetention: true,
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
    item.status !== AccountingInboxStatus.CONFIRMED ||
    item.classification !== AccountingInboxClassification.EXPENSE_DOCUMENT ||
    item.selectedProvider ||
    item.materializedEntityType !==
      AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT ||
    !item.materializedEntityStableId
  ) {
    throw new AccountingInboxWriterConflictError(
      'image retention requires a confirmed expense inbox item',
    );
  }
  if (
    item.artifact.kind !== AccountingArtifactKind.IMAGE ||
    !item.artifact.storedUrl ||
    !item.artifact.byteSize ||
    !item.artifact.mimeType
  ) {
    throw new AccountingInboxWriterConflictError(
      'image retention is only available for stored image evidence',
    );
  }
  const expense = await tx.accountingExpenseDocument.findUnique({
    where: { documentStableId: item.materializedEntityStableId },
    select: { status: true },
  });
  if (!expense || expense.status !== AccountingDocumentStatus.CONFIRMED) {
    throw new AccountingInboxWriterConflictError(
      'image retention requires a confirmed expense document',
    );
  }
  return item;
}
