import { Inject, Injectable } from '@nestjs/common';
import type { UberWebhookInput } from '../../domain/webhook/uber-webhook.types';
import {
  UBER_WEBHOOK_INBOX_RECEIVER_PORT,
  type UberWebhookInboxReceiverPort,
} from '../ports/uber-use-case.ports';
/** Verifies the signature and atomically inserts an inbox row keyed by Uber event id. */
@Injectable()
export class ReceiveUberWebhookUseCase {
  constructor(
    @Inject(UBER_WEBHOOK_INBOX_RECEIVER_PORT)
    private readonly inbox: UberWebhookInboxReceiverPort,
  ) {}
  execute(input: UberWebhookInput): Promise<void> {
    return this.inbox.handleWebhook(input);
  }
}
