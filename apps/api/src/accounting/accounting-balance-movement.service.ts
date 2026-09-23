import { ConflictException, Injectable } from '@nestjs/common';

import type { AccountingBalanceMovementReportV1 } from './accounting-balance-movement.contract';
import { projectAccountingBalanceMovement } from './accounting-balance-movement.policy';
import { AccountingTrialBalanceService } from './accounting-trial-balance.service';

@Injectable()
export class AccountingBalanceMovementService {
  constructor(private readonly trialBalance: AccountingTrialBalanceService) {}

  async project(query: {
    from?: string;
    to?: string;
    currency?: string;
  }): Promise<AccountingBalanceMovementReportV1> {
    const trialBalance = await this.trialBalance.project(query);

    try {
      return projectAccountingBalanceMovement(trialBalance);
    } catch (cause) {
      throw new ConflictException(
        cause instanceof Error
          ? cause.message
          : 'Balance Movement projection invariant failed',
      );
    }
  }
}
