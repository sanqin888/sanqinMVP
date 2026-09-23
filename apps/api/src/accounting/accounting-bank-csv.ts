import { parseAccountingCsvPreviewTable } from './accounting-csv';
import {
  AccountingFinancialProvider,
  type AccountingFinancialProvider as AccountingFinancialProviderValue,
} from './accounting-contracts';

export const ACCOUNTING_BANK_CSV_PARSER_NAME = 'accounting-bank-csv';
export const ACCOUNTING_BANK_CSV_PARSER_VERSION = '1';

const BANK_CSV_LIMITS = {
  maxRows: 5001,
  maxColumns: 32,
  maxCellCharacters: 500,
} as const;

export type AccountingBankCsvDepositRow = {
  rowNumber: number;
  occurredOn: string;
  amountCents: number;
  description: string | null;
  providerHint: AccountingFinancialProviderValue | null;
};

export type AccountingBankCsvParseResult =
  | { matched: false }
  | {
      matched: true;
      headers: string[];
      depositRows: AccountingBankCsvDepositRow[];
      withdrawalRowCount: number;
      invalidRows: Array<{
        rowNumber: number;
        reason:
          | 'COLUMN_COUNT_MISMATCH'
          | 'INVALID_DATE'
          | 'INVALID_INFLOW'
          | 'INVALID_OUTFLOW'
          | 'BOTH_DIRECTIONS';
      }>;
      truncated: boolean;
    };

const DATE_HEADERS = [
  'date',
  'transaction date',
  'posted date',
  'posting date',
] as const;

const DESCRIPTION_HEADERS = [
  'description',
  'transaction details',
  'details',
  'memo',
  'transaction description',
] as const;

const BANK_DIRECTIONAL_HEADER_PAIRS = [
  {
    outflow: ['withdrawal', 'withdrawals'],
    inflow: ['deposit', 'deposits'],
  },
  {
    outflow: ['funds out'],
    inflow: ['funds in'],
  },
  {
    outflow: ['money out'],
    inflow: ['money in'],
  },
] as const;

export function parseAccountingBankCsv(
  text: string,
): AccountingBankCsvParseResult {
  const table = parseAccountingCsvPreviewTable(text, BANK_CSV_LIMITS);
  if (!table || table.rows.length < 1) return { matched: false };

  const cibcHeaderless = isCibcHeaderlessTransactionRow(table.rows[0]);
  const headers = cibcHeaderless
    ? ['date', 'description', 'withdrawals', 'deposits']
    : trimTrailingEmptyCells(table.rows[0]).map(normalizeHeader);
  if (!headers.length || new Set(headers).size !== headers.length) {
    return { matched: false };
  }

  const dateIndex = cibcHeaderless ? 0 : findHeaderIndex(headers, DATE_HEADERS);
  const directionalPair = cibcHeaderless
    ? { outflowIndex: 2, inflowIndex: 3 }
    : BANK_DIRECTIONAL_HEADER_PAIRS.map((pair) => ({
        outflowIndex: findHeaderIndex(headers, pair.outflow),
        inflowIndex: findHeaderIndex(headers, pair.inflow),
      })).find(
        ({ outflowIndex, inflowIndex }) =>
          outflowIndex >= 0 && inflowIndex >= 0,
      );
  if (dateIndex < 0 || !directionalPair) return { matched: false };

  const descriptionIndex = cibcHeaderless
    ? 1
    : findHeaderIndex(headers, DESCRIPTION_HEADERS);
  const requiredMaxIndex = Math.max(
    dateIndex,
    directionalPair.outflowIndex,
    directionalPair.inflowIndex,
  );
  const depositRows: AccountingBankCsvDepositRow[] = [];
  const invalidRows: Array<{
    rowNumber: number;
    reason:
      | 'COLUMN_COUNT_MISMATCH'
      | 'INVALID_DATE'
      | 'INVALID_INFLOW'
      | 'INVALID_OUTFLOW'
      | 'BOTH_DIRECTIONS';
  }> = [];
  let withdrawalRowCount = 0;

  const dataStartIndex = cibcHeaderless ? 0 : 1;
  for (let index = dataStartIndex; index < table.rows.length; index += 1) {
    const rowNumber = index + 1;
    const cells = cibcHeaderless
      ? [...table.rows[index]]
      : trimTrailingEmptyCells(table.rows[index]);
    if (cells.every((cell) => !cell.trim())) continue;
    if (
      cells.length <= requiredMaxIndex ||
      (cibcHeaderless && cells.length !== 4)
    ) {
      invalidRows.push({ rowNumber, reason: 'COLUMN_COUNT_MISMATCH' });
      continue;
    }

    const inflowRaw = cells[directionalPair.inflowIndex]?.trim() ?? '';
    const outflowRaw = cells[directionalPair.outflowIndex]?.trim() ?? '';
    if (!inflowRaw && !outflowRaw) continue;

    const inflowCents = inflowRaw ? parseBankAmount(inflowRaw) : 0;
    if (inflowCents === null || inflowCents < 0) {
      invalidRows.push({ rowNumber, reason: 'INVALID_INFLOW' });
      continue;
    }
    const outflowCents = outflowRaw ? parseBankAmount(outflowRaw) : 0;
    if (outflowCents === null || outflowCents < 0) {
      invalidRows.push({ rowNumber, reason: 'INVALID_OUTFLOW' });
      continue;
    }
    if (inflowCents > 0 && outflowCents > 0) {
      invalidRows.push({ rowNumber, reason: 'BOTH_DIRECTIONS' });
      continue;
    }
    if (inflowCents === 0 && outflowCents > 0) {
      withdrawalRowCount += 1;
      continue;
    }
    if (inflowCents === 0) continue;

    const occurredOn = parseBankDate(cells[dateIndex]);
    if (!occurredOn) {
      invalidRows.push({ rowNumber, reason: 'INVALID_DATE' });
      continue;
    }
    const description = optionalCell(cells, descriptionIndex);
    depositRows.push({
      rowNumber,
      occurredOn,
      amountCents: inflowCents,
      description,
      providerHint: providerHintFromText(description),
    });
  }

  return {
    matched: true,
    headers,
    depositRows,
    withdrawalRowCount,
    invalidRows,
    truncated:
      table.truncatedRows || table.truncatedColumns || table.truncatedCells,
  };
}

