import { AccountingFinancialProvider } from './accounting-contracts';
import { projectProviderPayoutBankMatches } from './accounting-provider-payout-bank-match.policy';

describe('Provider payout bank match policy', () => {
  const deposit = {
    rowNumber: 2,
    occurredOn: '2026-06-09',
    amountCents: 28448,
    description: 'UBER EATS PAYOUT',
    providerHint: AccountingFinancialProvider.UBER_EATS,
  };

  it('recognizes exactly one same-date same-amount existing payout', () => {
    const [match] = projectProviderPayoutBankMatches({
      deposits: [deposit],
      existingPayouts: [
        {
          payoutStableId: 'payout_uber_1',
          provider: AccountingFinancialProvider.UBER_EATS,
          payoutDate: '2026-06-09',
          amountCents: 28448,
          providerReference: null,
          journalEntryStableId: 'journal_1',
        },
      ],
    });

    expect(match).toMatchObject({
      status: 'EXACT_EXISTING_PAYOUT',
      candidates: [
        {
          payoutStableId: 'payout_uber_1',
          dateDistanceDays: 0,
          providerHintMatch: true,
        },
      ],
    });
  });

  it('does not hide duplicate exact payout candidates', () => {
    const [match] = projectProviderPayoutBankMatches({
      deposits: [deposit],
      existingPayouts: [
        {
          payoutStableId: 'payout_a',
          provider: AccountingFinancialProvider.UBER_EATS,
          payoutDate: '2026-06-09',
          amountCents: 28448,
          providerReference: null,
          journalEntryStableId: 'journal_a',
        },
        {
          payoutStableId: 'payout_b',
          provider: AccountingFinancialProvider.UBER_EATS,
          payoutDate: '2026-06-09',
          amountCents: 28448,
          providerReference: null,
          journalEntryStableId: 'journal_b',
        },
      ],
    });

    expect(match.status).toBe('AMBIGUOUS_EXISTING_PAYOUT');
    expect(match.candidates).toHaveLength(2);
  });

  it('does not call a same-day wrong-provider candidate exact when the bank description identifies the provider', () => {
    const [match] = projectProviderPayoutBankMatches({
      deposits: [deposit],
      existingPayouts: [
        {
          payoutStableId: 'payout_clover_same_day',
          provider: AccountingFinancialProvider.CLOVER,
          payoutDate: '2026-06-09',
          amountCents: 28448,
          providerReference: null,
          journalEntryStableId: 'journal_clover',
        },
      ],
    });

    expect(match).toMatchObject({
      status: 'POSSIBLE_EXISTING_PAYOUT',
      candidates: [
        {
          payoutStableId: 'payout_clover_same_day',
          providerHintMatch: false,
          dateDistanceDays: 0,
        },
      ],
    });
  });

  it('offers same-amount payouts only within a three-day window without auto-resolving them', () => {
    const [match] = projectProviderPayoutBankMatches({
      deposits: [deposit],
      existingPayouts: [
        {
          payoutStableId: 'payout_nearby',
          provider: AccountingFinancialProvider.UBER_EATS,
          payoutDate: '2026-06-11',
          amountCents: 28448,
          providerReference: 'nearby',
          journalEntryStableId: 'journal_nearby',
        },
        {
          payoutStableId: 'payout_too_far',
          provider: AccountingFinancialProvider.UBER_EATS,
          payoutDate: '2026-06-20',
          amountCents: 28448,
          providerReference: 'far',
          journalEntryStableId: 'journal_far',
        },
      ],
    });

    expect(match.status).toBe('POSSIBLE_EXISTING_PAYOUT');
    expect(match.candidates).toEqual([
      expect.objectContaining({
        payoutStableId: 'payout_nearby',
        dateDistanceDays: 2,
      }),
    ]);
  });

  it('leaves an unmatched bank deposit as evidence rather than creating a payout', () => {
    const [match] = projectProviderPayoutBankMatches({
      deposits: [deposit],
      existingPayouts: [],
    });

    expect(match).toMatchObject({
      status: 'UNMATCHED',
      candidates: [],
    });
  });
});
