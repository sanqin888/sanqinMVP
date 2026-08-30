import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import {
  detectAccountingReceiptImageType,
  processAccountingReceiptImage,
} from './accounting-receipt-image';

describe('accounting receipt image processing', () => {
  it('caps a large JPEG receipt at 2400px and converts it to WebP', async () => {
    const input = await sharp({
      create: {
        width: 4000,
        height: 3000,
        channels: 3,
        background: { r: 235, g: 235, b: 235 },
      },
    })
      .jpeg({ quality: 95 })
      .toBuffer();

    const processed = await processAccountingReceiptImage({
      originalname: 'receipt.jpg',
      buffer: input,
    });
    const metadata = await sharp(processed.buffer).metadata();

    expect(processed.extension).toBe('.webp');
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(2400);
    expect(metadata.height).toBe(1800);
  });

  it('does not enlarge a receipt below the size limit', async () => {
    const input = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();

    const processed = await processAccountingReceiptImage({
      originalname: 'receipt.png',
      buffer: input,
    });
    const metadata = await sharp(processed.buffer).metadata();

    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(800);
  });

  it('applies EXIF orientation before encoding', async () => {
    const input = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: { r: 240, g: 240, b: 240 },
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const processed = await processAccountingReceiptImage({
      originalname: 'receipt.jpeg',
      buffer: input,
    });
    const metadata = await sharp(processed.buffer).metadata();

    expect(metadata.width).toBe(800);
    expect(metadata.height).toBe(1200);
    expect(metadata.orientation).toBeUndefined();
  });

  it('rejects a filename extension that does not match the image', async () => {
    const input = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .jpeg()
      .toBuffer();

    await expect(
      processAccountingReceiptImage({
        originalname: 'receipt.png',
        buffer: input,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects unsupported or invalid image bytes', async () => {
    await expect(
      processAccountingReceiptImage({
        originalname: 'receipt.jpg',
        buffer: Buffer.from('not an image'),
      }),
    ).rejects.toThrow('Unsupported or invalid receipt image');
  });

  it('detects supported receipt image signatures', async () => {
    const jpeg = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .jpeg()
      .toBuffer();
    const png = await sharp(jpeg).png().toBuffer();
    const webp = await sharp(jpeg).webp().toBuffer();

    expect(detectAccountingReceiptImageType(jpeg)).toBe('jpeg');
    expect(detectAccountingReceiptImageType(png)).toBe('png');
    expect(detectAccountingReceiptImageType(webp)).toBe('webp');
  });
});
