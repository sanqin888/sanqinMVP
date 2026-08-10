import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const API_ROOT = resolve(__dirname);

const productionFiles = readdirSync(API_ROOT)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
  .map((name) => join(API_ROOT, name));

const importsOf = (source: string): string[] =>
  [
    ...source.matchAll(
      /(?:import|export)\s+(?:type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/g,
    ),
  ].map(([, specifier]) => specifier);

describe('Uber Eats API architecture', () => {
  it('depends only on transport contracts and application boundaries', () => {
    const violations = productionFiles.flatMap((path) =>
      importsOf(readFileSync(path, 'utf8'))
        .filter(
          (specifier) =>
            specifier === '@prisma/client' ||
            specifier.includes('/infrastructure/') ||
            /(?:repository|http\.client|worker\.adapter)/i.test(specifier),
        )
        .map((specifier) => `${relative(API_ROOT, path)} -> ${specifier}`),
    );

    expect(violations).toEqual([]);
  });

  it('keeps controllers free of infrastructure implementation symbols', () => {
    for (const path of productionFiles.filter((file) =>
      file.endsWith('.controller.ts'),
    )) {
      expect(readFileSync(path, 'utf8')).not.toMatch(
        /\b(?:PrismaService|UberHttpClient|RepositoryImpl|WorkerAdapter)\b/,
      );
    }
  });
});
