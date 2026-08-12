import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import {
  formatSourceViolation,
  importSpecifiers,
  importViolations,
  scanTypeScript,
  writeGatewayViolations,
} from './test/architecture-test.utils';

const SOURCE_ROOT = resolve(__dirname, '../..');
const BOUNDED_CONTEXT_ROOT = resolve(__dirname);
const LAYERS = [
  'api',
  'application',
  'contracts',
  'domain',
  'infrastructure',
  'composition-root',
] as const;
type Layer = (typeof LAYERS)[number];

const layerOf = (path: string): Layer | undefined =>
  path === join(BOUNDED_CONTEXT_ROOT, 'ubereats.module.ts') ||
  path === join(BOUNDED_CONTEXT_ROOT, 'worker.ts')
    ? 'composition-root'
    : path === join(BOUNDED_CONTEXT_ROOT, 'public-api.ts')
      ? 'contracts'
      : LAYERS.find((layer) =>
          path.startsWith(`${join(BOUNDED_CONTEXT_ROOT, layer)}${sep}`),
        );

const ALLOWED_LAYER_DEPENDENCIES: Record<Layer, readonly Layer[]> = {
  api: ['api', 'application', 'contracts'],
  application: ['application', 'contracts', 'domain'],
  contracts: ['contracts', 'domain'],
  domain: ['domain'],
  infrastructure: ['application', 'contracts', 'domain', 'infrastructure'],
  'composition-root': [
    'api',
    'application',
    'contracts',
    'domain',
    'infrastructure',
    'composition-root',
  ],
};

