import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';

import { AccountingJournalPolicyError } from './accounting-journal-policy';
import {
  ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_TYPE,
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_VERSION,
  ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_TYPE,
  ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_VERSION,
  AccountingExternalSaleGranularity,
  type AccountingExternalSaleAdjustmentFactV1,
  type AccountingExternalSaleFactV1,
  type AccountingExternalSaleLineFactV1,
  type AccountingExternalSalePostingDraftV1,
  type AccountingExternalSaleSettlementAllocationFactV1,
  type AccountingExternalSaleSettlementComponentFactV1,
  type AccountingExternalSaleSettlementFactV1,
  type AccountingExternalSaleTaxFactV1,
  type AccountingExternalSaleTotalsV1,
  type CreateAccountingExternalSaleInputV1,
  type CreateAccountingExternalSaleSettlementInputV1,
} from './accounting-external-sales.contract';

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUANTITY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;
const QUANTITY_SCALE = 10_000n;
const MAX_TEXT_LENGTH = 500;

const requireValue = (
  raw: unknown,
  field: string,
  maxLength = MAX_TEXT_LENGTH,
): string => {
  if (typeof raw !== 'string') {
    throw new AccountingJournalPolicyError(`${field} must be a string`);
  }
  const value = raw.trim();
  if (!value) throw new AccountingJournalPolicyError(`${field} is required`);
  if (value.length > maxLength) {
    throw new AccountingJournalPolicyError(
      `${field} must not exceed ${maxLength} characters`,
    );
  }
  return value;
};

const optionalValue = (
  raw: unknown,
  field: string,
  maxLength = MAX_TEXT_LENGTH,
): string | null => {
  if (raw == null) return null;
  if (typeof raw !== 'string') {
    throw new AccountingJournalPolicyError(`${field} must be a string`);
  }
  const value = raw.trim();
  if (!value) return null;
  if (value.length > maxLength) {
    throw new AccountingJournalPolicyError(
      `${field} must not exceed ${maxLength} characters`,
    );
  }
  return value;
};

const requireRequestId = (raw: unknown): string => {
  const requestId = requireValue(raw, 'requestId', 64);
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    throw new AccountingJournalPolicyError('requestId must be a UUID');
  }
  return requestId.toLowerCase();
};

const stableSuffix = (requestId: string): string =>
  requestId.replaceAll('-', '');

const requireCad = (raw?: string): 'CAD' => {
  const currency = raw?.trim().toUpperCase() || 'CAD';
  if (currency !== 'CAD') {
    throw new AccountingJournalPolicyError(
      'External Sales v1 currently requires CAD currency',
    );
  }
  return 'CAD';
};

const requireDateOnly = (raw: unknown, field: string): string => {
  const value = requireValue(raw, field, 10);
  const parsed = DateTime.fromISO(value, { zone: 'UTC' });
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !parsed.isValid ||
    parsed.toISODate() !== value
  ) {
    throw new AccountingJournalPolicyError(
      `${field} must be a valid ISO date-only value`,
    );
  }
  return value;
};

const requireNonNegativeMoney = (raw: unknown, field: string): number => {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0) {
    throw new AccountingJournalPolicyError(
      `${field} must be a non-negative safe integer`,
    );
  }
  return raw;
};

const requirePositiveMoney = (raw: unknown, field: string): number => {
  const value = requireNonNegativeMoney(raw, field);
  if (value === 0) {
    throw new AccountingJournalPolicyError(
      `${field} must be a positive safe integer`,
    );
  }
  return value;
};

const requireSignedMoney = (raw: unknown, field: string): number => {
  if (
    typeof raw !== 'number' ||
    !Number.isSafeInteger(raw) ||
    raw === 0
  ) {
    throw new AccountingJournalPolicyError(
      `${field} must be a non-zero safe integer`,
    );
  }
  return raw;
};

const safeAdd = (left: number, right: number, field: string): number => {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new AccountingJournalPolicyError(
      `${field} exceeds safe integer range`,
    );
  }
  return result;
};

