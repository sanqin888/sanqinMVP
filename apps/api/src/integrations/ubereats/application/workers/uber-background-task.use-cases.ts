import { Injectable } from '@nestjs/common';

import { ConfirmUberMenuPublicationUseCase } from '../menu/confirm-uber-menu-publication.use-case';
import { RecoverTimedOutMenuPublicationsUseCase } from '../menu/recover-timed-out-menu-publications.use-case';
import { ExecuteUberOrderActionWorker } from '../orders/uber-order.use-cases';
import { ProcessUberWebhookInboxUseCase } from '../orders/process-uber-webhook-inbox.use-case';

/**
 * Application entry points for durable background work.  Infrastructure timers
 * deliberately know nothing about Prisma, leases, retry policy, or Uber APIs.
 */
@Injectable()
export class ClaimAndProcessUberWebhookInboxUseCase {
  constructor(private readonly inbox: ProcessUberWebhookInboxUseCase) {}

  execute(limit = 50): Promise<number> {
    return this.inbox.execute(limit);
  }
}

@Injectable()
export class ClaimAndExecuteUberOrderActionsUseCase {
  constructor(private readonly actions: ExecuteUberOrderActionWorker) {}

  execute(limit = 50): Promise<unknown> {
    return this.actions.execute(limit);
  }
}

@Injectable()
export class ConfirmUberMenuPublicationsUseCase {
  constructor(
    private readonly confirmations: ConfirmUberMenuPublicationUseCase,
    private readonly recovery: RecoverTimedOutMenuPublicationsUseCase,
  ) {}

  async execute(limit = 20): Promise<number> {
    const confirmed = await this.confirmations.execute(limit);
    await this.recovery.execute(undefined, limit);
    return confirmed;
  }
}
