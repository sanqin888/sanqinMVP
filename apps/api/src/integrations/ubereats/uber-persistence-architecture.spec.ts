import { join } from 'node:path';
import {
  formatSourceViolation,
  importViolations,
  portMethodReturnTypeViolations,
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

  it('contains Prisma implementation details inside infrastructure/persistence', () => {
    const root = join(__dirname);
    const persistenceRoot = join(root, 'infrastructure', 'persistence');
    const files = scanTypeScript(root, { productionOnly: true }).filter(
      (file) =>
        !file.path.startsWith(`${persistenceRoot}/`) &&
        !file.path.includes(`${join(root, 'test')}/`),
    );

    const forbiddenImports = importViolations(files, root, (specifier) =>
      [
        '@prisma/client',
        'uber-prisma-access.service',
        'uber-prisma.types',
        'prisma.service',
      ].some((token) => specifier.includes(token)),
    );
    const leakedDelegateTypes = files.flatMap((file) =>
      [
        ...file.source.matchAll(
          /\bPrisma\.[A-Z]\w*(?:Delegate|Args|GetPayload)\b/g,
        ),
        ...file.source.matchAll(
          /\b(?:prisma|tx|transaction)\.[a-z]\w*\.(?:findUnique|findFirst|findMany|create|update|updateMany|upsert|count)\s*\(/g,
        ),
      ].map((match) => formatSourceViolation(root, file, match[0])),
    );

    expect([...forbiddenImports, ...leakedDelegateTypes]).toEqual([]);
  });

  it('keeps application ports free of any and generated Prisma types', () => {
    const root = join(__dirname);
    const files = scanTypeScript(join(root, 'application'), {
      productionOnly: true,
    }).filter(({ path }) => /\.ports?\.ts$/.test(path));
    const violations = files.flatMap((file) =>
      [
        ...file.source.matchAll(/\bany\b/g),
        ...file.source.matchAll(
          /(?:from\s+['"]@prisma\/client['"]|\bPrisma\.)/g,
        ),
      ].map((match) => formatSourceViolation(root, file, match[0])),
    );

    expect(violations).toEqual([]);
  });

  it('keeps every application port return value semantic and wire-type free', () => {
    const root = join(__dirname);
    const files = scanTypeScript(join(root, 'application'), {
      productionOnly: true,
    }).filter(({ path }) => /\.ports?\.ts$/.test(path));
    const violations = portMethodReturnTypeViolations(files, root);

    expect(violations).toEqual([]);
  });

  it('resolves aliases, nested generics and object properties without reading comments', () => {
    const root = join(__dirname, 'test', 'port-return-fixtures');
    const fixture = (name: string, source: string) => ({
      path: join(root, `${name}.port.ts`),
      source,
    });
    const invalid = [
      fixture('direct', 'interface DirectPort { load(): Promise<unknown> }'),
      fixture(
        'alias',
        'type Result = any; interface AliasPort { load(): Result }',
      ),
      fixture(
        'nested',
        'type Box<T> = { value: T }; interface NestedPort { load(): Promise<Box<Array<Record<string, unknown>>>> }',
      ),
      fixture(
        'property',
        'type Result = { safe: string; raw: unknown }; interface PropertyPort { load(): Promise<Result> }',
      ),
    ];

    expect(portMethodReturnTypeViolations(invalid, root)).toHaveLength(4);
    expect(
      portMethodReturnTypeViolations(
        [
          fixture(
            'safe-comments',
            '/** any and unknown describe forbidden wire types. */\ntype Result = { value: string }; interface SafePort { load(): Promise<Result> }',
          ),
          fixture(
            'audit',
            'type Json = null | boolean | number | string | Json[] | { [key: string]: Json }; type UberGatewayAuditJsonValue = Json; interface AuditPort { record(): Promise<UberGatewayAuditJsonValue> }',
          ),
        ],
        root,
      ),
    ).toEqual([]);
  });

  it('does not expose Prisma delegates from persistence services', () => {
    const root = join(__dirname);
    const files = scanTypeScript(join(root, 'infrastructure', 'persistence'), {
      productionOnly: true,
    });
    const violations = files.flatMap((file) =>
      [
        ...file.source.matchAll(/\bPrisma\.[A-Z]\w*Delegate\b/g),
        ...file.source.matchAll(
          /(?:public\s+)?readonly\s+\w+\s*:\s*PrismaService\[['"][a-z]\w*['"]\]/g,
        ),
        ...file.source.matchAll(
          /(?:public\s+)?(?:readonly\s+)?\w+(?:Repository|Delegate)\s*=\s*(?:this\.)?prisma\.[a-z]\w*/g,
        ),
      ].map((match) => formatSourceViolation(root, file, match[0])),
    );

    expect(violations).toEqual([]);
  });

  it('does not restore a generic repository scope across Uber features', () => {
    const root = join(__dirname);
    const files = scanTypeScript(root, { productionOnly: true });
    const retiredAbstractions =
      /\b(?:UberRepositoryScope|UberUnitOfWork|UBER_UNIT_OF_WORK|UberOrderActionPort|UberMenuPublishPort|UberOperationsTicketPort)\b/g;
    const genericScopes =
      /(?:interface|type)\s+Uber(?!(?:Merchant|Menu|Order|Operations)[A-Za-z]*RepositoryScope\b)[A-Za-z]*RepositoryScope\b/g;
    const violations = files.flatMap((file) =>
      [
        ...file.source.matchAll(retiredAbstractions),
        ...file.source.matchAll(genericScopes),
      ].map((match) => formatSourceViolation(root, file, match[0])),
    );

    expect(violations).toEqual([]);
  });
});

describe('Uber Eats menu persistence dependency direction', () => {
  const menuPrismaPersistenceFiles = () => {
    const persistenceRoot = join(__dirname, 'infrastructure', 'persistence');

    return scanTypeScript(persistenceRoot, { productionOnly: true }).filter(
      (file) =>
        /uber-menu-(?:workflow-prisma\.repository|.+-prisma\.(?:adapter|repository))\.ts$/.test(
          file.path,
        ),
    );
  };

  it('does not import application use cases, publication implementations, or Uber API services', () => {
    const root = join(__dirname);
    const files = menuPrismaPersistenceFiles();
    const violations = importViolations(files, root, (specifier) =>
      /application\/menu\/.*use-case|uber-api\/uber-menu-publication|uber-api\/uber-token/.test(
        specifier,
      ),
    );

    expect(violations).toEqual([]);
  });

  it('keeps menu draft persistence independent from merchant credentials and order mapping', () => {
    const root = join(__dirname);
    const files = menuPrismaPersistenceFiles().filter((file) =>
      /uber-menu-(?:config|draft|reference|workflow)-/.test(file.path),
    );
    const violations = importViolations(files, root, (specifier) =>
      /(?:^crypto$|application\/merchant\/uber-merchant-oauth|uber-token\.provider|uber-credential-vault|domain\/orders?(?:\/|$)|domain\/merchant\/(?!uber-store-id(?:$|\.)))/.test(
        specifier,
      ),
    );
    const leakedHelpers = files.flatMap((file) =>
      [
        ...file.source.matchAll(
          /\b(?:resolveMerchantConnection|upsertMerchantConnection|assertUberStoreTimezone|resolveUberProductStableId|buildUberNodeId)\b/g,
        ),
      ].map((match) => formatSourceViolation(root, file, match[0])),
    );

    expect([...violations, ...leakedHelpers]).toEqual([]);
  });

  it('binds each menu draft port to its dedicated Prisma adapter', () => {
    const moduleFile = scanTypeScript(__dirname, {
      productionOnly: true,
    }).find(
      (file) =>
        file.path === join(__dirname, 'infrastructure/nest/menu.wiring.ts'),
    );
    expect(moduleFile).toBeDefined();

    const draftPortBindings = Object.fromEntries(
      [
        ...moduleFile!.source.matchAll(
          /provide:\s*((?:MENU_ITEM_EXISTENCE|OPTION_CHOICE_EXISTENCE|PROVISIONED_UBER_STORE|UBER_BUSINESS_SCHEDULE)_QUERY_PORT|UBER_(?:MENU_(?:CONFIG_QUERY|DRAFT_(?:READ|DIFF))_PORT|(?:ITEM_CHANNEL_CONFIG|OPTION_ITEM_CONFIG|DRAFT_(?:ITEM|GROUP|OPTION)|OPTION_CHILD_GROUP_BINDING)_COMMAND_PORT)),\s*useExisting:\s*(\w+)/g,
        ),
      ].map((match) => [match[1], match[2]]),
    );

    expect(draftPortBindings).toEqual({
      UBER_MENU_CONFIG_QUERY_PORT: 'UberMenuConfigQueryPrismaAdapter',
      UBER_ITEM_CHANNEL_CONFIG_COMMAND_PORT: 'UberMenuConfigWritePrismaAdapter',
      UBER_OPTION_ITEM_CONFIG_COMMAND_PORT: 'UberMenuConfigWritePrismaAdapter',
      UBER_MENU_DRAFT_READ_PORT: 'UberMenuDraftReadPrismaAdapter',
      UBER_DRAFT_ITEM_COMMAND_PORT: 'UberMenuDraftMutationPrismaAdapter',
      UBER_DRAFT_GROUP_COMMAND_PORT: 'UberMenuDraftMutationPrismaAdapter',
      UBER_DRAFT_OPTION_COMMAND_PORT: 'UberMenuDraftMutationPrismaAdapter',
      UBER_OPTION_CHILD_GROUP_BINDING_COMMAND_PORT:
        'UberMenuDraftMutationPrismaAdapter',
      UBER_MENU_DRAFT_DIFF_PORT: 'UberMenuDraftDiffPrismaAdapter',
      MENU_ITEM_EXISTENCE_QUERY_PORT: 'UberMenuSupportingQueriesPrismaAdapter',
      OPTION_CHOICE_EXISTENCE_QUERY_PORT:
        'UberMenuSupportingQueriesPrismaAdapter',
      PROVISIONED_UBER_STORE_QUERY_PORT:
        'UberMenuSupportingQueriesPrismaAdapter',
      UBER_BUSINESS_SCHEDULE_QUERY_PORT:
        'UberMenuSupportingQueriesPrismaAdapter',
    });
  });

  it('does not restore the retired aggregate menu draft persistence gateway', () => {
    const root = join(__dirname);
    const files = scanTypeScript(root, { productionOnly: true });
    const violations = files.flatMap((file) => {
      const fileViolations = file.path.endsWith(
        'uber-menu-workflow-prisma.repository.ts',
      )
        ? [formatSourceViolation(root, file, 'retired workflow repository')]
        : [];
      const typeViolations = [
        ...file.source.matchAll(/\bUberMenuDraftGateway\b/g),
      ].map((match) => formatSourceViolation(root, file, match[0]));

      return [...fileViolations, ...typeViolations];
    });

    expect(violations).toEqual([]);
  });
});
