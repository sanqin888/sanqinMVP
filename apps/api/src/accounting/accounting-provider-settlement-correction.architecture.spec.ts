import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const adapterSource = readFileSync(
  resolve(__dirname, 'accounting-provider-settlement-correction.adapter.ts'),
  'utf8',
);
const targetPolicySource = readFileSync(
  resolve(
    __dirname,
    'accounting-provider-settlement-correction-target.policy.ts',
  ),
  'utf8',
);
const previewSource = readFileSync(
  resolve(__dirname, 'accounting-provider-settlement-preview.service.ts'),
  'utf8',
);
const fantuanPolicySource = readFileSync(
  resolve(__dirname, 'accounting-fantuan-adjustment-detail.policy.ts'),
  'utf8',
);
const structuralAdapterSource = readFileSync(
  resolve(
    __dirname,
    'accounting-provider-settlement-structural-adapter.policy.ts',
  ),
  'utf8',
);
const currentAuthoritySource = readFileSync(
  resolve(
    __dirname,
    'accounting-provider-settlement-current-authority.policy.ts',
  ),
  'utf8',
);
const providerFacadeSource = readFileSync(
  resolve(__dirname, 'accounting-provider-settlement-correction.service.ts'),
  'utf8',
);
const analyticsSource = readFileSync(
  resolve(__dirname, 'accounting-platform-analytics.service.ts'),
  'utf8',
);

describe('Provider Settlement posted correction adapter architecture', () => {
  it('keeps the typed correction target policy pure and provider-owner scoped', () => {
    expect(targetPolicySource).not.toContain('@prisma/client');
    expect(targetPolicySource).not.toContain('@nestjs/common');
    expect(targetPolicySource).toContain(
      "'accounting.provider-settlement-correction-target.v1'",
    );
    expect(targetPolicySource).toContain('expectedBaseAuthorityHash');
  });

  it('reuses existing Provider settlement and Human Review semantics instead of duplicating formulas in the common correction engine', () => {
    expect(adapterSource).toContain('buildProviderSettlementDocumentPlan');
    expect(adapterSource).toContain(
      'normalizeProviderSettlementReplacementGroupAuthority',
    );
    expect(adapterSource).toContain('hashProviderSettlementJournalWrite');
    expect(adapterSource).toContain('resolveProviderFinancialEffectiveLines');
    expect(adapterSource).toContain('resolveFantuanAdjustmentDetailLines');
  });

  it('requires audited historical proof and blocks v1 edits on unmatched historical controls', () => {
    expect(adapterSource).toContain('tryRebuildHistoricalFantuanPostingProof');
    expect(adapterSource).toContain(
      'Historical Fantuan missing components require structural v2',
    );
  });

  it('keeps structural v2 validation in Provider owner while reusing current settlement READY', () => {
    expect(adapterSource).toContain('buildHistoricalFantuanStructuralTarget');
    expect(adapterSource).toContain('assertHistoricalFantuanStructuralTarget');
    expect(adapterSource).toContain('structuralTargetAsSettlementView');
    expect(adapterSource).toContain('buildTargetProviderJournal');
    expect(adapterSource).toContain('AccountingPostedCorrectionStrategy.DELTA');
    expect(adapterSource).toContain('schemaTransition: {');
    expect(adapterSource).toContain('equivalentBaseHash: hashProviderStructuralTarget(');
    expect(adapterSource).toContain(
      'ACCOUNTING_PROVIDER_SETTLEMENT_STRUCTURAL_TARGET_SCHEMA',
    );
    expect(adapterSource).toContain(
      'Provider structural v2 POST remains gated until controlled production verification is authorized',
    );
  });

  it('supplies a server-verified Fantuan structural proposal without a browser-derived fee formula', () => {
    expect(structuralAdapterSource).toContain(
      'buildHistoricalFantuanStructuralProposal',
    );
    expect(structuralAdapterSource).toContain(
      'expectedFantuanMissingLines(source)',
    );
    expect(adapterSource).toContain('buildHistoricalFantuanStructuralProposal');
    expect(adapterSource).toContain('tryRebuildHistoricalFantuanPostingProof');
    expect(providerFacadeSource).toContain('structuralProposal');
    expect(adapterSource).toContain(
      'Provider structural v2 POST remains gated until controlled production verification is authorized',
    );
  });

  it('uses one Accounting-only v1/v2 authority reader without a parallel Journal writer', () => {
    expect(currentAuthoritySource).toContain('readProviderCurrentAuthority');
    expect(currentAuthoritySource).toContain('hashProviderStructuralTarget');
    expect(currentAuthoritySource).toContain(
      'hashProviderSettlementCorrectionTarget',
    );
    expect(currentAuthoritySource).not.toContain('@nestjs/common');
    expect(currentAuthoritySource).not.toContain('JournalService');
    expect(adapterSource).toContain('readProviderCurrentAuthority');
    expect(providerFacadeSource).toContain('readProviderCurrentAuthority');
    expect(analyticsSource).toContain('readProviderCurrentAuthority');
    expect(adapterSource).toContain(
      'Provider structural v2 POST remains gated until controlled production verification is authorized',
    );
  });

  it('shares Fantuan adjustment-detail resolution between normal settlement preview and posted correction', () => {
    expect(previewSource).toContain('resolveFantuanAdjustmentDetailLines');
    expect(adapterSource).toContain('resolveFantuanAdjustmentDetailLines');
    expect(previewSource).not.toContain(
      'FANTUAN_ADJUSTMENT_SUPPORTED_RAW_CODES',
    );
    expect(fantuanPolicySource).toContain(
      'FANTUAN_ADJUSTMENT_SUPPORTED_RAW_CODES',
    );
  });

  it('never reopens or mutates Provider source and Human Review rows during post-posting activation', () => {
    for (const forbidden of [
      'accountingProviderFinancialDocument.update',
      'accountingProviderFinancialDocument.updateMany',
      'accountingProviderFinancialReviewRevision.create',
      'accountingProviderFinancialReviewRevision.update',
      'accountingProviderFinancialReviewRevision.updateMany',
      'confirmRevision(',
    ]) {
      expect(adapterSource).not.toContain(forbidden);
    }
    expect(adapterSource).toContain(
      'Provider source/Human Review rows remain immutable',
    );
    expect(adapterSource).toContain(
      'AccountingCorrectionCase POSTED transition is the activation pointer',
    );
  });
});
