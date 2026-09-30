import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file: string) => readFileSync(resolve(__dirname, file), 'utf8');

describe('Catalog legacy combined Admin menu contraction', () => {
  it('removes the combined HTTP route and owner composition', () => {
    const controller = read('../admin/menu/admin-menu.controller.ts');
    const catalog = read('catalog-admin.service.ts');
    const offers = read(
      '../application/menu/catalog-offers-menu-orchestration.service.ts',
    );
    const sharedMenu = read('../../../../libs/shared/menu.ts');

    expect(controller).not.toContain("@Get('full')");
    expect(controller).not.toContain('getFullMenu(');
    expect(catalog).not.toContain('getFullMenu(');
    expect(offers).not.toContain('getFullMenu(');
    expect(sharedMenu).not.toContain('AdminMenuFullResponse');
    expect(sharedMenu).not.toContain('AdminMenuFull =');
  });

  it('keeps Daily Special composition as a narrow Store-scoped capability', () => {
    const controller = read('../admin/menu/admin-menu.controller.ts');
    const offers = read(
      '../application/menu/catalog-offers-menu-orchestration.service.ts',
    );

    expect(controller).toContain("@Get('daily-specials/active')");
    expect(controller).toContain('requireStoreStableId(storeStableId)');
    expect(offers).toContain('getActiveDailySpecials(');
    expect(offers).toContain('getMenuItemPricingSnapshots(storeStableId)');
  });
});
