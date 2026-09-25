import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingArtifactBinaryRetentionState,
  Prisma,
} from '@prisma/client';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import { runSerializableAccountingWrite } from './accounting-atomic-write';
import {
  accountingExpenseVendorName,
  accountingRetainedImageDisplayFilename,
} from './accounting-image-retention-filename';
import { writeAccountingAuditLog } from './accounting-audit-writer';

const ACCOUNTING_EVIDENCE_FOLDER_NAME_MAX_LENGTH = 80;
const ACCOUNTING_EVIDENCE_MOVE_MAX_ARTIFACTS = 100;
const ACCOUNTING_EVIDENCE_FILE_LIST_LIMIT = 500;

export type AccountingEvidenceMoveInput = {
  artifactStableIds: unknown;
  targetFolderStableId: unknown;
};

@Injectable()
export class AccountingEvidenceFileManagerService {
  constructor(@Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb) {}

  async listFileManager() {
    const [folders, artifactRows] = await Promise.all([
      this.prisma.accountingEvidenceFolder.findMany({
        select: {
          folderStableId: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { assignments: true } },
        },
        orderBy: [{ nameKey: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.accountingSourceArtifact.findMany({
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
        select: {
          artifactStableId: true,
          acquisitionMode: true,
          kind: true,
          originalFilename: true,
          byteSize: true,
          createdAt: true,
          binaryRetention: {
            select: {
              state: true,
              retainedStoredUrl: true,
              retainedByteSize: true,
              acceptedAt: true,
            },
          },
          inboxItem: {
            select: {
              materializedEntityStableId: true,
            },
          },
          evidenceFolderAssignment: {
            select: {
              movedAt: true,
              folder: {
                select: {
                  folderStableId: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { artifactStableId: 'asc' }],
        take: ACCOUNTING_EVIDENCE_FILE_LIST_LIMIT + 1,
      }),
    ]);

    const truncated = artifactRows.length > ACCOUNTING_EVIDENCE_FILE_LIST_LIMIT;
    const visibleArtifacts = artifactRows.slice(
      0,
      ACCOUNTING_EVIDENCE_FILE_LIST_LIMIT,
    );
    const expenseDocumentStableIds = [
      ...new Set(
        visibleArtifacts
          .filter((artifact) =>
            accountingEvidenceUsesRetainedBinary(
              artifact.binaryRetention?.state,
            ),
          )
          .map(
            (artifact) =>
              artifact.inboxItem?.materializedEntityStableId ?? null,
          )
          .filter(
            (value): value is string =>
              typeof value === 'string' && value.length > 0,
          ),
      ),
    ];
    const expenseVendorNames = new Map<string, string>();
    if (expenseDocumentStableIds.length) {
      const expenseDocuments =
        await this.prisma.accountingExpenseDocument.findMany({
          where: {
            documentStableId: { in: expenseDocumentStableIds },
          },
          select: {
            documentStableId: true,
            extractionJson: true,
          },
        });
      for (const document of expenseDocuments) {
        const vendorName = accountingExpenseVendorName(document.extractionJson);
        if (vendorName) {
          expenseVendorNames.set(document.documentStableId, vendorName);
        }
      }
    }

    return {
      folders: folders.map((folder) => ({
        folderStableId: folder.folderStableId,
        name: folder.name,
        fileCount: folder._count.assignments,
        createdAt: folder.createdAt.toISOString(),
        updatedAt: folder.updatedAt.toISOString(),
      })),
      files: visibleArtifacts.map((artifact) => {
        const retained = accountingEvidenceUsesRetainedBinary(
          artifact.binaryRetention?.state,
        )
          ? artifact.binaryRetention
          : null;
        const materializedEntityStableId =
          artifact.inboxItem?.materializedEntityStableId ?? null;
        const displayFilename = retained
          ? accountingRetainedImageDisplayFilename({
              retainedStoredUrl: retained.retainedStoredUrl,
              vendorName: materializedEntityStableId
                ? (expenseVendorNames.get(materializedEntityStableId) ?? null)
                : null,
              fallbackTimestamp: retained.acceptedAt ?? artifact.createdAt,
              originalFilename: artifact.originalFilename,
            })
          : artifact.originalFilename;

        return {
          artifactStableId: artifact.artifactStableId,
          acquisitionMode: artifact.acquisitionMode,
          kind: artifact.kind,
          originalFilename: artifact.originalFilename,
          byteSize: artifact.byteSize,
          displayFilename,
          displayByteSize: retained?.retainedByteSize ?? artifact.byteSize,
          createdAt: artifact.createdAt.toISOString(),
          folder: artifact.evidenceFolderAssignment
            ? {
                folderStableId:
                  artifact.evidenceFolderAssignment.folder.folderStableId,
                name: artifact.evidenceFolderAssignment.folder.name,
                movedAt:
                  artifact.evidenceFolderAssignment.movedAt.toISOString(),
              }
            : null,
        };
      }),
      truncated,
      fileLimit: ACCOUNTING_EVIDENCE_FILE_LIST_LIMIT,
    };
  }

  async createFolder(rawName: unknown, operatorUserStableId: string) {
    const { name, nameKey } = normalizeAccountingEvidenceFolderName(rawName);
    try {
      return await runSerializableAccountingWrite(this.prisma, async (tx) => {
        const existing = await tx.accountingEvidenceFolder.findUnique({
          where: { nameKey },
          select: { folderStableId: true },
        });
        if (existing) {
          throw new ConflictException('evidence folder name already exists');
        }

        const folder = await tx.accountingEvidenceFolder.create({
          data: {
            name,
            nameKey,
            createdByUserStableId: operatorUserStableId,
          },
          select: {
            folderStableId: true,
            name: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        await writeAccountingAuditLog(tx, {
          action: 'CREATE_EVIDENCE_FOLDER',
          entityType: 'ACCOUNTING_EVIDENCE_FOLDER',
          entityId: folder.folderStableId,
          operatorActorRef: operatorUserStableId,
          afterJson: { name: folder.name },
        });

        return {
          ...folder,
          createdAt: folder.createdAt.toISOString(),
          updatedAt: folder.updatedAt.toISOString(),
          fileCount: 0,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('evidence folder name already exists');
      }
      throw error;
    }
  }

  async moveArtifacts(
    input: AccountingEvidenceMoveInput,
    operatorUserStableId: string,
  ) {
    const artifactStableIds = normalizeAccountingEvidenceArtifactStableIds(
      input.artifactStableIds,
    );
    const targetFolderStableId =
      normalizeAccountingEvidenceTargetFolderStableId(
        input.targetFolderStableId,
      );

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const targetFolder = targetFolderStableId
        ? await tx.accountingEvidenceFolder.findUnique({
            where: { folderStableId: targetFolderStableId },
            select: {
              id: true,
              folderStableId: true,
              name: true,
            },
          })
        : null;
      if (targetFolderStableId && !targetFolder) {
        throw new NotFoundException('target evidence folder not found');
      }

      const artifacts = await tx.accountingSourceArtifact.findMany({
        where: { artifactStableId: { in: artifactStableIds } },
        select: {
          id: true,
          artifactStableId: true,
          storedUrl: true,
          binaryRetention: {
            select: { retainedStoredUrl: true },
          },
          evidenceFolderAssignment: {
            select: {
              folder: {
                select: {
                  folderStableId: true,
                  name: true,
                },
              },
            },
          },
        },
      });
      const artifactByStableId = new Map(
        artifacts.map((artifact) => [artifact.artifactStableId, artifact]),
      );
      const missingStableIds = artifactStableIds.filter(
        (artifactStableId) => !artifactByStableId.has(artifactStableId),
      );
      if (missingStableIds.length) {
        throw new NotFoundException(
          `accounting evidence artifact not found: ${missingStableIds[0]}`,
        );
      }

      const movedArtifactStableIds: string[] = [];
      for (const artifactStableId of artifactStableIds) {
        const artifact = artifactByStableId.get(artifactStableId);
        if (!artifact) continue;
        if (
          !artifact.storedUrl &&
          !artifact.binaryRetention?.retainedStoredUrl
        ) {
          throw new ConflictException(
            `accounting evidence has no retained binary: ${artifactStableId}`,
          );
        }

        const beforeFolder = artifact.evidenceFolderAssignment?.folder ?? null;
        const beforeFolderStableId = beforeFolder?.folderStableId ?? null;
        const targetFolderResolvedStableId =
          targetFolder?.folderStableId ?? null;
        if (beforeFolderStableId === targetFolderResolvedStableId) {
          continue;
        }

        if (targetFolder) {
          await tx.accountingEvidenceFolderAssignment.upsert({
            where: { artifactId: artifact.id },
            create: {
              artifactId: artifact.id,
              folderId: targetFolder.id,
              movedByUserStableId: operatorUserStableId,
            },
            update: {
              folderId: targetFolder.id,
              movedByUserStableId: operatorUserStableId,
            },
          });
        } else {
          await tx.accountingEvidenceFolderAssignment.deleteMany({
            where: { artifactId: artifact.id },
          });
        }

        await writeAccountingAuditLog(tx, {
          action: 'MOVE_EVIDENCE_FILE',
          entityType: 'ACCOUNTING_SOURCE_ARTIFACT',
          entityId: artifact.artifactStableId,
          operatorActorRef: operatorUserStableId,
          beforeJson: {
            folderStableId: beforeFolder?.folderStableId ?? null,
            folderName: beforeFolder?.name ?? null,
          },
          afterJson: {
            folderStableId: targetFolder?.folderStableId ?? null,
            folderName: targetFolder?.name ?? null,
          },
        });
        movedArtifactStableIds.push(artifact.artifactStableId);
      }

      return {
        requestedCount: artifactStableIds.length,
        movedCount: movedArtifactStableIds.length,
        movedArtifactStableIds,
        targetFolder: targetFolder
          ? {
              folderStableId: targetFolder.folderStableId,
              name: targetFolder.name,
            }
          : null,
      };
    });
  }
}

function accountingEvidenceUsesRetainedBinary(
  state: AccountingArtifactBinaryRetentionState | null | undefined,
): boolean {
  return (
    state === AccountingArtifactBinaryRetentionState.PURGE_PENDING ||
    state === AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY
  );
}

export function normalizeAccountingEvidenceFolderName(rawName: unknown): {
  name: string;
  nameKey: string;
} {
  if (typeof rawName !== 'string') {
    throw new BadRequestException('folder name is required');
  }
  const name = rawName.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!name) {
    throw new BadRequestException('folder name is required');
  }
  if (name.length > ACCOUNTING_EVIDENCE_FOLDER_NAME_MAX_LENGTH) {
    throw new BadRequestException(
      `folder name must be at most ${ACCOUNTING_EVIDENCE_FOLDER_NAME_MAX_LENGTH} characters`,
    );
  }
  const containsUnsupportedCharacter = [...name].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      character === '/' ||
      character === '\\' ||
      codePoint < 32 ||
      codePoint === 127
    );
  });
  if (name === '.' || name === '..' || containsUnsupportedCharacter) {
    throw new BadRequestException(
      'folder name contains unsupported characters',
    );
  }
  return {
    name,
    nameKey: name.toLowerCase(),
  };
}

export function normalizeAccountingEvidenceArtifactStableIds(
  rawArtifactStableIds: unknown,
): string[] {
  if (!Array.isArray(rawArtifactStableIds)) {
    throw new BadRequestException('artifactStableIds must be an array');
  }
  const artifactStableIds = rawArtifactStableIds.map((value) => {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(
        'artifactStableIds must contain non-empty stable IDs',
      );
    }
    return value.trim();
  });
  const uniqueStableIds = [...new Set(artifactStableIds)];
  if (!uniqueStableIds.length) {
    throw new BadRequestException('at least one artifactStableId is required');
  }
  if (uniqueStableIds.length > ACCOUNTING_EVIDENCE_MOVE_MAX_ARTIFACTS) {
    throw new BadRequestException(
      `at most ${ACCOUNTING_EVIDENCE_MOVE_MAX_ARTIFACTS} files can be moved at once`,
    );
  }
  return uniqueStableIds;
}

function normalizeAccountingEvidenceTargetFolderStableId(
  rawFolderStableId: unknown,
): string | null {
  if (rawFolderStableId === null) return null;
  if (typeof rawFolderStableId !== 'string' || !rawFolderStableId.trim()) {
    throw new BadRequestException(
      'targetFolderStableId must be a stable ID or null',
    );
  }
  return rawFolderStableId.trim();
}
