import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');

describe('Admin category workspace boundary', () => {
  it('uses the narrow Store-scoped category read instead of the combined full-menu endpoint', () => {
    expect(pageSource).toContain("storeScopedPath('/admin/menu/categories')");
    expect(pageSource).not.toContain('/admin/menu/full');
  });

  it('keeps category writes on the existing Store-scoped category endpoints', () => {
    expect(pageSource).toContain('/admin/menu/categories/');
    expect(pageSource).toContain('storeStableId');
    expect(pageSource).toContain("method: 'PUT'");
    expect(pageSource).toContain("method: 'POST'");
  });
});
