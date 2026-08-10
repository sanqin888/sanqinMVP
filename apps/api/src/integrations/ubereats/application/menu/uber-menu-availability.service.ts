import { Injectable } from '@nestjs/common';
import { UberMenuWorkflowCore } from './uber-menu.workflow';

/** Owns item and option availability synchronization use cases. */
@Injectable()
export class UberMenuAvailabilityService {
  constructor(private readonly workflow: UberMenuWorkflowCore) {}
  syncUberMenuItemAvailability(
    ...args: Parameters<UberMenuWorkflowCore['syncUberMenuItemAvailability']>
  ) {
    return this.workflow.syncUberMenuItemAvailability(...args);
  }
  syncUberOptionItemAvailability(
    ...args: Parameters<UberMenuWorkflowCore['syncUberOptionItemAvailability']>
  ) {
    return this.workflow.syncUberOptionItemAvailability(...args);
  }
}
