import {
  accountingBusinessDateToday,
  accountingReportPresetRange,
} from './accounting-reporting-date';

describe('Accounting reporting business dates', () => {
  it('resolves today in the Toronto business timezone instead of UTC', () => {
    expect(
      accountingBusinessDateToday(new Date('2026-01-01T02:30:00.000Z')),
    ).toBe('2025-12-31');
  });

  it('builds business-date-safe report presets', () => {
    expect(accountingReportPresetRange('month', '2026-09-23')).toEqual({
      from: '2026-09-01',
      to: '2026-09-23',
    });
    expect(accountingReportPresetRange('lastMonth', '2026-03-15')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(accountingReportPresetRange('lastMonth', '2026-01-15')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
    expect(accountingReportPresetRange('quarter', '2026-09-23')).toEqual({
      from: '2026-07-01',
      to: '2026-09-23',
    });
    expect(accountingReportPresetRange('year', '2026-09-23')).toEqual({
      from: '2026-01-01',
      to: '2026-09-23',
    });
  });
});
