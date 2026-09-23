import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const inboxPageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');
const inboxListSource = readFileSync(
  resolve(__dirname, 'inbox-items-list.tsx'),
  'utf8',
);
const bankReviewSource = readFileSync(
  resolve(__dirname, 'bank-csv-review-panel.tsx'),
  'utf8',
);
const payoutPanelSource = readFileSync(
  resolve(__dirname, '../settlements/provider-payout-panel.tsx'),
  'utf8',
);

describe('PAYOUT-E-A Inbox bank CSV review UI', () => {
  it('keeps Accounting Inbox as the only file-upload surface', () => {
    expect(inboxPageSource).toContain("'/accounting/inbox/artifacts'");
    expect(inboxPageSource).toContain('type="file"');
    expect(bankReviewSource).not.toContain("'/accounting/inbox/artifacts'");
    expect(bankReviewSource).not.toContain('type="file"');
    expect(payoutPanelSource).not.toContain('ProviderPayoutBankMatchPanel');
  });

  it('places bank payout matching inside Inbox review rather than Settlements', () => {
    expect(inboxListSource).toContain('Preview bank receipts');
    expect(inboxPageSource).toContain('<AccountingInboxBankCsvReviewPanel');
    expect(bankReviewSource).toContain(
      '/accounting/provider-payouts/bank-match-preview?',
    );
    expect(bankReviewSource).toContain('item.artifact.artifactStableId');
    expect(bankReviewSource).toContain(
      'mark the evidence reviewed before continuing to Provider settlements',
    );
  });

  it('labels OTHER_DOCUMENT for bank statements without changing persistence classification', () => {
    expect(inboxListSource).toContain('银行流水 / 其他资料');
    expect(inboxListSource).toContain('Bank statement / other evidence');
    expect(inboxListSource).toContain('value="OTHER_DOCUMENT"');
  });

  it('surfaces matching states and session-only exclusion controls', () => {
    expect(bankReviewSource).toContain('EXACT_EXISTING_PAYOUT');
    expect(bankReviewSource).toContain('AMBIGUOUS_EXISTING_PAYOUT');
    expect(bankReviewSource).toContain('POSSIBLE_EXISTING_PAYOUT');
    expect(bankReviewSource).toContain('UNMATCHED');
    expect(bankReviewSource).toContain('excludedRowNumbers');
    expect(bankReviewSource).toContain('Provider hint');
    expect(bankReviewSource).toContain('This does not edit the original CSV');
  });
});
