const AUTO_UNTIL_PREFIX = '__AUTO_UNTIL__:';

export type AutoPauseReason = {
  autoResumeAt: string;
  displayReason: string | null;
};

/**
 * Brand/Store-owned codec for the persisted timed temporary-closure reason.
 * POS may request timed closures, but it does not own this persistence encoding.
 */
export function parseAutoPauseReason(
  reason: string | null | undefined,
): AutoPauseReason | null {
  if (!reason || !reason.startsWith(AUTO_UNTIL_PREFIX)) return null;

  const payload = reason.slice(AUTO_UNTIL_PREFIX.length);
  const splitIndex = payload.indexOf('|');
  const autoResumeAt = (
    splitIndex >= 0 ? payload.slice(0, splitIndex) : payload
  ).trim();
  const displayReasonRaw = splitIndex >= 0 ? payload.slice(splitIndex + 1) : '';
  const displayReason = displayReasonRaw.trim() || null;

  if (!autoResumeAt) return null;
  return { autoResumeAt, displayReason };
}

export function buildAutoPauseReason(
  autoResumeAt: string,
  displayReason?: string | null,
): string {
  const suffix = displayReason?.trim() ? `|${displayReason.trim()}` : '|';
  return `${AUTO_UNTIL_PREFIX}${autoResumeAt}${suffix}`;
}
