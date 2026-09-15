import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingArtifactBinaryRetentionState,
  AccountingArtifactKind,
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createId } from '@paralleldrive/cuid2';
import sharp from 'sharp';
import { getAccountingUploadsDir } from './accounting-storage-path';
import { AccountingOperationsService } from './accounting-operations.service';
import {
  ACCOUNTING_IMAGE_RETENTION_POLICY_VERSION,
  ACCOUNTING_IMAGE_RETENTION_PROFILES,
  type AccountingImageRetentionProfile,
  processAccountingReceiptImage,
} from './accounting-receipt-image';

const INBOX_FILE_PREFIX = '/api/v1/accounting/files/inbox/';
const RETENTION_FILE_PREFIX = '/api/v1/accounting/files/image-retention/';

type AccountingImageRetentionContext = NonNullable<
  Awaited<ReturnType<AccountingOperationsService['readImageRetentionContext']>>
>;

@Injectable()
export class AccountingImageRetentionService {
  private readonly logger = new Logger(AccountingImageRetentionService.name);

  constructor(private readonly operations: AccountingOperationsService) {}

  async createCandidate(
    inboxItemStableId: string,
    profile: AccountingImageRetentionProfile,
    operatorUserStableId: string,
  ) {
    if (
      !Object.prototype.hasOwnProperty.call(
        ACCOUNTING_IMAGE_RETENTION_PROFILES,
        profile,
      )
    ) {
      throw new BadRequestException('unsupported image retention profile');
    }
    const context = await this.requireConfirmedImageContext(inboxItemStableId);
    const state =
      context.artifact.binaryRetention?.state ??
      AccountingArtifactBinaryRetentionState.ORIGINAL_PRESENT;
    if (
      state === AccountingArtifactBinaryRetentionState.PURGE_PENDING ||
      state === AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY
    ) {
      throw new ConflictException(
        'original image has already been accepted for removal',
      );
    }

    const originalPath = this.resolveStoredUrl(
      context.artifact.storedUrl,
      INBOX_FILE_PREFIX,
      'inbox',
    );
    const original = await this.readVerifiedFile(
      originalPath,
      context.artifact.contentHash,
      'original accounting image',
    );
    const originalMetadata = await sharp(original, {
      failOn: 'error',
      limitInputPixels: 80_000_000,
    }).metadata();
    if (!originalMetadata.width || !originalMetadata.height) {
      throw new BadRequestException(
        'original image dimensions are unavailable',
      );
    }
    const originalDimensions = orientedImageDimensions(
      originalMetadata.width,
      originalMetadata.height,
      originalMetadata.orientation,
    );

    const processed = await processAccountingReceiptImage(
      {
        originalname: path.basename(originalPath),
        buffer: original,
      },
      profile,
    );
    if (processed.buffer.length >= original.length) {
      throw new BadRequestException(
        'selected image quality does not reduce storage; keep the original or choose a stronger compression profile',
      );
    }

    const candidateStoredUrl = await this.storeCandidate(
      context.artifact.artifactStableId,
      processed.buffer,
    );
    const candidateContentHash = sha256(processed.buffer);
    try {
      const staged = await this.operations.stageImageRetentionCandidate({
        inboxItemStableId,
        operatorUserStableId,
        originalWidth: originalDimensions.width,
        originalHeight: originalDimensions.height,
        storedUrl: candidateStoredUrl,
        contentHash: candidateContentHash,
        byteSize: processed.buffer.length,
        mimeType: 'image/webp',
        width: processed.width,
        height: processed.height,
        profile: processed.profile,
        maxDimension: processed.maxDimension,
        quality: processed.quality,
      });
      if (
        staged.previousCandidateStoredUrl &&
        staged.previousCandidateStoredUrl !== candidateStoredUrl
      ) {
        await this.removeRetentionFile(staged.previousCandidateStoredUrl);
      }
    } catch (error) {
      await this.removeRetentionFile(candidateStoredUrl);
      throw error;
    }

    return {
      state: AccountingArtifactBinaryRetentionState.CANDIDATE_READY,
      artifactStableId: context.artifact.artifactStableId,
      original: {
        url: artifactContentUrl(context.artifact.artifactStableId),
        byteSize: original.length,
        mimeType: context.artifact.mimeType,
        width: originalDimensions.width,
        height: originalDimensions.height,
      },
      candidate: {
        url: candidateStoredUrl,
        contentHash: candidateContentHash,
        byteSize: processed.buffer.length,
        mimeType: 'image/webp',
        width: processed.width,
        height: processed.height,
        profile: processed.profile,
        maxDimension: processed.maxDimension,
        quality: processed.quality,
        savingsPercent: savingsPercent(
          original.length,
          processed.buffer.length,
        ),
      },
    };
  }

