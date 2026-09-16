import sharp from 'sharp';
import {
  ACCOUNTING_IMAGE_OCR_POLICY,
  extractAccountingImageText,
  mergeAccountingImageOcrSegmentTexts,
  normalizeAccountingImageOcrText,
  prepareAccountingImagePrimaryOcrCandidate,
  scoreAccountingReceiptOcrText,
  selectBestAccountingImageOcrText,
  type AccountingImageOcrStrategy,
} from './accounting-image-ocr';

const readableReceiptText = [
  'NORTHSIDE GROCERY',
  '123 Example Street',
  '2026/09/08',
  'Produce 11.32',
  'Household 23.07',
  'Golden Kiwi 7.99',
  'Sub Total 42.38',
  'HST 0.00',
  'Total after Tax 42.38',
  'Debit Card 42.38',
  'PURCHASE APPROVED',
].join('\n');

const noisyOcrText = [
  '. 165 ultutul Gingl _',
  'TSR T i W M ARV AN',
  'SRt P | 1T 1 1 1 绍 0 e',
  '霍 i 霉 熹 篝 噻 ] Kot T s',
  'e -',
  'sE i',
  'SRR e 1 il bR | 林',
  '9037710J90100Q60004 5 S',
].join('\n');

describe('accounting image OCR', () => {
  it('preserves line structure while normalizing horizontal whitespace', () => {
    expect(
      normalizeAccountingImageOcrText(
        '  SANQ   RESTAURANT  \r\nInvoice\t#123\r\n\r\n\r\nTotal    $84.69  ',
      ),
    ).toBe('SANQ RESTAURANT\nInvoice #123\n\nTotal $84.69');
  });

  it('scores receipt evidence above longer OCR garbage', () => {
    const readable = scoreAccountingReceiptOcrText(readableReceiptText);
    const noisy = scoreAccountingReceiptOcrText(
      `${noisyOcrText}\n${noisyOcrText}`,
    );

    expect(readable.score).toBeGreaterThan(noisy.score);
    expect(readable.moneyCount).toBeGreaterThanOrEqual(5);
    expect(readable.dateCount).toBe(1);
    expect(readable.receiptSignalCount).toBeGreaterThanOrEqual(5);
  });

  it('selects the deterministic receipt-quality winner instead of the longest text', () => {
    const candidates = [
      {
        strategy: 'RECEIPT_CONTRAST_ENG_PSM4' as const,
        text: `${noisyOcrText}\n${noisyOcrText}`,
        quality: scoreAccountingReceiptOcrText(
          `${noisyOcrText}\n${noisyOcrText}`,
        ),
      },
      {
        strategy: 'RECEIPT_BINARY_ENG_PSM4' as const,
        text: readableReceiptText,
        quality: scoreAccountingReceiptOcrText(readableReceiptText),
      },
    ];

    expect(selectBestAccountingImageOcrText(candidates)?.strategy).toBe(
      'RECEIPT_BINARY_ENG_PSM4',
    );
  });

  it('uses candidate order as the deterministic final tie-break', () => {
    const quality = scoreAccountingReceiptOcrText(readableReceiptText);
    const first = {
      strategy: 'RECEIPT_CONTRAST_ENG_PSM4' as const,
      text: readableReceiptText,
      quality,
    };
    const second = {
      strategy: 'RECEIPT_BINARY_ENG_PSM4' as const,
      text: readableReceiptText,
      quality,
    };

    expect(selectBestAccountingImageOcrText([first, second])?.strategy).toBe(
      first.strategy,
    );
  });

  it('creates a cropped long-receipt candidate from a light receipt on dark background', async () => {
    const receipt = await sharp({
      create: {
        width: 300,
        height: 800,
        channels: 3,
        background: { r: 245, g: 245, b: 245 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 230,
              height: 8,
              channels: 3,
              background: { r: 25, g: 25, b: 25 },
            },
          })
            .png()
            .toBuffer(),
          left: 50,
          top: 180,
        },
        {
          input: await sharp({
            create: {
              width: 200,
              height: 8,
              channels: 3,
              background: { r: 25, g: 25, b: 25 },
            },
          })
            .png()
            .toBuffer(),
          left: 50,
          top: 650,
        },
      ])
      .png()
      .toBuffer();
    const input = await sharp({
      create: {
        width: 500,
        height: 1000,
        channels: 3,
        background: { r: 20, g: 20, b: 20 },
      },
    })
      .composite([{ input: receipt, left: 150, top: 150 }])
      .jpeg({ quality: 94 })
      .toBuffer();

    const cropped = await prepareAccountingImagePrimaryOcrCandidate(input);

    expect(cropped.strategy).toBe('RECEIPT_CONTRAST_ENG_PSM4');
    expect(cropped.segments.length).toBeGreaterThan(0);
    for (const segment of cropped.segments) {
      expect(segment.height).toBeLessThanOrEqual(
        ACCOUNTING_IMAGE_OCR_POLICY.maxSegmentHeight,
      );
      expect(segment.width * segment.height).toBeLessThanOrEqual(
        ACCOUNTING_IMAGE_OCR_POLICY.maxSegmentPixels,
      );
    }
  });

  it('segments very long receipts instead of shrinking the whole image to one fixed height', async () => {
    const marker = await sharp({
      create: {
        width: 220,
        height: 8,
        channels: 3,
        background: { r: 20, g: 20, b: 20 },
      },
    })
      .png()
      .toBuffer();
    const input = await sharp({
      create: {
        width: 300,
        height: 1200,
        channels: 3,
        background: { r: 245, g: 245, b: 245 },
      },
    })
      .composite([
        { input: marker, left: 40, top: 200 },
        { input: marker, left: 40, top: 600 },
        { input: marker, left: 40, top: 1000 },
      ])
      .png()
      .toBuffer();

    const candidate = await prepareAccountingImagePrimaryOcrCandidate(input);
    expect(candidate.segments.length).toBeGreaterThan(1);
    expect(candidate.segments.length).toBeLessThanOrEqual(
      ACCOUNTING_IMAGE_OCR_POLICY.maxSegments,
    );
    for (const segment of candidate.segments) {
      expect(segment.height).toBeLessThanOrEqual(
        ACCOUNTING_IMAGE_OCR_POLICY.maxSegmentHeight,
      );
      expect(segment.width * segment.height).toBeLessThanOrEqual(
        ACCOUNTING_IMAGE_OCR_POLICY.maxSegmentPixels,
      );
    }
  }, 15_000);

  it('fails closed instead of globally shrinking a receipt beyond the segment budget', async () => {
    const input = await sharp({
      create: {
        width: 200,
        height: 6000,
        channels: 3,
        background: { r: 245, g: 245, b: 245 },
      },
    })
      .png()
      .toBuffer();

    await expect(
      prepareAccountingImagePrimaryOcrCandidate(input),
    ).rejects.toThrow('Accounting image OCR receipt exceeds segment limit');
  }, 15_000);

  it('keeps a clear ordinary receipt on a readable non-lossy OCR candidate path', async () => {
    const line = await sharp({
      create: {
        width: 420,
        height: 8,
        channels: 3,
        background: { r: 20, g: 20, b: 20 },
      },
    })
      .png()
      .toBuffer();
    const input = await sharp({
      create: {
        width: 600,
        height: 1000,
        channels: 3,
        background: { r: 250, g: 250, b: 250 },
      },
    })
      .composite([
        { input: line, left: 90, top: 180 },
        { input: line, left: 90, top: 500 },
        { input: line, left: 90, top: 820 },
      ])
      .jpeg({ quality: 96 })
      .toBuffer();

    const contrast = await prepareAccountingImagePrimaryOcrCandidate(input);
    expect(contrast.segments).toHaveLength(1);
    const [segment] = contrast.segments;
    const metadata = await sharp(segment.buffer).metadata();

    expect(metadata.format).toBe('png');
    expect(segment.width).toBeGreaterThanOrEqual(1000);
    expect(segment.height).toBeGreaterThanOrEqual(1600);
    expect(segment.width * segment.height).toBeLessThanOrEqual(
      ACCOUNTING_IMAGE_OCR_POLICY.maxSegmentPixels,
    );
  });

  it('merges overlapping segment text in order without duplicating shared boundary lines', () => {
    expect(
      mergeAccountingImageOcrSegmentTexts([
        'Item A 10.00\nItem B 20.00\nSub Total 30.00',
        'Sub Total 30.00\nHST 3.90\nTotal 33.90',
      ]),
    ).toBe(
      'Item A 10.00\nItem B 20.00\nSub Total 30.00\nHST 3.90\nTotal 33.90',
    );
  });

  it('uses English receipt passes first and skips mixed-language fallback for strong OCR', async () => {
    const input = await makeSmallReceiptImage();
    const attempted: AccountingImageOcrStrategy[] = [];
    const result = await extractAccountingImageText(input, (candidate) => {
      attempted.push(candidate.strategy);
      return Promise.resolve(readableReceiptText);
    });

    expect(result.text).toBe(readableReceiptText);
    expect(attempted).toEqual(['RECEIPT_CONTRAST_ENG_PSM4']);
  });

  it('uses mixed-language fallback only when the receipt-quality score stays weak', async () => {
    const input = await makeSmallReceiptImage();
    const attempted: AccountingImageOcrStrategy[] = [];
    const result = await extractAccountingImageText(input, (candidate) => {
      attempted.push(candidate.strategy);
      return Promise.resolve(
        candidate.strategy === 'FULL_CONTRAST_MIXED_PSM6'
          ? readableReceiptText
          : noisyOcrText,
      );
    });

    expect(result.text).toBe(readableReceiptText);
    expect(attempted).toEqual([
      'RECEIPT_CONTRAST_ENG_PSM4',
      'RECEIPT_BINARY_ENG_PSM4',
      'FULL_CONTRAST_MIXED_PSM6',
    ]);
  });

  it('fails closed when Tesseract returns non-empty low-quality garbage', async () => {
    const input = await makeSmallReceiptImage();

    await expect(
      extractAccountingImageText(input, () => Promise.resolve(noisyOcrText)),
    ).rejects.toThrow('Accounting image OCR produced low-quality text');
  });

  it('records candidate execution failure instead of masking it as empty OCR', async () => {
    const input = await makeSmallReceiptImage();

    await expect(
      extractAccountingImageText(input, (candidate) => {
        if (candidate.strategy === 'RECEIPT_CONTRAST_ENG_PSM4') {
          return Promise.reject(new Error('simulated OCR failure'));
        }
        return Promise.resolve('');
      }),
    ).rejects.toThrow('simulated OCR failure');
  });

  it('preserves the existing successful no-readable-text outcome when all OCR passes complete empty', async () => {
    const input = await makeSmallReceiptImage();

    await expect(
      extractAccountingImageText(input, () => Promise.resolve('')),
    ).resolves.toEqual({ text: '', engine: 'TESSERACT' });
  });
});

async function makeSmallReceiptImage(): Promise<Buffer> {
  return sharp({
    create: {
      width: 400,
      height: 600,
      channels: 3,
      background: { r: 248, g: 248, b: 248 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 300,
            height: 8,
            channels: 3,
            background: { r: 20, g: 20, b: 20 },
          },
        })
          .png()
          .toBuffer(),
        left: 50,
        top: 300,
      },
    ])
    .png()
    .toBuffer();
}
