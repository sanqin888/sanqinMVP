import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { ACCOUNTING_RECEIPT_IMAGE_POLICY } from './accounting-receipt-image';

const OCR_TIMEOUT_MS = 20_000;
const OCR_MAX_OUTPUT_BYTES = 512 * 1024;
const OCR_MAX_PREPARED_SEGMENT_BYTES = 24 * 1024 * 1024;
const OCR_MAX_PREPARED_CANDIDATE_BYTES = 64 * 1024 * 1024;
const OCR_SECOND_RECEIPT_PASS_BELOW_SCORE = 700;
const OCR_MIXED_LANGUAGE_FALLBACK_BELOW_SCORE = 520;
const OCR_MIN_ACCEPTABLE_SCORE = 260;

export const ACCOUNTING_IMAGE_OCR_POLICY = {
  maxInputPixels: ACCOUNTING_RECEIPT_IMAGE_POLICY.maxInputPixels,
  targetWidth: 1800,
  maxSegmentHeight: 5000,
  maxSegmentPixels: 9_000_000,
  maxSegments: 10,
  segmentOverlap: 180,
  analysisPreviewMaxDimension: 1000,
  minSegmentationWidthRatio: 0.25,
  receiptCropMinWidthRatio: 0.15,
  receiptCropMaxWidthRatio: 0.9,
  receiptCropSupportFloor: 0.18,
  receiptCropSupportRelative: 0.35,
  receiptCropMinSupport: 0.35,
  receiptCropMinContrastDelta: 0.12,
  receiptCropMarginRatio: 0.06,
  receiptCropSmoothingRadiusRatio: 0.015,
  trimThreshold: 24,
  adaptiveThresholdWindowSize: 61,
  adaptiveThresholdBias: 15,
  dpi: 300,
  maxPasses: 3,
} as const;

export type AccountingImageOcrResult = {
  text: string;
  engine: 'TESSERACT';
};

export type AccountingImageOcrStrategy =
  | 'RECEIPT_CONTRAST_ENG_PSM4'
  | 'RECEIPT_BINARY_ENG_PSM4'
  | 'FULL_CONTRAST_MIXED_PSM6';

export type PreparedAccountingImageOcrSegment = {
  index: number;
  buffer: Buffer;
  width: number;
  height: number;
  sourceLeft: number;
  sourceTop: number;
  sourceWidth: number;
  sourceHeight: number;
};

export type PreparedAccountingImageOcrCandidate = {
  strategy: AccountingImageOcrStrategy;
  segments: PreparedAccountingImageOcrSegment[];
  language: 'eng' | 'eng+chi_sim';
  pageSegmentationMode: 4 | 6;
  width: number;
  height: number;
};

type AccountingReceiptImageGeometry = {
  cropApplied: boolean;
  cropLeft: number;
  cropWidth: number;
  segmentationWidth: number;
};

export type AccountingReceiptOcrQuality = {
  score: number;
  printableRatio: number;
  normalTokenRatio: number;
  moneyCount: number;
  dateCount: number;
  receiptSignalCount: number;
  structuredLineCount: number;
  noiseLineRatio: number;
  singleCharacterTokenRatio: number;
};

export type ScoredAccountingImageOcrText = {
  strategy: AccountingImageOcrStrategy;
  text: string;
  quality: AccountingReceiptOcrQuality;
};

export type AccountingImageOcrRunner = (
  candidate: PreparedAccountingImageOcrCandidate,
) => Promise<string>;

const receiptSignalPatterns = [
  /\bsub\s*total\b/i,
  /\btotal(?:\s+after\s+tax)?\b/i,
  /\bgrand\s+total\b/i,
  /\bHST\b/i,
  /\bGST\b/i,
  /\btax\b/i,
  /\bdebit(?:\s+card)?\b/i,
  /\bvisa\b/i,
  /\bmaster(?:card)?\b/i,
  /\bapproved\b/i,
  /\bpurchase\b/i,
  /\breceipt\b/i,
  /\binvoice\b/i,
  /\bcash\b/i,
  /\bchange\b/i,
] as const;

const moneyPattern = /(?:CAD\s*)?\$?\s*-?\d{1,6}(?:,\d{3})*(?:\.\d{2})\b/gi;
const datePattern =
  /\b(?:20\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:[0-2]?\d|3[01])|(?:0?[1-9]|1[0-2])[-/.](?:[0-2]?\d|3[01])[-/.]20\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+20\d{2})\b/gi;

