import { Inject, Injectable } from '@nestjs/common';
import {
  UBER_MENU_PUBLISH_PORT,
  type UberMenuPublishPort,
} from '../ports/uber-use-case.ports';
/** Publication request and asynchronous confirmation use cases share the publish-attempt idempotency key. */
@Injectable()
export class UberMenuPublishService {
  constructor(
    @Inject(UBER_MENU_PUBLISH_PORT)
    private readonly publications: UberMenuPublishPort,
  ) {}
  recoverTimedOutPublications(timeoutMs?: number) {
    return this.publications.recoverTimedOutPublications(timeoutMs);
  }
  publishUberMenu(...args: Parameters<UberMenuPublishPort['publishUberMenu']>) {
    return this.publications.publishUberMenu(...args);
  }
  processWebhookEvent(
    ...args: Parameters<UberMenuPublishPort['processWebhookEvent']>
  ) {
    return this.publications.processWebhookEvent(...args);
  }
}
