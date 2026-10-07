import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const serviceSource = readFileSync(
  resolve(__dirname, 'accounting-provider-settlement-correction.service.ts'),
  'utf8',
);
const controllerSource = readFileSync(
  resolve(__dirname, 'accounting-provider-settlement.controller.ts'),
  'utf8',
);
const cloverReclassificationSource = readFileSync(
  resolve(__dirname, 'accounting-clover-fee-reclassification.service.ts'),
  'utf8',
);

describe('Provider posted correction B2 architecture', () => {
  it('keeps the HTTP facade inside Accounting and delegates lifecycle authority to A3 + B1', () => {
    expect(serviceSource).toContain('AccountingPostedFinancialCorrectionService');
    expect(serviceSource).toContain(
      'AccountingProviderSettlementCorrectionAdapter',
    );
    expect(serviceSource).toContain('.createDraft(');
    expect(serviceSource).toContain('.reviseDraft(');
    expect(serviceSource).toContain('.previewCase(');
    expect(serviceSource).toContain('.markReady(');
    expect(serviceSource).toContain('.executeCase(');
    expect(serviceSource).toContain('.cancelCase(');
  });

  it('does not reopen or mutate Provider Human Review after posting', () => {
    for (const forbidden of [
      'accountingProviderFinancialReviewRevision.create',
      'accountingProviderFinancialReviewRevision.update',
      'accountingProviderFinancialReviewRevision.updateMany',
      'confirmHumanReviewRevision',
      'createHumanReviewDraft',
    ]) {
      expect(serviceSource).not.toContain(forbidden);
      expect(controllerSource).not.toContain(forbidden);
    }
  });

  it('keeps the Fantuan September incident as verification data rather than runtime branching', () => {
    for (const source of [serviceSource, controllerSource]) {
      expect(source).not.toContain('2026-09');
      expect(source).not.toContain('September');
      expect(source).not.toContain('FANTUAN');
    }
  });

  it('fails closed in both directions between common Provider correction and legacy Clover fee reclassification', () => {
    expect(serviceSource).toContain('readCurrentEffectiveTarget');
    expect(cloverReclassificationSource).toContain(
      'POSTED_COMMON_CORRECTION_EXISTS',
    );
    expect(cloverReclassificationSource).toContain(
      'AccountingPostedCorrectionTargetKind.PROVIDER_SETTLEMENT',
    );
  });
});