export async function extractAccountingImageText(
  buffer: Buffer,
  runner: AccountingImageOcrRunner = runTesseract,
): Promise<AccountingImageOcrResult> {
  const scored: ScoredAccountingImageOcrText[] = [];
  const failures: Error[] = [];
  const primary = await prepareAccountingImagePrimaryOcrCandidate(buffer);
  const receiptContrastSegments = primary.segments;
  await runAndScoreCandidate(primary, runner, scored, failures);

  let winner = selectBestAccountingImageOcrText(scored);
  if (shouldTryAdditionalOcrPass(winner, OCR_SECOND_RECEIPT_PASS_BELOW_SCORE)) {
    const binarySegments = await prepareAccountingBinarySegments(
      receiptContrastSegments,
    );
    const binary = buildAccountingImageOcrCandidate(
      'RECEIPT_BINARY_ENG_PSM4',
      binarySegments,
      'eng',
      4,
    );
    await runAndScoreCandidate(binary, runner, scored, failures);
    winner = selectBestAccountingImageOcrText(scored);
  }

  if (
    shouldTryAdditionalOcrPass(winner, OCR_MIXED_LANGUAGE_FALLBACK_BELOW_SCORE)
  ) {
    const fallbackSegments = await prepareAccountingImageSegments(
      buffer,
      false,
    );
    const fallback = buildAccountingImageOcrCandidate(
      'FULL_CONTRAST_MIXED_PSM6',
      fallbackSegments,
      'eng+chi_sim',
      6,
    );
    await runAndScoreCandidate(fallback, runner, scored, failures);
    winner = selectBestAccountingImageOcrText(scored);
  }

  if (!winner) {
    if (failures.length) throw failures[0];
    return { text: '', engine: 'TESSERACT' };
  }

  if (!winner.text) {
    if (failures.length) throw failures[0];
    return { text: '', engine: 'TESSERACT' };
  }

  if (!isAcceptableAccountingReceiptOcrQuality(winner.quality)) {
    throw new Error(formatAccountingImageOcrLowQualityError(winner, scored));
  }

  return { text: winner.text, engine: 'TESSERACT' };
}

async function runAndScoreCandidate(
  candidate: PreparedAccountingImageOcrCandidate,
  runner: AccountingImageOcrRunner,
  scored: ScoredAccountingImageOcrText[],
  failures: Error[],
): Promise<void> {
  try {
    const text = normalizeAccountingImageOcrText(await runner(candidate));
    scored.push({
      strategy: candidate.strategy,
      text,
      quality: scoreAccountingReceiptOcrText(text),
    });
  } catch (error) {
    failures.push(
      error instanceof Error
        ? error
        : new Error('Unknown Accounting image OCR error'),
    );
  }
}

export async function prepareAccountingImagePrimaryOcrCandidate(
  buffer: Buffer,
): Promise<PreparedAccountingImageOcrCandidate> {
  const segments = await prepareAccountingImageSegments(buffer, true);
  return buildAccountingImageOcrCandidate(
    'RECEIPT_CONTRAST_ENG_PSM4',
    segments,
    'eng',
    4,
  );
}

function buildAccountingImageOcrCandidate(
  strategy: AccountingImageOcrStrategy,
  segments: PreparedAccountingImageOcrSegment[],
  language: PreparedAccountingImageOcrCandidate['language'],
  pageSegmentationMode: PreparedAccountingImageOcrCandidate['pageSegmentationMode'],
): PreparedAccountingImageOcrCandidate {
  assertPreparedCandidateLimits(segments);
  return {
    strategy,
    segments,
    language,
    pageSegmentationMode,
    width: Math.max(...segments.map((segment) => segment.width)),
    height: segments.reduce((sum, segment) => sum + segment.height, 0),
  };
}

