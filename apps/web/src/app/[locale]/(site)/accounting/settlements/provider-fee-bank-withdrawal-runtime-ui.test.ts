import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const panelSource = readFileSync(
  resolve(__dirname, 'provider-fee-bank-withdrawal-panel.tsx'),
  'utf8',
);
const payoutPanelSource = readFileSync(
  resolve(__dirname, 'provider-payout-panel.tsx'),
  'utf8',
);

describe('Clover fee bank withdrawal clearing runtime UI', () => {
  it('mounts a separate fee-withdrawal clearing surface inside Provider settlements', () => {
    expect(payoutPanelSource).toContain('ProviderFeeBankWithdrawalPanel');
    expect(panelSource).toContain('Clover 费用银行扣款 · 应付清算');
  });

  it('consumes only reviewed bank CSV evidence and never creates an ExpenseDocument', () => {
    expect(panelSource).toContain("item.status === 'CONFIRMED'");
    expect(panelSource).toContain("item.classification === 'OTHER_DOCUMENT'");
    expect(panelSource).toContain("item.kind === 'CSV'");
    expect(panelSource).toContain(
      '/accounting/provider-fees/bank-withdrawal-preview?',
    );
    expect(panelSource).not.toContain('/accounting/expenses');
  });

  it('requires explicit durable scope confirmation before each real clearing action', () => {
    expect(panelSource).toContain(
      '/accounting/provider-fees/bank-row-decisions/confirm',
    );
    expect(panelSource).toContain(
      '/accounting/provider-fees/from-bank-row-decision',
    );
    expect(panelSource).toContain('READY_FOR_CLEARING');
    expect(panelSource).toContain('确认银行扣款并清算');
  });

  it('shows the current canonical Clover fee payable and refreshes it through Trial Balance', () => {
    expect(panelSource).toContain('当前 Clover 费用应付');
    expect(panelSource).toContain(
      '/accounting/report/trial-balance?currency=CAD',
    );
    expect(panelSource).toContain('account_clover_fee_payable');
    expect(panelSource).toContain('closingCreditBalanceCents');
  });

  it('states the liability-to-bank accounting semantics without duplicate expense recognition', () => {
    expect(panelSource).toContain(
      'Dr Clover 费用应付 / Cr 银行，不会再次生成费用',
    );
  });
});
