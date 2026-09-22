import type { AccountingDocumentExtraction } from './accounting-document-extraction';

export type AccountingPdfNativeTextUsabilityDisposition =
  | 'USABLE_NATIVE_TEXT'
  | 'SCAN_CANDIDATE'
  | 'FAIL_CLOSED';

export type AccountingPdfNativeTextUsabilityReason =
  | 'NATIVE_TEXT_USABLE'
  | 'NO_NATIVE_TEXT'
  | 'INSUFFICIENT_NATIVE_TEXT'
  | 'TRUNCATED_NATIVE_EXTRACTION'
  | 'SUSPICIOUS_NATIVE_TEXT'
  | 'AMBIGUOUS_NATIVE_TEXT';

export type AccountingPdfNativeTextUsabilityMetrics = {
  characterCount: number;
  meaningfulCharacterCount: number;
  meaningfulTokenCount: number;
  meaningfulLineCount: number;
  hanCharacterCount: number;
  suspiciousCharacterCount: number;
  suspiciousCharacterRatio: number;
  extractionLineCount: number;
  geometryLineCount: number;
};

export type AccountingPdfNativeTextUsability = {
  disposition: AccountingPdfNativeTextUsabilityDisposition;
  reason: AccountingPdfNativeTextUsabilityReason;
  metrics: AccountingPdfNativeTextUsabilityMetrics;
};

const MIN_MEANINGFUL_CHARACTERS = 8;
const MIN_MEANINGFUL_TOKENS = 2;
const MIN_MEANINGFUL_LINES = 2;
const MIN_HAN_CHARACTERS = 4;
const MIN_SUSPICIOUS_CHARACTERS = 4;
const MIN_SUSPICIOUS_CHARACTER_RATIO = 0.2;

const letterOrNumberPattern = /[\p{L}\p{N}]/u;
const hanPattern = /\p{Script=Han}/u;

const isPrivateUseCodePoint = (codePoint: number): boolean =>
  (codePoint >= 0xe000 && codePoint <= 0xf8ff) ||
  (codePoint >= 0xf0000 && codePoint <= 0xffffd) ||
  (codePoint >= 0x100000 && codePoint <= 0x10fffd);

const isSuspiciousCharacter = (character: string): boolean => {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    character === '\uFFFD' ||
    isPrivateUseCodePoint(codePoint) ||
    (codePoint < 0x20 &&
      character !== '\n' &&
      character !== '\r' &&
      character !== '\t')
  );
};

const countCharacters = (
  value: string,
  predicate: (character: string) => boolean,
): number => Array.from(value).filter(predicate).length;

const countMeaningfulCharacters = (value: string): number =>
  countCharacters(value, (character) => letterOrNumberPattern.test(character));

const countHanCharacters = (value: string): number =>
  countCharacters(value, (character) => hanPattern.test(character));

const isFiniteNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  Number.isInteger(value) &&
  value >= 0;

const isFiniteRatio = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;

export function assessAccountingPdfNativeTextUsability(params: {
  text: string;
  documentExtraction: AccountingDocumentExtraction;
}): AccountingPdfNativeTextUsability {
  const normalized = params.text.replace(/\r\n?/g, '\n').trim();
  const characters = Array.from(normalized);
  const meaningfulCharacterCount = countMeaningfulCharacters(normalized);
  const meaningfulTokenCount = normalized
    .split(/\s+/u)
    .filter(Boolean)
    .filter((token) => countMeaningfulCharacters(token) >= 2).length;
  const meaningfulLineCount = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => countMeaningfulCharacters(line) >= 2).length;
  const hanCharacterCount = countHanCharacters(normalized);
  const nonWhitespaceCharacters = characters.filter(
    (character) => !/\s/u.test(character),
  );
  const suspiciousCharacterCount = characters.filter(
    isSuspiciousCharacter,
  ).length;
  const metrics: AccountingPdfNativeTextUsabilityMetrics = {
    characterCount: characters.length,
    meaningfulCharacterCount,
    meaningfulTokenCount,
    meaningfulLineCount,
    hanCharacterCount,
    suspiciousCharacterCount,
    suspiciousCharacterRatio:
      suspiciousCharacterCount / Math.max(nonWhitespaceCharacters.length, 1),
    extractionLineCount: params.documentExtraction.lines.length,
    geometryLineCount: params.documentExtraction.lines.filter(
      (line) => line.geometry !== null,
    ).length,
  };

  if (params.documentExtraction.truncated) {
    return {
      disposition: 'FAIL_CLOSED',
      reason: 'TRUNCATED_NATIVE_EXTRACTION',
      metrics,
    };
  }

  if (!normalized) {
    return {
      disposition: 'SCAN_CANDIDATE',
      reason: 'NO_NATIVE_TEXT',
      metrics,
    };
  }

  if (
    suspiciousCharacterCount >= MIN_SUSPICIOUS_CHARACTERS &&
    metrics.suspiciousCharacterRatio >= MIN_SUSPICIOUS_CHARACTER_RATIO
  ) {
    return {
      disposition: 'FAIL_CLOSED',
      reason: 'SUSPICIOUS_NATIVE_TEXT',
      metrics,
    };
  }

  if (meaningfulCharacterCount < MIN_MEANINGFUL_CHARACTERS) {
    return {
      disposition: 'SCAN_CANDIDATE',
      reason: 'INSUFFICIENT_NATIVE_TEXT',
      metrics,
    };
  }

  const hasLexicalStructure =
    meaningfulTokenCount >= MIN_MEANINGFUL_TOKENS &&
    (meaningfulLineCount >= MIN_MEANINGFUL_LINES ||
      hanCharacterCount >= MIN_HAN_CHARACTERS);

  if (hasLexicalStructure) {
    return {
      disposition: 'USABLE_NATIVE_TEXT',
      reason: 'NATIVE_TEXT_USABLE',
      metrics,
    };
  }

  return {
    disposition: 'FAIL_CLOSED',
    reason: 'AMBIGUOUS_NATIVE_TEXT',
    metrics,
  };
}

