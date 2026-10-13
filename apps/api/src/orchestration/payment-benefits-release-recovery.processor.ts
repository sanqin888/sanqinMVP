import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { PaymentCheckoutAttemptService } from './payment-checkout-attempt.service';

const BENEFIT_RELEASE_POLL_MS = 60_000;

/**
 * Replays confirmed terminal-checkout benefit releases after a process crash or
 * partial owner failure. The checkout status is durable cancellation/failure
 * evidence; UNKNOWN/RECONCILING/SUCCEEDED are deliberately never eligible.
 *
 * Both Benefits owners expose idempotent release commands. The checkpoint is
 * written only after both commands return successfully.
 */
@Injectable()
export class PaymentBenefitsReleaseRecoveryProcessor
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(
    PaymentBenefitsReleaseRecoveryProcessor.name,
  );
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private lastScannedId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly checkouts: PaymentCheckoutAttemptService,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(
      () => void this.pollSafely(),
      BENEFIT_RELEASE_POLL_MS,
    );
    this.timer.unref();
    void this.pollSafely();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One bounded replay pass; safe to call again after a failed owner release. */
  async processOnce(): Promise<number> {
    const pending = await this.prisma.paymentCheckoutAttempt.findMany({
      where: {
        source: 'POS_TERMINAL',
        status: { in: ['DECLINED', 'CANCELLED', 'FAILED'] },
        benefitsReleasedAt: null,
        ...(this.lastScannedId ? { id: { gt: this.lastScannedId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: 25,
      select: { id: true, attemptId: true },
    });
    // Move the cursor even past failed rows so one persistently unavailable
    // Benefits owner cannot starve all later checkouts. Wrap on the next poll.
    if (pending.length === 0) {
      this.lastScannedId = null;
      return 0;
    }
    let completed = 0;
    for (const checkout of pending) {
      this.lastScannedId = checkout.id;
      try {
        await this.checkouts.releaseReservations(checkout.attemptId);
        completed += 1;
      } catch (error) {
        this.logger.error({
          event: 'payment_benefits_release_recovery_failed',
          attemptId: checkout.attemptId,
          errorType: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }
    if (pending.length < 25) this.lastScannedId = null;
    return completed;
  }

  private async pollSafely(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.processOnce();
    } catch (error) {
      this.logger.error({
        event: 'payment_benefits_release_scan_failed',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
    } finally {
      this.polling = false;
    }
  }
}
