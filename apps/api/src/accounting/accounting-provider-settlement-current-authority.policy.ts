import { hashAccountingJson } from './accounting-inbox-core.policy';
import {
  ACCOUNTING_PROVIDER_SETTLEMENT_CORRECTION_TARGET_SCHEMA,
  hashProviderSettlementCorrectionTarget,
  normalizeProviderSettlementCorrectionTarget,
  type ProviderSettlementCorrectionTargetV1,
} from './accounting-provider-settlement-correction-target.policy';
import {
  ACCOUNTING_PROVIDER_SETTLEMENT_STRUCTURAL_TARGET_SCHEMA,
  hashProviderStructuralTarget,
  normalizeProviderStructuralTarget,
  type ProviderSettlementStructuralTargetV2,
} from './accounting-provider-settlement-structural-target.policy';

export class AccountingProviderCurrentAuthorityPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountingProviderCurrentAuthorityPolicyError';
  }
}

export type ProviderCurrentAuthority =
  | {
      schema: typeof ACCOUNTING_PROVIDER_SETTLEMENT_CORRECTION_TARGET_SCHEMA;
      hash: string;
      target: ProviderSettlementCorrectionTargetV1;
    }
  | {
      schema: typeof ACCOUNTING_PROVIDER_SETTLEMENT_STRUCTURAL_TARGET_SCHEMA;
      hash: string;
      target: ProviderSettlementStructuralTargetV2;
    };

export const readProviderCurrentAuthority = (params: {
  schema: string;
  targetJson: unknown;
  expectedHash: string;
}): ProviderCurrentAuthority => {
  if (params.schema === ACCOUNTING_PROVIDER_SETTLEMENT_CORRECTION_TARGET_SCHEMA) {
    const target = normalizeProviderSettlementCorrectionTarget(
      params.targetJson as ProviderSettlementCorrectionTargetV1,
    );
    const hash = hashProviderSettlementCorrectionTarget(target);
    if (hash !== params.expectedHash) {
      throw new AccountingProviderCurrentAuthorityPolicyError(
        'posted Provider v1 target authority hash mismatch',
      );
    }
    return { schema: ACCOUNTING_PROVIDER_SETTLEMENT_CORRECTION_TARGET_SCHEMA, hash, target };
  }
  if (params.schema === ACCOUNTING_PROVIDER_SETTLEMENT_STRUCTURAL_TARGET_SCHEMA) {
    const target = normalizeProviderStructuralTarget(
      params.targetJson as ProviderSettlementStructuralTargetV2,
    );
    const hash = hashProviderStructuralTarget(target);
    if (hash !== params.expectedHash) {
      throw new AccountingProviderCurrentAuthorityPolicyError(
        'posted Provider v2 target authority hash mismatch',
      );
    }
    return { schema: ACCOUNTING_PROVIDER_SETTLEMENT_STRUCTURAL_TARGET_SCHEMA, hash, target };
  }
  throw new AccountingProviderCurrentAuthorityPolicyError(
    'unsupported posted Provider correction authority schema',
  );
};

export const currentProviderEffectiveLines = (
  authority: ProviderCurrentAuthority,
) => {
  if (authority.target.version === 1) {
    return authority.target.lines.map((line) => ({
      effectiveLineStableId: line.lineStableId,
      effectiveLineNo: line.lineNo,
      origin: 'SOURCE_LINE' as const,
      evidenceDocumentStableId: line.sourceDocumentStableId,
      sourceLine: {
        documentStableId: line.sourceDocumentStableId,
        lineStableId: line.lineStableId,
        lineNo: line.lineNo,
      },
      rawCode: line.rawCode,
      rawName: line.rawName,
      component: line.component,
      postingTreatment: line.postingTreatment,
      taxRole: line.taxRole,
      amountCents: line.amountCents,
      occurredAt: line.occurredAt,
    }));
  }
  return authority.target.lines.map((line) => ({
    effectiveLineStableId: line.effectiveLineStableId,
    effectiveLineNo: line.effectiveLineNo,
    origin: line.origin,
    evidenceDocumentStableId: line.evidenceDocumentStableId,
    sourceLine: line.sourceLine,
    rawCode: line.rawCode,
    rawName: line.rawName,
    component: line.component,
    postingTreatment: line.postingTreatment,
    taxRole: line.taxRole,
    amountCents: line.amountCents,
    occurredAt: line.occurredAt,
  }));
};

/** Frozen Provider identity is not included in free-form effective lines. */
export const sameProviderEnvelope = (
  left: ProviderSettlementCorrectionTargetV1 | ProviderSettlementStructuralTargetV2,
  right: ProviderSettlementCorrectionTargetV1 | ProviderSettlementStructuralTargetV2,
): boolean =>
  hashAccountingJson(left.document) === hashAccountingJson(right.document) &&
  left.salesAuthority === right.salesAuthority &&
  hashAccountingJson(left.supplementaryEvidenceDocumentStableIds) ===
    hashAccountingJson(right.supplementaryEvidenceDocumentStableIds) &&
  hashAccountingJson(left.historicalReversalOriginalJournalEntryStableIds) ===
    hashAccountingJson(right.historicalReversalOriginalJournalEntryStableIds);
