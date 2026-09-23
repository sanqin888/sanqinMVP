import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const payoutPanelSource = readFileSync(
  resolve(__dirname, 'provider-payout-panel.tsx'),
  'utf8',
);
const matchPanelSource = readFileSync(
  resolve(__dirname, 'provider-payout-bank-match-panel.tsx'),
  'utf8',
);

describe('PAYOUT-E-A bank CSV payout match preview UI', () => {
  it('keeps bank evidence preview inside the payout surface but separate from posting', () => {
    expect(payoutPanelSource).toContain('<ProviderPayoutBankMatchPanel');
    expect(matchPanelSource).toContain("'/accounting/inbox/artifacts'");
    expect(matchPanelSource).toContain(
      '/accounting/provider-payouts/bank-match-preview?',
    );
    expect(matchPanelSource).toContain(
      'artifact.duplicateOfArtifactStableId ?? artifact.artifactStableId',
    );
    expect(matchPanelSource).not.toContain("'/accounting/provider-payouts',");
  });

  it('states the strong bank signature and no-auto-post boundary', () => {
    expect(matchPanelSource).toContain('Withdrawals / Deposits');
    expect(matchPanelSource).toContain('Funds Out / Funds In');
    expect(matchPanelSource).toContain(
      'PAYOUT-E-A never creates a canonical payout automatically',
    );
  });

  it('surfaces exact, ambiguous, possible, unmatched, and invalid evidence', () => {
    expect(matchPanelSource).toContain('EXACT_EXISTING_PAYOUT');
    expect(matchPanelSource).toContain('AMBIGUOUS_EXISTING_PAYOUT');
    expect(matchPanelSource).toContain('POSSIBLE_EXISTING_PAYOUT');
    expect(matchPanelSource).toContain('UNMATCHED');
    expect(matchPanelSource).toContain('invalidRowCount');
    expect(matchPanelSource).toContain('Provider hint');
  });

  it('lets an operator exclude a bank row from this settlement preview without deleting evidence', () => {
    expect(matchPanelSource).toContain('excludedRowNumbers');
    expect(matchPanelSource).toContain('Included this settlement');
    expect(matchPanelSource).toContain('Manually excluded');
    expect(matchPanelSource).toContain(
      'Ordinary bank deposits with neither a provider hint nor an existing payout candidate start excluded by default',
    );
    expect(matchPanelSource).toContain('clearing Include');
    expect(matchPanelSource).toContain(
      'It never edits or deletes the original bank evidence',
    );
    expect(matchPanelSource).toContain(
      'durable reconciliation decisions remain E-B scope',
    );
  });
});
