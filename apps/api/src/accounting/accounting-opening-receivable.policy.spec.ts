import {
  hashAccountingOpeningReceivableFact,
  normalizeAccountingOpeningReceivable,
} from './accounting-opening-receivable.policy';

describe('Accounting Opening Receivable policy', () => {
  const input = {
    requestId: '11111111-1111-4111-8111-111111111111',
    storeStableId: '4750_Yonge_Street',
    counterpartyName: 'Pre-start supermarket receivables',
    reference: 'Opening AR at cutover',
    amountCents: 125_091,
    currency: 'CAD',
    note: 'Confirmed unpaid receivable at Accounting cutover',
  };

  it('freezes the source fact at the supplied Accounting start date', () => {
    const fact = normalizeAccountingOpeningReceivable(input, '2026-06-01');

    expect(fact).toEqual({
      version: 1,
      openingReceivableStableId: 'openingrecv_11111111111141118111111111111111',
      storeStableId: '4750_Yonge_Street',
      openingDate: '2026-06-01',
      counterpartyName: 'Pre-start supermarket receivables',
      reference: 'Opening AR at cutover',
      amountCents: 125_091,
      currency: 'CAD',
      note: 'Confirmed unpaid receivable at Accounting cutover',
    });
  });

  it('keeps the hash stable for identical frozen facts', () => {
    const first = normalizeAccountingOpeningReceivable(input, '2026-06-01');
    const replay = normalizeAccountingOpeningReceivable(
      { ...input },
      '2026-06-01',
    );

    expect(hashAccountingOpeningReceivableFact(first)).toBe(
      hashAccountingOpeningReceivableFact(replay),
    );
  });

  it('requires a positive CAD amount and a UUID request id', () => {
    expect(() =>
      normalizeAccountingOpeningReceivable(
        { ...input, amountCents: 0 },
        '2026-06-01',
      ),
    ).toThrow('amountCents must be a positive safe integer');
    expect(() =>
      normalizeAccountingOpeningReceivable(
        { ...input, currency: 'USD' },
        '2026-06-01',
      ),
    ).toThrow('Opening Receivable v1 currently requires CAD currency');
    expect(() =>
      normalizeAccountingOpeningReceivable(
        { ...input, requestId: 'not-a-uuid' },
        '2026-06-01',
      ),
    ).toThrow('requestId must be a UUID');
  });
});
