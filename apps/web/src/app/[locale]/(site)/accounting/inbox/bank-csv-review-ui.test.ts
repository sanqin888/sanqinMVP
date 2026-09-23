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
const settlementBankSource = readFileSync(
  resolve(
    __dirname,
    '../settlements/provider-payout-settlement-bank-csv-panel.tsx',
  ),
  'utf8',
);

describe('PAYOUT-E-A bank CSV evidence / settlement ownership UI', () => {
  it('keeps Accounting Inbox as the only file-upload surface', () => {
    expect(inboxPageSource).toContain("'/accounting/inbox/artifacts'");
    expect(inboxPageSource).toContain('type="file"');
    expect(bankReviewSource).not.toContain("'/accounting/inbox/artifacts'");
    expect(bankReviewSource).not.toContain('type="file"');
    expect(settlementBankSource).not.toContain("'/accounting/inbox/artifacts'");
    expect(settlementBankSource).not.toContain('type="file"');
  });

  it('keeps evidence preview in Inbox without settlement include/exclude decisions', () => {
    expect(inboxListSource).toContain('Preview bank receipts');
    expect(inboxPageSource).toContain('<AccountingInboxBankCsvReviewPanel');
    expect(bankReviewSource).toContain(
      '/accounting/provider-payouts/bank-match-preview?',
    );
    expect(bankReviewSource).toContain('item.artifact.artifactStableId');
    expect(bankReviewSource).toContain(
      'Include/exclude decisions belong to Provider settlements',
    );
    expect(bankReviewSource).not.toContain('excludedRowNumbers');
    expect(bankReviewSource).not.toContain('type="checkbox"');
  });

  it('labels OTHER_DOCUMENT for bank statements without changing persistence classification', () => {
    expect(inboxListSource).toContain('银行流水 / 其他资料');
    expect(inboxListSource).toContain('Bank statement / other evidence');
    expect(inboxListSource).toContain('value="OTHER_DOCUMENT"');
  });

  it('moves settlement include/exclude and posting handoff to Settlements', () => {
    expect(payoutPanelSource).toContain('<ProviderPayoutSettlementBankCsvPanel');
    expect(settlementBankSource).toContain("item.status === 'CONFIRMED'");
    expect(settlementBankSource).toContain(
      "item.classification === 'OTHER_DOCUMENT'",
    );
    expect(settlementBankSource).toContain(
      '/accounting/inbox/manual-uploads?limit=200',
    );
    expect(settlementBankSource).toContain('excludedRowNumbers');
    expect(settlementBankSource).toContain('UNMATCHED');
    expect(settlementBankSource).toContain('Use for posting');
    expect(settlementBankSource).toContain('Already posted');
    expect(settlementBankSource).toContain(
      "deposit.status === 'UNMATCHED'",
    );
    expect(payoutPanelSource).toContain(
      'The unmatched bank deposit was copied into the form',
    );
  });
});
