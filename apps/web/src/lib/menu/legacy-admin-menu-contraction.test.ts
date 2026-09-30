import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '../..');
const readSource = (path: string) =>
  readFileSync(resolve(SRC_ROOT, path), 'utf8');

describe('legacy Admin combined menu contraction', () => {
  it('removes the combined Admin menu page', () => {
    expect(
      existsSync(
        resolve(
          SRC_ROOT,
          'app/[locale]/(site)/admin/(protected)/menu/page.tsx',
        ),
      ),
    ).toBe(false);
  });

  it('does not leave navigation pointing at the removed combined workspace', () => {
    const optionsPage = readSource(
      'app/[locale]/(site)/admin/(protected)/menu/options/page.tsx',
    );

    expect(optionsPage).toContain('/admin/menu/categories?store=');
    expect(optionsPage).not.toContain('/admin/menu?store=');
  });

  it('keeps former consumers off /admin/menu/full', () => {
    const consumers = [
      'app/[locale]/(site)/admin/(protected)/promotions/coupons/page.tsx',
      'app/[locale]/(site)/admin/(protected)/promotions/automatic/page.tsx',
      'app/[locale]/(site)/admin/(protected)/promotions/specials/page.tsx',
      'app/[locale]/(site)/admin/(protected)/homepage/page.tsx',
      'app/[locale]/(device)/store/pos/orders/page.tsx',
      'app/[locale]/(device)/store/pos/menu/page.tsx',
    ];

    consumers.forEach((consumer) => {
      expect(readSource(consumer)).not.toContain('/admin/menu/full');
    });
  });

  it('uses explicit Store context for Marketing and authenticated device Store context for POS', () => {
    const adminShell = readSource('components/staff/AdminShell.tsx');
    const coupons = readSource(
      'app/[locale]/(site)/admin/(protected)/promotions/coupons/page.tsx',
    );
    const specials = readSource(
      'app/[locale]/(site)/admin/(protected)/promotions/specials/page.tsx',
    );
    const posOrders = readSource(
      'app/[locale]/(device)/store/pos/orders/page.tsx',
    );
    const posMenu = readSource(
      'app/[locale]/(device)/store/pos/menu/page.tsx',
    );

    expect(adminShell).toContain("activeCategory.id === 'marketing'");
    expect(coupons).toContain("searchParams.get('store')");
    expect(specials).toContain(
      "withStoreStableId('/admin/menu/daily-specials'",
    );
    expect(posOrders).toContain('fetchPosStoreContext()');
    expect(posOrders).toContain('/admin/menu/daily-specials/active');
    expect(posMenu).toContain('fetchPosStoreContext()');
  });
});
