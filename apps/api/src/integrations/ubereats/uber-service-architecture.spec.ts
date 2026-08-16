import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import {
  constructorDependencyTypes,
  formatSourceViolation,
  interfaceMethods,
  importSpecifiers,
  importViolations,
  scanTypeScript,
  writeGatewayViolations,
} from './test/architecture-test.utils';

const SOURCE_ROOT = resolve(__dirname, '../..');
const BOUNDED_CONTEXT_ROOT = resolve(__dirname);
const PUBLIC_ENTRY_FILES = [
  'public-api.ts',
  'ubereats.module.ts',
  'worker.ts',
] as const;
const ALLOWED_TOP_LEVEL_DIRECTORIES = [
  'api',
  'application',
  'contracts',
  'domain',
  'infrastructure',
  'test',
] as const;
const INTERNAL_LAYERS = [
  'api',
  'application',
  'contracts',
  'domain',
  'infrastructure',
  'providers',
] as const;
const WHITE_BOX_TEST_FILES = new Set([
  'api/operations.controller.spec.ts',
  'api/ubereats-exception.filter.spec.ts',
  'application/orders/uber-order.use-cases.spec.ts',
  'application/orders/uber-webhook.service.spec.ts',
  'application/shared/uber-domain-error.mapper.spec.ts',
  'contracts/responses/ubereats.responses.spec.ts',
  'domain/menu/uber-menu-diff.service.spec.ts',
  'infrastructure/crypto/uber-webhook-signature-verifier.spec.ts',
  'infrastructure/uber-api/uber-gateways.wire.contract.spec.ts',
  'test/contract-matrix.spec.ts',
  'test/contract-matrix.ts',
  'test/uber-api-test.helpers.ts',
  'test/uber-contract-fixtures.spec.ts',
  'test/uber-service-test.helpers.ts',
  'uber-credential-schema.spec.ts',
  'uber-rate-limiter-composition.spec.ts',
  'ubereats.module.spec.ts',
]);
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
  path === join(BOUNDED_CONTEXT_ROOT, 'worker.ts') ||
  path.startsWith(`${join(BOUNDED_CONTEXT_ROOT, 'infrastructure/nest')}${sep}`)
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
  domain: ['contracts', 'domain'],
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

  it('allows only the designed top-level directories and public entry files', () => {
    const entries = readdirSync(BOUNDED_CONTEXT_ROOT, {
      withFileTypes: true,
    });
    const unexpected = entries
      .filter((entry: { isDirectory(): boolean; name: string }) =>
        entry.isDirectory()
          ? !ALLOWED_TOP_LEVEL_DIRECTORIES.includes(
              entry.name as (typeof ALLOWED_TOP_LEVEL_DIRECTORIES)[number],
            )
          : entry.name.endsWith('.ts') &&
            !entry.name.endsWith('.spec.ts') &&
            !PUBLIC_ENTRY_FILES.includes(
              entry.name as (typeof PUBLIC_ENTRY_FILES)[number],
            ),
      )
      .map((entry: { name: string }) => entry.name)
      .sort();

    expect(unexpected).toEqual([]);
  });

  it('reserves cross-layer production imports for ubereats.module.ts', () => {
    const violations = boundedContextFiles.flatMap((file) => {
      const importedLayers = new Set(
        importSpecifiers(file.source).flatMap((specifier) =>
          INTERNAL_LAYERS.filter((layer) =>
            new RegExp(`(?:^|/)${layer}(?:/|$)`).test(specifier),
          ),
        ),
      );
      const spansCompositionLayers = [
        'api',
        'application',
        'infrastructure',
      ].every((layer) =>
        importedLayers.has(layer as (typeof INTERNAL_LAYERS)[number]),
      );
      const isCompositionDeclaration = file.path.startsWith(
        `${join(BOUNDED_CONTEXT_ROOT, 'infrastructure/nest')}${sep}`,
      );
      return spansCompositionLayers &&
        file.path !== join(BOUNDED_CONTEXT_ROOT, 'ubereats.module.ts') &&
        !isCompositionDeclaration
        ? [relative(BOUNDED_CONTEXT_ROOT, file.path)]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it('allows only ubereats.module.ts to declare a Nest module', () => {
    const declarations = boundedContextFiles.flatMap((file) =>
      [
        ...file.source.matchAll(/@Module\s*\([\s\S]*?\)\s*export class (\w+)/g),
      ].map(
        (match) => `${relative(BOUNDED_CONTEXT_ROOT, file.path)}#${match[1]}`,
      ),
    );

    expect(declarations).toEqual(['ubereats.module.ts#UberEatsModule']);
  });

  it('keeps Nest wiring as root-only, independent declarations', () => {
    const wiringRoot = join(BOUNDED_CONTEXT_ROOT, 'infrastructure/nest');
    const wiringFiles = scanTypeScript(wiringRoot, { productionOnly: true });
    const wiringPaths = new Set(wiringFiles.map((file) => file.path));
    const violations: string[] = [];

    for (const file of boundedContextFiles) {
      for (const specifier of importSpecifiers(file.source)) {
        if (!specifier.includes('infrastructure/nest/')) continue;
        if (file.path !== join(BOUNDED_CONTEXT_ROOT, 'ubereats.module.ts')) {
          violations.push(
            `${relative(BOUNDED_CONTEXT_ROOT, file.path)} -> ${specifier}`,
          );
        }
      }
    }

    for (const file of wiringFiles) {
      if (/@Module\s*\(|\bOnModule(?:Init|Destroy)\b/.test(file.source)) {
        violations.push(
          `${relative(BOUNDED_CONTEXT_ROOT, file.path)} -> runtime Nest behavior`,
        );
      }
      for (const specifier of importSpecifiers(file.source)) {
        const target = resolve(
          dirname(file.path),
          specifier.endsWith('.ts') ? specifier : `${specifier}.ts`,
        );
        if (wiringPaths.has(target)) {
          violations.push(
            `${relative(BOUNDED_CONTEXT_ROOT, file.path)} -> wiring dependency ${specifier}`,
          );
        }
      }
      const exports = [
        ...file.source.matchAll(/export\s+(?:const|class|function)\s+(\w+)/g),
      ].map((match) => match[1]);
      if (exports.length !== 1 || !/^create\w+Wiring$/.test(exports[0])) {
        violations.push(
          `${relative(BOUNDED_CONTEXT_ROOT, file.path)} -> exports ${exports.join(', ')}`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

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

  it('requires external callers to use explicit UberEats public entries', () => {
    const externalFiles = allSourceFiles.filter(
      ({ path }) => !path.startsWith(`${BOUNDED_CONTEXT_ROOT}${sep}`),
    );

    expect(
      importViolations(externalFiles, SOURCE_ROOT, (specifier) =>
        /integrations\/ubereats\/(?:api|application|domain|contracts|infrastructure|providers)(?:\/|$)/.test(
          specifier,
        ),
      ),
    ).toEqual([]);
  });

  it('applies a separate public-entry policy to tests', () => {
    const allTypeScriptFiles = scanTypeScript(SOURCE_ROOT);
    const testFiles = allTypeScriptFiles.filter(
      ({ path }) =>
        path.endsWith('.spec.ts') ||
        path.includes(`${BOUNDED_CONTEXT_ROOT}${sep}test${sep}`),
    );
    const violations: string[] = [];

    for (const file of testFiles) {
      const isInsideContext = file.path.startsWith(
        `${BOUNDED_CONTEXT_ROOT}${sep}`,
      );
      const relativePath = relative(
        isInsideContext ? BOUNDED_CONTEXT_ROOT : SOURCE_ROOT,
        file.path,
      );
      for (const specifier of importSpecifiers(file.source)) {
        const externalNonPublicImport = (() => {
          const match = specifier.match(/integrations\/ubereats(?:\/(.*))?$/);
          return Boolean(
            match &&
            match[1] !== 'public-api' &&
            match[1] !== 'ubereats.module' &&
            match[1] !== 'worker',
          );
        })();
        if (!isInsideContext && externalNonPublicImport) {
          violations.push(`${relativePath} -> ${specifier}`);
          continue;
        }
        if (!isInsideContext || WHITE_BOX_TEST_FILES.has(relativePath))
          continue;

        const importedLayer = INTERNAL_LAYERS.some((layer) =>
          new RegExp(`(?:^|/)${layer}(?:/|$)`).test(specifier),
        );
        if (!importedLayer || !specifier.startsWith('.')) continue;
        const importedPath = resolve(dirname(file.path), specifier);
        if (dirname(importedPath) !== dirname(file.path)) {
          violations.push(`${relativePath} -> ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('has no transitional module, provider, composition, or facade trees', () => {
    expect(
      ['providers', 'modules', 'composition', 'facade'].filter((path) =>
        existsSync(join(BOUNDED_CONTEXT_ROOT, path)),
      ),
    ).toEqual([]);
  });

  it.each(['crypto', 'uber-api', 'workers'] as const)(
    'keeps infrastructure/%s independent from persistence technology',
    (capability) => {
      const files = scanTypeScript(
        join(BOUNDED_CONTEXT_ROOT, `infrastructure/${capability}`),
        { productionOnly: true },
      );
      const violations: string[] = [];

      for (const file of files) {
        if (/@prisma\/client|\bPrismaService\b/.test(file.source)) {
          violations.push(
            formatSourceViolation(
              BOUNDED_CONTEXT_ROOT,
              file,
              'Prisma dependency',
            ),
          );
        }
        for (const specifier of importSpecifiers(file.source)) {
          if (/(?:^|\/)persistence\//.test(specifier)) {
            violations.push(
              formatSourceViolation(BOUNDED_CONTEXT_ROOT, file, specifier),
            );
          }
        }
      }

      expect(violations).toEqual([]);
    },
  );

  it('keeps worker adapters on use cases and worker runtime config only', () => {
    const file = boundedContextFiles.find(({ path }) =>
      path.endsWith('infrastructure/workers/uber-worker.adapters.ts'),
    );
    expect(file).toBeDefined();
    expect(
      importSpecifiers(file!.source).filter((path) => path.startsWith('.')),
    ).toEqual([
      '../../application/orders/claim-and-execute-uber-order-actions.use-case',
      '../../application/orders/claim-and-process-uber-webhook-inbox.use-case',
      '../../application/menu/confirm-uber-menu-publications.use-case',
      './uber-worker-config.service',
    ]);
  });

  it('keeps capability ports vertical and forbids aggregate port facades', () => {
    expect(existsSync(join(BOUNDED_CONTEXT_ROOT, 'application', 'ports'))).toBe(
      false,
    );

    const aggregatePortFiles = boundedContextFiles
      .filter(({ path }) => path.includes(`${sep}application${sep}`))
      .map(({ path }) => relative(BOUNDED_CONTEXT_ROOT, path))
      .filter((path) =>
        /(?:^|\/)ports\.ts$|aggregate.*\.ports?\.ts$/.test(path),
      );

    expect(aggregatePortFiles).toEqual([]);
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
      'application/menu/upsert-uber-item-channel-config.use-case.ts',
      'application/menu/upsert-uber-option-item-config.use-case.ts',
      'application/menu/read-uber-menu-draft.use-case.ts',
      'application/menu/update-uber-draft-item.use-case.ts',
      'application/menu/update-uber-draft-group.use-case.ts',
      'application/menu/update-uber-draft-option.use-case.ts',
      'application/menu/query-uber-menu-draft-diff.use-case.ts',
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

  it('keeps every menu write use case on one narrow command boundary', () => {
    const menuApplicationRoot = join(BOUNDED_CONTEXT_ROOT, 'application/menu');
    const menuFiles = scanTypeScript(menuApplicationRoot, {
      productionOnly: true,
    });
    const draftPortsFile = menuFiles.find((file) =>
      file.path.endsWith('uber-menu-draft.ports.ts'),
    );
    expect(draftPortsFile).toBeDefined();
    const draftCommandPorts = new Set(
      interfaceMethods(draftPortsFile!).flatMap(({ interfaceName }) =>
        interfaceName.endsWith('CommandPort') ? [interfaceName] : [],
      ),
    );
    const retiredAggregatePorts = new Set([
      ['UberMenuDraft', 'MutationPort'].join(''),
      ['UberMenuConfig', 'WritePort'].join(''),
    ]);
    const focusedDraftUseCases = menuFiles.filter(
      (file) =>
        file.path.endsWith('.use-case.ts') &&
        constructorDependencyTypes(file).some(({ parameterTypes }) =>
          parameterTypes
            .flat()
            .some(
              (name) =>
                draftCommandPorts.has(name) || retiredAggregatePorts.has(name),
            ),
        ),
    );
    const violations = focusedDraftUseCases.flatMap((file) => {
      return constructorDependencyTypes(file).flatMap(
        ({ className, parameterTypes }) => {
          const allTypes = parameterTypes.flat();
          const commandParameters = parameterTypes.filter((types) =>
            types.some((name) =>
              /(?:CommandPort|WriteTransactionPort|Repository)/.test(name),
            ),
          );
          const supportingParameters = parameterTypes.filter(
            (types) =>
              types.some((name) =>
                /(?:Query|Validation)\w*(?:Port|Service)$/.test(name),
              ) &&
              !types.some((name) =>
                /(?:CommandPort|WriteTransactionPort|Repository)/.test(name),
              ),
          );
          const reasons = [
            ...(commandParameters.length > 1
              ? [`${commandParameters.length} command/repository dependencies`]
              : []),
            ...(supportingParameters.length > 2
              ? [`${supportingParameters.length} validation/query services`]
              : []),
            ...allTypes
              .filter((name) => retiredAggregatePorts.has(name))
              .map((name) => `retired aggregate ${name}`),
          ];
          return reasons.map(
            (reason) =>
              `${relative(BOUNDED_CONTEXT_ROOT, file.path)}#${className} -> ${reason}`,
          );
        },
      );
    });

    expect(focusedDraftUseCases.length).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  it('allows exactly one command method on each menu draft command port', () => {
    const draftPortFiles = boundedContextFiles.filter(({ path }) =>
      path.endsWith('application/menu/uber-menu-draft.ports.ts'),
    );
    expect(draftPortFiles).toHaveLength(1);
    const violations = draftPortFiles.flatMap((file) =>
      interfaceMethods(file).flatMap(({ interfaceName, methods }) =>
        interfaceName.endsWith('CommandPort') && methods.length !== 1
          ? [
              `${relative(BOUNDED_CONTEXT_ROOT, file.path)}#${interfaceName} declares ${methods.length} command methods: ${methods.join(', ')}`,
            ]
          : [],
      ),
    );

    expect(violations).toEqual([]);
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

  it('allows only one order-action gateway boundary and no legacy outbox channel', () => {
    const applicationSources = boundedContextFiles.filter(
      ({ path }) => layerOf(path) === 'application',
    );
    const declarations = applicationSources.flatMap(({ path, source }) =>
      Array.from(
        source.matchAll(
          /(?:interface|const)\s+(UberOrderActionGatewayPort|UBER_ORDER_ACTION_GATEWAY)\b/g,
        ),
        (match) => `${relative(BOUNDED_CONTEXT_ROOT, path)}:${match[1]}`,
      ),
    );
    expect(declarations).toEqual([
      'application/orders/uber-order.ports.ts:UberOrderActionGatewayPort',
      'application/orders/uber-order.ports.ts:UBER_ORDER_ACTION_GATEWAY',
    ]);
    expect(
      applicationSources.filter(({ source }) =>
        /UberOrderOutbox|UBER_ORDER_OUTBOX|ACTION_COMMAND_GATEWAY/.test(source),
      ),
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
