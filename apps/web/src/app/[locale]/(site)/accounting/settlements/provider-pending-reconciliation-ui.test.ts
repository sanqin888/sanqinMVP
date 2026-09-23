import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');
const panelSource = readFileSync(
  resolve(__dirname, 'provider-pending-reconciliation-panel.tsx'),
  'utf8',
);

describe('PAYOUT-D Provider Pending reconciliation UI', () => {
  it('mounts the Journal-based reconciliation separately from payout posting', () => {
    expect(pageSource).toContain('<ProviderPendingReconciliationPanel');
    expect(panelSource).toContain(
      '/accounting/provider-pending-reconciliation?',
    );
    expect(panelSource).not.toContain('/accounting/provider-payouts');
    expect(panelSource).not.toContain('documentStableId');
  });

  it('shows the complete Pending roll-forward formula without claiming external confirmation', () => {
    expect(panelSource).toContain('Opening Pending');
    expect(panelSource).toContain('Canonical Orders');
    expect(panelSource).toContain('Provider Statement');
    expect(panelSource).toContain('Authority adjustments');
    expect(panelSource).toContain('Actual payouts');
    expect(panelSource).toContain('Closing Pending');
    expect(panelSource).toContain(
      'not an externally confirmed bank/provider closing balance',
    );
  });

  it('surfaces coverage and negative/other movement warnings instead of hiding them', () => {
    expect(panelSource).toContain('Provider coverage incomplete');
    expect(panelSource).toContain('NEGATIVE_PENDING_BALANCE');
    expect(panelSource).toContain('OTHER_LEDGER_MOVEMENT_PRESENT');
    expect(panelSource).toContain('PAYOUT_DIRECTION_UNEXPECTED');
  });
});
