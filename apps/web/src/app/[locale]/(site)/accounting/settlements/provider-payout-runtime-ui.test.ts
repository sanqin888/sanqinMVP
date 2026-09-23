import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');
const panelSource = readFileSync(
  resolve(__dirname, 'provider-payout-panel.tsx'),
  'utf8',
);

describe('PAYOUT-C provider payout runtime UI', () => {
  it('mounts the payout workflow inside Provider settlements without binding it to a statement', () => {
    expect(pageSource).toContain('<ProviderPayoutPanel');
    expect(panelSource).toContain("'/accounting/provider-payouts?limit=100'");
    expect(panelSource).toContain("'/accounting/provider-payouts'");
    expect(panelSource).not.toContain('documentStableId');
    expect(panelSource).not.toContain('periodStart');
    expect(panelSource).not.toContain('periodEnd');
  });

  it('requires explicit real-bank confirmation and only offers CAD BANK accounts', () => {
    expect(panelSource).toContain("account.type === 'BANK'");
    expect(panelSource).toContain("account.currency === 'CAD'");
    expect(panelSource).toContain('!confirmed');
    expect(panelSource).toContain(
      'A monthly statement “Net payout” does not replace this confirmation',
    );
  });

  it('keeps one client-generated stable ID across a retry until payout facts change', () => {
    expect(panelSource).toContain(
      'payoutStableId || `payout_${window.crypto.randomUUID()}`',
    );
    expect(panelSource).toContain(
      'if (!payoutStableId) setPayoutStableId(stableId)',
    );
    expect(panelSource).toContain("setPayoutStableId('')");
  });
});
