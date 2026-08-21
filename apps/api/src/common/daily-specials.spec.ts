import { DateTime } from 'luxon';
import { SpecialPricingMode } from '@prisma/client';
import { isDailySpecialActiveNow } from './daily-specials';

const baseSpecial = {
  pricingMode: SpecialPricingMode.OVERRIDE_PRICE,
  overridePriceCents: 599,
  discountDeltaCents: null,
  discountPercent: null,
  startDate: null,
  endDate: null,
  startMinutes: null,
  endMinutes: null,
  isEnabled: true,
};

describe('daily special schedule', () => {
  it('treats stored date-only values as store calendar dates', () => {
    const special = {
      ...baseSpecial,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-01'),
    };

    expect(
      isDailySpecialActiveNow(
        special,
        DateTime.fromISO('2026-08-31T23:30:00', {
          zone: 'America/Toronto',
        }),
      ),
    ).toBe(false);
    expect(
      isDailySpecialActiveNow(
        special,
        DateTime.fromISO('2026-09-01T00:01:00', {
          zone: 'America/Toronto',
        }),
      ),
    ).toBe(true);
    expect(
      isDailySpecialActiveNow(
        special,
        DateTime.fromISO('2026-09-01T23:59:00', {
          zone: 'America/Toronto',
        }),
      ),
    ).toBe(true);
  });

  it('applies the configured daily time window', () => {
    const special = {
      ...baseSpecial,
      startMinutes: 11 * 60,
      endMinutes: 14 * 60 + 30,
    };

    expect(
      isDailySpecialActiveNow(
        special,
        DateTime.fromISO('2026-09-01T10:59:00', {
          zone: 'America/Toronto',
        }),
      ),
    ).toBe(false);
    expect(
      isDailySpecialActiveNow(
        special,
        DateTime.fromISO('2026-09-01T14:30:00', {
          zone: 'America/Toronto',
        }),
      ),
    ).toBe(true);
    expect(
      isDailySpecialActiveNow(
        special,
        DateTime.fromISO('2026-09-01T14:31:00', {
          zone: 'America/Toronto',
        }),
      ),
    ).toBe(false);
  });
});
