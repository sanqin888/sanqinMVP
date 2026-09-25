import { BadRequestException, ConflictException } from '@nestjs/common';
import { AccountingArtifactBinaryRetentionState } from '@prisma/client';
import {
  AccountingEvidenceFileManagerService,
  normalizeAccountingEvidenceArtifactStableIds,
  normalizeAccountingEvidenceFolderName,
} from './accounting-evidence-file-manager.service';

describe('AccountingEvidenceFileManagerService', () => {
  it('lists retained evidence with logical placement and active-binary display projection', async () => {
    const prisma = {
      accountingEvidenceFolder: {
        findMany: jest.fn().mockResolvedValue([
          {
            folderStableId: 'folder_1',
            name: 'Uber Eats',
            createdAt: new Date('2026-09-21T12:00:00.000Z'),
            updatedAt: new Date('2026-09-21T12:00:00.000Z'),
            _count: { assignments: 1 },
          },
        ]),
      },
      accountingSourceArtifact: {
        findMany: jest.fn().mockResolvedValue([
          {
            artifactStableId: 'acctart_1',
            acquisitionMode: 'MANUAL_UPLOAD',
            kind: 'PDF',
            originalFilename: 'uber.pdf',
            byteSize: 1000,
            createdAt: new Date('2026-09-21T11:00:00.000Z'),
            binaryRetention: null,
            inboxItem: { materializedEntityStableId: null },
            evidenceFolderAssignment: {
              movedAt: new Date('2026-09-21T12:05:00.000Z'),
              folder: {
                folderStableId: 'folder_1',
                name: 'Uber Eats',
              },
            },
          },
          {
            artifactStableId: 'acctart_2',
            acquisitionMode: 'MANUAL_UPLOAD',
            kind: 'IMAGE',
            originalFilename: 'receipt.jpg',
            byteSize: 3_822_143,
            createdAt: new Date('2026-09-21T10:00:00.000Z'),
            binaryRetention: {
              state: AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY,
              retainedStoredUrl:
                '/api/v1/accounting/files/image-retention/acctart_legacy-random.webp',
              retainedByteSize: 411_770,
              acceptedAt: new Date('2026-09-21T10:08:09.123Z'),
            },
            inboxItem: { materializedEntityStableId: 'expense_1' },
            evidenceFolderAssignment: null,
          },
        ]),
      },
      accountingExpenseDocument: {
        findMany: jest.fn().mockResolvedValue([
          {
            documentStableId: 'expense_1',
            extractionJson: {
              textractEvidence: { vendorName: 'Food Depot\nSupermarket' },
            },
          },
        ]),
      },
    };
    const service = new AccountingEvidenceFileManagerService(prisma as never);

    const result = await service.listFileManager();

    expect(result).toEqual({
      folders: [
        {
          folderStableId: 'folder_1',
          name: 'Uber Eats',
          fileCount: 1,
          createdAt: '2026-09-21T12:00:00.000Z',
          updatedAt: '2026-09-21T12:00:00.000Z',
        },
      ],
      files: [
        expect.objectContaining({
          artifactStableId: 'acctart_1',
          originalFilename: 'uber.pdf',
          byteSize: 1000,
          displayFilename: 'uber.pdf',
          displayByteSize: 1000,
          folder: {
            folderStableId: 'folder_1',
            name: 'Uber Eats',
            movedAt: '2026-09-21T12:05:00.000Z',
          },
        }),
        expect.objectContaining({
          artifactStableId: 'acctart_2',
          originalFilename: 'receipt.jpg',
          byteSize: 3_822_143,
          displayFilename: 'Food-Depot-Supermarket_20260921T100809123Z.webp',
          displayByteSize: 411_770,
          folder: null,
        }),
      ],
      truncated: false,
      fileLimit: 500,
    });
    expect(prisma.accountingSourceArtifact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { storedUrl: { not: null } },
            {
              binaryRetention: {
                is: { retainedStoredUrl: { not: null } },
              },
            },
          ],
        },
      }),
    );
    expect(prisma.accountingExpenseDocument.findMany).toHaveBeenCalledWith({
      where: { documentStableId: { in: ['expense_1'] } },
      select: {
        documentStableId: true,
        extractionJson: true,
      },
    });
  });

  it('normalizes folder names and rejects path-like names', () => {
    expect(normalizeAccountingEvidenceFolderName('  Uber   Eats  ')).toEqual({
      name: 'Uber Eats',
      nameKey: 'uber eats',
    });
    expect(() => normalizeAccountingEvidenceFolderName('../Uber')).toThrow(
      BadRequestException,
    );
    expect(() => normalizeAccountingEvidenceFolderName('Uber/Eats')).toThrow(
      BadRequestException,
    );
  });

  it('deduplicates and bounds stable IDs before moving', () => {
    expect(
      normalizeAccountingEvidenceArtifactStableIds([
        'acctart_1',
        ' acctart_1 ',
        'acctart_2',
      ]),
    ).toEqual(['acctart_1', 'acctart_2']);
    expect(() => normalizeAccountingEvidenceArtifactStableIds([])).toThrow(
      BadRequestException,
    );
  });

  it('creates a logical folder and writes an Accounting audit row atomically', async () => {
    const tx = {
      accountingEvidenceFolder: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          folderStableId: 'folder_1',
          name: 'Uber Eats',
          createdAt: new Date('2026-09-21T12:00:00.000Z'),
          updatedAt: new Date('2026-09-21T12:00:00.000Z'),
        }),
      },
      accountingAuditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const service = new AccountingEvidenceFileManagerService(prisma as never);

    await expect(
      service.createFolder('  Uber   Eats ', 'user_stable_1'),
    ).resolves.toEqual({
      folderStableId: 'folder_1',
      name: 'Uber Eats',
      createdAt: '2026-09-21T12:00:00.000Z',
      updatedAt: '2026-09-21T12:00:00.000Z',
      fileCount: 0,
    });

    expect(tx.accountingEvidenceFolder.create).toHaveBeenCalledWith({
      data: {
        name: 'Uber Eats',
        nameKey: 'uber eats',
        createdByUserStableId: 'user_stable_1',
      },
      select: {
        folderStableId: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(tx.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE_EVIDENCE_FOLDER',
        entityType: 'ACCOUNTING_EVIDENCE_FOLDER',
        entityId: 'folder_1',
        operatorActorRef: 'user_stable_1',
        afterJson: { name: 'Uber Eats' },
      }) as unknown,
    });
  });

  it('moves selected artifacts by stable ID without touching storedUrl', async () => {
    const assignmentUpsert = jest.fn().mockResolvedValue({});
    const tx = {
      accountingEvidenceFolder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'folder-db-1',
          folderStableId: 'folder_1',
          name: 'Uber Eats',
        }),
      },
      accountingSourceArtifact: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'artifact-db-1',
            artifactStableId: 'acctart_1',
            storedUrl: '/api/v1/accounting/files/inbox/a.pdf',
            binaryRetention: null,
            evidenceFolderAssignment: null,
          },
          {
            id: 'artifact-db-2',
            artifactStableId: 'acctart_2',
            storedUrl: '/api/v1/accounting/files/inbox/b.pdf',
            binaryRetention: null,
            evidenceFolderAssignment: {
              folder: {
                folderStableId: 'folder_old',
                name: 'Old',
              },
            },
          },
        ]),
      },
      accountingEvidenceFolderAssignment: {
        upsert: assignmentUpsert,
        deleteMany: jest.fn(),
      },
      accountingAuditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const service = new AccountingEvidenceFileManagerService(prisma as never);

    const result = await service.moveArtifacts(
      {
        artifactStableIds: ['acctart_1', 'acctart_2'],
        targetFolderStableId: 'folder_1',
      },
      'user_stable_1',
    );

    expect(result).toEqual({
      requestedCount: 2,
      movedCount: 2,
      movedArtifactStableIds: ['acctart_1', 'acctart_2'],
      targetFolder: {
        folderStableId: 'folder_1',
        name: 'Uber Eats',
      },
    });
    expect(assignmentUpsert).toHaveBeenCalledTimes(2);
    expect(assignmentUpsert).toHaveBeenNthCalledWith(1, {
      where: { artifactId: 'artifact-db-1' },
      create: {
        artifactId: 'artifact-db-1',
        folderId: 'folder-db-1',
        movedByUserStableId: 'user_stable_1',
      },
      update: {
        folderId: 'folder-db-1',
        movedByUserStableId: 'user_stable_1',
      },
    });
    expect(tx.accountingAuditLog.create).toHaveBeenCalledTimes(2);
    expect(tx.accountingSourceArtifact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          artifactStableId: { in: ['acctart_1', 'acctart_2'] },
        },
      }),
    );
  });

  it('moves an assigned file back to the virtual Unfiled root', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      accountingEvidenceFolder: {
        findUnique: jest.fn(),
      },
      accountingSourceArtifact: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'artifact-db-1',
            artifactStableId: 'acctart_1',
            storedUrl: null,
            binaryRetention: {
              retainedStoredUrl:
                '/api/v1/accounting/files/image-retention/a.webp',
            },
            evidenceFolderAssignment: {
              folder: {
                folderStableId: 'folder_1',
                name: 'Receipts',
              },
            },
          },
        ]),
      },
      accountingEvidenceFolderAssignment: {
        upsert: jest.fn(),
        deleteMany,
      },
      accountingAuditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const service = new AccountingEvidenceFileManagerService(prisma as never);

    const result = await service.moveArtifacts(
      {
        artifactStableIds: ['acctart_1'],
        targetFolderStableId: null,
      },
      'user_stable_2',
    );

    expect(deleteMany).toHaveBeenCalledWith({
      where: { artifactId: 'artifact-db-1' },
    });
    expect(result.targetFolder).toBeNull();
    expect(result.movedCount).toBe(1);
  });

  it('treats Unfiled to Unfiled as a no-op without audit noise', async () => {
    const tx = {
      accountingEvidenceFolder: {
        findUnique: jest.fn(),
      },
      accountingSourceArtifact: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'artifact-db-1',
            artifactStableId: 'acctart_1',
            storedUrl: '/api/v1/accounting/files/inbox/a.pdf',
            binaryRetention: null,
            evidenceFolderAssignment: null,
          },
        ]),
      },
      accountingEvidenceFolderAssignment: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      accountingAuditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const service = new AccountingEvidenceFileManagerService(prisma as never);

    const result = await service.moveArtifacts(
      {
        artifactStableIds: ['acctart_1'],
        targetFolderStableId: null,
      },
      'user_stable_1',
    );

    expect(result.movedCount).toBe(0);
    expect(
      tx.accountingEvidenceFolderAssignment.deleteMany,
    ).not.toHaveBeenCalled();
    expect(tx.accountingAuditLog.create).not.toHaveBeenCalled();
  });

  it('fails closed when a selected artifact has no retained binary', async () => {
    const tx = {
      accountingEvidenceFolder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'folder-db-1',
          folderStableId: 'folder_1',
          name: 'Receipts',
        }),
      },
      accountingSourceArtifact: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'artifact-db-1',
            artifactStableId: 'acctart_1',
            storedUrl: null,
            binaryRetention: { retainedStoredUrl: null },
            evidenceFolderAssignment: null,
          },
        ]),
      },
      accountingEvidenceFolderAssignment: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      accountingAuditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const service = new AccountingEvidenceFileManagerService(prisma as never);

    await expect(
      service.moveArtifacts(
        {
          artifactStableIds: ['acctart_1'],
          targetFolderStableId: 'folder_1',
        },
        'user_stable_1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.accountingEvidenceFolderAssignment.upsert).not.toHaveBeenCalled();
  });
});
