import { join } from 'node:path';
import {
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
});
