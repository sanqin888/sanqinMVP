import {
  AccountingFinancialComponent as Component,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment as Treatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole as TaxRole,
} from './accounting-contracts';
import {
  normalizeProviderSettlementCorrectionTarget,
  type ProviderSettlementCorrectionTargetV1,
} from './accounting-provider-settlement-correction-target.policy';
import {
  ACCOUNTING_PROVIDER_SETTLEMENT_STRUCTURAL_TARGET_SCHEMA,
  applyProviderStructuralTargetChange,
  hashProviderStructuralTarget,
  normalizeProviderStructuralTarget,
  upgradeProviderCorrectionTargetToV2,
} from './accounting-provider-settlement-structural-target.policy';

const original = (): ProviderSettlementCorrectionTargetV1 =>
  normalizeProviderSettlementCorrectionTarget({
    version: 1,
    document: {
      documentStableId: 'statement_1',
      documentRevision: 1,
      provider: AccountingFinancialProvider.FANTUAN,
      documentType: AccountingFinancialDocumentType.STATEMENT,
      businessIdentityKey: 'fantuan:2026-09',
      providerDocumentRef: null,
      storeStableId: '4750_Yonge_Street',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      currency: 'CAD',
      sourcePostingAuthorityHash: 'a'.repeat(64),
    },
    salesAuthority: 'STATEMENT_AUTHORITATIVE',
    basedOnAuthorityHash: 'b'.repeat(64),
    supplementaryEvidenceDocumentStableIds: [],
    historicalReversalOriginalJournalEntryStableIds: [],
    lines: [
      {
        sourceDocumentStableId: 'statement_1',
        lineStableId: 'line_sales',
        lineNo: 1,
        rawCode: null,
        rawName: 'Sales',
        component: Component.SALES,
        postingTreatment: Treatment.POSTABLE,
        taxRole: TaxRole.NONE,
        amountCents: 686782,
        occurredAt: null,
      },
      {
        sourceDocumentStableId: 'statement_1',
        lineStableId: 'line_transfer',
        lineNo: 10,
        rawCode: null,
        rawName: 'Total transfer amount',
        component: Component.PAYOUT,
        postingTreatment: Treatment.CONTROL_TOTAL,
        taxRole: TaxRole.NONE,
        amountCents: 465836,
        occurredAt: null,
      },
    ],
  });

const added = {
  evidenceDocumentStableId: 'statement_1',
  rawCode: null,
  rawName: 'Marketing Fee',
  component: Component.ADVERTISING,
  postingTreatment: Treatment.POSTABLE,
  taxRole: TaxRole.NONE,
  amountCents: -28200,
};