export function parseAccountingPdfNativeTextUsability(
  value: unknown,
): AccountingPdfNativeTextUsability | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const disposition = record.disposition;
  const reason = record.reason;
  const rawMetrics = record.metrics;
  if (
    disposition !== 'USABLE_NATIVE_TEXT' &&
    disposition !== 'SCAN_CANDIDATE' &&
    disposition !== 'FAIL_CLOSED'
  ) {
    return undefined;
  }
  if (
    reason !== 'NATIVE_TEXT_USABLE' &&
    reason !== 'NO_NATIVE_TEXT' &&
    reason !== 'INSUFFICIENT_NATIVE_TEXT' &&
    reason !== 'TRUNCATED_NATIVE_EXTRACTION' &&
    reason !== 'SUSPICIOUS_NATIVE_TEXT' &&
    reason !== 'AMBIGUOUS_NATIVE_TEXT'
  ) {
    return undefined;
  }
  if (
    !rawMetrics ||
    typeof rawMetrics !== 'object' ||
    Array.isArray(rawMetrics)
  ) {
    return undefined;
  }
  const metrics = rawMetrics as Record<string, unknown>;
  if (
    !isFiniteNonNegativeInteger(metrics.characterCount) ||
    !isFiniteNonNegativeInteger(metrics.meaningfulCharacterCount) ||
    !isFiniteNonNegativeInteger(metrics.meaningfulTokenCount) ||
    !isFiniteNonNegativeInteger(metrics.meaningfulLineCount) ||
    !isFiniteNonNegativeInteger(metrics.hanCharacterCount) ||
    !isFiniteNonNegativeInteger(metrics.suspiciousCharacterCount) ||
    !isFiniteRatio(metrics.suspiciousCharacterRatio) ||
    !isFiniteNonNegativeInteger(metrics.extractionLineCount) ||
    !isFiniteNonNegativeInteger(metrics.geometryLineCount)
  ) {
    return undefined;
  }

  const reasonMatchesDisposition =
    (disposition === 'USABLE_NATIVE_TEXT' && reason === 'NATIVE_TEXT_USABLE') ||
    (disposition === 'SCAN_CANDIDATE' &&
      (reason === 'NO_NATIVE_TEXT' || reason === 'INSUFFICIENT_NATIVE_TEXT')) ||
    (disposition === 'FAIL_CLOSED' &&
      (reason === 'TRUNCATED_NATIVE_EXTRACTION' ||
        reason === 'SUSPICIOUS_NATIVE_TEXT' ||
        reason === 'AMBIGUOUS_NATIVE_TEXT'));
  if (!reasonMatchesDisposition) return undefined;
  if (
    metrics.meaningfulCharacterCount > metrics.characterCount ||
    metrics.hanCharacterCount > metrics.meaningfulCharacterCount ||
    metrics.suspiciousCharacterCount > metrics.characterCount ||
    metrics.geometryLineCount > metrics.extractionLineCount
  ) {
    return undefined;
  }

  return {
    disposition,
    reason,
    metrics: {
      characterCount: metrics.characterCount,
      meaningfulCharacterCount: metrics.meaningfulCharacterCount,
      meaningfulTokenCount: metrics.meaningfulTokenCount,
      meaningfulLineCount: metrics.meaningfulLineCount,
      hanCharacterCount: metrics.hanCharacterCount,
      suspiciousCharacterCount: metrics.suspiciousCharacterCount,
      suspiciousCharacterRatio: metrics.suspiciousCharacterRatio,
      extractionLineCount: metrics.extractionLineCount,
      geometryLineCount: metrics.geometryLineCount,
    },
  };
}
