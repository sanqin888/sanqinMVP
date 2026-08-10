import { Injectable } from '@nestjs/common';

import { UberMenuPublishService } from '../menu/uber-menu-publish.service';
import { ExecuteUberOrderActionWorker } from '../orders/uber-order.use-cases';
import { ProcessUberWebhookInboxWorker } from '../orders/uber-webhook-inbox.worker';

/**
 * Application entry points for durable background work.  Infrastructure timers
 * deliberately know nothing about Prisma, leases, retry policy, or Uber APIs.
 */
@Injectable()
export class ClaimAndProcessUberWebhookInboxUseCase {
  constructor(private readonly inbox: ProcessUberWebhookInboxWorker) {}

  execute(limit = 50): Promise<number> {
    return this.inbox.processDueWebhooks(limit);
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
  constructor(private readonly publications: UberMenuPublishService) {}

  execute(timeoutMs?: number): Promise<number> {
    return this.publications.recoverTimedOutPublications(timeoutMs);
  }
}
