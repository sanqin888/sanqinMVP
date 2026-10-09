import {
  AccountingFinancialDocumentType,
  AccountingFinancialProvider,
} from './accounting-contracts';
import type { AccountingJournalCreateInput } from './accounting-journal-policy';
import type { ProviderSettlementCorrectionTargetV1 } from './accounting-provider-settlement-correction-target.policy';
import {
  buildProviderControlTotalChecks,
  buildProviderSettlementDocumentPlan,
  type ProviderSettlementDocumentInput,
} from './accounting-provider-settlement.policy';

const HISTORICAL_FANTUAN_MISSING_COMPONENT_CHECKS = new Set([
  'FANTUAN_MARKETING_CHARGES',
  'FANTUAN_NET_TAXES',
]);

/**
 * Reconstructs ONLY the posting vector of an already audited historical
 * Fantuan Journal. Its original Statement controls remain immutable and
 * mismatched; the simulated controls are discarded after the proof.
 *
 * The adapter must independently validate the original typed CREATE audit,
 * posted payload hash, source review authority and rebuilt Journal equality.
 * This is not a permission to post an unreconciled target.
 */
export const tryRebuildHistoricalFantuanPostingProof = (params: {
  source: ProviderSettlementCorrectionTargetV1;
  occurredAt: Date;
}): AccountingJournalCreateInput | null => {
  const source = params.source;
  if (
    source.document.provider !== AccountingFinancialProvider.FANTUAN ||
    source.document.documentType !==
      AccountingFinancialDocumentType.STATEMENT ||
    source.document.currency !== 'CAD' ||
    source.salesAuthority !== 'STATEMENT_AUTHORITATIVE' ||
    source.supplementaryEvidenceDocumentStableIds.length !== 0
  ) {
    return null;
  }
  if (
    source.lines.some((line) =>
      ['marketing fee', 'marketing fee gst/hst'].includes(
        line.rawName?.trim().toLowerCase() ?? '',
      ),
    )
  ) {
    return null;
  }

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
  const mismatches = checks.filter((check) => check.status === 'MISMATCH');
  if (
    checks.length !== 4 ||
    mismatches.length !== 2 ||
    checks.some((check) => check.status === 'INCOMPLETE') ||
    mismatches.some(
      (check) =>
        !HISTORICAL_FANTUAN_MISSING_COMPONENT_CHECKS.has(check.key) ||
        check.deltaCents === null ||
        check.deltaCents <= 0 ||
        check.controlLineStableId === null,
    )
  ) {
    return null;
  }

  const simulatedControlAmounts = new Map<string, number>();
  for (const check of mismatches) {
    if (check.controlLineStableId === null || check.calculatedCents === null) {
      return null;
    }
    simulatedControlAmounts.set(
      check.controlLineStableId,
      check.calculatedCents,
    );
  }
  const firstPass: ProviderSettlementDocumentInput = {
    ...document,
    lines: document.lines.map((line) => ({
      ...line,
      amountCents:
        simulatedControlAmounts.get(line.lineStableId) ?? line.amountCents,
    })),
  };

  // Transfer is a control of other control totals. Recompute it only in this
  // ephemeral proof, never in the source or corrected target authority.
  const transfer = buildProviderControlTotalChecks(firstPass).find(
    (check) => check.key === 'FANTUAN_TRANSFER_TOTAL',
  );
  if (
    !transfer ||
    transfer.status === 'INCOMPLETE' ||
    transfer.controlLineStableId === null ||
    transfer.calculatedCents === null
  ) {
    return null;
  }
  const transferControlLineStableId = transfer.controlLineStableId;
  const transferCalculatedCents = transfer.calculatedCents;
  const proofDocument: ProviderSettlementDocumentInput = {
    ...firstPass,
    lines: firstPass.lines.map((line) => ({
      ...line,
      amountCents:
        line.lineStableId === transferControlLineStableId
          ? transferCalculatedCents
          : line.amountCents,
    })),
  };
  const proof = buildProviderSettlementDocumentPlan({
    document: proofDocument,
    salesAuthority: source.salesAuthority,
    occurredAt: params.occurredAt,
  });
  return proof.status === 'READY' ? proof.draftJournal : null;
};
