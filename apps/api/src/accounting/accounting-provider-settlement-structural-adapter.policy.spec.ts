import {
  AccountingFinancialComponent as Component,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment as Treatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole as TaxRole,
} from './accounting-contracts';
import {
  normalizeProviderSettlementCorrectionTarget,
  type ProviderSettlementCorrectionTargetV1,
} from './accounting-provider-settlement-correction-target.policy';
import {
  assertHistoricalFantuanStructuralTarget,
  buildHistoricalFantuanStructuralProposal,
  buildHistoricalFantuanStructuralTarget,
  structuralTargetAsSettlementView,
} from './accounting-provider-settlement-structural-adapter.policy';
import {
  hashProviderStructuralTarget,
  upgradeProviderCorrectionTargetToV2,
  type ProviderStructuralLineAddition,
} from './accounting-provider-settlement-structural-target.policy';
import { buildProviderSettlementDocumentPlan } from './accounting-provider-settlement.policy';

const sourceTarget = (): ProviderSettlementCorrectionTargetV1 => {
  const values: Array<[string, Component, Treatment, number]> = [
    ['Sales', Component.SALES, Treatment.POSTABLE, 686782],
    ['Item Subtotal', Component.CONTROL_TOTAL, Treatment.CONTROL_TOTAL, 686782],
    [
      'Marketing and Fantuan Event Charges',
      Component.CONTROL_TOTAL,
      Treatment.CONTROL_TOTAL,
      -274545,
    ],
    [
      'Discounts from Promotion events',
      Component.PROMOTION,
      Treatment.POSTABLE,
      -170973,
    ],
    [
      'Fantuan Subsidy for Promotion events',
      Component.SUBSIDY,
      Treatment.POSTABLE,
      170973,
    ],
    ['Commission', Component.COMMISSION, Treatment.POSTABLE, -246345],
    ['Net Taxes', Component.CONTROL_TOTAL, Treatment.CONTROL_TOTAL, 53599],
    ['Net Sales GST/HST', Component.SALES_TAX, Treatment.POSTABLE, 89287],
    [
      'Commission GST/HST',
      Component.COMMISSION_TAX,
      Treatment.POSTABLE,
      -32022,
    ],
    [
      'Total transfer amount',
      Component.PAYOUT,
      Treatment.CONTROL_TOTAL,
      465836,
    ],
  ];
  return normalizeProviderSettlementCorrectionTarget({
    version: 1,
    document: {
      documentStableId: 'fantuan_sep_statement',
      documentRevision: 1,
      provider: AccountingFinancialProvider.FANTUAN,
      documentType: AccountingFinancialDocumentType.STATEMENT,
      businessIdentityKey: 'fantuan:2026-09',
      providerDocumentRef: null,
      storeStableId: '4750_Yonge_Street',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      currency: 'CAD',
      sourcePostingAuthorityHash: 'a'.repeat(64),
    },
    salesAuthority: 'STATEMENT_AUTHORITATIVE',
    basedOnAuthorityHash: 'b'.repeat(64),
    supplementaryEvidenceDocumentStableIds: [],
    historicalReversalOriginalJournalEntryStableIds: [],
    lines: values.map(
      ([rawName, component, postingTreatment, amountCents], i) => ({
        sourceDocumentStableId: 'fantuan_sep_statement',
        lineStableId: 'source_' + String(i + 1),
        lineNo: i + 1,
        rawCode: null,
        rawName,
        component,
        postingTreatment,
        taxRole: TaxRole.NONE,
        amountCents,
        occurredAt: null,
      }),
    ),
  });
};

const additions = (): ProviderStructuralLineAddition[] => [
  {
    evidenceDocumentStableId: 'fantuan_sep_statement',
    rawCode: null,
    rawName: 'Marketing Fee',
    component: Component.ADVERTISING,
    postingTreatment: Treatment.POSTABLE,
    taxRole: TaxRole.NONE,
    amountCents: -28200,
  },
  {
    evidenceDocumentStableId: 'fantuan_sep_statement',
    rawCode: null,
    rawName: 'Marketing Fee GST/HST',
    component: Component.ADVERTISING_TAX,
    postingTreatment: Treatment.POSTABLE,
    taxRole: TaxRole.INPUT_TAX,
    amountCents: -3666,
  },
];

