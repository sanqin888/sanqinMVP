import { LoyaltyEntryType, LoyaltyTarget } from '@prisma/client';

import { LoyaltyFinancialFactsReaderService } from './loyalty-financial-facts-reader.service';

const row = (overrides: Record<string, unknown> = {}) => ({
  ledgerStableId: 'ledger-stable-1',
  type: LoyaltyEntryType.TOPUP_PURCHASED,
  target: LoyaltyTarget.BALANCE,
  deltaMicro: 200_000n,
  createdAt: new Date('2026-09-12T14:00:00.000Z'),
  orderStableId: 'order-stable-1',
  sourceKey: 'TOPUP',
  ...overrides,
});

describe('LoyaltyFinancialFactsReaderService', () => {
  it('maps Store Balance top-up, redemption, and refund-return ledger rows into canonical liability/tender facts', async () => {
    const findMany = jest.fn().mockResolvedValue([
      row(),
      row({
        ledgerStableId: 'ledger-stable-2',
        type: LoyaltyEntryType.REDEEM_ON_ORDER,
        deltaMicro: -470_300n,
        sourceKey: 'PAYMENT_BALANCE',
      }),
      row({
        ledgerStableId: 'ledger-stable-3',
        type: LoyaltyEntryType.REFUND_RETURN_REDEEM,
        deltaMicro: 470_300n,
        sourceKey: 'FULL_REFUND_BALANCE',
      }),
    ]);
    const service = new LoyaltyFinancialFactsReaderService({
      loyaltyLedger: { findMany },
    } as never);

    await expect(
      service.readFactsByOrderStableId(' order-stable-1 '),
    ).resolves.toEqual([
      expect.objectContaining({
        version: 1,
        factStableId: 'ledger-stable-1',
        kind: 'STORE_BALANCE_TOPUP',
        amountCents: 20,
        currency: 'CAD',
      }),
      expect.objectContaining({
        factStableId: 'ledger-stable-2',
        kind: 'STORE_BALANCE_REDEEMED',
        amountCents: 4703,
      }),
      expect.objectContaining({
        factStableId: 'ledger-stable-3',
        kind: 'STORE_BALANCE_RETURNED',
        amountCents: 4703,
      }),
    ]);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orderStableId: 'order-stable-1',
          target: LoyaltyTarget.BALANCE,
          type: {
            in: [
              LoyaltyEntryType.TOPUP_PURCHASED,
              LoyaltyEntryType.REDEEM_ON_ORDER,
              LoyaltyEntryType.REFUND_RETURN_REDEEM,
            ],
          },
        },
      }),
    );
  });

  it('uses immutable ledger createdAt for inclusive/exclusive financial replay', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new LoyaltyFinancialFactsReaderService({
      loyaltyLedger: { findMany },
    } as never);
    const fromInclusive = new Date('2026-09-12T04:00:00.000Z');
    const toExclusive = new Date('2026-09-13T04:00:00.000Z');

    await service.readFactsForRange({ fromInclusive, toExclusive });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdAt: { gte: fromInclusive, lt: toExclusive },
          target: LoyaltyTarget.BALANCE,
          type: {
            in: [
              LoyaltyEntryType.TOPUP_PURCHASED,
              LoyaltyEntryType.REDEEM_ON_ORDER,
              LoyaltyEntryType.REFUND_RETURN_REDEEM,
            ],
          },
        },
      }),
    );
  });

  it('fails closed instead of rounding a Store Balance movement that is not cent-aligned', async () => {
    const service = new LoyaltyFinancialFactsReaderService({
      loyaltyLedger: {
        findMany: jest.fn().mockResolvedValue([
          row({
            type: LoyaltyEntryType.REDEEM_ON_ORDER,
            deltaMicro: -10_001n,
          }),
        ]),
      },
    } as never);

    await expect(
      service.readFactsByOrderStableId('order-stable-1'),
    ).rejects.toThrow('not aligned to whole cents');
  });
});
