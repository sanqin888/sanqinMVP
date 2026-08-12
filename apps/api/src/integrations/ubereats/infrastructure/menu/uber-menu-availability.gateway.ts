import { Injectable } from '@nestjs/common';
import type { UberMenuAvailabilityPort } from '../../application/ports/uber-use-case.ports';
import type {
  SyncAvailabilityInput,
  SyncOptionAvailabilityInput,
} from '../../domain/menu/uber-menu.types';
import { UberMenuDraftGateway } from '../persistence/uber-menu-workflow-prisma.repository';

/** Transport-facing availability adapter kept separate from draft queries/commands. */
@Injectable()
export class UberMenuAvailabilityGateway implements UberMenuAvailabilityPort {
  constructor(private readonly menu: UberMenuDraftGateway) {}

  syncUberMenuItemAvailability(input: SyncAvailabilityInput) {
    return this.menu.syncUberMenuItemAvailability(input);
  }

  syncUberOptionItemAvailability(input: SyncOptionAvailabilityInput) {
    return this.menu.syncUberOptionItemAvailability(input);
  }
}
