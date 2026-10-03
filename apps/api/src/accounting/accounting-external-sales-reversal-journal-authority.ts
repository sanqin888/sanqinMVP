import { createHash } from 'node:crypto';

import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  ACCOUNTING_EXTERNAL_SALE_REVERSAL_SOURCE_FACT_TYPE,
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE,
  ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_TYPE,
  ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_TYPE,
} from './accounting-external-sales.contract';
import {
  AccountingJournalPolicyError,
  hashJournalCreatePayload,
  normalizeJournalCreate,
  type AccountingJournalCreateInput,
  type NormalizedJournalCreate,
} from './accounting-journal-policy';

export type AccountingExternalSaleReversalTargetV1 = 'SALE' | 'SETTLEMENT';

export type AccountingExternalSaleReversalFactV1 = {
  version: 1;
  target: AccountingExternalSaleReversalTargetV1;
  targetStableId: string;
  originalFactHash: string;
  originalJournalEntryStableId: string;
  reversalStableId: string;
  reversalReason: string;
};

export type AccountingExternalSaleOriginalJournalLineV1 = {
  lineNo: number;
  accountStableId: string;
  categoryStableId: string | null;
  debitCents: number;
  creditCents: number;
  memo: string | null;
};

export type AccountingExternalSaleOriginalJournalV1 = {
  entryStableId: string;
  source: AccountingJournalSource;
  sourceFactType: string;
  sourceFactStableId: string;
  sourceFactVersion: number;
  storeStableId: string;
  occurredAt: string;
  currency: 'CAD';
  memo: string | null;
  lines: AccountingExternalSaleOriginalJournalLineV1[];
};

export type AccountingExternalSaleReversalJournalWriteAuthorityV1 = {
  version: 1;
  role: 'EXTERNAL_SALE_REVERSAL';
  fact: AccountingExternalSaleReversalFactV1;
  reversalFactHash: string;
  originalJournal: AccountingExternalSaleOriginalJournalV1;
};

export type AccountingExternalSaleReversalWritePlanV1 = {
  journal: AccountingJournalCreateInput;
  authority: AccountingExternalSaleReversalJournalWriteAuthorityV1;
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
  value: AccountingExternalSaleReversalTargetV1,
): AccountingExternalSaleReversalTargetV1 => {
  if (value !== 'SALE' && value !== 'SETTLEMENT') {
    throw new AccountingJournalPolicyError(
      'External Sale reversal target must be SALE or SETTLEMENT',
    );
  }
  return value;
};

export const buildAccountingExternalSaleReversalStableId = (
  target: AccountingExternalSaleReversalTargetV1,
  targetStableIdRaw: string,
): string => {
  const targetStableId = requireValue(targetStableIdRaw, 'targetStableId', 250);
  const digest = createHash('sha256')
    .update(`${target}:${targetStableId}`)
    .digest('hex')
    .slice(0, 32);
  return target === 'SALE'
    ? `extsalereversal_${digest}`
    : `extsettlementreversal_${digest}`;
};

