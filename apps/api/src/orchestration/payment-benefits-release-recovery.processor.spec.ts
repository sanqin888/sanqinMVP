import type { PaymentCheckoutAttemptService } from './payment-checkout-attempt.service';
import { PaymentBenefitsReleaseRecoveryProcessor } from './payment-benefits-release-recovery.processor';

describe('PaymentBenefitsReleaseRecoveryProcessor', () => {
  const createHarness = () => {
    const findPendingBenefitsReleases = jest.fn();
    const releaseReservations = jest.fn().mockResolvedValue(undefined);
    const checkouts = {
      findPendingBenefitsReleases,
      releaseReservations,
    } as unknown as PaymentCheckoutAttemptService;
    return {
      processor: new PaymentBenefitsReleaseRecoveryProcessor(checkouts),
      findPendingBenefitsReleases,
      releaseReservations,
    };
  };

  it('only scans definitive POS failures with no release checkpoint', async () => {
    const harness = createHarness();
    harness.findPendingBenefitsReleases.mockResolvedValue([]);
    await expect(harness.processor.processOnce()).resolves.toBe(0);
    expect(harness.findPendingBenefitsReleases).toHaveBeenCalledWith(null);
    expect(harness.releaseReservations).not.toHaveBeenCalled();
  });

  it('retries partial owner failures on a subsequent pass and keeps other attempts moving', async () => {
    const harness = createHarness();
    harness.findPendingBenefitsReleases.mockResolvedValue([
      { id: '00000000-0000-0000-8000-000000000001', attemptId: 'one' },
      { id: '00000000-0000-0000-8000-000000000002', attemptId: 'two' },
    ]);
    harness.releaseReservations
      .mockRejectedValueOnce(new Error('one owner unavailable'))
      .mockResolvedValue(undefined);
    await expect(harness.processor.processOnce()).resolves.toBe(1);
    expect(harness.releaseReservations).toHaveBeenNthCalledWith(1, 'one');
    expect(harness.releaseReservations).toHaveBeenNthCalledWith(2, 'two');

    harness.findPendingBenefitsReleases.mockResolvedValue([
      { id: '00000000-0000-0000-8000-000000000001', attemptId: 'one' },
    ]);
    await expect(harness.processor.processOnce()).resolves.toBe(1);
    expect(harness.releaseReservations).toHaveBeenLastCalledWith('one');
  });
});
