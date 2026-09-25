import { createHash } from 'node:crypto';

import { ACCOUNTING_BANK_CSV_PARSER_VERSION } from './accounting-bank-csv';
import type {
  AccountingProviderFeeBankRowDecisionKind,
  AccountingProviderFeeBankWithdrawalView,
} from './accounting-provider-fee-bank-row-decision.contract';

export class AccountingProviderFeeBankRowDecisionPolicyError extends Error {}

const hash = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

export const providerFeeBankRowFingerprint = (
  row: AccountingProviderFeeBankWithdrawalView,
): string =>
  hash(
    JSON.stringify({
      parserVersion: ACCOUNTING_BANK_CSV_PARSER_VERSION,
      direction: 'WITHDRAWAL',
      rowNumber: row.rowNumber,
      occurredOn: row.occurredOn,
      amountCents: row.amountCents,
      description: row.description,
      providerHint: row.providerHint,
    }),
  );

export const providerFeeBankRowDecisionStableId = (input: {
  artifactStableId: string;
  rowNumber: number;
  storeStableId: string;
  bankAccountStableId: string;
}): string =>
  `feebankrow_${hash(
    [
      'accounting.provider_fee_bank_row_decision.v1',
      input.artifactStableId,
      String(input.rowNumber),
      input.storeStableId,
      input.bankAccountStableId,
    ].join('|'),
  ).slice(0, 32)}`;

export function buildProviderFeeBankRowDecisionDrafts(input: {
  artifactStableId: string;
  storeStableId: string;
  bankAccountStableId: string;
  withdrawals: AccountingProviderFeeBankWithdrawalView[];
  includedRowNumbers: number[];
}) {
  const included = new Set<number>();
  for (const rowNumber of input.includedRowNumbers) {
    if (!Number.isSafeInteger(rowNumber) || rowNumber < 1) {
      throw new AccountingProviderFeeBankRowDecisionPolicyError(
        'includedRowNumbers must contain positive integers',
      );
    }
    if (included.has(rowNumber)) {
      throw new AccountingProviderFeeBankRowDecisionPolicyError(
        `Bank withdrawal row ${rowNumber} is included more than once`,
      );
    }
    included.add(rowNumber);
  }

  const byRow = new Map(input.withdrawals.map((row) => [row.rowNumber, row]));
  for (const rowNumber of included) {
    const row = byRow.get(rowNumber);
    if (!row) {
      throw new AccountingProviderFeeBankRowDecisionPolicyError(
        `Bank withdrawal row ${rowNumber} is not a recognized Clover fee withdrawal`,
      );
    }
    if (row.providerHint !== 'CLOVER') {
      throw new AccountingProviderFeeBankRowDecisionPolicyError(
        `Bank withdrawal row ${rowNumber} is not Clover-authoritative`,
      );
    }
  }

  return input.withdrawals.map((row) => {
    const decision: AccountingProviderFeeBankRowDecisionKind = included.has(
      row.rowNumber,
    )
      ? 'READY_FOR_CLEARING'
      : 'EXCLUDED';
    return {
      decisionStableId: providerFeeBankRowDecisionStableId({
        artifactStableId: input.artifactStableId,
        rowNumber: row.rowNumber,
        storeStableId: input.storeStableId,
        bankAccountStableId: input.bankAccountStableId,
      }),
      rowNumber: row.rowNumber,
      rowFingerprint: providerFeeBankRowFingerprint(row),
      occurredOn: row.occurredOn,
      amountCents: row.amountCents,
      description: row.description,
      providerHint: row.providerHint,
      decision,
    };
  });
}
