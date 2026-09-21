import {
  AccountingArtifactAcquisitionMode,
  AccountingDocumentStatus,
  AccountingInboxStatus,
} from '@prisma/client';
import { permanentlyDeleteManualUploadInTx } from './accounting-upload-library.writer';
import { AccountingInboxWriterConflictError } from './accounting-inbox-core.writer';

function makeTx() {
  return {
    accountingSourceArtifact: {
      findUnique: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    accountingInboxItem: {
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn(),
    },
    accountingExpenseDocument: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    accountingAuditLog: { deleteMany: jest.fn() },
    accountingParseRun: { deleteMany: jest.fn() },
    accountingArtifactBinaryRetention: { deleteMany: jest.fn() },
  };
}

describe('Accounting upload library writer', () => {
  it('permanently deletes an unconfirmed manual upload and its manual duplicate records', async () => {
    const tx = makeTx();
    tx.accountingInboxItem.findUnique.mockResolvedValue({
      id: 'inbox-db-1',
      inboxItemStableId: 'acctinbox_1',
      status: AccountingInboxStatus.DISCARDED,
      materializedEntityType: null,
      materializedEntityStableId: null,
      expenseReviewRevisions: [
        { reviewRevisionStableId: 'acctexpreview_primary' },
      ],
      artifact: {
        id: 'artifact-db-1',
        artifactStableId: 'acctart_1',
        acquisitionMode: AccountingArtifactAcquisitionMode.MANUAL_UPLOAD,
        contentHash: 'a'.repeat(64),
        storedUrl: '/api/v1/accounting/files/inbox/original.pdf',
        financialDocument: null,
        binaryRetention: null,
        duplicateInboxItems: [
          {
            id: 'inbox-db-2',
            inboxItemStableId: 'acctinbox_2',
            status: AccountingInboxStatus.DUPLICATE,
            materializedEntityType: null,
            materializedEntityStableId: null,
            expenseReviewRevisions: [
              { reviewRevisionStableId: 'acctexpreview_duplicate' },
            ],
            artifact: {
              id: 'artifact-db-2',
              artifactStableId: 'acctart_2',
              acquisitionMode: AccountingArtifactAcquisitionMode.MANUAL_UPLOAD,
              storedUrl: null,
              binaryRetention: null,
            },
          },
        ],
      },
    });
    tx.accountingExpenseDocument.findUnique.mockResolvedValue({
      id: 'expense-db-1',
      documentStableId: 'expense_1',
      status: AccountingDocumentStatus.DISCARDED,
      _count: { transactions: 0 },
    });
    tx.accountingAuditLog.deleteMany.mockResolvedValue({ count: 2 });
    tx.accountingExpenseDocument.delete.mockResolvedValue({});
    tx.accountingParseRun.deleteMany.mockResolvedValue({ count: 1 });
    tx.accountingArtifactBinaryRetention.deleteMany.mockResolvedValue({
      count: 0,
    });
    tx.accountingInboxItem.deleteMany.mockResolvedValue({ count: 1 });
    tx.accountingInboxItem.delete.mockResolvedValue({});
    tx.accountingSourceArtifact.deleteMany.mockResolvedValue({ count: 2 });

    const result = await permanentlyDeleteManualUploadInTx(
      tx as never,
      'acctinbox_1',
    );

    expect(result).toEqual({
      inboxItemStableId: 'acctinbox_1',
      deleted: true,
      deletedArtifactStableIds: ['acctart_1', 'acctart_2'],
      removedDuplicateCount: 1,
      storedUrls: ['/api/v1/accounting/files/inbox/original.pdf'],
    });
    expect(tx.accountingAuditLog.deleteMany).toHaveBeenCalledWith({
      where: {
        entityId: {
          in: expect.arrayContaining([
            'acctexpreview_primary',
            'acctexpreview_duplicate',
          ]) as unknown as string[],
        },
      },
    });
    expect(tx.accountingExpenseDocument.delete).toHaveBeenCalledWith({
      where: { id: 'expense-db-1' },
    });
    expect(tx.accountingInboxItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['inbox-db-2'] } },
    });
    expect(tx.accountingInboxItem.delete).toHaveBeenCalledWith({
      where: { id: 'inbox-db-1' },
    });
    expect(tx.accountingSourceArtifact.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['artifact-db-1', 'artifact-db-2'] } },
    });
  });

  it('rejects permanent deletion once the manual upload is confirmed', async () => {
    const tx = makeTx();
    tx.accountingInboxItem.findUnique.mockResolvedValue({
      id: 'inbox-db-1',
      inboxItemStableId: 'acctinbox_confirmed',
      status: AccountingInboxStatus.CONFIRMED,
      materializedEntityType: null,
      materializedEntityStableId: null,
      artifact: {
        id: 'artifact-db-1',
        artifactStableId: 'acctart_confirmed',
        acquisitionMode: AccountingArtifactAcquisitionMode.MANUAL_UPLOAD,
        contentHash: 'a'.repeat(64),
        storedUrl: '/api/v1/accounting/files/inbox/confirmed.pdf',
        financialDocument: null,
        binaryRetention: null,
        duplicateInboxItems: [],
      },
    });

    await expect(
      permanentlyDeleteManualUploadInTx(tx as never, 'acctinbox_confirmed'),
    ).rejects.toBeInstanceOf(AccountingInboxWriterConflictError);
    expect(tx.accountingInboxItem.delete).not.toHaveBeenCalled();
    expect(tx.accountingSourceArtifact.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects deletion when a non-manual duplicate depends on the source artifact', async () => {
    const tx = makeTx();
    tx.accountingInboxItem.findUnique.mockResolvedValue({
      id: 'inbox-db-1',
      inboxItemStableId: 'acctinbox_1',
      status: AccountingInboxStatus.PENDING_REVIEW,
      materializedEntityType: null,
      materializedEntityStableId: null,
      artifact: {
        id: 'artifact-db-1',
        artifactStableId: 'acctart_1',
        acquisitionMode: AccountingArtifactAcquisitionMode.MANUAL_UPLOAD,
        contentHash: 'a'.repeat(64),
        storedUrl: '/api/v1/accounting/files/inbox/original.pdf',
        financialDocument: null,
        binaryRetention: null,
        duplicateInboxItems: [
          {
            id: 'inbox-db-email',
            inboxItemStableId: 'acctinbox_email',
            status: AccountingInboxStatus.DUPLICATE,
            materializedEntityType: null,
            materializedEntityStableId: null,
            artifact: {
              id: 'artifact-db-email',
              artifactStableId: 'acctart_email',
              acquisitionMode: AccountingArtifactAcquisitionMode.EMAIL,
              storedUrl: '/api/v1/accounting/files/inbox/email.pdf',
              binaryRetention: null,
            },
          },
        ],
      },
    });

    await expect(
      permanentlyDeleteManualUploadInTx(tx as never, 'acctinbox_1'),
    ).rejects.toThrow('non-manual duplicate evidence');
    expect(tx.accountingInboxItem.delete).not.toHaveBeenCalled();
  });
});
