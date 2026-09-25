import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');
const panelSource = readFileSync(
  resolve(__dirname, 'clover-fee-reclassification-panel.tsx'),
  'utf8',
);

describe('Clover fee payable correction runtime UI', () => {
  it('mounts the correction only for posted Clover statements', () => {
    expect(pageSource).toContain("document.provider === 'CLOVER'");
    expect(pageSource).toContain("document.documentType === 'STATEMENT'");
    expect(pageSource).toContain('<CloverFeeReclassificationPanel');
    expect(pageSource).toContain('postingState &&');
  });

  it('requires a fresh plan hash and two-step real reclassification confirmation', () => {
    expect(panelSource).toContain(
      '/accounting/journal/provider-settlement/clover-fee-reclassification-preview?',
    );
    expect(panelSource).toContain(
      '/accounting/journal/provider-settlement/clover-fee-reclassification',
    );
    expect(panelSource).toContain('expectedPlanHash: preview.planHash');
    expect(panelSource).toContain('setArmed(true)');
    expect(panelSource).toContain('确认真实重分类');
  });

  it('provisions the dedicated fee payable explicitly and describes the balance-sheet-only correction', () => {
    expect(panelSource).toContain('/accounting/setup/provider-fee-clearing');
    expect(panelSource).toContain('CLOVER_FEE_PAYABLE_ACCOUNT_NOT_PROVISIONED');
    expect(panelSource).toContain(
      'Dr Clover Pending / Cr Clover 费用应付，不重复记费用',
    );
  });
});