async function prepareAccountingBinarySegments(
  sourceSegments: PreparedAccountingImageOcrSegment[],
): Promise<PreparedAccountingImageOcrSegment[]> {
  const binarySegments: PreparedAccountingImageOcrSegment[] = [];
  let totalPreparedBytes = 0;
  for (const segment of sourceSegments) {
    const grayscale = await sharp(segment.buffer)
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (
      grayscale.info.width !== segment.width ||
      grayscale.info.height !== segment.height ||
      grayscale.info.channels !== 1
    ) {
      throw new Error('Accounting image OCR grayscale dimensions are invalid');
    }
    const thresholded = applyAccountingAdaptiveMeanThreshold(
      grayscale.data,
      grayscale.info.width,
      grayscale.info.height,
    );
    const buffer = await sharp(thresholded, {
      raw: {
        width: grayscale.info.width,
        height: grayscale.info.height,
        channels: 1,
      },
    })
      .png()
      .toBuffer();
    assertPreparedSegmentLimits(buffer, segment.width, segment.height);
    totalPreparedBytes += buffer.length;
    assertPreparedCandidateByteLimit(totalPreparedBytes);
    binarySegments.push({ ...segment, buffer });
  }
  return binarySegments;
}

export function applyAccountingAdaptiveMeanThreshold(
  pixels: Uint8Array,
  width: number,
  height: number,
  windowSize = ACCOUNTING_IMAGE_OCR_POLICY.adaptiveThresholdWindowSize,
  bias = ACCOUNTING_IMAGE_OCR_POLICY.adaptiveThresholdBias,
): Buffer {
  if (
    width <= 0 ||
    height <= 0 ||
    pixels.length !== width * height ||
    windowSize < 3 ||
    windowSize % 2 === 0 ||
    bias < 0
  ) {
    throw new Error('Accounting image OCR adaptive threshold input is invalid');
  }

  const radius = Math.floor(windowSize / 2);
  const columnSums = new Uint32Array(width);
  const output = Buffer.allocUnsafe(pixels.length);
  const initialBottom = Math.min(height - 1, radius);

  for (let sourceY = 0; sourceY <= initialBottom; sourceY += 1) {
    const rowOffset = sourceY * width;
    for (let x = 0; x < width; x += 1) {
      columnSums[x] += pixels[rowOffset + x];
    }
  }

  for (let y = 0; y < height; y += 1) {
    if (y > 0) {
      const removeY = y - radius - 1;
      if (removeY >= 0) {
        const rowOffset = removeY * width;
        for (let x = 0; x < width; x += 1) {
          columnSums[x] -= pixels[rowOffset + x];
        }
      }
      const addY = y + radius;
      if (addY < height) {
        const rowOffset = addY * width;
        for (let x = 0; x < width; x += 1) {
          columnSums[x] += pixels[rowOffset + x];
        }
      }
    }

    const verticalStart = Math.max(0, y - radius);
    const verticalEnd = Math.min(height - 1, y + radius);
    const verticalCount = verticalEnd - verticalStart + 1;
    let horizontalStart = 0;
    let horizontalEnd = Math.min(width - 1, radius);
    let localSum = 0;
    for (let x = horizontalStart; x <= horizontalEnd; x += 1) {
      localSum += columnSums[x];
    }

    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      if (x > 0) {
        const removeX = x - radius - 1;
        if (removeX >= 0) {
          localSum -= columnSums[removeX];
          horizontalStart = removeX + 1;
        }
        const addX = x + radius;
        if (addX < width) {
          localSum += columnSums[addX];
          horizontalEnd = addX;
        }
      }
      const localCount = verticalCount * (horizontalEnd - horizontalStart + 1);
      const localMean = localSum / Math.max(localCount, 1);
      output[rowOffset + x] =
        pixels[rowOffset + x] > localMean - bias ? 255 : 0;
    }
  }

  return output;
}

