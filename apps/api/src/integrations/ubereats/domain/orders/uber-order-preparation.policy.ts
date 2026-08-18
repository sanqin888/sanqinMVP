const TEN_DOLLARS_CENTS = 1_000;
const BASE_PREPARATION_MINUTES = 10;
const ADDITIONAL_BAND_MINUTES = 5;
const MINUTE_MS = 60_000;

/** Pure preparation-time policy for Uber Eats ACCEPT commands. */
export function resolveUberPreparationMinutes(totalCents: number): number {
  const normalizedTotalCents = Number.isFinite(totalCents)
    ? Math.max(1, Math.ceil(totalCents))
    : 1;
  const tenDollarBands = Math.ceil(normalizedTotalCents / TEN_DOLLARS_CENTS);
  return (
    BASE_PREPARATION_MINUTES +
    Math.max(0, tenDollarBands - 1) * ADDITIONAL_BAND_MINUTES
  );
}

export function resolveUberReadyForPickupAt(
  totalCents: number,
  referenceAt: Date,
): Date {
  return new Date(
    referenceAt.getTime() +
      resolveUberPreparationMinutes(totalCents) * MINUTE_MS,
  );
}
