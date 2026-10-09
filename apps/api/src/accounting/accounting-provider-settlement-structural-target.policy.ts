import {
  AccountingFinancialComponent,
  AccountingFinancialPostingTreatment,
  AccountingFinancialTaxRole,
} from './accounting-contracts';
import { hashAccountingJson } from './accounting-inbox-core.policy';
import {
  normalizeProviderSettlementCorrectionTarget,
  type ProviderSettlementCorrectionTargetV1,
} from './accounting-provider-settlement-correction-target.policy';

export const ACCOUNTING_PROVIDER_SETTLEMENT_STRUCTURAL_TARGET_SCHEMA =
  'accounting.provider-settlement-correction-target.v2';

export class AccountingProviderSettlementStructuralTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountingProviderSettlementStructuralTargetError';
  }
}

type LineSemantics = {
  rawCode: string | null;
  rawName: string | null;
  component: AccountingFinancialComponent;
  postingTreatment: AccountingFinancialPostingTreatment;
  taxRole: AccountingFinancialTaxRole;
  amountCents: number;
  occurredAt: string | null;
};

export type ProviderStructuralSourceLineV2 = LineSemantics & {
  origin: 'SOURCE_LINE';
  effectiveLineStableId: string;
  effectiveLineNo: number;
  evidenceDocumentStableId: string;
  sourceLine: {
    documentStableId: string;
    lineStableId: string;
    lineNo: number;
  };
};

export type ProviderStructuralAddedLineV2 = LineSemantics & {
  origin: 'CORRECTION_ADDED';
  effectiveLineStableId: string;
  effectiveLineNo: number;
  evidenceDocumentStableId: string;
  sourceLine: null;
};

export type ProviderStructuralLineV2 =
  | ProviderStructuralSourceLineV2
  | ProviderStructuralAddedLineV2;

export type ProviderSettlementStructuralTargetV2 = Omit<
  ProviderSettlementCorrectionTargetV1,
  'version' | 'lines'
> & {
  version: 2;
  lines: ProviderStructuralLineV2[];
};

export type ProviderStructuralLineEdit = Pick<
  LineSemantics,
  | 'rawCode'
  | 'rawName'
  | 'component'
  | 'postingTreatment'
  | 'taxRole'
  | 'amountCents'
>;

export type ProviderStructuralLineAddition = ProviderStructuralLineEdit & {
  evidenceDocumentStableId: string;
};

export type ProviderStructuralTargetChangeV2 = {
  version: 2;
  expectedBaseAuthorityHash: string;
  changes: Array<
    | {
        action: 'UPDATE';
        effectiveLineStableId: string;
        values: ProviderStructuralLineEdit;
      }
    | { action: 'REMOVE'; effectiveLineStableId: string }
    | { action: 'ADD'; values: ProviderStructuralLineAddition }
  >;
};

const fail = (message: string): never => {
  throw new AccountingProviderSettlementStructuralTargetError(message);
};

const required = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > 250) {
    return fail(field + ' must be a nonempty string of at most 250 characters');
  }
  return value.trim();
};

const optional = (value: unknown, field: string): string | null => {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > 500) {
    return fail(field + ' must be a string or null');
  }
  return value.trim() || null;
};

const semantics = (
  raw: ProviderStructuralLineEdit,
  occurredAt: string | null,
): LineSemantics => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail('line semantics must be an object');
  }
  if (
    !Object.values(AccountingFinancialComponent).includes(raw.component) ||
    !Object.values(AccountingFinancialPostingTreatment).includes(
      raw.postingTreatment,
    ) ||
    !Object.values(AccountingFinancialTaxRole).includes(raw.taxRole)
  ) {
    return fail('line classification is invalid');
  }
  if (!Number.isSafeInteger(raw.amountCents)) {
    return fail('line amount must be a safe integer number of cents');
  }
  if (
    occurredAt !== null &&
    (!Number.isFinite(Date.parse(occurredAt)) ||
      new Date(occurredAt).toISOString() !== occurredAt)
  ) {
    return fail('line occurredAt must be a canonical ISO timestamp or null');
  }
  return {
    rawCode: optional(raw.rawCode, 'rawCode'),
    rawName: optional(raw.rawName, 'rawName'),
    component: raw.component,
    postingTreatment: raw.postingTreatment,
    taxRole: raw.taxRole,
    amountCents: raw.amountCents,
    occurredAt,
  };
};

