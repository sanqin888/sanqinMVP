import { ProcessUberWebhookInboxUseCase } from './process-uber-webhook-inbox.use-case';

/** Application coordinator for one durable webhook-inbox batch. */
export class ClaimAndProcessUberWebhookInboxUseCase {
  constructor(private readonly inbox: ProcessUberWebhookInboxUseCase) {}

  execute(limit = 50): Promise<number> {
    return this.inbox.execute(limit);
  }
}
