import {
  buildStaffLoginPath,
  normalizeStaffNext,
  resolveStaffLanding,
  staffRoleCanAccessSurface,
} from './staff-entry';

describe('staff entry routing policy', () => {
  it('enforces the accepted surface matrix', () => {
    expect(staffRoleCanAccessSurface('ADMIN', 'admin')).toBe(true);
    expect(staffRoleCanAccessSurface('ADMIN', 'accounting')).toBe(true);
    expect(staffRoleCanAccessSurface('ADMIN', 'pos')).toBe(true);
    expect(staffRoleCanAccessSurface('ACCOUNTANT', 'accounting')).toBe(true);
    expect(staffRoleCanAccessSurface('ACCOUNTANT', 'admin')).toBe(false);
    expect(staffRoleCanAccessSurface('ACCOUNTANT', 'pos')).toBe(false);
    expect(staffRoleCanAccessSurface('STAFF', 'pos')).toBe(true);
    expect(staffRoleCanAccessSurface('STAFF', 'admin')).toBe(false);
    expect(staffRoleCanAccessSurface('STAFF', 'accounting')).toBe(false);
  });

  it('keeps only locale-scoped staff destinations', () => {
    expect(normalizeStaffNext('/en/accounting/reports?from=2026-09-01', 'en')).toBe(
      '/en/accounting/reports?from=2026-09-01',
    );
    expect(normalizeStaffNext('/en/store/pos/orders', 'en')).toBe('/en/store/pos/orders');
    expect(normalizeStaffNext('/en/accounting', 'en')).toBe(
      '/en/accounting/dashboard',
    );
    expect(normalizeStaffNext('/zh/admin', 'en')).toBeNull();
    expect(normalizeStaffNext('//evil.example/path', 'en')).toBeNull();
    expect(normalizeStaffNext('/en/membership', 'en')).toBeNull();
  });

  it('falls back by role when the requested surface is unauthorized', () => {
    expect(resolveStaffLanding('ADMIN', 'en', '/en/accounting/dashboard')).toBe(
      '/en/accounting/dashboard',
    );
    expect(resolveStaffLanding('ACCOUNTANT', 'en', '/en/admin')).toBe(
      '/en/accounting/dashboard',
    );
    expect(resolveStaffLanding('STAFF', 'zh', '/zh/accounting/dashboard')).toBe(
      '/zh/store/pos',
    );
  });

  it('builds one unified login URL and preserves the device hint', () => {
    expect(buildStaffLoginPath('en', '/en/store/pos', { needDevice: true })).toBe(
      '/en/staff/login?next=%2Fen%2Fstore%2Fpos&needDevice=1',
    );
  });
});
