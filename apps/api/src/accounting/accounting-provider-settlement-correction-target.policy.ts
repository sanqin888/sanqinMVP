import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole,
} from './accounting-contracts';
import { hashAccountingJson } from './accounting-inbox-core.policy';
import type { ProviderSalesAuthority } from './accounting-provider-settlement.policy';

export const ACCOUNTING_PROVIDER_SETTLEMENT_CORRECTION_TARGET_SCHEMA =
  'accounting.provider-settlement-correction-target.v1';

export class AccountingProviderSettlementCorrectionTargetPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountingProviderSettlementCorrectionTargetPolicyError';
  }
}

export type ProviderSettlementCorrectionTargetLineV1 = {
  sourceDocumentStableId: string;
  lineStableId: string;
  lineNo: number;
  rawCode: string | null;
  rawName: string | null;
  component: AccountingFinancialComponent;
  postingTreatment: AccountingFinancialPostingTreatment;
  taxRole: AccountingFinancialTaxRole;
  amountCents: number;
  occurredAt: string | null;
};

export type ProviderSettlementCorrectionTargetV1 = {
  version: 1;
  document: {
    documentStableId: string;
    documentRevision: number;
    provider: AccountingFinancialProvider;
    documentType: AccountingFinancialDocumentType;
    businessIdentityKey: string;
    providerDocumentRef: string | null;
    storeStableId: string;
    periodStart: string;
    periodEnd: string;
    currency: string;
    sourcePostingAuthorityHash: string;
  };
  salesAuthority: ProviderSalesAuthority;
  basedOnAuthorityHash: string;
  supplementaryEvidenceDocumentStableIds: string[];
  historicalReversalOriginalJournalEntryStableIds: string[];
  lines: ProviderSettlementCorrectionTargetLineV1[];
};

export type ProviderSettlementCorrectionTargetInputV1 = {
  version: 1;
  expectedBaseAuthorityHash: string;
  lines: Array<{
    lineStableId: string;
    rawCode: string | null;
    rawName: string | null;
    component: AccountingFinancialComponent;
    postingTreatment: AccountingFinancialPostingTreatment;
    taxRole: AccountingFinancialTaxRole;
    amountCents: number;
  }>;
};

const requireValue = (raw: unknown, field: string, maxLength = 500): string => {
  if (typeof raw !== 'string') {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      field + ' must be a string',
    );
  }
  const value = raw.trim();
  if (!value) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      field + ' is required',
    );
  }
  if (value.length > maxLength) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      field + ' must not exceed ' + maxLength + ' characters',
    );
  }
  return value;
};

const optionalText = (
  raw: unknown,
  field: string,
  maxLength = 500,
): string | null => {
  if (raw == null) return null;
  if (typeof raw !== 'string') {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      field + ' must be a string or null',
    );
  }
  const value = raw.trim();
  if (value.length > maxLength) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      field + ' must not exceed ' + maxLength + ' characters',
    );
  }
  return value || null;
};

const requirePositiveInteger = (raw: unknown, field: string): number => {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 1) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      field + ' must be a positive integer',
    );
  }
  return raw;
};

const requireSafeInteger = (raw: unknown, field: string): number => {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw)) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      field + ' must be a safe integer',
    );
  }
  return raw;
};

const requireSha256 = (raw: unknown, field: string): string => {
  const value = requireValue(raw, field, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      field + ' must be a lowercase SHA-256 hex digest',
    );
  }
  return value;
};

const enumValue = <T extends string>(
  values: readonly T[],
  raw: unknown,
  field: string,
): T => {
  if (typeof raw !== 'string' || !values.includes(raw as T)) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      field + ' is invalid',
    );
  }
  return raw as T;
};

const componentValues = Object.values(AccountingFinancialComponent);
const postingTreatmentValues = Object.values(
  AccountingFinancialPostingTreatment,
);
const taxRoleValues = Object.values(AccountingFinancialTaxRole);
const providerValues = Object.values(AccountingFinancialProvider);
const documentTypeValues = Object.values(AccountingFinancialDocumentType);
const salesAuthorityValues: ProviderSalesAuthority[] = [
  'STATEMENT_AUTHORITATIVE',
  'ORDER_AUTHORITATIVE',
  'SPLIT_PERIOD_BLOCKED',
  'RECONCILIATION_ONLY',
];

const normalizeOccurredAt = (raw: unknown, field: string): string | null => {
  if (raw == null) return null;
  const value = requireValue(raw, field, 100);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      field + ' must be a valid date',
    );
  }
  return parsed.toISOString();
};

