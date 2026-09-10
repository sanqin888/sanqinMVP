import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file: string) => readFileSync(resolve(__dirname, file), 'utf8');

describe('Catalog external availability composition boundary', () => {
  it('keeps the Catalog orchestration service independent from Uber implementation contracts', () => {
    const service = read('catalog-uber-availability-orchestration.service.ts');

    expect(service).toContain('CATALOG_EXTERNAL_AVAILABILITY_SYNC');
    expect(service).not.toContain('integrations/ubereats');
    expect(service).not.toContain('UBER_EATS_MENU_AVAILABILITY');
  });

  it('keeps the Uber binding in the explicit Catalog/Uber composition module', () => {
    const module = read('catalog-uber-availability-orchestration.module.ts');

    expect(module).toContain('CATALOG_EXTERNAL_AVAILABILITY_SYNC');
    expect(module).toContain('UBER_EATS_MENU_AVAILABILITY');
    expect(module).toContain('syncUberMenuItemAvailability');
    expect(module).toContain('syncUberOptionItemAvailability');
  });
});
