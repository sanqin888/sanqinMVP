import { UberPublicBaseUrlAdapter } from './uber-public-base-url.adapter';

describe('UberPublicBaseUrlAdapter', () => {
  it('prefers and normalizes PUBLIC_BASE_URL', () => {
    expect(
      new UberPublicBaseUrlAdapter({
        PUBLIC_BASE_URL: ' https://public.example/menu ',
        WEB_BASE_URL: 'https://web.example',
      }).publicBaseUrl,
    ).toBe('https://public.example/menu');
  });

  it('uses WEB_BASE_URL when PUBLIC_BASE_URL is absent', () => {
    expect(
      new UberPublicBaseUrlAdapter({ WEB_BASE_URL: 'https://web.example' })
        .publicBaseUrl,
    ).toBe('https://web.example/');
  });

  it.each([
    {},
    { PUBLIC_BASE_URL: 'not-a-url' },
    { PUBLIC_BASE_URL: 'http://public.example' },
    { PUBLIC_BASE_URL: 'https://localhost:3000' },
  ])('rejects a missing or non-public base URL: %p', (env) => {
    expect(() => new UberPublicBaseUrlAdapter(env)).toThrow(
      'PUBLIC_BASE_URL 或 WEB_BASE_URL',
    );
  });
});
