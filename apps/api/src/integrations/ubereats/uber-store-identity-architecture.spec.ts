import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatSourceViolation,
  scanTypeScript,
} from './test/architecture-test.utils';

describe('Uber Eats store identity architecture', () => {
  it('keeps Operations free of implicit default store normalization', () => {
    const root = join(__dirname, 'application', 'operations');
    const forbidden = /\bnormalizeUberStoreId\b|['"]default['"]/g;
    const violations = scanTypeScript(root, { productionOnly: true }).flatMap(
      (file) =>
        [...file.source.matchAll(forbidden)].map((match) =>
          formatSourceViolation(__dirname, file, match[0]),
        ),
    );

    expect(violations).toEqual([]);
  });

  it('keeps Uber persistence store identity explicit in Prisma schema', () => {
    const schema = readFileSync(
      join(__dirname, '../../../prisma/schema.prisma'),
      'utf8',
    );
    const violations = [
      ...schema.matchAll(/model\s+(Uber\w+)\s*\{([\s\S]*?)\n\}/g),
    ]
      .filter((match) =>
        /\bstoreId\s+String\b[^\n]*@default\(\s*"default"\s*\)/.test(
          match[2],
        ),
      )
      .map((match) => match[1]);

    expect(violations).toEqual([]);
  });

  it('keeps Uber persistence code free of literal default-store writes', () => {
    const root = join(__dirname, 'infrastructure', 'persistence');
    const forbidden =
      /\bstoreId\s*:\s*['"]default['"]|\b(?:storeId|storeStableId)\s*(?:\?\?|\|\|)\s*['"]default['"]/g;
    const violations = scanTypeScript(root, { productionOnly: true }).flatMap(
      (file) =>
        [...file.source.matchAll(forbidden)].map((match) =>
          formatSourceViolation(__dirname, file, match[0]),
        ),
    );

    expect(violations).toEqual([]);
  });

  it('requires SanQ storeStableId on Operations transport contracts', () => {
    const apiFiles = scanTypeScript(join(__dirname, 'api'), {
      productionOnly: true,
    });
    const controller = apiFiles.find((file) =>
      file.path.endsWith('operations.controller.ts'),
    );
    const requests = scanTypeScript(join(__dirname, 'contracts', 'requests'), {
      productionOnly: true,
    }).find((file) => file.path.endsWith('operations.requests.ts'));

    expect(controller).toBeDefined();
    expect(requests).toBeDefined();
    expect(controller!.source).toContain('query.storeStableId');
    expect(controller!.source).not.toContain('query.storeId');
    expect(requests!.source).toContain('storeStableId!: string');
    expect(requests!.source).not.toContain('class StoreIdQuery');
    expect(requests!.source).not.toMatch(/\bstoreId\b/);
  });

  it('persists new store-status tickets under SanQ storeStableId', () => {
    const persistence = scanTypeScript(
      join(__dirname, 'infrastructure', 'persistence'),
      { productionOnly: true },
    ).find((file) =>
      file.path.endsWith('uber-merchant-persistence.adapter.ts'),
    );

    expect(persistence).toBeDefined();
    expect(persistence!.source).toContain('storeId: input.storeStableId');
    expect(persistence!.source).not.toContain('storeId: uberStoreId');
  });
});
