import {
  formatMmDdYyyy,
  previousEqualRange,
  rangeForMode,
  shiftCalendarDate,
} from './date-range';

describe('Sales Analytics date range helpers', () => {
  it('defaults single-day mode to the selected Store-local date', () => {
    expect(rangeForMode('single', '2026-10-03', '2026-09-29')).toEqual({
      from: '2026-09-29',
      to: '2026-09-29',
    });
  });

  it('builds trailing 7/30/90 Store-local calendar ranges', () => {
    expect(rangeForMode('7d', '2026-10-03', '2026-10-03')).toEqual({
      from: '2026-09-27',
      to: '2026-10-03',
    });
    expect(rangeForMode('30d', '2026-10-03', '2026-10-03')).toEqual({
      from: '2026-09-04',
      to: '2026-10-03',
    });
    expect(rangeForMode('90d', '2026-10-03', '2026-10-03')).toEqual({
      from: '2026-07-06',
      to: '2026-10-03',
    });
  });

  it('moves one calendar day across month/year boundaries without browser timezone semantics', () => {
    expect(shiftCalendarDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftCalendarDate('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('builds a previous equal-length period without calling it year-over-year', () => {
    expect(previousEqualRange({ from: '2026-09-27', to: '2026-10-03' })).toEqual({
      from: '2026-09-20',
      to: '2026-09-26',
    });
  });

  it('formats the approved single-day selector as MM/DD/YYYY', () => {
    expect(formatMmDdYyyy('2026-10-03')).toBe('10/03/2026');
  });
});
