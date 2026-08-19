import {
  resolveOrderPreparationMinutes,
  resolveOrderReadyForPickupAt,
} from '@shared/order';

/** Uber compatibility facade over the channel-neutral Order preparation policy. */
export function resolveUberPreparationMinutes(totalCents: number): number {
  return resolveOrderPreparationMinutes(totalCents);
}

export function resolveUberReadyForPickupAt(
  totalCents: number,
  referenceAt: Date,
): Date {
  return resolveOrderReadyForPickupAt(totalCents, referenceAt);
}
