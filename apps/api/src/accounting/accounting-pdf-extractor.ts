import { inflateSync } from 'zlib';

export type AccountingPdfExtraction = {
  date: string | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  suggestedCategoryStableId: string | null;
  suggestedCategoryName: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  requiresSplit: boolean;
  textLength: number;
};

const moneyPattern = /(?:CAD\s*)?\$?\s*(-?\d{1,6}(?:,\d{3})*(?:\.\d{2}))/i;

function decodePdfLiteral(raw: string): string {
  return raw
    .replace(/\\([nrtbf])/g, (_, code: string) => {
      const values: Record<string, string> = {
        n: '\n',
        r: '\r',
        t: '\t',
        b: '\b',
        f: '\f',
      };
      return values[code] ?? code;
    })
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) =>
      String.fromCharCode(Number.parseInt(octal, 8)),
    );
}

function decodeHexString(raw: string): string {
  const normalized = raw.replace(/\s+/g, '');
  if (!normalized || normalized.length % 2 !== 0) return '';
  const bytes = Buffer.from(normalized, 'hex');
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let result = '';
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      result += String.fromCharCode(bytes.readUInt16BE(index));
    }
    return result;
  }
  return bytes.toString('latin1');
}

function extractTextOperators(content: string): string[] {
  const parts: string[] = [];
  for (const match of content.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
    parts.push(decodePdfLiteral(match[1]));
  }
  for (const match of content.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g)) {
    parts.push(decodeHexString(match[1]));
  }
  for (const match of content.matchAll(/\[((?:.|\n|\r)*?)\]\s*TJ/g)) {
    const arrayBody = match[1];
    for (const literal of arrayBody.matchAll(/\(((?:\\.|[^\\)])*)\)/g)) {
      parts.push(decodePdfLiteral(literal[1]));
    }
    for (const hex of arrayBody.matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
      parts.push(decodeHexString(hex[1]));
    }
  }
  return parts;
}

function replacePdfControlChars(value: string): string {
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
  return normalized;
}

export function extractPdfText(buffer: Buffer): string {
  if (
    buffer.length < 5 ||
    buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
  ) {
    return '';
  }
  const bounded = buffer.subarray(0, Math.min(buffer.length, 10 * 1024 * 1024));
  const source = bounded.toString('latin1');
  const parts = extractTextOperators(source);

  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of source.matchAll(streamRegex)) {
    const streamStart = match.index ?? 0;
    const dictionary = source.slice(
      Math.max(0, streamStart - 500),
      streamStart,
    );
    if (!/\/FlateDecode\b/.test(dictionary)) continue;
    const compressed = Buffer.from(match[1], 'latin1');
    try {
      const inflated = inflateSync(compressed, {
        maxOutputLength: 4 * 1024 * 1024,
      });
      parts.push(...extractTextOperators(inflated.toString('latin1')));
    } catch {
      // Some streams use additional filters/predictors. Leave them for manual review.
    }
  }

  return replacePdfControlChars(parts.join(' ')).replace(/\s+/g, ' ').trim();
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
    suggestedCategoryStableId: suggestion.stableId,
    suggestedCategoryName: suggestion.name,
    confidence,
    requiresSplit,
    textLength: normalizedText.length,
  };
}

export function extractAccountingPdf(buffer: Buffer): {
  text: string;
  extraction: AccountingPdfExtraction;
} {
  const text = extractPdfText(buffer);
  return { text, extraction: extractAccountingText(text) };
}
