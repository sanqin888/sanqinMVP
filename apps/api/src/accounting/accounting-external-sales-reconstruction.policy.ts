import { createHash } from 'node:crypto';

import {
  AccountingExternalSaleGranularity,
  type CreateAccountingExternalSaleInputV1,
} from './accounting-external-sales.contract';
import {
  ACCOUNTING_EXTERNAL_SALE_LINE_REVENUE_ACCOUNT_STABLE_IDS,
  ACCOUNTING_EXTERNAL_SALE_TAX_ACCOUNT_STABLE_ID,
} from './accounting-external-sales-journal-authority';

const DEFAULT_CLASSIFICATION_STABLE_ID = 'external_supermarket';
const SALES_REVENUE_ACCOUNT_STABLE_ID =
  ACCOUNTING_EXTERNAL_SALE_LINE_REVENUE_ACCOUNT_STABLE_IDS[0];
const QUANTITY_SCALE = 10_000n;
const UUID_V5_DNS_NAMESPACE = Buffer.from(
  '6ba7b8109dad11d180b400c04fd430c8',
  'hex',
);

export class AccountingExternalSaleReconstructionPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountingExternalSaleReconstructionPolicyError';
  }
}

export type AccountingExternalSaleCustomerStatement = {
  counterpartyName: string;
  periodStartOn: string;
  periodEndOn: string;
  sourceRowCount: number;
  sourceQuantity: string;
  lineSubtotalCents: number;
  taxTotalCents: number;
  totalReceivableCents: number;
  paidAmountCents: number;
  balanceDueCents: number;
  saleLines: Array<{
    description: string;
    quantity: string;
    unitPriceCents: number;
    lineAmountCents: number;
  }>;
};

type ParsedSourceRow = {
  date: string;
  item: string;
  priceCents: number;
  quantityScaled: bigint;
  amountCents: number;
  taxCents: number;
  subtotalCents: number;
};

const normalizedCell = (value: string | undefined): string =>
  (value ?? '').trim();

const normalizeHeader = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, '');

const requireNonEmpty = (value: string, field: string): string => {
  const normalized = value.trim();
  if (!normalized) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      `${field} is required`,
    );
  }
  return normalized;
};

function decimalMoneyToCents(raw: string, field: string): number {
  const value = raw.trim().replaceAll(',', '');
  const match = value.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      `${field} must be a decimal money value`,
    );
  }
  const sign = match[1] === '-' ? -1n : 1n;
  const whole = BigInt(match[2]);
  const fraction = match[3] ?? '';
  const firstTwo = (fraction + '00').slice(0, 2);
  const third = Number((fraction + '000').slice(2, 3));
  let cents = whole * 100n + BigInt(firstTwo);
  if (third >= 5) cents += 1n;
  cents *= sign;
  if (
    cents > BigInt(Number.MAX_SAFE_INTEGER) ||
    cents < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      `${field} exceeds safe integer range`,
    );
  }
  return Number(cents);
}

function decimalQuantityToScaled(raw: string, field: string): bigint {
  const value = raw.trim().replaceAll(',', '');
  const match = value.match(/^(-?)(\d+)(?:\.(\d{1,4}))?$/);
  if (!match) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      `${field} must be a decimal quantity with at most four decimal places`,
    );
  }
  const sign = match[1] === '-' ? -1n : 1n;
  const whole = BigInt(match[2]);
  const fraction = (match[3] ?? '').padEnd(4, '0');
  return sign * (whole * QUANTITY_SCALE + BigInt(fraction || '0'));
}

function quantityScaledToString(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const whole = absolute / QUANTITY_SCALE;
  const fraction = (absolute % QUANTITY_SCALE)
    .toString()
    .padStart(4, '0')
    .replace(/0+$/, '');
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

function signedExtendedAmountCents(
  quantityScaled: bigint,
  unitPriceCents: number,
): number {
  const numerator = quantityScaled * BigInt(unitPriceCents);
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const rounded = (absolute + QUANTITY_SCALE / 2n) / QUANTITY_SCALE;
  const signed = sign * rounded;
  if (
    signed > BigInt(Number.MAX_SAFE_INTEGER) ||
    signed < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      'extended amount exceeds safe integer range',
    );
  }
  return Number(signed);
}

