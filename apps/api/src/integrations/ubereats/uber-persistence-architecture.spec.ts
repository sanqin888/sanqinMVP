import { join } from 'node:path';
import {
  formatSourceViolation,
  importViolations,
  scanTypeScript,
} from './test/architecture-test.utils';

describe('Uber Eats persistence architecture', () => {
  it('keeps Prisma out of application, domain and api production code', () => {
    const root = join(__dirname);
    const files = ['application', 'domain', 'api'].flatMap((layer) =>
      scanTypeScript(join(root, layer), { productionOnly: true }),
    );
    const violations = importViolations(
      files,
      root,
      (specifier) =>
        specifier === '@prisma/client' ||
        /prisma(?:\.service)?/i.test(specifier),
    );

    expect(violations).toEqual([]);
  });

  it('contains Prisma implementation details inside infrastructure/persistence', () => {
    const root = join(__dirname);
    const persistenceRoot = join(root, 'infrastructure', 'persistence');
    const files = scanTypeScript(root, { productionOnly: true }).filter(
      (file) =>
        !file.path.startsWith(`${persistenceRoot}/`) &&
        !file.path.includes(`${join(root, 'test')}/`),
    );

    const forbiddenImports = importViolations(files, root, (specifier) =>
      [
        '@prisma/client',
        'uber-prisma-access.service',
        'uber-prisma.types',
        'prisma.service',
      ].some((token) => specifier.includes(token)),
    );
    const leakedDelegateTypes = files.flatMap((file) =>
      [
        ...file.source.matchAll(
          /\bPrisma\.[A-Z]\w*(?:Delegate|Args|GetPayload)\b/g,
        ),
        ...file.source.matchAll(
          /\b(?:prisma|tx|transaction)\.[a-z]\w*\.(?:findUnique|findFirst|findMany|create|update|updateMany|upsert|count)\s*\(/g,
        ),
      ].map((match) => formatSourceViolation(root, file, match[0])),
    );

    expect([...forbiddenImports, ...leakedDelegateTypes]).toEqual([]);
  });

  it('keeps application ports free of any and generated Prisma types', () => {
    const root = join(__dirname);
    const files = scanTypeScript(join(root, 'application', 'ports'), {
      productionOnly: true,
    });
    const violations = files.flatMap((file) =>
      [
        ...file.source.matchAll(/\bany\b/g),
        ...file.source.matchAll(
          /(?:from\s+['"]@prisma\/client['"]|\bPrisma\.)/g,
        ),
      ].map((match) => formatSourceViolation(root, file, match[0])),
    );

    expect(violations).toEqual([]);
  });
});
