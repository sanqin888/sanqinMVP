import type { PrismaService } from '../prisma/prisma.service';
import type { PaymentCheckoutAttemptService } from './payment-checkout-attempt.service';
import { PaymentBenefitsReleaseRecoveryProcessor } from './payment-benefits-release-recovery.processor';

describe('PaymentBenefitsReleaseRecoveryProcessor', () => {
  const createHarness = () => {
    const findMany = jest.fn();
    const releaseReservations = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      paymentCheckoutAttempt: { findMany },
    } as unknown as PrismaService;
    const checkouts = {
      releaseReservations,
    } as unknown as PaymentCheckoutAttemptService;
    return {
      processor: new PaymentBenefitsReleaseRecoveryProcessor(prisma, checkouts),
      findMany,
      releaseReservations,
    };
  };

  it('only scans definitive POS failures with no release checkpoint', async () => {
    const harness = createHarness();
    harness.findMany.mockResolvedValue([]);
    await expect(harness.processor.processOnce()).resolves.toBe(0);
    expect(harness.findMany).toHaveBeenCalledWith({
      where: {
        source: 'POS_TERMINAL',
        status: { in: ['DECLINED', 'CANCELLED', 'FAILED'] },
        benefitsReleasedAt: null,
      },
      orderBy: { id: 'asc' },
      take: 25,
      select: { id: true, attemptId: true },
    });
    expect(harness.releaseReservations).not.toHaveBeenCalled();
  });

  it('retries partial owner failures on a subsequent pass and keeps other attempts moving', async () => {
    const harness = createHarness();
    harness.findMany.mockResolvedValue([
      { id: '00000000-0000-0000-8000-000000000001', attemptId: 'one' },
      { id: '00000000-0000-0000-8000-000000000002', attemptId: 'two' },
    ]);
    harness.releaseReservations
      .mockRejectedValueOnce(new Error('one owner unavailable'))
      .mockResolvedValue(undefined);
    await expect(harness.processor.processOnce()).resolves.toBe(1);
    expect(harness.releaseReservations).toHaveBeenNthCalledWith(1, 'one');
    expect(harness.releaseReservations).toHaveBeenNthCalledWith(2, 'two');

    harness.findMany.mockResolvedValue([
      { id: '00000000-0000-0000-8000-000000000001', attemptId: 'one' },
    ]);
    await expect(harness.processor.processOnce()).resolves.toBe(1);
    expect(harness.releaseReservations).toHaveBeenLastCalledWith('one');
  });
});
