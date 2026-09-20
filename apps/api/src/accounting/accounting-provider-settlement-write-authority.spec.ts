import {
  AccountingFinancialDocumentType,
  AccountingFinancialProvider,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
} from './accounting-contracts';
import {
  normalizeProviderSettlementReplacementGroupAuthority,
  type ProviderSettlementReplacementGroupAuthorityV1,
} from './accounting-provider-settlement-write-authority';

const authority = (
  humanReviewRevision?: ProviderSettlementReplacementGroupAuthorityV1['humanReviewRevision'],
): ProviderSettlementReplacementGroupAuthorityV1 => ({
  version: 1,
  expectedPlanHash: 'a'.repeat(64),
  provider: AccountingFinancialProvider.UBER_EATS,
  documentType: AccountingFinancialDocumentType.STATEMENT,
  businessIdentityKey: 'uber:statement:july-2026',
  documentStableId: 'acctfindoc_july',
  revision: 1,
  providerDocumentRef: 'B4842290',
  storeStableId: '4750_Yonge_Street',
  periodStart: '2026-07-01',
  periodEnd: '2026-07-31',
  salesAuthority: 'STATEMENT_AUTHORITATIVE',
  reviewEvidence: {
    inboxItemStableId: 'inbox_july',
    status: AccountingInboxStatus.CONFIRMED,
    materializedEntityType:
      AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT,
    materializedEntityStableId: 'acctfindoc_july',
    reviewedAt: '2026-09-20T13:00:00.000Z',
    reviewedByUserStableId: 'user_admin_1',
    version: 2,
  },
  ...(humanReviewRevision ? { humanReviewRevision } : {}),
  coverageEvidence: {
    coverageStableId: 'coverage_uber',
    financialHistoryRequiredFrom: '2026-06-01',
    financialCompleteThrough: null,
    liveOrderFactCutoverAt: null,
    orderDetailCoverageFrom: null,
    updatedAt: '2026-09-20T13:00:00.000Z',
  },
  accountPrerequisites: [],
  historicalReversalAnchors: [],
});

describe('provider settlement human review write authority', () => {
  it('normalizes the exact confirmed human review identity into write authority', () => {
    const humanReviewRevision = {
      reviewRevisionStableId: 'acctfinreview_july_1',
      revision: 1,
      reviewHash: 'b'.repeat(64),
      confirmedAt: '2026-09-20T14:00:00.000Z',
      confirmedByUserStableId: 'user_admin_1',
    };

    expect(
      normalizeProviderSettlementReplacementGroupAuthority(
        authority(humanReviewRevision),
      ).humanReviewRevision,
    ).toEqual(humanReviewRevision);
  });

  it('rejects malformed human review hashes before Journal write', () => {
    expect(() =>
      normalizeProviderSettlementReplacementGroupAuthority(
        authority({
          reviewRevisionStableId: 'acctfinreview_july_1',
          revision: 1,
          reviewHash: 'not-a-sha',
          confirmedAt: '2026-09-20T14:00:00.000Z',
          confirmedByUserStableId: 'user_admin_1',
        }),
      ),
    ).toThrow('humanReviewRevision.reviewHash');
  });
});
