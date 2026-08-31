#!/usr/bin/env node
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_ROOT = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(TOOL_ROOT, '../..');
const CONFIG_PATH = join(TOOL_ROOT, 'context-baseline.json');
const REGISTRY_PATH = join(
  REPOSITORY_ROOT,
  'docs/architecture/active-compatibility-register.json',
);
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));

const toPosix = (value) => value.replaceAll('\\\\', '/');
const repositoryPath = (absolutePath) =>
  toPosix(relative(REPOSITORY_ROOT, absolutePath));

const productionSource = (path) => {
  const normalized = toPosix(path);
  return (
    /\.[cm]?[jt]sx?$/.test(normalized) &&
    !/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(normalized) &&
    !normalized.includes('/test/') &&
    !normalized.includes('/__tests__/') &&
    !normalized.endsWith('.d.ts')
  );
};

const walk = (root) => {
  if (!existsSync(root)) return [];
  if (statSync(root).isFile()) return productionSource(root) ? [root] : [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (
      entry.name === 'node_modules' ||
      entry.name === '.next' ||
      entry.name === 'dist' ||
      entry.name === 'generated'
    ) {
      return [];
    }
    return walk(join(root, entry.name));
  });
};

const contextPaths = config.contexts
  .flatMap((context) =>
    context.paths.map((path) => ({
      context: context.id,
      path: toPosix(path),
    })),
  )
  .sort((left, right) => right.path.length - left.path.length);

const contextOf = (path) => {
  const normalized = toPosix(path);
  const match = contextPaths.find(
    (candidate) =>
      normalized === candidate.path ||
      normalized.startsWith(candidate.path + '/'),
  );
  if (match) return match.context;
  if (normalized.startsWith('apps/api/src/')) {
    const apiRelativePath = normalized.slice('apps/api/src/'.length);
    if (!apiRelativePath.includes('/')) return 'runtime-data-ci-ops';
  }
  return null;
};

