import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { OrderPreparationService } from '../order-preparation.service';

const DEFAULT_POLL_INTERVAL_MS = 1_000;

/** Database-backed scheduler. The timer only drives scans; no order lives in memory. */
@Injectable()
export class ScheduledOrderProcessor
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ScheduledOrderProcessor.name);
  private readonly pollIntervalMs = this.readPositiveMs(
    process.env.SCHEDULED_ORDER_POLL_MS,
    DEFAULT_POLL_INTERVAL_MS,
  );
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(private readonly preparation: OrderPreparationService) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.pollSafely(), this.pollIntervalMs);
    this.timer.unref();
    void this.pollSafely();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Public for deterministic scheduler tests and operational draining. */
  async processOnce(limit = 25, now = new Date()): Promise<number> {
    let activated = 0;
    for (let index = 0; index < limit; index += 1) {
      const processed =
        await this.preparation.activateNextDueScheduledOrder(now);
      if (!processed) break;
      activated += 1;
    }
    return activated;
  }

  private async pollSafely(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.processOnce();
    } catch (error) {
      this.logger.error({
        event: 'scheduled_order_activation_failed',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
    } finally {
      this.polling = false;
    }
  }

  private readPositiveMs(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
