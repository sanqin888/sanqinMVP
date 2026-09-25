import { resolveStaffOauthRedirect } from './staff-entry.policy';

describe('Staff OAuth redirect policy', () => {
  it('preserves only destinations allowed by the role matrix', () => {
    expect(
      resolveStaffOauthRedirect('ADMIN', '/en/accounting/reports', 'en'),
    ).toBe('/en/accounting/reports');
    expect(resolveStaffOauthRedirect('ACCOUNTANT', '/en/admin', 'en')).toBe(
      '/en/accounting/dashboard',
    );
    expect(
      resolveStaffOauthRedirect('STAFF', '/zh/accounting/dashboard', 'zh'),
    ).toBe('/zh/store/pos');
    expect(resolveStaffOauthRedirect('ACCOUNTANT', '/en/accounting', 'en')).toBe(
      '/en/accounting/dashboard',
    );
  });

  it('rejects protocol-relative and non-staff destinations', () => {
    expect(resolveStaffOauthRedirect('ADMIN', '//evil.example', 'en')).toBe(
      '/en/admin',
    );
    expect(
      resolveStaffOauthRedirect('ACCOUNTANT', '/en/membership', 'en'),
    ).toBe('/en/accounting/dashboard');
  });
});
