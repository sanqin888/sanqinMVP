import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  AccountingPostedCorrectionReasonCode,
  AccountingPostedCorrectionStrategy,
  AccountingPostedCorrectionTargetKind,
  type AccountingPostedCorrectionPostedJournalAnchorV1,
} from './accounting-posted-financial-correction.contract';
import {
  AccountingPostedFinancialCorrectionPolicyError,
  buildPostedCorrectionPostedJournalSetSnapshot,
  buildPostedFinancialCorrectionPreviewPlan,
  calculatePostedCorrectionDelta,
} from './accounting-posted-financial-correction.policy';
import type { AccountingJournalCreateInput } from './accounting-journal-policy';

const postedJournal = (
  overrides: Partial<AccountingPostedCorrectionPostedJournalAnchorV1> = {},
): AccountingPostedCorrectionPostedJournalAnchorV1 => ({
  entryStableId: 'journal_original_1',
  idempotencyKey: 'provider-settlement:statement_1:r1:v1',
  idempotencyHash: 'a'.repeat(64),
  version: 1,
  kind: AccountingJournalEntryKind.ADJUSTMENT,
  source: AccountingJournalSource.PLATFORM_STATEMENT,
  sourceFactType: 'accounting.provider_financial_document.v1',
  sourceFactStableId: 'statement_1',
  sourceFactVersion: 1,
  storeStableId: '4750_Yonge_Street',
  occurredAt: '2026-09-30T23:59:59.999Z',
  currency: 'CAD',
  memo: 'Provider statement',
  lines: [
    {
      lineNo: 1,
      accountStableId: 'account_platform_expense',
      categoryStableId: 'expense_platform_commission',
      debitCents: 10_000,
      creditCents: 0,
      memo: null,
    },
    {
      lineNo: 2,
      accountStableId: 'account_provider_pending',
      categoryStableId: null,
      debitCents: 0,
      creditCents: 10_000,
      memo: null,
    },
  ],
  ...overrides,
});

const targetJournal = (
  amountCents: number,
  categoryStableId = 'expense_platform_commission',
): AccountingJournalCreateInput => ({
  idempotencyKey: 'correction-target:statement_1:v1',
  kind: AccountingJournalEntryKind.ADJUSTMENT,
  source: AccountingJournalSource.PLATFORM_STATEMENT,
  sourceFactType: 'accounting.provider_financial_document.v1',
  sourceFactStableId: 'statement_1',
  sourceFactVersion: 1,
  storeStableId: '4750_Yonge_Street',
  occurredAt: '2026-09-30T23:59:59.999Z',
  currency: 'CAD',
  memo: 'Corrected provider statement target',
  lines: [
    {
      accountStableId: 'account_platform_expense',
      categoryStableId,
      debitCents: amountCents,
    },
    {
      accountStableId: 'account_provider_pending',
      creditCents: amountCents,
    },
  ],
});

const basePlanInput = () => ({
  correctionStableId: 'acctcorr_1',
  targetKind: AccountingPostedCorrectionTargetKind.PROVIDER_SETTLEMENT,
  targetStableId: 'statement_1',
  targetVersion: 1,
  strategy: AccountingPostedCorrectionStrategy.DELTA,
  reasonCode: AccountingPostedCorrectionReasonCode.MISSING_COMPONENT,
  baseAuthoritySchema: 'accounting.provider-settlement-correction-target.v1',
  baseAuthorityHash: 'b'.repeat(64),
  targetAuthoritySchema: 'accounting.provider-settlement-correction-target.v1',
  targetAuthorityHash: 'c'.repeat(64),
  currency: 'CAD',
  originalJournals: [postedJournal()],
  priorCorrectionJournals: [],
  targetJournals: [targetJournal(10_500)],
});

