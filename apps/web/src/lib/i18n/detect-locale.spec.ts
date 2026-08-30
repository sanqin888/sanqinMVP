import {
  pickSupportedLocaleFromAcceptLanguage,
  resolveLocalePreference,
} from './detect-locale';

describe('resolveLocalePreference', () => {
  it('gives the manual site selection highest priority', () => {
    expect(
      resolveLocalePreference({
        manualLocale: 'en',
        memberLocale: 'zh',
        acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8',
      }),
    ).toBe('en');
  });

  it('uses the member preference when there is no manual selection', () => {
    expect(
      resolveLocalePreference({
        memberLocale: 'zh',
        acceptLanguage: 'en-CA,en;q=0.9',
      }),
    ).toBe('zh');
  });

  it('uses the browser preference when neither higher-priority preference exists', () => {
    expect(
      resolveLocalePreference({
        acceptLanguage: 'en-CA,en;q=0.9,zh-CN;q=0.8',
      }),
    ).toBe('en');
  });
});

describe('pickSupportedLocaleFromAcceptLanguage', () => {
  it('uses English when English is the browser primary language even if Chinese is also accepted', () => {
    expect(
      pickSupportedLocaleFromAcceptLanguage('en-CA,en;q=0.9,zh-CN;q=0.8'),
    ).toBe('en');
  });

  it('uses Chinese when Chinese has the highest browser preference', () => {
    expect(
      pickSupportedLocaleFromAcceptLanguage('zh-CN,zh;q=0.9,en;q=0.8'),
    ).toBe('zh');
  });

  it('respects q values when the header order differs from preference weight', () => {
    expect(
      pickSupportedLocaleFromAcceptLanguage('zh-CN;q=0.4,en-CA;q=0.9'),
    ).toBe('en');
  });

  it('falls back to English when no supported language is present', () => {
    expect(pickSupportedLocaleFromAcceptLanguage('fr-CA,fr;q=0.9')).toBe('en');
  });
});