  async discardCandidate(
    inboxItemStableId: string,
    operatorUserStableId: string,
  ) {
    const result = await this.operations.discardImageRetentionCandidate(
      inboxItemStableId,
      operatorUserStableId,
    );
    if (result.candidateStoredUrl) {
      await this.removeRetentionFile(result.candidateStoredUrl);
    }
    return { discarded: true, replayed: result.replayed };
  }

  async acceptCandidate(
    inboxItemStableId: string,
    operatorUserStableId: string,
  ) {
    const context = await this.requireConfirmedImageContext(inboxItemStableId);
    const retention = context.artifact.binaryRetention;
    if (!retention) {
      throw new ConflictException(
        'image compression candidate is not available',
      );
    }
    if (
      retention.state ===
      AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY
    ) {
      return this.presentRetained(context);
    }

    const retainedStoredUrl =
      retention.state === AccountingArtifactBinaryRetentionState.CANDIDATE_READY
        ? retention.candidateStoredUrl
        : retention.retainedStoredUrl;
    const retainedContentHash =
      retention.state === AccountingArtifactBinaryRetentionState.CANDIDATE_READY
        ? retention.candidateContentHash
        : retention.retainedContentHash;
    if (!retainedStoredUrl || !retainedContentHash) {
      throw new ConflictException('accepted image candidate is incomplete');
    }
    const retainedPath = this.resolveStoredUrl(
      retainedStoredUrl,
      RETENTION_FILE_PREFIX,
      'image-retention',
    );
    await this.readVerifiedFile(
      retainedPath,
      retainedContentHash,
      'compressed accounting image',
    );

    if (
      retention.state ===
      AccountingArtifactBinaryRetentionState.CANDIDATE_READY
    ) {
      const originalPath = this.resolveStoredUrl(
        context.artifact.storedUrl,
        INBOX_FILE_PREFIX,
        'inbox',
      );
      await this.readVerifiedFile(
        originalPath,
        context.artifact.contentHash,
        'original accounting image',
      );
    }

    const began = await this.operations.beginImageOriginalPurge(
      inboxItemStableId,
      operatorUserStableId,
      ACCOUNTING_IMAGE_RETENTION_POLICY_VERSION,
    );
    if (
      began.state === AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY
    ) {
      return this.presentRetained(
        await this.requireConfirmedImageContext(inboxItemStableId),
      );
    }

    if (!began.originalStoredUrl) {
      throw new InternalServerErrorException(
        'original image path is unavailable',
      );
    }
    const originalPath = this.resolveStoredUrl(
      began.originalStoredUrl,
      INBOX_FILE_PREFIX,
      'inbox',
    );
    await this.verifyFileIfPresent(
      originalPath,
      context.artifact.contentHash,
      'original accounting image',
    );
    try {
      await fs.promises.rm(originalPath, { force: false });
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw new InternalServerErrorException(
          'original image could not be removed; retention remains purge-pending',
        );
      }
    }