describe('posted financial correction policy', () => {
  it('normalizes a Journal Set into a deterministic account/category posting vector', () => {
    const second = postedJournal({
      entryStableId: 'journal_original_2',
      idempotencyKey: 'provider-settlement:statement_2:r1:v1',
      idempotencyHash: 'd'.repeat(64),
      sourceFactStableId: 'statement_2',
      lines: [
        {
          lineNo: 1,
          accountStableId: 'account_platform_expense',
          categoryStableId: 'expense_platform_commission',
          debitCents: 2_500,
          creditCents: 0,
          memo: null,
        },
        {
          lineNo: 2,
          accountStableId: 'account_provider_pending',
          categoryStableId: null,
          debitCents: 0,
          creditCents: 2_500,
          memo: null,
        },
      ],
    });

    const forward = buildPostedCorrectionPostedJournalSetSnapshot({
      currency: 'CAD',
      journals: [postedJournal(), second],
      requireNonEmpty: true,
    });
    const reverse = buildPostedCorrectionPostedJournalSetSnapshot({
      currency: 'CAD',
      journals: [second, postedJournal()],
      requireNonEmpty: true,
    });

    expect(forward.journalSetHash).toBe(reverse.journalSetHash);
    expect(forward.postingVector.lines).toEqual([
      {
        accountStableId: 'account_platform_expense',
        categoryStableId: 'expense_platform_commission',
        debitCents: 12_500,
        creditCents: 0,
      },
      {
        accountStableId: 'account_provider_pending',
        categoryStableId: null,
        debitCents: 0,
        creditCents: 12_500,
      },
    ]);
  });

  it('treats category reclassification as a real delta even when the account total is unchanged', () => {
    const plan = buildPostedFinancialCorrectionPreviewPlan({
      ...basePlanInput(),
      targetJournals: [targetJournal(10_000, 'expense_platform_advertising')],
    });

    expect(plan.status).toBe('READY');
    expect(plan.deltaPosting.lines).toEqual([
      {
        accountStableId: 'account_platform_expense',
        categoryStableId: 'expense_platform_advertising',
        debitCents: 10_000,
        creditCents: 0,
      },
      {
        accountStableId: 'account_platform_expense',
        categoryStableId: 'expense_platform_commission',
        debitCents: 0,
        creditCents: 10_000,
      },
    ]);
  });

  it('calculates repeated corrections against original plus all prior POSTED correction Journals', () => {
    const priorCorrection = postedJournal({
      entryStableId: 'journal_correction_1',
      idempotencyKey: 'posted-financial-correction:acctcorr_prior:delta:1:v1',
      idempotencyHash: 'e'.repeat(64),
      sourceFactType: 'accounting.posted_financial_correction.v1',
      sourceFactStableId: 'acctcorr_prior',
      lines: [
        {
          lineNo: 1,
          accountStableId: 'account_platform_expense',
          categoryStableId: 'expense_platform_commission',
          debitCents: 2_000,
          creditCents: 0,
          memo: null,
        },
        {
          lineNo: 2,
          accountStableId: 'account_provider_pending',
          categoryStableId: null,
          debitCents: 0,
          creditCents: 2_000,
          memo: null,
        },
      ],
    });

    const plan = buildPostedFinancialCorrectionPreviewPlan({
      ...basePlanInput(),
      priorCorrectionJournals: [priorCorrection],
      targetJournals: [targetJournal(13_000)],
    });

    expect(plan.currentEffectiveJournalSet.postingVector.lines).toEqual([
      {
        accountStableId: 'account_platform_expense',
        categoryStableId: 'expense_platform_commission',
        debitCents: 12_000,
        creditCents: 0,
      },
      {
        accountStableId: 'account_provider_pending',
        categoryStableId: null,
        debitCents: 0,
        creditCents: 12_000,
      },
    ]);
    expect(plan.authority.originalJournalSetHash).toBe(
      plan.originalJournalSet.journalSetHash,
    );
    expect(plan.authority.baseJournalSetHash).toBe(
      plan.currentEffectiveJournalSet.journalSetHash,
    );
    expect(plan.deltaPosting.lines).toEqual([
      {
        accountStableId: 'account_platform_expense',
        categoryStableId: 'expense_platform_commission',
        debitCents: 1_000,
        creditCents: 0,
      },
      {
        accountStableId: 'account_provider_pending',
        categoryStableId: null,
        debitCents: 0,
        creditCents: 1_000,
      },
    ]);
  });

  it('builds a deterministic planHash and changes it when a frozen Journal anchor changes', () => {
    const first = buildPostedFinancialCorrectionPreviewPlan(basePlanInput());
    const replay = buildPostedFinancialCorrectionPreviewPlan(basePlanInput());
    const changed = buildPostedFinancialCorrectionPreviewPlan({
      ...basePlanInput(),
      originalJournals: [postedJournal({ idempotencyHash: 'f'.repeat(64) })],
    });

    expect(first.planHash).toMatch(/^[a-f0-9]{64}$/);
    const authorityChanged = buildPostedFinancialCorrectionPreviewPlan({
      ...basePlanInput(),
      targetAuthorityHash: 'd'.repeat(64),
    });

    expect(first.planHash).toBe(replay.planHash);
    expect(first.planHash).not.toBe(changed.planHash);
    expect(first.planHash).not.toBe(authorityChanged.planHash);
    expect(first.authority.originalJournalAnchors).toEqual([
      {
        entryStableId: 'journal_original_1',
        idempotencyKey: 'provider-settlement:statement_1:r1:v1',
        idempotencyHash: 'a'.repeat(64),
        version: 1,
      },
    ]);
  });

  it('classifies an unchanged target as NOOP', () => {
    const plan = buildPostedFinancialCorrectionPreviewPlan({
      ...basePlanInput(),
      targetAuthorityHash: 'b'.repeat(64),
      targetJournals: [targetJournal(10_000)],
    });

    expect(plan.status).toBe('NOOP');
    expect(plan.deltaPosting.lines).toEqual([]);
  });

  it('builds REVERSAL_ONLY as the exact inverse of the current effective posting', () => {
    const plan = buildPostedFinancialCorrectionPreviewPlan({
      ...basePlanInput(),
      strategy: AccountingPostedCorrectionStrategy.REVERSAL_ONLY,
      reasonCode: AccountingPostedCorrectionReasonCode.DUPLICATE_POSTING,
      targetJournals: [],
    });

    expect(plan.status).toBe('READY');
    expect(plan.deltaPosting.lines).toEqual([
      {
        accountStableId: 'account_platform_expense',
        categoryStableId: 'expense_platform_commission',
        debitCents: 0,
        creditCents: 10_000,
      },
      {
        accountStableId: 'account_provider_pending',
        categoryStableId: null,
        debitCents: 10_000,
        creditCents: 0,
      },
    ]);
    expect(plan.reversalPosting).toEqual(plan.deltaPosting);
    expect(plan.repostPosting).toBeNull();
  });

  it('keeps REVERSAL_REPOST READY when structure changes but the net posting vector is unchanged', () => {
    const plan = buildPostedFinancialCorrectionPreviewPlan({
      ...basePlanInput(),
      strategy: AccountingPostedCorrectionStrategy.REVERSAL_REPOST,
      targetAuthorityHash: 'c'.repeat(64),
      targetJournals: [targetJournal(10_000)],
    });

    expect(plan.status).toBe('READY');
    expect(plan.deltaPosting.lines).toEqual([]);
    expect(plan.reversalPosting?.lines).toEqual([
      {
        accountStableId: 'account_platform_expense',
        categoryStableId: 'expense_platform_commission',
        debitCents: 0,
        creditCents: 10_000,
      },
      {
        accountStableId: 'account_provider_pending',
        categoryStableId: null,
        debitCents: 10_000,
        creditCents: 0,
      },
    ]);
    expect(plan.repostPosting).toEqual(plan.targetJournalSet.postingVector);
  });

  it('keeps a business-authority-only correction READY even when DELTA has no Journal lines', () => {
    const plan = buildPostedFinancialCorrectionPreviewPlan({
      ...basePlanInput(),
      targetAuthorityHash: 'c'.repeat(64),
      targetJournals: [targetJournal(10_000)],
    });

    expect(plan.status).toBe('READY');
    expect(plan.deltaPosting.lines).toEqual([]);
    expect(plan.reversalPosting).toBeNull();
    expect(plan.repostPosting).toBeNull();
  });

  it('fails closed when the target posting changes without a matching authority change', () => {
    expect(() =>
      buildPostedFinancialCorrectionPreviewPlan({
        ...basePlanInput(),
        targetAuthorityHash: 'b'.repeat(64),
      }),
    ).toThrow(
      'target posting changed without a matching target authority change',
    );
  });

  it('fails closed when base and target authority schemas are not comparable', () => {
    expect(() =>
      buildPostedFinancialCorrectionPreviewPlan({
        ...basePlanInput(),
        baseAuthoritySchema:
          'accounting.provider-settlement-correction-target.v0',
      }),
    ).toThrow(
      'base and target authority must use the same correction-target schema',
    );
  });

  it('accepts an owner-attested cross-schema transition and anchors the bridge in planHash', () => {
    const base = basePlanInput();
    const bridge = {
      version: 1 as const,
      fromSchema: base.baseAuthoritySchema,
      fromHash: base.baseAuthorityHash,
      toSchema: 'accounting.provider-settlement-structural-target.v2',
      equivalentBaseHash: 'd'.repeat(64),
    };
    const plan = buildPostedFinancialCorrectionPreviewPlan({
      ...base,
      targetAuthoritySchema: bridge.toSchema,
      targetAuthorityHash: 'e'.repeat(64),
      schemaTransition: bridge,
    });
    expect(plan.authority.schemaTransition).toEqual(bridge);
    expect(plan.status).toBe('READY');
    const other = buildPostedFinancialCorrectionPreviewPlan({
      ...base,
      targetAuthoritySchema: bridge.toSchema,
      targetAuthorityHash: 'e'.repeat(64),
      schemaTransition: { ...bridge, equivalentBaseHash: 'f'.repeat(64) },
    });
    expect(other.planHash).not.toBe(plan.planHash);
  });

  it('rejects missing, mismatched and spurious schema transition evidence', () => {
    const base = basePlanInput();
    const transition = {
      version: 1 as const,
      fromSchema: base.baseAuthoritySchema,
      fromHash: base.baseAuthorityHash,
      toSchema: 'accounting.provider-settlement-structural-target.v2',
      equivalentBaseHash: 'd'.repeat(64),
    };
    expect(() =>
      buildPostedFinancialCorrectionPreviewPlan({
        ...base,
        targetAuthoritySchema: transition.toSchema,
        schemaTransition: { ...transition, fromHash: 'f'.repeat(64) },
      }),
    ).toThrow('verified owner schema transition');
    expect(() =>
      buildPostedFinancialCorrectionPreviewPlan({
        ...base,
        targetAuthoritySchema: transition.toSchema,
        schemaTransition: {
          ...transition,
          equivalentBaseHash: base.targetAuthorityHash,
        },
      }),
    ).toThrow('verified owner schema transition');
    expect(() =>
      buildPostedFinancialCorrectionPreviewPlan({
        ...base,
        schemaTransition: transition,
      }),
    ).toThrow('same-schema corrections must not declare');
  });

  it('fails closed on unbalanced or duplicate posted Journal authority', () => {
    expect(() =>
      buildPostedCorrectionPostedJournalSetSnapshot({
        currency: 'CAD',
        journals: [
          postedJournal({
            lines: [
              {
                lineNo: 1,
                accountStableId: 'account_platform_expense',
                categoryStableId: null,
                debitCents: 10_000,
                creditCents: 0,
                memo: null,
              },
              {
                lineNo: 2,
                accountStableId: 'account_provider_pending',
                categoryStableId: null,
                debitCents: 0,
                creditCents: 9_999,
                memo: null,
              },
            ],
          }),
        ],
      }),
    ).toThrow(AccountingPostedFinancialCorrectionPolicyError);

    expect(() =>
      buildPostedFinancialCorrectionPreviewPlan({
        ...basePlanInput(),
        priorCorrectionJournals: [
          postedJournal({
            idempotencyHash: 'd'.repeat(64),
          }),
        ],
      }),
    ).toThrow('duplicate entryStableId');
  });

  it('fails closed when current and target vectors use different currencies', () => {
    expect(() =>
      calculatePostedCorrectionDelta({
        current: {
          version: 1,
          currency: 'CAD',
          lines: [],
        },
        target: {
          version: 1,
          currency: 'USD',
          lines: [],
        },
      }),
    ).toThrow('must use the same currency');
  });
});