const normalizeLine = (
  line: ProviderSettlementCorrectionTargetLineV1,
  index: number,
): ProviderSettlementCorrectionTargetLineV1 => ({
  sourceDocumentStableId: requireValue(
    line.sourceDocumentStableId,
    'lines[' + index + '].sourceDocumentStableId',
    250,
  ),
  lineStableId: requireValue(
    line.lineStableId,
    'lines[' + index + '].lineStableId',
    250,
  ),
  lineNo: requirePositiveInteger(line.lineNo, 'lines[' + index + '].lineNo'),
  rawCode: optionalText(line.rawCode, 'lines[' + index + '].rawCode'),
  rawName: optionalText(line.rawName, 'lines[' + index + '].rawName'),
  component: enumValue(
    componentValues,
    line.component,
    'lines[' + index + '].component',
  ),
  postingTreatment: enumValue(
    postingTreatmentValues,
    line.postingTreatment,
    'lines[' + index + '].postingTreatment',
  ),
  taxRole: enumValue(
    taxRoleValues,
    line.taxRole,
    'lines[' + index + '].taxRole',
  ),
  amountCents: requireSafeInteger(
    line.amountCents,
    'lines[' + index + '].amountCents',
  ),
  occurredAt: normalizeOccurredAt(
    line.occurredAt,
    'lines[' + index + '].occurredAt',
  ),
});

const normalizeStringSet = (values: string[], field: string): string[] => {
  if (!Array.isArray(values)) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      field + ' must be an array',
    );
  }
  const normalized = values.map((value, index) =>
    requireValue(value, field + '[' + index + ']', 250),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      field + ' contains duplicates',
    );
  }
  return normalized.sort();
};

export const normalizeProviderSettlementCorrectionTarget = (
  raw: ProviderSettlementCorrectionTargetV1,
): ProviderSettlementCorrectionTargetV1 => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      'provider settlement correction target must be an object',
    );
  }
  if (raw.version !== 1) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      'provider settlement correction target version must be 1',
    );
  }
  if (
    !raw.document ||
    typeof raw.document !== 'object' ||
    Array.isArray(raw.document)
  ) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      'provider settlement correction target document must be an object',
    );
  }
  if (!Array.isArray(raw.lines)) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      'provider settlement correction target lines must be an array',
    );
  }
  const lines = raw.lines
    .map((line, index) => {
      if (!line || typeof line !== 'object' || Array.isArray(line)) {
        throw new AccountingProviderSettlementCorrectionTargetPolicyError(
          'lines[' + index + '] must be an object',
        );
      }
      return normalizeLine(line, index);
    })
    .sort(
      (left, right) =>
        left.sourceDocumentStableId.localeCompare(
          right.sourceDocumentStableId,
        ) ||
        left.lineNo - right.lineNo ||
        left.lineStableId.localeCompare(right.lineStableId),
    );
  const lineStableIds = new Set(lines.map((line) => line.lineStableId));
  if (lineStableIds.size !== lines.length) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      'provider settlement correction target contains duplicate lineStableId values',
    );
  }
  const sourceLineKeys = new Set(
    lines.map(
      (line) => line.sourceDocumentStableId + '|' + String(line.lineNo),
    ),
  );
  if (sourceLineKeys.size !== lines.length) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      'provider settlement correction target contains duplicate source line numbers',
    );
  }

  return {
    version: 1,
    document: {
      documentStableId: requireValue(
        raw.document.documentStableId,
        'document.documentStableId',
        250,
      ),
      documentRevision: requirePositiveInteger(
        raw.document.documentRevision,
        'document.documentRevision',
      ),
      provider: enumValue(
        providerValues,
        raw.document.provider,
        'document.provider',
      ),
      documentType: enumValue(
        documentTypeValues,
        raw.document.documentType,
        'document.documentType',
      ),
      businessIdentityKey: requireValue(
        raw.document.businessIdentityKey,
        'document.businessIdentityKey',
      ),
      providerDocumentRef: optionalText(
        raw.document.providerDocumentRef,
        'document.providerDocumentRef',
      ),
      storeStableId: requireValue(
        raw.document.storeStableId,
        'document.storeStableId',
        250,
      ),
      periodStart: requireValue(
        raw.document.periodStart,
        'document.periodStart',
        10,
      ),
      periodEnd: requireValue(raw.document.periodEnd, 'document.periodEnd', 10),
      currency: requireValue(
        raw.document.currency,
        'document.currency',
        3,
      ).toUpperCase(),
      sourcePostingAuthorityHash: requireSha256(
        raw.document.sourcePostingAuthorityHash,
        'document.sourcePostingAuthorityHash',
      ),
    },
    salesAuthority: enumValue(
      salesAuthorityValues,
      raw.salesAuthority,
      'salesAuthority',
    ),
    basedOnAuthorityHash: requireSha256(
      raw.basedOnAuthorityHash,
      'basedOnAuthorityHash',
    ),
    supplementaryEvidenceDocumentStableIds: normalizeStringSet(
      raw.supplementaryEvidenceDocumentStableIds,
      'supplementaryEvidenceDocumentStableIds',
    ),
    historicalReversalOriginalJournalEntryStableIds: normalizeStringSet(
      raw.historicalReversalOriginalJournalEntryStableIds,
      'historicalReversalOriginalJournalEntryStableIds',
    ),
    lines,
  };
};

