import * as XLSX from '@keep-lts/xlsx';
import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole,
} from './accounting-contracts';
import type { ParsedProviderFinancialDocument } from './accounting-provider-financial.parser';
import {
  FANTUAN_ADJUSTMENT_DETAIL_EVIDENCE_KIND,
  FANTUAN_ADJUSTMENT_RAW_CODES,
} from './accounting-fantuan-adjustment-detail.contract';

export const ACCOUNTING_FANTUAN_ADJUSTMENT_DETAIL_PARSER_NAME =
  'accounting-fantuan-adjustment-detail-xlsx';
export const ACCOUNTING_FANTUAN_ADJUSTMENT_DETAIL_PARSER_VERSION = '2';

const COLUMN_ALIASES = {
  feeType: ['fee type', '单据类型'],
  settleTime: ['settle time', '单据时间'],
  orderNo: ['order no.', '单据号'],
  orderType: ['order type', '订单类型'],
  totalTransferAmount: ['total transfer amount', '结算金额'],
  storeId: ['store id', '商户编号'],
  remarks: ['remarks', '备注'],
} as const;

type CanonicalColumn = keyof typeof COLUMN_ALIASES;

const REQUIRED_COLUMNS = [
  'feeType',
  'settleTime',
  'orderNo',
  'orderType',
  'totalTransferAmount',
] as const satisfies readonly CanonicalColumn[];

const ORDINARY_FEE_TYPES = new Set(['order', '订单']);
const COMPENSATION_FEE_TYPES = new Set(['compensation']);
const DEDUCTION_FEE_TYPES = new Set(['deduction', '扣款']);
const ADJUSTMENT_ORDER_TYPES = new Set(['adjustment']);

type SheetRow = Record<string, unknown>;

type Period = {
  start: string;
  end: string;
  source: 'FILENAME' | 'SETTLE_TIME_MONTH';
};

const normalizeHeader = (value: string): string =>
  value
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const normalizedRow = (row: SheetRow): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
  );

const hasColumn = (
  headers: ReadonlySet<string>,
  column: CanonicalColumn,
): boolean => {
  const aliases: readonly string[] = COLUMN_ALIASES[column];
  return aliases.some((alias) => headers.has(alias));
};

const columnValue = (
  row: Record<string, unknown>,
  column: CanonicalColumn,
): unknown => {
  for (const alias of COLUMN_ALIASES[column]) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }
  return null;
};

const textValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString();
  return '';
};

const moneyCents = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const cents = Math.round(value * 100);
    return Number.isSafeInteger(cents) ? cents : null;
  }
  const raw = textValue(value);
  if (!raw) return null;
  const parenthesized = /^\(.*\)$/.test(raw);
  const normalized = raw
    .replace(/[,$\s]/g, '')
    .replace(/^\(/, '')
    .replace(/\)$/, '');
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  const cents = Math.round(amount * 100) * (parenthesized ? -1 : 1);
  return Number.isSafeInteger(cents) ? cents : null;
};

const isoDateFromValue = (value: unknown): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = textValue(value);
  const match = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(raw);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

const periodFromFilename = (
  filename: string | null | undefined,
): Period | null => {
  const matches = Array.from(
    (filename ?? '').matchAll(/(?<!\d)20\d{2}-\d{2}-\d{2}(?!\d)/g),
    (match) => match[0],
  );
  if (matches.length < 2 || matches[0] > matches[1]) return null;
  return { start: matches[0], end: matches[1], source: 'FILENAME' };
};