async function prepareAccountingImageSegments(
  buffer: Buffer,
  trimBackground: boolean,
): Promise<PreparedAccountingImageOcrSegment[]> {
  const input = sharp(buffer, {
    failOn: 'error',
    limitInputPixels: ACCOUNTING_IMAGE_OCR_POLICY.maxInputPixels,
  });
  const metadata = await input.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Accounting image OCR source dimensions are unavailable');
  }
  if ((metadata.pages ?? 1) > 1) {
    throw new Error('Animated Accounting receipt images are not supported');
  }

  const swapsAxes = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
  const orientedWidth = swapsAxes ? metadata.height : metadata.width;
  const orientedHeight = swapsAxes ? metadata.width : metadata.height;
  const geometry = await analyzeAccountingReceiptImageGeometry(
    buffer,
    orientedWidth,
  );
  const sourceLeft =
    trimBackground && geometry.cropApplied ? geometry.cropLeft : 0;
  const sourceWidth =
    trimBackground && geometry.cropApplied ? geometry.cropWidth : orientedWidth;
  const estimatedPreparedHeight = Math.max(
    1,
    Math.round(
      (orientedHeight * ACCOUNTING_IMAGE_OCR_POLICY.targetWidth) /
        Math.max(geometry.segmentationWidth, 1),
    ),
  );
  const segmentStride =
    ACCOUNTING_IMAGE_OCR_POLICY.maxSegmentHeight -
    ACCOUNTING_IMAGE_OCR_POLICY.segmentOverlap;
  const idealSegmentCount = Math.max(
    1,
    Math.ceil(
      Math.max(
        1,
        estimatedPreparedHeight - ACCOUNTING_IMAGE_OCR_POLICY.segmentOverlap,
      ) / segmentStride,
    ),
  );
  if (idealSegmentCount > ACCOUNTING_IMAGE_OCR_POLICY.maxSegments) {
    throw new Error(
      `Accounting image OCR receipt exceeds segment limit (${idealSegmentCount} required)`,
    );
  }
  const segmentCount = idealSegmentCount;
  const sourceOverlapHalf =
    segmentCount > 1
      ? Math.max(
          1,
          Math.ceil(
            ((ACCOUNTING_IMAGE_OCR_POLICY.segmentOverlap / 2) *
              geometry.segmentationWidth) /
              ACCOUNTING_IMAGE_OCR_POLICY.targetWidth,
          ),
        )
      : 0;

  const segments: PreparedAccountingImageOcrSegment[] = [];
  let totalPreparedBytes = 0;
  for (let index = 0; index < segmentCount; index += 1) {
    const coreTop = Math.floor((index * orientedHeight) / segmentCount);
    const coreBottom = Math.floor(
      ((index + 1) * orientedHeight) / segmentCount,
    );
    const top = Math.max(0, coreTop - (index > 0 ? sourceOverlapHalf : 0));
    const bottom = Math.min(
      orientedHeight,
      coreBottom + (index < segmentCount - 1 ? sourceOverlapHalf : 0),
    );
    const sourceHeight = Math.max(1, bottom - top);

    const region = {
      left: sourceLeft,
      top,
      width: sourceWidth,
      height: sourceHeight,
    };
    const extracted = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: ACCOUNTING_IMAGE_OCR_POLICY.maxInputPixels,
      autoOrient: true,
    })
      .extract(region)
      .png()
      .toBuffer();
    let pipeline = sharp(extracted, {
      failOn: 'error',
      limitInputPixels: ACCOUNTING_IMAGE_OCR_POLICY.maxInputPixels,
    });
    if (trimBackground) {
      pipeline = pipeline.trim({
        threshold: ACCOUNTING_IMAGE_OCR_POLICY.trimThreshold,
      });
    }

    const prepared = await pipeline
      .resize({
        width: ACCOUNTING_IMAGE_OCR_POLICY.targetWidth,
        height: ACCOUNTING_IMAGE_OCR_POLICY.maxSegmentHeight,
        fit: 'inside',
      })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();
    const preparedMetadata = await sharp(prepared).metadata();
    if (!preparedMetadata.width || !preparedMetadata.height) {
      throw new Error(
        'Accounting image OCR segment dimensions are unavailable',
      );
    }
    assertPreparedSegmentLimits(
      prepared,
      preparedMetadata.width,
      preparedMetadata.height,
    );
    totalPreparedBytes += prepared.length;
    assertPreparedCandidateByteLimit(totalPreparedBytes);
    segments.push({
      index,
      buffer: prepared,
      width: preparedMetadata.width,
      height: preparedMetadata.height,
      sourceLeft: region.left,
      sourceTop: region.top,
      sourceWidth: region.width,
      sourceHeight: region.height,
    });
  }

  return segments;
}

