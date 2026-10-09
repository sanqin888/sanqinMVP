import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole,
} from './accounting-contracts';
import { hashAccountingJson } from './accounting-inbox-core.policy';
import {
  normalizeProviderSettlementCorrectionTarget,
  type ProviderSettlementCorrectionTargetV1,
} from './accounting-provider-settlement-correction-target.policy';
import {
  applyProviderStructuralTargetChange,
  hashProviderStructuralTarget,
  normalizeProviderStructuralTarget,
  upgradeProviderCorrectionTargetToV2,
  type ProviderSettlementStructuralTargetV2,
  type ProviderStructuralLineAddition,
  type ProviderStructuralTargetChangeV2,
} from './accounting-provider-settlement-structural-target.policy';
import {
  buildProviderControlTotalChecks,
  type ProviderSettlementDocumentInput,
} from './accounting-provider-settlement.policy';

export class AccountingProviderStructuralAdapterPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountingProviderStructuralAdapterPolicyError';
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new AccountingProviderStructuralAdapterPolicyError(message);
  }
}

type AdditionTemplate = {
  rawName: string;
  component: AccountingFinancialComponent;
  taxRole: AccountingFinancialTaxRole;
  amountCents: number;
};

const expectedFantuanMissingLines = (
  source: ProviderSettlementCorrectionTargetV1,
): AdditionTemplate[] => {
  assert(
    source.document.provider === AccountingFinancialProvider.FANTUAN &&
      source.document.documentType === AccountingFinancialDocumentType.STATEMENT &&
      source.document.currency === 'CAD' &&
      source.salesAuthority === 'STATEMENT_AUTHORITATIVE' &&
      source.supplementaryEvidenceDocumentStableIds.length === 0,
    'structural additions are limited to audited Fantuan Statement authority',
  );
  const document: ProviderSettlementDocumentInput = {
    documentStableId: source.document.documentStableId,
    revision: source.document.documentRevision,
    provider: source.document.provider,
    documentType: source.document.documentType,
    storeStableId: source.document.storeStableId,
    periodStart: source.document.periodStart,
    periodEnd: source.document.periodEnd,
    currency: source.document.currency,
    lines: source.lines.map((line) => ({
      lineStableId: line.lineStableId,
      lineNo: line.lineNo,
      rawCode: line.rawCode,
      rawName: line.rawName,
      component: line.component,
      postingTreatment: line.postingTreatment,
      amountCents: line.amountCents,
    })),
  };
  const checks = buildProviderControlTotalChecks(document);
  const marketing = checks.find((check) => check.key === 'FANTUAN_MARKETING_CHARGES');
  const taxes = checks.find((check) => check.key === 'FANTUAN_NET_TAXES');
  assert(
    marketing?.status === 'MISMATCH' &&
      taxes?.status === 'MISMATCH' &&
      marketing.deltaCents !== null &&
      taxes.deltaCents !== null &&
      marketing.deltaCents > 0 &&
      taxes.deltaCents > 0 &&
      checks.length === 4 &&
      checks.every((check) => check === marketing || check === taxes ||
        check.status === 'MATCHED') &&
      !source.lines.some((line) =>
        ['marketing fee', 'marketing fee gst/hst'].includes(
          line.rawName?.trim().toLowerCase() ?? '',
        ),
      ),
    'structural additions require exactly the two historic Fantuan control discrepancies',
  );
  if (
    marketing?.deltaCents == null ||
    taxes?.deltaCents == null
  ) {
    throw new AccountingProviderStructuralAdapterPolicyError('missing control amounts');
  }
  return [
    {
      rawName: 'Marketing Fee',
      component: AccountingFinancialComponent.ADVERTISING,
      taxRole: AccountingFinancialTaxRole.NONE,
      amountCents: -marketing.deltaCents,
    },
    {
      rawName: 'Marketing Fee GST/HST',
      component: AccountingFinancialComponent.ADVERTISING_TAX,
      taxRole: AccountingFinancialTaxRole.INPUT_TAX,
      amountCents: -taxes.deltaCents,
    },
  ];
};

const validAddedSemantics = (
  actual: ProviderStructuralLineAddition,
  required: AdditionTemplate,
  documentStableId: string,
): boolean =>
  actual.evidenceDocumentStableId === documentStableId &&
  actual.rawName === required.rawName &&
  actual.rawCode === null &&
  actual.component === required.component &&
  actual.postingTreatment === AccountingFinancialPostingTreatment.POSTABLE &&
  actual.taxRole === required.taxRole &&
  actual.amountCents === required.amountCents;

const correctionLineId = (
  source: ProviderSettlementCorrectionTargetV1,
  name: string,
): string =>
  'correction-line:' +
  hashAccountingJson({
    documentStableId: source.document.documentStableId,
    documentRevision: source.document.documentRevision,
    sourcePostingAuthorityHash: source.document.sourcePostingAuthorityHash,
    rawName: name,
  });

/**
 * SC-B2 deliberately admits only two audited correction-owned additions.
 * Ordinary edits and structural deletions remain in the existing v1 path or
 * deferred to a separately reviewed v2 owner policy.
 */
