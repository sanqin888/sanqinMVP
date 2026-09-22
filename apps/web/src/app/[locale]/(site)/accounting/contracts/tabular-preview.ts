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
  limits: {
    maxFileBytes: number;
    maxRows: number;
    maxColumns: number;
    maxCellCharacters: number;
    maxSheets: number;
  };
};
