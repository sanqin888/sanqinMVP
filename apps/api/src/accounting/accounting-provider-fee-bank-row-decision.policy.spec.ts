import { AccountingFinancialProvider } from './accounting-contracts';
import {
  AccountingProviderFeeBankRowDecisionPolicyError,
  buildProviderFeeBankRowDecisionDrafts,
  providerFeeBankRowDecisionStableId,
  providerFeeBankRowFingerprint,
} from './accounting-provider-fee-bank-row-decision.policy';

const withdrawals = [
  {
    rowNumber: 4,
    occurredOn: '2026-06-17',
    amountCents: 3390,
    description: 'FIRST DATA CANADA(K)',
    providerHint: AccountingFinancialProvider.CLOVER,
  },
  {
    rowNumber: 9,
    occurredOn: '2026-06-29',
    amountCents: 185,
    description: 'FIRST DATA CANADA(K)',
    providerHint: AccountingFinancialProvider.CLOVER,
  },
];

describe('Provider fee bank row decision policy', () => {
  it('persists only explicit include/exclude decisions over Clover withdrawal evidence', () => {
    const drafts = buildProviderFeeBankRowDecisionDrafts({
      artifactStableId: 'artifact_cibc_june',
      storeStableId: '4750_Yonge_Street',
      bankAccountStableId: 'account_cibc',
      withdrawals,
      includedRowNumbers: [4],
    });

    expect(drafts.map((draft) => draft.decision)).toEqual([
      'READY_FOR_CLEARING',
      'EXCLUDED',
    ]);
    expect(drafts[0]?.decisionStableId).toBe(
      providerFeeBankRowDecisionStableId({
        artifactStableId: 'artifact_cibc_june',
        rowNumber: 4,
        storeStableId: '4750_Yonge_Street',
        bankAccountStableId: 'account_cibc',
      }),
    );
    expect(drafts[0]?.rowFingerprint).toBe(
      providerFeeBankRowFingerprint(withdrawals[0]),
    );
  });

  it('rejects row numbers outside the authoritative Clover withdrawal projection', () => {
    expect(() =>
      buildProviderFeeBankRowDecisionDrafts({
        artifactStableId: 'artifact_cibc_june',
        storeStableId: '4750_Yonge_Street',
        bankAccountStableId: 'account_cibc',
        withdrawals,
        includedRowNumbers: [99],
      }),
    ).toThrow(AccountingProviderFeeBankRowDecisionPolicyError);
  });
});