const normalizeQuantity = (raw: unknown, field: string): string => {
  const value = requireValue(raw, field, 32);
  if (!QUANTITY_PATTERN.test(value)) {
    throw new AccountingJournalPolicyError(
      `${field} must be a positive decimal with at most four decimal places`,
    );
  }
  const [whole, fraction = ''] = value.split('.');
  const scaled =
    BigInt(whole) * QUANTITY_SCALE +
    BigInt((fraction + '0000').slice(0, 4));
  if (scaled <= 0n) {
    throw new AccountingJournalPolicyError(
      `${field} must be greater than zero`,
    );
  }

  const normalizedFraction = fraction.replace(/0+$/, '');
  return normalizedFraction ? `${whole}.${normalizedFraction}` : whole;
};

const quantityScaled = (quantity: string): bigint => {
  const [whole, fraction = ''] = quantity.split('.');
  return (
    BigInt(whole) * QUANTITY_SCALE +
    BigInt((fraction + '0000').slice(0, 4))
  );
};

export const externalSaleExpectedLineAmountCents = (
  quantity: string,
  unitPriceCents: number,
): number => {
  const normalizedQuantity = normalizeQuantity(quantity, 'quantity');
  const price = requireNonNegativeMoney(unitPriceCents, 'unitPriceCents');
  const numerator = quantityScaled(normalizedQuantity) * BigInt(price);
  const rounded = (numerator + QUANTITY_SCALE / 2n) / QUANTITY_SCALE;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new AccountingJournalPolicyError(
      'line amount exceeds safe integer range',
    );
  }
  return Number(rounded);
};

const normalizeGranularity = (
  raw: CreateAccountingExternalSaleInputV1['granularity'],
): AccountingExternalSaleFactV1['granularity'] => {
  if (
    raw !== AccountingExternalSaleGranularity.TRANSACTION &&
    raw !== AccountingExternalSaleGranularity.DAILY_SUMMARY &&
    raw !== AccountingExternalSaleGranularity.PERIOD_SUMMARY
  ) {
    throw new AccountingJournalPolicyError(
      'Unsupported External Sale granularity',
    );
  }
  return raw;
};

const normalizePeriod = (
  granularity: AccountingExternalSaleFactV1['granularity'],
  startRaw: string | null | undefined,
  endRaw: string | null | undefined,
): { periodStartOn: string | null; periodEndOn: string | null } => {
  if (granularity === AccountingExternalSaleGranularity.TRANSACTION) {
    if (startRaw != null || endRaw != null) {
      throw new AccountingJournalPolicyError(
        'TRANSACTION External Sale must not define a summary period',
      );
    }
    return { periodStartOn: null, periodEndOn: null };
  }

  if (startRaw == null || endRaw == null) {
    throw new AccountingJournalPolicyError(
      'summary External Sale requires periodStartOn and periodEndOn',
    );
  }
  const periodStartOn = requireDateOnly(startRaw, 'periodStartOn');
  const periodEndOn = requireDateOnly(endRaw, 'periodEndOn');
  if (periodEndOn < periodStartOn) {
    throw new AccountingJournalPolicyError(
      'periodEndOn must be on or after periodStartOn',
    );
  }
  if (
    granularity === AccountingExternalSaleGranularity.DAILY_SUMMARY &&
    periodStartOn !== periodEndOn
  ) {
    throw new AccountingJournalPolicyError(
      'DAILY_SUMMARY requires periodStartOn and periodEndOn to be the same day',
    );
  }
  return { periodStartOn, periodEndOn };
};

const normalizeSaleLines = (
  parentStableId: string,
  lines: CreateAccountingExternalSaleInputV1['lines'],
): AccountingExternalSaleLineFactV1[] => {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new AccountingJournalPolicyError(
      'External Sale requires at least one sale line',
    );
  }

  return lines.map((line, index) => {
    const quantity = normalizeQuantity(
      line.quantity,
      `lines[${index}].quantity`,
    );
    const unitPriceCents = requireNonNegativeMoney(
      line.unitPriceCents,
      `lines[${index}].unitPriceCents`,
    );
    const lineAmountCents = requireNonNegativeMoney(
      line.lineAmountCents,
      `lines[${index}].lineAmountCents`,
    );
    const expected = externalSaleExpectedLineAmountCents(
      quantity,
      unitPriceCents,
    );
    if (lineAmountCents !== expected) {
      throw new AccountingJournalPolicyError(
        `lines[${index}].lineAmountCents must equal quantity x unitPriceCents after half-up cent rounding (${expected})`,
      );
    }

    return {
      lineStableId: `${parentStableId}_line_${index + 1}`,
      description: requireValue(
        line.description,
        `lines[${index}].description`,
        200,
      ),
      productReference: optionalValue(
        line.productReference,
        `lines[${index}].productReference`,
        200,
      ),
      quantity,
      unit: requireValue(line.unit, `lines[${index}].unit`, 50),
      unitPriceCents,
      lineAmountCents,
      revenueAccountStableId: requireValue(
        line.revenueAccountStableId,
        `lines[${index}].revenueAccountStableId`,
        200,
      ),
      sortOrder: index,
    };
  });
};