async function analyzeAccountingReceiptImageGeometry(
  buffer: Buffer,
  orientedWidth: number,
): Promise<AccountingReceiptImageGeometry> {
  const preview = await sharp(buffer, {
    failOn: 'error',
    limitInputPixels: ACCOUNTING_IMAGE_OCR_POLICY.maxInputPixels,
  })
    .rotate()
    .resize({
      width: ACCOUNTING_IMAGE_OCR_POLICY.analysisPreviewMaxDimension,
      height: ACCOUNTING_IMAGE_OCR_POLICY.analysisPreviewMaxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (preview.info.channels !== 1) {
    throw new Error('Accounting image OCR analysis preview is not grayscale');
  }

  const previewWidth = preview.info.width;
  const previewHeight = preview.info.height;
  const threshold = calculateAccountingOtsuThreshold(preview.data);
  const columnSupport = new Float64Array(previewWidth);
  for (let y = 0; y < previewHeight; y += 1) {
    const rowOffset = y * previewWidth;
    for (let x = 0; x < previewWidth; x += 1) {
      if (preview.data[rowOffset + x] > threshold) {
        columnSupport[x] += 1;
      }
    }
  }
  for (let x = 0; x < previewWidth; x += 1) {
    columnSupport[x] /= Math.max(previewHeight, 1);
  }

  const smoothingRadius = Math.max(
    2,
    Math.round(
      previewWidth *
        ACCOUNTING_IMAGE_OCR_POLICY.receiptCropSmoothingRadiusRatio,
    ),
  );
  const smoothedSupport = smoothAccountingColumnSupport(
    columnSupport,
    smoothingRadius,
  );
  let maxSupport = 0;
  for (const support of smoothedSupport) {
    maxSupport = Math.max(maxSupport, support);
  }
  const supportThreshold = Math.max(
    ACCOUNTING_IMAGE_OCR_POLICY.receiptCropSupportFloor,
    maxSupport * ACCOUNTING_IMAGE_OCR_POLICY.receiptCropSupportRelative,
  );
  const run = findLargestAccountingColumnRun(smoothedSupport, supportThreshold);
  if (!run) {
    return {
      cropApplied: false,
      cropLeft: 0,
      cropWidth: orientedWidth,
      segmentationWidth: orientedWidth,
    };
  }

  const runWidth = run.end - run.start + 1;
  const runWidthRatio = runWidth / Math.max(previewWidth, 1);
  let insideSupport = 0;
  for (let x = run.start; x <= run.end; x += 1) {
    insideSupport += smoothedSupport[x];
  }
  insideSupport /= Math.max(runWidth, 1);

  let outsideSupport = 0;
  let outsideCount = 0;
  for (let x = 0; x < previewWidth; x += 1) {
    if (x >= run.start && x <= run.end) continue;
    outsideSupport += smoothedSupport[x];
    outsideCount += 1;
  }
  outsideSupport /= Math.max(outsideCount, 1);

  const margin = Math.max(
    4,
    Math.round(runWidth * ACCOUNTING_IMAGE_OCR_POLICY.receiptCropMarginRatio),
  );
  const expandedStart = Math.max(0, run.start - margin);
  const expandedEnd = Math.min(previewWidth - 1, run.end + margin);
  const sourceScaleX = orientedWidth / Math.max(previewWidth, 1);
  const cropLeft = Math.max(0, Math.floor(expandedStart * sourceScaleX));
  const cropRight = Math.min(
    orientedWidth,
    Math.ceil((expandedEnd + 1) * sourceScaleX),
  );
  const cropWidth = Math.max(1, cropRight - cropLeft);
  const minimumSegmentationWidth = Math.max(
    1,
    Math.round(
      orientedWidth * ACCOUNTING_IMAGE_OCR_POLICY.minSegmentationWidthRatio,
    ),
  );
  const cropApplied =
    runWidthRatio >= ACCOUNTING_IMAGE_OCR_POLICY.receiptCropMinWidthRatio &&
    runWidthRatio <= ACCOUNTING_IMAGE_OCR_POLICY.receiptCropMaxWidthRatio &&
    maxSupport >= ACCOUNTING_IMAGE_OCR_POLICY.receiptCropMinSupport &&
    insideSupport - outsideSupport >=
      ACCOUNTING_IMAGE_OCR_POLICY.receiptCropMinContrastDelta &&
    cropWidth < orientedWidth;

  return {
    cropApplied,
    cropLeft: cropApplied ? cropLeft : 0,
    cropWidth: cropApplied ? cropWidth : orientedWidth,
    segmentationWidth: cropApplied
      ? cropWidth
      : Math.min(orientedWidth, Math.max(minimumSegmentationWidth, cropWidth)),
  };
}

function calculateAccountingOtsuThreshold(pixels: Uint8Array): number {
  const histogram = new Uint32Array(256);
  for (const pixel of pixels) {
    histogram[pixel] += 1;
  }

  let weightedTotal = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    weightedTotal += value * histogram[value];
  }

  let backgroundWeight = 0;
  let backgroundWeightedTotal = 0;
  let bestThreshold = 127;
  let bestVariance = -1;
  for (let threshold = 0; threshold < histogram.length; threshold += 1) {
    backgroundWeight += histogram[threshold];
    if (backgroundWeight === 0) continue;
    const foregroundWeight = pixels.length - backgroundWeight;
    if (foregroundWeight === 0) break;
    backgroundWeightedTotal += threshold * histogram[threshold];
    const backgroundMean = backgroundWeightedTotal / backgroundWeight;
    const foregroundMean =
      (weightedTotal - backgroundWeightedTotal) / foregroundWeight;
    const meanDelta = backgroundMean - foregroundMean;
    const variance =
      backgroundWeight * foregroundWeight * meanDelta * meanDelta;
    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = threshold;
    }
  }
  return bestThreshold;
}

