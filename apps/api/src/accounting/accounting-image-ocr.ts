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
  trimThreshold: 24,
  binaryThreshold: 180,
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
};

export type PreparedAccountingImageOcrCandidate = {
  strategy: AccountingImageOcrStrategy;
  segments: PreparedAccountingImageOcrSegment[];
  language: 'eng' | 'eng+chi_sim';
  pageSegmentationMode: 4 | 6;
  width: number;
  height: number;
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

const moneyPattern =
  /(?:CAD\s*)?\$?\s*-?\d{1,6}(?:,\d{3})*(?:\.\d{2})\b/gi;
const datePattern =
  /\b(?:20\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:[0-2]?\d|3[01])|(?:0?[1-9]|1[0-2])[-/.](?:[0-2]?\d|3[01])[-/.]20\d{2})\b/gi;

export async function extractAccountingImageText(
  buffer: Buffer,
  runner: AccountingImageOcrRunner = runTesseract,
): Promise<AccountingImageOcrResult> {
  const scored: ScoredAccountingImageOcrText[] = [];
  const failures: Error[] = [];
  const receiptContrastSegments = await prepareAccountingImageSegments(
    buffer,
    true,
  );
  const primary = buildAccountingImageOcrCandidate(
    'RECEIPT_CONTRAST_ENG_PSM4',
    receiptContrastSegments,
    'eng',
    4,
  );
  await runAndScoreCandidate(primary, runner, scored, failures);

  let winner = selectBestAccountingImageOcrText(scored);
  if (
    shouldTryAdditionalOcrPass(winner, OCR_SECOND_RECEIPT_PASS_BELOW_SCORE)
  ) {
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
    shouldTryAdditionalOcrPass(
      winner,
      OCR_MIXED_LANGUAGE_FALLBACK_BELOW_SCORE,
    )
  ) {
    const fallbackSegments = await prepareAccountingImageSegments(buffer, false);
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
    throw new Error(
      `Accounting image OCR produced low-quality text (score ${winner.quality.score})`,
    );
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

export async function prepareAccountingImageOcrCandidates(
  buffer: Buffer,
): Promise<PreparedAccountingImageOcrCandidate[]> {
  const receiptContrastSegments = await prepareAccountingImageSegments(
    buffer,
    true,
  );
  const receiptBinarySegments = await prepareAccountingBinarySegments(
    receiptContrastSegments,
  );
  const fullContrastSegments = await prepareAccountingImageSegments(
    buffer,
    false,
  );

  return [
    buildAccountingImageOcrCandidate(
      'RECEIPT_CONTRAST_ENG_PSM4',
      receiptContrastSegments,
      'eng',
      4,
    ),
    buildAccountingImageOcrCandidate(
      'RECEIPT_BINARY_ENG_PSM4',
      receiptBinarySegments,
      'eng',
      4,
    ),
    buildAccountingImageOcrCandidate(
      'FULL_CONTRAST_MIXED_PSM6',
      fullContrastSegments,
      'eng+chi_sim',
      6,
    ),
  ];
}

function buildAccountingImageOcrCandidate(
  strategy: AccountingImageOcrStrategy,
  segments: PreparedAccountingImageOcrSegment[],
  language: PreparedAccountingImageOcrCandidate['language'],
  pageSegmentationMode: PreparedAccountingImageOcrCandidate[
    'pageSegmentationMode'
  ],
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
    const buffer = await sharp(segment.buffer)
      .threshold(ACCOUNTING_IMAGE_OCR_POLICY.binaryThreshold)
      .png()
      .toBuffer();
    assertPreparedSegmentLimits(buffer, segment.width, segment.height);
    totalPreparedBytes += buffer.length;
    assertPreparedCandidateByteLimit(totalPreparedBytes);
    binarySegments.push({ ...segment, buffer });
  }
  return binarySegments;
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
  const segmentationWidth = await estimateAccountingReceiptSegmentationWidth(
    buffer,
    orientedWidth,
    orientedHeight,
  );
  const estimatedPreparedHeight = Math.max(
    1,
    Math.round(
      (orientedHeight * ACCOUNTING_IMAGE_OCR_POLICY.targetWidth) /
        Math.max(segmentationWidth, 1),
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
            ((ACCOUNTING_IMAGE_OCR_POLICY.segmentOverlap / 2) * segmentationWidth) /
              ACCOUNTING_IMAGE_OCR_POLICY.targetWidth,
          ),
        )
      : 0;

  const segments: PreparedAccountingImageOcrSegment[] = [];
  let totalPreparedBytes = 0;
  for (let index = 0; index < segmentCount; index += 1) {
    const coreTop = Math.floor((index * orientedHeight) / segmentCount);
    const coreBottom = Math.floor(((index + 1) * orientedHeight) / segmentCount);
    const top = Math.max(0, coreTop - (index > 0 ? sourceOverlapHalf : 0));
    const bottom = Math.min(
      orientedHeight,
      coreBottom + (index < segmentCount - 1 ? sourceOverlapHalf : 0),
    );
    const sourceHeight = Math.max(1, bottom - top);

    let pipeline = sharp(buffer, {
      failOn: 'error',
      limitInputPixels: ACCOUNTING_IMAGE_OCR_POLICY.maxInputPixels,
    })
      .rotate()
      .extract({
        left: 0,
        top,
        width: orientedWidth,
        height: sourceHeight,
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
      throw new Error('Accounting image OCR segment dimensions are unavailable');
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
    });
  }

  return segments;
}

async function estimateAccountingReceiptSegmentationWidth(
  buffer: Buffer,
  orientedWidth: number,
  orientedHeight: number,
): Promise<number> {
  const previewScale = Math.min(
    1,
    ACCOUNTING_IMAGE_OCR_POLICY.analysisPreviewMaxDimension /
      Math.max(orientedWidth, 1),
    ACCOUNTING_IMAGE_OCR_POLICY.analysisPreviewMaxDimension /
      Math.max(orientedHeight, 1),
  );
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
    .trim({ threshold: ACCOUNTING_IMAGE_OCR_POLICY.trimThreshold })
    .grayscale()
    .png()
    .toBuffer({ resolveWithObject: true });
  const estimatedTrimmedWidth = Math.max(
    1,
    Math.round(preview.info.width / Math.max(previewScale, Number.EPSILON)),
  );
  const minimumWidth = Math.max(
    1,
    Math.round(
      orientedWidth * ACCOUNTING_IMAGE_OCR_POLICY.minSegmentationWidthRatio,
    ),
  );
  return Math.min(
    orientedWidth,
    Math.max(minimumWidth, estimatedTrimmedWidth),
  );
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
    const asciiAlphaNumericCount =
      compact.match(/[A-Za-z0-9]/g)?.length ?? 0;
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
  pageSegmentationMode: PreparedAccountingImageOcrCandidate[
    'pageSegmentationMode'
  ],
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
    const previous = previousLines.slice(-size).map(normalizeAccountingOcrLineKey);
    const next = nextLines.slice(0, size).map(normalizeAccountingOcrLineKey);
    if (
      previous.every((line, index) => line && line === next[index])
    ) {
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
