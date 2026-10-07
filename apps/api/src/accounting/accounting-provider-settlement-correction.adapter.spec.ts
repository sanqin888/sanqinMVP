import {
  AccountingAccountClass,
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
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
  normalizeJournalCreate,
  type AccountingJournalCreateInput,
} from './accounting-journal-policy';

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
      findFirst: jest.fn().mockResolvedValue(null),
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

  it('fails closed for a Clover Statement that already has the specialized fee reclassification Journal', async () => {
    const fixture = makeFixture();
    fixture.db.accountingProviderFinancialDocument.findUnique.mockResolvedValue(
      {
        ...fixture.document,
        provider: AccountingFinancialProvider.CLOVER,
      } as never,
    );
    fixture.db.accountingJournalEntry.findFirst.mockResolvedValue({
      entryStableId: 'journal_clover_fee_reclassification_1',
    } as never);
    const adapter = new AccountingProviderSettlementCorrectionAdapter(
      fixture.db as never,
    );

    await expect(
      adapter.readCurrentEffectiveTarget(DOCUMENT, 1),
    ).rejects.toThrow(
      'posted Clover Statement already has a specialized fee reclassification',
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

    fixture.db.accountingCorrectionCase.findFirst.mockResolvedValue({
      targetAuthoritySchema: normalized.targetAuthoritySchema,
      targetAuthorityHash: normalized.targetAuthorityHash,
      readyRevision: {
        targetAuthoritySchema: normalized.targetAuthoritySchema,
        targetAuthorityHash: normalized.targetAuthorityHash,
        targetJson: normalized.targetJson,
      },
    } as never);

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
