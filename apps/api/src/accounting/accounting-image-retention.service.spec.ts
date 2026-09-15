import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  AccountingArtifactBinaryRetentionState,
  AccountingArtifactKind,
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
} from '@prisma/client';
import { AccountingImageRetentionService } from './accounting-image-retention.service';

const hash = (buffer: Buffer) =>
  createHash('sha256').update(buffer).digest('hex');

function confirmedContext(input: {
  originalHash: string;
  originalBytes: number;
  retention?: Record<string, unknown> | null;
}) {
  return {
    status: AccountingInboxStatus.CONFIRMED,
    classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
    selectedProvider: null,
    materializedEntityType:
      AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
    materializedEntityStableId: 'expense_1',
    artifact: {
      artifactStableId: 'acctart_image_1',
      kind: AccountingArtifactKind.IMAGE,
      contentHash: input.originalHash,
      mimeType: 'image/jpeg',
      byteSize: input.originalBytes,
      storedUrl: '/api/v1/accounting/files/inbox/original.jpg',
      binaryRetention: input.retention ?? null,
    },
  };
}

describe('AccountingImageRetentionService', () => {
  const previousUploadRoot = process.env.UPLOAD_ROOT;
  let uploadRoot: string;

  beforeEach(() => {
    uploadRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sanq-image-retention-'),
    );
    process.env.UPLOAD_ROOT = uploadRoot;
    fs.mkdirSync(path.join(uploadRoot, 'accounting', 'inbox'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(uploadRoot, 'accounting', 'image-retention'), {
      recursive: true,
    });
  });

  afterEach(() => {
    fs.rmSync(uploadRoot, { recursive: true, force: true });
    if (previousUploadRoot === undefined) delete process.env.UPLOAD_ROOT;
    else process.env.UPLOAD_ROOT = previousUploadRoot;
  });

  it('creates a compressed preview while leaving the original binary untouched', async () => {
    const original = await sharp({
      create: {
        width: 3200,
        height: 2400,
        channels: 3,
        background: { r: 240, g: 240, b: 240 },
      },
    })
      .jpeg({ quality: 98 })
      .toBuffer();
    const originalPath = path.join(
      uploadRoot,
      'accounting',
      'inbox',
      'original.jpg',
    );
    fs.writeFileSync(originalPath, original);

    const operations = {
      readImageRetentionContext: jest.fn().mockResolvedValue(
        confirmedContext({
          originalHash: hash(original),
          originalBytes: original.length,
          retention: {
            state: AccountingArtifactBinaryRetentionState.ORIGINAL_PRESENT,
          },
        }),
      ),
      stageImageRetentionCandidate: jest.fn().mockResolvedValue({
        previousCandidateStoredUrl: null,
      }),
    };
    const service = new AccountingImageRetentionService(operations as never);

    const result = await service.createCandidate(
      'acctinbox_1',
      'BALANCED',
      'user_1',
    );

    expect(fs.existsSync(originalPath)).toBe(true);
    expect(result.original.byteSize).toBe(original.length);
    expect(result.candidate.profile).toBe('BALANCED');
    expect(result.candidate.byteSize).toBeLessThan(original.length);
    expect(
      fs.existsSync(
        path.join(
          uploadRoot,
          'accounting',
          'image-retention',
          path.basename(result.candidate.url),
        ),
      ),
    ).toBe(true);
    expect(operations.stageImageRetentionCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        inboxItemStableId: 'acctinbox_1',
        operatorUserStableId: 'user_1',
        profile: 'BALANCED',
        contentHash: result.candidate.contentHash,
      }) as unknown,
    );
  });

  it('deletes the original only after acceptance and then serves retained content', async () => {
    const original = await sharp({
      create: {
        width: 2400,
        height: 1800,
        channels: 3,
        background: { r: 240, g: 240, b: 240 },
      },
    })
      .jpeg({ quality: 98 })
      .toBuffer();
    const retained = await sharp(original).webp({ quality: 85 }).toBuffer();
    const originalPath = path.join(
      uploadRoot,
      'accounting',
      'inbox',
      'original.jpg',
    );
    const retainedPath = path.join(
      uploadRoot,
      'accounting',
      'image-retention',
      'accepted.webp',
    );
    fs.writeFileSync(originalPath, original);
    fs.writeFileSync(retainedPath, retained);

    const candidateRetention = {
      id: 'retention-db-id',
      state: AccountingArtifactBinaryRetentionState.CANDIDATE_READY,
      candidateStoredUrl:
        '/api/v1/accounting/files/image-retention/accepted.webp',
      candidateContentHash: hash(retained),
      candidateByteSize: retained.length,
      candidateMimeType: 'image/webp',
      candidateWidth: 2400,
      candidateHeight: 1800,
      candidateProfile: 'BALANCED',
      candidateMaxDimension: 2400,
      candidateQuality: 85,
    };
    const compressedRetention = {
      ...candidateRetention,
      state: AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY,
      candidateStoredUrl: null,
      candidateContentHash: null,
      candidateByteSize: null,
      candidateMimeType: null,
      retainedStoredUrl:
        '/api/v1/accounting/files/image-retention/accepted.webp',
      retainedContentHash: hash(retained),
      retainedByteSize: retained.length,
      retainedMimeType: 'image/webp',
      retainedWidth: 2400,
      retainedHeight: 1800,
      retainedProfile: 'BALANCED',
      retainedMaxDimension: 2400,
      retainedQuality: 85,
      originalPurgedAt: new Date('2026-09-15T20:00:00.000Z'),
    };
    const operations = {
      readImageRetentionContext: jest
        .fn()
        .mockResolvedValueOnce(
          confirmedContext({
            originalHash: hash(original),
            originalBytes: original.length,
            retention: candidateRetention,
          }),
        )
        .mockResolvedValueOnce(
          confirmedContext({
            originalHash: hash(original),
            originalBytes: original.length,
            retention: compressedRetention,
          }),
        ),
      beginImageOriginalPurge: jest.fn().mockResolvedValue({
        state: AccountingArtifactBinaryRetentionState.PURGE_PENDING,
        originalStoredUrl: '/api/v1/accounting/files/inbox/original.jpg',
        retainedStoredUrl:
          '/api/v1/accounting/files/image-retention/accepted.webp',
      }),
      finalizeImageOriginalPurge: jest.fn().mockResolvedValue({
        state: AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY,
      }),
      readImageArtifactContentContext: jest.fn().mockResolvedValue({
        artifactStableId: 'acctart_image_1',
        kind: AccountingArtifactKind.IMAGE,
        mimeType: 'image/jpeg',
        storedUrl: '/api/v1/accounting/files/inbox/original.jpg',
        binaryRetention: compressedRetention,
      }),
    };
    const service = new AccountingImageRetentionService(operations as never);

    const result = await service.acceptCandidate('acctinbox_1', 'user_1');

    expect(result.state).toBe(
      AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY,
    );
    expect(fs.existsSync(originalPath)).toBe(false);
    expect(fs.existsSync(retainedPath)).toBe(true);
    expect(operations.beginImageOriginalPurge).toHaveBeenCalledTimes(1);
    expect(operations.finalizeImageOriginalPurge).toHaveBeenCalledTimes(1);
    expect(
      operations.beginImageOriginalPurge.mock.invocationCallOrder[0]!,
    ).toBeLessThan(
      operations.finalizeImageOriginalPurge.mock.invocationCallOrder[0]!,
    );

    const content = await service.resolveArtifactContent('acctart_image_1');
    expect(content).toEqual({ filePath: retainedPath, mimeType: 'image/webp' });
  });
});