export const normalizeAccountingExternalSaleReversalFact = (
  fact: AccountingExternalSaleReversalFactV1,
): AccountingExternalSaleReversalFactV1 => {
  if (fact.version !== 1) {
    throw new AccountingJournalPolicyError(
      'External Sale reversal fact version must be 1',
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
    buildAccountingExternalSaleReversalStableId(target, targetStableId)
  ) {
    throw new AccountingJournalPolicyError(
      'External Sale reversal stable ID does not match its target',
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

export const hashAccountingExternalSaleReversalFact = (
  factRaw: AccountingExternalSaleReversalFactV1,
): string =>
  createHash('sha256')
    .update(
      JSON.stringify(normalizeAccountingExternalSaleReversalFact(factRaw)),
    )
    .digest('hex');

const expectedOriginalSourceFactType = (
  target: AccountingExternalSaleReversalTargetV1,
): string =>
  target === 'SALE'
    ? ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_TYPE
    : ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_SOURCE_FACT_TYPE;

const reversalSourceFactType = (
  target: AccountingExternalSaleReversalTargetV1,
): string =>
  target === 'SALE'
    ? ACCOUNTING_EXTERNAL_SALE_REVERSAL_SOURCE_FACT_TYPE
    : ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_REVERSAL_SOURCE_FACT_TYPE;

const normalizeOriginalJournal = (
  raw: AccountingExternalSaleOriginalJournalV1,
  fact: AccountingExternalSaleReversalFactV1,
): AccountingExternalSaleOriginalJournalV1 => {
  const entryStableId = requireValue(
    raw.entryStableId,
    'originalJournal.entryStableId',
    250,
  );
  if (entryStableId !== fact.originalJournalEntryStableId) {
    throw new AccountingJournalPolicyError(
      'External Sale reversal original Journal anchor does not match the frozen fact',
    );
  }
  if (raw.source !== AccountingJournalSource.EXTERNAL_SALE) {
    throw new AccountingJournalPolicyError(
      'External Sale reversal original Journal source is invalid',
    );
  }
  const sourceFactType = requireValue(
    raw.sourceFactType,
    'originalJournal.sourceFactType',
  );
  if (sourceFactType !== expectedOriginalSourceFactType(fact.target)) {
    throw new AccountingJournalPolicyError(
      'External Sale reversal original Journal fact type is invalid',
    );
  }
  const sourceFactStableId = requireValue(
    raw.sourceFactStableId,
    'originalJournal.sourceFactStableId',
    250,
  );
  if (sourceFactStableId !== fact.targetStableId) {
    throw new AccountingJournalPolicyError(
      'External Sale reversal original Journal fact identity is invalid',
    );
  }
  if (raw.sourceFactVersion !== 1) {
    throw new AccountingJournalPolicyError(
      'External Sale reversal original Journal fact version must be 1',
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
      'External Sale reversal original Journal occurredAt is invalid',
    );
  }
  if (raw.currency !== 'CAD') {
    throw new AccountingJournalPolicyError(
      'External Sale reversal original Journal currency must be CAD',
    );
  }
  if (!Array.isArray(raw.lines) || raw.lines.length < 2) {
    throw new AccountingJournalPolicyError(
      'External Sale reversal original Journal requires at least two lines',
    );
  }

  let debitTotal = 0;
  let creditTotal = 0;
  const lines = raw.lines.map((line, index) => {
    if (line.lineNo !== index + 1) {
      throw new AccountingJournalPolicyError(
        'External Sale reversal original Journal line order is invalid',
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
        'External Sale reversal original Journal totals exceed safe integer range',
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
      'External Sale reversal original Journal is not balanced',
    );
  }

  return {
    entryStableId,
    source: AccountingJournalSource.EXTERNAL_SALE,
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
  fact: AccountingExternalSaleReversalFactV1,
  originalJournal: AccountingExternalSaleOriginalJournalV1,
): AccountingJournalCreateInput => ({
  idempotencyKey:
    fact.target === 'SALE'
      ? `external-sale-reversal:${fact.targetStableId}:v1`
      : `external-sale-settlement-reversal:${fact.targetStableId}:v1`,
  kind: AccountingJournalEntryKind.ADJUSTMENT,
  source: AccountingJournalSource.EXTERNAL_SALE,
  sourceFactType: reversalSourceFactType(fact.target),
  sourceFactStableId: fact.reversalStableId,
  sourceFactVersion: 1,
  storeStableId: originalJournal.storeStableId,
  occurredAt: originalJournal.occurredAt,
  currency: 'CAD',
  memo:
    fact.target === 'SALE'
      ? `External Sale reversal ${fact.targetStableId}`
      : `External Sale settlement reversal ${fact.targetStableId}`,
  lines: originalJournal.lines.map((line) => ({
    accountStableId: line.accountStableId,
    categoryStableId: line.categoryStableId,
    debitCents: line.creditCents,
    creditCents: line.debitCents,
    memo: line.memo,
  })),
});

export const buildAccountingExternalSaleReversalWritePlan = (input: {
  fact: AccountingExternalSaleReversalFactV1;
  originalJournal: AccountingExternalSaleOriginalJournalV1;
}): AccountingExternalSaleReversalWritePlanV1 => {
  const fact = normalizeAccountingExternalSaleReversalFact(input.fact);
  const originalJournal = normalizeOriginalJournal(input.originalJournal, fact);
  const reversalFactHash = hashAccountingExternalSaleReversalFact(fact);
  return {
    journal: buildReversalJournal(fact, originalJournal),
    authority: {
      version: 1,
      role: 'EXTERNAL_SALE_REVERSAL',
      fact,
      reversalFactHash,
      originalJournal,
    },
  };
};

export const normalizeAccountingExternalSaleReversalWriteAuthority = (
  authority: AccountingExternalSaleReversalJournalWriteAuthorityV1,
): AccountingExternalSaleReversalJournalWriteAuthorityV1 => {
  if (authority.version !== 1 || authority.role !== 'EXTERNAL_SALE_REVERSAL') {
    throw new AccountingJournalPolicyError(
      'External Sale reversal authority must be EXTERNAL_SALE_REVERSAL v1',
    );
  }
  const fact = normalizeAccountingExternalSaleReversalFact(authority.fact);
  const reversalFactHash = hashAccountingExternalSaleReversalFact(fact);
  if (reversalFactHash !== authority.reversalFactHash) {
    throw new AccountingJournalPolicyError(
      'External Sale reversal fact hash does not match its frozen fact',
    );
  }
  const originalJournal = normalizeOriginalJournal(
    authority.originalJournal,
    fact,
  );
  return {
    version: 1,
    role: 'EXTERNAL_SALE_REVERSAL',
    fact,
    reversalFactHash,
    originalJournal,
  };
};

export const assertAccountingExternalSaleReversalJournalAuthority = (
  journal: NormalizedJournalCreate,
  authorityRaw: AccountingExternalSaleReversalJournalWriteAuthorityV1,
): void => {
  const authority =
    normalizeAccountingExternalSaleReversalWriteAuthority(authorityRaw);
  const expected = normalizeJournalCreate(
    buildReversalJournal(authority.fact, authority.originalJournal),
  );
  if (
    hashJournalCreatePayload(journal) !== hashJournalCreatePayload(expected)
  ) {
    throw new AccountingJournalPolicyError(
      'External Sale reversal Journal is not the exact inverse of its frozen original Journal',
    );
  }
};

export const hashAccountingExternalSaleReversalJournalWrite = (
  journal: NormalizedJournalCreate,
  authorityRaw: AccountingExternalSaleReversalJournalWriteAuthorityV1,
): string => {
  const authority =
    normalizeAccountingExternalSaleReversalWriteAuthority(authorityRaw);
  return createHash('sha256')
    .update(
      JSON.stringify({
        journal: hashJournalCreatePayload(journal),
        authority,
      }),
    )
    .digest('hex');
};
