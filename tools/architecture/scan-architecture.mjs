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
