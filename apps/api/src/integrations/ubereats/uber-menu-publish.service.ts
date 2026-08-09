import { Injectable } from '@nestjs/common';
import { UberMenuWorkflowCore } from './uber-menu.workflow';

/** Owns publishing, notification reconciliation and publish error mapping. */
@Injectable()
export class UberMenuPublishService {
  constructor(private readonly workflow: UberMenuWorkflowCore) {}
  publishUberMenu(
    ...args: Parameters<UberMenuWorkflowCore['publishUberMenu']>
  ) {
    return this.workflow.publishUberMenu(...args);
  }
  processWebhookEvent(
    ...args: Parameters<UberMenuWorkflowCore['processWebhookEvent']>
  ) {
    return this.workflow.processWebhookEvent(...args);
  }
}
