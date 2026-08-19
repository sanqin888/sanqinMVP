const TEN_DOLLARS_CENTS = 1_000;
const BASE_PREPARATION_MINUTES = 10;
const ADDITIONAL_BAND_MINUTES = 5;
const MINUTE_MS = 60_000;

/** Channel-neutral order preparation policy shared by API bounded contexts. */
export function resolveOrderPreparationMinutes(totalCents: number): number {
  const normalizedTotalCents = Number.isFinite(totalCents)
    ? Math.max(1, Math.ceil(totalCents))
    : 1;
  const tenDollarBands = Math.ceil(normalizedTotalCents / TEN_DOLLARS_CENTS);
  return (
    BASE_PREPARATION_MINUTES +
    Math.max(0, tenDollarBands - 1) * ADDITIONAL_BAND_MINUTES
  );
}

export function resolveOrderReadyForPickupAt(
  totalCents: number,
  referenceAt: Date,
): Date {
  return new Date(
    referenceAt.getTime() +
      resolveOrderPreparationMinutes(totalCents) * MINUTE_MS,
  );
}

export function resolveOrderPrepStartAt(
  totalCents: number,
  scheduledReadyAt: Date,
): Date {
  return new Date(
    scheduledReadyAt.getTime() -
      resolveOrderPreparationMinutes(totalCents) * MINUTE_MS,
  );
}
