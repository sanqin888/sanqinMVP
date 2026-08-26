import { Injectable } from '@nestjs/common';

export const POS_CLOVER_TERMINAL_PAYMENT_FLAG =
  'POS_CLOVER_TERMINAL_PAYMENT_ENABLED';

@Injectable()
export class PosCardPaymentFeatureConfig {
  isEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    return /^(1|true|yes)$/i.test(
      env[POS_CLOVER_TERMINAL_PAYMENT_FLAG]?.trim() ?? '',
    );
  }
}
