import { buildCloverAuthorityReplacementPreview } from './accounting-clover-authority-replacement.policy';

const baseInput = {
  statementDocumentStableId: 'statement_july',
  authorityFrom: '2026-06-30',
  authorityTo: '2026-07-30',
  occurredAt: '2026-07-31T03:59:59.999Z',
  storeStableId: '4750_Yonge_Street',
  providerPrincipalCents: 350_132,
  providerTipsCents: 7_207,
  providerSurchargeCents: 5_551,
  providerRefundCount: 0,
  providerRefundCents: 0,
  orderPendingMovementCents: 318_807,
  orderStoreCashMovementCents: 163_891,
  orderTipRevenueCents: 0,
  orderSurchargeRevenueCents: 0,
  unexpectedOrderPendingSourceFactTypes: [],
};

describe('Clover pre-sync authority replacement policy', () => {
  it('builds a balanced July aggregate authority replacement without rewriting sale economics', () => {
    const result = buildCloverAuthorityReplacementPreview(baseInput);

    expect(result).toMatchObject({
      status: 'READY',
      blockReasons: [],
      pendingAuthorityDeltaCents: 31_325,
      missingTipRevenueCents: 7_207,
      missingSurchargeRevenueCents: 5_551,
      storeCashReclassificationCents: 18_567,
    });
    expect(result.draftJournal?.lines).toEqual([
      {
        accountStableId: 'account_clover_pending',
        debitCents: 31_325,
        creditCents: 0,
        memo: 'Replace Order-declared Clover Pending with provider authority',
      },
      {
        accountStableId: 'account_store_cash',
        debitCents: 0,
        creditCents: 18_567,
        memo: 'Aggregate tender reclassification required by provider authority',
      },
      {
        accountStableId: 'account_tip_revenue',
        debitCents: 0,
        creditCents: 7_207,
        memo: 'Provider-proven Clover tips not represented in Order economics',
      },
      {
        accountStableId: 'account_card_surcharge_revenue',
        debitCents: 0,
        creditCents: 5_551,
        memo: 'Provider-proven Clover surcharge not represented in Order economics',
      },
    ]);
  });

  it('uses explicit June surcharge evidence and reverses 398c from Store Cash into Clover Pending', () => {
    const result = buildCloverAuthorityReplacementPreview({
      ...baseInput,
      statementDocumentStableId: 'statement_june',
      authorityFrom: '2026-06-02',
      authorityTo: '2026-06-28',
      occurredAt: '2026-06-29T03:59:59.999Z',
      providerPrincipalCents: 288_288,
      providerTipsCents: 8_343,
      providerSurchargeCents: 4_918,
      orderPendingMovementCents: 275_425,
      orderStoreCashMovementCents: 200_000,
    });

    expect(result).toMatchObject({
      status: 'READY',
      blockReasons: [],
      pendingAuthorityDeltaCents: 12_863,
      missingTipRevenueCents: 8_343,
      missingSurchargeRevenueCents: 4_918,
      storeCashReclassificationCents: -398,
    });
    expect(result.draftJournal?.lines).toEqual([
      {
        accountStableId: 'account_clover_pending',
        debitCents: 12_863,
        creditCents: 0,
        memo: 'Replace Order-declared Clover Pending with provider authority',
      },
      {
        accountStableId: 'account_store_cash',
        debitCents: 398,
        creditCents: 0,
        memo: 'Aggregate tender reclassification required by provider authority',
      },
      {
        accountStableId: 'account_tip_revenue',
        debitCents: 0,
        creditCents: 8_343,
        memo: 'Provider-proven Clover tips not represented in Order economics',
      },
      {
        accountStableId: 'account_card_surcharge_revenue',
        debitCents: 0,
        creditCents: 4_918,
        memo: 'Provider-proven Clover surcharge not represented in Order economics',
      },
    ]);
  });

  it('fails closed when provider surcharge authority is unavailable', () => {
    const result = buildCloverAuthorityReplacementPreview({
      ...baseInput,
      providerSurchargeCents: null,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons).toContain('PROVIDER_SURCHARGE_UNKNOWN');
    expect(result.draftJournal).toBeNull();
  });

  it('fails closed when provider refunds require a not-yet-frozen remediation rule', () => {
    const result = buildCloverAuthorityReplacementPreview({
      ...baseInput,
      providerRefundCount: 1,
      providerRefundCents: 2_000,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons).toContain('PROVIDER_REFUNDS_PRESENT');
    expect(result.draftJournal).toBeNull();
  });

  it('fails closed when aggregate tender reclassification exceeds Order cash evidence', () => {
    const result = buildCloverAuthorityReplacementPreview({
      ...baseInput,
      orderStoreCashMovementCents: 10_000,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons).toContain(
      'STORE_CASH_RECLASSIFICATION_EXCEEDS_ORDER_EVIDENCE',
    );
    expect(result.draftJournal).toBeNull();
  });

  it('fails closed when an unexpected Order source also moved Clover Pending', () => {
    const result = buildCloverAuthorityReplacementPreview({
      ...baseInput,
      unexpectedOrderPendingSourceFactTypes: ['order.legacy_unknown.v1'],
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.blockReasons).toContain(
      'UNEXPECTED_ORDER_PENDING_SOURCE_FACT_TYPE',
    );
    expect(result.draftJournal).toBeNull();
  });
});
