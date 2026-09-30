import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const panelSource = readFileSync(
  resolve(__dirname, 'OptionTemplatesPanel.tsx'),
  'utf8',
);

describe('Admin option workspace read boundary', () => {
  it('builds target-item choices from narrow Store-scoped category and item reads', () => {
    expect(panelSource).toContain(
      "storeScopedPath('/admin/menu/option-group-templates')",
    );
    expect(panelSource).toContain("storeScopedPath('/admin/menu/categories')");
    expect(panelSource).toContain("storeScopedPath('/admin/menu/items')");
    expect(panelSource).not.toContain('/admin/menu/full');
    expect(panelSource).not.toContain('AdminMenuFullResponse');
  });
});
