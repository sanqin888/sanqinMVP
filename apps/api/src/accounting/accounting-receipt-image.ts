import { BadRequestException } from '@nestjs/common';
import * as path from 'path';
import sharp from 'sharp';

export const ACCOUNTING_RECEIPT_IMAGE_POLICY = {
  maxUploadBytes: 20 * 1024 * 1024,
  maxInputPixels: 80_000_000,
} as const;

export const ACCOUNTING_IMAGE_RETENTION_POLICY_VERSION = 1;

export const ACCOUNTING_IMAGE_RETENTION_PROFILES = {
  SPACE_SAVER: { maxDimension: 1800, quality: 78 },
  BALANCED: { maxDimension: 2400, quality: 85 },
  HIGH_QUALITY: { maxDimension: 3000, quality: 90 },
  NEAR_ORIGINAL: { maxDimension: 4096, quality: 95 },
} as const;

export type AccountingImageRetentionProfile =
  keyof typeof ACCOUNTING_IMAGE_RETENTION_PROFILES;

type ReceiptImageType = 'jpeg' | 'png' | 'webp';

export type ProcessedAccountingReceiptImage = {
  buffer: Buffer;
  extension: '.webp';
  width: number;
  height: number;
  profile: AccountingImageRetentionProfile;
  maxDimension: number;
  quality: number;
};

export function detectAccountingReceiptImageType(
  buffer: Buffer,
): ReceiptImageType | null {
  if (buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngSignature.every((byte, index) => buffer[index] === byte)) {
    return 'png';
  }

  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }

  return null;
}

export async function processAccountingReceiptImage(
  file: {
    originalname: string;
    buffer: Buffer;
  },
  profile: AccountingImageRetentionProfile = 'BALANCED',
): Promise<ProcessedAccountingReceiptImage> {
  const detectedType = detectAccountingReceiptImageType(file.buffer);
  if (!detectedType) {
    throw new BadRequestException('Unsupported or invalid receipt image');
  }

  assertMatchingExtension(file.originalname, detectedType);
  const retentionProfile = ACCOUNTING_IMAGE_RETENTION_PROFILES[profile];

  try {
    const input = sharp(file.buffer, {
      failOn: 'error',
      limitInputPixels: ACCOUNTING_RECEIPT_IMAGE_POLICY.maxInputPixels,
    });
    const metadata = await input.metadata();

    if ((metadata.pages ?? 1) > 1) {
      throw new BadRequestException(
        'Animated receipt images are not supported',
      );
    }

    const buffer = await input
      .rotate()
      .resize({
        width: retentionProfile.maxDimension,
        height: retentionProfile.maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: retentionProfile.quality,
        smartSubsample: true,
      })
      .toBuffer();
    const outputMetadata = await sharp(buffer).metadata();
    if (!outputMetadata.width || !outputMetadata.height) {
      throw new BadRequestException('Receipt image dimensions are unavailable');
    }

    return {
      buffer,
      extension: '.webp',
      width: outputMetadata.width,
      height: outputMetadata.height,
      profile,
      maxDimension: retentionProfile.maxDimension,
      quality: retentionProfile.quality,
    };
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new BadRequestException('Receipt image could not be processed');
  }
}

function assertMatchingExtension(
  originalName: string,
  detectedType: ReceiptImageType,
): void {
  const originalExtension = path.extname(originalName).toLowerCase();
  if (!originalExtension) return;

  const allowedExtensions =
    detectedType === 'jpeg'
      ? new Set(['.jpg', '.jpeg'])
      : new Set([`.${detectedType}`]);

  if (!allowedExtensions.has(originalExtension)) {
    throw new BadRequestException(
      'Receipt image extension does not match file type',
    );
  }
}
