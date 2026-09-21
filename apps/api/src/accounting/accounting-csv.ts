export type AccountingCsvPreviewTable = {
  rows: string[][];
  truncatedRows: boolean;
  truncatedColumns: boolean;
  truncatedCells: boolean;
};

type AccountingCsvScanLimits = {
  maxRows: number;
  maxColumns: number;
  maxCellCharacters: number;
};

export function parseAccountingCsvTable(text: string): string[][] | null {
  const parsed = scanAccountingCsv(text, null);
  if (!parsed) return null;
  while (
    parsed.rows.length &&
    parsed.rows[parsed.rows.length - 1].every((value) => !value.trim())
  ) {
    parsed.rows.pop();
  }
  return parsed.rows;
}

export function parseAccountingCsvPreviewTable(
  text: string,
  limits: AccountingCsvScanLimits,
): AccountingCsvPreviewTable | null {
  return scanAccountingCsv(text, limits);
}

function scanAccountingCsv(
  text: string,
  limits: AccountingCsvScanLimits | null,
): AccountingCsvPreviewTable | null {
  const source = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let cellCharacterCount = 0;
  let columnIndex = 0;
  let completedRowCount = 0;
  let inQuotes = false;
  let truncatedRows = false;
  let truncatedColumns = false;
  let truncatedCells = false;

  const storesCurrentRow = () =>
    limits === null || completedRowCount < limits.maxRows;
  const storesCurrentCell = () =>
    storesCurrentRow() &&
    (limits === null || columnIndex < limits.maxColumns);

  const appendCellText = (value: string) => {
    cellCharacterCount += value.length;
    if (!storesCurrentCell()) return;
    if (limits === null || cell.length < limits.maxCellCharacters) {
      const remaining =
        limits === null
          ? value.length
          : limits.maxCellCharacters - cell.length;
      cell += value.slice(0, remaining);
      if (remaining < value.length) truncatedCells = true;
    } else {
      truncatedCells = true;
    }
  };

  const commitCell = () => {
    if (storesCurrentRow()) {
      if (limits === null || columnIndex < limits.maxColumns) {
        row.push(cell);
      } else {
        truncatedColumns = true;
      }
    }
    columnIndex += 1;
    cell = '';
    cellCharacterCount = 0;
  };

  const commitRow = () => {
    commitCell();
    if (storesCurrentRow()) {
      rows.push(row);
    } else {
      truncatedRows = true;
    }
    completedRowCount += 1;
    row = [];
    columnIndex = 0;
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          appendCellText('"');
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        appendCellText(char);
      }
      continue;
    }

    if (char === '"') {
      if (cellCharacterCount) return null;
      inQuotes = true;
    } else if (char === ',') {
      commitCell();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      commitRow();
    } else {
      appendCellText(char);
    }
  }

  if (inQuotes) return null;
  if (cellCharacterCount || columnIndex) {
    commitRow();
  }

  return {
    rows,
    truncatedRows,
    truncatedColumns,
    truncatedCells,
  };
}
