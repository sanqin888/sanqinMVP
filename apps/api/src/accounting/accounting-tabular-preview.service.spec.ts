import {
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import * as XLSX from '@keep-lts/xlsx';
import * as fs from 'node:fs';
import {
  ACCOUNTING_TABULAR_PREVIEW_LIMITS,
  AccountingTabularPreviewService,
  accountingTabularPreviewFormat,
  normalizeAccountingPreviewRows,
  normalizeAccountingPreviewSheetIndex,
  previewAccountingCsv,
  previewAccountingXlsx,
} from './accounting-tabular-preview.service';

describe('AccountingTabularPreviewService', () => {
  it('previews quoted CSV as plain table values', () => {
    const preview = previewAccountingCsv(
      'id,note\r\n1,"hello, ""world"""\r\n',
      'sample.csv',
    );

    expect(preview).toEqual(
      expect.objectContaining({
        format: 'CSV',
        filename: 'sample.csv',
        activeSheetIndex: null,
        activeSheetName: null,
        rows: [
          ['id', 'note'],
          ['1', 'hello, "world"'],
        ],
        truncatedRows: false,
        truncatedColumns: false,
        truncatedCells: false,
      }),
    );
  });

  it('previews XLSX cached values without exposing formula text', () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['label', 'value'],
      ['cached formula', 2],
    ]);
    sheet.B2 = {
      t: 'n',
      v: 2,
      f: '1+1',
    };
    XLSX.utils.book_append_sheet(workbook, sheet, 'Summary');
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['second sheet']]),
      'Details',
    );
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;

    const preview = previewAccountingXlsx(buffer, 'book.xlsx', 0);

    expect(preview.sheetNames).toEqual(['Summary', 'Details']);
    expect(preview.activeSheetName).toBe('Summary');
    expect(preview.rows[1]).toEqual(['cached formula', '2']);
    expect(JSON.stringify(preview)).not.toContain('1+1');
  });

  it('bounds CSV rows and columns during tokenization', () => {
    const csv = Array.from(
      { length: ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxRows + 1 },
      (_, rowIndex) =>
        Array.from(
          { length: ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxColumns + 1 },
          (_, columnIndex) => `${rowIndex}:${columnIndex}`,
        ).join(','),
    ).join('\n');

    const preview = previewAccountingCsv(csv, 'large.csv');

    expect(preview.previewRowCount).toBe(
      ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxRows,
    );
    expect(preview.previewColumnCount).toBe(
      ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxColumns,
    );
    expect(preview.truncatedRows).toBe(true);
    expect(preview.truncatedColumns).toBe(true);
  });

  it('bounds rows, columns, and cell text', () => {
    const oversizedRows = Array.from(
      { length: ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxRows + 1 },
      (_, rowIndex) =>
        Array.from(
          { length: ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxColumns + 1 },
          (_, columnIndex) =>
            rowIndex === 0 && columnIndex === 0
              ? 'x'.repeat(
                  ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxCellCharacters + 1,
                )
              : `${rowIndex}:${columnIndex}`,
        ),
    );

    const preview = normalizeAccountingPreviewRows(oversizedRows);

    expect(preview.previewRowCount).toBe(
      ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxRows,
    );
    expect(preview.previewColumnCount).toBe(
      ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxColumns,
    );
    expect(preview.rows[0][0]).toHaveLength(
      ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxCellCharacters,
    );
    expect(preview.truncatedRows).toBe(true);
    expect(preview.truncatedColumns).toBe(true);
    expect(preview.truncatedCells).toBe(true);
  });

  it('detects only CSV/XLSX evidence and validates sheet index', () => {
    expect(
      accountingTabularPreviewFormat(
        'statement.csv',
        'application/octet-stream',
      ),
    ).toBe('CSV');
    expect(
      accountingTabularPreviewFormat(
        'statement.bin',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBe('XLSX');
    expect(
      accountingTabularPreviewFormat('statement.pdf', 'application/pdf'),
    ).toBeNull();

    expect(normalizeAccountingPreviewSheetIndex(undefined)).toBe(0);
    expect(normalizeAccountingPreviewSheetIndex('2')).toBe(2);
    expect(() => normalizeAccountingPreviewSheetIndex('-1')).toThrow(
      BadRequestException,
    );
  });

  it('rejects oversized binaries before reading them', async () => {
    const artifactDelivery = {
      resolveArtifactContent: jest.fn().mockResolvedValue({
        filePath: '/tmp/oversized.csv',
        mimeType: 'text/csv; charset=utf-8',
        filename: 'oversized.csv',
        retainedDerivative: false,
      }),
    };
    const statSpy = jest.spyOn(fs.promises, 'stat').mockResolvedValue({
      size: ACCOUNTING_TABULAR_PREVIEW_LIMITS.maxFileBytes + 1,
    } as fs.Stats);
    const readSpy = jest.spyOn(fs.promises, 'readFile');

    try {
      const service = new AccountingTabularPreviewService(
        artifactDelivery as never,
      );
      await expect(
        service.previewArtifact('acctart_large'),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
      expect(readSpy).not.toHaveBeenCalled();
    } finally {
      statSpy.mockRestore();
      readSpy.mockRestore();
    }
  });
});
