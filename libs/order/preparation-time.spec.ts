import {
  resolveOrderPreparationMinutes,
  resolveOrderPrepStartAt,
} from './preparation-time';

describe('order preparation-time policy', () => {
  it.each([
    [1, 10],
    [1_000, 10],
    [1_001, 15],
    [2_000, 15],
    [2_001, 20],
    [3_000, 20],
    [3_001, 25],
  ])('maps %i cents to %i preparation minutes', (totalCents, minutes) => {
    expect(resolveOrderPreparationMinutes(totalCents)).toBe(minutes);
  });

  it('derives prepStartAt from scheduledReadyAt using the same policy', () => {
    expect(
      resolveOrderPrepStartAt(
        2_500,
        new Date('2026-08-19T22:30:00.000Z'),
      ).toISOString(),
    ).toBe('2026-08-19T22:10:00.000Z');
  });
});
