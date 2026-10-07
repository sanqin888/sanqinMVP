import {
  AccountingAccountClass,
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  AccountingPostedCorrectionReasonCode,
  AccountingPostedCorrectionTargetKind,
} from './accounting-posted-financial-correction.contract';
import { buildPostedFinancialCorrectionPreviewPlan } from './accounting-posted-financial-correction.policy';
import { AccountingProviderSettlementCorrectionAdapter } from './accounting-provider-settlement-correction.adapter';
import {
  buildProviderSettlementDocumentPlan,
  buildUberPreCutoverOrderReversalDraft,
  PROVIDER_SETTLEMENT_ACCOUNT_REQUIREMENTS,
} from './accounting-provider-settlement.policy';
import {
  buildProviderSettlementJournalWriteAuthority,
  hashProviderSettlementJournalWrite,
  type ProviderSettlementReplacementGroupAuthorityV1,
} from './accounting-provider-settlement-write-authority';
import {
  hashJournalCreatePayload,
  normalizeJournalCreate,
  type AccountingJournalCreateInput,
} from './accounting-journal-policy';
import { CLOVER_STATEMENT_RAW_CODES } from './accounting-clover-statement.contract';
import {
  CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
  CLOVER_FEE_RECLASSIFICATION_SOURCE_FACT_TYPE,
} from './accounting-provider-fee-clearing.contract';
import { ACCOUNTING_PROVIDER_PENDING_ACCOUNT_IDS } from './accounting-provider-accounts';

type ProviderLine = {
  lineStableId: string;
  lineNo: number;
  rawCode: string | null;
  rawName: string | null;
  component: AccountingFinancialComponent;
  postingTreatment: AccountingFinancialPostingTreatment;
  taxRole: AccountingFinancialTaxRole;
  amountCents: number;
  occurredAt: Date | null;
};

const STORE = '4750_Yonge_Street';
const DOCUMENT = 'provider_doc_uber_sep';
const OCCURRED_AT = new Date('2026-10-01T03:59:59.999Z');
const ACCOUNT_REQUIREMENTS: Readonly<
  Record<
    string,
    {
      accountClass: AccountingAccountClass;
      currency: string;
      isActive: boolean;
    }
  >
> = PROVIDER_SETTLEMENT_ACCOUNT_REQUIREMENTS;

const sumByRawName = (
  lines: ProviderLine[],
  rawNames: readonly string[],
): number => {
  const names = new Set(rawNames.map((name) => name.toLowerCase()));
  return lines.reduce(
    (sum, line) =>
      line.rawName && names.has(line.rawName.toLowerCase())
        ? sum + line.amountCents
        : sum,
    0,
  );
};

const withUberControlTotals = (input: ProviderLine[]): ProviderLine[] => {
  const lines = input.map((line) => ({ ...line }));
  const appendControl = (
    rawName: string,
    componentRawNames: readonly string[],
  ) => {
    lines.push({
      lineStableId:
        'control-' + rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      lineNo: lines.length + 1,
      rawCode: null,
      rawName,
      component: AccountingFinancialComponent.CONTROL_TOTAL,
      postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      taxRole: AccountingFinancialTaxRole.NONE,
      amountCents: sumByRawName(lines, componentRawNames),
      occurredAt: null,
    });
  };

  appendControl('Total Earnings', [
    'Sales',
    'Tax on Sales',
    'Tips',
    'Container Fees',
    'Tax on Container Fees',
    'Other Earnings',
    'Tax on Other Earnings',
  ]);
  appendControl('Total Uber Fees', [
    'Marketplace Fees',
    'Tax on Marketplace Fees',
    'Other Charges',
    'Tax On Other Charges',
  ]);
  appendControl('Total Marketing Spends', [
    'Offers On Items',
    'Provider Subsidy',
    'Marketing Adjustment',
    'Other Offer Charges',
    'Tax on offer spends',
    'Ad Spends',
    'Ad Credits',
    'Tax on Net Ad Spends',
  ]);
  appendControl('Total Amendments', [
    'Net Chargeback Amount',
    'Net Tax On Chargeback',
    'Marketplace Facilitator Tax',
    'Adjustments',
    'Tax On Adjustments',
  ]);
  appendControl('Net Total', [
    'Total Earnings',
    'Total Uber Fees',
    'Total Marketing Spends',
    'Total Amendments',
  ]);
  return lines;
};

const sourceLines = () =>
  withUberControlTotals([
    {
      lineStableId: 'line-sales',
      lineNo: 1,
      rawCode: null,
      rawName: 'Sales',
      component: AccountingFinancialComponent.SALES,
      postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
      taxRole: AccountingFinancialTaxRole.NONE,
      amountCents: 10_000,
      occurredAt: null,
    },
    {
      lineStableId: 'line-sales-tax',
      lineNo: 2,
      rawCode: null,
      rawName: 'Tax on Sales',
      component: AccountingFinancialComponent.SALES_TAX,
      postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
      taxRole: AccountingFinancialTaxRole.NONE,
      amountCents: 1_300,
      occurredAt: null,
    },
  ]);

