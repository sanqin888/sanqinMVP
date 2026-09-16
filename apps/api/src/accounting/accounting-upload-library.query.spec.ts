import {
  AccountingArtifactAcquisitionMode,
  AccountingArtifactBinaryRetentionState,
  AccountingArtifactKind,
  AccountingInboxClassification,
  AccountingInboxStatus,
} from '@prisma/client';
import { listAccountingManualUploadLibrary } from './accounting-inbox-query';

describe('Accounting manual upload library query', () => {
  it('shows manual upload lifecycle permissions and hides duplicate binary links', async () => {
    const now = new Date('2026-09-16T01:00:00.000Z');
    const findMany = jest.fn().mockResolvedValue([
      {
        inboxItemStableId: 'acctinbox_duplicate',
        status: AccountingInboxStatus.DUPLICATE,
        classification: AccountingInboxClassification.UNKNOWN,
        selectedProvider: null,
        materializedEntityType: null,
        materializedEntityStableId: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
        duplicateOfArtifact: {
          artifactStableId: 'acctart_original',
          originalFilename: 'receipt.pdf',
          inboxItem: { status: AccountingInboxStatus.DISCARDED },
        },
        artifact: {
          artifactStableId: 'acctart_duplicate',
          kind: AccountingArtifactKind.PDF,
          originalFilename: 'receipt.pdf',
          byteSize: 80_013,
          storedUrl: null,
          financialDocument: null,
          duplicateInboxItems: [],
          binaryRetention: null,
        },
      },
      {
        inboxItemStableId: 'acctinbox_confirmed_image',
        status: AccountingInboxStatus.CONFIRMED,
        classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
        selectedProvider: null,
        materializedEntityType: 'EXPENSE_DOCUMENT',
        materializedEntityStableId: 'expense_1',
        reviewedAt: now,
        createdAt: now,
        updatedAt: now,
        duplicateOfArtifact: null,
        artifact: {
          artifactStableId: 'acctart_image',
          kind: AccountingArtifactKind.IMAGE,
          originalFilename: 'receipt.jpg',
          byteSize: 1_000_000,
          storedUrl: '/api/v1/accounting/files/inbox/receipt.jpg',
          financialDocument: null,
          duplicateInboxItems: [],
          binaryRetention: {
            state: AccountingArtifactBinaryRetentionState.ORIGINAL_PRESENT,
            retainedStoredUrl: null,
          },
        },
      },
    ]);
    const client = { accountingInboxItem: { findMany } };

    const result = await listAccountingManualUploadLibrary(client as never, 200);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          artifact: {
            is: {
              acquisitionMode: AccountingArtifactAcquisitionMode.MANUAL_UPLOAD,
            },
          },
        },
        take: 200,
      }) as unknown,
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        inboxItemStableId: 'acctinbox_duplicate',
        status: AccountingInboxStatus.DUPLICATE,
        contentUrl: null,
        canDiscard: false,
        canPermanentDelete: true,
        duplicateOf: expect.objectContaining({
          artifactStableId: 'acctart_original',
          status: AccountingInboxStatus.DISCARDED,
        }) as unknown,
      }) as unknown,
    );
    expect(result[1]).toEqual(
      expect.objectContaining({
        inboxItemStableId: 'acctinbox_confirmed_image',
        contentUrl: '/api/v1/accounting/inbox/artifacts/acctart_image/content',
        canDiscard: false,
        canPermanentDelete: false,
      }) as unknown,
    );
  });

  it('blocks permanent deletion when the source anchors non-manual duplicate evidence', async () => {
    const now = new Date('2026-09-16T01:00:00.000Z');
    const findMany = jest.fn().mockResolvedValue([
      {
        inboxItemStableId: 'acctinbox_manual',
        status: AccountingInboxStatus.PENDING_REVIEW,
        classification: AccountingInboxClassification.UNKNOWN,
        selectedProvider: null,
        materializedEntityType: null,
        materializedEntityStableId: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
        duplicateOfArtifact: null,
        artifact: {
          artifactStableId: 'acctart_manual',
          kind: AccountingArtifactKind.PDF,
          originalFilename: 'receipt.pdf',
          byteSize: 1000,
          storedUrl: '/api/v1/accounting/files/inbox/receipt.pdf',
          financialDocument: null,
          duplicateInboxItems: [
            {
              status: AccountingInboxStatus.DUPLICATE,
              materializedEntityType: null,
              materializedEntityStableId: null,
              artifact: {
                acquisitionMode: AccountingArtifactAcquisitionMode.EMAIL,
              },
            },
          ],
          binaryRetention: null,
        },
      },
    ]);
    const client = { accountingInboxItem: { findMany } };

    const result = await listAccountingManualUploadLibrary(client as never, 50);

    expect(result[0]).toEqual(
      expect.objectContaining({
        canDiscard: true,
        canPermanentDelete: false,
      }) as unknown,
    );
  });
});
