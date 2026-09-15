import {
  AccountingAccountClass,
  AccountingFinancialDocumentType,
  AccountingFinancialProvider,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
} from '@prisma/client';

import { hashAccountingJson } from './accounting-inbox-core.policy';
import {
  AccountingJournalPolicyError,
  hashJournalCreatePayload,
  type AccountingJournalCreateInput,
  type NormalizedJournalCreate,
} from './accounting-journal-policy';
import type { ProviderSalesAuthority } from './accounting-provider-settlement.policy';

export type ProviderSettlementAccountAuthorityV1 = {
  accountStableId: string;
  expected: {
    accountClass: AccountingAccountClass;
    currency: string;
    isActive: boolean;
  };
  actual: {
    accountClass: AccountingAccountClass;
    currency: string;
    isActive: boolean;
  };
};

export type ProviderSettlementHistoricalJournalAnchorV1 = {
  originalJournalEntryStableId: string;
  idempotencyKey: string;
  idempotencyHash: string;
  version: number;
  sourceFactStableId: string;
};

export type ProviderSettlementReplacementGroupAuthorityV1 = {
  version: 1;
  expectedPlanHash: string;
  provider: AccountingFinancialProvider;
  documentType: AccountingFinancialDocumentType;
  businessIdentityKey: string;
  documentStableId: string;
  revision: number;
  providerDocumentRef: string | null;
  storeStableId: string;
  periodStart: string;
  periodEnd: string;
  salesAuthority: ProviderSalesAuthority;
  reviewEvidence: {
    inboxItemStableId: string;
    status: AccountingInboxStatus.CONFIRMED;
    materializedEntityType: AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT;
    materializedEntityStableId: string;
    reviewedAt: string;
    reviewedByUserStableId: string;
    version: number;
  };
  coverageEvidence: {
    coverageStableId: string;
    financialHistoryRequiredFrom: string;
    financialCompleteThrough: string | null;
    liveOrderFactCutoverAt: string | null;
    orderDetailCoverageFrom: string | null;
    updatedAt: string;
  };
  accountPrerequisites: ProviderSettlementAccountAuthorityV1[];
  historicalReversalAnchors: ProviderSettlementHistoricalJournalAnchorV1[];
};

export type ProviderSettlementJournalWriteAuthorityV1 = {
  version: 1;
  role: 'PROVIDER_DOCUMENT' | 'UBER_PRE_CUTOVER_REVERSAL';
  group: ProviderSettlementReplacementGroupAuthorityV1;
  originalJournalEntryStableId: string | null;
};

export type ProviderSettlementReplacementGroupWriteInput = {
  documentJournal: AccountingJournalCreateInput;
  uberPreCutoverReversals: Array<{
    journal: AccountingJournalCreateInput;
    originalJournalEntryStableId: string;
  }>;
};

const requireValue = (raw: string, field: string): string => {
  const value = raw?.trim();
  if (!value) {
    throw new AccountingJournalPolicyError(`${field} is required`);
  }
  return value;
};

const requireSha256 = (raw: string, field: string): string => {
  const value = requireValue(raw, field);
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new AccountingJournalPolicyError(
      `${field} must be a lowercase SHA-256 hex digest`,
    );
  }
  return value;
};

const requirePositiveInteger = (value: number, field: string): number => {
  if (!Number.isInteger(value) || value < 1) {
    throw new AccountingJournalPolicyError(`${field} must be a positive integer`);
  }
  return value;
};

const optionalValue = (raw: string | null): string | null => {
  if (raw === null) return null;
  return requireValue(raw, 'optional authority value');
};