const correctedLines = () =>
  withUberControlTotals([
    {
      lineStableId: 'line-sales',
      lineNo: 1,
      rawCode: null,
      rawName: 'Sales',
      component: AccountingFinancialComponent.SALES,
      postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
      taxRole: AccountingFinancialTaxRole.NONE,
      amountCents: 10_100,
      occurredAt: null,
    },
    {
      lineStableId: 'line-sales-tax',
      lineNo: 2,
      rawCode: null,
      rawName: 'Tax on Sales',
      component: AccountingFinancialComponent.SALES_TAX,
      postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
      taxRole: AccountingFinancialTaxRole.NONE,
      amountCents: 1_300,
      occurredAt: null,
    },
  ]);

const CLOVER_DOCUMENT = 'acctfindoc_clover_june';
const CLOVER_OCCURRED_AT = new Date('2026-06-30T03:59:59.999Z');

const cloverSourceLines = (): ProviderLine[] => [
  {
    lineStableId: 'clover-service-charges',
    lineNo: 1,
    rawCode: null,
    rawName: 'Service Charges',
    component: AccountingFinancialComponent.PROCESSING_FEE,
    postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
    taxRole: AccountingFinancialTaxRole.NONE,
    amountCents: -6264,
    occurredAt: null,
  },
  {
    lineStableId: 'clover-fees-control',
    lineNo: 2,
    rawCode: CLOVER_STATEMENT_RAW_CODES.FEES_TOTAL,
    rawName: 'Fees',
    component: AccountingFinancialComponent.CONTROL_TOTAL,
    postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
    taxRole: AccountingFinancialTaxRole.NONE,
    amountCents: -3575,
    occurredAt: null,
  },
  {
    lineStableId: 'clover-equipment',
    lineNo: 3,
    rawCode: CLOVER_STATEMENT_RAW_CODES.MONTHLY_EQUIPMENT_BILL,
    rawName: 'Monthly Equipment Bill',
    component: AccountingFinancialComponent.PLATFORM_OTHER_FEE,
    postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
    taxRole: AccountingFinancialTaxRole.NONE,
    amountCents: -3000,
    occurredAt: null,
  },
  {
    lineStableId: 'clover-equipment-hst',
    lineNo: 4,
    rawCode: CLOVER_STATEMENT_RAW_CODES.MONTHLY_EQUIPMENT_BILL_HST,
    rawName: 'Monthly Equipment Bill HST',
    component: AccountingFinancialComponent.PLATFORM_OTHER_FEE_TAX,
    postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
    taxRole: AccountingFinancialTaxRole.INPUT_TAX,
    amountCents: -390,
    occurredAt: null,
  },
  {
    lineStableId: 'clover-network',
    lineNo: 5,
    rawCode: CLOVER_STATEMENT_RAW_CODES.NETWORK_FEES,
    rawName: 'Other Card/Network Fees',
    component: AccountingFinancialComponent.PROCESSING_FEE,
    postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
    taxRole: AccountingFinancialTaxRole.NONE,
    amountCents: -185,
    occurredAt: null,
  },
];

const cloverCorrectedLines = (): ProviderLine[] =>
  cloverSourceLines().map((line) => {
    if (line.lineStableId === 'clover-network') {
      return { ...line, amountCents: -285 };
    }
    if (line.lineStableId === 'clover-fees-control') {
      return { ...line, amountCents: -3675 };
    }
    return line;
  });

const toCloverPlanDocument = (lines: ProviderLine[]) => ({
  documentStableId: CLOVER_DOCUMENT,
  revision: 1,
  provider: AccountingFinancialProvider.CLOVER,
  documentType: AccountingFinancialDocumentType.STATEMENT,
  storeStableId: STORE,
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  currency: 'CAD',
  lines: lines.map((line) => ({
    lineStableId: line.lineStableId,
    lineNo: line.lineNo,
    rawCode: line.rawCode,
    rawName: line.rawName,
    component: line.component,
    postingTreatment: line.postingTreatment,
    amountCents: line.amountCents,
  })),
});

const toPlanDocument = (lines: ProviderLine[]) => ({
  documentStableId: DOCUMENT,
  revision: 1,
  provider: AccountingFinancialProvider.UBER_EATS,
  documentType: AccountingFinancialDocumentType.STATEMENT,
  storeStableId: STORE,
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  currency: 'CAD',
  lines: lines.map((line) => ({
    lineStableId: line.lineStableId,
    lineNo: line.lineNo,
    rawCode: line.rawCode,
    rawName: line.rawName,
    component: line.component,
    postingTreatment: line.postingTreatment,
    amountCents: line.amountCents,
  })),
});

const persistedJournal = (
  input: AccountingJournalCreateInput,
  entryStableId: string,
  idempotencyHash: string,
) => ({
  entryStableId,
  idempotencyKey: input.idempotencyKey,
  idempotencyHash,
  version: 1,
  kind: input.kind,
  source: input.source,
  sourceFactType: input.sourceFactType,
  sourceFactStableId: input.sourceFactStableId,
  sourceFactVersion: input.sourceFactVersion,
  storeStableId: input.storeStableId,
  occurredAt: new Date(input.occurredAt),
  currency: input.currency,
  memo: input.memo ?? null,
  deletedAt: null,
  lines: input.lines.map((line, index) => ({
    lineNo: index + 1,
    debitCents: line.debitCents ?? 0,
    creditCents: line.creditCents ?? 0,
    memo: line.memo ?? null,
    account: { accountStableId: line.accountStableId },
    category: line.categoryStableId
      ? { categoryStableId: line.categoryStableId }
      : null,
  })),
});

