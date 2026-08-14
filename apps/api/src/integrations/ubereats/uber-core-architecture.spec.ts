import { readdirSync } from 'node:fs';
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
  it('only contains explicitly designed domain subdirectories', () => {
    const domainRoot = resolve(UBER_EATS_ROOT, 'domain');
    const allowedSubdomains = [
      'menu',
      'merchant',
      'orders',
      'shared',
      'webhook',
    ];
    const actualSubdomains = readdirSync(domainRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(actualSubdomains).toEqual(
      allowedSubdomains.filter((name) => actualSubdomains.includes(name)),
    );
  });

  it('prevents domain shared from depending back on a concrete subdomain', () => {
    const domainRoot = resolve(UBER_EATS_ROOT, 'domain');
    const sharedFiles = scanTypeScript(domainRoot, {
      productionOnly: true,
    }).filter(({ path }) => path.startsWith(resolve(domainRoot, 'shared')));

    expect(
      importViolations(sharedFiles, UBER_EATS_ROOT, (specifier) =>
        /(?:^|\/)(?:menu|merchant|orders|webhook)(?:\/|$)/.test(specifier),
      ),
    ).toEqual([]);
  });

  it('keeps domain independent from contracts', () => {
    const domain = scanTypeScript(resolve(UBER_EATS_ROOT, 'domain'), {
      productionOnly: true,
    });

    expect(
      importViolations(domain, UBER_EATS_ROOT, (specifier) =>
        /(?:^|\/)contracts(?:\/|$)/.test(specifier),
      ),
    ).toEqual([]);
  });

  it('keeps Nest HTTP exceptions out of core and infrastructure production code', () => {
    const roots = [...CORE_ROOTS, resolve(UBER_EATS_ROOT, 'infrastructure')];
    for (const root of roots) {
      for (const { source } of scanTypeScript(root, {
        productionOnly: true,
      })) {
        expect(source).not.toMatch(
          /import\s*{[^}]*\b\w*Exception\b[^}]*}\s*from\s*['"]@nestjs\/common['"]/s,
        );
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
