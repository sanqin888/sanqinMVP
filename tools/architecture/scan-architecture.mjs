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

const resolveTarget = (sourcePath, specifier) =>
  toPosix(
    relative(
      REPOSITORY_ROOT,
      resolve(dirname(sourcePath), specifier),
    ),
  );

const roots = [
  join(REPOSITORY_ROOT, 'apps/api/src'),
  join(REPOSITORY_ROOT, 'apps/web/src'),
];
const sourceFiles = roots.flatMap(walk);
const compositionRoots = new Set(config.baseline.compositionRootsExcluded);
const directCounts = new Map();
const publicCounts = new Map();
const unknownSourceRoots = new Set();
const compatAnnotations = new Set();

const increment = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

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
