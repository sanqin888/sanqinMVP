import { type UberMenuAvailabilityPort } from '../ports/uber-use-case.ports';
/** Synchronizes availability with the stable menu-node id as idempotency key. */
export class UberMenuAvailabilityUseCase {
  constructor(private readonly availability: UberMenuAvailabilityPort) {}
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