const normalizeAccountPrerequisites = (
  accounts: ProviderSettlementAccountAuthorityV1[],
): ProviderSettlementAccountAuthorityV1[] => {
  if (!Array.isArray(accounts)) {
    throw new AccountingJournalPolicyError(
      'provider settlement accountPrerequisites must be an array',
    );
  }
  const normalized = accounts.map((account) => ({
    accountStableId: requireValue(
      account.accountStableId,
      'accountPrerequisites.accountStableId',
    ),
    expected: {
      accountClass: account.expected.accountClass,
      currency: requireValue(
        account.expected.currency,
        'accountPrerequisites.expected.currency',
      ).toUpperCase(),
      isActive: account.expected.isActive,
    },
    actual: {
      accountClass: account.actual.accountClass,
      currency: requireValue(
        account.actual.currency,
        'accountPrerequisites.actual.currency',
      ).toUpperCase(),
      isActive: account.actual.isActive,
    },
  }));
  const stableIds = new Set(normalized.map((account) => account.accountStableId));
  if (stableIds.size !== normalized.length) {
    throw new AccountingJournalPolicyError(
      'provider settlement accountPrerequisites contain duplicate stable IDs',
    );
  }
  for (const account of normalized) {
    if (
      account.actual.accountClass !== account.expected.accountClass ||
      account.actual.currency !== account.expected.currency ||
      account.actual.isActive !== account.expected.isActive
    ) {
      throw new AccountingJournalPolicyError(
        `provider settlement account prerequisite is not READY: ${account.accountStableId}`,
      );
    }
  }
  return normalized.sort((left, right) =>
    left.accountStableId.localeCompare(right.accountStableId),
  );
};

const normalizeHistoricalAnchors = (
  anchors: ProviderSettlementHistoricalJournalAnchorV1[],
): ProviderSettlementHistoricalJournalAnchorV1[] => {
  if (!Array.isArray(anchors)) {
    throw new AccountingJournalPolicyError(
      'provider settlement historicalReversalAnchors must be an array',
    );
  }
  const normalized = anchors.map((anchor) => ({
    originalJournalEntryStableId: requireValue(
      anchor.originalJournalEntryStableId,
      'historicalReversalAnchors.originalJournalEntryStableId',
    ),
    idempotencyKey: requireValue(
      anchor.idempotencyKey,
      'historicalReversalAnchors.idempotencyKey',
    ),
    idempotencyHash: requireSha256(
      anchor.idempotencyHash,
      'historicalReversalAnchors.idempotencyHash',
    ),
    version: requirePositiveInteger(
      anchor.version,
      'historicalReversalAnchors.version',
    ),
    sourceFactStableId: requireValue(
      anchor.sourceFactStableId,
      'historicalReversalAnchors.sourceFactStableId',
    ),
  }));
  const stableIds = new Set(
    normalized.map((anchor) => anchor.originalJournalEntryStableId),
  );
  if (stableIds.size !== normalized.length) {
    throw new AccountingJournalPolicyError(
      'provider settlement historicalReversalAnchors contain duplicate Journal IDs',
    );
  }
  return normalized.sort((left, right) =>
    left.originalJournalEntryStableId.localeCompare(
      right.originalJournalEntryStableId,
    ),
  );
};