describe('Provider correction structural target v2 pure policy', () => {
  it('upgrades v1 without changing source provenance, source order, or source document', () => {
    const v1 = original();
    const v2 = upgradeProviderCorrectionTargetToV2(v1);
    expect(ACCOUNTING_PROVIDER_SETTLEMENT_STRUCTURAL_TARGET_SCHEMA).toBe(
      'accounting.provider-settlement-correction-target.v2',
    );
    expect(v2.document).toEqual(v1.document);
    expect(v2.lines[1]).toEqual(
      expect.objectContaining({
        origin: 'SOURCE_LINE',
        effectiveLineNo: 2,
        sourceLine: {
          documentStableId: 'statement_1',
          lineStableId: 'line_transfer',
          lineNo: 10,
        },
      }),
    );
    expect(v2.lines[1]?.effectiveLineStableId).toBe('line_transfer');
  });

  it('adds an explicitly correction-owned line without fabricating machine-source provenance', () => {
    const base = upgradeProviderCorrectionTargetToV2(original());
    const next = applyProviderStructuralTargetChange({
      base,
      input: {
        version: 2,
        expectedBaseAuthorityHash: hashProviderStructuralTarget(base),
        changes: [{ action: 'ADD', values: added }],
      },
      nextCorrectionLineStableId: () => 'correction-line:case_1:1',
      validateAddedLine: (line) => {
        expect(line.component).toBe(Component.ADVERTISING);
      },
    });
    expect(next.lines).toHaveLength(3);
    expect(next.lines[2]).toEqual(
      expect.objectContaining({
        origin: 'CORRECTION_ADDED',
        effectiveLineStableId: 'correction-line:case_1:1',
        effectiveLineNo: 3,
        evidenceDocumentStableId: 'statement_1',
        sourceLine: null,
      }),
    );
    expect(next.lines[1]?.origin).toBe('SOURCE_LINE');
    expect(next.basedOnAuthorityHash).toBe(hashProviderStructuralTarget(base));
    expect(hashProviderStructuralTarget(next)).not.toBe(
      hashProviderStructuralTarget(base),
    );
  });

  it('allows removal from effective target without rewriting source provenance', () => {
    const base = upgradeProviderCorrectionTargetToV2(original());
    const next = applyProviderStructuralTargetChange({
      base,
      input: {
        version: 2,
        expectedBaseAuthorityHash: hashProviderStructuralTarget(base),
        changes: [{ action: 'REMOVE', effectiveLineStableId: 'line_sales' }],
      },
      nextCorrectionLineStableId: () => 'correction-line:unused',
      validateAddedLine: () => undefined,
    });
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0]?.effectiveLineNo).toBe(1);
    expect(original().lines).toHaveLength(2);
  });

  it('fails closed on stale authority, spoofed provenance, reused ids and unapproved evidence', () => {
    const base = upgradeProviderCorrectionTargetToV2(original());
    const change = {
      version: 2 as const,
      expectedBaseAuthorityHash: 'f'.repeat(64),
      changes: [{ action: 'ADD' as const, values: added }],
    };
    const args = {
      base,
      input: change,
      nextCorrectionLineStableId: () => 'correction-line:case_1:1',
      validateAddedLine: () => undefined,
    };
    expect(() => applyProviderStructuralTargetChange(args)).toThrow('stale');
    expect(() =>
      applyProviderStructuralTargetChange({
        ...args,
        input: {
          ...change,
          expectedBaseAuthorityHash: hashProviderStructuralTarget(base),
        },
        nextCorrectionLineStableId: () => 'line_sales',
      }),
    ).toThrow('generated correction line identity');
    expect(() =>
      normalizeProviderStructuralTarget({
        ...base,
        lines: [
          ...base.lines,
          {
            ...base.lines[0],
            origin: 'CORRECTION_ADDED',
            effectiveLineStableId: 'correction-line:fake',
            effectiveLineNo: 3,
            sourceLine: base.lines[0].sourceLine,
          } as never,
        ],
      }),
    ).toThrow('must not claim source provenance');
    expect(() =>
      applyProviderStructuralTargetChange({
        ...args,
        input: {
          version: 2,
          expectedBaseAuthorityHash: hashProviderStructuralTarget(base),
          changes: [
            {
              action: 'ADD',
              values: { ...added, evidenceDocumentStableId: 'other_doc' },
            },
          ],
        },
      }),
    ).toThrow('outside the frozen Provider authority');
  });

  it('does not remove control lines or accept duplicate effective IDs', () => {
    const base = upgradeProviderCorrectionTargetToV2(original());
    expect(() =>
      applyProviderStructuralTargetChange({
        base,
        input: {
          version: 2,
          expectedBaseAuthorityHash: hashProviderStructuralTarget(base),
          changes: [
            { action: 'REMOVE', effectiveLineStableId: 'line_transfer' },
          ],
        },
        nextCorrectionLineStableId: () => 'correction-line:unused',
        validateAddedLine: () => undefined,
      }),
    ).toThrow('non-postable');
    expect(() =>
      normalizeProviderStructuralTarget({
        ...base,
        lines: [base.lines[0], base.lines[0]],
      }),
    ).toThrow('duplicate effective line identity');
  });
});