const normalizedLines = (
  lines: ProviderStructuralLineV2[],
): ProviderStructuralLineV2[] => {
  if (!Array.isArray(lines)) return fail('target lines must be an array');
  const ids = new Set<string>();
  const positions = new Set<number>();
  const sourceKeys = new Set<string>();
  const normalized = lines.map((line) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) {
      return fail('target line must be an object');
    }
    const id = required(line.effectiveLineStableId, 'effectiveLineStableId');
    const evidenceDocumentStableId = required(
      line.evidenceDocumentStableId,
      'evidenceDocumentStableId',
    );
    if (ids.has(id)) return fail('duplicate effective line identity');
    ids.add(id);
    if (
      !Number.isSafeInteger(line.effectiveLineNo) ||
      line.effectiveLineNo < 1 ||
      positions.has(line.effectiveLineNo)
    ) {
      return fail('effective line order must have unique positive integers');
    }
    positions.add(line.effectiveLineNo);
    const business = semantics(line, line.occurredAt);
    if (line.origin === 'CORRECTION_ADDED') {
      if (line.sourceLine !== null)
        return fail('correction-added line must not claim source provenance');
      if (!id.startsWith('correction-line:'))
        return fail(
          'correction-added identity requires correction-line namespace',
        );
      return {
        ...business,
        origin: 'CORRECTION_ADDED' as const,
        effectiveLineStableId: id,
        effectiveLineNo: line.effectiveLineNo,
        evidenceDocumentStableId,
        sourceLine: null,
      };
    }
    if (
      line.origin !== 'SOURCE_LINE' ||
      !line.sourceLine ||
      typeof line.sourceLine !== 'object'
    ) {
      return fail('source line must preserve source provenance');
    }
    const sourceLine = {
      documentStableId: required(
        line.sourceLine.documentStableId,
        'source document',
      ),
      lineStableId: required(
        line.sourceLine.lineStableId,
        'source line identity',
      ),
      lineNo: line.sourceLine.lineNo,
    };
    if (
      !Number.isSafeInteger(sourceLine.lineNo) ||
      sourceLine.lineNo < 1 ||
      id !== sourceLine.lineStableId ||
      evidenceDocumentStableId !== sourceLine.documentStableId
    ) {
      return fail('source line provenance must match its immutable identity');
    }
    const sourceKey =
      sourceLine.documentStableId + ':' + sourceLine.lineStableId;
    if (sourceKeys.has(sourceKey)) return fail('duplicate source provenance');
    sourceKeys.add(sourceKey);
    return {
      ...business,
      origin: 'SOURCE_LINE' as const,
      effectiveLineStableId: id,
      effectiveLineNo: line.effectiveLineNo,
      evidenceDocumentStableId,
      sourceLine,
    };
  });
  return normalized.sort(
    (a, b) =>
      a.effectiveLineNo - b.effectiveLineNo ||
      a.effectiveLineStableId.localeCompare(b.effectiveLineStableId),
  );
};

/** Read-only upgrade of existing v1 authority; never fabricates source evidence. */
export const upgradeProviderCorrectionTargetToV2 = (
  old: ProviderSettlementCorrectionTargetV1,
): ProviderSettlementStructuralTargetV2 => {
  const v1 = normalizeProviderSettlementCorrectionTarget(old);
  return normalizeProviderStructuralTarget({
    ...v1,
    version: 2,
    lines: v1.lines.map((line, index) => ({
      ...line,
      origin: 'SOURCE_LINE',
      effectiveLineStableId: line.lineStableId,
      effectiveLineNo: index + 1,
      evidenceDocumentStableId: line.sourceDocumentStableId,
      sourceLine: {
        documentStableId: line.sourceDocumentStableId,
        lineStableId: line.lineStableId,
        lineNo: line.lineNo,
      },
    })),
  });
};

