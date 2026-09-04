import {
  buildAutoPauseReason,
  parseAutoPauseReason,
} from './temporary-closure-reason';

describe('temporary closure reason codec', () => {
  it('preserves the existing timed-pause persistence encoding', () => {
    const autoResumeAt = '2026-08-25T09:15:00-04:00';

    expect(buildAutoPauseReason(autoResumeAt)).toBe(
      '__AUTO_UNTIL__:2026-08-25T09:15:00-04:00|',
    );
    expect(buildAutoPauseReason(autoResumeAt, '  maintenance  ')).toBe(
      '__AUTO_UNTIL__:2026-08-25T09:15:00-04:00|maintenance',
    );
  });

  it('parses timed pauses and keeps ordinary reasons outside the codec', () => {
    const encoded = '__AUTO_UNTIL__:2026-08-25T09:15:00-04:00| maintenance ';

    expect(parseAutoPauseReason(encoded)).toEqual({
      autoResumeAt: '2026-08-25T09:15:00-04:00',
      displayReason: 'maintenance',
    });
    expect(parseAutoPauseReason('manual closure')).toBeNull();
    expect(parseAutoPauseReason('__AUTO_UNTIL__:|')).toBeNull();
  });
});