const normalizeAdjustments = (
  parentStableId: string,
  adjustments: CreateAccountingExternalSaleInputV1['adjustments'],
): AccountingExternalSaleAdjustmentFactV1[] =>
  (adjustments ?? []).map((adjustment, index) => ({
    adjustmentStableId: `${parentStableId}_adjustment_${index + 1}`,
    label: requireValue(
      adjustment.label,
      `adjustments[${index}].label`,
      200,
    ),
    amountCents: requireSignedMoney(
      adjustment.amountCents,
      `adjustments[${index}].amountCents`,
    ),
    revenueAccountStableId: requireValue(
      adjustment.revenueAccountStableId,
      `adjustments[${index}].revenueAccountStableId`,
      200,
    ),
    sortOrder: index,
  }));

const normalizeTaxes = (
  parentStableId: string,
  taxes: CreateAccountingExternalSaleInputV1['taxes'],
): AccountingExternalSaleTaxFactV1[] =>
  (taxes ?? []).map((tax, index) => {
    const rateBasisPoints =
      tax.rateBasisPoints == null
        ? null
        : requireNonNegativeMoney(
            tax.rateBasisPoints,
            `taxes[${index}].rateBasisPoints`,
          );
    return {
      taxStableId: `${parentStableId}_tax_${index + 1}`,
      taxCode: requireValue(tax.taxCode, `taxes[${index}].taxCode`, 50),
      label: requireValue(tax.label, `taxes[${index}].label`, 200),
      rateBasisPoints,
      amountCents: requireNonNegativeMoney(
        tax.amountCents,
        `taxes[${index}].amountCents`,
      ),
      liabilityAccountStableId: requireValue(
        tax.liabilityAccountStableId,
        `taxes[${index}].liabilityAccountStableId`,
        200,
      ),
      sortOrder: index,
    };
  });

export const summarizeAccountingExternalSale = (
  fact: AccountingExternalSaleFactV1,
): AccountingExternalSaleTotalsV1 => {
  const lineSubtotalCents = fact.lines.reduce(
    (sum, line) => safeAdd(sum, line.lineAmountCents, 'lineSubtotalCents'),
    0,
  );
  const adjustmentTotalCents = fact.adjustments.reduce(
    (sum, adjustment) =>
      safeAdd(sum, adjustment.amountCents, 'adjustmentTotalCents'),
    0,
  );
  const taxTotalCents = fact.taxes.reduce(
    (sum, tax) => safeAdd(sum, tax.amountCents, 'taxTotalCents'),
    0,
  );
  const commercialNetCents = safeAdd(
    lineSubtotalCents,
    adjustmentTotalCents,
    'commercialNetCents',
  );
  if (commercialNetCents <= 0) {
    throw new AccountingJournalPolicyError(
      'External Sale must retain positive commercial value after adjustments',
    );
  }
  const totalReceivableCents = safeAdd(
    commercialNetCents,
    taxTotalCents,
    'totalReceivableCents',
  );
  if (totalReceivableCents <= 0) {
    throw new AccountingJournalPolicyError(
      'External Sale must create a positive receivable',
    );
  }
  return {
    lineSubtotalCents,
    adjustmentTotalCents,
    taxTotalCents,
    totalReceivableCents,
  };
};

