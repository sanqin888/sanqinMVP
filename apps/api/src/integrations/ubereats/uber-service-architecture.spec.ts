import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const DOMAIN_SERVICES = [
  'menu',
  'merchant',
  'order',
  'operations',
  'webhook',
] as const;

const PURE_FUNCTION_MODULES = [
  'uber-integration.utils.ts',
  'uber-menu.payload.ts',
  'uber-order-payload.parser.ts',
] as const;

const INTERNAL_SERVICE_FILES = [
  'uber-menu-draft.service.ts',
  'uber-menu-publish.service.ts',
  'uber-menu-availability.service.ts',
  'uber-order-action.service.ts',
  'uber-order-outbox.service.ts',
  'uber-order-status-sync.service.ts',
  'uber-merchant-oauth.service.ts',
  'uber-merchant-store-mapping.service.ts',
  'uber-merchant-provisioning.service.ts',
] as const;

const LEGACY_WORKFLOWS = {
  menu: ['getUberMenuDraft', 'publishUberMenu', 'syncUberMenuItemAvailability'],
  order: [
    'syncOrderStatusToUber',
    'executeUberOrderAction',
    'processWebhookEvent',
  ],
  merchant: [
    'exchangeAuthorizationCode',
    'upsertStoreMapping',
    'provisionStore',
  ],
} as const;

const readUberSource = (fileName: string) =>
  readFileSync(join(__dirname, fileName), 'utf8');

const lineCount = (source: string) => source.split('\n').length;

