import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CouponProgramTriggerService } from './coupon-program-trigger.service';

@Injectable()
export class CouponProgramSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CouponProgramSchedulerService.name);
  private timeoutId?: NodeJS.Timeout;

  constructor(private readonly triggerService: CouponProgramTriggerService) {}

  onModuleInit() {
    this.scheduleNextRun();
  }

  onModuleDestroy() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }

  private scheduleNextRun() {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setDate(now.getDate() + 1);
    nextMidnight.setHours(0, 0, 0, 0);

    const delay = Math.max(nextMidnight.getTime() - now.getTime(), 0);
    this.timeoutId = setTimeout(async () => {
      await this.runDailyJobs();
      this.scheduleNextRun();
    }, delay);
  }

  private async runDailyJobs() {
    try {
      await this.triggerService.issueBirthdayProgramsForMonth();
    } catch (error) {
      this.logger.error(
        'Failed to run birthday coupon job',
        (error as Error).stack,
      );
    }
  }
}
