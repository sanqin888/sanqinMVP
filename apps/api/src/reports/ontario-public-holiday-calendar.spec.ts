import {
  getOntarioLongWeekendsForYear,
  getOntarioPublicHolidaysForYear,
} from './ontario-public-holiday-calendar';

describe('Ontario public holiday calendar v1', () => {
  it('matches the nine Ontario ESA public holidays for 2026', () => {
    const holidays = getOntarioPublicHolidaysForYear(2026);
    expect(
      holidays.map((holiday) => [holiday.holidayStableId, holiday.date]),
    ).toEqual([
      ['ca-on-new-years-day', '2026-01-01'],
      ['ca-on-family-day', '2026-02-16'],
      ['ca-on-good-friday', '2026-04-03'],
      ['ca-on-victoria-day', '2026-05-18'],
      ['ca-on-canada-day', '2026-07-01'],
      ['ca-on-labour-day', '2026-09-07'],
      ['ca-on-thanksgiving-day', '2026-10-12'],
      ['ca-on-christmas-day', '2026-12-25'],
      ['ca-on-boxing-day', '2026-12-26'],
    ]);
  });

  it('does not classify non-ESA Ontario observances as public holidays', () => {
    const holidayDates = new Set(
      getOntarioPublicHolidaysForYear(2026).map((holiday) => holiday.date),
    );

    for (const date of [
      '2026-04-06',
      '2026-08-03',
      '2026-09-30',
      '2026-11-11',
    ]) {
      expect(holidayDates.has(date)).toBe(false);
    }
  });

  it('applies historical Family Day only from the v1 supported era', () => {
    expect(getOntarioPublicHolidaysForYear(2007)).toEqual([]);
    expect(
      getOntarioPublicHolidaysForYear(2008).find(
        (holiday) => holiday.holidayStableId === 'ca-on-family-day',
      )?.date,
    ).toBe('2008-02-18');
  });

  it('moves Canada Day to July 2 when July 1 falls on Sunday', () => {
    const holidays = getOntarioPublicHolidaysForYear(2018);
    expect(
      holidays.find(
        (holiday) => holiday.holidayStableId === 'ca-on-canada-day',
      )?.date,
    ).toBe('2018-07-02');

    expect(
      getOntarioLongWeekendsForYear(2018).find(
        (weekend) => weekend.holidayStableId === 'ca-on-canada-day',
      ),
    ).toMatchObject({
      startDate: '2018-06-30',
      endDate: '2018-07-02',
    });
  });

  it('keeps variable-date rules deterministic across years', () => {
    const holidays = getOntarioPublicHolidaysForYear(2027);
    const byId = new Map(
      holidays.map((holiday) => [holiday.holidayStableId, holiday.date]),
    );

    expect(byId.get('ca-on-good-friday')).toBe('2027-03-26');
    expect(byId.get('ca-on-victoria-day')).toBe('2027-05-24');
    expect(byId.get('ca-on-labour-day')).toBe('2027-09-06');
    expect(byId.get('ca-on-thanksgiving-day')).toBe('2027-10-11');
  });

  it('marks only Friday/Monday public-holiday three-day weekends', () => {
    const weekends = getOntarioLongWeekendsForYear(2026);
    expect(
      weekends.map((weekend) => [
        weekend.holidayStableId,
        weekend.startDate,
        weekend.endDate,
      ]),
    ).toEqual([
      ['ca-on-family-day', '2026-02-14', '2026-02-16'],
      ['ca-on-good-friday', '2026-04-03', '2026-04-05'],
      ['ca-on-victoria-day', '2026-05-16', '2026-05-18'],
      ['ca-on-labour-day', '2026-09-05', '2026-09-07'],
      ['ca-on-thanksgiving-day', '2026-10-10', '2026-10-12'],
      ['ca-on-christmas-day', '2026-12-25', '2026-12-27'],
    ]);
  });
});
