export const ACCOUNTING_STRUCTURED_EXPENSE_CSV_PARSER_NAME =
  'accounting-structured-expense-csv';
export const ACCOUNTING_STRUCTURED_EXPENSE_CSV_PARSER_VERSION = '1';

export type AccountingStructuredExpenseCsvRow = {
  rowNumber: number;
  occurredAt: string;
  totalCents: number;
  description: string | null;
  counterparty: string | null;
};

export type AccountingStructuredExpenseCsvParseResult =
  | { matched: false }
  | {
      matched: true;
      headers: string[];
      rows: AccountingStructuredExpenseCsvRow[];
      invalidRows: Array<{
        rowNumber: number;
        reason: 'COLUMN_COUNT_MISMATCH' | 'INVALID_DATE' | 'INVALID_AMOUNT';
      }>;
    };

const DATE_HEADERS = [
  'date',
  'bill date',
  'invoice date',
  'billing date',
  'transaction date',
  'charge date',
  'expense date',
] as const;

const STRONG_EXPENSE_DATE_HEADERS = [
  'bill date',
  'invoice date',
  'billing date',
  'charge date',
  'expense date',
] as const;

const AMOUNT_HEADERS = [
  'amount',
  'amount due',
  'total',
  'total due',
  'invoice total',
  'bill amount',
  'charge amount',
  'expense amount',
  'transaction amount',
] as const;

const STRONG_EXPENSE_AMOUNT_HEADERS = [
  'amount due',
  'total due',
  'invoice total',
  'bill amount',
  'charge amount',
  'expense amount',
] as const;

const DESCRIPTION_HEADERS = [
  'description',
  'service',
  'details',
  'memo',
  'item',
  'category',
] as const;

const COUNTERPARTY_HEADERS = [
  'vendor',
  'supplier',
  'merchant',
  'payee',
  'billing name',
  'company',
  'provider',
] as const;

export function parseAccountingStructuredExpenseCsv(
  text: string,
): AccountingStructuredExpenseCsvParseResult {
  const table = parseCsvTable(text);
  if (!table || table.length < 2) return { matched: false };

  const headers = trimTrailingEmptyCells(table[0]).map(normalizeHeader);
  if (!headers.length || new Set(headers).size !== headers.length) {
    return { matched: false };
  }

  const dateIndex = findHeaderIndex(headers, DATE_HEADERS);
  const amountIndex = findHeaderIndex(headers, AMOUNT_HEADERS);
  if (dateIndex < 0 || amountIndex < 0) return { matched: false };

  const descriptionIndex = findHeaderIndex(headers, DESCRIPTION_HEADERS);
  const counterpartyIndex = findHeaderIndex(headers, COUNTERPARTY_HEADERS);
  const hasContextColumn = descriptionIndex >= 0 || counterpartyIndex >= 0;
  const hasStrongExpenseHeader =
    STRONG_EXPENSE_DATE_HEADERS.some(
      (header) => header === headers[dateIndex],
    ) ||
    STRONG_EXPENSE_AMOUNT_HEADERS.some(
      (header) => header === headers[amountIndex],
    );
  if (!hasContextColumn && !hasStrongExpenseHeader) return { matched: false };

  const requiredMaxIndex = Math.max(dateIndex, amountIndex);
  const rows: AccountingStructuredExpenseCsvRow[] = [];
  const invalidRows: Array<{
    rowNumber: number;
    reason: 'COLUMN_COUNT_MISMATCH' | 'INVALID_DATE' | 'INVALID_AMOUNT';
  }> = [];

  for (let index = 1; index < table.length; index += 1) {
    const rowNumber = index + 1;
    const cells = trimTrailingEmptyCells(table[index]);
    if (cells.every((cell) => !cell.trim())) continue;
    if (cells.length <= requiredMaxIndex) {
      invalidRows.push({ rowNumber, reason: 'COLUMN_COUNT_MISMATCH' });
      continue;
    }

    const occurredAt = parseExpenseCsvDate(cells[dateIndex]);
    if (!occurredAt) {
      invalidRows.push({ rowNumber, reason: 'INVALID_DATE' });
      continue;
    }

    const totalCents = parseExpenseCsvAmount(cells[amountIndex]);
    if (totalCents == null || totalCents <= 0) {
      invalidRows.push({ rowNumber, reason: 'INVALID_AMOUNT' });
      continue;
    }

    rows.push({
      rowNumber,
      occurredAt,
      totalCents,
      description: optionalCell(cells, descriptionIndex),
      counterparty: optionalCell(cells, counterpartyIndex),
    });
  }

  if (!rows.length) return { matched: false };
  return { matched: true, headers, rows, invalidRows };
}

function parseCsvTable(text: string): string[][] | null {
  const source = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      if (cell.length) return null;
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }

  if (inQuotes) return null;
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1].every((value) => !value.trim())) {
    rows.pop();
  }
  return rows;
}

function trimTrailingEmptyCells(input: string[]): string[] {
  const cells = [...input];
  while (cells.length && !cells[cells.length - 1].trim()) cells.pop();
  return cells;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');
}

function findHeaderIndex(
  headers: string[],
  aliases: readonly string[],
): number {
  return headers.findIndex((header) => aliases.includes(header));
}

function parseExpenseCsvDate(value: string | undefined): string | null {
  const raw = value?.trim() ?? '';
  let year: string;
  let month: string;
  let day: string;

  const isoLike = /^(20\d{2})[-/](0?[1-9]|1[0-2])[-/]([0-2]?\d|3[01])$/.exec(
    raw,
  );
  if (isoLike) {
    [, year, month, day] = isoLike;
  } else {
    const monthFirst =
      /^(0?[1-9]|1[0-2])[-/]([0-2]?\d|3[01])[-/](20\d{2})$/.exec(raw);
    if (!monthFirst) return null;
    [, month, day, year] = monthFirst;
  }

  const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== normalized
    ? null
    : normalized;
}

function parseExpenseCsvAmount(value: string | undefined): number | null {
  const raw = value?.trim() ?? '';
  if (!raw) return null;
  const negativeByParens = /^\(.*\)$/.test(raw);
  const cleaned = raw
    .replace(/\bCAD\b/gi, '')
    .replace(/[,$*()\s]/g, '')
    .replace(/^\+/, '');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  const cents = Math.round(parsed * 100);
  return negativeByParens ? -Math.abs(cents) : cents;
}

function optionalCell(cells: string[], index: number): string | null {
  if (index < 0) return null;
  const value = cells[index]?.trim();
  return value || null;
}
