import { createHash } from 'node:crypto';

import { ACCOUNTING_BANK_CSV_PARSER_VERSION } from './accounting-bank-csv';
import type {
  AccountingProviderPayoutBankRowDecisionDraft,
  AccountingProviderPayoutBankRowDecisionPolicyInput,
} from './accounting-provider-payout-bank-row-decision.contract';

export class AccountingProviderPayoutBankRowDecisionPolicyError extends Error {}

const hash = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

export function providerPayoutBankRowFingerprint(input: {
  rowNumber: number;
  occurredOn: string;
  amountCents: number;
  description: string | null;
  providerHint: string | null;
}): string {
  return hash(
    JSON.stringify({
      parserVersion: ACCOUNTING_BANK_CSV_PARSER_VERSION,
      rowNumber: input.rowNumber,
      occurredOn: input.occurredOn,
      amountCents: input.amountCents,
      description: input.description,
      providerHint: input.providerHint,
    }),
  );
}

export function providerPayoutBankRowDecisionStableId(input: {
  artifactStableId: string;
  rowNumber: number;
  storeStableId: string;
  destinationBankAccountStableId: string;
}): string {
  const digest = hash(
    [
      'accounting.provider_payout_bank_row_decision.v1',
      input.artifactStableId,
      String(input.rowNumber),
      input.storeStableId,
      input.destinationBankAccountStableId,
    ].join('|'),
  );
  return `bankrow_${digest.slice(0, 32)}`;
}

export function buildProviderPayoutBankRowDecisionDrafts(
  input: AccountingProviderPayoutBankRowDecisionPolicyInput,
): AccountingProviderPayoutBankRowDecisionDraft[] {
  const included = new Set<number>();
  for (const rowNumber of input.includedRowNumbers) {
    if (!Number.isSafeInteger(rowNumber) || rowNumber < 1) {
      throw new AccountingProviderPayoutBankRowDecisionPolicyError(
        'includedRowNumbers must contain positive integers',
      );
    }
    if (included.has(rowNumber)) {
      throw new AccountingProviderPayoutBankRowDecisionPolicyError(
        `Bank row ${rowNumber} is included more than once`,
      );
    }
    included.add(rowNumber);
  }

  const depositByRow = new Map(
    input.deposits.map((deposit) => [deposit.rowNumber, deposit]),
  );
  for (const rowNumber of included) {
    if (!depositByRow.has(rowNumber)) {
      throw new AccountingProviderPayoutBankRowDecisionPolicyError(
        `Bank row ${rowNumber} is not a recognized deposit row`,
      );
    }
  }

  return input.deposits.map((deposit) => {
    let decision: AccountingProviderPayoutBankRowDecisionDraft['decision'] =
      'EXCLUDED';
    let matchedPayoutStableId: string | null = null;

    if (included.has(deposit.rowNumber)) {
      if (deposit.status === 'EXACT_EXISTING_PAYOUT') {
        if (deposit.candidates.length !== 1) {
          throw new AccountingProviderPayoutBankRowDecisionPolicyError(
            `Bank row ${deposit.rowNumber} does not have exactly one existing payout match`,
          );
        }
        decision = 'MATCH_EXISTING_PAYOUT';
        matchedPayoutStableId = deposit.candidates[0].payoutStableId;
      } else if (deposit.status === 'UNMATCHED' && deposit.providerHint) {
        decision = 'READY_FOR_POSTING';
      } else if (deposit.status === 'UNMATCHED') {
        throw new AccountingProviderPayoutBankRowDecisionPolicyError(
          `Bank row ${deposit.rowNumber} has no provider hint and cannot be prepared for provider payout posting`,
        );
      } else {
        throw new AccountingProviderPayoutBankRowDecisionPolicyError(
          `Bank row ${deposit.rowNumber} has an unresolved existing payout candidate and must be excluded or resolved before confirmation`,
        );
      }
    }

    return {
      decisionStableId: providerPayoutBankRowDecisionStableId({
        artifactStableId: input.artifactStableId,
        rowNumber: deposit.rowNumber,
        storeStableId: input.storeStableId,
        destinationBankAccountStableId: input.destinationBankAccountStableId,
      }),
      rowNumber: deposit.rowNumber,
      rowFingerprint: providerPayoutBankRowFingerprint(deposit),
      occurredOn: deposit.occurredOn,
      amountCents: deposit.amountCents,
      description: deposit.description,
      providerHint: deposit.providerHint,
      decision,
      matchedPayoutStableId,
    };
  });
}
