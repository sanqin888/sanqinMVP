import {
  AccountingFinancialComponent as Component,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment as Treatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole as TaxRole,
} from './accounting-contracts';
import {
  ACCOUNTING_PROVIDER_SETTLEMENT_CORRECTION_TARGET_SCHEMA,
  hashProviderSettlementCorrectionTarget,
  normalizeProviderSettlementCorrectionTarget,
} from './accounting-provider-settlement-correction-target.policy';
import {
  ACCOUNTING_PROVIDER_SETTLEMENT_STRUCTURAL_TARGET_SCHEMA,
  hashProviderStructuralTarget,
  upgradeProviderCorrectionTargetToV2,
} from './accounting-provider-settlement-structural-target.policy';
import {
  currentProviderEffectiveLines,
  readProviderCurrentAuthority,
  sameProviderEnvelope,
} from './accounting-provider-settlement-current-authority.policy';

const source = () =>
  normalizeProviderSettlementCorrectionTarget({
    version: 1,
    document: {
      documentStableId: 'fantuan_2026_09',
      documentRevision: 1,
      provider: AccountingFinancialProvider.FANTUAN,
      documentType: AccountingFinancialDocumentType.STATEMENT,
      businessIdentityKey: 'fantuan:sep',
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
        sourceDocumentStableId: 'fantuan_2026_09',
        lineStableId: 'source_sales',
        lineNo: 1,
        rawCode: null,
        rawName: 'Sales',
        component: Component.SALES,
        postingTreatment: Treatment.POSTABLE,
        taxRole: TaxRole.NONE,
        amountCents: 686782,
        occurredAt: null,
      },
    ],
  });

describe('Provider posted current authority v1/v2 codec', () => {
  it('reads historical v1 with original immutable source provenance', () => {
    const target = source();
    const result = readProviderCurrentAuthority({
      schema: ACCOUNTING_PROVIDER_SETTLEMENT_CORRECTION_TARGET_SCHEMA,
      targetJson: target,
      expectedHash: hashProviderSettlementCorrectionTarget(target),
    });
    expect(result.target.version).toBe(1);
    expect(currentProviderEffectiveLines(result)).toEqual([
      expect.objectContaining({
        effectiveLineStableId: 'source_sales',
        origin: 'SOURCE_LINE',
        sourceLine: {
          documentStableId: 'fantuan_2026_09',
          lineStableId: 'source_sales',
          lineNo: 1,
        },
      }),
    ]);
  });

  it('reads v2 correction added lines without faking original source identity', () => {
    const original = source();
    const baseline = upgradeProviderCorrectionTargetToV2(original);
    const target = {
      ...baseline,
      basedOnAuthorityHash: hashProviderStructuralTarget(baseline),
      lines: [
        ...baseline.lines,
        {
          origin: 'CORRECTION_ADDED' as const,
          effectiveLineStableId: 'correction-line:advertising-1',
          effectiveLineNo: 2,
          evidenceDocumentStableId: 'fantuan_2026_09',
          sourceLine: null,
          rawCode: null,
          rawName: 'Marketing Fee',
          component: Component.ADVERTISING,
          postingTreatment: Treatment.POSTABLE,
          taxRole: TaxRole.NONE,
          amountCents: -28200,
          occurredAt: null,
        },
      ],
    };
    const result = readProviderCurrentAuthority({
      schema: ACCOUNTING_PROVIDER_SETTLEMENT_STRUCTURAL_TARGET_SCHEMA,
      targetJson: target,
      expectedHash: hashProviderStructuralTarget(target),
    });
    expect(result.target.version).toBe(2);
    expect(sameProviderEnvelope(original, result.target)).toBe(true);
    expect(currentProviderEffectiveLines(result)[1]).toEqual(
      expect.objectContaining({
        origin: 'CORRECTION_ADDED',
        evidenceDocumentStableId: 'fantuan_2026_09',
        sourceLine: null,
        effectiveLineStableId: 'correction-line:advertising-1',
      }),
    );
    expect(() =>
      readProviderCurrentAuthority({
        schema: ACCOUNTING_PROVIDER_SETTLEMENT_STRUCTURAL_TARGET_SCHEMA,
        targetJson: target,
        expectedHash: '0'.repeat(64),
      }),
    ).toThrow('hash mismatch');
  });

  it('rejects unsupported or mismatched typed schemas instead of silently falling back', () => {
    const target = source();
    expect(() =>
      readProviderCurrentAuthority({
        schema: 'unrecognized-provider-target',
        targetJson: target,
        expectedHash: hashProviderSettlementCorrectionTarget(target),
      }),
    ).toThrow('unsupported');
    expect(() =>
      readProviderCurrentAuthority({
        schema: ACCOUNTING_PROVIDER_SETTLEMENT_STRUCTURAL_TARGET_SCHEMA,
        targetJson: target,
        expectedHash: hashProviderSettlementCorrectionTarget(target),
      }),
    ).toThrow('version 2');
  });
});
