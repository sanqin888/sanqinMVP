import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

/**
 * 账单邮件改为 thank-you 页手动触发，支付成功后不再自动发送。
 */
@Injectable()
export class NotificationProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationProcessor.name);

  onModuleInit() {
    this.logger.log(
      '[Notification] Auto invoice email is disabled. Waiting for manual send action from thank-you page.',
    );
  }

  onModuleDestroy() {
    // no-op
  }
}
