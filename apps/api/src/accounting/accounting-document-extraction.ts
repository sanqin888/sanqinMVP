export type AccountingDocumentExtractionEngine =
  | 'POPPLER'
  | 'AWS_TEXTRACT'
  | 'TESSERACT';

export type AccountingDocumentExtractionGeometry = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type AccountingDocumentExtractionLine = {
  lineId: string;
  page: number;
  text: string;
  confidence: number | null;
  geometry: AccountingDocumentExtractionGeometry | null;
};

export type AccountingDocumentExtraction = {
  version: 1;
  inputKind: 'PDF' | 'IMAGE';
  engine: AccountingDocumentExtractionEngine;
  layoutMode: 'GEOMETRY' | 'TEXT_ONLY';
  truncated: boolean;
  lines: AccountingDocumentExtractionLine[];
};

export const ACCOUNTING_DOCUMENT_EXTRACTION_POLICY = {
  maxLines: 2_000,
  maxLineTextChars: 500,
} as const;

const MAX_EXTRACTION_LINES = ACCOUNTING_DOCUMENT_EXTRACTION_POLICY.maxLines;
const MAX_LINE_TEXT_CHARS =
  ACCOUNTING_DOCUMENT_EXTRACTION_POLICY.maxLineTextChars;

const boundedLineText = (value: string): string =>
  value.trim().slice(0, MAX_LINE_TEXT_CHARS);

const isFiniteUnitNumber = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;

const isPositiveUnitNumber = (value: unknown): value is number =>
  isFiniteUnitNumber(value) && value > 0;

export function createTextOnlyAccountingDocumentExtraction(params: {
  inputKind: AccountingDocumentExtraction['inputKind'];
  engine: AccountingDocumentExtractionEngine;
  text: string;
}): AccountingDocumentExtraction {
  const sourceLines = params.text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(boundedLineText)
    .filter(Boolean);
  const lines = sourceLines
    .slice(0, MAX_EXTRACTION_LINES)
    .map((text, index) => ({
      lineId: `p1-l${index + 1}`,
      page: 1,
      text,
      confidence: null,
      geometry: null,
    }));
  return {
    version: 1,
    inputKind: params.inputKind,
    engine: params.engine,
    layoutMode: 'TEXT_ONLY',
    truncated: sourceLines.length > MAX_EXTRACTION_LINES,
    lines,
  };
}

export function sliceAccountingDocumentExtractionBeforeMarker(
  extraction: AccountingDocumentExtraction | undefined,
  marker: string,
): AccountingDocumentExtraction | undefined {
  if (!extraction) return undefined;
  const markerLower = marker.trim().toLowerCase();
  if (!markerLower) return extraction;
  const markerIndex = extraction.lines.findIndex((line) =>
    line.text.toLowerCase().includes(markerLower),
  );
  if (markerIndex < 0) return extraction;
  return {
    ...extraction,
    lines: extraction.lines.slice(0, markerIndex),
  };
}

export function parseAccountingDocumentExtraction(
  value: unknown,
): AccountingDocumentExtraction | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return undefined;
  if (record.inputKind !== 'PDF' && record.inputKind !== 'IMAGE') {
    return undefined;
  }
  if (
    record.engine !== 'POPPLER' &&
    record.engine !== 'AWS_TEXTRACT' &&
    record.engine !== 'TESSERACT'
  ) {
    return undefined;
  }
  if (
    (record.engine === 'POPPLER' && record.inputKind !== 'PDF') ||
    (record.engine === 'TESSERACT' && record.inputKind !== 'IMAGE')
  ) {
    return undefined;
  }
  if (record.layoutMode !== 'GEOMETRY' && record.layoutMode !== 'TEXT_ONLY') {
    return undefined;
  }
  if (typeof record.truncated !== 'boolean' || !Array.isArray(record.lines)) {
    return undefined;
  }
  if (record.lines.length > MAX_EXTRACTION_LINES) return undefined;

  const lines: AccountingDocumentExtractionLine[] = [];
  const lineIds = new Set<string>();
  for (const rawLine of record.lines) {
    if (!rawLine || typeof rawLine !== 'object' || Array.isArray(rawLine)) {
      return undefined;
    }
    const line = rawLine as Record<string, unknown>;
    if (
      typeof line.lineId !== 'string' ||
      !line.lineId.trim() ||
      typeof line.page !== 'number' ||
      !Number.isInteger(line.page) ||
      line.page < 1 ||
      typeof line.text !== 'string' ||
      !line.text.trim() ||
      line.text.length > MAX_LINE_TEXT_CHARS
    ) {
      return undefined;
    }
    const lineId = line.lineId.trim();
    if (lineIds.has(lineId)) return undefined;
    lineIds.add(lineId);

    const confidence =
      line.confidence === null
        ? null
        : typeof line.confidence === 'number' &&
            Number.isFinite(line.confidence) &&
            line.confidence >= 0 &&
            line.confidence <= 100
          ? line.confidence
          : undefined;
    if (confidence === undefined) return undefined;

    let geometry: AccountingDocumentExtractionGeometry | null = null;
    if (line.geometry !== null) {
      if (
        !line.geometry ||
        typeof line.geometry !== 'object' ||
        Array.isArray(line.geometry)
      ) {
        return undefined;
      }
      const rawGeometry = line.geometry as Record<string, unknown>;
      if (
        !isFiniteUnitNumber(rawGeometry.left) ||
        !isFiniteUnitNumber(rawGeometry.top) ||
        !isPositiveUnitNumber(rawGeometry.width) ||
        !isPositiveUnitNumber(rawGeometry.height) ||
        rawGeometry.left + rawGeometry.width > 1.000001 ||
        rawGeometry.top + rawGeometry.height > 1.000001
      ) {
        return undefined;
      }
      geometry = {
        left: rawGeometry.left,
        top: rawGeometry.top,
        width: rawGeometry.width,
        height: rawGeometry.height,
      };
    }

    lines.push({
      lineId,
      page: line.page,
      text: line.text.trim(),
      confidence,
      geometry,
    });
  }

  const hasGeometry = lines.some((line) => line.geometry !== null);
  if (
    (record.layoutMode === 'GEOMETRY' && !hasGeometry) ||
    (record.layoutMode === 'TEXT_ONLY' && hasGeometry)
  ) {
    return undefined;
  }

  return {
    version: 1,
    inputKind: record.inputKind,
    engine: record.engine,
    layoutMode: record.layoutMode,
    truncated: record.truncated,
    lines,
  };
}
