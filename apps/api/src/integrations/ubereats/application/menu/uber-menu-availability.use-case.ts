import { Inject, Injectable } from '@nestjs/common';
import {
  UBER_MENU_AVAILABILITY_PORT,
  type UberMenuAvailabilityPort,
} from '../ports/uber-use-case.ports';
/** Synchronizes availability with the stable menu-node id as idempotency key. */
@Injectable()
export class UberMenuAvailabilityUseCase {
  constructor(
    @Inject(UBER_MENU_AVAILABILITY_PORT)
    private readonly availability: UberMenuAvailabilityPort,
  ) {}
  syncUberMenuItemAvailability(
    ...args: Parameters<
      UberMenuAvailabilityPort['syncUberMenuItemAvailability']
    >
  ) {
    return this.availability.syncUberMenuItemAvailability(...args);
  }
  syncUberOptionItemAvailability(
    ...args: Parameters<
      UberMenuAvailabilityPort['syncUberOptionItemAvailability']
    >
  ) {
    return this.availability.syncUberOptionItemAvailability(...args);
  }
}