export const buildHistoricalFantuanStructuralTarget = (params: {
  source: ProviderSettlementCorrectionTargetV1;
  rawInput: unknown;
}): ProviderSettlementStructuralTargetV2 => {
  const expected = expectedFantuanMissingLines(params.source);
  const input = params.rawInput as ProviderStructuralTargetChangeV2;
  assert(
    input?.version === 2 &&
      Array.isArray(input.changes) &&
      input.changes.length === 2 &&
      input.changes.every((item) => item.action === 'ADD'),
    'historical Fantuan structural correction requires exactly two ADD operations',
  );
  const names = new Set<string>();
  for (const change of input.changes) {
    if (change.action !== 'ADD') {
      throw new AccountingProviderStructuralAdapterPolicyError('only ADD is supported');
    }
    const name = change.values?.rawName;
    const template = expected.find((item) => item.rawName === name);
    assert(
      template !== undefined &&
        !names.has(name ?? '') &&
        validAddedSemantics(change.values, template, params.source.document.documentStableId),
      'correction-added line fails the server-owned Fantuan template',
    );
    names.add(name ?? '');
  }
  const base = upgradeProviderCorrectionTargetToV2(params.source);
  let index = 0;
  const target = applyProviderStructuralTargetChange({
    base,
    input,
    nextCorrectionLineStableId: () => {
      const change = input.changes[index++];
      if (!change || change.action !== 'ADD') {
        throw new AccountingProviderStructuralAdapterPolicyError('invalid correction addition order');
      }
      return correctionLineId(params.source, change.values.rawName ?? '');
    },
    validateAddedLine: (line) => {
      const expectedLine = expected.find((item) => item.rawName === line.rawName);
      assert(
        expectedLine !== undefined &&
          validAddedSemantics(line, expectedLine, params.source.document.documentStableId),
        'unapproved correction-added Fantuan line',
      );
    },
  });
  assertHistoricalFantuanStructuralTarget(params.source, target);
  return target;
};

export const assertHistoricalFantuanStructuralTarget = (
  source: ProviderSettlementCorrectionTargetV1,
  rawTarget: ProviderSettlementStructuralTargetV2,
): void => {
  const target = normalizeProviderStructuralTarget(rawTarget);
  const expected = expectedFantuanMissingLines(source);
  const base = upgradeProviderCorrectionTargetToV2(source);
  const baselineHash = hashProviderStructuralTarget(base);
  assert(
    target.basedOnAuthorityHash === baselineHash &&
      hashAccountingJson(target.document) === hashAccountingJson(base.document) &&
      target.salesAuthority === base.salesAuthority &&
      hashAccountingJson(target.supplementaryEvidenceDocumentStableIds) ===
        hashAccountingJson(base.supplementaryEvidenceDocumentStableIds) &&
      hashAccountingJson(target.historicalReversalOriginalJournalEntryStableIds) ===
        hashAccountingJson(base.historicalReversalOriginalJournalEntryStableIds),
    'structural target changed frozen Provider authority or stale base',
  );
  const sourceLines = target.lines.filter((line) => line.origin === 'SOURCE_LINE');
  const added = target.lines.filter((line) => line.origin === 'CORRECTION_ADDED');
  assert(
    sourceLines.length === base.lines.length && added.length === 2,
    'structural target must preserve all source lines and exactly two additions',
  );
  const byId = new Map(sourceLines.map((line) => [line.effectiveLineStableId, line]));
  for (const line of base.lines) {
    const current = byId.get(line.effectiveLineStableId);
    assert(
      !!current &&
        hashAccountingJson({
          ...current,
          effectiveLineNo: line.effectiveLineNo,
        }) === hashAccountingJson(line),
      'structural correction must not change any historical source line',
    );
  }
  for (const template of expected) {
    const current = added.find((line) => line.rawName === template.rawName);
    assert(
      !!current &&
        current.effectiveLineStableId === correctionLineId(source, template.rawName) &&
        current.evidenceDocumentStableId === source.document.documentStableId &&
        current.sourceLine === null &&
        current.occurredAt === null &&
        current.rawCode === null &&
        current.component === template.component &&
        current.postingTreatment === AccountingFinancialPostingTreatment.POSTABLE &&
        current.taxRole === template.taxRole &&
        current.amountCents === template.amountCents,
      'structural correction-added line differs from reconciled template',
    );
  }
};

/** Temporary in-memory Provider policy view; it is never persisted as source. */
export const structuralTargetAsSettlementView = (
  target: ProviderSettlementStructuralTargetV2,
): ProviderSettlementCorrectionTargetV1 =>
  normalizeProviderSettlementCorrectionTarget({
    ...target,
    version: 1,
    lines: target.lines.map((line) => ({
      sourceDocumentStableId: line.evidenceDocumentStableId,
      lineStableId: line.effectiveLineStableId,
      lineNo: line.effectiveLineNo,
      rawCode: line.rawCode,
      rawName: line.rawName,
      component: line.component,
      postingTreatment: line.postingTreatment,
      taxRole: line.taxRole,
      amountCents: line.amountCents,
      occurredAt: line.occurredAt,
    })),
  });