const importSpecifiers = (source) => {
  const specifiers = [];
  for (const line of source.split(/\r?\n/)) {
    const from = line.match(/\bfrom\s+['"]([^'"]+)['"]/);
    const sideEffect = line.match(/^\s*import\s+['"]([^'"]+)['"]/);
    const dynamic = line.match(/\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    for (const match of [from, sideEffect, dynamic]) {
      if (match) specifiers.push(match[1]);
    }
  }
  return specifiers;
};

const isPublicSurface = (targetPath) =>
  /(?:^|\/)(?:public-api|contracts?|ports?)(?:\/|\.|$)/.test(targetPath);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const declaresSymbol = (source, symbol) =>
  new RegExp(
    `\\b(?:export\\s+)?(?:declare\\s+)?(?:async\\s+)?(?:function|class|const|let|var|type|interface|enum)\\s+${escapeRegExp(symbol)}\\b`,
  ).test(source);
const reexportsSymbol = (source, symbol) =>
  new RegExp(
    `\\bexport\\s*\\{[^}]*\\b${escapeRegExp(symbol)}\\b[^}]*\\}`,
    's',
  ).test(source);

const resolveTarget = (sourcePath, specifier) =>
  toPosix(
    relative(
      REPOSITORY_ROOT,
      resolve(dirname(sourcePath), specifier),
    ),
  );

const sharedLibraryRoots = [
  ...new Set(
    contextPaths
      .map(({ path }) => path)
      .filter((path) => path.startsWith('libs/')),
  ),
];
const roots = [
  join(REPOSITORY_ROOT, 'apps/api/src'),
  join(REPOSITORY_ROOT, 'apps/web/src'),
  ...sharedLibraryRoots.map((path) => join(REPOSITORY_ROOT, path)),
];
const sourceFiles = roots.flatMap(walk);
const compositionRoots = new Set(config.baseline.compositionRootsExcluded);
const directCounts = new Map();
const publicCounts = new Map();
const browserDirectFetchCounts = new Map();
const serverDirectFetchCounts = new Map();
const unknownSourceRoots = new Set();
const compatAnnotations = new Set();

const increment = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const hasUseClientDirective = (source) =>
  /(?:^|\n)\s*['"]use client['"]\s*;/.test(source.slice(0, 1024));
const countDirectFetchCalls = (source) =>
  [...source.matchAll(/\bfetch\s*\(/g)].length;

for (const absolutePath of sourceFiles) {
  const sourcePath = repositoryPath(absolutePath);
  const sourceContext = contextOf(sourcePath);
  if (!sourceContext) {
    unknownSourceRoots.add(sourcePath.split('/').slice(0, 4).join('/'));
    continue;
  }

  const source = readFileSync(absolutePath, 'utf8');
  for (const match of source.matchAll(/@compat\s+([a-z0-9][a-z0-9.-]+(?:\.v\d+)?)/gi)) {
    compatAnnotations.add(match[1]);
  }

  if (sourcePath.startsWith('apps/web/src/')) {
    const directFetchCount = countDirectFetchCalls(source);
    if (directFetchCount > 0) {
      const browserSource =
        hasUseClientDirective(source) ||
        sourcePath.startsWith('apps/web/src/lib/') ||
        sourcePath.startsWith('apps/web/src/components/');
      (browserSource ? browserDirectFetchCounts : serverDirectFetchCounts).set(
        sourcePath,
        directFetchCount,
      );
    }
  }

  if (compositionRoots.has(sourcePath)) continue;

  for (const specifier of importSpecifiers(source)) {
    let targetContext = null;
    let publicSurface = false;

    if (specifier.startsWith('.')) {
      const targetPath = resolveTarget(absolutePath, specifier);
      targetContext = contextOf(targetPath);
      publicSurface = isPublicSurface(targetPath);
    } else if (config.publicAliases[specifier]) {
      targetContext = config.publicAliases[specifier];
      publicSurface = true;
    }

    if (!targetContext || targetContext === sourceContext) continue;
    const edge = sourceContext + ' -> ' + targetContext;
    increment(publicSurface ? publicCounts : directCounts, edge);
  }
}

const failures = [];

for (const [edge, count] of publicCounts.entries()) {
  if (edge.startsWith('architecture-foundation -> ')) {
    failures.push(
      `architecture-foundation must not depend on a business public surface: ${edge} (${count})`,
    );
  }
}

const validateDirectFetchLimits = ({ kind, counts, limits }) => {
  for (const [sourcePath, count] of [...counts.entries()].sort()) {
    const allowance = limits[sourcePath];
    if (!allowance) {
      failures.push(
        `new ${kind} direct fetch outside canonical/approved raw transport: ` +
          sourcePath +
          ' (' +
          count +
          ')',
      );
      continue;
    }

    if (!Number.isInteger(allowance.limit) || allowance.limit < 0) {
      failures.push(`invalid ${kind} direct-fetch limit: ` + sourcePath);
      continue;
    }
    if (typeof allowance.reason !== 'string' || allowance.reason.trim() === '') {
      failures.push(`${kind} direct-fetch allowance missing reason: ` + sourcePath);
    }

    if (count > allowance.limit) {
      failures.push(
        `${kind} direct-fetch debt increased: ` +
          sourcePath +
          ' baseline=' +
          allowance.limit +
          ' current=' +
          count,
      );
    } else if (count < allowance.limit) {
      failures.push(
        `${kind} direct-fetch baseline is stale; lower/remove the allowance: ` +
          sourcePath +
          ' baseline=' +
          allowance.limit +
          ' current=' +
          count,
      );
    }
  }

  for (const sourcePath of Object.keys(limits)) {
    if (!counts.has(sourcePath)) {
      failures.push(
        `${kind} direct-fetch allowance has no matching call; remove it: ` + sourcePath,
      );
    }
  }
};

validateDirectFetchLimits({
  kind: 'browser',
  counts: browserDirectFetchCounts,
  limits: config.webBrowserDirectFetchLimits ?? {},
});
validateDirectFetchLimits({
  kind: 'server',
  counts: serverDirectFetchCounts,
  limits: config.webServerDirectFetchLimits ?? {},
});

const webNextConfigPath = join(REPOSITORY_ROOT, 'apps/web/next.config.ts');
if (existsSync(webNextConfigPath)) {
  const webNextConfig = readFileSync(webNextConfigPath, 'utf8');
  if (/source\s*:\s*['"]\/api\/v1\//.test(webNextConfig)) {
    failures.push(
      'duplicate Web JSON API proxy detected: /api/v1 must be owned by the App Router BFF',
    );
  }
  if (webNextConfig.includes('NEXT_PUBLIC_API_URL')) {
    failures.push(
      'Web API upstream must remain server-only; NEXT_PUBLIC_API_URL is forbidden in next.config.ts',
    );
  }
  if (/process\.env\.API_URL\b/.test(webNextConfig)) {
    failures.push(
      'Web API upstream must use API_UPSTREAM; legacy API_URL is forbidden in next.config.ts',
    );
  }
}

const packageDependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

for (const boundary of config.dependencyBoundaries ?? []) {
  const forbiddenSpecifiers = new Set(boundary.forbiddenSpecifiers ?? []);
  const boundarySourceFiles = walk(join(REPOSITORY_ROOT, boundary.sourcePath));

  for (const absolutePath of boundarySourceFiles) {
    const sourcePath = repositoryPath(absolutePath);
    const source = readFileSync(absolutePath, 'utf8');
    for (const specifier of importSpecifiers(source)) {
      const forbidden = [...forbiddenSpecifiers].find(
        (candidate) =>
          specifier === candidate || specifier.startsWith(candidate + '/'),
      );
      if (forbidden) {
        failures.push(
          'forbidden dependency import: ' +
            sourcePath +
            ' -> ' +
            forbidden,
        );
      }
    }
  }

  const manifestPath = join(REPOSITORY_ROOT, boundary.packageJson);
  if (!existsSync(manifestPath)) {
    failures.push('dependency boundary package.json missing: ' + boundary.packageJson);
    continue;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const dependencyField of packageDependencyFields) {
    const dependencies = manifest[dependencyField] ?? {};
    for (const forbidden of forbiddenSpecifiers) {
      if (Object.prototype.hasOwnProperty.call(dependencies, forbidden)) {
        failures.push(
          'forbidden package dependency: ' +
            boundary.packageJson +
            ' [' +
            dependencyField +
            '] -> ' +
            forbidden,
        );
      }
    }
  }
}

const foundationPrimitiveOwnership = config.foundationPrimitiveOwnership;
if (foundationPrimitiveOwnership) {
  const packageSpecifier = foundationPrimitiveOwnership.package;
  const ownerPath = toPosix(foundationPrimitiveOwnership.ownerPath);
  const symbols = foundationPrimitiveOwnership.symbols ?? [];
  const businessPackagePaths = foundationPrimitiveOwnership.businessPackagePaths ?? [];

  if (config.publicAliases[packageSpecifier] !== 'architecture-foundation') {
    failures.push(
      `foundation package must be registered as architecture-foundation public surface: ${packageSpecifier}`,
    );
  }
  if (contextOf(ownerPath) !== 'architecture-foundation') {
    failures.push(`foundation primitive owner path is not architecture-foundation: ${ownerPath}`);
  }

  const foundationManifestPath = join(REPOSITORY_ROOT, ownerPath, 'package.json');
  if (!existsSync(foundationManifestPath)) {
    failures.push(`foundation package.json missing: ${ownerPath}/package.json`);
  } else {
    const foundationManifest = JSON.parse(readFileSync(foundationManifestPath, 'utf8'));
    if (foundationManifest.name !== packageSpecifier) {
      failures.push(
        `foundation package name mismatch: expected ${packageSpecifier}, got ${foundationManifest.name ?? '<missing>'}`,
      );
    }
  }

  const ownerFiles = walk(join(REPOSITORY_ROOT, ownerPath));
  for (const symbol of symbols) {
    const declarations = ownerFiles.filter((absolutePath) =>
      declaresSymbol(readFileSync(absolutePath, 'utf8'), symbol),
    );
    if (declarations.length !== 1) {
      failures.push(
        `foundation primitive must have exactly one owner implementation: ${symbol} (${declarations.length})`,
      );
    }
  }

  for (const absolutePath of sourceFiles) {
    const sourcePath = repositoryPath(absolutePath);
    if (sourcePath === ownerPath || sourcePath.startsWith(ownerPath + '/')) {
      continue;
    }
    const source = readFileSync(absolutePath, 'utf8');
    for (const symbol of symbols) {
      if (declaresSymbol(source, symbol)) {
        failures.push(
          `foundation primitive implementation outside ${ownerPath}: ${sourcePath} -> ${symbol}`,
        );
      }
    }
  }

  const exportAllPattern = new RegExp(
    `\\bexport\\s*\\*\\s*from\\s*['\"]${escapeRegExp(packageSpecifier)}['\"]`,
  );
  for (const packagePath of businessPackagePaths) {
    for (const absolutePath of walk(join(REPOSITORY_ROOT, packagePath))) {
      const sourcePath = repositoryPath(absolutePath);
      const source = readFileSync(absolutePath, 'utf8');
      if (exportAllPattern.test(source)) {
        failures.push(
          `business package must not re-export foundation surface: ${sourcePath} -> ${packageSpecifier}`,
        );
      }
      for (const symbol of symbols) {
        if (reexportsSymbol(source, symbol)) {
          failures.push(
            `business package must not re-export foundation primitive: ${sourcePath} -> ${symbol}`,
          );
        }
      }
    }
  }
}

const brandStoreCanonicalConfigOwnership = config.brandStoreCanonicalConfigOwnership;
if (brandStoreCanonicalConfigOwnership) {
  const ownerContext = brandStoreCanonicalConfigOwnership.context;
  const publicSurface = toPosix(
    brandStoreCanonicalConfigOwnership.publicSurface,
  );
  const implementation = toPosix(
    brandStoreCanonicalConfigOwnership.implementation,
  );
  const publicSymbols = brandStoreCanonicalConfigOwnership.publicSymbols ?? [];
  const ownedIdentitySymbols =
    brandStoreCanonicalConfigOwnership.ownedIdentitySymbols ?? [];
  const identityImplementation = toPosix(
    brandStoreCanonicalConfigOwnership.identityImplementation ?? '',
  );
  const contractImplementation = toPosix(
    brandStoreCanonicalConfigOwnership.contractImplementation ?? '',
  );
  const compositionModule = toPosix(
    brandStoreCanonicalConfigOwnership.compositionModule ?? '',
  );
  const forbiddenLegacyDelegates =
    brandStoreCanonicalConfigOwnership.forbiddenLegacyDelegates ?? [];
  const forbiddenLegacyDelegateRoots =
    brandStoreCanonicalConfigOwnership.forbiddenLegacyDelegateRoots ?? [];
  const migratedLegacyConfigConsumers =
    brandStoreCanonicalConfigOwnership.migratedLegacyConfigConsumers ?? [];
  const migratedConsumerForbiddenSymbols =
    brandStoreCanonicalConfigOwnership.migratedConsumerForbiddenSymbols ?? {};
  const forbiddenLegacyPaths =
    brandStoreCanonicalConfigOwnership.forbiddenLegacyPaths ?? [];

  if (contextOf(publicSurface) !== ownerContext) {
    failures.push(
      `Brand/Store canonical config public surface must belong to ${ownerContext}: ${publicSurface}`,
    );
  }
  if (contextOf(implementation) !== ownerContext) {
    failures.push(
      `Brand/Store canonical config implementation must belong to ${ownerContext}: ${implementation}`,
    );
  }
  for (const internalPath of [
    identityImplementation,
    contractImplementation,
    compositionModule,
  ]) {
    if (!internalPath || contextOf(internalPath) !== ownerContext) {
      failures.push(
        `Brand/Store internal boundary path must belong to ${ownerContext}: ${internalPath || '<missing>'}`,
      );
      continue;
    }
    if (!existsSync(join(REPOSITORY_ROOT, internalPath))) {
      failures.push(`Brand/Store internal boundary path missing: ${internalPath}`);
    }
  }
  if (!isPublicSurface(publicSurface)) {
    failures.push(
      `Brand/Store canonical config boundary is not a recognized public surface: ${publicSurface}`,
    );
  }

  const publicSurfacePath = join(REPOSITORY_ROOT, publicSurface);
  if (!existsSync(publicSurfacePath)) {
    failures.push(
      `Brand/Store canonical config public surface missing: ${publicSurface}`,
    );
  } else {
    const publicSource = readFileSync(publicSurfacePath, 'utf8');
    for (const symbol of publicSymbols) {
      if (
        !declaresSymbol(publicSource, symbol) &&
        !reexportsSymbol(publicSource, symbol)
      ) {
        failures.push(
          `Brand/Store canonical config public symbol missing: ${publicSurface} -> ${symbol}`,
        );
      }
    }
  }

  for (const forbiddenPath of forbiddenLegacyPaths) {
    const normalizedPath = toPosix(forbiddenPath);
    if (existsSync(join(REPOSITORY_ROOT, normalizedPath))) {
      failures.push(
        `legacy Brand/Store ownership path must not return: ${normalizedPath}`,
      );
    }
  }

  const identityImplementationPath = join(
    REPOSITORY_ROOT,
    identityImplementation,
  );
  if (!identityImplementation || !existsSync(identityImplementationPath)) {
    failures.push(
      `configured store identity implementation missing: ${identityImplementation || '<missing>'}`,
    );
  } else {
    const identitySource = readFileSync(identityImplementationPath, 'utf8');
    for (const symbol of ownedIdentitySymbols) {
      if (!declaresSymbol(identitySource, symbol)) {
        failures.push(
          `configured store identity implementation missing symbol: ${identityImplementation} -> ${symbol}`,
        );
      }
    }
  }

  for (const absolutePath of sourceFiles) {
    const sourcePath = repositoryPath(absolutePath);
    if (sourcePath === identityImplementation) continue;
    const source = readFileSync(absolutePath, 'utf8');
    for (const symbol of ownedIdentitySymbols) {
      if (declaresSymbol(source, symbol)) {
        failures.push(
          `configured store identity must have one Brand/Store implementation owner: ${sourcePath} -> ${symbol}`,
        );
      }
    }
  }

  for (const root of forbiddenLegacyDelegateRoots) {
    const normalizedRoot = toPosix(root);
    for (const absolutePath of walk(join(REPOSITORY_ROOT, normalizedRoot))) {
      const sourcePath = repositoryPath(absolutePath);
      const source = readFileSync(absolutePath, 'utf8');
      for (const delegate of forbiddenLegacyDelegates) {
        const delegatePattern = new RegExp(
          `\\.\\s*${escapeRegExp(delegate)}\\b`,
        );
        if (delegatePattern.test(source)) {
          failures.push(
            `Brand/Store owner must not read legacy Prisma delegate: ${sourcePath} -> ${delegate}`,
          );
        }
      }
    }
  }

  const implementationPath = join(REPOSITORY_ROOT, implementation);
  if (!existsSync(implementationPath)) {
    failures.push(
      `Brand/Store canonical config implementation missing: ${implementation}`,
    );
  }

  for (const consumer of migratedLegacyConfigConsumers) {
    const consumerPath = toPosix(consumer);
    const absoluteConsumerPath = join(REPOSITORY_ROOT, consumerPath);
    if (!existsSync(absoluteConsumerPath)) {
      failures.push(
        `migrated Brand/Store config consumer missing: ${consumerPath}`,
      );
      continue;
    }
    const source = readFileSync(absoluteConsumerPath, 'utf8');
    for (const delegate of forbiddenLegacyDelegates) {
      const delegatePattern = new RegExp(
        `\\.\\s*${escapeRegExp(delegate)}\\b`,
      );
      if (delegatePattern.test(source)) {
        failures.push(
          `migrated Brand/Store config consumer must not regress to legacy Prisma delegate: ${consumerPath} -> ${delegate}`,
        );
      }
    }
    for (const symbol of migratedConsumerForbiddenSymbols[consumerPath] ?? []) {
      const symbolPattern = new RegExp(`\\b${escapeRegExp(symbol)}\\b`);
      if (symbolPattern.test(source)) {
        failures.push(
          `migrated Brand/Store config consumer must not reintroduce legacy symbol: ${consumerPath} -> ${symbol}`,
        );
      }
    }
    const importsPublicSurface = importSpecifiers(source).some((specifier) => {
      if (!specifier.startsWith('.')) return false;
      return (
        resolveTarget(absoluteConsumerPath, specifier).replace(
          /\.(?:[cm]?[jt]sx?)$/,
          '',
        ) === publicSurface.replace(/\.(?:[cm]?[jt]sx?)$/, '')
      );
    });
    if (!importsPublicSurface || !source.includes('BRAND_STORE_CONFIG_READER')) {
      failures.push(
        `migrated Brand/Store config consumer must use ${publicSurface}: ${consumerPath}`,
      );
    }
  }

  const privateTargets = new Set(
    [
      implementation,
      identityImplementation,
      contractImplementation,
      compositionModule,
    ]
      .filter(Boolean)
      .map((path) => path.replace(/\.(?:[cm]?[jt]sx?)$/, '')),
  );
  for (const absolutePath of sourceFiles) {
    const sourcePath = repositoryPath(absolutePath);
    const sourceContext = contextOf(sourcePath);
    if (!sourceContext || sourceContext === ownerContext) continue;
    const source = readFileSync(absolutePath, 'utf8');
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith('.')) continue;
      const target = resolveTarget(absolutePath, specifier).replace(
        /\.(?:[cm]?[jt]sx?)$/,
        '',
      );
      if (privateTargets.has(target)) {
        failures.push(
          `cross-context Brand/Store import must use ${publicSurface}: ${sourcePath} -> ${specifier}`,
        );
      }
    }
  }
}

const benefitsLoyaltyPolicyOwnership = config.benefitsLoyaltyPolicyOwnership;
if (benefitsLoyaltyPolicyOwnership) {
  const ownerContext = benefitsLoyaltyPolicyOwnership.context;
  const ownerRoot = toPosix(benefitsLoyaltyPolicyOwnership.ownerRoot);
  const publicSurface = toPosix(benefitsLoyaltyPolicyOwnership.publicSurface);
  const implementation = toPosix(benefitsLoyaltyPolicyOwnership.implementation);
  const writerImplementation = toPosix(
    benefitsLoyaltyPolicyOwnership.writerImplementation,
  );
  const contractImplementation = toPosix(
    benefitsLoyaltyPolicyOwnership.contractImplementation,
  );
  const policyImplementation = toPosix(
    benefitsLoyaltyPolicyOwnership.policyImplementation,
  );
  const compositionModule = toPosix(
    benefitsLoyaltyPolicyOwnership.compositionModule,
  );
  const adminWriterAdapter = toPosix(
    benefitsLoyaltyPolicyOwnership.adminWriterAdapter,
  );
  const posReaderAdapter = toPosix(
    benefitsLoyaltyPolicyOwnership.posReaderAdapter,
  );
  const webApiClient = toPosix(benefitsLoyaltyPolicyOwnership.webApiClient);
  const webWriterConsumer = toPosix(
    benefitsLoyaltyPolicyOwnership.webWriterConsumer,
  );
  const webPosReaderConsumer = toPosix(
    benefitsLoyaltyPolicyOwnership.webPosReaderConsumer,
  );
  const webSettingsConsumer = toPosix(
    benefitsLoyaltyPolicyOwnership.webSettingsConsumer,
  );
  const publicSymbols = benefitsLoyaltyPolicyOwnership.publicSymbols ?? [];
  const transitionalStorageDelegate =
    benefitsLoyaltyPolicyOwnership.transitionalStorageDelegate;
  const legacyStorageDelegate = benefitsLoyaltyPolicyOwnership.legacyStorageDelegate;
  const implementationForbiddenSymbols =
    benefitsLoyaltyPolicyOwnership.implementationForbiddenSymbols ?? [];
  const migratedLegacyConsumers =
    benefitsLoyaltyPolicyOwnership.migratedLegacyConsumers ?? [];
  const forbiddenBrandStoreContractFields =
    benefitsLoyaltyPolicyOwnership.forbiddenBrandStoreContractFields ?? [];

  for (const boundaryPath of [
    publicSurface,
    implementation,
    writerImplementation,
    contractImplementation,
    policyImplementation,
    compositionModule,
    adminWriterAdapter,
  ]) {
    if (contextOf(boundaryPath) !== ownerContext) {
      failures.push(
        `Benefits loyalty policy boundary must belong to ${ownerContext}: ${boundaryPath}`,
      );
    }
    if (!existsSync(join(REPOSITORY_ROOT, boundaryPath))) {
      failures.push(`Benefits loyalty policy boundary path missing: ${boundaryPath}`);
    }
  }

  if (!isPublicSurface(publicSurface)) {
    failures.push(
      `Benefits loyalty policy boundary is not a recognized public surface: ${publicSurface}`,
    );
  }

  const publicSurfacePath = join(REPOSITORY_ROOT, publicSurface);
  if (existsSync(publicSurfacePath)) {
    const publicSource = readFileSync(publicSurfacePath, 'utf8');
    for (const symbol of publicSymbols) {
      if (
        !declaresSymbol(publicSource, symbol) &&
        !reexportsSymbol(publicSource, symbol)
      ) {
        failures.push(
          `Benefits loyalty policy public symbol missing: ${publicSurface} -> ${symbol}`,
        );
      }
    }
  }

  const implementationPath = join(REPOSITORY_ROOT, implementation);
  if (existsSync(implementationPath)) {
    const source = readFileSync(implementationPath, 'utf8');
    const legacyDelegatePattern = new RegExp(
      `\\.\\s*${escapeRegExp(legacyStorageDelegate)}\\b`,
    );
    if (legacyDelegatePattern.test(source)) {
      failures.push(
        `Benefits loyalty policy implementation must not regress to ${legacyStorageDelegate}: ${implementation}`,
      );
    }
    for (const symbol of implementationForbiddenSymbols) {
      if (new RegExp(`\\b${escapeRegExp(symbol)}\\b`).test(source)) {
        failures.push(
          `Benefits loyalty policy implementation forbidden legacy symbol: ${implementation} -> ${symbol}`,
        );
      }
    }
    const transactionalPolicyReaderPattern =
      /getLoyaltyPolicySnapshotWithTx\s*\([\s\S]{0,300}?Prisma\.TransactionClient[\s\S]{0,700}?\.brandConfig\.findUnique\s*\(/;
    if (!transactionalPolicyReaderPattern.test(source)) {
      failures.push(
        `Benefits transaction-bound policy reader must use BrandConfig through the existing Prisma transaction client: ${implementation}`,
      );
    }
    const transitionalDelegatePattern = new RegExp(
      `\\.\\s*${escapeRegExp(transitionalStorageDelegate)}\\b`,
    );
    if (!transitionalDelegatePattern.test(source)) {
      failures.push(
        `Benefits loyalty policy reader must use transitional ${transitionalStorageDelegate} storage: ${implementation}`,
      );
    }
    const policyReaderPattern =
      /async\s+getLoyaltyPolicySnapshot\s*\(\s*\)\s*:[^{]+\{[\s\S]{0,1600}?\.brandConfig\.findUnique\s*\(/;
    if (!policyReaderPattern.test(source)) {
      failures.push(
        `Benefits loyalty policy reader must read BrandConfig inside getLoyaltyPolicySnapshot(): ${implementation}`,
      );
    }
    const legacyPolicyReaderPattern =
      /async\s+getLoyaltyPolicySnapshot\s*\(\s*\)\s*:[^{]+\{[\s\S]{0,1600}?\.businessConfig\b/;
    if (legacyPolicyReaderPattern.test(source)) {
      failures.push(
        `Benefits loyalty policy reader must not regress to BusinessConfig: ${implementation}`,
      );
    }
    const membershipRulesPattern =
      /async\s+getMembershipProgramRules\s*\(\s*\)\s*\{[\s\S]{0,500}?getLoyaltyPolicySnapshot\s*\(/;
    if (!membershipRulesPattern.test(source)) {
      failures.push(
        `membership program rules must use the Benefits loyalty policy snapshot: ${implementation}`,
      );
    }
    const legacyMembershipRulesPattern =
      /async\s+getMembershipProgramRules\s*\(\s*\)\s*\{[\s\S]{0,500}?getLoyaltyConfig\s*\(/;
    if (legacyMembershipRulesPattern.test(source)) {
      failures.push(
        `membership program rules must not regress to legacy BusinessConfig policy reads: ${implementation}`,
      );
    }
  }

  const writerImplementationPath = join(REPOSITORY_ROOT, writerImplementation);
  if (existsSync(writerImplementationPath)) {
    const writerSource = readFileSync(writerImplementationPath, 'utf8');
    if (
      !writerSource.includes('normalizeLoyaltyPolicyUpdate') ||
      !writerSource.includes('getLoyaltyPolicySettings') ||
      !/\.\$transaction\s*\(/.test(writerSource) ||
      !/tx\.brandConfig\.findUnique\s*\(/.test(writerSource) ||
      !/tx\.businessConfig\.update\s*\(/.test(writerSource) ||
      !/tx\.brandConfig\.update\s*\(/.test(writerSource)
    ) {
      failures.push(
        `Benefits loyalty policy writer must read canonical config and dual-write canonical plus compatibility storage in one transaction: ${writerImplementation}`,
      );
    }
    if (
      writerSource.includes('DEFAULT_LOYALTY_POLICY') ||
      /(?:brandConfig|businessConfig)\.upsert\s*\(/.test(writerSource)
    ) {
      failures.push(
        `Benefits loyalty policy writer must not invent runtime defaults or create missing policy config: ${writerImplementation}`,
      );
    }
    if (!writerSource.includes('@compat benefits.business-config-loyalty-policy.v1')) {
      failures.push(
        `Benefits loyalty policy writer compatibility annotation missing: ${writerImplementation}`,
      );
    }
  }

  const adminWriterAdapterPath = join(REPOSITORY_ROOT, adminWriterAdapter);
  if (existsSync(adminWriterAdapterPath)) {
    const source = readFileSync(adminWriterAdapterPath, 'utf8');
    const importsPublicSurface = importSpecifiers(source).some((specifier) => {
      if (!specifier.startsWith('.')) return false;
      return (
        resolveTarget(adminWriterAdapterPath, specifier).replace(
          /\.(?:[cm]?[jt]sx?)$/,
          '',
        ) === publicSurface.replace(/\.(?:[cm]?[jt]sx?)$/, '')
      );
    });
    if (
      !importsPublicSurface ||
      !source.includes('LOYALTY_POLICY_SETTINGS_READER') ||
      !source.includes('LOYALTY_POLICY_WRITER') ||
      !source.includes('getLoyaltyPolicySettings') ||
      !source.includes("@Controller('admin/benefits/loyalty-policy')") ||
      !source.includes("@Roles('ADMIN')") ||
      !source.includes("@Roles('ADMIN', 'STAFF')") ||
      !source.includes('AdminMfaGuard')
    ) {
      failures.push(
        `Admin loyalty policy reads/writes must use the Benefits public settings boundary with ADMIN MFA: ${adminWriterAdapter}`,
      );
    }
  }

  const posReaderAdapterPath = join(REPOSITORY_ROOT, posReaderAdapter);
  if (!existsSync(posReaderAdapterPath)) {
    failures.push(`POS Benefits loyalty policy adapter missing: ${posReaderAdapter}`);
  } else {
    const source = readFileSync(posReaderAdapterPath, 'utf8');
    const importsPublicSurface = importSpecifiers(source).some((specifier) => {
      if (!specifier.startsWith('.')) return false;
      return (
        resolveTarget(posReaderAdapterPath, specifier).replace(
          /\.(?:[cm]?[jt]sx?)$/,
          '',
        ) === publicSurface.replace(/\.(?:[cm]?[jt]sx?)$/, '')
      );
    });
    if (
      !importsPublicSurface ||
      !source.includes('LOYALTY_POLICY_READER') ||
      !source.includes('getLoyaltyPolicySnapshot') ||
      !source.includes("@Controller('pos/loyalty-policy')") ||
      !source.includes("@Roles('ADMIN', 'STAFF')") ||
      !source.includes('PosDeviceGuard')
    ) {
      failures.push(
        `POS loyalty policy reads must use the Benefits public runtime reader with device auth: ${posReaderAdapter}`,
      );
    }
  }

  for (const webPath of [
    webApiClient,
    webWriterConsumer,
    webPosReaderConsumer,
    webSettingsConsumer,
  ]) {
    if (!existsSync(join(REPOSITORY_ROOT, webPath))) {
      failures.push(`Benefits loyalty policy Web consumer missing: ${webPath}`);
    }
  }

  const webApiClientPath = join(REPOSITORY_ROOT, webApiClient);
  if (existsSync(webApiClientPath)) {
    const source = readFileSync(webApiClientPath, 'utf8');
    if (
      !source.includes('/admin/benefits/loyalty-policy') ||
      !source.includes('/pos/loyalty-policy') ||
      !source.includes('fetchAdminLoyaltyPolicySettings') ||
      !source.includes('updateAdminLoyaltyPolicySettings') ||
      !source.includes('fetchPosLoyaltyPolicy')
    ) {
      failures.push(
        `Web Loyalty API client must own the Admin and POS Benefits routes: ${webApiClient}`,
      );
    }
  }

  const webWriterConsumerPath = join(REPOSITORY_ROOT, webWriterConsumer);
  if (existsSync(webWriterConsumerPath)) {
    const source = readFileSync(webWriterConsumerPath, 'utf8');
    if (
      !source.includes('@/lib/api/loyalty') ||
      !source.includes('fetchAdminLoyaltyPolicySettings') ||
      !source.includes('updateAdminLoyaltyPolicySettings') ||
      source.includes('/admin/business/config')
    ) {
      failures.push(
        `Admin Members loyalty policy reads/writes must use the Web Benefits API client and not /admin/business/config: ${webWriterConsumer}`,
      );
    }
  }

  const webPosReaderConsumerPath = join(REPOSITORY_ROOT, webPosReaderConsumer);
  if (existsSync(webPosReaderConsumerPath)) {
    const source = readFileSync(webPosReaderConsumerPath, 'utf8');
    if (
      !source.includes('@/lib/api/loyalty') ||
      !source.includes('fetchPosLoyaltyPolicy') ||
      source.includes('BusinessConfigLite') ||
      source.includes('/admin/business/config')
    ) {
      failures.push(
        `POS payment loyalty policy reads must use the POS Benefits API client and not Admin Business config: ${webPosReaderConsumer}`,
      );
    }
  }

  const webSettingsConsumerPath = join(REPOSITORY_ROOT, webSettingsConsumer);
  if (existsSync(webSettingsConsumerPath)) {
    const source = readFileSync(webSettingsConsumerPath, 'utf8');
    for (const field of forbiddenBrandStoreContractFields) {
      if (new RegExp(`\\b${escapeRegExp(field)}\\b`).test(source)) {
        failures.push(
          `Admin Settings must not own or resubmit Benefits loyalty policy field: ${webSettingsConsumer} -> ${field}`,
        );
      }
    }
  }

  for (const consumer of migratedLegacyConsumers) {
    const consumerPath = toPosix(consumer);
    const absoluteConsumerPath = join(REPOSITORY_ROOT, consumerPath);
    if (!existsSync(absoluteConsumerPath)) {
      failures.push(`migrated Benefits loyalty policy consumer missing: ${consumerPath}`);
      continue;
    }
    const source = readFileSync(absoluteConsumerPath, 'utf8');
    const legacyDelegatePattern = new RegExp(
      `\\.\\s*${escapeRegExp(legacyStorageDelegate)}\\b`,
    );
    if (legacyDelegatePattern.test(source)) {
      failures.push(
        `migrated Benefits loyalty policy consumer must not regress to ${legacyStorageDelegate}: ${consumerPath}`,
      );
    }
    const importsPublicSurface = importSpecifiers(source).some((specifier) => {
      if (!specifier.startsWith('.')) return false;
      return (
        resolveTarget(absoluteConsumerPath, specifier).replace(
          /\.(?:[cm]?[jt]sx?)$/,
          '',
        ) === publicSurface.replace(/\.(?:[cm]?[jt]sx?)$/, '')
      );
    });
    if (
      !importsPublicSurface ||
      !source.includes('LOYALTY_POLICY_READER') ||
      !source.includes('loyaltyPolicyReader.getLoyaltyPolicySnapshot')
    ) {
      failures.push(
        `migrated Benefits loyalty policy consumer must use ${publicSurface}: ${consumerPath}`,
      );
    }
  }

  const privateTargets = new Set(
    [contractImplementation, policyImplementation, writerImplementation].map(
      (path) => path.replace(/\.(?:[cm]?[jt]sx?)$/, ''),
    ),
  );
  for (const absolutePath of sourceFiles) {
    const sourcePath = repositoryPath(absolutePath);
    if (sourcePath === publicSurface || sourcePath.startsWith(ownerRoot + '/')) {
      continue;
    }
    const source = readFileSync(absolutePath, 'utf8');
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith('.')) continue;
      const target = resolveTarget(absolutePath, specifier).replace(
        /\.(?:[cm]?[jt]sx?)$/,
        '',
      );
      if (privateTargets.has(target)) {
        failures.push(
          `Benefits loyalty policy import must use ${publicSurface}: ${sourcePath} -> ${specifier}`,
        );
      }
    }
  }

  const brandStoreContract = toPosix(
    config.brandStoreCanonicalConfigOwnership?.contractImplementation ?? '',
  );
  if (brandStoreContract) {
    const brandStoreContractPath = join(REPOSITORY_ROOT, brandStoreContract);
    if (existsSync(brandStoreContractPath)) {
      const brandStoreContractSource = readFileSync(brandStoreContractPath, 'utf8');
      for (const field of forbiddenBrandStoreContractFields) {
        if (new RegExp(`\\b${escapeRegExp(field)}\\b`).test(brandStoreContractSource)) {
          failures.push(
            `Benefits loyalty policy field must not become Brand/Store public config: ${brandStoreContract} -> ${field}`,
          );
        }
      }
    }
  }
}

if (config.contexts.length !== 12 || new Set(config.contexts.map(({ id }) => id)).size !== 12) {
  failures.push('context-baseline.json must define exactly 12 unique contexts');
}
if (unknownSourceRoots.size > 0) {
  failures.push(
    'unclassified source roots: ' + [...unknownSourceRoots].sort().join(', '),
  );
}

for (const [edge, count] of [...directCounts.entries()].sort()) {
  const limit = config.legacyDirectImportLimits[edge];
  if (limit === undefined) {
    failures.push('new direct cross-context edge: ' + edge + ' (' + count + ')');
  } else if (count > limit) {
    failures.push(
      'legacy direct-import debt increased: ' +
        edge +
        ' baseline=' +
        limit +
        ' current=' +
        count,
    );
  }
}

const requiredFields = registry.requiredFields ?? [];
const entries = [...(registry.active ?? []), ...(registry.closed ?? [])];
const registeredIds = new Set();
for (const entry of entries) {
  for (const field of requiredFields) {
    const value = entry[field];
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    ) {
      failures.push(
        'compatibility entry ' +
          (entry.compat_id ?? '<missing-id>') +
          ' is missing ' +
          field,
      );
    }
  }
  if (registeredIds.has(entry.compat_id)) {
    failures.push('duplicate compat_id: ' + entry.compat_id);
  }
  registeredIds.add(entry.compat_id);
}

for (const annotation of compatAnnotations) {
  if (!registeredIds.has(annotation)) {
    failures.push('unregistered @compat annotation: ' + annotation);
  }
}

const report = {
  baseline: config.baseline,
  contexts: config.contexts.map(({ id }) => id),
  directCrossContextImports: Object.fromEntries(
    [...directCounts.entries()].sort(),
  ),
  publicContractImports: Object.fromEntries(
    [...publicCounts.entries()].sort(),
  ),
  webBrowserDirectFetch: Object.fromEntries(
    [...browserDirectFetchCounts.entries()].sort(),
  ),
  webServerDirectFetch: Object.fromEntries(
    [...serverDirectFetchCounts.entries()].sort(),
  ),
  compatibility: {
    active: registry.active.length,
    closed: registry.closed.length,
    reviewCandidates: registry.reviewCandidates.length,
  },
};

if (process.argv.includes('--report')) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

if (failures.length > 0) {
  process.stderr.write(
    'Architecture baseline check failed:\n- ' + failures.join('\n- ') + '\n',
  );
  process.exitCode = 1;
} else if (!process.argv.includes('--report')) {
  process.stdout.write(
    'Architecture baseline check passed (' +
      sourceFiles.length +
      ' production source files, ' +
      config.contexts.length +
      ' contexts).\n',
  );
}
