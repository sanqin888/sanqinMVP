import { AccountingFinancialProvider } from './accounting-contracts';
import {
  AccountingProviderPayoutBankRowDecisionPolicyError,
  buildProviderPayoutBankRowDecisionDrafts,
  providerPayoutBankRowDecisionStableId,
  providerPayoutBankRowFingerprint,
} from './accounting-provider-payout-bank-row-decision.policy';

const deposit = (
  overrides: Partial<{
    rowNumber: number;
    occurredOn: string;
    amountCents: number;
    description: string | null;
    providerHint: AccountingFinancialProvider | null;
    status:
      | 'EXACT_EXISTING_PAYOUT'
      | 'AMBIGUOUS_EXISTING_PAYOUT'
      | 'POSSIBLE_EXISTING_PAYOUT'
      | 'UNMATCHED';
    candidates: Array<{
      payoutStableId: string;
      provider: AccountingFinancialProvider;
      payoutDate: string;
      amountCents: number;
      providerReference: string | null;
      journalEntryStableId: string | null;
      dateDistanceDays: number;
      providerHintMatch: boolean | null;
    }>;
  }> = {},
) => ({
  rowNumber: 10,
  occurredOn: '2026-06-10',
  amountCents: 86057,
  description: 'FANTUAN',
  providerHint: AccountingFinancialProvider.FANTUAN,
  status: 'UNMATCHED' as const,
  candidates: [],
  ...overrides,
});

describe('provider payout bank row decision policy', () => {
  const base = {
    artifactStableId: 'acctart_bank_1',
    storeStableId: '4750_Yonge_Street',
    destinationBankAccountStableId: 'account_cibc',
  };

  it('derives durable decisions only from the current preview and explicit included rows', () => {
    const drafts = buildProviderPayoutBankRowDecisionDrafts({
      ...base,
      deposits: [
        deposit({
          rowNumber: 9,
          occurredOn: '2026-06-09',
          amountCents: 28448,
          description: 'UBER',
          providerHint: AccountingFinancialProvider.UBER_EATS,
          status: 'EXACT_EXISTING_PAYOUT',
          candidates: [
            {
              payoutStableId: 'payout_uber',
              provider: AccountingFinancialProvider.UBER_EATS,
              payoutDate: '2026-06-09',
              amountCents: 28448,
              providerReference: null,
              journalEntryStableId: 'journal_uber',
              dateDistanceDays: 0,
              providerHintMatch: true,
            },
          ],
        }),
        deposit({ rowNumber: 10 }),
        deposit({
          rowNumber: 11,
          description: 'MOBILE DEPOSIT',
          providerHint: null,
        }),
      ],
      includedRowNumbers: [9, 10],
    });

    expect(drafts).toEqual([
      expect.objectContaining({
        rowNumber: 9,
        decision: 'MATCH_EXISTING_PAYOUT',
        matchedPayoutStableId: 'payout_uber',
      }),
      expect.objectContaining({
        rowNumber: 10,
        decision: 'READY_FOR_POSTING',
        matchedPayoutStableId: null,
      }),
      expect.objectContaining({
        rowNumber: 11,
        decision: 'EXCLUDED',
        matchedPayoutStableId: null,
      }),
    ]);
  });

  it('fails closed when unresolved or provider-less deposits are included', () => {
    expect(() =>
      buildProviderPayoutBankRowDecisionDrafts({
        ...base,
        deposits: [
          deposit({
            status: 'POSSIBLE_EXISTING_PAYOUT',
            candidates: [
              {
                payoutStableId: 'payout_possible',
                provider: AccountingFinancialProvider.FANTUAN,
                payoutDate: '2026-06-11',
                amountCents: 86057,
                providerReference: null,
                journalEntryStableId: 'journal_possible',
                dateDistanceDays: 1,
                providerHintMatch: true,
              },
            ],
          }),
        ],
        includedRowNumbers: [10],
      }),
    ).toThrow(AccountingProviderPayoutBankRowDecisionPolicyError);

    expect(() =>
      buildProviderPayoutBankRowDecisionDrafts({
        ...base,
        deposits: [deposit({ providerHint: null })],
        includedRowNumbers: [10],
      }),
    ).toThrow('has no provider hint');
  });

  it('uses deterministic scope identity while fingerprint binds current row facts', () => {
    expect(
      providerPayoutBankRowDecisionStableId({
        ...base,
        rowNumber: 10,
      }),
    ).toBe(
      providerPayoutBankRowDecisionStableId({
        ...base,
        rowNumber: 10,
      }),
    );
    expect(
      providerPayoutBankRowFingerprint(deposit({ rowNumber: 10 })),
    ).not.toBe(
      providerPayoutBankRowFingerprint(
        deposit({ rowNumber: 10, amountCents: 86058 }),
      ),
    );
  });
});
