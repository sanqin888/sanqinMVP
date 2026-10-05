import { createHash } from 'node:crypto';

import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  ACCOUNTING_OPENING_RECEIVABLE_REVERSAL_SOURCE_FACT_TYPE,
  ACCOUNTING_OPENING_RECEIVABLE_SOURCE_FACT_TYPE,
} from './accounting-opening-receivable.contract';
import {
  ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE,
  ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_SOURCE_FACT_TYPE,
  type AccountingOpeningReceivableReversalTargetV1,
} from './accounting-opening-receivable-settlement.contract';
import {
  AccountingJournalPolicyError,
  hashJournalCreatePayload,
  normalizeJournalCreate,
  type AccountingJournalCreateInput,
  type NormalizedJournalCreate,
} from './accounting-journal-policy';

export type AccountingOpeningReceivableReversalFactV1 = {
  version: 1;
  target: AccountingOpeningReceivableReversalTargetV1;
  targetStableId: string;
  originalFactHash: string;
  originalJournalEntryStableId: string;
  reversalStableId: string;
  reversalReason: string;
};

export type AccountingOpeningReceivableOriginalJournalLineV1 = {
  lineNo: number;
  accountStableId: string;
  categoryStableId: string | null;
  debitCents: number;
  creditCents: number;
  memo: string | null;
};

export type AccountingOpeningReceivableOriginalJournalV1 = {
  entryStableId: string;
  source: AccountingJournalSource;
  sourceFactType: string;
  sourceFactStableId: string;
  sourceFactVersion: number;
  storeStableId: string;
  occurredAt: string;
  currency: 'CAD';
  memo: string | null;
  lines: AccountingOpeningReceivableOriginalJournalLineV1[];
};

export type AccountingOpeningReceivableReversalJournalWriteAuthorityV1 = {
  version: 1;
  role: 'OPENING_RECEIVABLE_REVERSAL';
  fact: AccountingOpeningReceivableReversalFactV1;
  reversalFactHash: string;
  originalJournal: AccountingOpeningReceivableOriginalJournalV1;
};

export type AccountingOpeningReceivableReversalWritePlanV1 = {
  journal: AccountingJournalCreateInput;
  authority: AccountingOpeningReceivableReversalJournalWriteAuthorityV1;
};

const requireValue = (raw: unknown, field: string, maxLength = 500): string => {
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

const requireMoney = (value: number, field: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AccountingJournalPolicyError(
      `${field} must be a non-negative safe integer`,
    );
  }
  return value;
};

const normalizeTarget = (
  value: AccountingOpeningReceivableReversalTargetV1,
): AccountingOpeningReceivableReversalTargetV1 => {
  if (value !== 'OPENING_RECEIVABLE' && value !== 'SETTLEMENT') {
    throw new AccountingJournalPolicyError(
      'Opening Receivable reversal target must be OPENING_RECEIVABLE or SETTLEMENT',
    );
  }
  return value;
};

export const buildAccountingOpeningReceivableReversalStableId = (
  target: AccountingOpeningReceivableReversalTargetV1,
  targetStableIdRaw: string,
): string => {
  const targetStableId = requireValue(targetStableIdRaw, 'targetStableId', 250);
  const digest = createHash('sha256')
    .update(`${target}:${targetStableId}`)
    .digest('hex')
    .slice(0, 32);
  return target === 'OPENING_RECEIVABLE'
    ? `openingrecvreversal_${digest}`
    : `openingrecvsettlereversal_${digest}`;
};

export const normalizeAccountingOpeningReceivableReversalFact = (
  fact: AccountingOpeningReceivableReversalFactV1,
): AccountingOpeningReceivableReversalFactV1 => {
  if (fact.version !== 1) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable reversal fact version must be 1',
    );
  }
  const target = normalizeTarget(fact.target);
  const targetStableId = requireValue(
    fact.targetStableId,
    'targetStableId',
    250,
  );
  const reversalStableId = requireValue(
    fact.reversalStableId,
    'reversalStableId',
    250,
  );
  if (
    reversalStableId !==
    buildAccountingOpeningReceivableReversalStableId(target, targetStableId)
  ) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable reversal stable ID does not match its target',
    );
  }
  return {
    version: 1,
    target,
    targetStableId,
    originalFactHash: requireValue(
      fact.originalFactHash,
      'originalFactHash',
      128,
    ),
    originalJournalEntryStableId: requireValue(
      fact.originalJournalEntryStableId,
      'originalJournalEntryStableId',
      250,
    ),
    reversalStableId,
    reversalReason: requireValue(fact.reversalReason, 'reversalReason'),
  };
};