export const normalizeAccountingExternalSale = (
  input: CreateAccountingExternalSaleInputV1,
): AccountingExternalSaleFactV1 => {
  const requestId = requireRequestId(input.requestId);
  const externalSaleStableId = `extsale_${stableSuffix(requestId)}`;
  const granularity = normalizeGranularity(input.granularity);
  const fact: AccountingExternalSaleFactV1 = {
    version: 1,
    externalSaleStableId,
    storeStableId: requireValue(input.storeStableId, 'storeStableId', 200),
    classificationStableId: requireValue(
      input.classificationStableId,
      'classificationStableId',
      200,
    ),
    granularity,
    occurredOn: requireDateOnly(input.occurredOn, 'occurredOn'),
    ...normalizePeriod(granularity, input.periodStartOn, input.periodEndOn),
    counterpartyName: requireValue(
      input.counterpartyName,
      'counterpartyName',
      200,
    ),
    reference: optionalValue(input.reference, 'reference', 200),
    currency: requireCad(input.currency),
    replacementForExternalSaleStableId: optionalValue(
      input.replacementForExternalSaleStableId,
      'replacementForExternalSaleStableId',
      200,
    ),
    lines: normalizeSaleLines(externalSaleStableId, input.lines),
    adjustments: normalizeAdjustments(
      externalSaleStableId,
      input.adjustments,
    ),
    taxes: normalizeTaxes(externalSaleStableId, input.taxes),
    note: optionalValue(input.note, 'note'),
  };
  summarizeAccountingExternalSale(fact);
  return fact;
};

const normalizeAllocations = (
  parentStableId: string,
  allocations: CreateAccountingExternalSaleSettlementInputV1['allocations'],
): AccountingExternalSaleSettlementAllocationFactV1[] => {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw new AccountingJournalPolicyError(
      'External Sale settlement requires at least one receivable allocation',
    );
  }
  const seen = new Set<string>();
  return allocations.map((allocation, index) => {
    const externalSaleStableId = requireValue(
      allocation.externalSaleStableId,
      `allocations[${index}].externalSaleStableId`,
      200,
    );
    if (seen.has(externalSaleStableId)) {
      throw new AccountingJournalPolicyError(
        'External Sale settlement cannot allocate the same sale more than once',
      );
    }
    seen.add(externalSaleStableId);
    return {
      allocationStableId: `${parentStableId}_allocation_${index + 1}`,
      externalSaleStableId,
      amountCents: requirePositiveMoney(
        allocation.amountCents,
        `allocations[${index}].amountCents`,
      ),
      sortOrder: index,
    };
  });
};

const normalizeComponents = (
  parentStableId: string,
  components: CreateAccountingExternalSaleSettlementInputV1['components'],
): AccountingExternalSaleSettlementComponentFactV1[] => {
  if (!Array.isArray(components) || components.length === 0) {
    throw new AccountingJournalPolicyError(
      'External Sale settlement requires at least one settlement component',
    );
  }
  return components.map((component, index) => {
    const accountStableId = requireValue(
      component.accountStableId,
      `components[${index}].accountStableId`,
      200,
    );
    if (accountStableId === ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID) {
      throw new AccountingJournalPolicyError(
        'settlement component cannot post back into Accounts Receivable',
      );
    }
    return {
      componentStableId: `${parentStableId}_component_${index + 1}`,
      accountStableId,
      amountCents: requirePositiveMoney(
        component.amountCents,
        `components[${index}].amountCents`,
      ),
      label: requireValue(
        component.label,
        `components[${index}].label`,
        200,
      ),
      sortOrder: index,
    };
  });
};

const sumSettlementAllocations = (
  allocations: AccountingExternalSaleSettlementAllocationFactV1[],
): number =>
  allocations.reduce(
    (sum, allocation) =>
      safeAdd(sum, allocation.amountCents, 'settlementAllocationTotalCents'),
    0,
  );

const sumSettlementComponents = (
  components: AccountingExternalSaleSettlementComponentFactV1[],
): number =>
  components.reduce(
    (sum, component) =>
      safeAdd(sum, component.amountCents, 'settlementComponentTotalCents'),
    0,
  );