describe('Uber Eats domain service architecture', () => {
  it.each(DOMAIN_SERVICES)(
    'keeps %s service declarations in focused shared modules',
    (domain) => {
      const source = readUberSource(`uber-${domain}.service.ts`);
      const serviceHeader = source.slice(0, source.indexOf('@Injectable()'));

      expect(source).not.toContain(
        'eslint-disable @typescript-eslint/no-unused-vars',
      );
      expect(serviceHeader).not.toMatch(
        /(?:^|\n)(?:export\s+)?(?:class|interface|type|const|function)\s+Uber/,
      );
      expect(serviceHeader.split('\n').length).toBeLessThan(100);
    },
  );

  it.each(PURE_FUNCTION_MODULES)(
    'keeps %s independent from Nest, Prisma, and HTTP infrastructure',
    (fileName) => {
      const source = readUberSource(fileName);

      expect(source).not.toMatch(/from\s+['"]@nestjs\/common['"]/);
      expect(source).not.toContain('PrismaService');
      expect(source).not.toContain('UberHttpClient');
    },
  );

  it.each(INTERNAL_SERVICE_FILES)(
    'keeps the focused internal service %s below 600 lines',
    (fileName) => {
      expect(lineCount(readUberSource(fileName))).toBeLessThanOrEqual(600);
    },
  );

  it.each(Object.entries(LEGACY_WORKFLOWS))(
    'does not allow a monolithic %s workflow to return',
    (domain) => {
      const workflowPath = join(__dirname, `uber-${domain}.workflow.ts`);
      if (!existsSync(workflowPath)) return;

      const source = readFileSync(workflowPath, 'utf8');
      const methodCount = source.match(
        /^\s{2}(?:(?:public|protected|private)\s+)?(?:async\s+)?\w+\s*\(/gm,
      )?.length;

      expect(lineCount(source)).toBeLessThanOrEqual(
        domain === 'menu' ? 2701 : 1490,
      );
      expect(methodCount ?? 0).toBeLessThanOrEqual(domain === 'menu' ? 53 : 43);
    },
  );

  it('keeps payload and Prisma compatibility declarations separated by responsibility', () => {
    const orderTypes = readUberSource('uber-order.types.ts');
    const menuTypes = readUberSource('uber-menu.types.ts');
    const prismaTypes = readUberSource('uber-prisma.types.ts');

    expect(orderTypes).toContain('export type UberOrderDetailDto');
    expect(orderTypes).not.toContain('UberMenuUploadPayload');
    expect(menuTypes).toContain('export type UberMenuUploadPayload');
    expect(menuTypes).not.toContain('UberOrderDetailDto');
    expect(prismaTypes).toContain('export type UberOrderActionRepository');
    expect(prismaTypes).not.toContain('UberOrderDetailDto');
  });
});

const API_SOURCE_ROOT = join(__dirname, '../..');
const walkTypescriptFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walkTypescriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });

const relativeSourcePath = (path: string) => relative(API_SOURCE_ROOT, path);
const importsOf = (source: string) =>
  [
    ...source.matchAll(
      /(?:import|export)\s+(?:type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/g,
    ),
  ].map(([, specifier]) => specifier);

const LEGACY_PRISMA_IMPORTERS = new Set([
  'integrations/ubereats/infrastructure/observability/uber-telemetry.service.ts',
  'integrations/ubereats/uber-menu.service.ts',
  'integrations/ubereats/uber-menu.workflow.ts',
  'integrations/ubereats/uber-merchant.gateway.ts',
  'integrations/ubereats/uber-operations.service.ts',
  'integrations/ubereats/uber-order-outbox.service.ts',
  'integrations/ubereats/uber-order-status-sync.service.ts',
  'integrations/ubereats/uber-order.workflow.ts',
  'integrations/ubereats/uber-prisma-access.service.ts',
  'integrations/ubereats/uber-prisma.types.ts',
  'integrations/ubereats/uber-webhook.service.ts',
]);

const LEGACY_HTTP_CLIENT_IMPORTERS = new Set([
  'integrations/ubereats/uber-auth.service.ts',
  'integrations/ubereats/uber-image.validator.ts',
  'integrations/ubereats/uber-menu.service.ts',
  'integrations/ubereats/uber-menu.workflow.ts',
  'integrations/ubereats/uber-merchant.gateway.ts',
  'integrations/ubereats/uber-order-action.service.ts',
  'integrations/ubereats/uber-order.workflow.ts',
  'integrations/ubereats/uber-service-test.helpers.ts',
  'integrations/ubereats/ubereats.module.ts',
]);

const LEGACY_CONTROLLER_DEPENDENCIES: Record<string, string> = {
  'ubereats-menu.controller.ts': './uber-menu.service',
  'ubereats-oauth.controller.ts': './uber-merchant.service',
  'ubereats-operations.controller.ts': './uber-operations.service',
  'ubereats-orders.controller.ts': './uber-order.service',
  'ubereats-webhook.controller.ts': './uber-webhook.service',
};

describe('Uber Eats static architecture boundaries', () => {
  const productionFiles = walkTypescriptFiles(API_SOURCE_ROOT).filter(
    (path) =>
      !path.endsWith('.spec.ts') &&
      (path.includes('/integrations/ubereats/') ||
        path.includes('/application/') ||
        path.includes('/domain/') ||
        path.includes('/infrastructure/persistence/') ||
        path.includes('/infrastructure/uber-api/')),
  );

  it('allows controllers to depend on contracts and application use cases only', () => {
    for (const path of productionFiles.filter((file) =>
      file.endsWith('.controller.ts'),
    )) {
      if (!path.includes('/integrations/ubereats/')) continue;
      const fileName = basename(path);
      const localImports = importsOf(readFileSync(path, 'utf8')).filter(
        (value) => value.startsWith('.'),
      );
      const forbidden = localImports.filter(
        (value) =>
          !value.includes('/contracts/') &&
          !value.includes('use-case') &&
          !value.includes('use-cases') &&
          !value.includes('access.decorator') &&
          !value.includes('../../common/') &&
          !value.includes('../../auth/') &&
          value !== LEGACY_CONTROLLER_DEPENDENCIES[fileName],
      );
      expect(forbidden).toEqual([]);
    }
  });

  it('keeps domain free of Nest, Prisma, environment variables, and HTTP clients', () => {
    for (const path of productionFiles.filter((file) =>
      file.includes('/domain/'),
    )) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toMatch(/@nestjs\//);
      expect(source).not.toMatch(/@prisma\/|PrismaService/);
      expect(source).not.toMatch(/process\.env|ConfigService/);
      expect(source).not.toMatch(/UberHttpClient|\bfetch\s*\(/);
    }
  });

  it('does not let application code call the global fetch function', () => {
    for (const path of productionFiles.filter((file) =>
      file.includes('/application/'),
    )) {
      expect(readFileSync(path, 'utf8')).not.toMatch(/\bfetch\s*\(/);
    }
  });

  it('does not add PrismaService imports outside persistence adapters', () => {
    const importers = productionFiles
      .filter((path) =>
        readFileSync(path, 'utf8').match(
          /from\s+['"][^'"]*prisma\.service['"]/,
        ),
      )
      .map(relativeSourcePath)
      .filter((path) => !path.startsWith('infrastructure/persistence/'));
    expect(new Set(importers)).toEqual(LEGACY_PRISMA_IMPORTERS);
  });

  it('does not add UberHttpClient callers outside the uber-api gateway', () => {
    const importers = productionFiles
      .filter((path) =>
        importsOf(readFileSync(path, 'utf8')).some((value) =>
          value.endsWith('uber-http.client'),
        ),
      )
      .map(relativeSourcePath)
      .filter((path) => path !== 'infrastructure/uber-api/uber-api.gateway.ts');
    expect(new Set(importers)).toEqual(LEGACY_HTTP_CLIENT_IMPORTERS);
  });

  it('forbids Prisma delegate compatibility casts', () => {
    for (const path of productionFiles) {
      expect(readFileSync(path, 'utf8')).not.toMatch(
        /as\s+unknown\s+as\s+(?:Prisma\.)?\w*Delegate\b/,
      );
    }
  });

  it('does not restore or extend the removed UberEatsService facade', () => {
    const facade = join(__dirname, 'ubereats.service.ts');
    expect(existsSync(facade)).toBe(false);
    expect(
      productionFiles.some((path) =>
        /class\s+UberEatsService\b/.test(readFileSync(path, 'utf8')),
      ),
    ).toBe(false);
  });

  it('keeps removed compatibility-only files absent', () => {
    expect(
      existsSync(join(__dirname, 'uber-merchant-internal.service.ts')),
    ).toBe(false);
  });
});
