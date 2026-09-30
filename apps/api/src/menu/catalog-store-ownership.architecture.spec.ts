import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PRISMA_SCHEMA = resolve(__dirname, '../../prisma/schema.prisma');

function prismaModel(schema: string, modelName: string): string {
  const match = schema.match(
    new RegExp(`model ${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  if (!match?.[1]) {
    throw new Error(`Prisma model not found: ${modelName}`);
  }
  return match[1];
}

describe('Catalog store ownership persistence foundation', () => {
  const schema = readFileSync(PRISMA_SCHEMA, 'utf8');

  it('anchors store ownership on category and option-template roots using stable store identity', () => {
    const store = prismaModel(schema, 'Store');
    const category = prismaModel(schema, 'MenuCategory');
    const optionTemplate = prismaModel(schema, 'MenuOptionGroupTemplate');

    expect(store).toMatch(/menuCategories\s+MenuCategory\[\]/);
    expect(store).toMatch(
      /menuOptionGroupTemplates\s+MenuOptionGroupTemplate\[\]/,
    );

    for (const ownerRoot of [category, optionTemplate]) {
      expect(ownerRoot).toContain('@compat catalog.store-menu-ownership.v1');
      expect(ownerRoot).toMatch(/storeStableId\s+String\?/);
      expect(ownerRoot).toMatch(
        /store\s+Store\?\s+@relation\(fields: \[storeStableId\], references: \[storeStableId\], onDelete: Restrict\)/,
      );
      expect(ownerRoot).toMatch(
        /@@index\(\[storeStableId, deletedAt, sortOrder\]\)/,
      );
      expect(ownerRoot).toMatch(/stableId\s+String\s+@unique/);
    }
  });

  it('keeps descendant ownership inherited instead of duplicating store identity', () => {
    const item = prismaModel(schema, 'MenuItem');
    const optionChoice = prismaModel(schema, 'MenuOptionTemplateChoice');
    const packagingType = prismaModel(schema, 'MenuPackagingType');

    expect(item).not.toMatch(/\bstoreStableId\b/);
    expect(optionChoice).not.toMatch(/\bstoreStableId\b/);
    expect(packagingType).not.toMatch(/\bstoreStableId\b/);

    expect(item).toMatch(
      /category\s+MenuCategory\s+@relation\(fields: \[categoryId\], references: \[id\], onDelete: Cascade\)/,
    );
    expect(optionChoice).toMatch(
      /templateGroup\s+MenuOptionGroupTemplate\s+@relation\(fields: \[templateGroupId\], references: \[id\], onDelete: Cascade\)/,
    );
  });
});
