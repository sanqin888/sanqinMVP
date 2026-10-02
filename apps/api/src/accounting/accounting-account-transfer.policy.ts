import { DateTime } from 'luxon';

import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  AccountingJournalPolicyError,
  type AccountingJournalCreateInput,
} from './accounting-journal-policy';

export const ACCOUNT_TRANSFER_SOURCE_FACT_TYPE =
  'accounting.account_transfer.v1';
export const ACCOUNT_TRANSFER_SOURCE_FACT_VERSION = 1;

export const AccountingAccountTransferPurpose = {
  ACTUAL_TRANSFER: 'ACTUAL_TRANSFER',
  ACCOUNT_ATTRIBUTION_CORRECTION: 'ACCOUNT_ATTRIBUTION_CORRECTION',
} as const;

export type AccountingAccountTransferPurpose =
  (typeof AccountingAccountTransferPurpose)[keyof typeof AccountingAccountTransferPurpose];

export type AccountingAccountTransferInput = {
  requestId: string;
  fromAccountStableId: string;
  toAccountStableId: string;
  amountCents: number;
  transferDate: string;
  purpose: AccountingAccountTransferPurpose;
  note?: string | null;
};

export type NormalizedAccountingAccountTransfer = {
  requestId: string;
  transferStableId: string;
  fromAccountStableId: string;
  toAccountStableId: string;
  amountCents: number;
  transferDate: string;
  purpose: AccountingAccountTransferPurpose;
  note: string | null;
};

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requireValue = (raw: unknown, field: string): string => {
  if (typeof raw !== 'string') {
    throw new AccountingJournalPolicyError(`${field} must be a string`);
  }
  const value = raw.trim();
  if (!value) throw new AccountingJournalPolicyError(`${field} is required`);
  return value;
};

const normalizeNote = (raw?: string | null): string | null => {
  if (raw != null && typeof raw !== 'string') {
    throw new AccountingJournalPolicyError('note must be a string');
  }
  const note = raw?.trim() || null;
  if (note && note.length > 500) {
    throw new AccountingJournalPolicyError(
      'note must not exceed 500 characters',
    );
  }
  return note;
};

const normalizePurpose = (
  raw: AccountingAccountTransferPurpose,
): AccountingAccountTransferPurpose => {
  if (
    raw !== AccountingAccountTransferPurpose.ACTUAL_TRANSFER &&
    raw !== AccountingAccountTransferPurpose.ACCOUNT_ATTRIBUTION_CORRECTION
  ) {
    throw new AccountingJournalPolicyError(
      'Unsupported account transfer purpose',
    );
  }
  return raw;
};

const normalizeDateOnly = (raw: string): string => {
  const value = requireValue(raw, 'transferDate');
  const parsed = DateTime.fromISO(value, { zone: 'UTC' });
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !parsed.isValid ||
    parsed.toISODate() !== value
  ) {
    throw new AccountingJournalPolicyError(
      'transferDate must be a valid ISO date-only value',
    );
  }
  return value;
};

const transferOccurredAt = (
  transferDate: string,
  businessTimezone: string,
): string => {
  const timezone = requireValue(businessTimezone, 'businessTimezone');
  const local = DateTime.fromISO(transferDate, { zone: timezone }).startOf(
    'day',
  );
  const iso = local.toUTC().toISO();
  if (!local.isValid || !iso) {
    throw new AccountingJournalPolicyError(
      'transferDate/businessTimezone could not be resolved',
    );
  }
  return iso;
};

export const normalizeAccountingAccountTransfer = (
  input: AccountingAccountTransferInput,
): NormalizedAccountingAccountTransfer => {
  const requestId = requireValue(input.requestId, 'requestId');
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    throw new AccountingJournalPolicyError('requestId must be a UUID');
  }

  const fromAccountStableId = requireValue(
    input.fromAccountStableId,
    'fromAccountStableId',
  );
  const toAccountStableId = requireValue(
    input.toAccountStableId,
    'toAccountStableId',
  );
  if (fromAccountStableId === toAccountStableId) {
    throw new AccountingJournalPolicyError(
      'fromAccountStableId and toAccountStableId must be different',
    );
  }

  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new AccountingJournalPolicyError(
      'amountCents must be a positive safe integer',
    );
  }

  const purpose = normalizePurpose(input.purpose);
  const note = normalizeNote(input.note);
  if (
    purpose === AccountingAccountTransferPurpose.ACCOUNT_ATTRIBUTION_CORRECTION &&
    !note
  ) {
    throw new AccountingJournalPolicyError(
      'note is required for account attribution correction',
    );
  }

  return {
    requestId,
    transferStableId: `accttransfer_${requestId.replaceAll('-', '')}`,
    fromAccountStableId,
    toAccountStableId,
    amountCents: input.amountCents,
    transferDate: normalizeDateOnly(input.transferDate),
    purpose,
    note,
  };
};

export const buildAccountingAccountTransferJournal = (
  transfer: NormalizedAccountingAccountTransfer,
  businessTimezone: string,
): AccountingJournalCreateInput => ({
  idempotencyKey: `account-transfer:${transfer.transferStableId}`,
  kind: AccountingJournalEntryKind.TRANSFER,
  source: AccountingJournalSource.MANUAL,
  sourceFactType: ACCOUNT_TRANSFER_SOURCE_FACT_TYPE,
  sourceFactStableId: transfer.transferStableId,
  sourceFactVersion: ACCOUNT_TRANSFER_SOURCE_FACT_VERSION,
  storeStableId: null,
  occurredAt: transferOccurredAt(transfer.transferDate, businessTimezone),
  currency: 'CAD',
  memo: transfer.note,
  lines: [
    {
      accountStableId: transfer.toAccountStableId,
      debitCents: transfer.amountCents,
      creditCents: 0,
      memo:
        transfer.purpose ===
        AccountingAccountTransferPurpose.ACCOUNT_ATTRIBUTION_CORRECTION
          ? 'Account attribution correction in'
          : 'Account transfer in',
    },
    {
      accountStableId: transfer.fromAccountStableId,
      debitCents: 0,
      creditCents: transfer.amountCents,
      memo:
        transfer.purpose ===
        AccountingAccountTransferPurpose.ACCOUNT_ATTRIBUTION_CORRECTION
          ? 'Account attribution correction out'
          : 'Account transfer out',
    },
  ],
});