const periodFromSettleDates = (dates: string[]): Period | null => {
  const uniqueMonths = Array.from(
    new Set(dates.map((date) => date.slice(0, 7))),
  );
  if (uniqueMonths.length !== 1) return null;
  const [yearText, monthText] = uniqueMonths[0].split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${yearText}-${monthText}-01`,
    end: `${yearText}-${monthText}-${String(lastDay).padStart(2, '0')}`,
    source: 'SETTLE_TIME_MONTH',
  };
};

const distinctText = (values: string[]): string[] =>
  Array.from(new Set(values.filter(Boolean))).sort();

export function parseFantuanAdjustmentDetailXlsx(input: {
  buffer: Buffer;
  originalFilename?: string | null;
}): ParsedProviderFinancialDocument | null {
  const workbook = XLSX.read(input.buffer, {
    type: 'buffer',
    cellDates: true,
    cellFormula: false,
    cellHTML: false,
    WTF: false,
  });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return null;
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) return null;

  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, {
    defval: null,
    raw: true,
  });
  if (rows.length === 0) return null;

  const normalized = rows.map(normalizedRow);
  const headers = new Set(normalized.flatMap((row) => Object.keys(row)));
  if (REQUIRED_COLUMNS.some((column) => !hasColumn(headers, column))) {
    return null;
  }

  const adjustmentRows = normalized.filter((row) => {
    const feeType = textValue(columnValue(row, 'feeType')).toLowerCase();
    const orderType = textValue(columnValue(row, 'orderType')).toLowerCase();
    if (ADJUSTMENT_ORDER_TYPES.has(orderType)) return true;
    return Boolean(feeType) && !ORDINARY_FEE_TYPES.has(feeType);
  });
  if (adjustmentRows.length === 0) return null;

  const parsedSettleDates = adjustmentRows.map((row) =>
    isoDateFromValue(columnValue(row, 'settleTime')),
  );
  if (parsedSettleDates.some((value) => value === null)) {
    throw new Error(
      'Fantuan adjustment detail contains an invalid Adjustment Settle Time',
    );
  }
  const settleDates = parsedSettleDates.filter(
    (value): value is string => value !== null,
  );
  const period =
    periodFromFilename(input.originalFilename) ??
    periodFromSettleDates(settleDates);
  if (!period) {
    throw new Error(
      'Fantuan adjustment detail must identify one statement period in the ' +
        'filename or Settle Time rows',
    );
  }
  if (settleDates.some((date) => date < period.start || date > period.end)) {
    throw new Error(
      'Fantuan adjustment detail contains an Adjustment outside the statement period',
    );
  }

  const storeIds = distinctText(
    normalized.map((row) => textValue(columnValue(row, 'storeId'))),
  );
  if (storeIds.length > 1) {
    throw new Error(
      'Fantuan adjustment detail contains multiple Store ID values',
    );
  }

  const unknownFeeTypes: string[] = [];
  const lines = adjustmentRows.map((row) => {
    const feeType = textValue(columnValue(row, 'feeType'));
    const normalizedFeeType = feeType.toLowerCase();
    const orderNo = textValue(columnValue(row, 'orderNo'));
    const settleTime = textValue(columnValue(row, 'settleTime'));
    const orderType = textValue(columnValue(row, 'orderType'));
    const remarks = textValue(columnValue(row, 'remarks'));
    const amountCents = moneyCents(columnValue(row, 'totalTransferAmount'));
    if (amountCents === null) {
      throw new Error(
        `Fantuan adjustment row ${orderNo || '(no order number)'} has an ` +
          'invalid Total transfer amount',
      );
    }

    const rawCode = COMPENSATION_FEE_TYPES.has(normalizedFeeType)
      ? FANTUAN_ADJUSTMENT_RAW_CODES.COMPENSATION
      : DEDUCTION_FEE_TYPES.has(normalizedFeeType)
        ? FANTUAN_ADJUSTMENT_RAW_CODES.DEDUCTION
        : FANTUAN_ADJUSTMENT_RAW_CODES.UNKNOWN;
    if (rawCode === FANTUAN_ADJUSTMENT_RAW_CODES.UNKNOWN) {
      unknownFeeTypes.push(feeType || '(blank)');
    }

    return {
      externalRef: orderNo || null,
      rawCode,
      rawName: feeType || 'Adjustment',
      component: AccountingFinancialComponent.ADJUSTMENT,
      postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      taxRole: AccountingFinancialTaxRole.NONE,
      amountCents,
      rawPayload: {
        feeType: feeType || null,
        orderType: orderType || null,
        orderNo: orderNo || null,
        settleTime: settleTime || null,
        remarks: remarks || null,
      },
    };
  });

  const adjustmentNetCents = lines.reduce(
    (sum, line) => sum + line.amountCents,
    0,
  );
  if (!Number.isSafeInteger(adjustmentNetCents)) {
    throw new Error('Fantuan adjustment detail net exceeds safe integer range');
  }

  return {
    provider: AccountingFinancialProvider.FANTUAN,
    documentType: AccountingFinancialDocumentType.OTHER,
    businessIdentityKey: `fantuan:adjustment-detail:${period.start}:${period.end}`,
    providerMerchantRef: storeIds[0] ?? null,
    providerDocumentRef: `adjustment-detail:${period.start}:${period.end}`,
    periodStart: period.start,
    periodEnd: period.end,
    currency: 'CAD',
    rawMetadata: {
      evidenceKind: FANTUAN_ADJUSTMENT_DETAIL_EVIDENCE_KIND,
      supplementaryFor: 'FANTUAN_SETTLEMENT_SUMMARY',
      periodSource: period.source,
      adjustmentRowCount: lines.length,
      adjustmentNetCents,
      unknownFeeTypes: distinctText(unknownFeeTypes),
    },
    lines,
  };
}
