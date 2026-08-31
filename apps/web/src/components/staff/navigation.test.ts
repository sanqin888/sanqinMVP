import { isStaffRouteActive } from './navigation';

describe('isStaffRouteActive', () => {
  it('matches an exact staff route without matching descendants', () => {
    expect(isStaffRouteActive('/zh/admin', '/zh/admin', 'exact')).toBe(true);
    expect(isStaffRouteActive('/zh/admin/menu', '/zh/admin', 'exact')).toBe(false);
  });

  it('matches a section root and its descendants', () => {
    expect(isStaffRouteActive('/en/accounting/expenses', '/en/accounting/expenses')).toBe(true);
    expect(
      isStaffRouteActive(
        '/en/accounting/expenses/document/receipt_123',
        '/en/accounting/expenses',
      ),
    ).toBe(true);
  });

  it('does not match routes that only share a string prefix', () => {
    expect(isStaffRouteActive('/zh/admin/menu-options', '/zh/admin/menu')).toBe(false);
  });

  it('normalizes trailing slashes before matching', () => {
    expect(isStaffRouteActive('/zh/accounting/inbox/', '/zh/accounting/inbox')).toBe(true);
  });
});
