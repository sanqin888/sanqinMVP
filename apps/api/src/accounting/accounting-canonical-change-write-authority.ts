import { createHash } from 'node:crypto';

import {
  AccountingJournalPolicyError,
  hashJournalCreatePayload,
  type NormalizedJournalCreate,
} from './accounting-journal-policy';

export type CanonicalChangeJournalWriteAuthorityV1 = {
  version: 1;
  changeFactType:
    | 'order.financial_adjustment.v1'
    | 'order.financial_reversal.v1';
  changeFactStableId: string;
  originalSaleFactStableId: string;
  originalSaleJournalEntryStableId: string;
  cardSettlementEvidenceMode:
    | 'LEGACY_ORDER_DECLARED'
    | 'STRICT_PAYMENT_EVIDENCE'
    | null;
  matchedPaymentReversalFactStableIds: string[];
  matchedLoyaltyFactStableIds: string[];
};

const requireValue = (raw: string, field: string): string => {
  const value = raw?.trim();
  if (!value) {
    throw new AccountingJournalPolicyError(`${field} is required`);
  }
  return value;
};

const normalizeStableIds = (values: string[], field: string): string[] => {
  if (!Array.isArray(values)) {
    throw new AccountingJournalPolicyError(`${field} must be an array`);
  }
  const normalized = values.map((value, index) => {
    if (typeof value !== 'string') {
      throw new AccountingJournalPolicyError(`${field}[${index}] must be a string`);
    }
    return requireValue(value, `${field}[${index}]`);
  });
  return [...new Set(normalized)].sort();
};

export const normalizeCanonicalChangeJournalWriteAuthority = (
  authority: CanonicalChangeJournalWriteAuthorityV1,
): CanonicalChangeJournalWriteAuthorityV1 => {
  if (authority.version !== 1) {
    throw new AccountingJournalPolicyError(
      'canonical change write authority version must be 1',
    );
  }
  if (
    authority.changeFactType !== 'order.financial_adjustment.v1' &&
    authority.changeFactType !== 'order.financial_reversal.v1'
  ) {
    throw new AccountingJournalPolicyError(
      'canonical change write authority fact type is invalid',
    );
  }
  if (
    authority.cardSettlementEvidenceMode !== null &&
    authority.cardSettlementEvidenceMode !== 'LEGACY_ORDER_DECLARED' &&
    authority.cardSettlementEvidenceMode !== 'STRICT_PAYMENT_EVIDENCE'
  ) {
    throw new AccountingJournalPolicyError(
      'canonical change write authority CARD evidence mode is unresolved',
    );
  }

  return {
    version: 1,
    changeFactType: authority.changeFactType,
    changeFactStableId: requireValue(
      authority.changeFactStableId,
      'changeFactStableId',
    ),
    originalSaleFactStableId: requireValue(
      authority.originalSaleFactStableId,
      'originalSaleFactStableId',
    ),
    originalSaleJournalEntryStableId: requireValue(
      authority.originalSaleJournalEntryStableId,
      'originalSaleJournalEntryStableId',
    ),
    cardSettlementEvidenceMode: authority.cardSettlementEvidenceMode,
    matchedPaymentReversalFactStableIds: normalizeStableIds(
      authority.matchedPaymentReversalFactStableIds,
      'matchedPaymentReversalFactStableIds',
    ),
    matchedLoyaltyFactStableIds: normalizeStableIds(
      authority.matchedLoyaltyFactStableIds,
      'matchedLoyaltyFactStableIds',
    ),
  };
};

export const hashCanonicalChangeJournalWrite = (
  journal: NormalizedJournalCreate,
  authority: CanonicalChangeJournalWriteAuthorityV1,
): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        version: 1,
        journalHash: hashJournalCreatePayload(journal),
        writeAuthority: authority,
      }),
    )
    .digest('hex');
