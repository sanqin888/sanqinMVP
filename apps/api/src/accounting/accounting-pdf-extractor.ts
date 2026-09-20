import { spawn } from 'node:child_process';
import {
  ACCOUNTING_DOCUMENT_EXTRACTION_POLICY,
  createTextOnlyAccountingDocumentExtraction,
  type AccountingDocumentExtraction,
  type AccountingDocumentExtractionGeometry,
} from './accounting-document-extraction';

export type AccountingPdfExtraction = {
  date: string | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  sourceCurrency: string | null;
  sourceCurrencyEvidence: 'EXPLICIT_TEXT' | 'AMBIGUOUS' | 'UNKNOWN';
  suggestedCategoryStableId: string | null;
  suggestedCategoryName: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  requiresSplit: boolean;
  textLength: number;
};

const moneyPattern = /(?:CAD\s*)?\$?\s*(-?\d{1,6}(?:,\d{3})*(?:\.\d{2}))/i;

const PDF_TEXT_TIMEOUT_MS = 20_000;
const PDF_TEXT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const PDF_TEXT_MAX_STDERR_BYTES = 16 * 1024;

export type AccountingPdfTextRunner = (buffer: Buffer) => Promise<string>;
export type AccountingPdfLayoutRunner = (buffer: Buffer) => Promise<string>;

function normalizeExtractedPdfText(value: string): string {
  let normalized = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    normalized +=
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f)
        ? ' '
        : char;
  }
  return normalized.replace(/\r\n?/g, '\n').trim();
}

export async function extractPdfText(
  buffer: Buffer,
  runner: AccountingPdfTextRunner = runPdftotext,
): Promise<string> {
  if (
    buffer.length < 5 ||
    buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
  ) {
    return '';
  }

  return normalizeExtractedPdfText(await runner(buffer));
}

function runPdftotext(buffer: Buffer): Promise<string> {
  return runPdftotextCommand(
    buffer,
    ['-enc', 'UTF-8', '-nopgbrk', '-', '-'],
    'text extraction',
  );
}

function runPdftotextBboxLayout(buffer: Buffer): Promise<string> {
  return runPdftotextCommand(
    buffer,
    ['-bbox-layout', '-enc', 'UTF-8', '-nopgbrk', '-', '-'],
    'layout extraction',
  );
}

function runPdftotextCommand(
  buffer: Buffer,
  args: string[],
  operation: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('pdftotext', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
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
      finishReject(new Error(`Accounting PDF ${operation} timed out`));
    }, PDF_TEXT_TIMEOUT_MS);

    child.on('error', (error) => {
      finishReject(
        new Error(
          `Accounting PDF ${operation} unavailable: ${error.message}`,
        ),
      );
    });
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > PDF_TEXT_MAX_OUTPUT_BYTES) {
        child.kill('SIGKILL');
        finishReject(
          new Error(`Accounting PDF ${operation} output exceeded limit`),
        );
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrBytes >= PDF_TEXT_MAX_STDERR_BYTES) return;
      const remaining = PDF_TEXT_MAX_STDERR_BYTES - stderrBytes;
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
            `Accounting PDF ${operation} failed with exit code ${code ?? 'unknown'}${detail ? `: ${detail}` : ''}`,
          ),
        );
        return;
      }
      finishResolve(Buffer.concat(stdoutChunks).toString('utf8'));
    });

    child.stdin.on('error', (error) => {
      finishReject(
        new Error(
          `Accounting PDF ${operation} input failed: ${error.message}`,
        ),
      );
    });
    child.stdin.end(buffer);
  });
}