    await this.operations.finalizeImageOriginalPurge(
      inboxItemStableId,
      operatorUserStableId,
    );
    return this.presentRetained(
      await this.requireConfirmedImageContext(inboxItemStableId),
    );
  }

  async resolveArtifactContent(artifactStableId: string) {
    const context =
      await this.operations.readImageArtifactContentContext(artifactStableId);
    if (!context || context.kind !== AccountingArtifactKind.IMAGE) {
      throw new NotFoundException('accounting image evidence not found');
    }
    const retention = context.binaryRetention;
    let storedUrl = context.storedUrl;
    let mimeType = context.mimeType;
    if (
      retention &&
      (retention.state ===
        AccountingArtifactBinaryRetentionState.PURGE_PENDING ||
        retention.state ===
          AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY) &&
      retention.retainedStoredUrl &&
      retention.retainedMimeType
    ) {
      storedUrl = retention.retainedStoredUrl;
      mimeType = retention.retainedMimeType;
    }
    if (!storedUrl || !mimeType) {
      throw new NotFoundException('accounting image binary not found');
    }
    const isRetained = storedUrl.startsWith(RETENTION_FILE_PREFIX);
    const filePath = this.resolveStoredUrl(
      storedUrl,
      isRetained ? RETENTION_FILE_PREFIX : INBOX_FILE_PREFIX,
      isRetained ? 'image-retention' : 'inbox',
    );
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch {
      throw new NotFoundException('accounting image binary not found');
    }
    return { filePath, mimeType };
  }

  private async requireConfirmedImageContext(inboxItemStableId: string) {
    const context =
      await this.operations.readImageRetentionContext(inboxItemStableId);
    if (!context) {
      throw new NotFoundException('accounting inbox item not found');
    }
    if (
      context.status !== AccountingInboxStatus.CONFIRMED ||
      context.classification !==
        AccountingInboxClassification.EXPENSE_DOCUMENT ||
      context.selectedProvider ||
      context.materializedEntityType !==
        AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT ||
      !context.materializedEntityStableId
    ) {
      throw new ConflictException(
        'image retention requires a confirmed expense inbox item',
      );
    }
    if (
      context.artifact.kind !== AccountingArtifactKind.IMAGE ||
      !context.artifact.storedUrl ||
      !context.artifact.mimeType ||
      !context.artifact.byteSize
    ) {
      throw new ConflictException(
        'image retention is only available for stored image evidence',
      );
    }
    return context;
  }

  private presentRetained(context: AccountingImageRetentionContext) {
    const retention = context.artifact.binaryRetention;
    if (
      !retention ||
      retention.state !==
        AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY ||
      !retention.retainedStoredUrl ||
      !retention.retainedContentHash ||
      !retention.retainedByteSize ||
      !retention.retainedMimeType ||
      !context.artifact.byteSize
    ) {
      throw new ConflictException('compressed image retention is not complete');
    }
    return {
      state: retention.state,
      artifactStableId: context.artifact.artifactStableId,
      originalPurgedAt: retention.originalPurgedAt?.toISOString() ?? null,
      retained: {
        url: artifactContentUrl(context.artifact.artifactStableId),
        contentHash: retention.retainedContentHash,
        byteSize: retention.retainedByteSize,
        mimeType: retention.retainedMimeType,
        width: retention.retainedWidth,
        height: retention.retainedHeight,
        profile: retention.retainedProfile,
        maxDimension: retention.retainedMaxDimension,
        quality: retention.retainedQuality,
        savingsPercent: savingsPercent(
          context.artifact.byteSize,
          retention.retainedByteSize,
        ),
      },
    };
  }

  private async storeCandidate(artifactStableId: string, buffer: Buffer) {
    const dir = path.join(getAccountingUploadsDir(), 'image-retention');
    await fs.promises.mkdir(dir, { recursive: true });
    const fileName = `${artifactStableId}-${createId()}.webp`;
    await fs.promises.writeFile(path.join(dir, fileName), buffer, {
      flag: 'wx',
    });
    return `${RETENTION_FILE_PREFIX}${fileName}`;
  }

  private async removeRetentionFile(storedUrl: string) {
    const filePath = this.resolveStoredUrl(
      storedUrl,
      RETENTION_FILE_PREFIX,
      'image-retention',
    );
    try {
      await fs.promises.rm(filePath, { force: true });
    } catch (error) {
      this.logger.warn(
        `Accounting image retention candidate cleanup failed for ${path.basename(filePath)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private resolveStoredUrl(
    storedUrl: string | null,
    expectedPrefix: string,
    directory: string,
  ) {
    if (!storedUrl?.startsWith(expectedPrefix)) {
      throw new ConflictException('accounting evidence path is invalid');
    }
    const fileName = path.basename(storedUrl.slice(expectedPrefix.length));
    if (!fileName || storedUrl !== `${expectedPrefix}${fileName}`) {
      throw new ConflictException('accounting evidence path is invalid');
    }
    return path.join(getAccountingUploadsDir(), directory, fileName);
  }

  private async readVerifiedFile(
    filePath: string,
    expectedHash: string,
    label: string,
  ) {
    let buffer: Buffer;
    try {
      buffer = await fs.promises.readFile(filePath);
    } catch {
      throw new ConflictException(`${label} is unavailable`);
    }
    if (sha256(buffer) !== expectedHash) {
      throw new ConflictException(
        `${label} hash does not match source evidence`,
      );
    }
    return buffer;
  }

  private async verifyFileIfPresent(
    filePath: string,
    expectedHash: string,
    label: string,
  ) {
    let buffer: Buffer;
    try {
      buffer = await fs.promises.readFile(filePath);
    } catch (error) {
      if (isMissingFileError(error)) return false;
      throw new ConflictException(`${label} is unavailable`);
    }
    if (sha256(buffer) !== expectedHash) {
      throw new ConflictException(
        `${label} hash does not match source evidence`,
      );
    }
    return true;
  }
}

export function artifactContentUrl(artifactStableId: string): string {
  return `/api/v1/accounting/inbox/artifacts/${encodeURIComponent(artifactStableId)}/content`;
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function savingsPercent(originalBytes: number, retainedBytes: number): number {
  if (originalBytes <= 0) return 0;
  return Math.max(
    0,
    Math.round((1 - retainedBytes / originalBytes) * 10_000) / 100,
  );
}

function orientedImageDimensions(
  width: number,
  height: number,
  orientation: number | undefined,
) {
  return orientation && [5, 6, 7, 8].includes(orientation)
    ? { width: height, height: width }
    : { width, height };
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