export const hashProviderSettlementCorrectionTarget = (
  target: ProviderSettlementCorrectionTargetV1,
): string => {
  const normalized = normalizeProviderSettlementCorrectionTarget(target);
  const { basedOnAuthorityHash: lineage, ...authority } = normalized;
  void lineage;
  return hashAccountingJson(authority);
};

const parseInput = (
  raw: unknown,
): ProviderSettlementCorrectionTargetInputV1 => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      'provider settlement correction target must be an object',
    );
  }
  const record = raw as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.lines)) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      'provider settlement correction target must use version 1 with lines',
    );
  }
  return {
    version: 1,
    expectedBaseAuthorityHash: requireSha256(
      record.expectedBaseAuthorityHash,
      'expectedBaseAuthorityHash',
    ),
    lines: record.lines as ProviderSettlementCorrectionTargetInputV1['lines'],
  };
};

export const applyProviderSettlementCorrectionTargetInput = (params: {
  base: ProviderSettlementCorrectionTargetV1;
  input: unknown;
}): ProviderSettlementCorrectionTargetV1 => {
  const base = normalizeProviderSettlementCorrectionTarget(params.base);
  const input = parseInput(params.input);
  const currentBaseAuthorityHash = hashProviderSettlementCorrectionTarget(base);
  if (input.expectedBaseAuthorityHash !== currentBaseAuthorityHash) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      'Provider correction target was edited from a stale current-effective authority',
    );
  }
  if (input.lines.length !== base.lines.length) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      'normal Provider DELTA correction cannot add or remove effective lines',
    );
  }

  const baseByLineStableId = new Map(
    base.lines.map((line) => [line.lineStableId, line] as const),
  );
  const seen = new Set<string>();
  const lines = input.lines.map((rawLine, index) => {
    if (!rawLine || typeof rawLine !== 'object') {
      throw new AccountingProviderSettlementCorrectionTargetPolicyError(
        'lines[' + index + '] must be an object',
      );
    }
    const lineStableId = requireValue(
      rawLine.lineStableId,
      'lines[' + index + '].lineStableId',
      250,
    );
    if (seen.has(lineStableId)) {
      throw new AccountingProviderSettlementCorrectionTargetPolicyError(
        'duplicate correction target line: ' + lineStableId,
      );
    }
    seen.add(lineStableId);
    const current = baseByLineStableId.get(lineStableId);
    if (!current) {
      throw new AccountingProviderSettlementCorrectionTargetPolicyError(
        'normal Provider DELTA correction references an unknown effective line: ' +
          lineStableId,
      );
    }

    const next: ProviderSettlementCorrectionTargetLineV1 = {
      ...current,
      rawCode: optionalText(rawLine.rawCode, 'lines[' + index + '].rawCode'),
      rawName: optionalText(rawLine.rawName, 'lines[' + index + '].rawName'),
      component: enumValue(
        componentValues,
        rawLine.component,
        'lines[' + index + '].component',
      ),
      postingTreatment: enumValue(
        postingTreatmentValues,
        rawLine.postingTreatment,
        'lines[' + index + '].postingTreatment',
      ),
      taxRole: enumValue(
        taxRoleValues,
        rawLine.taxRole,
        'lines[' + index + '].taxRole',
      ),
      amountCents: requireSafeInteger(
        rawLine.amountCents,
        'lines[' + index + '].amountCents',
      ),
    };

    if (
      (current.component === AccountingFinancialComponent.CONTROL_TOTAL ||
        current.postingTreatment ===
          AccountingFinancialPostingTreatment.CONTROL_TOTAL ||
        next.component === AccountingFinancialComponent.CONTROL_TOTAL) &&
      next.postingTreatment === AccountingFinancialPostingTreatment.POSTABLE
    ) {
      throw new AccountingProviderSettlementCorrectionTargetPolicyError(
        'CONTROL_TOTAL line cannot become POSTABLE: ' + lineStableId,
      );
    }
    return next;
  });

  if (seen.size !== base.lines.length) {
    throw new AccountingProviderSettlementCorrectionTargetPolicyError(
      'normal Provider DELTA correction must preserve every effective line identity',
    );
  }

  return normalizeProviderSettlementCorrectionTarget({
    ...base,
    basedOnAuthorityHash: currentBaseAuthorityHash,
    lines,
  });
};