function smoothAccountingColumnSupport(
  values: Float64Array,
  radius: number,
): Float64Array {
  const prefix = new Float64Array(values.length + 1);
  for (let index = 0; index < values.length; index += 1) {
    prefix[index + 1] = prefix[index] + values[index];
  }

  const smoothed = new Float64Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length - 1, index + radius);
    smoothed[index] =
      (prefix[end + 1] - prefix[start]) / Math.max(end - start + 1, 1);
  }
  return smoothed;
}

function findLargestAccountingColumnRun(
  support: Float64Array,
  threshold: number,
): { start: number; end: number } | null {
  let best: { start: number; end: number } | null = null;
  let currentStart: number | null = null;
  for (let index = 0; index <= support.length; index += 1) {
    const active = index < support.length && support[index] >= threshold;
    if (active && currentStart == null) {
      currentStart = index;
      continue;
    }
    if (active || currentStart == null) continue;
    const currentEnd = index - 1;
    if (!best || currentEnd - currentStart > best.end - best.start) {
      best = { start: currentStart, end: currentEnd };
    }
    currentStart = null;
  }
  return best;
}

function assertPreparedSegmentLimits(
  buffer: Buffer,
  width: number,
  height: number,
): void {
  if (buffer.length > OCR_MAX_PREPARED_SEGMENT_BYTES) {
    throw new Error('Accounting image OCR segment exceeded byte limit');
  }
  if (width * height > ACCOUNTING_IMAGE_OCR_POLICY.maxSegmentPixels) {
    throw new Error('Accounting image OCR segment exceeded pixel limit');
  }
}

function assertPreparedCandidateByteLimit(totalBytes: number): void {
  if (totalBytes > OCR_MAX_PREPARED_CANDIDATE_BYTES) {
    throw new Error('Accounting image OCR candidate exceeded byte limit');
  }
}

function assertPreparedCandidateLimits(
  segments: PreparedAccountingImageOcrSegment[],
): void {
  if (
    !segments.length ||
    segments.length > ACCOUNTING_IMAGE_OCR_POLICY.maxSegments
  ) {
    throw new Error('Accounting image OCR segment count exceeded limit');
  }
  const totalBytes = segments.reduce(
    (sum, segment) => sum + segment.buffer.length,
    0,
  );
  if (totalBytes > OCR_MAX_PREPARED_CANDIDATE_BYTES) {
    throw new Error('Accounting image OCR candidate exceeded byte limit');
  }
}