export const hashAccountingOpeningReceivableReversalFact = (
  factRaw: AccountingOpeningReceivableReversalFactV1,
): string =>
  createHash('sha256')
    .update(
      JSON.stringify(normalizeAccountingOpeningReceivableReversalFact(factRaw)),
    )
    .digest('hex');

const expectedOriginalSourceFactType = (
  target: AccountingOpeningReceivableReversalTargetV1,
): string =>
  target === 'OPENING_RECEIVABLE'
    ? ACCOUNTING_OPENING_RECEIVABLE_SOURCE_FACT_TYPE
    : ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_SOURCE_FACT_TYPE;

const reversalSourceFactType = (
  target: AccountingOpeningReceivableReversalTargetV1,
): string =>
  target === 'OPENING_RECEIVABLE'
    ? ACCOUNTING_OPENING_RECEIVABLE_REVERSAL_SOURCE_FACT_TYPE
    : ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE;

const normalizeOriginalJournal = (
  raw: AccountingOpeningReceivableOriginalJournalV1,
  fact: AccountingOpeningReceivableReversalFactV1,
): AccountingOpeningReceivableOriginalJournalV1 => {
  const entryStableId = requireValue(
    raw.entryStableId,
    'originalJournal.entryStableId',
    250,
  );
  if (entryStableId !== fact.originalJournalEntryStableId) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable reversal original Journal anchor does not match the frozen fact',
    );
  }
  if (raw.source !== AccountingJournalSource.MANUAL) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable reversal original Journal source is invalid',
    );
  }
  const sourceFactType = requireValue(
    raw.sourceFactType,
    'originalJournal.sourceFactType',
  );
  if (sourceFactType !== expectedOriginalSourceFactType(fact.target)) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable reversal original Journal fact type is invalid',
    );
  }
  const sourceFactStableId = requireValue(
    raw.sourceFactStableId,
    'originalJournal.sourceFactStableId',
    250,
  );
  if (sourceFactStableId !== fact.targetStableId) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable reversal original Journal fact identity is invalid',
    );
  }
  if (raw.sourceFactVersion !== 1) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable reversal original Journal fact version must be 1',
    );
  }
  const storeStableId = requireValue(
    raw.storeStableId,
    'originalJournal.storeStableId',
    250,
  );
  const occurredAt = new Date(raw.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable reversal original Journal occurredAt is invalid',
    );
  }
  if (raw.currency !== 'CAD') {
    throw new AccountingJournalPolicyError(
      'Opening Receivable reversal original Journal currency must be CAD',
    );
  }
  if (!Array.isArray(raw.lines) || raw.lines.length < 2) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable reversal original Journal requires at least two lines',
    );
  }

  let debitTotal = 0;
  let creditTotal = 0;
  const lines = raw.lines.map((line, index) => {
    if (line.lineNo !== index + 1) {
      throw new AccountingJournalPolicyError(
        'Opening Receivable reversal original Journal line order is invalid',
      );
    }
    const debitCents = requireMoney(
      line.debitCents,
      `originalJournal.lines[${index}].debitCents`,
    );
    const creditCents = requireMoney(
      line.creditCents,
      `originalJournal.lines[${index}].creditCents`,
    );
    if (
      (debitCents > 0 && creditCents > 0) ||
      (debitCents === 0 && creditCents === 0)
    ) {
      throw new AccountingJournalPolicyError(
        `originalJournal.lines[${index}] must contain exactly one positive debit or credit`,
      );
    }
    debitTotal += debitCents;
    creditTotal += creditCents;
    if (
      !Number.isSafeInteger(debitTotal) ||
      !Number.isSafeInteger(creditTotal)
    ) {
      throw new AccountingJournalPolicyError(
        'Opening Receivable reversal original Journal totals exceed safe integer range',
      );
    }
    return {
      lineNo: line.lineNo,
      accountStableId: requireValue(
        line.accountStableId,
        `originalJournal.lines[${index}].accountStableId`,
        250,
      ),
      categoryStableId:
        typeof line.categoryStableId === 'string' &&
        line.categoryStableId.trim()
          ? line.categoryStableId.trim()
          : null,
      debitCents,
      creditCents,
      memo:
        typeof line.memo === 'string' && line.memo.trim()
          ? line.memo.trim()
          : null,
    };
  });
  if (debitTotal !== creditTotal) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable reversal original Journal is not balanced',
    );
  }

  return {
    entryStableId,
    source: AccountingJournalSource.MANUAL,
    sourceFactType,
    sourceFactStableId,
    sourceFactVersion: 1,
    storeStableId,
    occurredAt: occurredAt.toISOString(),
    currency: 'CAD',
    memo:
      typeof raw.memo === 'string' && raw.memo.trim() ? raw.memo.trim() : null,
    lines,
  };
};

