import { resolve } from 'node:path';

import {
  importViolations,
  scanTypeScript,
} from './test/architecture-test.utils';

const UBER_EATS_ROOT = resolve(__dirname);
const CORE_ROOTS = [
  resolve(UBER_EATS_ROOT, 'domain'),
  resolve(UBER_EATS_ROOT, 'application'),
];

describe('Uber Eats framework-independent core architecture', () => {
  it('keeps Nest HTTP exceptions out of core and infrastructure production code', () => {
    const roots = [...CORE_ROOTS, resolve(UBER_EATS_ROOT, 'infrastructure')];
    for (const root of roots) {
      for (const { path, source } of scanTypeScript(root, {
        productionOnly: true,
      })) {
        const nestImports = source.matchAll(
          /import\s*{([^}]*)}\s*from\s*['"]@nestjs\/common['"]/gs,
        );
        for (const match of nestImports) {
          expect({ path, imported: match[1] }).not.toEqual(
            expect.objectContaining({
              imported: expect.stringMatching(/\b\w*Exception\b/),
            }),
          );
        }
      }
    }
  });

  it.each(CORE_ROOTS)(
    '%s does not depend on frameworks or adapters',
    (root) => {
      const violations = importViolations(
        scanTypeScript(root, { productionOnly: true }),
        UBER_EATS_ROOT,
        (specifier) =>
          specifier.startsWith('@nestjs/') ||
          specifier === '@prisma/client' ||
          specifier.includes('/prisma/') ||
          specifier.includes('/infrastructure/'),
      );

      expect(violations).toEqual([]);
    },
  );

  it('keeps Nest dependency-injection decorators outside application code', () => {
    const application = scanTypeScript(resolve(UBER_EATS_ROOT, 'application'), {
      productionOnly: true,
    });

    for (const { source } of application) {
      expect(source).not.toMatch(/@(Injectable|Inject)\b/);
    }
  });
});
