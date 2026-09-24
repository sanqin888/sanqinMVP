export type AccountingDateRange = {
  from: string;
  to: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnlyUtcMillis(raw: string): number | null {
  const millis = Date.parse(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(millis)) return null;
  return new Date(millis).toISOString().slice(0, 10) === raw ? millis : null;
}

export function previousEqualRange(
  from: string,
  to: string,
): AccountingDateRange | null {
  const fromMs = dateOnlyUtcMillis(from);
  const toMs = dateOnlyUtcMillis(to);
  if (fromMs === null || toMs === null || toMs < fromMs) {
    return null;
  }

  const days = Math.floor((toMs - fromMs) / DAY_MS) + 1;
  const previousToMs = fromMs - DAY_MS;
  const previousFromMs = previousToMs - (days - 1) * DAY_MS;
  return {
    from: new Date(previousFromMs).toISOString().slice(0, 10),
    to: new Date(previousToMs).toISOString().slice(0, 10),
  };
}

export function previousEqualRangeWithinAccountingCoverage(
  from: string,
  to: string,
  accountingStartDate: string,
): AccountingDateRange | null {
  const previous = previousEqualRange(from, to);
  const accountingStartMs = dateOnlyUtcMillis(accountingStartDate);
  if (!previous || accountingStartMs === null) return null;

  const previousFromMs = dateOnlyUtcMillis(previous.from);
  if (previousFromMs === null || previousFromMs < accountingStartMs) {
    return null;
  }
  return previous;
}
