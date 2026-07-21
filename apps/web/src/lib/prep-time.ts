const MIN_DISPLAYED_PREP_TIME_MINUTES = 10;
const MAX_DISPLAYED_PREP_TIME_MINUTES = 30;

export function clampDisplayedPrepTimeMinutes(minutes: number): number {
  return Math.min(
    MAX_DISPLAYED_PREP_TIME_MINUTES,
    Math.max(MIN_DISPLAYED_PREP_TIME_MINUTES, minutes),
  );
}