describe('Provider structural v2 Adapter source authority', () => {
  it('proposes only server-derived missing lines with frozen evidence identity', () => {
    const source = sourceTarget();
    const proposal = buildHistoricalFantuanStructuralProposal(source);
    expect(proposal.version).toBe(2);
    expect(proposal.expectedBaseAuthorityHash).toBe(
      hashProviderStructuralTarget(upgradeProviderCorrectionTargetToV2(source)),
    );
    expect(proposal.changes).toEqual([
      { action: 'ADD', values: additions()[0] },
      { action: 'ADD', values: additions()[1] },
    ]);
    const target = buildHistoricalFantuanStructuralTarget({
      source,
      rawInput: proposal,
    });
    expect(target.lines.filter((line) => line.origin === 'CORRECTION_ADDED'))
      .toHaveLength(2);
    const modifiedSource = {
      ...source,
      lines: source.lines.map((line) =>
        line.rawName === 'Marketing and Fantuan Event Charges'
          ? { ...line, amountCents: -246345 }
          : line,
      ),
    };
    expect(() => buildHistoricalFantuanStructuralProposal(modifiedSource))
      .toThrow('exactly the two historic Fantuan control discrepancies');
  });

  it('accepts only two reconciled additions and builds a READY 12-line target', () => {
    const source = sourceTarget();
    const base = upgradeProviderCorrectionTargetToV2(source);
    const input = {
      version: 2 as const,
      expectedBaseAuthorityHash: hashProviderStructuralTarget(base),
      changes: additions().map((values) => ({
        action: 'ADD' as const,
        values,
      })),
    };
    const first = buildHistoricalFantuanStructuralTarget({
      source,
      rawInput: input,
    });
    const replay = buildHistoricalFantuanStructuralTarget({
      source,
      rawInput: input,
    });
    expect(hashProviderStructuralTarget(first)).toBe(
      hashProviderStructuralTarget(replay),
    );
    expect(first.lines).toHaveLength(12);
    expect(
      first.lines.filter((line) => line.origin === 'SOURCE_LINE'),
    ).toHaveLength(10);
    expect(
      first.lines.filter((line) => line.origin === 'CORRECTION_ADDED'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rawName: 'Marketing Fee',
          sourceLine: null,
          amountCents: -28200,
          evidenceDocumentStableId: 'fantuan_sep_statement',
        }),
        expect.objectContaining({
          rawName: 'Marketing Fee GST/HST',
          sourceLine: null,
          amountCents: -3666,
          evidenceDocumentStableId: 'fantuan_sep_statement',
        }),
      ]),
    );
    expect(() =>
      assertHistoricalFantuanStructuralTarget(source, first),
    ).not.toThrow();

    const effective = structuralTargetAsSettlementView(first);
    const result = buildProviderSettlementDocumentPlan({
      document: {
        documentStableId: effective.document.documentStableId,
        revision: effective.document.documentRevision,
        provider: effective.document.provider,
        documentType: effective.document.documentType,
        storeStableId: effective.document.storeStableId,
        periodStart: effective.document.periodStart,
        periodEnd: effective.document.periodEnd,
        currency: effective.document.currency,
        lines: effective.lines,
      },
      salesAuthority: effective.salesAuthority,
      occurredAt: new Date('2026-10-01T03:59:59.999Z'),
    });
    expect(result.status).toBe('READY');
    expect(
      result.controlTotalChecks.every((check) => check.status === 'MATCHED'),
    ).toBe(true);
    expect(result.draftJournal?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountStableId: 'account_advertising_expense',
          debitCents: 28200,
        }),
        expect.objectContaining({
          accountStableId: 'account_hst_recoverable',
          debitCents: 35688,
        }),
        expect.objectContaining({
          accountStableId: 'account_fantuan_pending',
          debitCents: 465836,
        }),
      ]),
    );
  });

  it('rejects missing, duplicate, fabricated or misclassified corrections', () => {
    const source = sourceTarget();
    const baseHash = hashProviderStructuralTarget(
      upgradeProviderCorrectionTargetToV2(source),
    );
    const lineChanges = additions().map((values) => ({
      action: 'ADD' as const,
      values,
    }));
    const attempt = (changes: unknown[]) =>
      buildHistoricalFantuanStructuralTarget({
        source,
        rawInput: { version: 2, expectedBaseAuthorityHash: baseHash, changes },
      });
    expect(() => attempt(lineChanges.slice(0, 1))).toThrow('exactly two ADD');
    expect(() => attempt([lineChanges[0], lineChanges[0]])).toThrow(
      'server-owned Fantuan template',
    );
    expect(() =>
      attempt([
        { ...lineChanges[0], values: { ...additions()[0], amountCents: -1 } },
        lineChanges[1],
      ]),
    ).toThrow('server-owned Fantuan template');
    expect(() =>
      attempt([
        {
          ...lineChanges[0],
          values: { ...additions()[0], evidenceDocumentStableId: 'forged' },
        },
        lineChanges[1],
      ]),
    ).toThrow('server-owned Fantuan template');
    expect(() =>
      attempt([
        { action: 'REMOVE', effectiveLineStableId: 'source_2' },
        lineChanges[1],
      ]),
    ).toThrow('exactly two ADD');
  });

  it('rejects source-line and control-total tampering in persisted v2', () => {
    const source = sourceTarget();
    const base = upgradeProviderCorrectionTargetToV2(source);
    const target = buildHistoricalFantuanStructuralTarget({
      source,
      rawInput: {
        version: 2,
        expectedBaseAuthorityHash: hashProviderStructuralTarget(base),
        changes: additions().map((values) => ({ action: 'ADD', values })),
      },
    });
    const tampered = {
      ...target,
      lines: target.lines.map((line) =>
        line.effectiveLineStableId === 'source_3'
          ? { ...line, amountCents: -246345 }
          : line,
      ),
    };
    expect(() =>
      assertHistoricalFantuanStructuralTarget(source, tampered),
    ).toThrow('must not change any historical source line');
  });
});
