import {
  AccountingFinancialComponent as Component,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment as Treatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole as TaxRole,
} from './accounting-contracts';
import {
  hashProviderSettlementCorrectionTarget,
  normalizeProviderSettlementCorrectionTarget,
  type ProviderSettlementCorrectionTargetV1,
} from './accounting-provider-settlement-correction-target.policy';
import { tryRebuildHistoricalFantuanPostingProof } from './accounting-provider-settlement-historical-base.policy';
import { buildProviderSettlementDocumentPlan } from './accounting-provider-settlement.policy';

type TestLine = [string, Component, Treatment, number];

const historicalTarget = (): ProviderSettlementCorrectionTargetV1 => {
  const lines: TestLine[] = [
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
    lines: lines.map(
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

const occurredAt = new Date('2026-10-01T03:59:59.999Z');

describe('Provider historical Fantuan posting proof', () => {
  it('rebuilds only the existing 10-line posting without overriding persisted controls', () => {
    const target = historicalTarget();
    const before = hashProviderSettlementCorrectionTarget(target);
    const originalControls = target.lines
      .filter((line) => line.postingTreatment === Treatment.CONTROL_TOTAL)
      .map((line) => line.amountCents);
    const unmodifiedPlan = buildProviderSettlementDocumentPlan({
      document: {
        documentStableId: target.document.documentStableId,
        revision: target.document.documentRevision,
        provider: target.document.provider,
        documentType: target.document.documentType,
        storeStableId: target.document.storeStableId,
        periodStart: target.document.periodStart,
        periodEnd: target.document.periodEnd,
        currency: target.document.currency,
        lines: target.lines,
      },
      salesAuthority: target.salesAuthority,
      occurredAt,
    });
    expect(unmodifiedPlan.status).toBe('BLOCKED');
    expect(unmodifiedPlan.blockReasons).toContain(
      'PROVIDER_CONTROL_TOTAL_MISMATCH',
    );

    const proof = tryRebuildHistoricalFantuanPostingProof({
      source: target,
      occurredAt,
    });
    expect(proof?.idempotencyKey).toBe(
      'provider-settlement:fantuan_sep_statement:r1:v1',
    );
    expect(proof?.lines).toHaveLength(5);
    expect(proof?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountStableId: 'account_fantuan_pending',
          debitCents: 497702,
        }),
        expect.objectContaining({
          accountStableId: 'account_commission_expense',
          debitCents: 246345,
        }),
        expect.objectContaining({
          accountStableId: 'account_hst_recoverable',
          debitCents: 32022,
        }),
        expect.objectContaining({
          accountStableId: 'account_hst_payable',
          creditCents: 89287,
        }),
        expect.objectContaining({
          accountStableId: 'account_sales_revenue',
          creditCents: 686782,
        }),
      ]),
    );
    expect(
      proof?.lines.some(
        (line) => line.accountStableId === 'account_advertising_expense',
      ),
    ).toBe(false);
    expect(hashProviderSettlementCorrectionTarget(target)).toBe(before);
    expect(
      target.lines
        .filter((line) => line.postingTreatment === Treatment.CONTROL_TOTAL)
        .map((line) => line.amountCents),
    ).toEqual(originalControls);
  });

  it('rejects extra mismatch and does not weaken future target READY requirements', () => {
    const target = historicalTarget();
    const changed = normalizeProviderSettlementCorrectionTarget({
      ...target,
      lines: target.lines.map((line) => ({
        ...line,
        amountCents:
          line.rawName === 'Item Subtotal'
            ? line.amountCents - 1
            : line.amountCents,
      })),
    });
    expect(
      tryRebuildHistoricalFantuanPostingProof({
        source: changed,
        occurredAt,
      }),
    ).toBeNull();

    const wrongProvider = normalizeProviderSettlementCorrectionTarget({
      ...target,
      document: {
        ...target.document,
        provider: AccountingFinancialProvider.UBER_EATS,
      },
    });
    expect(
      tryRebuildHistoricalFantuanPostingProof({
        source: wrongProvider,
        occurredAt,
      }),
    ).toBeNull();
  });

  it('rejects partial marketing component evidence and non-statement authority', () => {
    const target = historicalTarget();
    const fakeMarketingLine = {
      ...target.lines[0],
      lineStableId: 'source_fake',
      lineNo: 11,
      rawName: 'Marketing Fee',
      component: Component.ADVERTISING,
      amountCents: -28200,
    };
    const partial = normalizeProviderSettlementCorrectionTarget({
      ...target,
      lines: [...target.lines, fakeMarketingLine],
    });
    expect(
      tryRebuildHistoricalFantuanPostingProof({
        source: partial,
        occurredAt,
      }),
    ).toBeNull();
    expect(
      tryRebuildHistoricalFantuanPostingProof({
        source: normalizeProviderSettlementCorrectionTarget({
          ...target,
          salesAuthority: 'RECONCILIATION_ONLY',
        }),
        occurredAt,
      }),
    ).toBeNull();
  });
});