const editableLines = (lines: ProviderLine[]) =>
  lines.map((line) => ({
    lineStableId: line.lineStableId,
    rawCode: line.rawCode,
    rawName: line.rawName,
    component: line.component,
    postingTreatment: line.postingTreatment,
    taxRole: line.taxRole,
    amountCents: line.amountCents,
  }));

const makeFixture = () => {
  const lines = sourceLines();
  const plan = buildProviderSettlementDocumentPlan({
    document: toPlanDocument(lines),
    salesAuthority: 'STATEMENT_AUTHORITATIVE',
    occurredAt: OCCURRED_AT,
  });
  if (plan.status !== 'READY' || !plan.draftJournal) {
    throw new Error('test Provider plan must be READY');
  }

  const originalOrderJournalStableId = 'journal_order_uber_1';
  const originalOrderAnchor = {
    originalJournalEntryStableId: originalOrderJournalStableId,
    idempotencyKey: 'canonical-sale:order-uber-1:v1',
    idempotencyHash: 'b'.repeat(64),
    version: 1,
    sourceFactStableId: 'order-uber-1',
  };
  const accountPrerequisites = plan.requiredAccountStableIds.map(
    (accountStableId) => {
      const requirement = ACCOUNT_REQUIREMENTS[accountStableId];
      if (!requirement) {
        throw new Error('missing test account requirement: ' + accountStableId);
      }
      return {
        accountStableId,
        expected: requirement,
        actual: requirement,
      };
    },
  );

  const group: ProviderSettlementReplacementGroupAuthorityV1 = {
    version: 1,
    expectedPlanHash: 'a'.repeat(64),
    provider: AccountingFinancialProvider.UBER_EATS,
    documentType: AccountingFinancialDocumentType.STATEMENT,
    businessIdentityKey: 'uber:statement:2026-09',
    documentStableId: DOCUMENT,
    revision: 1,
    providerDocumentRef: 'uber-september-2026',
    storeStableId: STORE,
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    salesAuthority: 'STATEMENT_AUTHORITATIVE',
    reviewEvidence: {
      inboxItemStableId: 'inbox_uber_sep',
      status: AccountingInboxStatus.CONFIRMED,
      materializedEntityType:
        AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT,
      materializedEntityStableId: DOCUMENT,
      reviewedAt: '2026-10-01T12:00:00.000Z',
      reviewedByUserStableId: 'user_admin_1',
      version: 2,
    },
    coverageEvidence: {
      coverageStableId: 'coverage_uber',
      financialHistoryRequiredFrom: '2026-06-01',
      financialCompleteThrough: '2026-09-30',
      liveOrderFactCutoverAt: null,
      orderDetailCoverageFrom: null,
      updatedAt: '2026-10-01T12:00:00.000Z',
    },
    accountPrerequisites,
    historicalReversalAnchors: [originalOrderAnchor],
  };

  const providerWriteAuthority = buildProviderSettlementJournalWriteAuthority({
    group,
    role: 'PROVIDER_DOCUMENT',
  });
  const providerJournal = persistedJournal(
    plan.draftJournal,
    'journal_provider_uber_sep',
    hashProviderSettlementJournalWrite(
      normalizeJournalCreate(plan.draftJournal),
      providerWriteAuthority,
    ),
  );

  const reversalInput = buildUberPreCutoverOrderReversalDraft({
    entryStableId: originalOrderJournalStableId,
    storeStableId: STORE,
    occurredAt: new Date('2026-09-15T16:00:00.000Z'),
    currency: 'CAD',
    lines: [
      {
        accountStableId: 'account_uber_pending',
        categoryStableId: null,
        debitCents: 1_130,
        creditCents: 0,
        memo: null,
      },
      {
        accountStableId: 'account_sales_revenue',
        categoryStableId: null,
        debitCents: 0,
        creditCents: 1_000,
        memo: null,
      },
      {
        accountStableId: 'account_hst_payable',
        categoryStableId: null,
        debitCents: 0,
        creditCents: 130,
        memo: null,
      },
    ],
  });
  const reversalWriteAuthority = buildProviderSettlementJournalWriteAuthority({
    group,
    role: 'UBER_PRE_CUTOVER_REVERSAL',
    originalJournalEntryStableId: originalOrderJournalStableId,
  });
  const reversalJournal = persistedJournal(
    reversalInput,
    'journal_uber_reversal_1',
    hashProviderSettlementJournalWrite(
      normalizeJournalCreate(reversalInput),
      reversalWriteAuthority,
    ),
  );

  const document = {
    documentStableId: DOCUMENT,
    provider: AccountingFinancialProvider.UBER_EATS,
    documentType: AccountingFinancialDocumentType.STATEMENT,
    businessIdentityKey: group.businessIdentityKey,
    revision: 1,
    storeStableId: STORE,
    providerDocumentRef: group.providerDocumentRef,
    periodStart: new Date('2026-09-01T00:00:00.000Z'),
    periodEnd: new Date('2026-09-30T00:00:00.000Z'),
    currency: 'CAD',
    artifact: {
      inboxItem: {
        inboxItemStableId: group.reviewEvidence.inboxItemStableId,
        status: AccountingInboxStatus.CONFIRMED,
        materializedEntityType:
          AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT,
        materializedEntityStableId: DOCUMENT,
        reviewedAt: new Date(group.reviewEvidence.reviewedAt),
        reviewedByUserStableId: group.reviewEvidence.reviewedByUserStableId,
        version: group.reviewEvidence.version,
      },
    },
    lines,
    reviewRevisions: [],
  };

  const auditByJournal = new Map([
    [
      providerJournal.entryStableId,
      { afterJson: { writeAuthority: providerWriteAuthority } },
    ],
    [
      reversalJournal.entryStableId,
      { afterJson: { writeAuthority: reversalWriteAuthority } },
    ],
  ]);
  const accounts = plan.requiredAccountStableIds.map((accountStableId) => {
    const requirement = ACCOUNT_REQUIREMENTS[accountStableId];
    if (!requirement) {
      throw new Error('missing test account requirement: ' + accountStableId);
    }
    return {
      accountStableId,
      accountClass: requirement.accountClass,
      currency: requirement.currency,
    };
  });

  const db = {
    accountingProviderFinancialDocument: {
      findUnique: jest.fn().mockResolvedValue(document),
    },
    accountingJournalEntry: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest
        .fn()
        .mockImplementation((args: { where?: { sourceFactType?: string } }) => {
          if (
            args.where?.sourceFactType ===
            'accounting.provider_financial_document.v1'
          ) {
            return Promise.resolve([providerJournal]);
          }
          if (
            args.where?.sourceFactType ===
            'accounting.uber_pre_cutover_order_reversal.v1'
          ) {
            return Promise.resolve([reversalJournal]);
          }
          return Promise.resolve([]);
        }),
    },
    accountingAuditLog: {
      findFirst: jest
        .fn()
        .mockImplementation((args: { where?: { entityId?: string } }) =>
          Promise.resolve(
            args.where?.entityId
              ? (auditByJournal.get(args.where.entityId) ?? null)
              : null,
          ),
        ),
    },
    accountingCorrectionCase: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    accountingAccount: {
      findMany: jest.fn().mockResolvedValue(accounts),
    },
    accountingCategory: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  return {
    db,
    document,
    group,
    providerJournal,
    reversalJournal,
    reversalInput,
  };
};

