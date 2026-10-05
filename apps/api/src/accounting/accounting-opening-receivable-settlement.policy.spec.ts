import {
  hashAccountingOpeningReceivableSettlementFact,
  normalizeAccountingOpeningReceivableSettlement,
} from './accounting-opening-receivable-settlement.policy';

describe('Accounting Opening Receivable settlement policy', () => {
  const input = {
    requestId: '22222222-2222-4222-8222-222222222222',
    openingReceivableStableId:
      'openingrecv_11111111111141118111111111111111',
    settlementOn: '2026-06-20',
    amountCents: 12_500,
    collectionAccountStableId: 'account_primary_bank',
    currency: 'CAD',
    reference: 'Cheque 1001',
    note: 'Partial collection',
  };

  it('freezes a deterministic CAD settlement fact with server-owned target identity', () => {
    const fact = normalizeAccountingOpeningReceivableSettlement(input, {
      storeStableId: '4750_Yonge_Street',
      counterpartyName: 'Pre-start supermarket receivables',
    });

    expect(fact).toEqual({
      version: 1,
      settlementStableId:
        'openingrecvsettle_22222222222242228222222222222222',
      openingReceivableStableId:
        'openingrecv_11111111111141118111111111111111',
      storeStableId: '4750_Yonge_Street',
      settlementOn: '2026-06-20',
      counterpartyName: 'Pre-start supermarket receivables',
      amountCents: 12_500,
      currency: 'CAD',
      collectionAccountStableId: 'account_primary_bank',
      reference: 'Cheque 1001',
      note: 'Partial collection',
    });
  });

  it('keeps factHash deterministic and rejects zero/negative/non-CAD amounts', () => {
    const first = normalizeAccountingOpeningReceivableSettlement(input, {
      storeStableId: '4750_Yonge_Street',
      counterpartyName: 'Pre-start supermarket receivables',
    });
    const replay = normalizeAccountingOpeningReceivableSettlement(
      { ...input, currency: 'cad' },
      {
        storeStableId: '4750_Yonge_Street',
        counterpartyName: 'Pre-start supermarket receivables',
      },
    );
    expect(hashAccountingOpeningReceivableSettlementFact(first)).toBe(
      hashAccountingOpeningReceivableSettlementFact(replay),
    );

    expect(() =>
      normalizeAccountingOpeningReceivableSettlement(
        { ...input, amountCents: 0 },
        {
          storeStableId: '4750_Yonge_Street',
          counterpartyName: 'Pre-start supermarket receivables',
        },
      ),
    ).toThrow('amountCents must be a positive safe integer');

    expect(() =>
      normalizeAccountingOpeningReceivableSettlement(
        { ...input, amountCents: -1 },
        {
          storeStableId: '4750_Yonge_Street',
          counterpartyName: 'Pre-start supermarket receivables',
        },
      ),
    ).toThrow('amountCents must be a positive safe integer');

    expect(() =>
      normalizeAccountingOpeningReceivableSettlement(
        { ...input, currency: 'USD' },
        {
          storeStableId: '4750_Yonge_Street',
          counterpartyName: 'Pre-start supermarket receivables',
        },
      ),
    ).toThrow('Opening Receivable settlement v1 currently requires CAD currency');
  });
});
