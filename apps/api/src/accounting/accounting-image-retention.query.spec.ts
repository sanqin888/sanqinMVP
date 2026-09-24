import {
  AccountingArtifactBinaryRetentionState,
  AccountingArtifactKind,
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
} from '@prisma/client';
import { listAccountingImageRetentionQueue } from './accounting-inbox-query';

describe('Accounting image retention queue query', () => {
  it('returns confirmed expense images whose retention lifecycle is not complete', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        inboxItemStableId: 'acctinbox_image_1',
        materializedEntityStableId: 'expense_1',
        createdAt: new Date('2026-09-15T20:00:00.000Z'),
        updatedAt: new Date('2026-09-15T20:05:00.000Z'),
        artifact: {
          artifactStableId: 'acctart_image_1',
          originalFilename: 'receipt.jpg',
          mimeType: 'image/jpeg',
          byteSize: 1_000_000,
          binaryRetention: {
            state: AccountingArtifactBinaryRetentionState.CANDIDATE_READY,
            originalWidth: 3000,
            originalHeight: 2000,
            candidateStoredUrl:
              '/api/v1/accounting/files/image-retention/candidate.webp',
            candidateContentHash: 'b'.repeat(64),
            candidateByteSize: 400_000,
            candidateMimeType: 'image/webp',
            candidateWidth: 2400,
            candidateHeight: 1600,
            candidateProfile: 'BALANCED',
            candidateMaxDimension: 2400,
            candidateQuality: 85,
          },
        },
      },
    ]);
    const client = {
      accountingInboxItem: { findMany },
      accountingExpenseDocument: {
        findMany: jest.fn().mockResolvedValue([
          {
            documentStableId: 'expense_1',
            extractionJson: {
              textractEvidence: { vendorName: 'FOODY MART' },
            },
          },
        ]),
      },
    };

    const result = await listAccountingImageRetentionQueue(client as never, 50);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: AccountingInboxStatus.CONFIRMED,
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          materializedEntityType:
            AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
          artifact: {
            is: expect.objectContaining({
              kind: AccountingArtifactKind.IMAGE,
              binaryRetention: {
                is: {
                  state: {
                    in: [
                      AccountingArtifactBinaryRetentionState.ORIGINAL_PRESENT,
                      AccountingArtifactBinaryRetentionState.CANDIDATE_READY,
                      AccountingArtifactBinaryRetentionState.PURGE_PENDING,
                    ],
                  },
                },
              },
            }) as unknown,
          },
        }) as unknown,
        take: 50,
      }) as unknown,
    );
    expect(result).toEqual([
      expect.objectContaining({
        inboxItemStableId: 'acctinbox_image_1',
        artifactStableId: 'acctart_image_1',
        vendorName: 'FOODY MART',
        retentionState: AccountingArtifactBinaryRetentionState.CANDIDATE_READY,
        original: expect.objectContaining({
          url: '/api/v1/accounting/inbox/artifacts/acctart_image_1/content',
          byteSize: 1_000_000,
          width: 3000,
          height: 2000,
        }) as unknown,
        derivative: expect.objectContaining({
          profile: 'BALANCED',
          byteSize: 400_000,
          savingsPercent: 60,
        }) as unknown,
      }) as unknown,
    ]);
  });
});