const makeCloverBridgeFixture = () => {
  const lines = cloverSourceLines();
  const currentPlan = buildProviderSettlementDocumentPlan({
    document: toCloverPlanDocument(lines),
    salesAuthority: 'RECONCILIATION_ONLY',
    occurredAt: CLOVER_OCCURRED_AT,
  });
  if (currentPlan.status !== 'READY' || !currentPlan.draftJournal) {
    throw new Error('test Clover plan must be READY');
  }

  const pendingAccountStableId =
    ACCOUNTING_PROVIDER_PENDING_ACCOUNT_IDS[AccountingFinancialProvider.CLOVER];
  const accountStableIds = Array.from(
    new Set([...currentPlan.requiredAccountStableIds, pendingAccountStableId]),
  );
  const accountPrerequisites = accountStableIds.map((accountStableId) => {
    const requirement = ACCOUNT_REQUIREMENTS[accountStableId];
    if (!requirement) {
      throw new Error(
        'missing Clover test account requirement: ' + accountStableId,
      );
    }
    return {
      accountStableId,
      expected: requirement,
      actual: requirement,
    };
  });

  const group: ProviderSettlementReplacementGroupAuthorityV1 = {
    version: 1,
    expectedPlanHash: 'c'.repeat(64),
    provider: AccountingFinancialProvider.CLOVER,
    documentType: AccountingFinancialDocumentType.STATEMENT,
    businessIdentityKey: 'clover:statement:2026-06',
    documentStableId: CLOVER_DOCUMENT,
    revision: 1,
    providerDocumentRef: 'clover-june-2026',
    storeStableId: STORE,
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    salesAuthority: 'RECONCILIATION_ONLY',
    reviewEvidence: {
      inboxItemStableId: 'inbox_clover_june',
      status: AccountingInboxStatus.CONFIRMED,
      materializedEntityType:
        AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT,
      materializedEntityStableId: CLOVER_DOCUMENT,
      reviewedAt: '2026-10-01T12:00:00.000Z',
      reviewedByUserStableId: 'user_admin_1',
      version: 2,
    },
    coverageEvidence: {
      coverageStableId: 'coverage_clover',
      financialHistoryRequiredFrom: '2026-06-01',
      financialCompleteThrough: '2026-06-30',
      liveOrderFactCutoverAt: null,
      orderDetailCoverageFrom: null,
      updatedAt: '2026-10-01T12:00:00.000Z',
    },
    accountPrerequisites,
    historicalReversalAnchors: [],
  };

  const providerWriteAuthority = buildProviderSettlementJournalWriteAuthority({
    group,
    role: 'PROVIDER_DOCUMENT',
  });
  const legacyProviderJournalInput: AccountingJournalCreateInput = {
    ...currentPlan.draftJournal,
    lines: currentPlan.draftJournal.lines.map((line) =>
      line.accountStableId === CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID
        ? { ...line, accountStableId: pendingAccountStableId }
        : line,
    ),
  };
  const providerJournal = persistedJournal(
    legacyProviderJournalInput,
    'journal_provider_clover_june',
    hashProviderSettlementJournalWrite(
      normalizeJournalCreate(legacyProviderJournalInput),
      providerWriteAuthority,
    ),
  );

  const feeAmountCents = currentPlan.draftJournal.lines
    .filter(
      (line) => line.accountStableId === CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
    )
    .reduce((sum, line) => sum + (line.creditCents ?? 0), 0);
  if (feeAmountCents <= 0) {
    throw new Error('test Clover plan must credit fee payable');
  }
  const bridgeInput: AccountingJournalCreateInput = {
    idempotencyKey: `clover-fee-pending-reclass:${CLOVER_DOCUMENT}:r1:v1`,
    kind: AccountingJournalEntryKind.ADJUSTMENT,
    source: AccountingJournalSource.PLATFORM_STATEMENT,
    sourceFactType: CLOVER_FEE_RECLASSIFICATION_SOURCE_FACT_TYPE,
    sourceFactStableId: CLOVER_DOCUMENT,
    sourceFactVersion: 1,
    storeStableId: STORE,
    occurredAt: CLOVER_OCCURRED_AT.toISOString(),
    currency: 'CAD',
    memo:
      `Reclass legacy Clover statement fees from Pending to fee payable ` +
      `${CLOVER_DOCUMENT} r1`,
    lines: [
      {
        accountStableId: pendingAccountStableId,
        debitCents: feeAmountCents,
        creditCents: 0,
        memo: 'Restore Clover sales Pending',
      },
      {
        accountStableId: CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
        debitCents: 0,
        creditCents: feeAmountCents,
        memo: 'Recognize Clover fee payable',
      },
    ],
  };
  const bridgeJournal = persistedJournal(
    bridgeInput,
    'journal_clover_fee_reclassification_1',
    hashJournalCreatePayload(normalizeJournalCreate(bridgeInput)),
  );

  const document = {
    documentStableId: CLOVER_DOCUMENT,
    provider: AccountingFinancialProvider.CLOVER,
    documentType: AccountingFinancialDocumentType.STATEMENT,
    businessIdentityKey: group.businessIdentityKey,
    revision: 1,
    storeStableId: STORE,
    providerDocumentRef: group.providerDocumentRef,
    periodStart: new Date('2026-06-01T00:00:00.000Z'),
    periodEnd: new Date('2026-06-30T00:00:00.000Z'),
    currency: 'CAD',
    artifact: {
      inboxItem: {
        inboxItemStableId: group.reviewEvidence.inboxItemStableId,
        status: AccountingInboxStatus.CONFIRMED,
        materializedEntityType:
          AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT,
        materializedEntityStableId: CLOVER_DOCUMENT,
        reviewedAt: new Date(group.reviewEvidence.reviewedAt),
        reviewedByUserStableId: group.reviewEvidence.reviewedByUserStableId,
        version: group.reviewEvidence.version,
      },
    },
    lines,
    reviewRevisions: [],
  };

  const accounts = accountStableIds.map((accountStableId) => {
    const requirement = ACCOUNT_REQUIREMENTS[accountStableId];
    if (!requirement) {
      throw new Error(
        'missing Clover test account requirement: ' + accountStableId,
      );
    }
    return {
      accountStableId,
      accountClass: requirement.accountClass,
      currency: requirement.currency,
    };
  });
  const categoryStableIds = Array.from(
    new Set(
      currentPlan.draftJournal.lines.flatMap((line) =>
        line.categoryStableId ? [line.categoryStableId] : [],
      ),
    ),
  );
  const auditByJournal = new Map([
    [
      providerJournal.entryStableId,
      { afterJson: { writeAuthority: providerWriteAuthority } },
    ],
  ]);

  const db = {
    accountingProviderFinancialDocument: {
      findUnique: jest.fn().mockResolvedValue(document),
    },
    accountingJournalEntry: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest
        .fn()
        .mockImplementation((args: { where?: { sourceFactType?: string } }) => {
          if (
            args.where?.sourceFactType ===
            'accounting.provider_financial_document.v1'
          ) {
            return Promise.resolve([providerJournal]);
          }
          if (
            args.where?.sourceFactType ===
            CLOVER_FEE_RECLASSIFICATION_SOURCE_FACT_TYPE
          ) {
            return Promise.resolve([bridgeJournal]);
          }
          return Promise.resolve([]);
        }),
    },
    accountingAuditLog: {
      findFirst: jest
        .fn()
        .mockImplementation((args: { where?: { entityId?: string } }) =>
          Promise.resolve(
            args.where?.entityId
              ? (auditByJournal.get(args.where.entityId) ?? null)
              : null,
          ),
        ),
    },
    accountingCorrectionCase: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    accountingAccount: {
      findMany: jest.fn().mockResolvedValue(accounts),
    },
    accountingCategory: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          categoryStableIds.map((categoryStableId) => ({ categoryStableId })),
        ),
    },
  };

  return {
    db,
    document,
    providerJournal,
    bridgeJournal,
    bridgeInput,
    currentPlan,
  };
};

