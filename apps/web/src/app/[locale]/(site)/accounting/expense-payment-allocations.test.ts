import { prepareExpensePaymentAllocations } from './expense-payment-allocations';

describe('prepareExpensePaymentAllocations', () => {
  it('keeps an entirely blank allocation as the formal unknown-account state', () => {
    expect(
      prepareExpensePaymentAllocations(
        [{ key: 'row-1', accountStableId: '', amount: '' }],
        4238,
      ),
    ).toEqual({
      paymentAllocations: [],
      allocatedCents: 0,
      remainingCents: 4238,
      error: null,
    });
  });

  it('prepares multiple accounts when their amounts close to the CAD booking total', () => {
    expect(
      prepareExpensePaymentAllocations(
        [
          { key: 'row-1', accountStableId: 'account_rbc', amount: '20.00' },
          { key: 'row-2', accountStableId: 'account_cash', amount: '22.38' },
        ],
        4238,
      ),
    ).toEqual({
      paymentAllocations: [
        { accountStableId: 'account_rbc', amountCents: 2000 },
        { accountStableId: 'account_cash', amountCents: 2238 },
      ],
      allocatedCents: 4238,
      remainingCents: 0,
      error: null,
    });
  });

  it('rejects repeated accounts', () => {
    expect(
      prepareExpensePaymentAllocations(
        [
          { key: 'row-1', accountStableId: 'account_rbc', amount: '20.00' },
          { key: 'row-2', accountStableId: 'account_rbc', amount: '22.38' },
        ],
        4238,
      ).error,
    ).toBe('DUPLICATE_ACCOUNT');
  });

  it('requires non-empty allocations to close to the CAD booking total', () => {
    expect(
      prepareExpensePaymentAllocations(
        [{ key: 'row-1', accountStableId: 'account_rbc', amount: '20.00' }],
        4238,
      ),
    ).toEqual({
      paymentAllocations: [
        { accountStableId: 'account_rbc', amountCents: 2000 },
      ],
      allocatedCents: 2000,
      remainingCents: 2238,
      error: 'NOT_BALANCED',
    });
  });
});
