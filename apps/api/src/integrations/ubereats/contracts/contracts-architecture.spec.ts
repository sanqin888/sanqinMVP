import { resolve } from 'node:path';

import {
  formatSourceViolation,
  importViolations,
  scanTypeScript,
} from '../test/architecture-test.utils';

const CONTRACTS_ROOT = resolve(__dirname);
const productionFiles = scanTypeScript(CONTRACTS_ROOT, {
  productionOnly: true,
});

describe('Uber Eats contracts architecture', () => {
  it('does not contain Nest transport components', () => {
    const forbiddenFile = /\.(?:provider|guard|pipe|controller)\.ts$/i;
    const forbiddenNestSymbol =
      /\b(?:Injectable|Controller|PipeTransform|CanActivate|UseGuards)\b|@(?:Injectable|Controller)\s*\(/;

    const violations = productionFiles.flatMap((file) => {
      const matches: string[] = [];
      if (forbiddenFile.test(file.path)) {
        matches.push(
          formatSourceViolation(CONTRACTS_ROOT, file, 'Nest component file'),
        );
      }
      if (forbiddenNestSymbol.test(file.source)) {
        matches.push(
          formatSourceViolation(CONTRACTS_ROOT, file, 'Nest component symbol'),
        );
      }
      return matches;
    });

    expect(violations).toEqual([]);
  });

  it('does not import Nest or Prisma', () => {
    expect(
      importViolations(
        productionFiles,
        CONTRACTS_ROOT,
        (specifier) =>
          specifier.startsWith('@nestjs/') ||
          specifier === '@prisma/client' ||
          /(?:^|\/)prisma(?:\/|$)/i.test(specifier),
      ),
    ).toEqual([]);
  });
});
