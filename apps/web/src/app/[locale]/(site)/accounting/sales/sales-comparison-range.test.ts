import {
  previousEqualRange,
  previousEqualRangeWithinAccountingCoverage,
} from './sales-comparison-range';

describe('Accounting Sales equal-period comparison range', () => {
  it('computes an equal-length immediately preceding date range', () => {
    expect(previousEqualRange('2026-07-01', '2026-07-31')).toEqual({
      from: '2026-05-31',
      to: '2026-06-30',
    });
  });

  it('suppresses a comparison that starts before accounting coverage', () => {
    expect(
      previousEqualRangeWithinAccountingCoverage(
        '2026-06-01',
        '2026-06-30',
        '2026-06-01',
      ),
    ).toBeNull();
  });

  it('suppresses a partially covered prior period instead of allowing API clamping', () => {
    expect(
      previousEqualRangeWithinAccountingCoverage(
        '2026-06-15',
        '2026-06-30',
        '2026-06-01',
      ),
    ).toBeNull();
  });

  it('returns the prior period when the full range is covered', () => {
    expect(
      previousEqualRangeWithinAccountingCoverage(
        '2026-08-01',
        '2026-08-31',
        '2026-06-01',
      ),
    ).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    });
  });

  it('fails closed on invalid date-only inputs', () => {
    expect(previousEqualRange('2026-02-30', '2026-03-01')).toBeNull();
    expect(
      previousEqualRangeWithinAccountingCoverage(
        '2026-07-01',
        '2026-07-31',
        'not-a-date',
      ),
    ).toBeNull();
  });
});
