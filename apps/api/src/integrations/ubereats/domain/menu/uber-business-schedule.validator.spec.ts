import {
  validateUberBusinessSchedule,
  validateUberStoreTimezone,
} from './uber-business-schedule.validator';

describe('Uber business schedule policy', () => {
  it('rejects a schedule without timezone', () => {
    expect(
      validateUberBusinessSchedule({
        timezone: null,
        salesTaxRate: 0.13,
        hours: [],
      }),
    ).toEqual(expect.objectContaining({ valid: false }));
  });

  it('rejects a timezone mismatch', () => {
    expect(
      validateUberStoreTimezone({
        businessTimezone: 'America/Toronto',
        uberTimezone: 'America/Vancouver',
        timezoneConfirmed: true,
      }),
    ).toContain('不一致');
  });
});
