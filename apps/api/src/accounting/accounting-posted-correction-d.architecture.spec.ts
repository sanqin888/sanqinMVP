import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (name: string) =>
  readFileSync(resolve(__dirname, name), 'utf8');

const readModelSource = read('accounting-posted-correction-read-model.ts');
const providerAdapterSource = read(
  'accounting-provider-settlement-correction.adapter.ts',
);
const expenseAdapterSource = read('accounting-expense-correction.adapter.ts');
const providerServiceSource = read(
  'accounting-provider-settlement-correction.service.ts',
);
const expenseServiceSource = read('accounting-expense-correction.service.ts');
const platformAnalyticsSource = read('accounting-platform-analytics.service.ts');
const expenseQuerySource = read('accounting-expense.query.ts');
const trialBalanceSource = read('accounting-trial-balance.service.ts');
const balanceMovementSource = read('accounting-balance-movement.service.ts');
const financialReportsSource = read('accounting-financial-reports.service.ts');

describe('Correction-D current-effective read-model architecture', () => {
  it('owns one common POSTED authority selector and history serialization', () => {
    expect(readModelSource).toContain(
      'readAccountingPostedCorrectionProjections',
    );
    expect(readModelSource).toContain('readAccountingPostedCorrectionHistories');
    expect(readModelSource).toContain('latestPostedAuthority');
    expect(readModelSource).toContain('readyRevision.targetAuthorityHash');
    expect(readModelSource).toContain(
      'POSTED correction is missing consistent typed current-effective authority',
    );
  });

  it('makes owner adapters consume one latest-POSTED projection', () => {
    for (const source of [providerAdapterSource, expenseAdapterSource]) {
      expect(source).toContain('readAccountingPostedCorrectionProjections');
      expect(source).toContain('accountingPostedCorrectionTargetKey');
      expect(source).not.toContain('accountingCorrectionCase.findFirst');
    }
  });

  it('makes Provider and Expense history consume one read-model', () => {
    for (const source of [providerServiceSource, expenseServiceSource]) {
      expect(source).toContain('readAccountingPostedCorrectionHistories');
      expect(source).toContain('accountingPostedCorrectionTargetKey');
      expect(source).not.toContain('CORRECTION_HISTORY_SELECT');
    }
  });

  it('cuts Provider Platform Analytics to corrected current-effective Provider authority', () => {
    expect(platformAnalyticsSource).toContain(
      'readAccountingPostedCorrectionProjections',
    );
    expect(platformAnalyticsSource).toContain('currentEffectiveLines');
    expect(platformAnalyticsSource).toContain(
      'ACCOUNTING_PROVIDER_SETTLEMENT_CORRECTION_TARGET_SCHEMA',
    );
    expect(platformAnalyticsSource).toContain(
      'hashProviderSettlementCorrectionTarget',
    );
  });

  it('keeps original Expense facts separate from current-effective values', () => {
    expect(expenseQuerySource).toContain('originalPersisted');
    expect(expenseQuerySource).toContain('currentEffective');
    expect(expenseQuerySource).toContain('POSTED_CORRECTION');
    expect(expenseQuerySource).toContain(
      'requiresCurrentEffectiveFiltering',
    );
    expect(expenseQuerySource).toContain(
      'readAccountingPostedCorrectionProjections',
    );
  });

  it('does not add correction business-target overlays to Journal-native financial reports', () => {
    for (const source of [
      trialBalanceSource,
      balanceMovementSource,
      financialReportsSource,
    ]) {
      expect(source).not.toContain('accounting-posted-correction-read-model');
      expect(source).not.toContain('AccountingCorrectionCase');
      expect(source).not.toContain('latestPostedAuthority');
    }
    expect(balanceMovementSource).toContain('AccountingTrialBalanceService');
  });
});