export function normalizeAccountingImageOcrText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\b(-?\d{1,6})[.,]\s+(\d{2})\b/g, '$1.$2')
    .replace(/\b(-?\d{1,6}),(\d{2})\b/g, '$1.$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function scoreAccountingReceiptOcrText(
  text: string,
): AccountingReceiptOcrQuality {
  const normalized = normalizeAccountingImageOcrText(text);
  if (!normalized) {
    return {
      score: 0,
      printableRatio: 1,
      normalTokenRatio: 0,
      moneyCount: 0,
      dateCount: 0,
      receiptSignalCount: 0,
      structuredLineCount: 0,
      noiseLineRatio: 0,
      singleCharacterTokenRatio: 0,
    };
  }

  const characters = Array.from(normalized.replace(/\n/g, ''));
  const printableCount = characters.filter((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint >= 0x20 && codePoint !== 0x7f;
  }).length;
  const printableRatio = printableCount / Math.max(characters.length, 1);

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const normalTokenCount = tokens.filter(
    (token) =>
      /[A-Za-z0-9]/.test(token) &&
      /^[\x20-\x7e]+$/.test(token) &&
      token.length >= 2,
  ).length;
  const normalTokenRatio = normalTokenCount / Math.max(tokens.length, 1);
  const singleCharacterTokenRatio =
    tokens.filter((token) => token.length === 1 && /[A-Za-z0-9]/.test(token))
      .length / Math.max(tokens.length, 1);

  const moneyCount = normalized.match(moneyPattern)?.length ?? 0;
  const dateCount = normalized.match(datePattern)?.length ?? 0;
  const receiptSignalCount = receiptSignalPatterns.filter((pattern) =>
    pattern.test(normalized),
  ).length;
  const lines = normalized.split('\n').filter(Boolean);
  const structuredLineCount = lines.filter(
    (line) =>
      /[A-Za-z]{2,}/.test(line) ||
      line.match(moneyPattern)?.length ||
      line.match(datePattern)?.length ||
      receiptSignalPatterns.some((pattern) => pattern.test(line)),
  ).length;
  const noiseLineCount = lines.filter((line) => {
    const compact = line.replace(/\s+/g, '');
    if (compact.length < 4) return false;
    const asciiAlphaNumericCount = compact.match(/[A-Za-z0-9]/g)?.length ?? 0;
    const hasReceiptEvidence =
      (line.match(moneyPattern)?.length ?? 0) > 0 ||
      (line.match(datePattern)?.length ?? 0) > 0 ||
      receiptSignalPatterns.some((pattern) => pattern.test(line));
    return (
      !hasReceiptEvidence && asciiAlphaNumericCount / compact.length < 0.35
    );
  }).length;
  const noiseLineRatio = noiseLineCount / Math.max(lines.length, 1);

  const score = Math.max(
    0,
    Math.round(
      printableRatio * 80 +
        normalTokenRatio * 140 +
        Math.min(moneyCount, 8) * 55 +
        Math.min(dateCount, 2) * 110 +
        Math.min(receiptSignalCount, 8) * 55 +
        Math.min(structuredLineCount, 20) * 7 -
        noiseLineRatio * 180 -
        singleCharacterTokenRatio * 120,
    ),
  );

  return {
    score,
    printableRatio,
    normalTokenRatio,
    moneyCount,
    dateCount,
    receiptSignalCount,
    structuredLineCount,
    noiseLineRatio,
    singleCharacterTokenRatio,
  };
}

export function selectBestAccountingImageOcrText(
  candidates: ScoredAccountingImageOcrText[],
): ScoredAccountingImageOcrText | null {
  let best: ScoredAccountingImageOcrText | null = null;
  for (const candidate of candidates) {
    if (!best || compareOcrQuality(candidate.quality, best.quality) > 0) {
      best = candidate;
    }
  }
  return best;
}

function compareOcrQuality(
  left: AccountingReceiptOcrQuality,
  right: AccountingReceiptOcrQuality,
): number {
  if (left.score !== right.score) return left.score - right.score;
  if (left.receiptSignalCount !== right.receiptSignalCount) {
    return left.receiptSignalCount - right.receiptSignalCount;
  }
  if (left.moneyCount !== right.moneyCount) {
    return left.moneyCount - right.moneyCount;
  }
  if (left.dateCount !== right.dateCount) {
    return left.dateCount - right.dateCount;
  }
  if (left.normalTokenRatio !== right.normalTokenRatio) {
    return left.normalTokenRatio - right.normalTokenRatio;
  }
  if (left.noiseLineRatio !== right.noiseLineRatio) {
    return right.noiseLineRatio - left.noiseLineRatio;
  }
  return 0;
}

function shouldTryAdditionalOcrPass(
  winner: ScoredAccountingImageOcrText | null,
  scoreThreshold: number,
): boolean {
  return (
    !winner ||
    !isAcceptableAccountingReceiptOcrQuality(winner.quality) ||
    winner.quality.score < scoreThreshold
  );
}

function isAcceptableAccountingReceiptOcrQuality(
  quality: AccountingReceiptOcrQuality,
): boolean {
  const hasReceiptEvidence =
    quality.moneyCount > 0 ||
    quality.dateCount > 0 ||
    quality.receiptSignalCount > 0;
  return (
    quality.score >= OCR_MIN_ACCEPTABLE_SCORE &&
    quality.normalTokenRatio >= 0.3 &&
    quality.noiseLineRatio <= 0.55 &&
    hasReceiptEvidence
  );
}