export const normalizeAccountingExternalSaleSettlement = (
  input: CreateAccountingExternalSaleSettlementInputV1,
): AccountingExternalSaleSettlementFactV1 => {
  const requestId = requireRequestId(input.requestId);
  const settlementStableId = `extsettlement_${stableSuffix(requestId)}`;
  const allocations = normalizeAllocations(
    settlementStableId,
    input.allocations,
  );
  const components = normalizeComponents(
    settlementStableId,
    input.components,
  );
  const allocationTotal = sumSettlementAllocations(allocations);
  const componentTotal = sumSettlementComponents(components);
  if (allocationTotal !== componentTotal) {
    throw new AccountingJournalPolicyError(
      `settlement components (${componentTotal}) must equal receivable allocations (${allocationTotal})`,
    );
  }

  return {
    version: 1,
    settlementStableId,
    storeStableId: requireValue(input.storeStableId, 'storeStableId', 200),
    settlementOn: requireDateOnly(input.settlementOn, 'settlementOn'),
    counterpartyName: requireValue(
      input.counterpartyName,
      'counterpartyName',
      200,
    ),
    reference: optionalValue(input.reference, 'reference', 200),
    currency: requireCad(input.currency),
    replacementForSettlementStableId: optionalValue(
      input.replacementForSettlementStableId,
      'replacementForSettlementStableId',
      200,
    ),
    allocations,
    components,
    note: optionalValue(input.note, 'note'),
  };
};

export const hashAccountingExternalSaleFact = (
  fact: AccountingExternalSaleFactV1,
): string =>
  createHash('sha256').update(JSON.stringify(fact)).digest('hex');

export const hashAccountingExternalSaleSettlementFact = (
  fact: AccountingExternalSaleSettlementFactV1,
): string =>
  createHash('sha256').update(JSON.stringify(fact)).digest('hex');

export const buildAccountingExternalSalePostingDraft = (
  fact: AccountingExternalSaleFactV1,
): AccountingExternalSalePostingDraftV1 => {
  const totals = summarizeAccountingExternalSale(fact);
  const lines: AccountingExternalSalePostingDraftV1['lines'] = [
    {
      accountStableId: ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
      debitCents: totals.totalReceivableCents,
      creditCents: 0,
      memo: `Receivable for ${fact.counterpartyName}`,
    },
  ];

  for (const line of fact.lines) {
    if (line.lineAmountCents === 0) continue;
    lines.push({
      accountStableId: line.revenueAccountStableId,
      debitCents: 0,
      creditCents: line.lineAmountCents,
      memo: line.description,
    });
  }
  for (const adjustment of fact.adjustments) {
    lines.push({
      accountStableId: adjustment.revenueAccountStableId,
      debitCents: adjustment.amountCents < 0 ? -adjustment.amountCents : 0,
      creditCents: adjustment.amountCents > 0 ? adjustment.amountCents : 0,
      memo: adjustment.label,
    });
  }
  for (const tax of fact.taxes) {
    if (tax.amountCents === 0) continue;
    lines.push({
      accountStableId: tax.liabilityAccountStableId,
      debitCents: 0,
      creditCents: tax.amountCents,
      memo: tax.label,
    });
  }

  return {
    kind: 'STANDARD',
    source: 'EXTERNAL_SALE',
    sourceFactType: ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_TYPE,
    sourceFactStableId: fact.externalSaleStableId,
    sourceFactVersion: ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_VERSION,
    storeStableId: fact.storeStableId,
    occurredOn: fact.occurredOn,
    currency: 'CAD',
    memo: `External Sale ${fact.externalSaleStableId}: ${fact.counterpartyName}`,
    lines,
  };
};

export const buildAccountingExternalSaleSettlementPostingDraft = (
  fact: AccountingExternalSaleSettlementFactV1,
): AccountingExternalSalePostingDraftV1 => {
  const amountCents = sumSettlementAllocations(fact.allocations);
  const lines: AccountingExternalSalePostingDraftV1['lines'] =
    fact.components.map((component) => ({
      accountStableId: component.accountStableId,
      debitCents: component.amountCents,
      creditCents: 0,
      memo: component.label,
    }));
  lines.push({
    accountStableId: ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
    debitCents: 0,
    creditCents: amountCents,
    memo: `Receivable settlement for ${fact.counterpartyName}`,
  });

  return {
    kind: 'STANDARD',
    source: 'EXTERNAL_SALE',
    sourceFactType: ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_TYPE,
    sourceFactStableId: fact.settlementStableId,
    sourceFactVersion: ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_VERSION,
    storeStableId: fact.storeStableId,
    occurredOn: fact.settlementOn,
    currency: 'CAD',
    memo: `External Sale settlement ${fact.settlementStableId}: ${fact.counterpartyName}`,
    lines,
  };
};