export const normalizeProviderStructuralTarget = (
  input: ProviderSettlementStructuralTargetV2,
): ProviderSettlementStructuralTargetV2 => {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    input.version !== 2
  ) {
    return fail('structural target requires version 2');
  }
  // Reuse the established v1 envelope validation; its line count/identity policy is
  // deliberately not used for structural lines.
  const checkedEnvelope = normalizeProviderSettlementCorrectionTarget({
    ...input,
    version: 1,
    lines: [],
  });
  const lines = normalizedLines(input.lines);
  const allowedEvidence = new Set([
    checkedEnvelope.document.documentStableId,
    ...checkedEnvelope.supplementaryEvidenceDocumentStableIds,
  ]);
  for (const line of lines) {
    if (!allowedEvidence.has(line.evidenceDocumentStableId)) {
      return fail(
        'line references evidence outside the frozen Provider authority',
      );
    }
  }
  return { ...checkedEnvelope, version: 2, lines };
};

export const hashProviderStructuralTarget = (
  target: ProviderSettlementStructuralTargetV2,
): string => {
  const { basedOnAuthorityHash, ...authority } =
    normalizeProviderStructuralTarget(target);
  void basedOnAuthorityHash;
  return hashAccountingJson(authority);
};

/** Owner-only pure policy. Callers must supply a server-generated identity factory. */
export const applyProviderStructuralTargetChange = (params: {
  base: ProviderSettlementStructuralTargetV2;
  input: ProviderStructuralTargetChangeV2;
  nextCorrectionLineStableId: () => string;
  validateAddedLine: (line: ProviderStructuralLineAddition) => void;
}): ProviderSettlementStructuralTargetV2 => {
  const base = normalizeProviderStructuralTarget(params.base);
  const change = params.input;
  if (!change || change.version !== 2 || !Array.isArray(change.changes)) {
    return fail('structural changes require version 2');
  }
  if (change.expectedBaseAuthorityHash !== hashProviderStructuralTarget(base)) {
    return fail('stale current-effective structural authority');
  }
  let lines: ProviderStructuralLineV2[] = [...base.lines];
  const touched = new Set<string>();
  for (const operation of change.changes) {
    if (!operation || typeof operation !== 'object')
      return fail('invalid structural operation');
    if (operation.action === 'ADD') {
      if (typeof params.validateAddedLine !== 'function')
        return fail('added-line validator is required');
      params.validateAddedLine(operation.values);
      const id = required(
        params.nextCorrectionLineStableId(),
        'server-created correction line ID',
      );
      if (
        !id.startsWith('correction-line:') ||
        lines.some((line) => line.effectiveLineStableId === id)
      ) {
        return fail(
          'generated correction line identity is invalid or duplicated',
        );
      }
      lines.push({
        ...semantics(operation.values, null),
        origin: 'CORRECTION_ADDED',
        effectiveLineStableId: id,
        effectiveLineNo: lines.length + 1,
        evidenceDocumentStableId: required(
          operation.values.evidenceDocumentStableId,
          'evidence document',
        ),
        sourceLine: null,
      });
      continue;
    }
    if (operation.action !== 'UPDATE' && operation.action !== 'REMOVE') {
      return fail('unknown structural operation');
    }
    const id = required(
      operation.effectiveLineStableId,
      'effective line identity',
    );
    if (touched.has(id))
      return fail('effective line may only be edited once per revision');
    touched.add(id);
    const index = lines.findIndex((line) => line.effectiveLineStableId === id);
    if (index < 0)
      return fail('structural operation references an unknown effective line');
    if (operation.action === 'REMOVE') {
      // Removing a control or payout anchor would allow inventing a reconciled total.
      const existing = lines[index];
      if (
        existing?.postingTreatment !==
        AccountingFinancialPostingTreatment.POSTABLE
      ) {
        return fail('non-postable control/evidence lines cannot be removed');
      }
      lines.splice(index, 1);
    } else {
      const existing = lines[index];
      if (!existing) return fail('missing effective line');
      const update = semantics(operation.values, existing.occurredAt);
      if (
        existing.postingTreatment ===
          AccountingFinancialPostingTreatment.CONTROL_TOTAL ||
        existing.component === AccountingFinancialComponent.CONTROL_TOTAL
      ) {
        if (
          update.postingTreatment ===
          AccountingFinancialPostingTreatment.POSTABLE
        ) {
          return fail('CONTROL_TOTAL cannot become POSTABLE');
        }
      }
      lines[index] = { ...existing, ...update };
    }
  }
  lines = lines.map((line, index) => ({ ...line, effectiveLineNo: index + 1 }));
  return normalizeProviderStructuralTarget({
    ...base,
    basedOnAuthorityHash: hashProviderStructuralTarget(base),
    lines,
  });
};