function isCibcHeaderlessTransactionRow(row: string[]): boolean {
  if (row.length !== 4) return false;
  const [date, description, outflowRaw, inflowRaw] = row;
  if (!parseBankDate(date)) return false;
  if (
    !/^(?:Branch Transaction|Electronic Funds Transfer|Internet Banking|Point of Sale - Interac|CHEQUE)\b/i.test(
      description.trim(),
    )
  ) {
    return false;
  }

  const outflow = outflowRaw.trim() ? parseBankAmount(outflowRaw) : 0;
  const inflow = inflowRaw.trim() ? parseBankAmount(inflowRaw) : 0;
  if (
    outflow === null ||
    inflow === null ||
    outflow < 0 ||
    inflow < 0 ||
    (outflow > 0 && inflow > 0)
  ) {
    return false;
  }
  return outflow > 0 || inflow > 0;
}

function providerHintFromText(
  value: string | null,
): AccountingFinancialProviderValue | null {
  const normalized = value?.toLowerCase() ?? '';
  if (/\bclover\b|\bfirst\s+data\s+canada\b/.test(normalized)) {
    return AccountingFinancialProvider.CLOVER;
  }
  if (/\buber(?:\s+eats)?\b/.test(normalized)) {
    return AccountingFinancialProvider.UBER_EATS;
  }
  if (/\bfantuan\b|饭团/.test(normalized)) {
    return AccountingFinancialProvider.FANTUAN;
  }
  return null;
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
    .replace(/\s*\(\s*\$\s*\)\s*$/, '')
    .replace(/[\s_-]+/g, ' ');
}

function findHeaderIndex(
  headers: string[],
  aliases: readonly string[],
): number {
  return headers.findIndex((header) => aliases.includes(header));
}

function parseBankDate(value: string | undefined): string | null {
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

function parseBankAmount(value: string): number | null {
  const raw = value.trim();
  if (!raw) return 0;
  const cleaned = raw
    .replace(/\bCAD\b/gi, '')
    .replace(/[,$*\s]/g, '')
    .replace(/^\+/, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  const cents = Math.round(parsed * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function optionalCell(cells: string[], index: number): string | null {
  if (index < 0) return null;
  const value = cells[index]?.trim();
  return value || null;
}
