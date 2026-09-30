import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');

function sourceBetween(start: string, end: string): string {
  const startIndex = pageSource.indexOf(start);
  const endIndex = pageSource.indexOf(end, startIndex);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Unable to locate Item workspace source boundary: ${start} -> ${end}`);
  }
  return pageSource.slice(startIndex, endIndex);
}

describe('Admin item workspace boundary', () => {
  it('loads narrow Catalog reads instead of the combined full-menu endpoint', () => {
    expect(pageSource).toContain("storeScopedPath('/admin/menu/categories')");
    expect(pageSource).toContain("storeScopedPath('/admin/menu/items')");
    expect(pageSource).toContain(
      "storeScopedPath('/admin/menu/option-group-templates')",
    );
    expect(pageSource).toContain("apiFetch<MenuPackagingTypeDto[]>('/admin/menu/packaging-types')");
    expect(pageSource).not.toContain('/admin/menu/full');
  });

  it('keeps availability changes on the dedicated endpoint', () => {
    const ordinarySave = sourceBetween(
      'async function saveItem',
      'async function setAvailability',
    );
    expect(ordinarySave).not.toMatch(/\bisAvailable\s*:/);
    expect(ordinarySave).not.toMatch(/\btempUnavailableUntil\s*:/);

    const availabilityUpdate = sourceBetween(
      'async function setAvailability',
      'function getBindingDraft',
    );
    expect(availabilityUpdate).toContain('/availability');
    expect(availabilityUpdate).toContain('body: JSON.stringify({ mode })');
  });
});