export const normalizeProviderSettlementReplacementGroupAuthority = (
  authority: ProviderSettlementReplacementGroupAuthorityV1,
): ProviderSettlementReplacementGroupAuthorityV1 => {
  if (authority.version !== 1) {
    throw new AccountingJournalPolicyError(
      'provider settlement replacement authority version must be 1',
    );
  }
  if (
    authority.reviewEvidence.status !== AccountingInboxStatus.CONFIRMED ||
    authority.reviewEvidence.materializedEntityType !==
      AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT
  ) {
    throw new AccountingJournalPolicyError(
      'provider settlement write authority requires confirmed provider-document review evidence',
    );
  }

  const documentStableId = requireValue(
    authority.documentStableId,
    'documentStableId',
  );
  if (
    requireValue(
      authority.reviewEvidence.materializedEntityStableId,
      'reviewEvidence.materializedEntityStableId',
    ) !== documentStableId
  ) {
    throw new AccountingJournalPolicyError(
      'provider settlement review evidence is linked to a different document',
    );
  }

  return {
    version: 1,
    expectedPlanHash: requireSha256(
      authority.expectedPlanHash,
      'expectedPlanHash',
    ),
    provider: authority.provider,
    documentType: authority.documentType,
    businessIdentityKey: requireValue(
      authority.businessIdentityKey,
      'businessIdentityKey',
    ),
    documentStableId,
    revision: requirePositiveInteger(authority.revision, 'revision'),
    providerDocumentRef: optionalValue(authority.providerDocumentRef),
    storeStableId: requireValue(authority.storeStableId, 'storeStableId'),
    periodStart: requireValue(authority.periodStart, 'periodStart'),
    periodEnd: requireValue(authority.periodEnd, 'periodEnd'),
    salesAuthority: authority.salesAuthority,
    reviewEvidence: {
      inboxItemStableId: requireValue(
        authority.reviewEvidence.inboxItemStableId,
        'reviewEvidence.inboxItemStableId',
      ),
      status: AccountingInboxStatus.CONFIRMED,
      materializedEntityType:
        AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT,
      materializedEntityStableId: documentStableId,
      reviewedAt: requireValue(
        authority.reviewEvidence.reviewedAt,
        'reviewEvidence.reviewedAt',
      ),
      reviewedByUserStableId: requireValue(
        authority.reviewEvidence.reviewedByUserStableId,
        'reviewEvidence.reviewedByUserStableId',
      ),
      version: requirePositiveInteger(
        authority.reviewEvidence.version,
        'reviewEvidence.version',
      ),
    },
    coverageEvidence: {
      coverageStableId: requireValue(
        authority.coverageEvidence.coverageStableId,
        'coverageEvidence.coverageStableId',
      ),
      financialHistoryRequiredFrom: requireValue(
        authority.coverageEvidence.financialHistoryRequiredFrom,
        'coverageEvidence.financialHistoryRequiredFrom',
      ),
      financialCompleteThrough: optionalValue(
        authority.coverageEvidence.financialCompleteThrough,
      ),
      liveOrderFactCutoverAt: optionalValue(
        authority.coverageEvidence.liveOrderFactCutoverAt,
      ),
      orderDetailCoverageFrom: optionalValue(
        authority.coverageEvidence.orderDetailCoverageFrom,
      ),
      updatedAt: requireValue(
        authority.coverageEvidence.updatedAt,
        'coverageEvidence.updatedAt',
      ),
    },
    accountPrerequisites: normalizeAccountPrerequisites(
      authority.accountPrerequisites,
    ),
    historicalReversalAnchors: normalizeHistoricalAnchors(
      authority.historicalReversalAnchors,
    ),
  };
};

export const buildProviderSettlementJournalWriteAuthority = (params: {
  group: ProviderSettlementReplacementGroupAuthorityV1;
  role: ProviderSettlementJournalWriteAuthorityV1['role'];
  originalJournalEntryStableId?: string | null;
}): ProviderSettlementJournalWriteAuthorityV1 => {
  const group = normalizeProviderSettlementReplacementGroupAuthority(params.group);
  const originalJournalEntryStableId = params.originalJournalEntryStableId
    ? requireValue(
        params.originalJournalEntryStableId,
        'originalJournalEntryStableId',
      )
    : null;
  if (params.role === 'PROVIDER_DOCUMENT' && originalJournalEntryStableId) {
    throw new AccountingJournalPolicyError(
      'provider document write authority cannot carry an original Order Journal anchor',
    );
  }
  if (params.role === 'UBER_PRE_CUTOVER_REVERSAL') {
    if (!originalJournalEntryStableId) {
      throw new AccountingJournalPolicyError(
        'Uber pre-cutover reversal write authority requires an original Order Journal anchor',
      );
    }
    if (
      !group.historicalReversalAnchors.some(
        (anchor) =>
          anchor.originalJournalEntryStableId === originalJournalEntryStableId,
      )
    ) {
      throw new AccountingJournalPolicyError(
        'Uber pre-cutover reversal anchor is not part of the replacement group',
      );
    }
  }
  return {
    version: 1,
    role: params.role,
    group,
    originalJournalEntryStableId,
  };
};

export const hashProviderSettlementJournalWrite = (
  journal: NormalizedJournalCreate,
  authority: ProviderSettlementJournalWriteAuthorityV1,
): string =>
  hashAccountingJson({
    version: 1,
    journalHash: hashJournalCreatePayload(journal),
    writeAuthority: authority,
  });
