import { resolve } from 'node:path';
import {
  importViolations,
  scanTypeScript,
} from '../test/architecture-test.utils';

const API_ROOT = resolve(__dirname);

const productionFiles = scanTypeScript(API_ROOT, { productionOnly: true });

describe('Uber Eats API architecture', () => {
  it('depends only on transport contracts and application boundaries', () => {
    const violations = importViolations(
      productionFiles,
      API_ROOT,
      (specifier) =>
        specifier === '@prisma/client' ||
        specifier.includes('/infrastructure/') ||
        /(?:repository|http\.client|worker\.adapter)/i.test(specifier),
    );

    expect(violations).toEqual([]);
  });

  it('keeps controllers free of infrastructure implementation symbols', () => {
    for (const file of productionFiles.filter(({ path }) =>
      path.endsWith('.controller.ts'),
    )) {
      expect(file.source).not.toMatch(
        /\b(?:PrismaService|UberHttpClient|RepositoryImpl|WorkerAdapter)\b/,
      );
    }
  });

  it('requires controllers to pass application results through presenters', () => {
    for (const file of productionFiles.filter(({ path }) =>
      path.endsWith('.controller.ts'),
    )) {
      const source = file.source;
      expect(source).not.toMatch(/return\s+(?:await\s+)?this\.[\w.]+\s*\(/);
      expect(source).not.toMatch(/\.json\s*\(\s*\{/);
    }
  });

  it('keeps public DTOs independent from application and Prisma types', () => {
    const responseRoot = resolve(API_ROOT, '../contracts/responses');
    for (const { source } of scanTypeScript(responseRoot, {
      productionOnly: true,
    }).filter(({ path }) => path.endsWith('.responses.ts'))) {
      expect(source).not.toMatch(
        /@prisma\/client|(?:from|import\s*\()\s*['"][^'"]*\/application\//,
      );
    }
  });

  it('keeps presenters independent from aggregate use-case modules', () => {
    for (const { source } of productionFiles.filter(({ path }) =>
      path.endsWith('.presenter.ts'),
    )) {
      expect(source).not.toMatch(
        /from\s+['"][^'"]*\/application\/operations\/uber-operations\.use-cases['"]|from\s+['"]\.\.\/application\/operations\/uber-operations\.use-cases['"]/,
      );
    }
  });
});
