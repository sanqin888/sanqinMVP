import {
  AccountingArtifactBinaryRetentionState,
  AccountingArtifactKind,
  AccountingDocumentStatus,
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
} from '@prisma/client';
import {
  beginAccountingImageOriginalPurgeInTx,
  finalizeAccountingImageOriginalPurgeInTx,
  stageAccountingImageRetentionCandidateInTx,
} from './accounting-image-retention.writer';

const ORIGINAL_HASH = 'a'.repeat(64);
const CANDIDATE_HASH = 'b'.repeat(64);

function confirmedImageItem(retention: Record<string, unknown> | null) {
  return {
    status: AccountingInboxStatus.CONFIRMED,
    classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
    selectedProvider: null,
    materializedEntityType:
      AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
    materializedEntityStableId: 'expense_1',
    artifact: {
      id: 'artifact-db-id',
      artifactStableId: 'acctart_image_1',
      kind: AccountingArtifactKind.IMAGE,
      contentHash: ORIGINAL_HASH,
      mimeType: 'image/jpeg',
      byteSize: 5_000_000,
      storedUrl: '/api/v1/accounting/files/inbox/original.jpg',
      binaryRetention: retention,
    },
  };
}

function makeTx(retention: Record<string, unknown> | null) {
  return {
    accountingInboxItem: {
      findUnique: jest.fn().mockResolvedValue(confirmedImageItem(retention)),
    },
    accountingExpenseDocument: {
      findUnique: jest.fn().mockResolvedValue({
        status: AccountingDocumentStatus.CONFIRMED,
      }),
    },
    accountingArtifactBinaryRetention: {
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    accountingAuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

describe('accounting image retention writer', () => {
  it('stages a replaceable candidate without changing original source identity', async () => {
    const tx = makeTx({
      id: 'retention-db-id',
      state: AccountingArtifactBinaryRetentionState.ORIGINAL_PRESENT,
      candidateStoredUrl: null,
    });

    await stageAccountingImageRetentionCandidateInTx(tx as never, {
      inboxItemStableId: 'acctinbox_1',
      operatorUserStableId: 'user_1',
      originalWidth: 4032,
      originalHeight: 3024,
      storedUrl: '/api/v1/accounting/files/image-retention/candidate.webp',
      contentHash: CANDIDATE_HASH,
      byteSize: 420_000,
      mimeType: 'image/webp',
      width: 2400,
      height: 1800,
      profile: 'BALANCED',
      maxDimension: 2400,
      quality: 85,
    });

    expect(tx.accountingArtifactBinaryRetention.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { artifactId: 'artifact-db-id' },
        update: expect.objectContaining({
          state: AccountingArtifactBinaryRetentionState.CANDIDATE_READY,
          candidateContentHash: CANDIDATE_HASH,
          candidateByteSize: 420_000,
        }) as unknown,
      }) as unknown,
    );
    const serialized = JSON.stringify(
      tx.accountingArtifactBinaryRetention.upsert.mock.calls[0][0],
    );
    expect(serialized).not.toContain(`contentHash\":\"${ORIGINAL_HASH}\"`);
  });

  it('moves an accepted candidate to PURGE_PENDING before filesystem deletion', async () => {
    const tx = makeTx({
      id: 'retention-db-id',
      state: AccountingArtifactBinaryRetentionState.CANDIDATE_READY,
      candidateStoredUrl:
        '/api/v1/accounting/files/image-retention/candidate.webp',
      candidateContentHash: CANDIDATE_HASH,
      candidateByteSize: 420_000,
      candidateMimeType: 'image/webp',
      candidateWidth: 2400,
      candidateHeight: 1800,
      candidateProfile: 'BALANCED',
      candidateMaxDimension: 2400,
      candidateQuality: 85,
    });

    const result = await beginAccountingImageOriginalPurgeInTx(
      tx as never,
      'acctinbox_1',
      'user_1',
      1,
    );

    expect(result.state).toBe(
      AccountingArtifactBinaryRetentionState.PURGE_PENDING,
    );
    expect(tx.accountingArtifactBinaryRetention.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: AccountingArtifactBinaryRetentionState.PURGE_PENDING,
          retainedContentHash: CANDIDATE_HASH,
          candidateStoredUrl: null,
          acceptedByUserStableId: 'user_1',
        }) as unknown,
      }) as unknown,
    );
  });

  it('finalizes COMPRESSED_ONLY only after the purge step completes', async () => {
    const tx = makeTx({
      id: 'retention-db-id',
      state: AccountingArtifactBinaryRetentionState.PURGE_PENDING,
      retainedStoredUrl:
        '/api/v1/accounting/files/image-retention/candidate.webp',
      retainedContentHash: CANDIDATE_HASH,
      retainedByteSize: 420_000,
      acceptedByUserStableId: 'user_authorized',
    });

    const result = await finalizeAccountingImageOriginalPurgeInTx(
      tx as never,
      'acctinbox_1',
      'user_retry',
    );

    expect(result.state).toBe(
      AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY,
    );
    expect(tx.accountingArtifactBinaryRetention.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY,
          originalPurgedAt: expect.any(Date) as unknown,
        }) as unknown,
      }) as unknown,
    );
    expect(tx.accountingAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'IMAGE_ORIGINAL_BINARY_PURGED',
          operatorUserId: 'user_authorized',
          afterJson: expect.objectContaining({
            finalizedByUserStableId: 'user_retry',
          }) as unknown,
        }) as unknown,
      }) as unknown,
    );
  });
});