function parseDateCell(raw: string, field: string): string {
  const trimmed = raw.trim();
  const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoPrefix)) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      `${field} must contain an ISO date`,
    );
  }
  const date = new Date(`${isoPrefix}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== isoPrefix
  ) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      `${field} contains an invalid date`,
    );
  }
  return isoPrefix;
}

function addSafe(left: number, right: number, field: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      `${field} exceeds safe integer range`,
    );
  }
  return value;
}

function deterministicRequestId(seed: string): string {
  const bytes = createHash('sha1')
    .update(UUID_V5_DNS_NAMESPACE)
    .update(`sanq.ca:${seed}`, 'utf8')
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export function accountingExternalSaleReconstructionPlanHash(input: {
  accountingStartDate: string;
  artifactStableId: string;
  contentHash: string;
  proposedSale: CreateAccountingExternalSaleInputV1;
  source: AccountingExternalSaleCustomerStatement;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: 1,
        accountingStartDate: input.accountingStartDate,
        artifactStableId: input.artifactStableId,
        contentHash: input.contentHash,
        proposedSale: input.proposedSale,
        source: input.source,
      }),
    )
    .digest('hex');
}

export function buildAccountingExternalSaleReconstructionInput(input: {
  artifactStableId: string;
  contentHash: string;
  originalFilename: string;
  classificationStableId?: string | null;
  storeStableId: string;
  statement: AccountingExternalSaleCustomerStatement;
}): CreateAccountingExternalSaleInputV1 {
  const classificationStableId =
    input.classificationStableId?.trim() || DEFAULT_CLASSIFICATION_STABLE_ID;
  if (classificationStableId.length > 200) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      'classificationStableId must not exceed 200 characters',
    );
  }
  const requestId = deterministicRequestId(
    [
      'accounting-external-sale-reconstruction-v1',
      input.artifactStableId,
      input.contentHash,
    ].join(':'),
  );

  return {
    requestId,
    storeStableId: input.storeStableId,
    classificationStableId,
    granularity: AccountingExternalSaleGranularity.PERIOD_SUMMARY,
    occurredOn: input.statement.periodEndOn,
    periodStartOn: input.statement.periodStartOn,
    periodEndOn: input.statement.periodEndOn,
    counterpartyName: input.statement.counterpartyName,
    reference: input.originalFilename.slice(0, 200),
    currency: 'CAD',
    lines: input.statement.saleLines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unit: 'unit',
      unitPriceCents: line.unitPriceCents,
      lineAmountCents: line.lineAmountCents,
      revenueAccountStableId: SALES_REVENUE_ACCOUNT_STABLE_ID,
    })),
    taxes:
      input.statement.taxTotalCents > 0
        ? [
            {
              taxCode: 'HST',
              label: 'HST',
              rateBasisPoints: null,
              amountCents: input.statement.taxTotalCents,
              liabilityAccountStableId:
                ACCOUNTING_EXTERNAL_SALE_TAX_ACCOUNT_STABLE_ID,
            },
          ]
        : [],
    note: `Historical reconstruction from confirmed Accounting evidence ${input.artifactStableId}.`,
  };
}

export function parseAccountingExternalSaleCustomerStatement(
  rows: string[][],
): AccountingExternalSaleCustomerStatement {
  const statementRowIndex = rows.findIndex((row) =>
    row.some(
      (cell) => normalizeHeader(cell) === normalizeHeader('Customer Statement'),
    ),
  );
  if (statementRowIndex < 0) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      'XLSX is not a supported Customer Statement',
    );
  }

  const headerRowIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return (
      normalized.includes('date') &&
      normalized.includes('item') &&
      normalized.includes('price(cad)') &&
      normalized.includes('quantity') &&
      normalized.includes('tax') &&
      normalized.includes('subtotal') &&
      (normalized.includes('amount') || normalized.includes('amout'))
    );
  });
  if (headerRowIndex < 0) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      'Customer Statement table header is missing required columns',
    );
  }

  const header = rows[headerRowIndex].map(normalizeHeader);
  const column = (name: string, fallback?: string): number => {
    const primary = header.indexOf(name);
    if (primary >= 0) return primary;
    if (fallback) {
      const alternate = header.indexOf(fallback);
      if (alternate >= 0) return alternate;
    }
    throw new AccountingExternalSaleReconstructionPolicyError(
      `Customer Statement column is missing: ${name}`,
    );
  };
  const dateColumn = column('date');
  const itemColumn = column('item');
  const priceColumn = column('price(cad)');
  const quantityColumn = column('quantity');
  const amountColumn = column('amount', 'amout');
  const taxColumn = column('tax');
  const subtotalColumn = column('subtotal');

  const counterpartyName = requireNonEmpty(
    normalizedCell(rows[statementRowIndex + 1]?.[dateColumn]),
    'counterpartyName',
  );

  const sourceRows: ParsedSourceRow[] = [];
  let totalQuantityScaled: bigint | null = null;
  let totalAmountCents: number | null = null;
  let totalTaxCents: number | null = null;
  let totalSubtotalCents: number | null = null;
  let paidAmountCents: number | null = null;
  let balanceDueCents: number | null = null;

  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const label = normalizeHeader(normalizedCell(row[dateColumn]));
    if (!label && row.every((cell) => !normalizedCell(cell))) continue;

    if (label === 'total') {
      totalQuantityScaled = decimalQuantityToScaled(
        normalizedCell(row[quantityColumn]),
        'Total Quantity',
      );
      totalAmountCents = decimalMoneyToCents(
        normalizedCell(row[amountColumn]),
        'Total Amount',
      );
      totalTaxCents = decimalMoneyToCents(
        normalizedCell(row[taxColumn]),
        'Total Tax',
      );
      totalSubtotalCents = decimalMoneyToCents(
        normalizedCell(row[subtotalColumn]),
        'Total Subtotal',
      );
      continue;
    }
    if (label === 'paidamount') {
      paidAmountCents = decimalMoneyToCents(
        normalizedCell(row[subtotalColumn]),
        'Paid Amount',
      );
      continue;
    }
    if (label === 'balancedue') {
      balanceDueCents = decimalMoneyToCents(
        normalizedCell(row[subtotalColumn]),
        'Balance Due',
      );
      continue;
    }

    const date = parseDateCell(
      normalizedCell(row[dateColumn]),
      `row ${index + 1} date`,
    );
    const item = requireNonEmpty(
      normalizedCell(row[itemColumn]),
      `row ${index + 1} item`,
    );
    const priceCents = decimalMoneyToCents(
      normalizedCell(row[priceColumn]),
      `row ${index + 1} price`,
    );
    if (priceCents <= 0) {
      throw new AccountingExternalSaleReconstructionPolicyError(
        `row ${index + 1} price must be positive`,
      );
    }
    const quantityScaled = decimalQuantityToScaled(
      normalizedCell(row[quantityColumn]),
      `row ${index + 1} quantity`,
    );
    if (quantityScaled === 0n) {
      throw new AccountingExternalSaleReconstructionPolicyError(
        `row ${index + 1} quantity must be non-zero`,
      );
    }
    const amountCents = decimalMoneyToCents(
      normalizedCell(row[amountColumn]),
      `row ${index + 1} amount`,
    );
    const taxRaw = normalizedCell(row[taxColumn]);
    const taxCents = taxRaw
      ? decimalMoneyToCents(taxRaw, `row ${index + 1} tax`)
      : 0;
    const subtotalCents = decimalMoneyToCents(
      normalizedCell(row[subtotalColumn]),
      `row ${index + 1} subtotal`,
    );
    const expectedAmount = signedExtendedAmountCents(
      quantityScaled,
      priceCents,
    );
    if (amountCents !== expectedAmount) {
      throw new AccountingExternalSaleReconstructionPolicyError(
        `row ${index + 1} amount does not reconcile to quantity x price`,
      );
    }
    if (addSafe(amountCents, taxCents, 'row subtotal') !== subtotalCents) {
      throw new AccountingExternalSaleReconstructionPolicyError(
        `row ${index + 1} subtotal does not reconcile to amount + tax`,
      );
    }
    sourceRows.push({
      date,
      item,
      priceCents,
      quantityScaled,
      amountCents,
      taxCents,
      subtotalCents,
    });
  }

  if (!sourceRows.length) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      'Customer Statement has no sale rows',
    );
  }
  if (
    totalQuantityScaled === null ||
    totalAmountCents === null ||
    totalTaxCents === null ||
    totalSubtotalCents === null ||
    paidAmountCents === null ||
    balanceDueCents === null
  ) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      'Customer Statement control totals are incomplete',
    );
  }
  if (
    totalQuantityScaled <= 0n ||
    totalAmountCents <= 0 ||
    totalTaxCents < 0 ||
    totalSubtotalCents <= 0 ||
    paidAmountCents < 0 ||
    balanceDueCents < 0
  ) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      'Customer Statement control totals contain unsupported negative or non-positive values',
    );
  }

  let observedQuantityScaled = 0n;
  let observedAmountCents = 0;
  let observedTaxCents = 0;
  let observedSubtotalCents = 0;
  for (const row of sourceRows) {
    observedQuantityScaled += row.quantityScaled;
    observedAmountCents = addSafe(
      observedAmountCents,
      row.amountCents,
      'observed amount',
    );
    observedTaxCents = addSafe(observedTaxCents, row.taxCents, 'observed tax');
    observedSubtotalCents = addSafe(
      observedSubtotalCents,
      row.subtotalCents,
      'observed subtotal',
    );
  }
  if (observedQuantityScaled !== totalQuantityScaled) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      'Customer Statement quantity total does not reconcile',
    );
  }
  if (observedAmountCents !== totalAmountCents) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      'Customer Statement amount total does not reconcile',
    );
  }
  if (observedTaxCents !== totalTaxCents) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      'Customer Statement tax total does not reconcile',
    );
  }
  if (observedSubtotalCents !== totalSubtotalCents) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      'Customer Statement subtotal total does not reconcile',
    );
  }
  if (
    addSafe(totalAmountCents, totalTaxCents, 'statement total') !==
    totalSubtotalCents
  ) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      'Customer Statement total does not reconcile to amount + tax',
    );
  }
  if (
    addSafe(paidAmountCents, balanceDueCents, 'statement balance') !==
    totalSubtotalCents
  ) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      'Customer Statement paid amount + balance due does not reconcile',
    );
  }

  const grouped = new Map<
    string,
    {
      description: string;
      unitPriceCents: number;
      quantityScaled: bigint;
      lineAmountCents: number;
    }
  >();
  for (const row of sourceRows) {
    const key = `${row.item}\u0000${row.priceCents}`;
    const current = grouped.get(key) ?? {
      description: row.item,
      unitPriceCents: row.priceCents,
      quantityScaled: 0n,
      lineAmountCents: 0,
    };
    current.quantityScaled += row.quantityScaled;
    current.lineAmountCents = addSafe(
      current.lineAmountCents,
      row.amountCents,
      'grouped line amount',
    );
    grouped.set(key, current);
  }
  const saleLines = [...grouped.values()]
    .sort(
      (left, right) =>
        left.description.localeCompare(right.description) ||
        left.unitPriceCents - right.unitPriceCents,
    )
    .map((group) => {
      if (group.quantityScaled <= 0n || group.lineAmountCents <= 0) {
        throw new AccountingExternalSaleReconstructionPolicyError(
          'Customer Statement contains a non-positive net product/price group that cannot be represented by External Sale v1',
        );
      }
      const expected = signedExtendedAmountCents(
        group.quantityScaled,
        group.unitPriceCents,
      );
      if (expected !== group.lineAmountCents) {
        throw new AccountingExternalSaleReconstructionPolicyError(
          'Customer Statement grouped line amount does not reconcile',
        );
      }
      return {
        description: group.description,
        quantity: quantityScaledToString(group.quantityScaled),
        unitPriceCents: group.unitPriceCents,
        lineAmountCents: group.lineAmountCents,
      };
    });
  const groupedTotal = saleLines.reduce(
    (sum, line) => addSafe(sum, line.lineAmountCents, 'grouped total'),
    0,
  );
  if (groupedTotal !== totalAmountCents) {
    throw new AccountingExternalSaleReconstructionPolicyError(
      'Customer Statement grouped sale lines do not reconcile to Total Amount',
    );
  }

  const dates = sourceRows.map((row) => row.date).sort();
  return {
    counterpartyName,
    periodStartOn: dates[0],
    periodEndOn: dates[dates.length - 1],
    sourceRowCount: sourceRows.length,
    sourceQuantity: quantityScaledToString(totalQuantityScaled),
    lineSubtotalCents: totalAmountCents,
    taxTotalCents: totalTaxCents,
    totalReceivableCents: totalSubtotalCents,
    paidAmountCents,
    balanceDueCents,
    saleLines,
  };
}