describe('AccountingProviderSettlementCorrectionAdapter', () => {
  it('builds a DELTA target through the existing Provider settlement policy and freezes Uber reversal prerequisites', async () => {
    const fixture = makeFixture();
    const adapter = new AccountingProviderSettlementCorrectionAdapter(
      fixture.db as never,
    );
    const current = await adapter.readCurrentEffectiveTarget(DOCUMENT, 1);

    expect(current.targetKind).toBe(
      AccountingPostedCorrectionTargetKind.PROVIDER_SETTLEMENT,
    );
    expect(
      current.targetJson.historicalReversalOriginalJournalEntryStableIds,
    ).toEqual(['journal_order_uber_1']);

    const normalized = await adapter.normalizeRevisionTarget(
      {
        targetStableId: DOCUMENT,
        targetVersion: 1,
        reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
        targetJson: {
          version: 1,
          expectedBaseAuthorityHash: current.targetAuthorityHash,
          lines: editableLines(correctedLines()),
        },
      },
      fixture.db as never,
    );
    const ready = await adapter.resolveReadyTarget(
      {
        targetStableId: DOCUMENT,
        targetVersion: 1,
        reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
        targetJson: normalized.targetJson,
      },
      fixture.db as never,
    );

    expect(ready.strategy).toBe('DELTA');
    expect(
      ready.originalJournals.map((journal) => journal.entryStableId),
    ).toEqual(['journal_provider_uber_sep', 'journal_uber_reversal_1']);
    expect(ready.targetJournals).toHaveLength(2);
    expect(ready.targetJournals[1]).toEqual(fixture.reversalInput);
    expect(ready.targetJournals[0]?.idempotencyKey).toBe(
      fixture.providerJournal.idempotencyKey,
    );
    expect(ready.targetAuthorityHash).toBe(normalized.targetAuthorityHash);
    expect(ready.baseAuthorityHash).toBe(current.targetAuthorityHash);

    const preview = buildPostedFinancialCorrectionPreviewPlan({
      correctionStableId: 'correction_provider_1',
      targetKind: AccountingPostedCorrectionTargetKind.PROVIDER_SETTLEMENT,
      targetStableId: DOCUMENT,
      targetVersion: 1,
      strategy: ready.strategy,
      reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
      baseAuthoritySchema: ready.baseAuthoritySchema,
      baseAuthorityHash: ready.baseAuthorityHash,
      targetAuthoritySchema: ready.targetAuthoritySchema,
      targetAuthorityHash: ready.targetAuthorityHash,
      currency: ready.currency,
      originalJournals: ready.originalJournals,
      priorCorrectionJournals: [],
      targetJournals: ready.targetJournals,
    });

    expect(preview.status).toBe('READY');
    expect(preview.deltaPosting.lines.length).toBeGreaterThan(0);
    const deltaDebitCents = preview.deltaPosting.lines.reduce(
      (sum, line) => sum + line.debitCents,
      0,
    );
    const deltaCreditCents = preview.deltaPosting.lines.reduce(
      (sum, line) => sum + line.creditCents,
      0,
    );
    expect(deltaDebitCents).toBe(deltaCreditCents);
  });

  it('uses validated legacy Clover reclassification as common baseline', async () => {
    const fixture = makeCloverBridgeFixture();
    const adapter = new AccountingProviderSettlementCorrectionAdapter(
      fixture.db as never,
    );
    const current = await adapter.readCurrentEffectiveTarget(
      CLOVER_DOCUMENT,
      1,
    );
    const normalized = await adapter.normalizeRevisionTarget(
      {
        targetStableId: CLOVER_DOCUMENT,
        targetVersion: 1,
        reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
        targetJson: {
          version: 1,
          expectedBaseAuthorityHash: current.targetAuthorityHash,
          lines: editableLines(cloverCorrectedLines()),
        },
      },
      fixture.db as never,
    );
    const ready = await adapter.resolveReadyTarget(
      {
        targetStableId: CLOVER_DOCUMENT,
        targetVersion: 1,
        reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
        targetJson: normalized.targetJson,
      },
      fixture.db as never,
    );

    expect(
      ready.originalJournals.map((journal) => journal.entryStableId),
    ).toEqual([
      fixture.providerJournal.entryStableId,
      fixture.bridgeJournal.entryStableId,
    ]);
    expect(ready.targetJournals).toHaveLength(1);

    const preview = buildPostedFinancialCorrectionPreviewPlan({
      correctionStableId: 'correction_clover_after_legacy_bridge',
      targetKind: AccountingPostedCorrectionTargetKind.PROVIDER_SETTLEMENT,
      targetStableId: CLOVER_DOCUMENT,
      targetVersion: 1,
      strategy: ready.strategy,
      reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
      baseAuthoritySchema: ready.baseAuthoritySchema,
      baseAuthorityHash: ready.baseAuthorityHash,
      targetAuthoritySchema: ready.targetAuthoritySchema,
      targetAuthorityHash: ready.targetAuthorityHash,
      currency: ready.currency,
      originalJournals: ready.originalJournals,
      priorCorrectionJournals: [],
      targetJournals: ready.targetJournals,
    });

    expect(preview.status).toBe('READY');
    expect(preview.deltaPosting.lines.length).toBeGreaterThan(0);
    expect(
      preview.deltaPosting.lines.some(
        (line) =>
          line.accountStableId ===
          ACCOUNTING_PROVIDER_PENDING_ACCOUNT_IDS[
            AccountingFinancialProvider.CLOVER
          ],
      ),
    ).toBe(false);
    expect(
      preview.deltaPosting.lines.reduce(
        (sum, line) => sum + line.debitCents,
        0,
      ),
    ).toBe(
      preview.deltaPosting.lines.reduce(
        (sum, line) => sum + line.creditCents,
        0,
      ),
    );
  });

  it('fails closed when the legacy Clover bridge has the wrong Journal source', async () => {
    const fixture = makeCloverBridgeFixture();
    fixture.bridgeJournal.source = AccountingJournalSource.MANUAL;
    const adapter = new AccountingProviderSettlementCorrectionAdapter(
      fixture.db as never,
    );

    await expect(
      adapter.readCurrentEffectiveTarget(CLOVER_DOCUMENT, 1),
    ).rejects.toThrow(
      'specialized Clover fee reclassification Journal is not a valid legacy compatibility bridge',
    );
  });

  it('fails closed on a tampered legacy Clover reclassification hash', async () => {
    const fixture = makeCloverBridgeFixture();
    fixture.bridgeJournal.idempotencyHash = 'f'.repeat(64);
    const adapter = new AccountingProviderSettlementCorrectionAdapter(
      fixture.db as never,
    );

    await expect(
      adapter.readCurrentEffectiveTarget(CLOVER_DOCUMENT, 1),
    ).rejects.toThrow(
      'specialized Clover fee reclassification Journal hash is inconsistent',
    );
  });

  it('fails closed when the Clover bridge does not reconcile', async () => {
    const fixture = makeCloverBridgeFixture();
    const mismatchedInput: AccountingJournalCreateInput = {
      ...fixture.bridgeInput,
      lines: fixture.bridgeInput.lines.map((line) => ({
        ...line,
        debitCents:
          line.accountStableId ===
          ACCOUNTING_PROVIDER_PENDING_ACCOUNT_IDS[
            AccountingFinancialProvider.CLOVER
          ]
            ? (line.debitCents ?? 0) + 1
            : line.debitCents,
        creditCents:
          line.accountStableId === CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID
            ? (line.creditCents ?? 0) + 1
            : line.creditCents,
      })),
    };
    const mismatchedJournal = persistedJournal(
      mismatchedInput,
      fixture.bridgeJournal.entryStableId,
      hashJournalCreatePayload(normalizeJournalCreate(mismatchedInput)),
    );
    Object.assign(fixture.bridgeJournal, mismatchedJournal);
    const adapter = new AccountingProviderSettlementCorrectionAdapter(
      fixture.db as never,
    );

    await expect(
      adapter.readCurrentEffectiveTarget(CLOVER_DOCUMENT, 1),
    ).rejects.toThrow(
      'legacy Clover fee reclassification does not reconcile the original Journal to current Provider posting policy',
    );
  });

  it('fails closed when multiple active legacy Clover bridge Journals are present', async () => {
    const fixture = makeCloverBridgeFixture();
    fixture.db.accountingJournalEntry.findMany.mockImplementation(
      (args: { where?: { sourceFactType?: string } }) => {
        if (
          args.where?.sourceFactType ===
          'accounting.provider_financial_document.v1'
        ) {
          return Promise.resolve([fixture.providerJournal]);
        }
        if (
          args.where?.sourceFactType ===
          CLOVER_FEE_RECLASSIFICATION_SOURCE_FACT_TYPE
        ) {
          return Promise.resolve([
            fixture.bridgeJournal,
            {
              ...fixture.bridgeJournal,
              entryStableId: 'journal_clover_fee_reclassification_2',
            },
          ]);
        }
        return Promise.resolve([]);
      },
    );
    const adapter = new AccountingProviderSettlementCorrectionAdapter(
      fixture.db as never,
    );

    await expect(
      adapter.readCurrentEffectiveTarget(CLOVER_DOCUMENT, 1),
    ).rejects.toThrow(
      'posted Clover Statement has multiple specialized fee reclassification Journals',
    );
  });

  it('still fails closed when a legacy Clover Journal has no bridge', async () => {
    const fixture = makeCloverBridgeFixture();
    fixture.db.accountingJournalEntry.findMany.mockImplementation(
      (args: { where?: { sourceFactType?: string } }) => {
        if (
          args.where?.sourceFactType ===
          'accounting.provider_financial_document.v1'
        ) {
          return Promise.resolve([fixture.providerJournal]);
        }
        return Promise.resolve([]);
      },
    );
    const adapter = new AccountingProviderSettlementCorrectionAdapter(
      fixture.db as never,
    );

    await expect(
      adapter.readCurrentEffectiveTarget(CLOVER_DOCUMENT, 1),
    ).rejects.toThrow(
      'Provider effective business authority no longer rebuilds the original posted Journal',
    );
  });

  it('rejects DUPLICATE_POSTING in the B1 normal DELTA flow', async () => {
    const fixture = makeFixture();
    const adapter = new AccountingProviderSettlementCorrectionAdapter(
      fixture.db as never,
    );
    const current = await adapter.readCurrentEffectiveTarget(DOCUMENT, 1);

    await expect(
      adapter.normalizeRevisionTarget(
        {
          targetStableId: DOCUMENT,
          targetVersion: 1,
          reasonCode: AccountingPostedCorrectionReasonCode.DUPLICATE_POSTING,
          targetJson: current.draftInput,
        },
        fixture.db as never,
      ),
    ).rejects.toThrow(
      'Provider correction B1 normal DELTA does not support DUPLICATE_POSTING',
    );
  });

  it('rejects a stale editor authority hash before creating a typed correction Revision', async () => {
    const fixture = makeFixture();
    const adapter = new AccountingProviderSettlementCorrectionAdapter(
      fixture.db as never,
    );

    await expect(
      adapter.normalizeRevisionTarget(
        {
          targetStableId: DOCUMENT,
          targetVersion: 1,
          reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
          targetJson: {
            version: 1,
            expectedBaseAuthorityHash: 'f'.repeat(64),
            lines: editableLines(correctedLines()),
          },
        },
        fixture.db as never,
      ),
    ).rejects.toThrow(
      'Provider correction target was edited from a stale current-effective authority',
    );
  });

  it('uses the latest POSTED correction target as the next current-effective business authority', async () => {
    const fixture = makeFixture();
    const adapter = new AccountingProviderSettlementCorrectionAdapter(
      fixture.db as never,
    );
    const original = await adapter.readCurrentEffectiveTarget(DOCUMENT, 1);
    const normalized = await adapter.normalizeRevisionTarget(
      {
        targetStableId: DOCUMENT,
        targetVersion: 1,
        reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
        targetJson: {
          version: 1,
          expectedBaseAuthorityHash: original.targetAuthorityHash,
          lines: editableLines(correctedLines()),
        },
      },
      fixture.db as never,
    );

    fixture.db.accountingCorrectionCase.findMany.mockResolvedValue([
      {
        correctionStableId: 'correction_provider_posted_1',
        targetKind: AccountingPostedCorrectionTargetKind.PROVIDER_SETTLEMENT,
        targetStableId: DOCUMENT,
        targetVersion: 1,
        status: 'POSTED',
        reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
        note: null,
        strategy: 'DELTA',
        targetAuthoritySchema: normalized.targetAuthoritySchema,
        targetAuthorityHash: normalized.targetAuthorityHash,
        postedByActorRef: 'user_1',
        postedAt: new Date('2026-10-07T12:00:00.000Z'),
        createdAt: new Date('2026-10-07T11:00:00.000Z'),
        readyRevision: {
          targetAuthoritySchema: normalized.targetAuthoritySchema,
          targetAuthorityHash: normalized.targetAuthorityHash,
          targetJson: normalized.targetJson,
        },
      },
    ] as never);

    const current = await adapter.readCurrentEffectiveTarget(DOCUMENT, 1);

    expect(current.targetAuthorityHash).toBe(normalized.targetAuthorityHash);
    expect(current.draftInput.expectedBaseAuthorityHash).toBe(
      normalized.targetAuthorityHash,
    );
    expect(
      current.draftInput.lines.find(
        (line) => line.lineStableId === 'line-sales',
      )?.amountCents,
    ).toBe(10_100);
  });

  it('treats the POSTED Correction Case as activation authority without mutating Provider source rows', async () => {
    const fixture = makeFixture();
    const adapter = new AccountingProviderSettlementCorrectionAdapter(
      fixture.db as never,
    );
    const current = await adapter.readCurrentEffectiveTarget(DOCUMENT, 1);
    const normalized = await adapter.normalizeRevisionTarget(
      {
        targetStableId: DOCUMENT,
        targetVersion: 1,
        reasonCode: AccountingPostedCorrectionReasonCode.EXTRACTION_ERROR,
        targetJson: {
          ...current.draftInput,
          lines: current.draftInput.lines.map((line) =>
            line.lineStableId === 'line-sales'
              ? { ...line, rawName: 'Corrected Sales' }
              : line,
          ),
        },
      },
      fixture.db as never,
    );

    await expect(
      adapter.activateTargetInTx(
        {
          correctionStableId: 'correction_provider_1',
          correctionRevisionStableId: 'correction_revision_1',
          correctionRevision: 1,
          targetStableId: DOCUMENT,
          targetVersion: 1,
          targetAuthoritySchema: normalized.targetAuthoritySchema,
          targetAuthorityHash: normalized.targetAuthorityHash,
          targetJson: normalized.targetJson as never,
          plan: {} as never,
        },
        fixture.db as never,
      ),
    ).resolves.toBeUndefined();

    await expect(
      adapter.activateTargetInTx(
        {
          correctionStableId: 'correction_provider_1',
          correctionRevisionStableId: 'correction_revision_1',
          correctionRevision: 1,
          targetStableId: 'provider_doc_wrong',
          targetVersion: 1,
          targetAuthoritySchema: normalized.targetAuthoritySchema,
          targetAuthorityHash: normalized.targetAuthorityHash,
          targetJson: normalized.targetJson as never,
          plan: {} as never,
        },
        fixture.db as never,
      ),
    ).rejects.toThrow(
      'Provider correction activation target identity changed before POSTED',
    );

    fixture.db.accountingProviderFinancialDocument.findUnique.mockResolvedValueOnce(
      { revision: 2 } as never,
    );
    await expect(
      adapter.activateTargetInTx(
        {
          correctionStableId: 'correction_provider_1',
          correctionRevisionStableId: 'correction_revision_1',
          correctionRevision: 1,
          targetStableId: DOCUMENT,
          targetVersion: 1,
          targetAuthoritySchema: normalized.targetAuthoritySchema,
          targetAuthorityHash: normalized.targetAuthorityHash,
          targetJson: normalized.targetJson as never,
          plan: {} as never,
        },
        fixture.db as never,
      ),
    ).rejects.toThrow(
      'Provider correction source document changed before POSTED',
    );

    expect(
      fixture.db.accountingProviderFinancialDocument.findUnique,
    ).toHaveBeenCalled();
  });
});
