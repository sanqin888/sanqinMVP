import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';

import { AccountingJournalPolicyError } from './accounting-journal-policy';
import type {
  AccountingOpeningReceivableFactV1,
  CreateAccountingOpeningReceivableInputV1,
} from './accounting-opening-receivable.contract';

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TEXT_LENGTH = 500;

const requireValue = (
  raw: unknown,
  field: string,
  maxLength = MAX_TEXT_LENGTH,
): string => {
  if (typeof raw !== 'string') {
    throw new AccountingJournalPolicyError(`${field} must be a string`);
  }
  const value = raw.trim();
  if (!value) throw new AccountingJournalPolicyError(`${field} is required`);
  if (value.length > maxLength) {
    throw new AccountingJournalPolicyError(
      `${field} must not exceed ${maxLength} characters`,
    );
  }
  return value;
};

const optionalValue = (
  raw: unknown,
  field: string,
  maxLength = MAX_TEXT_LENGTH,
): string | null => {
  if (raw == null) return null;
  if (typeof raw !== 'string') {
    throw new AccountingJournalPolicyError(`${field} must be a string`);
  }
  const value = raw.trim();
  if (!value) return null;
  if (value.length > maxLength) {
    throw new AccountingJournalPolicyError(
      `${field} must not exceed ${maxLength} characters`,
    );
  }
  return value;
};

const requireDateOnly = (raw: string, field: string): string => {
  const value = requireValue(raw, field, 10);
  const parsed = DateTime.fromISO(value, { zone: 'UTC' });
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !parsed.isValid ||
    parsed.toISODate() !== value
  ) {
    throw new AccountingJournalPolicyError(
      `${field} must be a valid ISO date-only value`,
    );
  }
  return value;
};

const requireCad = (raw?: string): 'CAD' => {
  const currency = raw?.trim().toUpperCase() || 'CAD';
  if (currency !== 'CAD') {
    throw new AccountingJournalPolicyError(
      'Opening Receivable v1 currently requires CAD currency',
    );
  }
  return 'CAD';
};

export const normalizeAccountingOpeningReceivable = (
  input: CreateAccountingOpeningReceivableInputV1,
  openingDateRaw: string,
): AccountingOpeningReceivableFactV1 => {
  const requestId = requireValue(
    input.requestId,
    'requestId',
    64,
  ).toLowerCase();
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    throw new AccountingJournalPolicyError('requestId must be a UUID');
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new AccountingJournalPolicyError(
      'amountCents must be a positive safe integer',
    );
  }

  return {
    version: 1,
    openingReceivableStableId: `openingrecv_${requestId.replaceAll('-', '')}`,
    storeStableId: requireValue(input.storeStableId, 'storeStableId', 200),
    openingDate: requireDateOnly(openingDateRaw, 'openingDate'),
    counterpartyName: requireValue(
      input.counterpartyName,
      'counterpartyName',
      200,
    ),
    reference: optionalValue(input.reference, 'reference', 200),
    amountCents: input.amountCents,
    currency: requireCad(input.currency),
    note: optionalValue(input.note, 'note'),
  };
};

export const hashAccountingOpeningReceivableFact = (
  fact: AccountingOpeningReceivableFactV1,
): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        version: fact.version,
        openingReceivableStableId: fact.openingReceivableStableId,
        storeStableId: fact.storeStableId,
        openingDate: fact.openingDate,
        counterpartyName: fact.counterpartyName,
        reference: fact.reference,
        amountCents: fact.amountCents,
        currency: fact.currency,
        note: fact.note,
      }),
    )
    .digest('hex');
