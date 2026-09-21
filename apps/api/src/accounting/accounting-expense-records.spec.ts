import { AccountingExpenseService } from './accounting-expense.service';

describe('Accounting Expense record search', () => {
  it('converts local date filters before applying stacked server-side pagination', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(12);
    const prisma = {
      accountingExpenseDocument: { findMany, count },
    };
    const period = {
      getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
      clampAccountingFromDate: jest.fn((value: Date | undefined) =>
        Promise.resolve(value),
      ),
    };
    const service = new AccountingExpenseService(
      prisma as never,
      period as never,
    );

    const result = await service.listExpenseRecords({
      from: '2026-06-01',
      to: '2026-06-30',
      minTotalCents: 5000,
      paymentAccountStableId: 'account_cibc',
      limit: 10,
      offset: 10,
    });

    expect(result).toEqual({
      items: [],
      total: 12,
      limit: 10,
      offset: 10,
    });
    expect(period.clampAccountingFromDate).toHaveBeenCalledWith(
      new Date('2026-06-01T04:00:00.000Z'),
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          occurredAt: {
            gte: new Date('2026-06-01T04:00:00.000Z'),
            lt: new Date('2026-07-01T04:00:00.000Z'),
          },
          totalCents: { gte: 5000 },
          paymentAllocations: {
            some: { account: { accountStableId: 'account_cibc' } },
          },
        }) as unknown,
        skip: 10,
        take: 10,
      }),
    );
  });

  it('rejects mutually exclusive payment-account filters', async () => {
    const service = new AccountingExpenseService({} as never, {} as never);

    await expect(
      service.listExpenseRecords({
        paymentAccountStableId: 'account_cibc',
        paymentState: 'UNASSIGNED',
      }),
    ).rejects.toThrow(
      'paymentAccountStableId and paymentState cannot be combined',
    );
  });
});
