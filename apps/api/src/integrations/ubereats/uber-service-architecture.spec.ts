import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const SOURCE_ROOT = resolve(__dirname, '../..');
const BOUNDED_CONTEXT_ROOT = resolve(__dirname);
const LAYERS = [
  'api',
  'application',
  'contracts',
  'domain',
  'infrastructure',
] as const;
type Layer = (typeof LAYERS)[number];

const walk = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? walk(path)
      : entry.isFile() && path.endsWith('.ts')
        ? [path]
        : [];
  });

const importsOf = (source: string) =>
  [
    ...source.matchAll(
      /(?:import|export)\s+(?:type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/g,
    ),
  ].map(([, specifier]) => specifier);

const layerOf = (path: string): Layer | undefined =>
  LAYERS.find((layer) => path.startsWith(join(BOUNDED_CONTEXT_ROOT, layer)));

const ALLOWED_LAYER_DEPENDENCIES: Record<Layer, readonly Layer[]> = {
  api: ['api', 'application', 'contracts'],
  application: ['application', 'contracts', 'domain', 'infrastructure'],
  contracts: ['contracts', 'domain'],
  domain: ['domain'],
  infrastructure: ['application', 'contracts', 'domain', 'infrastructure'],
};

describe('Uber Eats bounded-context architecture', () => {
  const allBoundedContextFiles = walk(BOUNDED_CONTEXT_ROOT);
  const boundedContextFiles = allBoundedContextFiles.filter(
    (path) => !path.endsWith('.spec.ts'),
  );

  it('keeps every UberEats production file under a named layer', () => {
    const rootExceptions = new Set([
      'ubereats.module.ts',
      'uber-service-test.helpers.ts',
    ]);
    const unlayered = boundedContextFiles
      .filter((path) => dirname(path) === BOUNDED_CONTEXT_ROOT)
      .map((path) => relative(BOUNDED_CONTEXT_ROOT, path))
      .filter((path) => !rootExceptions.has(path));

    expect(unlayered).toEqual([]);
  });

  it('does not allow UberEats-specific source trees outside the bounded context', () => {
    const forbiddenLegacyPaths = [
      'application/menu/uber-menu-notification.handler.ts',
      'domain/menu/uber-menu-graph.service.ts',
      'domain/menu/uber-menu-payload.builder.ts',
      'infrastructure/crypto/uber-credential-vault.service.ts',
      'infrastructure/persistence/uber-menu.repository.ts',
      'infrastructure/uber-api/uber-api.gateway.ts',
      'infrastructure/uber-api/uber-resource.gateways.ts',
    ];

    expect(
      forbiddenLegacyPaths.filter((path) =>
        existsSync(join(SOURCE_ROOT, path)),
      ),
    ).toEqual([]);
  });

  it('limits cross-layer imports to the dependency policy', () => {
    const violations: string[] = [];
    for (const importer of boundedContextFiles) {
      const importerLayer = layerOf(importer);
      if (!importerLayer) continue;
      for (const specifier of importsOf(readFileSync(importer, 'utf8'))) {
        if (!specifier.startsWith('.')) continue;
        const importedPath = resolve(dirname(importer), specifier);
        if (!importedPath.startsWith(`${BOUNDED_CONTEXT_ROOT}${sep}`)) continue;
        const importedLayer = layerOf(importedPath);
        if (
          importedLayer &&
          !ALLOWED_LAYER_DEPENDENCIES[importerLayer].includes(importedLayer)
        ) {
          violations.push(
            `${relative(BOUNDED_CONTEXT_ROOT, importer)} -> ${specifier}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps domain code independent from frameworks and infrastructure', () => {
    for (const path of allBoundedContextFiles.filter(
      (file) => layerOf(file) === 'domain',
    )) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toMatch(/@nestjs\//);
      expect(source).not.toMatch(/@prisma\/client|PrismaService|ConfigService/);
      expect(source).not.toMatch(
        /UberHttpClient|UberOrderGateway|UberApiGateway|\/infrastructure\/|\bfetch\s*\(/,
      );
    }
  });
});