describe('Uber Eats bounded-context architecture', () => {
  const boundedContextFiles = scanTypeScript(BOUNDED_CONTEXT_ROOT, {
    productionOnly: true,
  });
  const allSourceFiles = scanTypeScript(SOURCE_ROOT, { productionOnly: true });

  it('keeps persistence adapters permanently limited to database I/O', () => {
    const persistenceRoot = join(
      BOUNDED_CONTEXT_ROOT,
      'infrastructure/persistence',
    );
    const persistenceFiles = scanTypeScript(persistenceRoot, {
      productionOnly: true,
    });

    const violations: string[] = [];
    const report = (filePath: string, rule: string) => {
      violations.push(`${relative(persistenceRoot, filePath)} -> ${rule}`);
    };

    for (const file of persistenceFiles) {
      for (const specifier of importSpecifiers(file.source)) {
        if (/(?:^|\/)infrastructure\/uber-api\//.test(specifier)) {
          report(file.path, 'uber-api import');
        }
        if (
          /(?:^|\/)application\/.*(?:\.service|\.use-case)(?:'|$)?/.test(
            specifier,
          )
        ) {
          report(file.path, 'application service/use-case import');
        }
      }

      for (const symbol of [
        'UberHttpClient',
        'UberApiGatewayTransport',
        'UberImageValidator',
      ]) {
        if (new RegExp(`\\b${symbol}\\b`).test(file.source)) {
          report(file.path, symbol);
        }
      }
      if (/\bfetch\s*\(/.test(file.source)) report(file.path, 'fetch');
      if (/\bnew\s+UberImageValidator\b/.test(file.source)) {
        report(file.path, 'new UberImageValidator');
      }
      if (/\bnew\s+UberOrderActionService\b/.test(file.source)) {
        report(file.path, 'new UberOrderActionService');
      }
      if (
        /\b(?:httpClient|gateway|menuGateway|orderGateway|actionService)\s*\.\s*(?:request|get|post|put|patch|delete|head)\s*\(/.test(
          file.source,
        )
      ) {
        report(file.path, 'HTTP request call');
      }
      if (
        /\bsetTimeout\s*\(|\b(?:poll|waitFor)(?:Menu)?Publication(?:Confirmation|Status)?\b/i.test(
          file.source,
        )
      ) {
        report(file.path, 'setTimeout/publication confirmation polling');
      }
    }

    expect(violations).toEqual([]);
  });

  it('forbids callers outside UberEats from importing its infrastructure', () => {
    const externalFiles = allSourceFiles.filter(
      ({ path }) => !path.startsWith(`${BOUNDED_CONTEXT_ROOT}${sep}`),
    );

    expect(
      importViolations(externalFiles, SOURCE_ROOT, (specifier) =>
        /integrations\/ubereats\/infrastructure(?:\/|$)/.test(specifier),
      ),
    ).toEqual([]);
  });

  it('requires external callers to use explicit UberEats public entries', () => {
    const externalFiles = allSourceFiles.filter(
      ({ path }) => !path.startsWith(`${BOUNDED_CONTEXT_ROOT}${sep}`),
    );

    expect(
      importViolations(externalFiles, SOURCE_ROOT, (specifier) =>
        /integrations\/ubereats\/(?:application|domain|modules|composition)(?:\/|$)/.test(
          specifier,
        ),
      ),
    ).toEqual([]);
  });

  it('has no transitional modules or composition source trees', () => {
    expect(
      ['modules', 'composition'].filter((path) =>
        existsSync(join(BOUNDED_CONTEXT_ROOT, path)),
      ),
    ).toEqual([]);
  });

  it('has one composition root and no aggregate compatibility facade', () => {
    expect(existsSync(join(BOUNDED_CONTEXT_ROOT, 'ubereats.module.ts'))).toBe(
      true,
    );
    expect(
      [
        'ubereats-capabilities.module.ts',
        'ubereats.facade.ts',
        'ubereats-facade.ts',
      ].filter((path) => existsSync(join(BOUNDED_CONTEXT_ROOT, path))),
    ).toEqual([]);
  });

  it('exposes only bounded-context public entries to external callers', () => {
    const externalFiles = allSourceFiles.filter(
      ({ path }) => !path.startsWith(`${BOUNDED_CONTEXT_ROOT}${sep}`),
    );
    expect(
      importViolations(externalFiles, SOURCE_ROOT, (specifier) => {
        const match = specifier.match(/integrations\/ubereats(?:\/(.*))?$/);
        return Boolean(
          match &&
          match[1] !== 'public-api' &&
          match[1] !== 'ubereats.module' &&
          match[1] !== 'worker',
        );
      }),
    ).toEqual([]);
  });

  it('keeps every UberEats production file under a named layer', () => {
    const unlayered = boundedContextFiles
      .filter(
        ({ path }) => dirname(path) === BOUNDED_CONTEXT_ROOT && !layerOf(path),
      )
      .map(({ path }) => relative(BOUNDED_CONTEXT_ROOT, path));

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
      const importerLayer = layerOf(importer.path);
      if (!importerLayer) continue;
      for (const specifier of importSpecifiers(importer.source)) {
        if (!specifier.startsWith('.')) continue;
        const importedPath = resolve(dirname(importer.path), specifier);
        if (!importedPath.startsWith(`${BOUNDED_CONTEXT_ROOT}${sep}`)) continue;
        const importedLayer = layerOf(importedPath);
        if (
          importedLayer &&
          !ALLOWED_LAYER_DEPENDENCIES[importerLayer].includes(importedLayer)
        ) {
          violations.push(
            `${relative(BOUNDED_CONTEXT_ROOT, importer.path)} -> ${specifier}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps domain code independent from frameworks and infrastructure', () => {
    for (const path of boundedContextFiles.filter(
      ({ path }) => layerOf(path) === 'domain',
    )) {
      const source = path.source;
      expect(source).not.toMatch(/@nestjs\//);
      expect(source).not.toMatch(/@prisma\/client|PrismaService|ConfigService/);
      expect(source).not.toMatch(
        /UberHttpClient|UberOrderGateway|UberApiGateway|\/infrastructure\/|\bfetch\s*\(/,
      );
    }
  });

  it('removes the legacy all-purpose Uber workflows', () => {
    expect(
      [
        'application/merchant/uber-merchant.service.ts',
        'application/menu/uber-menu.service.ts',
        'application/menu/uber-menu.workflow.ts',
        'application/orders/uber-order.service.ts',
        'application/orders/uber-order.workflow.ts',
        'application/orders/uber-webhook.service.ts',
        'application/operations/uber-operations.service.ts',
        'domain/menu/uber-menu.payload.ts',
      ].filter((path) => existsSync(join(BOUNDED_CONTEXT_ROOT, path))),
    ).toEqual([]);
  });

  it('keeps focused use cases behind application-owned ports', () => {
    for (const path of [
      'application/menu/uber-menu-draft.use-case.ts',
      'application/menu/publish-uber-menu.use-case.ts',
      'application/menu/uber-menu-availability.use-case.ts',
      'application/orders/uber-order.use-cases.ts',
      'application/operations/uber-operations.use-cases.ts',
    ]) {
      const source =
        scanTypeScript(BOUNDED_CONTEXT_ROOT, { productionOnly: true }).find(
          (file) => file.path === join(BOUNDED_CONTEXT_ROOT, path),
        )?.source ?? '';
      expect(source).not.toMatch(/PrismaService|UberHttpClient/);
      expect(source).toMatch(/(?:port|repository|gateway)/i);
    }
  });

  it('forbids application imports of infrastructure and the removed merchant gateway', () => {
    for (const path of boundedContextFiles.filter(
      ({ path }) => layerOf(path) === 'application',
    )) {
      const source = path.source;
      expect(source).not.toMatch(/(?:\.\.\/)+infrastructure\//);
      expect(source).not.toMatch(/\bUberMerchantGateway\b/);
    }
    expect(
      existsSync(
        join(
          BOUNDED_CONTEXT_ROOT,
          'infrastructure/uber-api/uber-merchant.gateway.ts',
        ),
      ),
    ).toBe(false);
  });

  it('keeps application free of HTTP exceptions, Prisma and infrastructure', () => {
    const applicationFiles = boundedContextFiles.filter(
      ({ path }) => layerOf(path) === 'application',
    );
    const violations = importViolations(
      applicationFiles,
      BOUNDED_CONTEXT_ROOT,
      (specifier) =>
        specifier === '@prisma/client' ||
        /prisma(?:\.service)?/i.test(specifier) ||
        specifier.includes('/infrastructure/'),
    );
    for (const file of applicationFiles) {
      if (
        /\b(?:BadRequest|Unauthorized|Forbidden|NotFound|Conflict|Gone|PayloadTooLarge|UnsupportedMediaType|UnprocessableEntity|InternalServerError|NotImplemented|BadGateway|ServiceUnavailable|GatewayTimeout)Exception\b/.test(
          file.source,
        )
      ) {
        violations.push(
          formatSourceViolation(
            BOUNDED_CONTEXT_ROOT,
            file,
            '@nestjs/common HTTP exception',
          ),
        );
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps public and business layers independent from Prisma', () => {
    const prismaFreeLayers: Layer[] = [
      'api',
      'contracts',
      'application',
      'domain',
    ];
    const files = boundedContextFiles.filter(({ path }) => {
      const layer = layerOf(path);
      return layer !== undefined && prismaFreeLayers.includes(layer);
    });
    expect(
      importViolations(
        files,
        BOUNDED_CONTEXT_ROOT,
        (specifier) => specifier === '@prisma/client',
      ),
    ).toEqual([]);
  });

  it('keeps the Uber API adapter independent from persistence and Prisma', () => {
    const files = scanTypeScript(
      join(BOUNDED_CONTEXT_ROOT, 'infrastructure/uber-api'),
      { productionOnly: true },
    );
    expect(
      importViolations(
        files,
        BOUNDED_CONTEXT_ROOT,
        (specifier) =>
          specifier === '@prisma/client' ||
          /prisma(?:\.service)?/i.test(specifier) ||
          specifier.includes('/persistence/'),
      ),
    ).toEqual([]);
  });

  it('requires every write gateway call to carry an idempotency key', () => {
    expect(
      writeGatewayViolations(boundedContextFiles, BOUNDED_CONTEXT_ROOT),
    ).toEqual([]);
  });

  it('keeps periodic timers inside infrastructure/workers', () => {
    const violations = boundedContextFiles
      .filter(
        ({ path, source }) =>
          !path.startsWith(
            `${join(BOUNDED_CONTEXT_ROOT, 'infrastructure/workers')}${sep}`,
          ) &&
          /\bsetInterval\s*\(|@(?:Cron|Interval|Timeout)\s*\(|\bscheduleJob\s*\(/.test(
            source,
          ),
      )
      .map((file) =>
        formatSourceViolation(BOUNDED_CONTEXT_ROOT, file, 'periodic timer'),
      );
    expect(violations).toEqual([]);
  });

  it('keeps scheduler naming and files out of application', () => {
    const applicationFiles = boundedContextFiles.filter(
      ({ path }) => layerOf(path) === 'application',
    );
    expect(
      applicationFiles
        .filter(({ path }) => path.endsWith('.worker.ts'))
        .map(({ path }) => relative(BOUNDED_CONTEXT_ROOT, path)),
    ).toEqual([]);
  });

  it('lets the webhook controller depend only on the receiving use case', () => {
    const controller = boundedContextFiles.find(
      ({ path }) =>
        path === join(BOUNDED_CONTEXT_ROOT, 'api/webhook.controller.ts'),
    );
    const applicationImports = importSpecifiers(
      controller?.source ?? '',
    ).filter((specifier) =>
      /application\/.*(?:use-case|handler|service)/.test(specifier),
    );
    expect(applicationImports).toEqual([
      '../application/orders/uber-webhook-receiver.use-case',
    ]);
    expect(controller?.source).toMatch(/ReceiveUberWebhookUseCase/);
  });

  it('reports both importer and import specifier for dependency violations', () => {
    const fixture = {
      path: join(BOUNDED_CONTEXT_ROOT, 'application/fixture.ts'),
      source: "import '@prisma/client';",
    };
    expect(
      importViolations([fixture], BOUNDED_CONTEXT_ROOT, () => true),
    ).toEqual(['application/fixture.ts -> @prisma/client']);
    expect(
      writeGatewayViolations(
        [
          {
            path: fixture.path,
            source: "gateway.request({\n  method: 'POST',\n});",
          },
        ],
        BOUNDED_CONTEXT_ROOT,
      ),
    ).toEqual([
      'application/fixture.ts -> POST gateway call without idempotencyKey',
    ]);
  });
});
