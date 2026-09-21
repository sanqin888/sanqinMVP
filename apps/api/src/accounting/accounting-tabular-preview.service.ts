import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as XLSX from '@keep-lts/xlsx';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AccountingArtifactDeliveryService } from './accounting-artifact-delivery.service';
import { parseAccountingCsvPreviewTable } from './accounting-csv';

export const ACCOUNTING_TABULAR_PREVIEW_LIMITS = {
  maxFileBytes: 8 * 1024 * 1024,
  maxRows: 200,
  maxColumns: 40,
  maxCellCharacters: 500,
  maxSheets: 20,
} as const;

export type AccountingTabularPreview = {
  format: 'CSV' | 'XLSX';
  filename: string;
  sheetNames: string[];
  activeSheetIndex: number | null;
  activeSheetName: string | null;
  sheetNamesTruncated: boolean;
  rows: string[][];
  previewRowCount: number;
  previewColumnCount: number;
  truncatedRows: boolean;
  truncatedColumns: boolean;
  truncatedCells: boolean;
  limits: typeof ACCOUNTING_TABULAR_PREVIEW_LIMITS;
};

@Injectable()
export class AccountingTabularPreviewService {
  constructor(
    private readonly artifactDelivery: AccountingArtifactDeliveryService,
  ) {}

  async previewArtifact(
    artifactStableId: string,
    rawSheetIndex?: unknown,
  ): Promise<AccountingTabularPreview> {
    const resolved =
      await this.artifactDelivery.resolveArtifactContent(artifactStableId);
    const format = accountingTabularPreviewFormat(
      resolved.filename,
      resolved.mimeType,
    );
    if (!format) {
      throw new BadRequestException(
        'accounting evidence does not support structured table preview',
      );
    }

    const stat = await fs.promises.stat(resolved.filePath);
    if (stat.size > ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxFileBytes) {
      throw new PayloadTooLargeException(
        'accounting evidence is too large for structured preview',
      );
    }
    const buffer = await fs.promises.readFile(resolved.filePath);

    if (format === 'CSV') {
      if (rawSheetIndex !== undefined && rawSheetIndex !== null) {
        throw new BadRequestException('CSV preview does not accept sheetIndex');
      }
      return previewAccountingCsv(buffer.toString('utf8'), resolved.filename);
    }

    return previewAccountingXlsx(
      buffer,
      resolved.filename,
      normalizeAccountingPreviewSheetIndex(rawSheetIndex),
    );
  }
}

export function accountingTabularPreviewFormat(
  filename: string,
  mimeType: string,
): 'CSV' | 'XLSX' | null {
  const extension = path.extname(filename).toLowerCase();
  const normalizedMime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (
    extension === '.csv' ||
    normalizedMime === 'text/csv' ||
    normalizedMime === 'application/csv'
  ) {
    return 'CSV';
  }
  if (
    extension === '.xlsx' ||
    normalizedMime ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return 'XLSX';
  }
  return null;
}

export function previewAccountingCsv(
  text: string,
  filename: string,
): AccountingTabularPreview {
  const table = parseAccountingCsvPreviewTable(text, {
    maxRows: ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxRows,
    maxColumns: ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxColumns,
    maxCellCharacters: ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxCellCharacters,
  });
  if (!table) {
    throw new UnprocessableEntityException(
      'CSV evidence could not be parsed safely for preview',
    );
  }
  const normalized = normalizeAccountingPreviewRows(table.rows);
  return {
    format: 'CSV',
    filename,
    sheetNames: [],
    activeSheetIndex: null,
    activeSheetName: null,
    sheetNamesTruncated: false,
    ...normalized,
    truncatedRows: table.truncatedRows || normalized.truncatedRows,
    truncatedColumns: table.truncatedColumns || normalized.truncatedColumns,
    truncatedCells: table.truncatedCells || normalized.truncatedCells,
    limits: ACCOUNTING_TABULAR_PREVIEW_LIMITS,
  };
}

export function previewAccountingXlsx(
  buffer: Buffer,
  filename: string,
  sheetIndex: number,
): AccountingTabularPreview {
  let workbook: ReturnType<typeof XLSX.read>;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      bookVBA: false,
      sheetRows: ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxRows + 1,
      WTF: false,
    });
  } catch {
    throw new UnprocessableEntityException(
      'XLSX evidence could not be parsed safely for preview',
    );
  }

  const allSheetNames = workbook.SheetNames;
  if (!allSheetNames.length) {
    throw new UnprocessableEntityException(
      'XLSX evidence has no readable worksheets',
    );
  }
  const sheetNames = allSheetNames.slice(
    0,
    ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxSheets,
  );
  if (sheetIndex >= sheetNames.length) {
    throw new BadRequestException(
      'sheetIndex is outside the previewable range',
    );
  }

  const activeSheetName = sheetNames[sheetIndex];
  const sheet = workbook.Sheets[activeSheetName];
  if (!sheet) {
    throw new UnprocessableEntityException(
      'XLSX worksheet is unavailable for preview',
    );
  }

  const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: true,
  });
  const normalized = normalizeAccountingPreviewRows(table);
  return {
    format: 'XLSX',
    filename,
    sheetNames,
    activeSheetIndex: sheetIndex,
    activeSheetName,
    sheetNamesTruncated:
      allSheetNames.length > ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxSheets,
    ...normalized,
    limits: ACCOUNTING_TABULAR_PREVIEW_LIMITS,
  };
}

export function normalizeAccountingPreviewRows(rows: unknown[][]): {
  rows: string[][];
  previewRowCount: number;
  previewColumnCount: number;
  truncatedRows: boolean;
  truncatedColumns: boolean;
  truncatedCells: boolean;
} {
  const truncatedRows =
    rows.length > ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxRows;
  let truncatedColumns = false;
  let truncatedCells = false;

  const previewRows = rows
    .slice(0, ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxRows)
    .map((row) => {
      if (row.length > ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxColumns) {
        truncatedColumns = true;
      }
      return row
        .slice(0, ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxColumns)
        .map((cell) => {
          const normalized = accountingPreviewCellText(cell);
          if (
            normalized.length >
            ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxCellCharacters
          ) {
            truncatedCells = true;
            return normalized.slice(
              0,
              ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxCellCharacters,
            );
          }
          return normalized;
        });
    });

  return {
    rows: previewRows,
    previewRowCount: previewRows.length,
    previewColumnCount: previewRows.reduce(
      (max, row) => Math.max(max, row.length),
      0,
    ),
    truncatedRows,
    truncatedColumns,
    truncatedCells,
  };
}

export function normalizeAccountingPreviewSheetIndex(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return 0;
  const value =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d+$/.test(raw.trim())
        ? Number(raw.trim())
        : Number.NaN;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BadRequestException('sheetIndex must be a non-negative integer');
  }
  return value;
}

function accountingPreviewCellText(value: unknown): string {
  let text = '';
  if (value === null || value === undefined) {
    return text;
  }
  if (value instanceof Date) {
    text = Number.isNaN(value.getTime()) ? '' : value.toISOString();
  } else if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    text = String(value);
  }

  return [...text]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      if (
        (codePoint < 32 &&
          character !== '\n' &&
          character !== '\r' &&
          character !== '\t') ||
        codePoint === 127
      ) {
        return ' ';
      }
      return character;
    })
    .join('');
}
