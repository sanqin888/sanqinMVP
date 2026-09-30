import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file: string) => readFileSync(resolve(__dirname, file), 'utf8');

describe('Catalog Store-scoped runtime contracts', () => {
  it('requires Store identity on Catalog consumer ports', () => {
    const orders = read('catalog-order-facts-reader.contract.ts');
    const external = read('catalog-external-menu-facts-reader.contract.ts');
    const availability = read('catalog-availability-reader.contract.ts');

    expect(orders).toContain('storeStableId: string');
    expect(external).toContain(
      'readMenuSource(storeStableId: string): Promise<CatalogExternalMenuSourceFacts>',
    );
    expect(availability).toContain('storeStableId: string');
  });

  it('keeps Admin and Public Menu entry points Store-aware', () => {
    const admin = read('../admin/menu/admin-menu.controller.ts');
    const publicMenu = read('public-menu.controller.ts');

    expect(admin).toContain("@Query('storeStableId')");
    expect(admin).toContain('requireStoreStableId(storeStableId)');
    expect(publicMenu).toContain('getConfiguredStoreSnapshot()');
    expect(publicMenu).toContain(
      'this.service.getPublicMenu(store.storeStableId)',
    );
  });

  it('threads authenticated Store identity through POS pricing and Uber Catalog reads', () => {
    const pos = read('../orders/pos-order-operations.service.ts');
    const uberPort = read(
      '../integrations/ubereats/application/shared/uber-catalog-menu-facts.port.ts',
    );

    expect(pos).toContain('storeStableId,');
    expect(pos).toContain('quoteOrderPricing(dto');
    expect(uberPort).toContain('readMenuSource(storeStableId: string)');
    expect(uberPort).toContain('getMenuItemSource(');
    expect(uberPort).toContain('listOrderModifierSnapshotSources(');
  });
});