const buildReversalJournal = (
  fact: AccountingOpeningReceivableReversalFactV1,
  originalJournal: AccountingOpeningReceivableOriginalJournalV1,
): AccountingJournalCreateInput => ({
  idempotencyKey:
    fact.target === 'OPENING_RECEIVABLE'
      ? `opening-receivable-reversal:${fact.targetStableId}:v1`
      : `opening-receivable-settlement-reversal:${fact.targetStableId}:v1`,
  kind: AccountingJournalEntryKind.ADJUSTMENT,
  source: AccountingJournalSource.MANUAL,
  sourceFactType: reversalSourceFactType(fact.target),
  sourceFactStableId: fact.reversalStableId,
  sourceFactVersion: 1,
  storeStableId: originalJournal.storeStableId,
  occurredAt: originalJournal.occurredAt,
  currency: 'CAD',
  memo:
    fact.target === 'OPENING_RECEIVABLE'
      ? `Opening Receivable reversal ${fact.targetStableId}`
      : `Opening Receivable settlement reversal ${fact.targetStableId}`,
  lines: originalJournal.lines.map((line) => ({
    accountStableId: line.accountStableId,
    categoryStableId: line.categoryStableId,
    debitCents: line.creditCents,
    creditCents: line.debitCents,
    memo: line.memo,
  })),
});

export const buildAccountingOpeningReceivableReversalWritePlan = (input: {
  fact: AccountingOpeningReceivableReversalFactV1;
  originalJournal: AccountingOpeningReceivableOriginalJournalV1;
}): AccountingOpeningReceivableReversalWritePlanV1 => {
  const fact = normalizeAccountingOpeningReceivableReversalFact(input.fact);
  const originalJournal = normalizeOriginalJournal(input.originalJournal, fact);
  const reversalFactHash = hashAccountingOpeningReceivableReversalFact(fact);
  return {
    journal: buildReversalJournal(fact, originalJournal),
    authority: {
      version: 1,
      role: 'OPENING_RECEIVABLE_REVERSAL',
      fact,
      reversalFactHash,
      originalJournal,
    },
  };
};

export const normalizeAccountingOpeningReceivableReversalWriteAuthority = (
  authority: AccountingOpeningReceivableReversalJournalWriteAuthorityV1,
): AccountingOpeningReceivableReversalJournalWriteAuthorityV1 => {
  if (
    authority.version !== 1 ||
    authority.role !== 'OPENING_RECEIVABLE_REVERSAL'
  ) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable reversal authority must be OPENING_RECEIVABLE_REVERSAL v1',
    );
  }
  const fact = normalizeAccountingOpeningReceivableReversalFact(authority.fact);
  const reversalFactHash = hashAccountingOpeningReceivableReversalFact(fact);
  if (reversalFactHash !== authority.reversalFactHash) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable reversal fact hash does not match its frozen fact',
    );
  }
  const originalJournal = normalizeOriginalJournal(
    authority.originalJournal,
    fact,
  );
  return {
    version: 1,
    role: 'OPENING_RECEIVABLE_REVERSAL',
    fact,
    reversalFactHash,
    originalJournal,
  };
};

export const assertAccountingOpeningReceivableReversalJournalAuthority = (
  journal: NormalizedJournalCreate,
  authorityRaw: AccountingOpeningReceivableReversalJournalWriteAuthorityV1,
): void => {
  const authority =
    normalizeAccountingOpeningReceivableReversalWriteAuthority(authorityRaw);
  const expected = normalizeJournalCreate(
    buildReversalJournal(authority.fact, authority.originalJournal),
  );
  if (
    hashJournalCreatePayload(journal) !== hashJournalCreatePayload(expected)
  ) {
    throw new AccountingJournalPolicyError(
      'Opening Receivable reversal Journal is not the exact inverse of its frozen original Journal',
    );
  }
};

export const hashAccountingOpeningReceivableReversalJournalWrite = (
  journal: NormalizedJournalCreate,
  authorityRaw: AccountingOpeningReceivableReversalJournalWriteAuthorityV1,
): string => {
  const authority =
    normalizeAccountingOpeningReceivableReversalWriteAuthority(authorityRaw);
  return createHash('sha256')
    .update(
      JSON.stringify({
        journal: hashJournalCreatePayload(journal),
        authority,
      }),
    )
    .digest('hex');
};
