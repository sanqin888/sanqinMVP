import { BadRequestException } from '@nestjs/common';
import * as path from 'path';
import sharp from 'sharp';

export const ACCOUNTING_RECEIPT_IMAGE_POLICY = {
  maxUploadBytes: 20 * 1024 * 1024,
  maxDimension: 2400,
  webpQuality: 85,
  maxInputPixels: 80_000_000,
} as const;

type ReceiptImageType = 'jpeg' | 'png' | 'webp';

export type ProcessedAccountingReceiptImage = {
  buffer: Buffer;
  extension: '.webp';
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

export async function processAccountingReceiptImage(file: {
  originalname: string;
  buffer: Buffer;
}): Promise<ProcessedAccountingReceiptImage> {
  const detectedType = detectAccountingReceiptImageType(file.buffer);
  if (!detectedType) {
    throw new BadRequestException('Unsupported or invalid receipt image');
  }

  assertMatchingExtension(file.originalname, detectedType);

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
        width: ACCOUNTING_RECEIPT_IMAGE_POLICY.maxDimension,
        height: ACCOUNTING_RECEIPT_IMAGE_POLICY.maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: ACCOUNTING_RECEIPT_IMAGE_POLICY.webpQuality,
        smartSubsample: true,
      })
      .toBuffer();

    return { buffer, extension: '.webp' };
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
