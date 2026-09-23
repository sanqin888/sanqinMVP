import type { AccountingFinancialProvider } from './accounting-contracts';
import type { AccountingBankCsvDepositRow } from './accounting-bank-csv';
import type {
  AccountingProviderPayoutBankMatchCandidate,
  AccountingProviderPayoutBankMatchDeposit,
} from './accounting-provider-payout-bank-match.contract';

export type ExistingProviderPayoutForBankMatch = {
  payoutStableId: string;
  provider: AccountingFinancialProvider;
  payoutDate: string;
  amountCents: number;
  providerReference: string | null;
  journalEntryStableId: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const NEARBY_DAYS = 3;

export function projectProviderPayoutBankMatches(params: {
  deposits: AccountingBankCsvDepositRow[];
  existingPayouts: ExistingProviderPayoutForBankMatch[];
}): AccountingProviderPayoutBankMatchDeposit[] {
  return params.deposits.map((deposit) => {
    const candidates = params.existingPayouts
      .filter((payout) => payout.amountCents === deposit.amountCents)
      .map((payout) => toCandidate(deposit, payout))
      .filter((candidate) => candidate.dateDistanceDays <= NEARBY_DAYS)
      .sort(compareCandidates);

    const exact = candidates.filter(
      (candidate) =>
        candidate.dateDistanceDays === 0 &&
        candidate.providerHintMatch !== false,
    );
    const status =
      exact.length === 1
        ? ('EXACT_EXISTING_PAYOUT' as const)
        : exact.length > 1
          ? ('AMBIGUOUS_EXISTING_PAYOUT' as const)
          : candidates.length > 0
            ? ('POSSIBLE_EXISTING_PAYOUT' as const)
            : ('UNMATCHED' as const);

    return {
      ...deposit,
      status,
      candidates,
    };
  });
}

function toCandidate(
  deposit: AccountingBankCsvDepositRow,
  payout: ExistingProviderPayoutForBankMatch,
): AccountingProviderPayoutBankMatchCandidate {
  return {
    ...payout,
    dateDistanceDays: dateDistanceDays(deposit.occurredOn, payout.payoutDate),
    providerHintMatch:
      deposit.providerHint === null
        ? null
        : deposit.providerHint === payout.provider,
  };
}

function compareCandidates(
  left: AccountingProviderPayoutBankMatchCandidate,
  right: AccountingProviderPayoutBankMatchCandidate,
): number {
  const leftHint =
    left.providerHintMatch === true
      ? 0
      : left.providerHintMatch === null
        ? 1
        : 2;
  const rightHint =
    right.providerHintMatch === true
      ? 0
      : right.providerHintMatch === null
        ? 1
        : 2;
  if (leftHint !== rightHint) return leftHint - rightHint;
  if (left.dateDistanceDays !== right.dateDistanceDays) {
    return left.dateDistanceDays - right.dateDistanceDays;
  }
  return left.payoutStableId.localeCompare(right.payoutStableId);
}

function dateDistanceDays(left: string, right: string): number {
  const leftMs = Date.parse(`${left}T00:00:00.000Z`);
  const rightMs = Date.parse(`${right}T00:00:00.000Z`);
  if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs)) {
    throw new Error('Provider payout bank match received an invalid date');
  }
  return Math.abs(Math.round((leftMs - rightMs) / DAY_MS));
}
