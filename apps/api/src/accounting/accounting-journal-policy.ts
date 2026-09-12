import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from '@prisma/client';
import { createHash } from 'node:crypto';

export type AccountingJournalLineInput = {
  accountStableId: string;
  categoryStableId?: string | null;
  debitCents?: number;
  creditCents?: number;
  memo?: string | null;
};

export type AccountingJournalCreateInput = {
  idempotencyKey: string;
  kind: AccountingJournalEntryKind;
  source: AccountingJournalSource;
  sourceFactType?: string | null;
  sourceFactStableId?: string | null;
  sourceFactVersion?: number | null;
  storeStableId?: string | null;
  occurredAt: string;
  currency?: string;
  memo?: string | null;
  lines: AccountingJournalLineInput[];
};

export type AccountingJournalUpdateInput = Omit<
  AccountingJournalCreateInput,
  'idempotencyKey' | 'source'
> & {
  lastKnownUpdatedAt: string;
};

export type NormalizedJournalLine = {
  accountStableId: string;
  categoryStableId: string | null;
  debitCents: number;
  creditCents: number;
  memo: string | null;
};

export type NormalizedJournalCreate = {
  idempotencyKey: string;
  kind: AccountingJournalEntryKind;
  source: AccountingJournalSource;
  sourceFactType: string | null;
  sourceFactStableId: string | null;
  sourceFactVersion: number | null;
  storeStableId: string | null;
  occurredAt: Date;
  currency: string;
  memo: string | null;
  lines: NormalizedJournalLine[];
};

export type NormalizedJournalUpdate = Omit<
  NormalizedJournalCreate,
  'idempotencyKey' | 'source'
>;

export class AccountingJournalPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountingJournalPolicyError';
  }
}

export function normalizeJournalCreate(
  input: AccountingJournalCreateInput,
): NormalizedJournalCreate {
  return {
    idempotencyKey: requireValue(input.idempotencyKey, 'idempotencyKey'),
    source: input.source,
    ...normalizeShared(input),
  };
}

export function normalizeJournalUpdate(
  input: AccountingJournalUpdateInput,
): NormalizedJournalUpdate {
  return normalizeShared(input);
}

export function hashJournalCreatePayload(
  normalized: NormalizedJournalCreate,
): string {
  const serialized = JSON.stringify({
    idempotencyKey: normalized.idempotencyKey,
    kind: normalized.kind,
    source: normalized.source,
    sourceFactType: normalized.sourceFactType,
    sourceFactStableId: normalized.sourceFactStableId,
    sourceFactVersion: normalized.sourceFactVersion,
    storeStableId: normalized.storeStableId,
    occurredAt: normalized.occurredAt.toISOString(),
    currency: normalized.currency,
    memo: normalized.memo,
    lines: normalized.lines,
  });
  return createHash('sha256').update(serialized).digest('hex');
}

function normalizeShared(
  input: Omit<AccountingJournalCreateInput, 'idempotencyKey' | 'source'>,
): NormalizedJournalUpdate {
  const sourceFactType = optionalTrim(input.sourceFactType);
  const sourceFactStableId = optionalTrim(input.sourceFactStableId);
  if ((sourceFactType === null) !== (sourceFactStableId === null)) {
    throw new AccountingJournalPolicyError(
      'sourceFactType and sourceFactStableId must be provided together',
    );
  }

  const sourceFactVersion = input.sourceFactVersion ?? null;
  if (
    sourceFactVersion !== null &&
    (!Number.isSafeInteger(sourceFactVersion) || sourceFactVersion < 1)
  ) {
    throw new AccountingJournalPolicyError(
      'sourceFactVersion must be a positive integer when provided',
    );
  }
  if (sourceFactVersion !== null && sourceFactStableId === null) {
    throw new AccountingJournalPolicyError(
      'sourceFactVersion requires a source fact identity',
    );
  }

  const currency = input.currency?.trim().toUpperCase() || 'CAD';
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new AccountingJournalPolicyError('currency must be a 3-letter code');
  }

  return {
    kind: input.kind,
    sourceFactType,
    sourceFactStableId,
    sourceFactVersion,
    storeStableId: optionalTrim(input.storeStableId),
    occurredAt: parseDate(input.occurredAt, 'occurredAt'),
    currency,
    memo: optionalTrim(input.memo),
    lines: normalizeLines(input.lines),
  };
}

function normalizeLines(
  lines: AccountingJournalLineInput[],
): NormalizedJournalLine[] {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new AccountingJournalPolicyError(
      'journal entry requires at least two lines',
    );
  }

  let debitTotal = 0;
  let creditTotal = 0;
  const normalized = lines.map((line, index) => {
    const accountStableId = requireValue(
      line.accountStableId,
      `lines[${index}].accountStableId`,
    );
    const debitCents = line.debitCents ?? 0;
    const creditCents = line.creditCents ?? 0;
    assertMinorUnits(debitCents, `lines[${index}].debitCents`);
    assertMinorUnits(creditCents, `lines[${index}].creditCents`);
    if (
      (debitCents > 0 && creditCents > 0) ||
      (debitCents === 0 && creditCents === 0)
    ) {
      throw new AccountingJournalPolicyError(
        `lines[${index}] must contain exactly one positive debit or credit`,
      );
    }

    debitTotal += debitCents;
    creditTotal += creditCents;
    if (
      !Number.isSafeInteger(debitTotal) ||
      !Number.isSafeInteger(creditTotal)
    ) {
      throw new AccountingJournalPolicyError(
        'journal totals exceed safe integer range',
      );
    }

    return {
      accountStableId,
      categoryStableId: optionalTrim(line.categoryStableId),
      debitCents,
      creditCents,
      memo: optionalTrim(line.memo),
    };
  });

  if (debitTotal !== creditTotal) {
    throw new AccountingJournalPolicyError(
      `journal entry does not balance: debit(${debitTotal}) != credit(${creditTotal})`,
    );
  }
  return normalized;
}

function parseDate(raw: string, field: string): Date {
  const value = raw?.trim();
  const parsed = value ? new Date(value) : new Date(Number.NaN);
  if (Number.isNaN(parsed.getTime())) {
    throw new AccountingJournalPolicyError(`${field} must be a valid date`);
  }
  return parsed;
}

function requireValue(raw: string, field: string): string {
  const value = raw?.trim();
  if (!value) throw new AccountingJournalPolicyError(`${field} is required`);
  return value;
}

function optionalTrim(raw?: string | null): string | null {
  return raw?.trim() || null;
}

function assertMinorUnits(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AccountingJournalPolicyError(
      `${field} must be a non-negative integer`,
    );
  }
}