function formatAccountingImageOcrLowQualityError(
  winner: ScoredAccountingImageOcrText,
  candidates: ScoredAccountingImageOcrText[],
): string {
  const diagnostics = candidates
    .map(({ strategy, quality }) =>
      [
        strategy,
        `score=${quality.score}`,
        `normal=${quality.normalTokenRatio.toFixed(2)}`,
        `noise=${quality.noiseLineRatio.toFixed(2)}`,
        `money=${quality.moneyCount}`,
        `date=${quality.dateCount}`,
        `signals=${quality.receiptSignalCount}`,
      ].join(','),
    )
    .join(';');
  return `Accounting image OCR produced low-quality text (winner=${winner.strategy}; ${diagnostics})`;
}

async function runTesseract(
  candidate: PreparedAccountingImageOcrCandidate,
): Promise<string> {
  const segmentTexts: string[] = [];
  let combinedOutputBytes = 0;
  for (const segment of candidate.segments) {
    const text = await runTesseractSegment(
      segment.buffer,
      candidate.language,
      candidate.pageSegmentationMode,
    );
    combinedOutputBytes += Buffer.byteLength(text, 'utf8');
    if (combinedOutputBytes > OCR_MAX_OUTPUT_BYTES) {
      throw new Error('Accounting image OCR output exceeded limit');
    }
    segmentTexts.push(text);
  }
  return mergeAccountingImageOcrSegmentTexts(segmentTexts);
}

function runTesseractSegment(
  buffer: Buffer,
  language: PreparedAccountingImageOcrCandidate['language'],
  pageSegmentationMode: PreparedAccountingImageOcrCandidate['pageSegmentationMode'],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'tesseract',
      [
        'stdin',
        'stdout',
        '-l',
        language,
        '--psm',
        String(pageSegmentationMode),
        '--dpi',
        String(ACCOUNTING_IMAGE_OCR_POLICY.dpi),
        '-c',
        'preserve_interword_spaces=1',
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const clearTimer = () => clearTimeout(timer);
    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimer();
      reject(error);
    };
    const finishResolve = (value: string) => {
      if (settled) return;
      settled = true;
      clearTimer();
      resolve(value);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finishReject(new Error('Accounting image OCR timed out'));
    }, OCR_TIMEOUT_MS);

    child.on('error', (error) => {
      finishReject(
        new Error(`Accounting image OCR unavailable: ${error.message}`),
      );
    });
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > OCR_MAX_OUTPUT_BYTES) {
        child.kill('SIGKILL');
        finishReject(new Error('Accounting image OCR output exceeded limit'));
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrBytes >= 16 * 1024) return;
      const remaining = 16 * 1024 - stderrBytes;
      const bounded = chunk.subarray(0, remaining);
      stderrBytes += bounded.length;
      stderrChunks.push(bounded);
    });
    child.on('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        const detail = Buffer.concat(stderrChunks).toString('utf8').trim();
        finishReject(
          new Error(
            `Accounting image OCR failed with exit code ${code ?? 'unknown'}${detail ? `: ${detail}` : ''}`,
          ),
        );
        return;
      }
      finishResolve(Buffer.concat(stdoutChunks).toString('utf8'));
    });

    child.stdin.on('error', (error) => {
      finishReject(
        new Error(`Accounting image OCR input failed: ${error.message}`),
      );
    });
    child.stdin.end(buffer);
  });
}

export function mergeAccountingImageOcrSegmentTexts(texts: string[]): string {
  const mergedLines: string[] = [];
  for (const text of texts) {
    const normalized = normalizeAccountingImageOcrText(text);
    if (!normalized) continue;
    const nextLines = normalized.split('\n');
    const overlap = findAccountingOcrLineOverlap(mergedLines, nextLines);
    mergedLines.push(...nextLines.slice(overlap));
  }
  return normalizeAccountingImageOcrText(mergedLines.join('\n'));
}

function findAccountingOcrLineOverlap(
  previousLines: string[],
  nextLines: string[],
): number {
  const maxOverlap = Math.min(6, previousLines.length, nextLines.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    const previous = previousLines
      .slice(-size)
      .map(normalizeAccountingOcrLineKey);
    const next = nextLines.slice(0, size).map(normalizeAccountingOcrLineKey);
    if (previous.every((line, index) => line && line === next[index])) {
      return size;
    }
  }
  return 0;
}

function normalizeAccountingOcrLineKey(line: string): string {
  return line
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9$./:%#-]+/g, '')
    .trim();
}