function parseXmlAttribute(source: string, name: string): number | null {
  const match = new RegExp(
    `\\b${name}=["'](-?\\d+(?:\\.\\d+)?)["']`,
    'i',
  ).exec(source);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function decodeXmlCodePoint(code: string, radix: number): string {
  const value = Number.parseInt(code, radix);
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff
    ? String.fromCodePoint(value)
    : '';
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      decodeXmlCodePoint(code, 16),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      decodeXmlCodePoint(code, 10),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function normalizePdfGeometry(
  attributes: string,
  pageWidth: number,
  pageHeight: number,
): AccountingDocumentExtractionGeometry | null {
  const xMin = parseXmlAttribute(attributes, 'xMin');
  const yMin = parseXmlAttribute(attributes, 'yMin');
  const xMax = parseXmlAttribute(attributes, 'xMax');
  const yMax = parseXmlAttribute(attributes, 'yMax');
  if (
    xMin == null ||
    yMin == null ||
    xMax == null ||
    yMax == null ||
    pageWidth <= 0 ||
    pageHeight <= 0 ||
    xMax <= xMin ||
    yMax <= yMin
  ) {
    return null;
  }
  const left = Math.max(0, Math.min(1, xMin / pageWidth));
  const top = Math.max(0, Math.min(1, yMin / pageHeight));
  const right = Math.max(left, Math.min(1, xMax / pageWidth));
  const bottom = Math.max(top, Math.min(1, yMax / pageHeight));
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

export function parsePopplerBboxLayout(
  source: string,
): AccountingDocumentExtraction {
  const lines: AccountingDocumentExtraction['lines'] = [];
  const pagePattern = /<page\b([^>]*)>([\s\S]*?)<\/page>/gi;
  let pageMatch: RegExpExecArray | null;
  let pageNumber = 0;
  while ((pageMatch = pagePattern.exec(source))) {
    pageNumber += 1;
    const pageAttributes = pageMatch[1] ?? '';
    const pageBody = pageMatch[2] ?? '';
    const pageWidth = parseXmlAttribute(pageAttributes, 'width') ?? 0;
    const pageHeight = parseXmlAttribute(pageAttributes, 'height') ?? 0;
    const linePattern = /<line\b([^>]*)>([\s\S]*?)<\/line>/gi;
    let lineMatch: RegExpExecArray | null;
    let lineNumber = 0;
    while ((lineMatch = linePattern.exec(pageBody))) {
      const lineAttributes = lineMatch[1] ?? '';
      const lineBody = lineMatch[2] ?? '';
      const words = Array.from(
        lineBody.matchAll(/<word\b[^>]*>([\s\S]*?)<\/word>/gi),
      )
        .map((match) => decodeXmlText(match[1] ?? '').trim())
        .filter(Boolean);
      const text = words.join(' ').trim();
      if (!text) continue;
      lineNumber += 1;
      if (lines.length < ACCOUNTING_DOCUMENT_EXTRACTION_POLICY.maxLines) {
        lines.push({
          lineId: `p${pageNumber}-l${lineNumber}`,
          page: pageNumber,
          text: text.slice(
            0,
            ACCOUNTING_DOCUMENT_EXTRACTION_POLICY.maxLineTextChars,
          ),
          confidence: null,
          geometry: normalizePdfGeometry(
            lineAttributes,
            pageWidth,
            pageHeight,
          ),
        });
      }
    }
  }

  const totalLineCount = Array.from(
    source.matchAll(/<line\b[^>]*>[\s\S]*?<\/line>/gi),
  ).length;
  return {
    version: 1,
    inputKind: 'PDF',
    engine: 'POPPLER',
    layoutMode: lines.some((line) => line.geometry)
      ? 'GEOMETRY'
      : 'TEXT_ONLY',
    truncated: totalLineCount > ACCOUNTING_DOCUMENT_EXTRACTION_POLICY.maxLines,
    lines,
  };
}

export async function extractPdfLayout(
  buffer: Buffer,
  runner: AccountingPdfLayoutRunner = runPdftotextBboxLayout,
): Promise<AccountingDocumentExtraction> {
  if (
    buffer.length < 5 ||
    buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
  ) {
    return createTextOnlyAccountingDocumentExtraction({
      inputKind: 'PDF',
      engine: 'POPPLER',
      text: '',
    });
  }
  return parsePopplerBboxLayout(await runner(buffer));
}

function moneyAfterLabel(text: string, labels: RegExp[]): number | null {
  for (const label of labels) {
    const match = label.exec(text);
    if (!match) continue;
    const tail = text.slice(
      match.index + match[0].length,
      match.index + match[0].length + 80,
    );
    const money = moneyPattern.exec(tail);
    if (!money) continue;
    const value = Number(money[1].replace(/,/g, ''));
    if (Number.isFinite(value)) return Math.round(value * 100);
  }
  return null;
}

function detectDate(text: string): string | null {
  const isoLike =
    /\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.]([0-2]?\d|3[01])\b/.exec(text);
  if (isoLike) {
    return `${isoLike[1]}-${isoLike[2].padStart(2, '0')}-${isoLike[3].padStart(2, '0')}`;
  }
  const monthNames: Record<string, string> = {
    january: '01',
    february: '02',
    march: '03',
    april: '04',
    may: '05',
    june: '06',
    july: '07',
    august: '08',
    september: '09',
    october: '10',
    november: '11',
    december: '12',
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    sept: '09',
    oct: '10',
    nov: '11',
    dec: '12',
  };
  const named =
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(20\d{2})\b/i.exec(
      text,
    );
  if (!named) return null;
  const month = monthNames[named[1].toLowerCase()];
  return month ? `${named[3]}-${month}-${named[2].padStart(2, '0')}` : null;
}

function detectSourceCurrency(text: string): {
  sourceCurrency: string | null;
  sourceCurrencyEvidence: 'EXPLICIT_TEXT' | 'AMBIGUOUS' | 'UNKNOWN';
} {
  const detected = new Set<string>();
  if (/\bCAD\b|CAD\$|CA\$/i.test(text)) detected.add('CAD');
  if (/\bUSD\b|USD\$|US\$/i.test(text)) detected.add('USD');
  if (/\bEUR\b|€/i.test(text)) detected.add('EUR');
  if (/\bGBP\b|£/i.test(text)) detected.add('GBP');

  if (detected.size === 1) {
    return {
      sourceCurrency: Array.from(detected)[0],
      sourceCurrencyEvidence: 'EXPLICIT_TEXT',
    };
  }
  if (detected.size > 1) {
    return { sourceCurrency: null, sourceCurrencyEvidence: 'AMBIGUOUS' };
  }
  return { sourceCurrency: null, sourceCurrencyEvidence: 'UNKNOWN' };
}

function suggestCategory(text: string) {
  const rules: Array<[RegExp, string, string]> = [
    [
      /\b(hydro|electric(?:ity)?|natural gas|utility|utilities|water bill)\b/i,
      'expense_utilities',
      '水电燃气',
    ],
    [
      /\b(rogers|bell|telus|internet|telecom|phone service|wireless)\b/i,
      'expense_telecom',
      '网络通讯',
    ],
    [/\b(insurance|policy premium)\b/i, 'expense_insurance', '保险'],
    [/\b(rent|lease payment|base rent)\b/i, 'expense_rent', '房租'],
    [
      /\b(accounting|bookkeeping|legal services?|professional fee)\b/i,
      'expense_professional',
      '专业服务',
    ],
    [
      /\b(subscription|software|saas|hosting|domain renewal)\b/i,
      'expense_software',
      '软件订阅',
    ],
    [
      /\b(repair|maintenance|service call|parts and labour|parts and labor)\b/i,
      'expense_repair',
      '设备维修',
    ],
    [/\b(cleaning|janitorial|sanitation)\b/i, 'expense_cleaning', '清洁用品'],
  ];
  for (const [pattern, stableId, name] of rules) {
    if (pattern.test(text)) return { stableId, name };
  }
  return { stableId: null, name: null };
}

export function extractAccountingText(text: string): AccountingPdfExtraction {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  const subtotalCents = moneyAfterLabel(normalizedText, [
    /\bsub\s*total\b/i,
    /\bsubtotal\b/i,
  ]);
  const taxCents = moneyAfterLabel(normalizedText, [
    /\bHST\b/i,
    /\bGST\/HST\b/i,
    /\btotal tax\b/i,
    /\btax\b/i,
  ]);
  const totalCents = moneyAfterLabel(normalizedText, [
    /\bamount due\b/i,
    /\bbalance due\b/i,
    /\bgrand total\b/i,
    /\btotal amount\b/i,
    /\btotal\b/i,
  ]);
  const sourceCurrency = detectSourceCurrency(normalizedText);
  const suggestion = suggestCategory(normalizedText);
  const priceTokenCount = Array.from(
    normalizedText.matchAll(/\$?\d{1,5}\.\d{2}\b/g),
  ).length;
  const requiresSplit = priceTokenCount >= 8 && !suggestion.stableId;
  const date = detectDate(normalizedText);
  const confidence: AccountingPdfExtraction['confidence'] =
    totalCents != null && suggestion.stableId && date
      ? 'HIGH'
      : totalCents != null || suggestion.stableId
        ? 'MEDIUM'
        : 'LOW';

  return {
    date,
    subtotalCents,
    taxCents,
    totalCents,
    sourceCurrency: sourceCurrency.sourceCurrency,
    sourceCurrencyEvidence: sourceCurrency.sourceCurrencyEvidence,
    suggestedCategoryStableId: suggestion.stableId,
    suggestedCategoryName: suggestion.name,
    confidence,
    requiresSplit,
    textLength: normalizedText.length,
  };
}

export async function extractAccountingPdf(buffer: Buffer): Promise<{
  text: string;
  extraction: AccountingPdfExtraction;
  documentExtraction: AccountingDocumentExtraction;
}> {
  const text = await extractPdfText(buffer);
  let documentExtraction = createTextOnlyAccountingDocumentExtraction({
    inputKind: 'PDF',
    engine: 'POPPLER',
    text,
  });
  try {
    const layout = await extractPdfLayout(buffer);
    if (layout.lines.length > 0) documentExtraction = layout;
  } catch {
    // Preserve the existing native-PDF text path if optional layout extraction fails.
  }
  return {
    text,
    extraction: extractAccountingText(text),
    documentExtraction,
  };
}
