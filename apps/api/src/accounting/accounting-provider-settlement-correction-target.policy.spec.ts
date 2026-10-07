import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole,
} from './accounting-contracts';
import {
  ACCOUNTING_PROVIDER_SETTLEMENT_CORRECTION_TARGET_SCHEMA,
  AccountingProviderSettlementCorrectionTargetPolicyError,
  applyProviderSettlementCorrectionTargetInput,
  hashProviderSettlementCorrectionTarget,
  normalizeProviderSettlementCorrectionTarget,
  type ProviderSettlementCorrectionTargetV1,
} from './accounting-provider-settlement-correction-target.policy';

const sha = (value: string) => value.repeat(64).slice(0, 64);

const baseTarget = (): ProviderSettlementCorrectionTargetV1 =>
  normalizeProviderSettlementCorrectionTarget({
    version: 1,
    document: {
      documentStableId: 'provider_doc_1',
      documentRevision: 1,
      provider: AccountingFinancialProvider.UBER_EATS,
      documentType: AccountingFinancialDocumentType.STATEMENT,
      businessIdentityKey: 'uber:statement:2026-09',
      providerDocumentRef: 'statement-2026-09',
      storeStableId: '4750_Yonge_Street',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      currency: 'CAD',
      sourcePostingAuthorityHash: sha('a'),
    },
    salesAuthority: 'STATEMENT_AUTHORITATIVE',
    basedOnAuthorityHash: sha('b'),
    supplementaryEvidenceDocumentStableIds: [],
    historicalReversalOriginalJournalEntryStableIds: ['journal_order_1'],
    lines: [
      {
        sourceDocumentStableId: 'provider_doc_1',
        lineStableId: 'line-sales',
        lineNo: 1,
        rawCode: null,
        rawName: 'Sales',
        component: AccountingFinancialComponent.SALES,
        postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
        taxRole: AccountingFinancialTaxRole.NONE,
        amountCents: 10_000,
        occurredAt: null,
      },
      {
        sourceDocumentStableId: 'provider_doc_1',
        lineStableId: 'line-control-total',
        lineNo: 2,
        rawCode: null,
        rawName: 'Total Earnings',
        component: AccountingFinancialComponent.CONTROL_TOTAL,
        postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
        taxRole: AccountingFinancialTaxRole.NONE,
        amountCents: 10_000,
        occurredAt: null,
      },
    ],
  });

const toEditableLines = (target: ProviderSettlementCorrectionTargetV1) =>
  target.lines.map((line) => ({
    lineStableId: line.lineStableId,
    rawCode: line.rawCode,
    rawName: line.rawName,
    component: line.component,
    postingTreatment: line.postingTreatment,
    taxRole: line.taxRole,
    amountCents: line.amountCents,
  }));

describe('Provider Settlement correction target policy', () => {
  it('keeps business identity and provenance frozen while accepting a current-effective line correction', () => {
    const base = baseTarget();
    const expectedBaseAuthorityHash =
      hashProviderSettlementCorrectionTarget(base);
    const lines = toEditableLines(base).map((line) =>
      line.lineStableId === 'line-sales' ||
      line.lineStableId === 'line-control-total'
        ? { ...line, amountCents: 10_100 }
        : line,
    );

    const target = applyProviderSettlementCorrectionTargetInput({
      base,
      input: {
        version: 1,
        expectedBaseAuthorityHash,
        lines,
      },
    });

    expect(target.document).toEqual(base.document);
    expect(target.salesAuthority).toBe(base.salesAuthority);
    expect(target.supplementaryEvidenceDocumentStableIds).toEqual([]);
    expect(target.historicalReversalOriginalJournalEntryStableIds).toEqual([
      'journal_order_1',
    ]);
    expect(target.basedOnAuthorityHash).toBe(expectedBaseAuthorityHash);
    expect(
      target.lines.find((line) => line.lineStableId === 'line-sales')
        ?.amountCents,
    ).toBe(10_100);
    expect(
      target.lines.find((line) => line.lineStableId === 'line-sales')
        ?.sourceDocumentStableId,
    ).toBe('provider_doc_1');
  });

  it('fails closed with a policy error for malformed persisted target JSON', () => {
    expect(() =>
      normalizeProviderSettlementCorrectionTarget({
        version: 1,
        document: null,
        lines: null,
      } as never),
    ).toThrow(
      'provider settlement correction target document must be an object',
    );
  });

  it('rejects a stale editor snapshot before applying its full line payload', () => {
    const base = baseTarget();

    expect(() =>
      applyProviderSettlementCorrectionTargetInput({
        base,
        input: {
          version: 1,
          expectedBaseAuthorityHash: sha('c'),
          lines: toEditableLines(base),
        },
      }),
    ).toThrow(
      new AccountingProviderSettlementCorrectionTargetPolicyError(
        'Provider correction target was edited from a stale current-effective authority',
      ),
    );
  });

  it('rejects adding or removing effective lines in the normal DELTA flow', () => {
    const base = baseTarget();
    const expectedBaseAuthorityHash =
      hashProviderSettlementCorrectionTarget(base);

    expect(() =>
      applyProviderSettlementCorrectionTargetInput({
        base,
        input: {
          version: 1,
          expectedBaseAuthorityHash,
          lines: toEditableLines(base).slice(0, 1),
        },
      }),
    ).toThrow(
      'normal Provider DELTA correction cannot add or remove effective lines',
    );
  });

  it('does not allow a control-total source line to become POSTABLE', () => {
    const base = baseTarget();
    const expectedBaseAuthorityHash =
      hashProviderSettlementCorrectionTarget(base);
    const lines = toEditableLines(base).map((line) =>
      line.lineStableId === 'line-control-total'
        ? {
            ...line,
            component: AccountingFinancialComponent.SALES,
            postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          }
        : line,
    );

    expect(() =>
      applyProviderSettlementCorrectionTargetInput({
        base,
        input: {
          version: 1,
          expectedBaseAuthorityHash,
          lines,
        },
      }),
    ).toThrow('CONTROL_TOTAL line cannot become POSTABLE');
  });

  it('keeps target authority identity independent from lineage metadata', () => {
    const base = baseTarget();
    const changedLineage = normalizeProviderSettlementCorrectionTarget({
      ...base,
      basedOnAuthorityHash: sha('d'),
    });

    expect(hashProviderSettlementCorrectionTarget(base)).toBe(
      hashProviderSettlementCorrectionTarget(changedLineage),
    );
    expect(ACCOUNTING_PROVIDER_SETTLEMENT_CORRECTION_TARGET_SCHEMA).toBe(
      'accounting.provider-settlement-correction-target.v1',
    );
  });
});
