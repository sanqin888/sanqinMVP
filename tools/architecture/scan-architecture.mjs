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
const parseContextEdge = (edge) => {
  const [source, target] = edge.split(' -> ');
  return { source, target };
};
const findStronglyConnectedComponents = (nodes, edges) => {
  const adjacency = new Map(nodes.map((node) => [node, []]));
  for (const edge of edges) {
    const { source, target } = parseContextEdge(edge);
    adjacency.get(source)?.push(target);
  }

  let nextIndex = 0;
  const indexByNode = new Map();
  const lowLinkByNode = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];

  const visit = (node) => {
    indexByNode.set(node, nextIndex);
    lowLinkByNode.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);

    for (const target of adjacency.get(node) ?? []) {
      if (!indexByNode.has(target)) {
        visit(target);
        lowLinkByNode.set(
          node,
          Math.min(lowLinkByNode.get(node), lowLinkByNode.get(target)),
        );
      } else if (onStack.has(target)) {
        lowLinkByNode.set(
          node,
          Math.min(lowLinkByNode.get(node), indexByNode.get(target)),
        );
      }
    }

    if (lowLinkByNode.get(node) !== indexByNode.get(node)) return;

    const component = [];
    while (stack.length > 0) {
      const member = stack.pop();
      onStack.delete(member);
      component.push(member);
      if (member === node) break;
    }
    components.push(component.sort());
  };

  for (const node of nodes) {
    if (!indexByNode.has(node)) visit(node);
  }
  return components;
};
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

const legacyDirectEdges = new Set(Object.keys(config.legacyDirectImportLimits));
const cycleGuardEdges = [...publicCounts.keys()].filter(
  (edge) => !legacyDirectEdges.has(edge),
);
const contextIds = config.contexts.map(({ id }) => id);
const publicContractCycles = findStronglyConnectedComponents(
  contextIds,
  cycleGuardEdges,
)
  .filter((component) => component.length > 1)
  .map((contexts) => {
    const members = new Set(contexts);
    const edges = cycleGuardEdges
      .filter((edge) => {
        const { source, target } = parseContextEdge(edge);
        return members.has(source) && members.has(target);
      })
      .sort();
    return { contexts, edges };
  });
const legacyPublicCycleComponents = Array.isArray(
  config.legacyPublicCycleComponents,
)
  ? config.legacyPublicCycleComponents.filter(
      (baseline) =>
        Array.isArray(baseline?.contexts) && Array.isArray(baseline?.edges),
    )
  : [];
const sameStringSet = (left, right) => {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
};
const isWithinLegacyPublicCycleBaseline = (cycle) =>
  legacyPublicCycleComponents.some((baseline) => {
    const baselineContexts = new Set(baseline.contexts);
    const baselineEdges = new Set(baseline.edges);
    return (
      cycle.contexts.every((context) => baselineContexts.has(context)) &&
      cycle.edges.every((edge) => baselineEdges.has(edge))
    );
  });
const matchesLegacyPublicCycleBaseline = (cycle, baseline) =>
  sameStringSet(cycle.contexts, baseline.contexts) &&
  sameStringSet(cycle.edges, baseline.edges);
const newPublicContractCycles = publicContractCycles.filter(
  (cycle) => !isWithinLegacyPublicCycleBaseline(cycle),
);
const staleLegacyPublicCycleComponents = legacyPublicCycleComponents.filter(
  (baseline) =>
    !publicContractCycles.some((cycle) =>
      matchesLegacyPublicCycleBaseline(cycle, baseline),
    ),
);

const failures = [];

const legacyCouponBenefitsModulePath = 'apps/api/src/coupons/coupons.module.ts';
if (existsSync(join(REPOSITORY_ROOT, legacyCouponBenefitsModulePath))) {
  const legacyCouponBenefitsModuleSource = readFileSync(
    join(REPOSITORY_ROOT, legacyCouponBenefitsModulePath),
    'utf8',
  );
  if (/\@Global\s*\(\s*\)/.test(legacyCouponBenefitsModuleSource)) {
    failures.push(
      'Coupon Benefits wiring must remain explicit; apps/api/src/coupons/coupons.module.ts cannot be @Global()',
    );
  }
}

const legacyCouponBenefitImplementationTargets = [
  'apps/api/src/coupons/coupons.module',
  'apps/api/src/coupons/coupon-program-claim.service',
  'apps/api/src/coupons/coupon-program-eligibility.service',
  'apps/api/src/coupons/coupon-program-issuer.service',
  'apps/api/src/coupons/coupon-program-trigger.service',
];
for (const absolutePath of sourceFiles) {
  const sourcePath = repositoryPath(absolutePath);
  if (sourcePath.startsWith('apps/api/src/coupons/')) continue;
  const source = readFileSync(absolutePath, 'utf8');
  for (const specifier of importSpecifiers(source)) {
    if (!specifier.startsWith('.')) continue;
    const targetPath = resolveTarget(absolutePath, specifier);
    if (
      legacyCouponBenefitImplementationTargets.some(
        (target) => targetPath === target || targetPath === target + '.ts',
      )
    ) {
      failures.push(
        'Coupon benefit implementations are private; use benefits/public-api or benefits/contracts: ' +
          sourcePath +
          ' -> ' +
          specifier,
      );
    }
  }
}

const paymentBenefitsReservationBoundary =
  config.paymentBenefitsReservationBoundary ?? null;
if (paymentBenefitsReservationBoundary) {
  const ownerContext = paymentBenefitsReservationBoundary.ownerContext;
  const ownerRoots = (paymentBenefitsReservationBoundary.ownerRoots ?? []).map(
    toPosix,
  );
  const publicContract = toPosix(
    paymentBenefitsReservationBoundary.publicContract ?? '',
  );
  const publicCompositionModule = toPosix(
    paymentBenefitsReservationBoundary.publicCompositionModule ?? '',
  );
  const protectedConsumers =
    paymentBenefitsReservationBoundary.protectedConsumers ?? [];

  for (const publicPath of [publicContract, publicCompositionModule]) {
    if (!publicPath || !existsSync(join(REPOSITORY_ROOT, publicPath))) {
      failures.push(
        'payment Benefits reservation public boundary is missing: ' +
          (publicPath || '<missing-path>'),
      );
    }
  }

  for (const sourcePath of protectedConsumers) {
    const absolutePath = join(REPOSITORY_ROOT, sourcePath);
    if (!existsSync(absolutePath)) {
      failures.push(
        'payment Benefits reservation protected consumer is missing: ' + sourcePath,
      );
      continue;
    }
    const source = readFileSync(absolutePath, 'utf8');
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith('.')) continue;
      const targetPath = resolveTarget(absolutePath, specifier);
      const targetsReservationOwner = ownerRoots.some(
        (root) => targetPath === root || targetPath.startsWith(root + '/'),
      );
      if (
        targetsReservationOwner &&
        contextOf(targetPath) === ownerContext &&
        !isPublicSurface(targetPath)
      ) {
        failures.push(
          'payment preparation must use Benefits public reservation contracts: ' +
            sourcePath +
            ' -> ' +
            specifier,
        );
      }
    }
  }
}

const adminCatalogOwnershipBoundary = config.adminCatalogOwnershipBoundary ?? null;
if (adminCatalogOwnershipBoundary) {
  const ownerService = toPosix(
    adminCatalogOwnershipBoundary.ownerService ?? '',
  );
  const publicSurface = toPosix(
    adminCatalogOwnershipBoundary.publicSurface ?? '',
  );
  const adminController = toPosix(
    adminCatalogOwnershipBoundary.adminController ?? '',
  );
  const adminModule = toPosix(adminCatalogOwnershipBoundary.adminModule ?? '');
  const offersOrchestration = toPosix(
    adminCatalogOwnershipBoundary.offersOrchestration ?? '',
  );
  const offersOrchestrationPublicSurface = toPosix(
    adminCatalogOwnershipBoundary.offersOrchestrationPublicSurface ?? '',
  );
  const dailySpecialOffersService = toPosix(
    adminCatalogOwnershipBoundary.dailySpecialOffersService ?? '',
  );
  const dailySpecialOffersPublicSurface = toPosix(
    adminCatalogOwnershipBoundary.dailySpecialOffersPublicSurface ?? '',
  );
  const publicMenuService = toPosix(
    adminCatalogOwnershipBoundary.publicMenuService ?? '',
  );
  const ordersService = toPosix(
    adminCatalogOwnershipBoundary.ordersService ?? '',
  );
  const availabilityOrchestration = toPosix(
    adminCatalogOwnershipBoundary.availabilityOrchestration ?? '',
  );
  const availabilityOrchestrationPublicSurface = toPosix(
    adminCatalogOwnershipBoundary.availabilityOrchestrationPublicSurface ?? '',
  );
  const retiredAdminAvailabilityOrchestration = toPosix(
    adminCatalogOwnershipBoundary.retiredAdminAvailabilityOrchestration ?? '',
  );
  const catalogAvailabilityReader = toPosix(
    adminCatalogOwnershipBoundary.catalogAvailabilityReader ?? '',
  );
  const catalogAvailabilityModule = toPosix(
    adminCatalogOwnershipBoundary.catalogAvailabilityModule ?? '',
  );
  const uberAvailabilityWiring = toPosix(
    adminCatalogOwnershipBoundary.uberAvailabilityWiring ?? '',
  );
  const uberAvailabilityPersistenceAdapter = toPosix(
    adminCatalogOwnershipBoundary.uberAvailabilityPersistenceAdapter ?? '',
  );
  const retiredAdminService = toPosix(
    adminCatalogOwnershipBoundary.retiredAdminService ?? '',
  );

  for (const sourcePath of [
    ownerService,
    publicSurface,
    adminController,
    adminModule,
    offersOrchestration,
    offersOrchestrationPublicSurface,
    dailySpecialOffersService,
    dailySpecialOffersPublicSurface,
    publicMenuService,
    ordersService,
    availabilityOrchestration,
    availabilityOrchestrationPublicSurface,
    catalogAvailabilityReader,
    catalogAvailabilityModule,
    uberAvailabilityWiring,
    uberAvailabilityPersistenceAdapter,
  ]) {
    if (!sourcePath || !existsSync(join(REPOSITORY_ROOT, sourcePath))) {
      failures.push(
        'Admin Catalog ownership boundary file is missing: ' +
          (sourcePath || '<missing-path>'),
      );
    }
  }

  for (const retiredPath of [
    retiredAdminService,
    retiredAdminAvailabilityOrchestration,
  ]) {
    if (retiredPath && existsSync(join(REPOSITORY_ROOT, retiredPath))) {
      failures.push(`retired Admin menu path must stay deleted: ${retiredPath}`);
    }
  }

  const ownerSourcePath = join(REPOSITORY_ROOT, ownerService);
  if (existsSync(ownerSourcePath)) {
    const source = readFileSync(ownerSourcePath, 'utf8');
    if (!source.includes('export class CatalogAdminService')) {
      failures.push(
        `Catalog must own the Admin menu management use case: ${ownerService}`,
      );
    }
    if (
      /integrations\/ubereats/.test(source) ||
      source.includes('Fixed combo items cannot be published to Uber Eats')
    ) {
      failures.push(
        `Catalog Admin management must not own Uber provider policy or coordination: ${ownerService}`,
      );
    }
    if (
      source.includes('menuDailySpecial') ||
      source.includes('isDailySpecialActiveNow') ||
      source.includes('resolveEffectivePriceCents')
    ) {
      failures.push(
        `Catalog Admin management must not own Daily Special persistence or pricing policy: ${ownerService}`,
      );
    }
  }

  const controllerPath = join(REPOSITORY_ROOT, adminController);
  if (existsSync(controllerPath)) {
    const source = readFileSync(controllerPath, 'utf8');
    if (
      !source.includes("from '../../menu/public-api'") ||
      !source.includes("from '../../application/menu/public-api'") ||
      !source.includes('CatalogAdminService') ||
      !source.includes('CatalogOffersMenuOrchestrationService') ||
      !source.includes('CatalogUberAvailabilityOrchestrationService') ||
      source.includes('AdminMenuAvailabilityOrchestrationService') ||
      source.includes('AdminMenuService') ||
      source.includes('PrismaService')
    ) {
      failures.push(
        `Admin menu controller must consume Catalog and availability orchestration only through public application surfaces: ${adminController}`,
      );
    }
  }

  const modulePath = join(REPOSITORY_ROOT, adminModule);
  if (existsSync(modulePath)) {
    const source = readFileSync(modulePath, 'utf8');
    if (
      !source.includes("from '../../menu/public-api'") ||
      !source.includes("from '../../application/menu/public-api'") ||
      !source.includes('CatalogAdminModule') ||
      !source.includes('CatalogOffersMenuOrchestrationModule') ||
      !source.includes('CatalogUberAvailabilityOrchestrationModule') ||
      source.includes('UberEatsModule') ||
      source.includes('PrismaService') ||
      source.includes('BrandStoreConfigModule') ||
      source.includes('AdminMenuService')
    ) {
      failures.push(
        `Admin menu composition must remain an adapter and must not wire Uber provider infrastructure directly: ${adminModule}`,
      );
    }
  }

  const offersOrchestrationPath = join(REPOSITORY_ROOT, offersOrchestration);
  if (existsSync(offersOrchestrationPath)) {
    const source = readFileSync(offersOrchestrationPath, 'utf8');
    if (
      !source.includes("from '../../menu/public-api'") ||
      !source.includes("from '../../promotions/public-api'") ||
      !source.includes('DAILY_SPECIAL_OFFERS') ||
      !source.includes('getMenuItemPricingSnapshots') ||
      source.includes('PrismaService') ||
      source.includes('BRAND_STORE_CONFIG_READER')
    ) {
      failures.push(
        `Catalog/Offers menu orchestration may coordinate only public owner capabilities: ${offersOrchestration}`,
      );
    }
  }

  const offersOrchestrationPublicSurfacePath = join(
    REPOSITORY_ROOT,
    offersOrchestrationPublicSurface,
  );
  if (existsSync(offersOrchestrationPublicSurfacePath)) {
    const source = readFileSync(offersOrchestrationPublicSurfacePath, 'utf8');
    if (
      !source.includes('CatalogOffersMenuOrchestrationModule') ||
      !source.includes('CatalogOffersMenuOrchestrationService')
    ) {
      failures.push(
        `Catalog/Offers orchestration must remain exposed only through the application public surface: ${offersOrchestrationPublicSurface}`,
      );
    }
  }

  const dailySpecialOffersPath = join(
    REPOSITORY_ROOT,
    dailySpecialOffersService,
  );
  if (existsSync(dailySpecialOffersPath)) {
    const source = readFileSync(dailySpecialOffersPath, 'utf8');
    if (
      !source.includes(
        'implements PromotionContextReaderPort, DailySpecialOffersPort',
      ) ||
      !source.includes('menuDailySpecial') ||
      !source.includes('BRAND_STORE_CONFIG_READER') ||
      source.includes('prisma.menuItem') ||
      source.includes('menuItem.find')
    ) {
      failures.push(
        `Offers must exclusively own Daily Special persistence/activation without reading Catalog Prisma delegates: ${dailySpecialOffersService}`,
      );
    }
  }

  for (const absolutePath of sourceFiles) {
    const sourcePath = repositoryPath(absolutePath);
    if (!sourcePath.startsWith('apps/api/src/')) continue;
    if (sourcePath === dailySpecialOffersService) continue;
    const source = readFileSync(absolutePath, 'utf8');
    if (source.includes('menuDailySpecial')) {
      failures.push(
        `MenuDailySpecial Prisma access belongs exclusively to Offers: ${sourcePath}`,
      );
    }
  }

  for (const consumerPath of [publicMenuService, ordersService]) {
    const fullPath = join(REPOSITORY_ROOT, consumerPath);
    if (!existsSync(fullPath)) continue;
    const source = readFileSync(fullPath, 'utf8');
    if (
      !source.includes("from '../promotions/public-api'") ||
      !source.includes('DAILY_SPECIAL_OFFERS') ||
      source.includes('menuDailySpecial')
    ) {
      failures.push(
        `Daily Special consumers must use the Offers public capability instead of direct persistence: ${consumerPath}`,
      );
    }
  }

  const offersPublicSurfacePath = join(
    REPOSITORY_ROOT,
    dailySpecialOffersPublicSurface,
  );
  if (existsSync(offersPublicSurfacePath)) {
    const source = readFileSync(offersPublicSurfacePath, 'utf8');
    if (
      !source.includes('DAILY_SPECIAL_OFFERS') ||
      !source.includes('DailySpecialOffersModule') ||
      !source.includes('DailySpecialOffersPort')
    ) {
      failures.push(
        `Offers public surface must expose the narrow Daily Special capability: ${dailySpecialOffersPublicSurface}`,
      );
    }
  }

  const orchestrationPath = join(REPOSITORY_ROOT, availabilityOrchestration);
  if (existsSync(orchestrationPath)) {
    const source = readFileSync(orchestrationPath, 'utf8');
    if (
      !source.includes("from '../../menu/public-api'") ||
      !source.includes("from '../../integrations/ubereats/public-api'") ||
      !source.includes('Fixed combo items cannot be published to Uber Eats') ||
      source.includes('PrismaService') ||
      source.includes('BRAND_STORE_CONFIG_READER')
    ) {
      failures.push(
        `Catalog/Uber availability orchestration may coordinate only public owner capabilities and provider policy: ${availabilityOrchestration}`,
      );
    }
  }

  const catalogReaderPath = join(REPOSITORY_ROOT, catalogAvailabilityReader);
  if (existsSync(catalogReaderPath)) {
    const source = readFileSync(catalogReaderPath, 'utf8');
    if (
      !source.includes('implements CatalogAvailabilityReaderPort') ||
      !source.includes('getMenuItemAvailabilitySnapshot') ||
      !source.includes('getOptionAvailabilitySnapshot') ||
      /integrations\/ubereats/.test(source)
    ) {
      failures.push(
        `Catalog owner must expose availability facts through the narrow reader contract without provider dependencies: ${catalogAvailabilityReader}`,
      );
    }
  }

  const catalogAvailabilityModulePath = join(
    REPOSITORY_ROOT,
    catalogAvailabilityModule,
  );
  if (existsSync(catalogAvailabilityModulePath)) {
    const source = readFileSync(catalogAvailabilityModulePath, 'utf8');
    if (
      !source.includes('CatalogAdminModule') ||
      !source.includes('useExisting: CatalogAdminService') ||
      source.includes('PrismaModule') ||
      source.includes('PrismaService')
    ) {
      failures.push(
        `Catalog availability composition must reuse the existing Catalog owner instead of adding another Prisma dependency: ${catalogAvailabilityModule}`,
      );
    }
  }

  const uberAvailabilityWiringPath = join(
    REPOSITORY_ROOT,
    uberAvailabilityWiring,
  );
  if (existsSync(uberAvailabilityWiringPath)) {
    const source = readFileSync(uberAvailabilityWiringPath, 'utf8');
    if (
      source.includes("from '../../../../menu/public-api'") ||
      source.includes('CATALOG_AVAILABILITY_READER') ||
      source.includes('UBER_MENU_CATALOG_AVAILABILITY_QUERY')
    ) {
      failures.push(
        `Uber availability composition must not reverse-query Catalog; Catalog-owned availability facts must enter through the Uber public command boundary: ${uberAvailabilityWiring}`,
      );
    }
  }

  const uberAvailabilityAdapterPath = join(
    REPOSITORY_ROOT,
    uberAvailabilityPersistenceAdapter,
  );
  if (existsSync(uberAvailabilityAdapterPath)) {
    const source = readFileSync(uberAvailabilityAdapterPath, 'utf8');
    if (
      source.includes("from '../../../../menu/public-api'") ||
      source.includes('CATALOG_AVAILABILITY_READER') ||
      /\.menuItem\b|\.menuOptionTemplateChoice\b/.test(source)
    ) {
      failures.push(
        `Uber availability persistence must stay DB-only for Uber-owned mapping/ticket facts and must not reintroduce Catalog reads: ${uberAvailabilityPersistenceAdapter}`,
      );
    }
  }

  const adminMenuRoot = join(REPOSITORY_ROOT, 'apps/api/src/admin/menu');
  for (const file of walk(adminMenuRoot)) {
    const source = readFileSync(file, 'utf8');
    if (/from ['"]\.\.\/\.\.\/prisma\//.test(source)) {
      failures.push(
        `Admin menu must not regain direct Prisma ownership: ${toPosix(relative(REPOSITORY_ROOT, file))}`,
      );
    }
    if (/integrations\/ubereats/.test(source)) {
      failures.push(
        `Admin menu must not regain direct Uber provider coordination: ${toPosix(relative(REPOSITORY_ROOT, file))}`,
      );
    }
  }
}

const promotionRuleOffersOwnershipBoundary =
  config.promotionRuleOffersOwnershipBoundary ?? null;
if (promotionRuleOffersOwnershipBoundary) {
  const managementContract = toPosix(
    promotionRuleOffersOwnershipBoundary.managementContract ?? '',
  );
  const managementService = toPosix(
    promotionRuleOffersOwnershipBoundary.managementService ?? '',
  );
  const ownerPersistenceService = toPosix(
    promotionRuleOffersOwnershipBoundary.ownerPersistenceService ?? '',
  );
  const promotionRulePublicSurface = toPosix(
    promotionRuleOffersOwnershipBoundary.publicSurface ?? '',
  );
  const promotionRuleAdminController = toPosix(
    promotionRuleOffersOwnershipBoundary.adminController ?? '',
  );
  const promotionRuleAdminModule = toPosix(
    promotionRuleOffersOwnershipBoundary.adminModule ?? '',
  );
  const retiredAdminPromotionsService = toPosix(
    promotionRuleOffersOwnershipBoundary.retiredAdminService ?? '',
  );

  for (const sourcePath of [
    managementContract,
    managementService,
    ownerPersistenceService,
    promotionRulePublicSurface,
    promotionRuleAdminController,
    promotionRuleAdminModule,
  ]) {
    if (!sourcePath || !existsSync(join(REPOSITORY_ROOT, sourcePath))) {
      failures.push(
        `PromotionRule Offers ownership boundary file is missing: ${sourcePath || '<missing-path>'}`,
      );
    }
  }

  if (
    retiredAdminPromotionsService &&
    existsSync(join(REPOSITORY_ROOT, retiredAdminPromotionsService))
  ) {
    failures.push(
      `retired Admin PromotionRule owner must stay deleted: ${retiredAdminPromotionsService}`,
    );
  }

  const managementContractPath = join(REPOSITORY_ROOT, managementContract);
  if (existsSync(managementContractPath)) {
    const source = readFileSync(managementContractPath, 'utf8');
    if (
      !source.includes('PROMOTION_RULE_MANAGEMENT') ||
      !source.includes('PromotionRuleManagementPort') ||
      !source.includes('PromotionRuleManagementInput') ||
      source.includes('@prisma/client') ||
      source.includes('PrismaService')
    ) {
      failures.push(
        `PromotionRule management contract must remain a Prisma-free Offers public capability: ${managementContract}`,
      );
    }
  }

  const managementServicePath = join(REPOSITORY_ROOT, managementService);
  if (existsSync(managementServicePath)) {
    const source = readFileSync(managementServicePath, 'utf8');
    if (
      !source.includes('export class PromotionRuleManagementService') ||
      !source.includes('implements PromotionRuleManagementPort') ||
      !source.includes('PromotionsService') ||
      source.includes('@prisma/client') ||
      source.includes('PrismaService') ||
      source.includes('.promotionRule')
    ) {
      failures.push(
        `PromotionRule management policy must stay in Offers without direct Prisma persistence: ${managementService}`,
      );
    }
  }

  const ownerPersistencePath = join(REPOSITORY_ROOT, ownerPersistenceService);
  if (existsSync(ownerPersistencePath)) {
    const source = readFileSync(ownerPersistencePath, 'utf8');
    for (const requiredSymbol of [
      'listPromotionRulesForManagement',
      'getPromotionRuleForManagement',
      'createPromotionRuleForManagement',
      'updatePromotionRuleForManagement',
      'deletePromotionRuleForManagement',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Offers PromotionRule persistence entry is missing ${requiredSymbol}: ${ownerPersistenceService}`,
        );
      }
    }
    if (!source.includes('prisma.promotionRule')) {
      failures.push(
        `Offers PromotionRule persistence must remain behind the existing PromotionsService Prisma entry: ${ownerPersistenceService}`,
      );
    }
  }

  const promotionRulePublicSurfacePath = join(
    REPOSITORY_ROOT,
    promotionRulePublicSurface,
  );
  if (existsSync(promotionRulePublicSurfacePath)) {
    const source = readFileSync(promotionRulePublicSurfacePath, 'utf8');
    if (
      !source.includes('PROMOTION_RULE_MANAGEMENT') ||
      !source.includes('PromotionRuleManagementPort') ||
      !source.includes('PromotionRuleManagementInput')
    ) {
      failures.push(
        `Offers public surface must expose the narrow PromotionRule management capability: ${promotionRulePublicSurface}`,
      );
    }
  }

  const promotionRuleAdminControllerPath = join(
    REPOSITORY_ROOT,
    promotionRuleAdminController,
  );
  if (existsSync(promotionRuleAdminControllerPath)) {
    const source = readFileSync(promotionRuleAdminControllerPath, 'utf8');
    if (
      !source.includes("from '../../promotions/public-api'") ||
      !source.includes('PROMOTION_RULE_MANAGEMENT') ||
      !source.includes('PromotionRuleManagementPort') ||
      source.includes('AdminPromotionsService') ||
      source.includes('@prisma/client') ||
      source.includes('PrismaService')
    ) {
      failures.push(
        `Admin Promotions controller must remain a thin Offers public-capability adapter: ${promotionRuleAdminController}`,
      );
    }
  }

  const promotionRuleAdminModulePath = join(
    REPOSITORY_ROOT,
    promotionRuleAdminModule,
  );
  if (existsSync(promotionRuleAdminModulePath)) {
    const source = readFileSync(promotionRuleAdminModulePath, 'utf8');
    if (
      !source.includes("from '../../promotions/public-api'") ||
      !source.includes('PromotionsModule') ||
      source.includes('AdminPromotionsService') ||
      source.includes('PrismaModule') ||
      source.includes('PrismaService')
    ) {
      failures.push(
        `Admin Promotions module must wire only the Offers public module and auth guards: ${promotionRuleAdminModule}`,
      );
    }
  }

  const promotionRuleDelegatePattern = /\.promotionRule\b/;
  for (const absolutePath of sourceFiles) {
    const sourcePath = repositoryPath(absolutePath);
    if (!sourcePath.startsWith('apps/api/src/')) continue;
    if (sourcePath === ownerPersistenceService) continue;
    const source = readFileSync(absolutePath, 'utf8');
    if (promotionRuleDelegatePattern.test(source)) {
      failures.push(
        `PromotionRule Prisma access belongs exclusively to the Offers persistence owner: ${sourcePath}`,
      );
    }
  }
}

const emailVerificationIdentityOwnershipBoundary =
  config.emailVerificationIdentityOwnershipBoundary ?? null;
if (emailVerificationIdentityOwnershipBoundary) {
  const boundary = Object.fromEntries(
    Object.entries(emailVerificationIdentityOwnershipBoundary).map(([key, value]) => [
      key,
      toPosix(value ?? ''),
    ]),
  );
  const requiredPaths = [
    boundary.identityContract,
    boundary.identityService,
    boundary.identityModule,
    boundary.identityPublicSurface,
    boundary.checkoutController,
    boundary.messagingDeliveryContract,
    boundary.messagingDeliveryModule,
    boundary.messagingPublicSurface,
    boundary.messagingModule,
    boundary.membershipController,
    boundary.membershipService,
    boundary.cloverPayController,
  ];

  for (const sourcePath of requiredPaths) {
    if (!sourcePath || !existsSync(join(REPOSITORY_ROOT, sourcePath))) {
      failures.push(
        `Email verification ownership boundary file is missing: ${sourcePath || '<missing-path>'}`,
      );
    }
  }

  for (const retiredPath of [
    boundary.retiredMessagingService,
    boundary.retiredMessagingController,
  ]) {
    if (retiredPath && existsSync(join(REPOSITORY_ROOT, retiredPath))) {
      failures.push(
        `retired Messaging-owned email verification path must stay deleted: ${retiredPath}`,
      );
    }
  }

  const identityContractPath = join(REPOSITORY_ROOT, boundary.identityContract);
  if (existsSync(identityContractPath)) {
    const source = readFileSync(identityContractPath, 'utf8');
    if (
      !source.includes('IDENTITY_EMAIL_VERIFICATION') ||
      !source.includes('IdentityEmailVerificationPort') ||
      source.includes('@prisma/client') ||
      source.includes('PrismaService') ||
      source.includes('EmailService')
    ) {
      failures.push(
        `Identity email-verification contract must remain Prisma/provider free: ${boundary.identityContract}`,
      );
    }
  }

  const identityPublicSurfacePath = join(
    REPOSITORY_ROOT,
    boundary.identityPublicSurface,
  );
  if (existsSync(identityPublicSurfacePath)) {
    const source = readFileSync(identityPublicSurfacePath, 'utf8');
    if (
      !source.includes('IdentityEmailVerificationModule') ||
      !source.includes('IDENTITY_EMAIL_VERIFICATION') ||
      !source.includes('IdentityEmailVerificationPort')
    ) {
      failures.push(
        `Identity public surface must expose the email-verification owner capability: ${boundary.identityPublicSurface}`,
      );
    }
  }

  const identityServicePath = join(REPOSITORY_ROOT, boundary.identityService);
  if (existsSync(identityServicePath)) {
    const source = readFileSync(identityServicePath, 'utf8');
    if (
      !source.includes('implements IdentityEmailVerificationPort') ||
      !source.includes('IDENTITY_CHALLENGE_ENGINE') ||
      !source.includes('EMAIL_VERIFICATION_DELIVERY') ||
      !source.includes('authChallenge') ||
      !source.includes('emailVerifiedAt') ||
      !source.includes("from '../email/public-api'") ||
      source.includes("from '../email/email.service'")
    ) {
      failures.push(
        `Email verification challenge/account mutation must remain Identity-owned and use only the Messaging delivery public capability: ${boundary.identityService}`,
      );
    }
  }

  const messagingDeliveryContractPath = join(
    REPOSITORY_ROOT,
    boundary.messagingDeliveryContract,
  );
  if (existsSync(messagingDeliveryContractPath)) {
    const source = readFileSync(messagingDeliveryContractPath, 'utf8');
    if (
      !source.includes('EMAIL_VERIFICATION_DELIVERY') ||
      !source.includes('EmailVerificationDeliveryPort') ||
      source.includes('@prisma/client') ||
      source.includes('PrismaService') ||
      source.includes('AuthChallenge')
    ) {
      failures.push(
        `Messaging email-verification boundary must expose delivery only: ${boundary.messagingDeliveryContract}`,
      );
    }
  }

  const messagingPublicSurfacePath = join(
    REPOSITORY_ROOT,
    boundary.messagingPublicSurface,
  );
  if (existsSync(messagingPublicSurfacePath)) {
    const source = readFileSync(messagingPublicSurfacePath, 'utf8');
    if (
      !source.includes('EMAIL_VERIFICATION_DELIVERY') ||
      !source.includes('EmailVerificationDeliveryPort') ||
      !source.includes('EmailVerificationDeliveryModule')
    ) {
      failures.push(
        `Messaging public surface must expose only the email-verification delivery capability: ${boundary.messagingPublicSurface}`,
      );
    }
  }

  const messagingModulePath = join(REPOSITORY_ROOT, boundary.messagingModule);
  if (existsSync(messagingModulePath)) {
    const source = readFileSync(messagingModulePath, 'utf8');
    if (
      source.includes('EmailVerificationService') ||
      source.includes('IdentityChallengeModule') ||
      source.includes('EmailCheckoutVerificationController')
    ) {
      failures.push(
        `Messaging EmailModule must not regain verification lifecycle ownership: ${boundary.messagingModule}`,
      );
    }
  }

  const membershipControllerPath = join(
    REPOSITORY_ROOT,
    boundary.membershipController,
  );
  if (existsSync(membershipControllerPath)) {
    const source = readFileSync(membershipControllerPath, 'utf8');
    if (
      !source.includes('IDENTITY_EMAIL_VERIFICATION') ||
      !source.includes('requestUserVerification') ||
      !source.includes('verifyUserEmailCode') ||
      !source.includes('userStableId')
    ) {
      failures.push(
        `Membership email verification must consume the Identity public capability with stable user identity: ${boundary.membershipController}`,
      );
    }
  }

  const membershipServicePath = join(REPOSITORY_ROOT, boundary.membershipService);
  if (existsSync(membershipServicePath)) {
    const source = readFileSync(membershipServicePath, 'utf8');
    if (
      source.includes('EmailVerificationService') ||
      source.includes('requestEmailVerification(') ||
      source.includes('verifyEmailCode(')
    ) {
      failures.push(
        `MembershipService must not regain email-verification challenge/account ownership: ${boundary.membershipService}`,
      );
    }
  }

  const cloverPayControllerPath = join(
    REPOSITORY_ROOT,
    boundary.cloverPayController,
  );
  if (existsSync(cloverPayControllerPath)) {
    const source = readFileSync(cloverPayControllerPath, 'utf8');
    if (
      !source.includes("from '../auth/public-api'") ||
      !source.includes('IDENTITY_EMAIL_VERIFICATION') ||
      source.includes('email/email-verification.service')
    ) {
      failures.push(
        `Clover checkout email proof validation must consume Identity public capability without provider-flow changes: ${boundary.cloverPayController}`,
      );
    }
  }

  for (const absolutePath of sourceFiles) {
    const sourcePath = repositoryPath(absolutePath);
    if (contextOf(sourcePath) !== 'messaging-notifications') continue;
    const source = readFileSync(absolutePath, 'utf8');
    for (const specifier of importSpecifiers(source)) {
      let targetContext = null;
      if (specifier.startsWith('.')) {
        targetContext = contextOf(resolveTarget(absolutePath, specifier));
      } else if (config.publicAliases[specifier]) {
        targetContext = config.publicAliases[specifier];
      }
      if (targetContext === 'identity-customer-benefits') {
        failures.push(
          `Messaging must not depend on Identity; verification lifecycle belongs to Identity: ${sourcePath} -> ${specifier}`,
        );
      }
    }
    if (/\.authChallenge\b|\bemailVerifiedAt\b/.test(source)) {
      failures.push(
        `Messaging must not own AuthChallenge or verified-email account mutation: ${sourcePath}`,
      );
    }
  }
}

const authChallengeMessagingDeliveryBoundary =
  config.authChallengeMessagingDeliveryBoundary ?? null;
if (authChallengeMessagingDeliveryBoundary) {
  const boundary = Object.fromEntries(
    Object.entries(authChallengeMessagingDeliveryBoundary).map(([key, value]) => [
      key,
      toPosix(value ?? ''),
    ]),
  );
  const requiredPaths = [
    boundary.deliveryContract,
    boundary.deliveryService,
    boundary.deliveryModule,
    boundary.publicSurface,
    boundary.authService,
    boundary.authModule,
    boundary.smsService,
  ];

  for (const sourcePath of requiredPaths) {
    if (!sourcePath || !existsSync(join(REPOSITORY_ROOT, sourcePath))) {
      failures.push(
        `Auth challenge Messaging delivery boundary file is missing: ${sourcePath || '<missing-path>'}`,
      );
    }
  }

  const deliveryContractPath = join(REPOSITORY_ROOT, boundary.deliveryContract);
  if (existsSync(deliveryContractPath)) {
    const source = readFileSync(deliveryContractPath, 'utf8');
    for (const requiredSymbol of [
      'AUTH_CHALLENGE_DELIVERY',
      'AuthChallengeDeliveryPort',
      'sendLoginTwoFactorSms',
      'sendLoginTwoFactorEmail',
      'sendPhoneEnrollmentSms',
      'sendMembershipLoginSms',
      'userStableId',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Auth challenge delivery contract is missing ${requiredSymbol}: ${boundary.deliveryContract}`,
        );
      }
    }
    if (
      source.includes('@prisma/client') ||
      source.includes('PrismaService') ||
      source.includes('EmailService') ||
      source.includes('SmsService') ||
      source.includes('TemplateRenderer') ||
      source.includes('BusinessConfigService') ||
      /\buserId\b/.test(source)
    ) {
      failures.push(
        `Auth challenge delivery contract must remain stable-ID/provider/persistence free: ${boundary.deliveryContract}`,
      );
    }
  }

  const deliveryServicePath = join(REPOSITORY_ROOT, boundary.deliveryService);
  if (existsSync(deliveryServicePath)) {
    const source = readFileSync(deliveryServicePath, 'utf8');
    for (const requiredSymbol of [
      'implements AuthChallengeDeliveryPort',
      'EmailService',
      'SmsService',
      'TemplateRenderer',
      'BusinessConfigService',
      "purpose: 'login_2fa'",
      "purpose: 'admin_login'",
      "purpose: 'verify'",
      "purpose: 'login'",
      'userStableId: input.userStableId',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Messaging Auth challenge delivery owner is missing ${requiredSymbol}: ${boundary.deliveryService}`,
        );
      }
    }
    if (
      source.includes("from '../auth/") ||
      source.includes('AuthChallengeType') ||
      source.includes('AuthChallengeStatus') ||
      source.includes('PrismaService')
    ) {
      failures.push(
        `Messaging Auth challenge delivery must not own Identity challenge lifecycle/persistence: ${boundary.deliveryService}`,
      );
    }
  }

  const publicSurfacePath = join(REPOSITORY_ROOT, boundary.publicSurface);
  if (existsSync(publicSurfacePath)) {
    const source = readFileSync(publicSurfacePath, 'utf8');
    if (
      !source.includes('AuthChallengeDeliveryModule') ||
      !source.includes('AUTH_CHALLENGE_DELIVERY') ||
      !source.includes('AuthChallengeDeliveryPort')
    ) {
      failures.push(
        `Messaging public surface must expose the Auth challenge delivery capability: ${boundary.publicSurface}`,
      );
    }
  }

  const authServicePath = join(REPOSITORY_ROOT, boundary.authService);
  if (existsSync(authServicePath)) {
    const source = readFileSync(authServicePath, 'utf8');
    if (
      !source.includes("from '../messaging/public-api'") ||
      !source.includes('AUTH_CHALLENGE_DELIVERY') ||
      !source.includes('AuthChallengeDeliveryPort') ||
      !source.includes('sendLoginTwoFactorSms') ||
      !source.includes('sendLoginTwoFactorEmail') ||
      !source.includes('sendPhoneEnrollmentSms') ||
      !source.includes('sendMembershipLoginSms') ||
      !source.includes('userStableId: user.userStableId') ||
      !source.includes('userStableId: session.user.userStableId') ||
      source.includes("from '../email/email.service'") ||
      source.includes("from '../sms/sms.service'") ||
      source.includes("from '../messaging/business-config.service'") ||
      source.includes("from '../messaging/template-renderer'") ||
      source.includes('MessagingTemplateType')
    ) {
      failures.push(
        `AuthService challenge sends must use the narrow Messaging public capability with stable user identity: ${boundary.authService}`,
      );
    }
  }

  const authModulePath = join(REPOSITORY_ROOT, boundary.authModule);
  if (existsSync(authModulePath)) {
    const source = readFileSync(authModulePath, 'utf8');
    if (
      !source.includes("from '../messaging/public-api'") ||
      !source.includes('AuthChallengeDeliveryModule') ||
      source.includes('EmailModule') ||
      source.includes('SmsModule') ||
      source.includes('MessagingModule')
    ) {
      failures.push(
        `AuthModule challenge delivery wiring must use only the Messaging public module: ${boundary.authModule}`,
      );
    }
  }

  const smsServicePath = join(REPOSITORY_ROOT, boundary.smsService);
  if (existsSync(smsServicePath)) {
    const source = readFileSync(smsServicePath, 'utf8');
    if (
      !source.includes('userStableId?: string') ||
      !source.includes('connect: { userStableId: params.userStableId }')
    ) {
      failures.push(
        `SmsService must support stable user identity for cross-context delivery audit linkage: ${boundary.smsService}`,
      );
    }
  }
}

const phoneVerificationMessagingDeliveryBoundary =
  config.phoneVerificationMessagingDeliveryBoundary ?? null;
if (phoneVerificationMessagingDeliveryBoundary) {
  const boundary = Object.fromEntries(
    Object.entries(phoneVerificationMessagingDeliveryBoundary).map(
      ([key, value]) => [key, toPosix(value ?? '')],
    ),
  );
  const requiredPaths = [
    boundary.deliveryContract,
    boundary.deliveryService,
    boundary.deliveryModule,
    boundary.publicSurface,
    boundary.phoneVerificationService,
    boundary.phoneVerificationModule,
  ];

  for (const sourcePath of requiredPaths) {
    if (!sourcePath || !existsSync(join(REPOSITORY_ROOT, sourcePath))) {
      failures.push(
        `Phone verification Messaging delivery boundary file is missing: ${sourcePath || '<missing-path>'}`,
      );
    }
  }

  const deliveryContractPath = join(REPOSITORY_ROOT, boundary.deliveryContract);
  if (existsSync(deliveryContractPath)) {
    const source = readFileSync(deliveryContractPath, 'utf8');
    for (const requiredSymbol of [
      'PHONE_VERIFICATION_DELIVERY',
      'PhoneVerificationDeliveryPort',
      'sendVerificationSms',
      'expiresInMin',
      'purpose',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Phone verification delivery contract is missing ${requiredSymbol}: ${boundary.deliveryContract}`,
        );
      }
    }
    if (
      source.includes('@prisma/client') ||
      source.includes('PrismaService') ||
      source.includes('SmsService') ||
      source.includes('TemplateRenderer') ||
      source.includes('BusinessConfigService') ||
      source.includes('AuthChallenge') ||
      /\buserId\b/.test(source)
    ) {
      failures.push(
        `Phone verification delivery contract must remain provider/persistence/challenge free: ${boundary.deliveryContract}`,
      );
    }
  }

  const deliveryServicePath = join(REPOSITORY_ROOT, boundary.deliveryService);
  if (existsSync(deliveryServicePath)) {
    const source = readFileSync(deliveryServicePath, 'utf8');
    for (const requiredSymbol of [
      'implements PhoneVerificationDeliveryPort',
      'SmsService',
      'TemplateRenderer',
      'BusinessConfigService',
      'MessagingTemplateType.OTP',
      "purpose: 'verify'",
      'metadata: { purpose: input.purpose }',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Messaging Phone verification delivery owner is missing ${requiredSymbol}: ${boundary.deliveryService}`,
        );
      }
    }
    if (
      source.includes("from '../auth/") ||
      source.includes('AuthChallengeType') ||
      source.includes('AuthChallengeStatus') ||
      source.includes('PrismaService')
    ) {
      failures.push(
        `Messaging Phone verification delivery must not own Identity challenge lifecycle/persistence: ${boundary.deliveryService}`,
      );
    }
  }

  const publicSurfacePath = join(REPOSITORY_ROOT, boundary.publicSurface);
  if (existsSync(publicSurfacePath)) {
    const source = readFileSync(publicSurfacePath, 'utf8');
    if (
      !source.includes('PhoneVerificationDeliveryModule') ||
      !source.includes('PHONE_VERIFICATION_DELIVERY') ||
      !source.includes('PhoneVerificationDeliveryPort')
    ) {
      failures.push(
        `Messaging public surface must expose the Phone verification delivery capability: ${boundary.publicSurface}`,
      );
    }
  }

  const phoneVerificationServicePath = join(
    REPOSITORY_ROOT,
    boundary.phoneVerificationService,
  );
  if (existsSync(phoneVerificationServicePath)) {
    const source = readFileSync(phoneVerificationServicePath, 'utf8');
    if (
      !source.includes("from '../messaging/public-api'") ||
      !source.includes('PHONE_VERIFICATION_DELIVERY') ||
      !source.includes('PhoneVerificationDeliveryPort') ||
      !source.includes('sendVerificationSms') ||
      !source.includes('expiresInMin: 10') ||
      !source.includes('purpose: resolvedPurpose') ||
      !source.includes("error: 'sms_send_failed'") ||
      !source.includes('messagingSendId: smsResult.sendId') ||
      source.includes("from '../sms/sms.service'") ||
      source.includes("from '../messaging/business-config.service'") ||
      source.includes("from '../messaging/template-renderer'") ||
      source.includes('MessagingTemplateType') ||
      source.includes('buildVerificationMessage')
    ) {
      failures.push(
        `PhoneVerificationService must keep challenge policy Identity-owned and use only the narrow Messaging delivery capability: ${boundary.phoneVerificationService}`,
      );
    }
  }

  const phoneVerificationModulePath = join(
    REPOSITORY_ROOT,
    boundary.phoneVerificationModule,
  );
  if (existsSync(phoneVerificationModulePath)) {
    const source = readFileSync(phoneVerificationModulePath, 'utf8');
    if (
      !source.includes("from '../messaging/public-api'") ||
      !source.includes('PhoneVerificationDeliveryModule') ||
      source.includes("from '../sms/sms.module'") ||
      source.includes("from '../messaging/messaging.module'") ||
      source.includes('SmsModule') ||
      source.includes('MessagingModule')
    ) {
      failures.push(
        `PhoneVerificationModule delivery wiring must use only the Messaging public module: ${boundary.phoneVerificationModule}`,
      );
    }
  }
}

const adminMessagingDeliveryBoundary = config.adminMessagingDeliveryBoundary ?? null;
if (adminMessagingDeliveryBoundary) {
  const boundary = Object.fromEntries(
    Object.entries(adminMessagingDeliveryBoundary).map(([key, value]) => [
      key,
      toPosix(value ?? ''),
    ]),
  );
  const requiredPaths = [
    boundary.staffContract,
    boundary.staffService,
    boundary.staffModule,
    boundary.rechargeContract,
    boundary.rechargeService,
    boundary.rechargeModule,
    boundary.emailService,
    boundary.publicSurface,
    boundary.staffAdministrationContract,
    boundary.staffAdministrationService,
    boundary.authModule,
    boundary.authPublicSurface,
    boundary.adminStaffController,
    boundary.adminModule,
    boundary.adminMembersService,
    boundary.adminMembersModule,
  ];

  for (const sourcePath of requiredPaths) {
    if (!sourcePath || !existsSync(join(REPOSITORY_ROOT, sourcePath))) {
      failures.push(
        `Admin Messaging delivery boundary file is missing: ${sourcePath || '<missing-path>'}`,
      );
    }
  }

  for (const contractPath of [boundary.staffContract, boundary.rechargeContract]) {
    const absolutePath = join(REPOSITORY_ROOT, contractPath);
    if (!existsSync(absolutePath)) continue;
    const source = readFileSync(absolutePath, 'utf8');
    if (
      source.includes('@prisma/client') ||
      source.includes('PrismaService') ||
      source.includes('EmailService') ||
      source.includes('MessagingTemplateType') ||
      source.includes('AuthChallenge') ||
      /\buserId\b/.test(source)
    ) {
      failures.push(
        `Admin Messaging delivery public contract must remain provider/persistence/DB-ID free: ${contractPath}`,
      );
    }
  }

  const staffContractPath = join(REPOSITORY_ROOT, boundary.staffContract);
  if (existsSync(staffContractPath)) {
    const source = readFileSync(staffContractPath, 'utf8');
    for (const requiredSymbol of [
      'STAFF_INVITE_DELIVERY',
      'StaffInviteDeliveryPort',
      'sendStaffInvite',
      'role: string',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Staff invite delivery contract is missing ${requiredSymbol}: ${boundary.staffContract}`,
        );
      }
    }
  }

  const rechargeContractPath = join(REPOSITORY_ROOT, boundary.rechargeContract);
  if (existsSync(rechargeContractPath)) {
    const source = readFileSync(rechargeContractPath, 'utf8');
    for (const requiredSymbol of [
      'MEMBER_RECHARGE_EMAIL_DELIVERY',
      'MemberRechargeEmailDeliveryPort',
      'sendRechargeVerificationEmail',
      'userStableId',
      'expiresInMin',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Member recharge email delivery contract is missing ${requiredSymbol}: ${boundary.rechargeContract}`,
        );
      }
    }
  }

  const staffServicePath = join(REPOSITORY_ROOT, boundary.staffService);
  if (existsSync(staffServicePath)) {
    const source = readFileSync(staffServicePath, 'utf8');
    if (
      !source.includes('implements StaffInviteDeliveryPort') ||
      !source.includes('EmailService') ||
      !source.includes('sendStaffInviteEmail(input)') ||
      source.includes('PrismaService') ||
      source.includes('AuthChallenge')
    ) {
      failures.push(
        `Messaging staff invite delivery must remain a narrow EmailService-backed capability: ${boundary.staffService}`,
      );
    }
  }

  const rechargeServicePath = join(REPOSITORY_ROOT, boundary.rechargeService);
  if (existsSync(rechargeServicePath)) {
    const source = readFileSync(rechargeServicePath, 'utf8');
    if (
      !source.includes('implements MemberRechargeEmailDeliveryPort') ||
      !source.includes('EmailService') ||
      !source.includes('sendMemberRechargeVerificationEmail(input)') ||
      source.includes('@prisma/client') ||
      source.includes('MessagingTemplateType') ||
      source.includes('PrismaService') ||
      source.includes('AuthChallenge')
    ) {
      failures.push(
        `Messaging member recharge public delivery must remain a narrow EmailService-backed capability without new Runtime debt: ${boundary.rechargeService}`,
      );
    }
  }

  const emailServicePath = join(REPOSITORY_ROOT, boundary.emailService);
  if (existsSync(emailServicePath)) {
    const source = readFileSync(emailServicePath, 'utf8');
    for (const requiredSymbol of [
      'sendMemberRechargeVerificationEmail',
      'MessagingTemplateType.OTP',
      "tags: { type: 'pos_recharge_otp' }",
      'userStableId: params.userStableId',
      'POS recharge verification code',
      'POS会员充值验证码',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `EmailService member recharge delivery mapping is missing ${requiredSymbol}: ${boundary.emailService}`,
        );
      }
    }
  }

  const publicSurfacePath = join(REPOSITORY_ROOT, boundary.publicSurface);
  if (existsSync(publicSurfacePath)) {
    const source = readFileSync(publicSurfacePath, 'utf8');
    for (const requiredSymbol of [
      'StaffInviteDeliveryModule',
      'STAFF_INVITE_DELIVERY',
      'StaffInviteDeliveryPort',
      'MemberRechargeEmailDeliveryModule',
      'MEMBER_RECHARGE_EMAIL_DELIVERY',
      'MemberRechargeEmailDeliveryPort',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Email public surface is missing ${requiredSymbol}: ${boundary.publicSurface}`,
        );
      }
    }
  }

  const staffAdministrationContractPath = join(
    REPOSITORY_ROOT,
    boundary.staffAdministrationContract,
  );
  if (existsSync(staffAdministrationContractPath)) {
    const source = readFileSync(staffAdministrationContractPath, 'utf8');
    for (const requiredSymbol of [
      'STAFF_ADMINISTRATION',
      'StaffAdministrationPort',
      'StaffAdministrationError',
      'actorUserStableId',
      'targetUserStableId',
      'inviterUserStableId',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Identity Staff Administration public contract is missing ${requiredSymbol}: ${boundary.staffAdministrationContract}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      '@nestjs/common',
      '@prisma/client',
      'PrismaService',
      'AuthService',
      'StaffInviteDeliveryPort',
      /\buserId\b/,
    ]) {
      const matched =
        forbiddenSymbol instanceof RegExp
          ? forbiddenSymbol.test(source)
          : source.includes(forbiddenSymbol);
      if (matched) {
        failures.push(
          `Identity Staff Administration public contract must remain framework/persistence/DB-ID free (${forbiddenSymbol}): ${boundary.staffAdministrationContract}`,
        );
      }
    }
  }

  const staffAdministrationServicePath = join(
    REPOSITORY_ROOT,
    boundary.staffAdministrationService,
  );
  if (existsSync(staffAdministrationServicePath)) {
    const source = readFileSync(staffAdministrationServicePath, 'utf8');
    for (const requiredSymbol of [
      "from '../email/public-api'",
      "from './identity-prisma'",
      "from './staff-administration.contract'",
      'StaffInviteDeliveryPort',
      'StaffAdministrationPort',
      'implements StaffAdministrationPort',
      'StaffAdministrationError',
      'listStaff',
      'updateStaff',
      'Cannot modify current user',
      'Cannot modify last active admin',
      'listInvites',
      'createInvite',
      'resendInvite',
      'revokeInvite',
      'staffInviteDelivery.sendStaffInvite',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Identity staff administration owner is missing ${requiredSymbol}: ${boundary.staffAdministrationService}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      '@nestjs/common',
      '@prisma/client',
      "from '../prisma/prisma.service'",
      "from '../email/email.service'",
      'MessagingTemplateType',
    ]) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `Identity staff administration owner must remain Prisma-generated/provider-internal free (${forbiddenSymbol}): ${boundary.staffAdministrationService}`,
        );
      }
    }
  }

  const authModulePath = join(REPOSITORY_ROOT, boundary.authModule);
  if (existsSync(authModulePath)) {
    const source = readFileSync(authModulePath, 'utf8');
    if (
      !source.includes("from '../email/public-api'") ||
      !source.includes('STAFF_INVITE_DELIVERY') ||
      !source.includes('StaffInviteDeliveryModule') ||
      !source.includes('StaffInviteDeliveryPort') ||
      !source.includes('StaffAdministrationService') ||
      !source.includes('STAFF_ADMINISTRATION') ||
      !source.includes('useFactory') ||
      !source.includes('useExisting: StaffAdministrationService') ||
      !/inject\s*:\s*\[\s*PrismaService\s*,\s*AuthService\s*,\s*STAFF_INVITE_DELIVERY\s*,?\s*\]/s.test(
        source,
      ) ||
      source.includes("from '../email/email.module'") ||
      source.includes('EmailModule')
    ) {
      failures.push(
        `Identity AuthModule staff administration wiring must use only the Email public module: ${boundary.authModule}`,
      );
    }
  }

  const authPublicSurfacePath = join(REPOSITORY_ROOT, boundary.authPublicSurface);
  if (existsSync(authPublicSurfacePath)) {
    const source = readFileSync(authPublicSurfacePath, 'utf8');
    if (
      !source.includes("from './staff-administration.contract'") ||
      source.includes("from './staff-administration.service'")
    ) {
      failures.push(
        `Identity public surface must expose Staff Administration through its contract, not the concrete service: ${boundary.authPublicSurface}`,
      );
    }
    for (const requiredSymbol of [
      'STAFF_ADMINISTRATION',
      'StaffAdministrationPort',
      'StaffAdministrationError',
      'ManagedStaffRole',
      'ManagedStaffStatus',
      'StaffAccountRole',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Identity public surface is missing Staff Administration symbol ${requiredSymbol}: ${boundary.authPublicSurface}`,
        );
      }
    }
  }

  const adminStaffControllerPath = join(
    REPOSITORY_ROOT,
    boundary.adminStaffController,
  );
  if (existsSync(adminStaffControllerPath)) {
    const source = readFileSync(adminStaffControllerPath, 'utf8');
    for (const requiredSymbol of [
      "from '../../auth/public-api'",
      'STAFF_ADMINISTRATION',
      'StaffAdministrationPort',
      'staffAdministration.listStaff',
      'staffAdministration.updateStaff',
      'staffAdministration.listInvites',
      'staffAdministration.createInvite',
      'staffAdministration.resendInvite',
      'staffAdministration.revokeInvite',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `AdminStaffController must delegate ${requiredSymbol} to the Identity owner: ${boundary.adminStaffController}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      'PrismaService',
      '@prisma/client',
      'STAFF_INVITE_DELIVERY',
      'StaffInviteDeliveryPort',
      'staffInviteDelivery',
      'StaffAdministrationService',
      'AuthService',
      'Cannot modify last active admin',
      'activeAdminCount',
      'userInvite.',
    ]) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `AdminStaffController must remain a transport/authorization adapter without ${forbiddenSymbol}: ${boundary.adminStaffController}`,
        );
      }
    }
  }

  const adminModulePath = join(REPOSITORY_ROOT, boundary.adminModule);
  if (existsSync(adminModulePath)) {
    const source = readFileSync(adminModulePath, 'utf8');
    if (
      source.includes('StaffInviteDeliveryModule') ||
      source.includes('PrismaService')
    ) {
      failures.push(
        `AdminModule must not own Staff persistence or invite delivery wiring after Slice 4A: ${boundary.adminModule}`,
      );
    }
  }

  const adminMembersServicePath = join(
    REPOSITORY_ROOT,
    boundary.adminMembersService,
  );
  if (existsSync(adminMembersServicePath)) {
    const source = readFileSync(adminMembersServicePath, 'utf8');
    for (const forbiddenSymbol of [
      "from '../../email/public-api'",
      'MEMBER_RECHARGE_EMAIL_DELIVERY',
      'MemberRechargeEmailDeliveryPort',
      'sendRechargeVerificationEmail',
      "from '../../email/email.service'",
      'EmailService',
      'MessagingTemplateType',
    ]) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `AdminMembersService must not reclaim recharge email delivery after Slice 4D-A (${forbiddenSymbol}): ${boundary.adminMembersService}`,
        );
      }
    }
  }

  const adminMembersModulePath = join(
    REPOSITORY_ROOT,
    boundary.adminMembersModule,
  );
  if (existsSync(adminMembersModulePath)) {
    const source = readFileSync(adminMembersModulePath, 'utf8');
    for (const forbiddenSymbol of [
      "from '../../email/public-api'",
      'MemberRechargeEmailDeliveryModule',
      "from '../../email/email.module'",
      'EmailModule',
    ]) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `AdminMembersModule must not reclaim recharge email delivery wiring after Slice 4D-A (${forbiddenSymbol}): ${boundary.adminMembersModule}`,
        );
      }
    }
  }
}

const memberRechargeVerificationBoundary =
  config.memberRechargeVerificationBoundary ?? null;
if (memberRechargeVerificationBoundary) {
  const boundary = Object.fromEntries(
    Object.entries(memberRechargeVerificationBoundary).map(([key, value]) => [
      key,
      toPosix(value ?? ''),
    ]),
  );
  const requiredPaths = [
    boundary.contract,
    boundary.service,
    boundary.module,
    boundary.authPublicSurface,
    boundary.identityPrisma,
    boundary.challengeEnginePort,
    boundary.challengeEngineService,
    boundary.phoneVerificationDeliveryContract,
    boundary.phoneVerificationDeliveryModule,
    boundary.messagingPublicSurface,
    boundary.main,
    boundary.compose,
    boundary.webPage,
    boundary.webSpec,
    boundary.adminMembersService,
    boundary.adminMembersModule,
    boundary.ownerSpec,
    boundary.adminAdapterSpec,
    boundary.otpPolicyService,
    boundary.otpPolicyModule,
    boundary.authService,
    boundary.emailVerificationService,
    boundary.phoneVerificationService,
  ];

  for (const sourcePath of requiredPaths) {
    if (!sourcePath || !existsSync(join(REPOSITORY_ROOT, sourcePath))) {
      failures.push(
        `Member recharge verification boundary file is missing: ${sourcePath || '<missing-path>'}`,
      );
    }
  }

  const contractPath = join(REPOSITORY_ROOT, boundary.contract);
  if (existsSync(contractPath)) {
    const source = readFileSync(contractPath, 'utf8');
    for (const requiredSymbol of [
      'MEMBER_RECHARGE_VERIFICATION',
      'MemberRechargeVerificationPort',
      'MemberRechargeVerificationError',
      'sendCode',
      'verifyCode',
      'consumeVerificationToken',
      'userStableId',
      'verificationToken',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Member recharge verification public contract is missing ${requiredSymbol}: ${boundary.contract}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      '@nestjs/common',
      '@prisma/client',
      'PrismaService',
      'PhoneVerificationService',
      'MemberRechargeEmailDeliveryPort',
      'AuthChallenge',
      /\buserId\b/,
    ]) {
      const matched =
        forbiddenSymbol instanceof RegExp
          ? forbiddenSymbol.test(source)
          : source.includes(forbiddenSymbol);
      if (matched) {
        failures.push(
          `Member recharge verification public contract must remain framework/persistence/DB-ID free (${forbiddenSymbol}): ${boundary.contract}`,
        );
      }
    }
  }

  const servicePath = join(REPOSITORY_ROOT, boundary.service);
  if (existsSync(servicePath)) {
    const source = readFileSync(servicePath, 'utf8');
    for (const requiredSymbol of [
      'implements MemberRechargeVerificationPort',
      "from './identity-prisma'",
      'MEMBER_RECHARGE_EMAIL_DELIVERY',
      'PHONE_VERIFICATION_DELIVERY',
      'IDENTITY_CHALLENGE_ENGINE',
      "const POS_RECHARGE_PURPOSE = 'pos-recharge'",
      'OtpChallengePolicyService',
      "profile: 'POS_RECHARGE'",
      "generateCode('NON_ZERO_SIX_DIGIT')",
      "hashCode(code, 'MEMBER_RECHARGE')",
      'codeHash: { not: null }',
      'revokeSupersededCodes',
      'messagingSendId: sendResult.sendId',
      'phoneVerificationDelivery.sendVerificationSms',
      'this.prisma.authChallenge.findFirst',
      'this.prisma.authChallenge.updateMany',
      'consumeVerificationToken',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Identity member recharge verification owner is missing ${requiredSymbol}: ${boundary.service}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      "from '../prisma/prisma.service'",
      'PhoneVerificationService',
      "from '../phone-verification/",
      'LoyaltyService',
      '.applyTopup(',
      'generateStableId',
    ]) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `Identity member recharge verification owner must not absorb Runtime/Loyalty top-up responsibilities (${forbiddenSymbol}): ${boundary.service}`,
        );
      }
    }
  }

  const modulePath = join(REPOSITORY_ROOT, boundary.module);
  if (existsSync(modulePath)) {
    const source = readFileSync(modulePath, 'utf8');
    for (const requiredSymbol of [
      'MemberRechargeEmailDeliveryModule',
      'PhoneVerificationDeliveryModule',
      'IdentityChallengeModule',
      'OtpChallengePolicyModule',
      'MEMBER_RECHARGE_VERIFICATION',
      'MemberRechargeVerificationService',
      'exports: [MEMBER_RECHARGE_VERIFICATION]',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Member recharge verification module wiring is missing ${requiredSymbol}: ${boundary.module}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      'PhoneVerificationModule',
      "from '../phone-verification/",
    ]) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `Member recharge verification module must not delegate recharge lifecycle to PhoneVerification (${forbiddenSymbol}): ${boundary.module}`,
        );
      }
    }
  }

  const otpPolicyServicePath = join(REPOSITORY_ROOT, boundary.otpPolicyService);
  if (existsSync(otpPolicyServicePath)) {
    const source = readFileSync(otpPolicyServicePath, 'utf8');
    for (const requiredSymbol of [
      'OtpChallengePolicyProfile',
      "'LOGIN_2FA'",
      "'PHONE_ENROLL'",
      "'MEMBERSHIP_LOGIN'",
      "'CHECKOUT'",
      "'EMAIL_VERIFY'",
      "'POS_RECHARGE'",
      "'GENERIC_PHONE'",
      'const PUBLIC_IP_HOURLY_LIMIT = 30',
      'this.prisma.authChallenge.count',
      'codeHash: { not: null }',
      'revokeSupersededCodes',
      'AuthChallengeStatus.PENDING',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Shared OTP challenge policy is missing ${requiredSymbol}: ${boundary.otpPolicyService}`,
        );
      }
    }
    for (const forbiddenSymbol of ['new Map', 'setInterval(', 'OnModuleInit']) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `Shared OTP challenge policy must remain DB-backed and process-independent (${forbiddenSymbol}): ${boundary.otpPolicyService}`,
        );
      }
    }
  }

  const otpPolicyModulePath = join(REPOSITORY_ROOT, boundary.otpPolicyModule);
  if (existsSync(otpPolicyModulePath)) {
    const source = readFileSync(otpPolicyModulePath, 'utf8');
    for (const requiredSymbol of [
      'PrismaModule',
      'IdentityChallengeModule',
      'OtpChallengePolicyService',
      'exports: [OtpChallengePolicyService]',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Shared OTP policy module wiring is missing ${requiredSymbol}: ${boundary.otpPolicyModule}`,
        );
      }
    }
  }

  const authServicePath = join(REPOSITORY_ROOT, boundary.authService);
  if (existsSync(authServicePath)) {
    const source = readFileSync(authServicePath, 'utf8');
    for (const requiredSymbol of [
      'OtpChallengePolicyService',
      "profile: 'LOGIN_2FA'",
      "profile: 'PHONE_ENROLL'",
      "profile: 'MEMBERSHIP_LOGIN'",
      'revokeSupersededCodes',
      'failedAttemptState',
      'ip: params.ip',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Auth OTP flow is missing shared policy behavior ${requiredSymbol}: ${boundary.authService}`,
        );
      }
    }
  }

  const emailVerificationServicePath = join(
    REPOSITORY_ROOT,
    boundary.emailVerificationService,
  );
  if (existsSync(emailVerificationServicePath)) {
    const source = readFileSync(emailVerificationServicePath, 'utf8');
    for (const requiredSymbol of [
      'OtpChallengePolicyService',
      "profile: 'EMAIL_VERIFY'",
      "profile: 'CHECKOUT'",
      'expiresAt(now, 10 * 60 * 1000)',
      'failedAttemptState',
      'revokeSupersededCodes',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Email OTP flow is missing shared policy behavior ${requiredSymbol}: ${boundary.emailVerificationService}`,
        );
      }
    }
  }

  const phoneVerificationServicePath = join(
    REPOSITORY_ROOT,
    boundary.phoneVerificationService,
  );
  if (existsSync(phoneVerificationServicePath)) {
    const source = readFileSync(phoneVerificationServicePath, 'utf8');
    for (const requiredSymbol of [
      'OtpChallengePolicyService',
      "'CHECKOUT'",
      "'GENERIC_PHONE'",
      'revokeSupersededCodes',
      'failedAttemptState',
      'ip,',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Phone OTP flow is missing shared policy behavior ${requiredSymbol}: ${boundary.phoneVerificationService}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      'new Map',
      'setInterval(',
      'OnModuleInit',
      'OnModuleDestroy',
    ]) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `Phone OTP flow must not restore process-local throttling (${forbiddenSymbol}): ${boundary.phoneVerificationService}`,
        );
      }
    }
  }

  const authPublicSurfacePath = join(
    REPOSITORY_ROOT,
    boundary.authPublicSurface,
  );
  if (existsSync(authPublicSurfacePath)) {
    const source = readFileSync(authPublicSurfacePath, 'utf8');
    for (const requiredSymbol of [
      'MemberRechargeVerificationModule',
      'MEMBER_RECHARGE_VERIFICATION',
      'MemberRechargeVerificationPort',
      'MemberRechargeVerificationError',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Auth public surface is missing member recharge verification symbol ${requiredSymbol}: ${boundary.authPublicSurface}`,
        );
      }
    }
  }

  const challengeEnginePortPath = join(
    REPOSITORY_ROOT,
    boundary.challengeEnginePort,
  );
  if (existsSync(challengeEnginePortPath)) {
    const source = readFileSync(challengeEnginePortPath, 'utf8');
    if (!source.includes("'MEMBER_RECHARGE'")) {
      failures.push(
        `Challenge engine must expose the recharge-specific secret kind: ${boundary.challengeEnginePort}`,
      );
    }
  }

  const challengeEngineServicePath = join(
    REPOSITORY_ROOT,
    boundary.challengeEngineService,
  );
  if (existsSync(challengeEngineServicePath)) {
    const source = readFileSync(challengeEngineServicePath, 'utf8');
    for (const requiredSymbol of [
      'randomInt(100000, 1_000_000)',
      "'MEMBER_RECHARGE_OTP_SECRET'",
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Challenge engine recharge hardening is missing ${requiredSymbol}: ${boundary.challengeEngineService}`,
        );
      }
    }
    if (source.includes('Math.random()')) {
      failures.push(
        `Challenge engine must not use Math.random for six-digit OTP generation: ${boundary.challengeEngineService}`,
      );
    }
  }

  const mainPath = join(REPOSITORY_ROOT, boundary.main);
  if (existsSync(mainPath)) {
    const source = readFileSync(mainPath, 'utf8');
    if (!source.includes('MEMBER_RECHARGE_OTP_SECRET')) {
      failures.push(
        `Production startup guard must require MEMBER_RECHARGE_OTP_SECRET: ${boundary.main}`,
      );
    }
  }

  const composePath = join(REPOSITORY_ROOT, boundary.compose);
  if (existsSync(composePath)) {
    const source = readFileSync(composePath, 'utf8');
    if (
      !source.includes(
        'MEMBER_RECHARGE_OTP_SECRET: "${MEMBER_RECHARGE_OTP_SECRET:?MEMBER_RECHARGE_OTP_SECRET is required}"',
      )
    ) {
      failures.push(
        `API compose config must require MEMBER_RECHARGE_OTP_SECRET without committing its value: ${boundary.compose}`,
      );
    }
  }

  const webPagePath = join(REPOSITORY_ROOT, boundary.webPage);
  if (existsSync(webPagePath)) {
    const source = readFileSync(webPagePath, 'utf8');
    for (const requiredSymbol of [
      'if (!res.ok)',
      'copy.errors.codeCooldown',
      'copy.errors.codeDailyLimit',
      'setRechargeStep("code-sent")',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `POS recharge send UX hardening is missing ${requiredSymbol}: ${boundary.webPage}`,
        );
      }
    }
  }

  const adminMembersServicePath = join(
    REPOSITORY_ROOT,
    boundary.adminMembersService,
  );
  if (existsSync(adminMembersServicePath)) {
    const source = readFileSync(adminMembersServicePath, 'utf8');
    for (const requiredSymbol of [
      'MEMBER_RECHARGE_VERIFICATION',
      'MemberRechargeVerificationPort',
      'memberRechargeVerification.sendCode',
      'memberRechargeVerification.verifyCode',
      'memberRechargeVerification.consumeVerificationToken',
      'loyalty.applyTopup',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `AdminMembersService must delegate recharge verification while retaining Loyalty top-up orchestration (${requiredSymbol}): ${boundary.adminMembersService}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      'this.prisma.authChallenge',
      'AuthChallengeType',
      'AuthChallengeStatus',
      'MessagingChannel',
      'IDENTITY_CHALLENGE_ENGINE',
      'IdentityChallengeEnginePort',
      'MEMBER_RECHARGE_EMAIL_DELIVERY',
      'MemberRechargeEmailDeliveryPort',
      'PhoneVerificationService',
      'POS_RECHARGE_PURPOSE',
    ]) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `AdminMembersService must not reclaim the recharge challenge/token lifecycle after Slice 4D-A (${forbiddenSymbol}): ${boundary.adminMembersService}`,
        );
      }
    }
  }

  const adminMembersModulePath = join(
    REPOSITORY_ROOT,
    boundary.adminMembersModule,
  );
  if (existsSync(adminMembersModulePath)) {
    const source = readFileSync(adminMembersModulePath, 'utf8');
    if (
      !source.includes('MemberRechargeVerificationModule') ||
      !source.includes("from '../../auth/public-api'")
    ) {
      failures.push(
        `AdminMembersModule must compose the Identity recharge verification public module: ${boundary.adminMembersModule}`,
      );
    }
    for (const forbiddenSymbol of [
      'PhoneVerificationModule',
      'MemberRechargeEmailDeliveryModule',
      'IdentityChallengeModule',
      "from '../../email/public-api'",
      "from '../../phone-verification/",
    ]) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `AdminMembersModule must not wire recharge challenge/delivery internals after Slice 4D-A (${forbiddenSymbol}): ${boundary.adminMembersModule}`,
        );
      }
    }
  }

  const ownerSpecPath = join(REPOSITORY_ROOT, boundary.ownerSpec);
  if (existsSync(ownerSpecPath)) {
    const source = readFileSync(ownerSpecPath, 'utf8');
    for (const requiredSymbol of [
      'NON_ZERO_SIX_DIGIT',
      'MEMBER_RECHARGE',
      'too many requests, please try later',
      'too many requests in a day',
      'email_send_failed',
      'sms_send_failed',
      "purpose: 'pos-recharge'",
      'verificationToken already used',
      'messagingSendId',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Member recharge owner characterization is missing ${requiredSymbol}: ${boundary.ownerSpec}`,
        );
      }
    }
  }

  const webSpecPath = join(REPOSITORY_ROOT, boundary.webSpec);
  if (existsSync(webSpecPath)) {
    const source = readFileSync(webSpecPath, 'utf8');
    for (const requiredSymbol of [
      'if (!res.ok)',
      'codeCooldown',
      'codeDailyLimit',
      'setRechargeStep("code-sent")',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `POS recharge hardening characterization is missing ${requiredSymbol}: ${boundary.webSpec}`,
        );
      }
    }
  }

  const adminAdapterSpecPath = join(REPOSITORY_ROOT, boundary.adminAdapterSpec);
  if (existsSync(adminAdapterSpecPath)) {
    const source = readFileSync(adminAdapterSpecPath, 'utf8');
    for (const requiredSymbol of [
      'consumeVerificationToken',
      'applyTopup',
      'invocationCallOrder',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Admin recharge adapter characterization is missing ${requiredSymbol}: ${boundary.adminAdapterSpec}`,
        );
      }
    }
  }
}

const adminCustomerSecurityBoundary = config.adminCustomerSecurityBoundary ?? null;
if (adminCustomerSecurityBoundary) {
  const boundary = Object.fromEntries(
    Object.entries(adminCustomerSecurityBoundary).map(([key, value]) => [
      key,
      toPosix(value ?? ''),
    ]),
  );
  const requiredPaths = [
    boundary.customerContract,
    boundary.customerPolicy,
    boundary.customerService,
    boundary.customerPublicSurface,
    boundary.membershipModule,
    boundary.accountSecurityContract,
    boundary.accountSecurityService,
    boundary.accountSecurityModule,
    boundary.authPublicSurface,
    boundary.trustedDeviceSchema,
    boundary.trustedDeviceMigration,
    boundary.membershipController,
    boundary.membershipService,
    boundary.membershipWeb,
    boundary.adminMembersService,
    boundary.adminMembersModule,
  ];

  for (const sourcePath of requiredPaths) {
    if (!sourcePath || !existsSync(join(REPOSITORY_ROOT, sourcePath))) {
      failures.push(
        `Admin Customer/Security boundary file is missing: ${sourcePath || '<missing-path>'}`,
      );
    }
  }

  const customerContractPath = join(REPOSITORY_ROOT, boundary.customerContract);
  if (existsSync(customerContractPath)) {
    const source = readFileSync(customerContractPath, 'utf8');
    for (const requiredSymbol of [
      'CUSTOMER_ADMINISTRATION',
      'CustomerAdministrationPort',
      'updateProfileAsAdmin',
      'listAddressesAsAdmin',
      'userStableId',
      'addressStableId',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Customer Administration public contract is missing ${requiredSymbol}: ${boundary.customerContract}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      '@nestjs/common',
      '@prisma/client',
      'PrismaService',
      /\buserId\b/,
    ]) {
      const matched =
        forbiddenSymbol instanceof RegExp
          ? forbiddenSymbol.test(source)
          : source.includes(forbiddenSymbol);
      if (matched) {
        failures.push(
          `Customer Administration public contract must remain framework/persistence/DB-ID free (${forbiddenSymbol}): ${boundary.customerContract}`,
        );
      }
    }
  }

  const customerPolicyPath = join(REPOSITORY_ROOT, boundary.customerPolicy);
  if (existsSync(customerPolicyPath)) {
    const source = readFileSync(customerPolicyPath, 'utf8');
    for (const requiredSymbol of [
      'normalizeAdminCustomerPhone',
      'resolveAdminBirthdayUpdate',
      "kind: 'clear'",
      "kind: 'invalid'",
      "kind: 'set'",
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Customer Administration policy is missing ${requiredSymbol}: ${boundary.customerPolicy}`,
        );
      }
    }
    for (const forbiddenSymbol of ['@nestjs/common', '@prisma/client', 'PrismaService']) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `Customer Administration policy must remain framework/persistence free (${forbiddenSymbol}): ${boundary.customerPolicy}`,
        );
      }
    }
  }

  const customerServicePath = join(REPOSITORY_ROOT, boundary.customerService);
  if (existsSync(customerServicePath)) {
    const source = readFileSync(customerServicePath, 'utf8');
    for (const requiredSymbol of [
      'implements CustomerAdministrationPort',
      'updateProfileAsAdmin',
      'listAddressesAsAdmin',
      "throw new NotFoundException('member not found')",
      "throw new BadRequestException('email already in use')",
      "throw new BadRequestException('phone already in use')",
      "throw new BadRequestException('invalid birthday')",
      'phoneVerifiedAt = null',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Customer owner must preserve Admin profile semantics (${requiredSymbol}): ${boundary.customerService}`,
        );
      }
    }
  }

  const customerPublicSurfacePath = join(
    REPOSITORY_ROOT,
    boundary.customerPublicSurface,
  );
  if (existsSync(customerPublicSurfacePath)) {
    const source = readFileSync(customerPublicSurfacePath, 'utf8');
    if (
      !source.includes("from './customer-administration.contract'") ||
      !source.includes('CUSTOMER_ADMINISTRATION') ||
      !source.includes('CustomerAdministrationPort') ||
      source.includes("from './customer.service'")
    ) {
      failures.push(
        `Customer public surface must expose the administration contract without exporting the concrete service: ${boundary.customerPublicSurface}`,
      );
    }
  }

  const membershipModulePath = join(REPOSITORY_ROOT, boundary.membershipModule);
  if (existsSync(membershipModulePath)) {
    const source = readFileSync(membershipModulePath, 'utf8');
    if (
      !source.includes('CUSTOMER_ADMINISTRATION') ||
      !source.includes('useExisting: CustomerService')
    ) {
      failures.push(
        `MembershipModule must wire Customer Administration to the existing Customer owner: ${boundary.membershipModule}`,
      );
    }
  }

  const accountSecurityContractPath = join(
    REPOSITORY_ROOT,
    boundary.accountSecurityContract,
  );
  if (existsSync(accountSecurityContractPath)) {
    const source = readFileSync(accountSecurityContractPath, 'utf8');
    for (const requiredSymbol of [
      'ACCOUNT_SECURITY_ADMINISTRATION',
      'AccountSecurityAdministrationPort',
      'AccountTrustedDeviceDto',
      'getDeviceManagement',
      'revokeSession',
      'revokeTrustedDevice',
      'getSessionDeviceLabel',
      'setAccountStatus',
      'userStableId',
      'trustedDeviceStableId',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Account Security Administration public contract is missing ${requiredSymbol}: ${boundary.accountSecurityContract}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      '@nestjs/common',
      '@prisma/client',
      'PrismaService',
      /\buserId\b/,
    ]) {
      const matched =
        forbiddenSymbol instanceof RegExp
          ? forbiddenSymbol.test(source)
          : source.includes(forbiddenSymbol);
      if (matched) {
        failures.push(
          `Account Security Administration public contract must remain framework/persistence/DB-ID free and must not canonicalize the deferred TrustedDevice UUID (${forbiddenSymbol}): ${boundary.accountSecurityContract}`,
        );
      }
    }
  }

  const accountSecurityServicePath = join(
    REPOSITORY_ROOT,
    boundary.accountSecurityService,
  );
  if (existsSync(accountSecurityServicePath)) {
    const source = readFileSync(accountSecurityServicePath, 'utf8');
    for (const requiredSymbol of [
      "from './identity-prisma'",
      'implements AccountSecurityAdministrationPort',
      'getDeviceManagement',
      'revokeSession',
      'revokeTrustedDevice',
      'getSessionDeviceLabel',
      'setAccountStatus',
      'where: { userStableId }',
      'trustedDeviceStableId: true',
      'id: device.trustedDeviceStableId',
      'where: { userId: userDbId, sessionId }',
      'where: { userId: userDbId, trustedDeviceStableId }',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Auth account-security owner is missing ${requiredSymbol}: ${boundary.accountSecurityService}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      '@nestjs/common',
      '@prisma/client',
      "from '../prisma/prisma.service'",
    ]) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `Auth account-security owner must stay framework/Prisma-generated free (${forbiddenSymbol}): ${boundary.accountSecurityService}`,
        );
      }
    }
  }

  const accountSecurityModulePath = join(
    REPOSITORY_ROOT,
    boundary.accountSecurityModule,
  );
  if (existsSync(accountSecurityModulePath)) {
    const source = readFileSync(accountSecurityModulePath, 'utf8');
    if (
      !source.includes("from './identity-prisma'") ||
      !source.includes('ACCOUNT_SECURITY_ADMINISTRATION') ||
      !source.includes('useExisting: AccountSecurityAdministrationService')
    ) {
      failures.push(
        `Account Security Administration module must wire through the Identity-local Prisma boundary: ${boundary.accountSecurityModule}`,
      );
    }
  }

  const authPublicSurfacePath = join(REPOSITORY_ROOT, boundary.authPublicSurface);
  if (existsSync(authPublicSurfacePath)) {
    const source = readFileSync(authPublicSurfacePath, 'utf8');
    if (
      !source.includes('AccountSecurityAdministrationModule') ||
      !source.includes('ACCOUNT_SECURITY_ADMINISTRATION') ||
      !source.includes('AccountSecurityAdministrationPort') ||
      source.includes("from './account-security-administration.service'")
    ) {
      failures.push(
        `Identity public surface must expose Account Security Administration through its contract/module, not the concrete service: ${boundary.authPublicSurface}`,
      );
    }
  }

  const trustedDeviceSchemaPath = join(REPOSITORY_ROOT, boundary.trustedDeviceSchema);
  if (existsSync(trustedDeviceSchemaPath)) {
    const source = readFileSync(trustedDeviceSchemaPath, 'utf8');
    if (!source.includes('trustedDeviceStableId String    @unique @default(cuid())')) {
      failures.push(
        `TrustedDevice must own a required unique stable business identity: ${boundary.trustedDeviceSchema}`,
      );
    }
  }

  const trustedDeviceMigrationPath = join(
    REPOSITORY_ROOT,
    boundary.trustedDeviceMigration,
  );
  if (existsSync(trustedDeviceMigrationPath)) {
    const source = readFileSync(trustedDeviceMigrationPath, 'utf8');
    for (const requiredSymbol of [
      'ADD COLUMN "trustedDeviceStableId" TEXT',
      "'c' || substring(md5(\"id\"::text), 1, 23)",
      'WHERE "trustedDeviceStableId" IS NULL',
      'ALTER COLUMN "trustedDeviceStableId" SET NOT NULL',
      'TrustedDevice_trustedDeviceStableId_key',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `TrustedDevice stable-ID migration is missing ${requiredSymbol}: ${boundary.trustedDeviceMigration}`,
        );
      }
    }
    for (const forbiddenSymbol of ['random()', 'clock_timestamp()']) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `TrustedDevice stable-ID backfill must remain deterministic (${forbiddenSymbol}): ${boundary.trustedDeviceMigration}`,
        );
      }
    }
  }

  const membershipControllerPath = join(
    REPOSITORY_ROOT,
    boundary.membershipController,
  );
  if (existsSync(membershipControllerPath)) {
    const source = readFileSync(membershipControllerPath, 'utf8');
    for (const requiredSymbol of [
      'ACCOUNT_SECURITY_ADMINISTRATION',
      'accountSecurity.getDeviceManagement',
      'accountSecurity.revokeSession',
      'accountSecurity.revokeTrustedDevice',
      'accountSecurity.getSessionDeviceLabel',
      'userStableId',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Membership device transport must delegate to the Auth security owner (${requiredSymbol}): ${boundary.membershipController}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      'membership.getDeviceManagement',
      'membership.revokeSession',
      'membership.revokeTrustedDevice',
      'membership.getSessionDeviceLabel',
    ]) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `Membership transport must not delegate device persistence back to MembershipService (${forbiddenSymbol}): ${boundary.membershipController}`,
        );
      }
    }
  }

  const membershipServicePath = join(REPOSITORY_ROOT, boundary.membershipService);
  if (existsSync(membershipServicePath)) {
    const source = readFileSync(membershipServicePath, 'utf8');
    for (const forbiddenSymbol of [
      'this.prisma.trustedDevice',
      'this.prisma.userSession',
      'getDeviceManagement(',
      'revokeTrustedDevice(',
      'getSessionDeviceLabel(',
    ]) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `MembershipService must not reclaim Auth-owned session/trusted-device management (${forbiddenSymbol}): ${boundary.membershipService}`,
        );
      }
    }
  }

  const membershipWebPath = join(REPOSITORY_ROOT, boundary.membershipWeb);
  if (existsSync(membershipWebPath)) {
    const source = readFileSync(membershipWebPath, 'utf8');
    if (
      !source.includes('trustedDeviceStableId: string') ||
      !source.includes('key={device.trustedDeviceStableId}') ||
      !source.includes('onRevokeTrustedDevice(device.trustedDeviceStableId)') ||
      source.includes('onRevokeTrustedDevice(device.id)') ||
      source.includes('key={device.id}')
    ) {
      failures.push(
        `Membership Web/PWA must use trustedDeviceStableId explicitly while the legacy id alias stays transport-only: ${boundary.membershipWeb}`,
      );
    }
  }

  const adminMembersServicePath = join(
    REPOSITORY_ROOT,
    boundary.adminMembersService,
  );
  if (existsSync(adminMembersServicePath)) {
    const source = readFileSync(adminMembersServicePath, 'utf8');
    for (const requiredSymbol of [
      "from '../../membership/public-api'",
      'CUSTOMER_ADMINISTRATION',
      'CustomerAdministrationPort',
      'customerAdministration.listAddressesAsAdmin',
      'customerAdministration.updateProfileAsAdmin',
      'ACCOUNT_SECURITY_ADMINISTRATION',
      'AccountSecurityAdministrationPort',
      'accountSecurityAdministration.getDeviceManagement',
      'accountSecurityAdministration.revokeSession',
      'accountSecurityAdministration.revokeTrustedDevice',
      'accountSecurityAdministration.setAccountStatus',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `AdminMembersService must delegate Customer/Security administration through owner capabilities (${requiredSymbol}): ${boundary.adminMembersService}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      'this.prisma.userAddress',
      'Prisma.UserUpdateInput',
      "from '../../membership/membership.service'",
      'this.membership.',
      'this.prisma.userSession',
      'this.prisma.trustedDevice',
      'this.prisma.user.update(',
    ]) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `AdminMembersService must not reclaim Customer profile/address or Auth session/status persistence after Slice 4B (${forbiddenSymbol}): ${boundary.adminMembersService}`,
        );
      }
    }
  }

  const adminMembersModulePath = join(
    REPOSITORY_ROOT,
    boundary.adminMembersModule,
  );
  if (existsSync(adminMembersModulePath)) {
    const source = readFileSync(adminMembersModulePath, 'utf8');
    if (
      !source.includes("from '../../membership/public-api'") ||
      !source.includes('AccountSecurityAdministrationModule') ||
      source.includes("from '../../membership/membership.module'")
    ) {
      failures.push(
        `AdminMembersModule must compose Customer/Auth owner public modules after Slice 4B: ${boundary.adminMembersModule}`,
      );
    }
  }
}

const adminMemberOrdersReadBoundary = config.adminMemberOrdersReadBoundary ?? null;
if (adminMemberOrdersReadBoundary) {
  const boundary = Object.fromEntries(
    Object.entries(adminMemberOrdersReadBoundary).map(([key, value]) => [
      key,
      toPosix(value ?? ''),
    ]),
  );
  const requiredPaths = [
    boundary.orderSchema,
    boundary.orderMigration,
    boundary.customerExistenceContract,
    boundary.customerExistenceService,
    boundary.customerPublicSurface,
    boundary.membershipModule,
    boundary.membershipPrismaBoundary,
    boundary.authPublicSurface,
    boundary.ordersModule,
    boundary.ordersPrismaBoundary,
    boundary.runtimePrismaModule,
    boundary.adminMemberOrdersController,
    boundary.adminMemberOrdersReadService,
    boundary.adminMembersController,
    boundary.adminMembersService,
    boundary.ordersService,
    boundary.loyaltyService,
  ];

  for (const sourcePath of requiredPaths) {
    if (!sourcePath || !existsSync(join(REPOSITORY_ROOT, sourcePath))) {
      failures.push(
        `Admin member Orders read boundary file is missing: ${sourcePath || '<missing-path>'}`,
      );
    }
  }

  const orderSchemaPath = join(REPOSITORY_ROOT, boundary.orderSchema);
  if (existsSync(orderSchemaPath)) {
    const source = readFileSync(orderSchemaPath, 'utf8');
    if (
      !/model Order \{[\s\S]*?userId\s+String\?[\s\S]*?userStableId\s+String\?/.test(
        source,
      ) ||
      !source.includes('@@index([userStableId, createdAt])')
    ) {
      failures.push(
        `Order must retain legacy userId while owning nullable userStableId plus the member-read index: ${boundary.orderSchema}`,
      );
    }
  }

  const orderMigrationPath = join(REPOSITORY_ROOT, boundary.orderMigration);
  if (existsSync(orderMigrationPath)) {
    const source = readFileSync(orderMigrationPath, 'utf8');
    for (const requiredSymbol of [
      'ADD COLUMN "userStableId" TEXT',
      'SET "userStableId" = u."userStableId"',
      'o."userId" = u."id"',
      'member_order_count',
      'populated_stable_id_count',
      'mismatched_stable_id_count',
      'orphan_user_id_count',
      'Order_userStableId_createdAt_idx',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Order userStableId migration is missing ${requiredSymbol}: ${boundary.orderMigration}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      'random()',
      'clock_timestamp()',
      'gen_random_uuid()',
      'ALTER COLUMN "userStableId" SET NOT NULL',
    ]) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `Order userStableId migration must stay deterministic/additive/nullable (${forbiddenSymbol}): ${boundary.orderMigration}`,
        );
      }
    }
  }

  const customerExistenceContractPath = join(
    REPOSITORY_ROOT,
    boundary.customerExistenceContract,
  );
  if (existsSync(customerExistenceContractPath)) {
    const source = readFileSync(customerExistenceContractPath, 'utf8');
    for (const requiredSymbol of [
      'CUSTOMER_EXISTENCE_READER',
      'CustomerExistenceReaderPort',
      'customerExists',
      'userStableId',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Customer existence public contract is missing ${requiredSymbol}: ${boundary.customerExistenceContract}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      '@nestjs/common',
      '@prisma/client',
      'PrismaService',
      /\buserId\b/,
    ]) {
      const matched =
        forbiddenSymbol instanceof RegExp
          ? forbiddenSymbol.test(source)
          : source.includes(forbiddenSymbol);
      if (matched) {
        failures.push(
          `Customer existence public contract must remain framework/persistence/DB-ID free (${forbiddenSymbol}): ${boundary.customerExistenceContract}`,
        );
      }
    }
  }

  const customerExistenceServicePath = join(
    REPOSITORY_ROOT,
    boundary.customerExistenceService,
  );
  if (existsSync(customerExistenceServicePath)) {
    const source = readFileSync(customerExistenceServicePath, 'utf8');
    for (const requiredSymbol of [
      'implements CustomerExistenceReaderPort',
      "from './membership-prisma'",
      'where: { userStableId }',
      'select: { userStableId: true }',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Customer existence owner is missing ${requiredSymbol}: ${boundary.customerExistenceService}`,
        );
      }
    }
    if (
      source.includes('select: { id: true }') ||
      source.includes("from '../prisma/")
    ) {
      failures.push(
        `Customer existence owner must not expose the User DB UUID or add a direct Runtime Prisma edge: ${boundary.customerExistenceService}`,
      );
    }
  }

  const customerPublicSurfacePath = join(
    REPOSITORY_ROOT,
    boundary.customerPublicSurface,
  );
  if (existsSync(customerPublicSurfacePath)) {
    const source = readFileSync(customerPublicSurfacePath, 'utf8');
    if (
      !source.includes("from './customer-existence.contract'") ||
      !source.includes('CUSTOMER_EXISTENCE_READER') ||
      !source.includes('CustomerExistenceReaderPort') ||
      source.includes("from './customer-existence.service'")
    ) {
      failures.push(
        `Customer public surface must expose only the existence contract, not its concrete implementation: ${boundary.customerPublicSurface}`,
      );
    }
  }

  const membershipModulePath = join(REPOSITORY_ROOT, boundary.membershipModule);
  if (existsSync(membershipModulePath)) {
    const source = readFileSync(membershipModulePath, 'utf8');
    if (
      !source.includes('CustomerExistenceService') ||
      !source.includes('CUSTOMER_EXISTENCE_READER') ||
      !source.includes('useExisting: CustomerExistenceService') ||
      !source.includes("from './membership-prisma'") ||
      source.includes("from '../prisma/")
    ) {
      failures.push(
        `MembershipModule must wire the narrow Customer existence capability: ${boundary.membershipModule}`,
      );
    }
  }

  const membershipPrismaBoundaryPath = join(
    REPOSITORY_ROOT,
    boundary.membershipPrismaBoundary,
  );
  if (existsSync(membershipPrismaBoundaryPath)) {
    const source = readFileSync(membershipPrismaBoundaryPath, 'utf8');
    if (
      !source.includes("from '../prisma/prisma.module'") ||
      source.includes("from '../prisma/prisma.service'")
    ) {
      failures.push(
        `Membership Prisma composition must consolidate Runtime access through prisma.module: ${boundary.membershipPrismaBoundary}`,
      );
    }
  }

  const authPublicSurfacePath = join(REPOSITORY_ROOT, boundary.authPublicSurface);
  if (existsSync(authPublicSurfacePath)) {
    const source = readFileSync(authPublicSurfacePath, 'utf8');
    if (!source.includes("export { AdminMfaGuard } from './admin-mfa.guard'")) {
      failures.push(
        `Orders-owned Admin member transport must consume Admin MFA through the Identity public surface: ${boundary.authPublicSurface}`,
      );
    }
  }

  const ordersModulePath = join(REPOSITORY_ROOT, boundary.ordersModule);
  if (existsSync(ordersModulePath)) {
    const source = readFileSync(ordersModulePath, 'utf8');
    for (const requiredSymbol of [
      "from '../membership/public-api'",
      "from './orders-prisma'",
      'AdminMemberOrdersController',
      'AdminMemberOrdersReadService',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `OrdersModule must compose the member Orders read boundary (${requiredSymbol}): ${boundary.ordersModule}`,
        );
      }
    }
    if (
      source.includes("from '../membership/membership.module'") ||
      source.includes("from '../prisma/")
    ) {
      failures.push(
        `OrdersModule must not deep-import MembershipModule or add a direct Runtime Prisma edge after Slice 4C: ${boundary.ordersModule}`,
      );
    }
  }

  const ordersPrismaBoundaryPath = join(
    REPOSITORY_ROOT,
    boundary.ordersPrismaBoundary,
  );
  if (existsSync(ordersPrismaBoundaryPath)) {
    const source = readFileSync(ordersPrismaBoundaryPath, 'utf8');
    if (
      !source.includes("from '../prisma/prisma.module'") ||
      source.includes("from '../prisma/prisma.service'")
    ) {
      failures.push(
        `Orders Prisma composition must consolidate Runtime access through prisma.module: ${boundary.ordersPrismaBoundary}`,
      );
    }
  }

  const runtimePrismaModulePath = join(
    REPOSITORY_ROOT,
    boundary.runtimePrismaModule,
  );
  if (existsSync(runtimePrismaModulePath)) {
    const source = readFileSync(runtimePrismaModulePath, 'utf8');
    if (!source.includes("export { PrismaService } from './prisma.service'")) {
      failures.push(
        `Runtime PrismaModule must expose PrismaService for context-local composition boundaries: ${boundary.runtimePrismaModule}`,
      );
    }
  }

  const adminMemberOrdersControllerPath = join(
    REPOSITORY_ROOT,
    boundary.adminMemberOrdersController,
  );
  if (existsSync(adminMemberOrdersControllerPath)) {
    const source = readFileSync(adminMemberOrdersControllerPath, 'utf8');
    for (const requiredSymbol of [
      "from '../auth/public-api'",
      "from '../membership/public-api'",
      '@UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)',
      "@Roles('ADMIN', 'STAFF')",
      "@Controller('admin/members')",
      "@Get(':userStableId/orders')",
      "@Get(':userStableId/top-items')",
      'customerExistence.customerExists',
      "throw new NotFoundException('member not found')",
      "throw new BadRequestException('userStableId is required')",
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Orders-owned Admin member transport is missing ${requiredSymbol}: ${boundary.adminMemberOrdersController}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      '@prisma/client',
      'PrismaService',
      "from '../admin/",
      /\buserId\b/,
    ]) {
      const matched =
        forbiddenSymbol instanceof RegExp
          ? forbiddenSymbol.test(source)
          : source.includes(forbiddenSymbol);
      if (matched) {
        failures.push(
          `Orders-owned Admin member transport must stay stable-ID/owner-boundary only (${forbiddenSymbol}): ${boundary.adminMemberOrdersController}`,
        );
      }
    }
  }

  const adminMemberOrdersReadServicePath = join(
    REPOSITORY_ROOT,
    boundary.adminMemberOrdersReadService,
  );
  if (existsSync(adminMemberOrdersReadServicePath)) {
    const source = readFileSync(adminMemberOrdersReadServicePath, 'utf8');
    for (const requiredSymbol of [
      "from './orders-prisma'",
      'where: { userStableId }',
      "status: { in: ['paid', 'making', 'ready', 'completed'] }",
      "orderBy: { createdAt: 'desc' }",
      'Number.parseInt(limitRaw, 10) || 50',
      'Math.max(1, Math.min(parsedLimit, 50))',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Orders member read model must preserve legacy behavior (${requiredSymbol}): ${boundary.adminMemberOrdersReadService}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      'this.prisma.user',
      'userId:',
      "from '../prisma/",
    ]) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `Orders member read model must query by Order.userStableId without User persistence/DB UUID (${forbiddenSymbol}): ${boundary.adminMemberOrdersReadService}`,
        );
      }
    }
  }

  const adminMembersControllerPath = join(
    REPOSITORY_ROOT,
    boundary.adminMembersController,
  );
  if (existsSync(adminMembersControllerPath)) {
    const source = readFileSync(adminMembersControllerPath, 'utf8');
    for (const forbiddenSymbol of [
      "@Get(':userStableId/orders')",
      "@Get(':userStableId/top-items')",
    ]) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `AdminMembersController must not reclaim Orders-owned member read transport (${forbiddenSymbol}): ${boundary.adminMembersController}`,
        );
      }
    }
  }

  const adminMembersServicePath = join(
    REPOSITORY_ROOT,
    boundary.adminMembersService,
  );
  if (existsSync(adminMembersServicePath)) {
    const source = readFileSync(adminMembersServicePath, 'utf8');
    for (const forbiddenSymbol of [
      'this.prisma.orderItem.findMany',
      'listOrders(',
      'listTopPurchasedItems(',
      "from '../../orders/public-api'",
    ]) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `AdminMembersService must not reclaim Orders member read ownership (${forbiddenSymbol}): ${boundary.adminMembersService}`,
        );
      }
    }
  }

  const ordersServicePath = join(REPOSITORY_ROOT, boundary.ordersService);
  if (existsSync(ordersServicePath)) {
    const source = readFileSync(ordersServicePath, 'utf8');
    for (const requiredSymbol of [
      'userStableId: snapshot.order.userStableId ?? null',
      'userStableId: normalizedUserStableId ?? null',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Orders member creation must dual-write stable identity (${requiredSymbol}): ${boundary.ordersService}`,
        );
      }
    }
  }

  const loyaltyServicePath = join(REPOSITORY_ROOT, boundary.loyaltyService);
  if (existsSync(loyaltyServicePath)) {
    const source = readFileSync(loyaltyServicePath, 'utf8');
    if (
      !/tx\.order\.create\([\s\S]*?userId,[\s\S]*?userStableId: normalizedUserStableId,[\s\S]*?subtotalCents: cents/.test(
        source,
      )
    ) {
      failures.push(
        `Loyalty top-up synthetic Orders must dual-write userStableId: ${boundary.loyaltyService}`,
      );
    }
  }
}

const loyaltyLedgerOrderIdentityBoundary =
  config.loyaltyLedgerOrderIdentityBoundary ?? null;
if (loyaltyLedgerOrderIdentityBoundary) {
  const boundary = Object.fromEntries(
    Object.entries(loyaltyLedgerOrderIdentityBoundary).map(([key, value]) => [
      key,
      toPosix(value ?? ''),
    ]),
  );
  const requiredPaths = [
    boundary.schema,
    boundary.migration,
    boundary.contract,
    boundary.reader,
    boundary.module,
    boundary.publicSurface,
    boundary.loyaltyPrismaBoundary,
    boundary.loyaltyPolicyWriter,
    boundary.loyaltyService,
    boundary.ordersService,
    boundary.adminMembersService,
    boundary.membershipService,
  ];

  for (const sourcePath of requiredPaths) {
    if (!sourcePath || !existsSync(join(REPOSITORY_ROOT, sourcePath))) {
      failures.push(
        `Loyalty ledger order identity boundary file is missing: ${sourcePath || '<missing-path>'}`,
      );
    }
  }

  const schemaPath = join(REPOSITORY_ROOT, boundary.schema);
  if (existsSync(schemaPath)) {
    const source = readFileSync(schemaPath, 'utf8');
    const ledgerModel = source.match(/model LoyaltyLedger \{[\s\S]*?\n\}/)?.[0] ?? '';
    if (
      !/orderId\s+String\?\s+@db\.Uuid/.test(ledgerModel) ||
      !/orderStableId\s+String\?/.test(ledgerModel) ||
      !ledgerModel.includes('@@unique([orderId, type, sourceKey])')
    ) {
      failures.push(
        `LoyaltyLedger must retain nullable internal orderId plus nullable orderStableId while keeping the existing internal idempotency key: ${boundary.schema}`,
      );
    }
    for (const forbiddenSymbol of [
      '@@unique([orderStableId',
      '@@index([orderStableId',
      'orderStableId     String          @unique',
    ]) {
      if (ledgerModel.includes(forbiddenSymbol)) {
        failures.push(
          `Slice 5A must not make LoyaltyLedger.orderStableId unique/indexed (${forbiddenSymbol}): ${boundary.schema}`,
        );
      }
    }
  }

  const migrationPath = join(REPOSITORY_ROOT, boundary.migration);
  if (existsSync(migrationPath)) {
    const source = readFileSync(migrationPath, 'utf8');
    for (const requiredSymbol of [
      'ADD COLUMN "orderStableId" TEXT',
      'SET "orderStableId" = o."orderStableId"',
      'l."orderId" = o."id"',
      'order_linked_ledger_count',
      'populated_stable_id_count',
      'mismatched_stable_id_count',
      'orphan_order_id_count',
      'stable_without_order_id_count',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `LoyaltyLedger orderStableId migration is missing ${requiredSymbol}: ${boundary.migration}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      'ALTER COLUMN "orderStableId" SET NOT NULL',
      'CREATE UNIQUE INDEX',
      'FOREIGN KEY',
      'random()',
      'clock_timestamp()',
      'gen_random_uuid()',
    ]) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `LoyaltyLedger orderStableId migration must stay deterministic/additive/nullable (${forbiddenSymbol}): ${boundary.migration}`,
        );
      }
    }
  }

  const contractPath = join(REPOSITORY_ROOT, boundary.contract);
  if (existsSync(contractPath)) {
    const source = readFileSync(contractPath, 'utf8');
    for (const requiredSymbol of [
      'LOYALTY_LEDGER_READER',
      'LoyaltyLedgerReaderPort',
      'userStableId',
      'ledgerStableId',
      'orderStableId',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Loyalty ledger read contract is missing ${requiredSymbol}: ${boundary.contract}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      '@nestjs/common',
      '@prisma/client',
      'PrismaService',
      /\borderId\b/,
    ]) {
      const matched =
        forbiddenSymbol instanceof RegExp
          ? forbiddenSymbol.test(source)
          : source.includes(forbiddenSymbol);
      if (matched) {
        failures.push(
          `Loyalty ledger public read contract must remain framework/persistence/DB-ID free (${forbiddenSymbol}): ${boundary.contract}`,
        );
      }
    }
  }

  const readerPath = join(REPOSITORY_ROOT, boundary.reader);
  if (existsSync(readerPath)) {
    const source = readFileSync(readerPath, 'utf8');
    for (const requiredSymbol of [
      'implements LoyaltyLedgerReaderPort',
      "from './loyalty-prisma'",
      'loyalty.resolveUserIdByStableId',
      'loyaltyLedger.findMany',
      'orderStableId: true',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Loyalty ledger reader is missing ${requiredSymbol}: ${boundary.reader}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      'prisma.order.',
      'order.findMany',
      'order.findUnique',
      "from '../prisma/",
      /\borderId\s*:\s*true\b/,
    ]) {
      const matched =
        forbiddenSymbol instanceof RegExp
          ? forbiddenSymbol.test(source)
          : source.includes(forbiddenSymbol);
      if (matched) {
        failures.push(
          `Loyalty ledger reader must return its stored stable identity without Orders persistence enrichment (${forbiddenSymbol}): ${boundary.reader}`,
        );
      }
    }
  }

  const loyaltyPrismaBoundaryPath = join(
    REPOSITORY_ROOT,
    boundary.loyaltyPrismaBoundary,
  );
  if (existsSync(loyaltyPrismaBoundaryPath)) {
    const source = readFileSync(loyaltyPrismaBoundaryPath, 'utf8').trim();
    if (source !== "export { PrismaModule, PrismaService } from '../prisma/prisma.module';") {
      failures.push(
        `Loyalty Prisma boundary must stay a composition-only re-export: ${boundary.loyaltyPrismaBoundary}`,
      );
    }
  }

  const loyaltyModulePath = join(REPOSITORY_ROOT, boundary.module);
  if (existsSync(loyaltyModulePath)) {
    const source = readFileSync(loyaltyModulePath, 'utf8');
    for (const requiredSymbol of [
      "from './loyalty-prisma'",
      'LOYALTY_LEDGER_READER',
      'LoyaltyLedgerReadService',
      'useExisting: LoyaltyLedgerReadService',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Loyalty module must expose the owner read capability (${requiredSymbol}): ${boundary.module}`,
        );
      }
    }
    if (source.includes("from '../prisma/")) {
      failures.push(
        `Loyalty module must use its context-local Prisma composition boundary: ${boundary.module}`,
      );
    }
  }

  const loyaltyPolicyWriterPath = join(
    REPOSITORY_ROOT,
    boundary.loyaltyPolicyWriter,
  );
  if (existsSync(loyaltyPolicyWriterPath)) {
    const source = readFileSync(loyaltyPolicyWriterPath, 'utf8');
    if (
      !source.includes("from './loyalty-prisma'") ||
      source.includes("from '../prisma/")
    ) {
      failures.push(
        `Loyalty policy persistence must use the context-local Prisma composition boundary: ${boundary.loyaltyPolicyWriter}`,
      );
    }
  }

  const publicSurfacePath = join(REPOSITORY_ROOT, boundary.publicSurface);
  if (existsSync(publicSurfacePath)) {
    const source = readFileSync(publicSurfacePath, 'utf8');
    if (
      !source.includes('LOYALTY_LEDGER_READER') ||
      !source.includes('LoyaltyLedgerReaderPort')
    ) {
      failures.push(
        `Loyalty public surface must expose the ledger reader contract: ${boundary.publicSurface}`,
      );
    }
  }

  const loyaltyServicePath = join(REPOSITORY_ROOT, boundary.loyaltyService);
  if (existsSync(loyaltyServicePath)) {
    const source = readFileSync(loyaltyServicePath, 'utf8');
    if (source.includes("from '../prisma/")) {
      failures.push(
        `LoyaltyService must use the context-local Prisma composition boundary: ${boundary.loyaltyService}`,
      );
    }
    for (const requiredSymbol of [
      'orderStableId: string;',
      'orderStableId: topupOrder.orderStableId',
      'orderStableId: order.orderStableId',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Loyalty order-linked ledger dual-write is missing ${requiredSymbol}: ${boundary.loyaltyService}`,
        );
      }
    }

    let cursor = 0;
    while (true) {
      const start = source.indexOf('.loyaltyLedger.create({', cursor);
      if (start < 0) break;
      const end = source.indexOf('});', start);
      if (end < 0) {
        failures.push(
          `Unable to inspect LoyaltyLedger create block for stable-order dual-write: ${boundary.loyaltyService}`,
        );
        break;
      }
      const block = source.slice(start, end + 3);
      const hasOrderId = /\borderId\b/.test(block);
      const manualWithoutOrder = /\borderId\s*:\s*null\b/.test(block);
      if (hasOrderId && !manualWithoutOrder && !/\borderStableId\b/.test(block)) {
        failures.push(
          `Every order-linked LoyaltyLedger create must dual-write orderStableId: ${boundary.loyaltyService}`,
        );
        break;
      }
      if (manualWithoutOrder && /\borderStableId\b/.test(block)) {
        failures.push(
          `Manual LoyaltyLedger entries without an order must not fabricate orderStableId: ${boundary.loyaltyService}`,
        );
        break;
      }
      cursor = end + 3;
    }
  }

  const ordersServicePath = join(REPOSITORY_ROOT, boundary.ordersService);
  if (existsSync(ordersServicePath)) {
    const source = readFileSync(ordersServicePath, 'utf8');
    for (const requiredSymbol of [
      'const orderStableId = stableKey ?? generateStableId();',
      'orderStableId: input.orderStableId',
      'orderStableId: order.orderStableId',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Orders must provide stable identity to Loyalty before ledger writes (${requiredSymbol}): ${boundary.ordersService}`,
        );
      }
    }
  }

  for (const adapterPath of [
    boundary.adminMembersService,
    boundary.membershipService,
  ]) {
    const sourcePath = join(REPOSITORY_ROOT, adapterPath);
    if (!existsSync(sourcePath)) continue;
    const source = readFileSync(sourcePath, 'utf8');
    for (const requiredSymbol of [
      'LOYALTY_LEDGER_READER',
      'loyaltyLedgerReader.getLoyaltyLedger',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Loyalty ledger adapter must delegate to the Benefits/Loyalty owner (${requiredSymbol}): ${adapterPath}`,
        );
      }
    }
    for (const forbiddenSymbol of [
      'orderStableById',
      'this.prisma.loyaltyLedger.findMany',
    ]) {
      if (source.includes(forbiddenSymbol)) {
        failures.push(
          `Loyalty ledger adapter must not reclaim persistence/enrichment ownership (${forbiddenSymbol}): ${adapterPath}`,
        );
      }
    }
  }
}

const customerLifecycleNotificationBoundary =
  config.customerLifecycleNotificationBoundary ?? null;
if (customerLifecycleNotificationBoundary) {
  const boundary = Object.fromEntries(
    Object.entries(customerLifecycleNotificationBoundary).map(([key, value]) => [
      key,
      toPosix(value ?? ''),
    ]),
  );
  const requiredPaths = [
    boundary.contract,
    boundary.service,
    boundary.module,
    boundary.publicSurface,
    boundary.authService,
    boundary.authModule,
    boundary.customerService,
    boundary.membershipModule,
  ];

  for (const sourcePath of requiredPaths) {
    if (!sourcePath || !existsSync(join(REPOSITORY_ROOT, sourcePath))) {
      failures.push(
        `Customer lifecycle notification boundary file is missing: ${sourcePath || '<missing-path>'}`,
      );
    }
  }

  const contractPath = join(REPOSITORY_ROOT, boundary.contract);
  if (existsSync(contractPath)) {
    const source = readFileSync(contractPath, 'utf8');
    for (const requiredSymbol of [
      'CUSTOMER_LIFECYCLE_NOTIFICATION',
      'CustomerLifecycleNotificationPort',
      'notifyRegistrationWelcome',
      'notifySubscriptionWelcome',
      'userStableId',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Customer lifecycle notification contract is missing ${requiredSymbol}: ${boundary.contract}`,
        );
      }
    }
    if (
      source.includes('@prisma/client') ||
      source.includes('PrismaService') ||
      source.includes('EmailService') ||
      source.includes('SmsService') ||
      source.includes('NotificationService') ||
      /\buserId\b/.test(source) ||
      source.includes('marketingEmailOptIn')
    ) {
      failures.push(
        `Customer lifecycle notification public contract must remain provider/persistence/DB-ID/consent free: ${boundary.contract}`,
      );
    }
  }

  const servicePath = join(REPOSITORY_ROOT, boundary.service);
  if (existsSync(servicePath)) {
    const source = readFileSync(servicePath, 'utf8');
    for (const requiredSymbol of [
      'implements CouponIssuedNotificationPort, CustomerLifecycleNotificationPort',
      'notifyRegistrationWelcome',
      'notifySubscriptionWelcome',
      'context: `register_welcome:${input.userStableId}`',
      'userStableId: input.userStableId',
      "metadata: { trigger: 'register' }",
      "metadata: { trigger: 'marketing_opt_in' }",
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Messaging customer lifecycle notification owner is missing ${requiredSymbol}: ${boundary.service}`,
        );
      }
    }
    const registrationStart = source.indexOf('async notifyRegistrationWelcome');
    const registrationEnd = source.indexOf('async notifyOrderReady', registrationStart);
    const registrationSource =
      registrationStart >= 0 && registrationEnd > registrationStart
        ? source.slice(registrationStart, registrationEnd)
        : '';
    const subscriptionStart = source.indexOf('async notifySubscriptionWelcome');
    const subscriptionEnd = source.indexOf('async notifyCouponIssued', subscriptionStart);
    const subscriptionSource =
      subscriptionStart >= 0 && subscriptionEnd > subscriptionStart
        ? source.slice(subscriptionStart, subscriptionEnd)
        : '';
    if (
      source.includes('notifyRegisterWelcome') ||
      registrationSource.includes('params.user') ||
      /\buserId\s*:/.test(registrationSource) ||
      subscriptionSource.includes('params.user') ||
      subscriptionSource.includes('marketingEmailOptIn') ||
      /\buserId\s*:/.test(subscriptionSource)
    ) {
      failures.push(
        `Messaging customer lifecycle notification must not regain Prisma User or customer-consent ownership: ${boundary.service}`,
      );
    }
  }

  const modulePath = join(REPOSITORY_ROOT, boundary.module);
  if (existsSync(modulePath)) {
    const source = readFileSync(modulePath, 'utf8');
    if (
      !source.includes('CUSTOMER_LIFECYCLE_NOTIFICATION') ||
      !source.includes('useExisting: NotificationService')
    ) {
      failures.push(
        `NotificationModule must export the customer lifecycle notification capability: ${boundary.module}`,
      );
    }
  }

  const publicSurfacePath = join(REPOSITORY_ROOT, boundary.publicSurface);
  if (existsSync(publicSurfacePath)) {
    const source = readFileSync(publicSurfacePath, 'utf8');
    for (const requiredSymbol of [
      'CUSTOMER_LIFECYCLE_NOTIFICATION',
      'CustomerLifecycleNotificationPort',
      'RegistrationWelcomeNotificationInput',
      'SubscriptionWelcomeNotificationInput',
      'NotificationModule',
    ]) {
      if (!source.includes(requiredSymbol)) {
        failures.push(
          `Notifications public surface is missing ${requiredSymbol}: ${boundary.publicSurface}`,
        );
      }
    }
  }

  const authServicePath = join(REPOSITORY_ROOT, boundary.authService);
  if (existsSync(authServicePath)) {
    const source = readFileSync(authServicePath, 'utf8');
    if (
      !source.includes("from '../notifications/public-api'") ||
      !source.includes('CUSTOMER_LIFECYCLE_NOTIFICATION') ||
      !source.includes('CustomerLifecycleNotificationPort') ||
      !source.includes('notifyRegistrationWelcome') ||
      !source.includes('userStableId: user.userStableId') ||
      source.includes("from '../notifications/notification.service'") ||
      source.includes('NotificationService')
    ) {
      failures.push(
        `Auth registration welcome must use only the customer lifecycle notification public capability: ${boundary.authService}`,
      );
    }
  }

  const authModulePath = join(REPOSITORY_ROOT, boundary.authModule);
  if (existsSync(authModulePath)) {
    const source = readFileSync(authModulePath, 'utf8');
    if (
      !source.includes("from '../notifications/public-api'") ||
      !source.includes('NotificationModule') ||
      source.includes("from '../notifications/notification.module'")
    ) {
      failures.push(
        `AuthModule notification wiring must use only the Notifications public surface: ${boundary.authModule}`,
      );
    }
  }

  const customerServicePath = join(REPOSITORY_ROOT, boundary.customerService);
  if (existsSync(customerServicePath)) {
    const source = readFileSync(customerServicePath, 'utf8');
    if (
      !source.includes("from '../notifications/public-api'") ||
      !source.includes('CUSTOMER_LIFECYCLE_NOTIFICATION') ||
      !source.includes('CustomerLifecycleNotificationPort') ||
      !source.includes('fullUser.email && fullUser.marketingEmailOptIn') ||
      !source.includes('notifySubscriptionWelcome') ||
      !source.includes('userStableId: fullUser.userStableId') ||
      source.includes("from '../notifications/notification.service'") ||
      source.includes('NotificationService')
    ) {
      failures.push(
        `Customer subscription welcome must keep consent Identity-owned and use only the Notifications public capability: ${boundary.customerService}`,
      );
    }
  }

  const membershipModulePath = join(REPOSITORY_ROOT, boundary.membershipModule);
  if (existsSync(membershipModulePath)) {
    const source = readFileSync(membershipModulePath, 'utf8');
    if (
      !source.includes("from '../notifications/public-api'") ||
      !source.includes('NotificationModule') ||
      source.includes("from '../notifications/notification.module'")
    ) {
      failures.push(
        `MembershipModule notification wiring must use only the Notifications public surface: ${boundary.membershipModule}`,
      );
    }
  }
}

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
  const writerImplementation = toPosix(
    brandStoreCanonicalConfigOwnership.writerImplementation ?? '',
  );
  const publicSymbols = brandStoreCanonicalConfigOwnership.publicSymbols ?? [];
  const ownedIdentitySymbols =
    brandStoreCanonicalConfigOwnership.ownedIdentitySymbols ?? [];
  const ownedTemporaryClosureReasonSymbols =
    brandStoreCanonicalConfigOwnership.ownedTemporaryClosureReasonSymbols ?? [];
  const identityImplementation = toPosix(
    brandStoreCanonicalConfigOwnership.identityImplementation ?? '',
  );
  const temporaryClosureReasonImplementation = toPosix(
    brandStoreCanonicalConfigOwnership.temporaryClosureReasonImplementation ?? '',
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
  const canonicalConfigWriterConsumers =
    brandStoreCanonicalConfigOwnership.canonicalConfigWriterConsumers ?? [];
  const legacyWriteOnlyConfigConsumers =
    brandStoreCanonicalConfigOwnership.legacyWriteOnlyConfigConsumers ?? [];
  const migratedConsumerForbiddenSymbols =
    brandStoreCanonicalConfigOwnership.migratedConsumerForbiddenSymbols ?? {};
  const forbiddenLegacyPaths =
    brandStoreCanonicalConfigOwnership.forbiddenLegacyPaths ?? [];
  const legacyPersistenceModel =
    brandStoreCanonicalConfigOwnership.legacyPersistenceModel ?? '';
  const brandStorePrismaSchema = toPosix(
    brandStoreCanonicalConfigOwnership.prismaSchema ?? '',
  );
  const brandStoreContractionMigration = toPosix(
    brandStoreCanonicalConfigOwnership.contractionMigration ?? '',
  );
  const authenticatedPosStoreContext =
    brandStoreCanonicalConfigOwnership.authenticatedPosStoreContext ?? null;
  const posStoreContextApiAdapter = toPosix(
    authenticatedPosStoreContext?.apiAdapter ?? '',
  );
  const posExchangeRateApiAdapter = toPosix(
    authenticatedPosStoreContext?.exchangeRateApiAdapter ?? '',
  );
  const posExchangeRateService = toPosix(
    authenticatedPosStoreContext?.exchangeRateService ?? '',
  );
  const posOrdersApiAdapter = toPosix(
    authenticatedPosStoreContext?.ordersApiAdapter ?? '',
  );
  const scheduledPosOrdersApiAdapter = toPosix(
    authenticatedPosStoreContext?.scheduledOrdersApiAdapter ?? '',
  );
  const retiredOrdersCompatibilityTransportFiles = (
    authenticatedPosStoreContext?.retiredOrdersCompatibilityTransportFiles ?? []
  ).map(toPosix);
  const ordersTransportController = toPosix(
    authenticatedPosStoreContext?.ordersController ?? '',
  );
  const ordersTransportModule = toPosix(
    authenticatedPosStoreContext?.ordersModule ?? '',
  );
  const ordersTransportPublicApi = toPosix(
    authenticatedPosStoreContext?.ordersPublicApi ?? '',
  );
  const ordersStoreScopeService = toPosix(
    authenticatedPosStoreContext?.ordersStoreScopeService ?? '',
  );
  const ordersSchedulingQuery = toPosix(
    authenticatedPosStoreContext?.ordersSchedulingQuery ?? '',
  );
  const ordersPreparation = toPosix(
    authenticatedPosStoreContext?.ordersPreparation ?? '',
  );
  const ordersFulfillmentProcessor = toPosix(
    authenticatedPosStoreContext?.ordersFulfillmentProcessor ?? '',
  );
  const posPrintDispatchListener = toPosix(
    authenticatedPosStoreContext?.posPrintDispatchListener ?? '',
  );
  const posStoreContextCompositionModule = toPosix(
    authenticatedPosStoreContext?.compositionModule ?? '',
  );
  const posStoreContextWebApiClient = toPosix(
    authenticatedPosStoreContext?.webApiClient ?? '',
  );
  const posStoreContextWebConsumers =
    authenticatedPosStoreContext?.webConsumers ?? [];
  const adminExplicitStoreContext =
    brandStoreCanonicalConfigOwnership.adminExplicitStoreContext ?? null;
  const adminStoreContextApiAdapter = toPosix(
    adminExplicitStoreContext?.apiAdapter ?? '',
  );
  const adminStoreContextService = toPosix(
    adminExplicitStoreContext?.service ?? '',
  );
  const adminStoreContextWebApiClient = toPosix(
    adminExplicitStoreContext?.webApiClient ?? '',
  );
  const adminStoreContextWebSelector = toPosix(
    adminExplicitStoreContext?.webSelector ?? '',
  );
  const adminStoreContextWebSettings = toPosix(
    adminExplicitStoreContext?.webStoreSettings ?? '',
  );
  const retiredAdminCompatibilityTransportFiles = (
    adminExplicitStoreContext?.retiredCompatibilityTransportFiles ?? []
  ).map(toPosix);

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
  if (!writerImplementation || contextOf(writerImplementation) !== ownerContext) {
    failures.push(
      `Brand/Store canonical config writer must belong to ${ownerContext}: ${writerImplementation || '<missing>'}`,
    );
  } else if (!existsSync(join(REPOSITORY_ROOT, writerImplementation))) {
    failures.push(
      `Brand/Store canonical config writer missing: ${writerImplementation}`,
    );
  }
  for (const internalPath of [
    identityImplementation,
    temporaryClosureReasonImplementation,
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

  const temporaryClosureReasonImplementationPath = join(
    REPOSITORY_ROOT,
    temporaryClosureReasonImplementation,
  );
  if (
    !temporaryClosureReasonImplementation ||
    !existsSync(temporaryClosureReasonImplementationPath)
  ) {
    failures.push(
      `temporary-closure reason implementation missing: ${temporaryClosureReasonImplementation || '<missing>'}`,
    );
  } else {
    const temporaryClosureReasonSource = readFileSync(
      temporaryClosureReasonImplementationPath,
      'utf8',
    );
    for (const symbol of ownedTemporaryClosureReasonSymbols) {
      if (!declaresSymbol(temporaryClosureReasonSource, symbol)) {
        failures.push(
          `temporary-closure reason implementation missing symbol: ${temporaryClosureReasonImplementation} -> ${symbol}`,
        );
      }
    }
  }

  for (const absolutePath of sourceFiles) {
    const sourcePath = repositoryPath(absolutePath);
    if (sourcePath === temporaryClosureReasonImplementation) continue;
    const source = readFileSync(absolutePath, 'utf8');
    for (const symbol of ownedTemporaryClosureReasonSymbols) {
      if (declaresSymbol(source, symbol)) {
        failures.push(
          `temporary-closure reason codec must have one Brand/Store implementation owner: ${sourcePath} -> ${symbol}`,
        );
      }
    }
  }

  if (writerImplementation && existsSync(join(REPOSITORY_ROOT, writerImplementation))) {
    const writerSource = readFileSync(
      join(REPOSITORY_ROOT, writerImplementation),
      'utf8',
    );
    if (
      !/\.\$transaction\s*\(/.test(writerSource) ||
      !/tx\.brandConfig\.update\s*\(/.test(writerSource) ||
      !/tx\.storeConfig\.update\s*\(/.test(writerSource) ||
      !/tx\.storeConfig\.updateMany\s*\(/.test(writerSource) ||
      !writerSource.includes('updateBrandConfig') ||
      !writerSource.includes('updateStoreConfig') ||
      /async\s+updateConfig\s*\(/.test(writerSource) ||
      !writerSource.includes('resumeTemporaryClosureIfMatches')
    ) {
      failures.push(
        `Brand/Store writer must expose separate Brand writes and explicit storeStableId-scoped Store writes while preserving temporary-closure compare-and-set semantics: ${writerImplementation}`,
      );
    }
  }

  if (contractImplementation && existsSync(join(REPOSITORY_ROOT, contractImplementation))) {
    const contractSource = readFileSync(
      join(REPOSITORY_ROOT, contractImplementation),
      'utf8',
    );
    if (
      !contractSource.includes(
        'getConfiguredStoreSnapshot(): Promise<StoreConfigSnapshot>',
      ) ||
      /getSnapshot\s*\(\s*\)\s*:\s*Promise<BrandStoreConfigSnapshot>/.test(
        contractSource,
      ) ||
      !contractSource.includes('updateBrandConfig(input: BrandConfigUpdateInput)') ||
      !/updateStoreConfig\(\s*storeStableId:\s*string,\s*input:\s*StoreConfigUpdateInput,?\s*\)/.test(
        contractSource,
      ) ||
      /updateConfig\s*\([\s\S]{0,160}storeStableId\?:\s*string/.test(contractSource)
    ) {
      failures.push(
        `Brand/Store config contract must name configured-store reads explicitly and must not allow implicit Store identity on writes: ${contractImplementation}`,
      );
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
            `Application runtime must not use legacy Brand/Store Prisma delegate: ${sourcePath} -> ${delegate}`,
          );
        }
      }
    }
  }

  const brandStorePrismaSchemaPath = join(
    REPOSITORY_ROOT,
    brandStorePrismaSchema,
  );
  if (!legacyPersistenceModel || !brandStorePrismaSchema) {
    failures.push(
      'Brand/Store legacy persistence contraction metadata is incomplete',
    );
  } else if (!existsSync(brandStorePrismaSchemaPath)) {
    failures.push(
      `Brand/Store Prisma schema missing: ${brandStorePrismaSchema}`,
    );
  } else {
    const schemaSource = readFileSync(brandStorePrismaSchemaPath, 'utf8');
    const legacyModelPattern = new RegExp(
      `\\bmodel\\s+${escapeRegExp(legacyPersistenceModel)}\\s*\\{`,
    );
    if (legacyModelPattern.test(schemaSource)) {
      failures.push(
        `Brand/Store legacy persistence model must not return after contraction: ${brandStorePrismaSchema} -> ${legacyPersistenceModel}`,
      );
    }
  }

  const brandStoreContractionMigrationPath = join(
    REPOSITORY_ROOT,
    brandStoreContractionMigration,
  );
  if (!brandStoreContractionMigration) {
    failures.push(
      'Brand/Store legacy persistence contraction migration is not registered',
    );
  } else if (!existsSync(brandStoreContractionMigrationPath)) {
    failures.push(
      `Brand/Store legacy persistence contraction migration missing: ${brandStoreContractionMigration}`,
    );
  } else {
    const migrationSource = readFileSync(
      brandStoreContractionMigrationPath,
      'utf8',
    );
    const triggerDrop =
      'DROP TRIGGER "BusinessConfig_sync_canonical_config" ON "BusinessConfig";';
    const functionDrop =
      'DROP FUNCTION "syncBusinessConfigToCanonicalConfig"();';
    const tableDrop = 'DROP TABLE "BusinessConfig";';
    const triggerDropIndex = migrationSource.indexOf(triggerDrop);
    const functionDropIndex = migrationSource.indexOf(functionDrop);
    const tableDropIndex = migrationSource.indexOf(tableDrop);

    if (
      !migrationSource.includes('BEGIN;') ||
      !migrationSource.includes('COMMIT;') ||
      !migrationSource.includes(
        'Brand/Store BusinessConfig contraction blocked: persistence drift detected in fields:',
      ) ||
      !migrationSource.includes('unexpected foreign-key dependencies found') ||
      !migrationSource.includes('dependent views/materialized views found') ||
      !migrationSource.includes(
        'Brand/Store BusinessConfig contraction incomplete: BusinessConfig table still exists',
      )
    ) {
      failures.push(
        `Brand/Store BusinessConfig contraction migration must be atomic, fail closed on parity/dependencies, and verify postconditions: ${brandStoreContractionMigration}`,
      );
    }
    if (
      /DROP\s+(?:TRIGGER|FUNCTION|TABLE)[^;]*\bCASCADE\b/i.test(
        migrationSource,
      )
    ) {
      failures.push(
        `Brand/Store BusinessConfig contraction migration must not use CASCADE: ${brandStoreContractionMigration}`,
      );
    }
    if (
      triggerDropIndex < 0 ||
      functionDropIndex <= triggerDropIndex ||
      tableDropIndex <= functionDropIndex
    ) {
      failures.push(
        `Brand/Store BusinessConfig contraction must drop trigger, then function, then table: ${brandStoreContractionMigration}`,
      );
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

  for (const consumer of canonicalConfigWriterConsumers) {
    const consumerPath = toPosix(consumer);
    const absoluteConsumerPath = join(REPOSITORY_ROOT, consumerPath);
    if (!existsSync(absoluteConsumerPath)) {
      failures.push(
        `Brand/Store canonical writer consumer missing: ${consumerPath}`,
      );
      continue;
    }
    const source = readFileSync(absoluteConsumerPath, 'utf8');
    if (!source.includes('BRAND_STORE_CONFIG_WRITER')) {
      failures.push(
        `Brand/Store canonical writer consumer must use the public writer boundary: ${consumerPath}`,
      );
    }
    if (/\.\s*(?:businessConfig|brandConfig|storeConfig)\b/.test(source)) {
      failures.push(
        `Brand/Store canonical writer consumer must not write configuration through Prisma delegates: ${consumerPath}`,
      );
    }
  }

  for (const consumer of legacyWriteOnlyConfigConsumers) {
    const consumerPath = toPosix(consumer);
    const absoluteConsumerPath = join(REPOSITORY_ROOT, consumerPath);
    if (!existsSync(absoluteConsumerPath)) {
      failures.push(
        `Brand/Store legacy-write-only consumer missing: ${consumerPath}`,
      );
      continue;
    }
    const source = readFileSync(absoluteConsumerPath, 'utf8');
    const legacyMethods = [
      ...source.matchAll(
        /\.\s*businessConfig\s*\.\s*([A-Za-z][A-Za-z0-9_]*)/g,
      ),
    ].map((match) => match[1]);
    for (const method of legacyMethods) {
      if (method === 'update' || method === 'updateMany') continue;
      failures.push(
        `Brand/Store read-cutover consumer may keep only compatibility writes to BusinessConfig: ${consumerPath} -> ${method}`,
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
    if (!importsPublicSurface || !source.includes('BRAND_STORE_CONFIG_READER')) {
      failures.push(
        `Brand/Store read-cutover consumer must use ${publicSurface}: ${consumerPath}`,
      );
    }
  }

  if (authenticatedPosStoreContext) {
    for (const boundaryPath of [
      posStoreContextApiAdapter,
      posExchangeRateApiAdapter,
      posExchangeRateService,
      posOrdersApiAdapter,
      scheduledPosOrdersApiAdapter,
      ordersTransportController,
      ordersTransportModule,
      ordersTransportPublicApi,
      ordersStoreScopeService,
      ordersSchedulingQuery,
      ordersPreparation,
      ordersFulfillmentProcessor,
      posPrintDispatchListener,
      posStoreContextCompositionModule,
      posStoreContextWebApiClient,
    ]) {
      if (!boundaryPath || !existsSync(join(REPOSITORY_ROOT, boundaryPath))) {
        failures.push(
          `authenticated POS store context boundary path missing: ${boundaryPath || '<missing>'}`,
        );
      }
    }

    const posStoreContextApiPath = join(
      REPOSITORY_ROOT,
      posStoreContextApiAdapter,
    );
    if (posStoreContextApiAdapter && existsSync(posStoreContextApiPath)) {
      const source = readFileSync(posStoreContextApiPath, 'utf8');
      if (
        !source.includes("@Controller('pos/store-context')") ||
        !source.includes('SessionAuthGuard') ||
        !source.includes('RolesGuard') ||
        !source.includes("@Roles('ADMIN', 'STAFF')") ||
        !source.includes('PosDeviceGuard') ||
        !source.includes('AuthenticatedPosIdentity') ||
        !source.includes('BRAND_STORE_CONFIG_READER') ||
        !/getStoreSnapshot\s*\(\s*storeStableId\s*,?\s*\)/.test(source) ||
        source.includes('resolveConfiguredStoreStableId')
      ) {
        failures.push(
          `authenticated POS store context must derive storeStableId from PosDeviceGuard identity and read Brand/Store through its public boundary: ${posStoreContextApiAdapter}`,
        );
      }
    }

    const posExchangeRateApiPath = join(
      REPOSITORY_ROOT,
      posExchangeRateApiAdapter,
    );
    if (posExchangeRateApiAdapter && existsSync(posExchangeRateApiPath)) {
      const source = readFileSync(posExchangeRateApiPath, 'utf8');
      if (
        !source.includes("@Controller('pos/exchange-rate')") ||
        !source.includes('PosDeviceGuard') ||
        !source.includes('AuthenticatedPosIdentity') ||
        !source.includes('requireStoreStableId(req)') ||
        !source.includes('quoteCadToCny(')
      ) {
        failures.push(
          `POS exchange-rate transport must derive storeStableId from authenticated PosDeviceGuard identity: ${posExchangeRateApiAdapter}`,
        );
      }
    }

    const posExchangeRateServicePath = join(
      REPOSITORY_ROOT,
      posExchangeRateService,
    );
    if (posExchangeRateService && existsSync(posExchangeRateServicePath)) {
      const source = readFileSync(posExchangeRateServicePath, 'utf8');
      if (
        !source.includes('getStoreSnapshot(storeStableId)') ||
        !source.includes('getBrandSnapshot()') ||
        source.includes('brandStoreConfigReader.getSnapshot()') ||
        source.includes('resolveConfiguredStoreStableId')
      ) {
        failures.push(
          `POS exchange-rate service must use explicit Store timezone plus Brand-owned fallback rate without implicit store resolution: ${posExchangeRateService}`,
        );
      }
    }

    const posOrdersApiPath = join(REPOSITORY_ROOT, posOrdersApiAdapter);
    if (posOrdersApiAdapter && existsSync(posOrdersApiPath)) {
      const source = readFileSync(posOrdersApiPath, 'utf8');
      if (
        !source.includes("@Controller('pos/orders')") ||
        !source.includes('PosDeviceGuard') ||
        !source.includes('AuthenticatedPosIdentity') ||
        !source.includes('requireStoreStableId') ||
        !source.includes('POS_ORDER_OPERATIONS') ||
        !source.includes("from '../orders/public-api'") ||
        !source.includes(
          'createForStore(dto, this.requireStoreStableId(req))',
        ) ||
        !source.includes(
          'this.orders.recent(this.requireStoreStableId(req), limit)',
        ) ||
        !source.includes('this.orders.board(storeStableId, {') ||
        !source.includes('getByStableIdForStore') ||
        !source.includes('updateStatusForStore') ||
        source.includes("from '../orders/orders.service'") ||
        source.includes("from '../orders/order-scheduling-query.service'") ||
        source.includes("from '../orders/dto/order.dto'") ||
        source.includes("from '../orders/order-status'") ||
        source.includes('this.orders.getByStableId(orderStableId)')
      ) {
        failures.push(
          `canonical POS Orders API must derive storeStableId from PosDeviceGuard identity and use store-scoped Orders operations: ${posOrdersApiAdapter}`,
        );
      }
    }

    const scheduledPosOrdersApiPath = join(
      REPOSITORY_ROOT,
      scheduledPosOrdersApiAdapter,
    );
    if (scheduledPosOrdersApiAdapter && existsSync(scheduledPosOrdersApiPath)) {
      const source = readFileSync(scheduledPosOrdersApiPath, 'utf8');
      if (
        !source.includes('PosDeviceGuard') ||
        !source.includes('AuthenticatedPosIdentity') ||
        !source.includes('requireStoreStableId') ||
        !source.includes("@Get('scheduled')") ||
        !source.includes("@Get(':orderStableId/fulfillment-timing')") ||
        !source.includes("@Post(':orderStableId/preparation/start')") ||
        !source.includes('listUpcomingScheduledForStore') ||
        !source.includes('getFulfillmentTimingForStore') ||
        !source.includes('activateScheduledPreparation') ||
        !source.includes('POS_ORDER_OPERATIONS')
      ) {
        failures.push(
          `scheduled POS Orders routes must be POS-owned and carry authenticated storeStableId through the Orders public API: ${scheduledPosOrdersApiAdapter}`,
        );
      }
    }

    const ordersTransportControllerPath = join(
      REPOSITORY_ROOT,
      ordersTransportController,
    );
    if (
      ordersTransportController &&
      existsSync(ordersTransportControllerPath)
    ) {
      const source = readFileSync(ordersTransportControllerPath, 'utf8');
      if (
        source.includes('PosDeviceGuard') ||
        source.includes('AuthenticatedPosIdentity') ||
        source.includes("from '../pos/") ||
        source.includes("@Get('recent')") ||
        source.includes("@Get('board')") ||
        source.includes("@Patch(':orderStableId/status')") ||
        source.includes("@Post(':orderStableId/amendments')") ||
        source.includes("@Post(':orderStableId/advance')") ||
        source.includes("@Get('scheduled')") ||
        source.includes("@Get(':orderStableId/fulfillment-timing')") ||
        source.includes("@Post(':orderStableId/preparation/start')")
      ) {
        failures.push(
          `Orders transport must not own POS routes or depend on POS authentication transport: ${ordersTransportController}`,
        );
      }
    }

    const ordersTransportModulePath = join(
      REPOSITORY_ROOT,
      ordersTransportModule,
    );
    if (ordersTransportModule && existsSync(ordersTransportModulePath)) {
      const source = readFileSync(ordersTransportModulePath, 'utf8');
      if (
        source.includes('PosDeviceModule') ||
        source.includes("from '../pos/") ||
        !source.includes('POS_ORDER_OPERATIONS') ||
        !/controllers:\s*\[[^\]]*\bOrdersController\b/s.test(source)
      ) {
        failures.push(
          `Orders module must own OrdersController and expose POS operations through its public boundary without importing POS transport: ${ordersTransportModule}`,
        );
      }
    }

    for (const retiredPath of retiredOrdersCompatibilityTransportFiles) {
      if (existsSync(join(REPOSITORY_ROOT, retiredPath))) {
        failures.push(
          `retired POS /orders/* compatibility transport must stay deleted: ${retiredPath}`,
        );
      }
    }

    for (const absolutePath of sourceFiles) {
      const sourcePath = repositoryPath(absolutePath);
      if (!sourcePath.startsWith('apps/api/src/')) continue;
      if (sourcePath === ordersTransportController) continue;
      const source = readFileSync(absolutePath, 'utf8');
      if (/@Controller\((['"])orders\1\)/.test(source)) {
        failures.push(
          `POS-specific /orders/* compatibility transport must not be restored outside OrdersController: ${sourcePath}`,
        );
      }
    }

    const ordersTransportPublicApiPath = join(
      REPOSITORY_ROOT,
      ordersTransportPublicApi,
    );
    if (
      ordersTransportPublicApi &&
      existsSync(ordersTransportPublicApiPath) &&
      !readFileSync(ordersTransportPublicApiPath, 'utf8').includes(
        'POS_ORDER_OPERATIONS',
      )
    ) {
      failures.push(
        `Orders public API must expose POS_ORDER_OPERATIONS: ${ordersTransportPublicApi}`,
      );
    }

    const ordersStoreScopePath = join(
      REPOSITORY_ROOT,
      ordersStoreScopeService,
    );
    if (ordersStoreScopeService && existsSync(ordersStoreScopePath)) {
      const source = readFileSync(ordersStoreScopePath, 'utf8');
      if (
        source.includes('storeId: null') ||
        source.includes('@compat brand-store.default-store-identity.v1')
      ) {
        failures.push(
          `Orders store-scoped queries must not reintroduce historical NULL-store compatibility: ${ordersStoreScopeService}`,
        );
      }
    }

    const ordersSchedulingQueryPath = join(
      REPOSITORY_ROOT,
      ordersSchedulingQuery,
    );
    if (ordersSchedulingQuery && existsSync(ordersSchedulingQueryPath)) {
      const source = readFileSync(ordersSchedulingQueryPath, 'utf8');
      if (
        source.includes('storeId: null') ||
        source.includes('resolveConfiguredStoreStableId') ||
        source.includes('@compat brand-store.default-store-identity.v1')
      ) {
        failures.push(
          `Orders scheduled queries must require the explicit storeStableId without historical NULL-store fallback: ${ordersSchedulingQuery}`,
        );
      }
    }

    const ordersPreparationPath = join(
      REPOSITORY_ROOT,
      ordersPreparation,
    );
    if (ordersPreparation && existsSync(ordersPreparationPath)) {
      const source = readFileSync(ordersPreparationPath, 'utf8');
      if (
        source.includes('allowLegacyNullStore') ||
        source.includes('resolveConfiguredStoreStableId') ||
        source.includes('"storeId" IS NULL')
      ) {
        failures.push(
          `Orders preparation must match the explicit storeStableId and must not activate historical NULL-store rows: ${ordersPreparation}`,
        );
      }
    }

    const ordersFulfillmentPath = join(
      REPOSITORY_ROOT,
      ordersFulfillmentProcessor,
    );
    if (ordersFulfillmentProcessor && existsSync(ordersFulfillmentPath)) {
      const source = readFileSync(ordersFulfillmentPath, 'utf8');
      if (
        source.includes('PosGateway') ||
        source.includes("from '../../pos/pos.gateway'") ||
        !source.includes('POS_PRINT_JOB_DISPATCH_REQUESTED')
      ) {
        failures.push(
          `Orders fulfillment must request POS print dispatch through the Orders-owned event boundary instead of importing PosGateway: ${ordersFulfillmentProcessor}`,
        );
      }
      if (
        source.includes('resolveConfiguredStoreStableId') ||
        source.includes('reprint_legacy_store_fallback') ||
        source.includes('process.env.STORE_ID') ||
        /order\.storeId\s*\?\?/.test(source)
      ) {
        failures.push(
          `Orders fulfillment must fail closed when canonical order.storeId is missing instead of guessing the configured/default store: ${ordersFulfillmentProcessor}`,
        );
      }
    }

    const posPrintDispatchPath = join(
      REPOSITORY_ROOT,
      posPrintDispatchListener,
    );
    if (posPrintDispatchListener && existsSync(posPrintDispatchPath)) {
      const source = readFileSync(posPrintDispatchPath, 'utf8');
      if (
        !source.includes("from '../orders/public-api'") ||
        !source.includes('POS_PRINT_JOB_DISPATCH_REQUESTED') ||
        !source.includes('this.posGateway.sendPrintJob(request)')
      ) {
        failures.push(
          `POS must own the print-job transport listener behind the Orders dispatch event boundary: ${posPrintDispatchListener}`,
        );
      }
    }

    const posStoreContextModulePath = join(
      REPOSITORY_ROOT,
      posStoreContextCompositionModule,
    );
    if (
      posStoreContextCompositionModule &&
      existsSync(posStoreContextModulePath) &&
      !readFileSync(posStoreContextModulePath, 'utf8').includes(
        'PosStoreContextController',
      )
    ) {
      failures.push(
        `authenticated POS store context controller must be mounted in the POS composition module: ${posStoreContextCompositionModule}`,
      );
    }

    const posStoreContextWebApiPath = join(
      REPOSITORY_ROOT,
      posStoreContextWebApiClient,
    );
    if (posStoreContextWebApiClient && existsSync(posStoreContextWebApiPath)) {
      const source = readFileSync(posStoreContextWebApiPath, 'utf8');
      if (
        !source.includes('fetchPosStoreContext') ||
        !source.includes('/pos/store-context') ||
        source.includes('fetchStaffStoreConfig')
      ) {
        failures.push(
          `POS Web adapter must expose the authenticated /pos/store-context contract without falling back to staff Store config: ${posStoreContextWebApiClient}`,
        );
      }
    }

    for (const consumer of posStoreContextWebConsumers) {
      const consumerPath = toPosix(consumer);
      const absoluteConsumerPath = join(REPOSITORY_ROOT, consumerPath);
      if (!existsSync(absoluteConsumerPath)) {
        failures.push(
          `authenticated POS store context Web consumer missing: ${consumerPath}`,
        );
        continue;
      }
      const source = readFileSync(absoluteConsumerPath, 'utf8');
      if (
        !source.includes('fetchPosStoreContext') ||
        source.includes('fetchStaffStoreConfig') ||
        source.includes('@/lib/api/brand-store')
      ) {
        failures.push(
          `POS Web consumer must use authenticated POS store context instead of implicit /staff/store config: ${consumerPath}`,
        );
      }
    }
  }

  if (adminExplicitStoreContext) {
    for (const boundaryPath of [
      adminStoreContextApiAdapter,
      adminStoreContextService,
      adminStoreContextWebApiClient,
      adminStoreContextWebSelector,
      adminStoreContextWebSettings,
    ]) {
      if (!boundaryPath || !existsSync(join(REPOSITORY_ROOT, boundaryPath))) {
        failures.push(
          `Admin explicit Store context boundary path missing: ${boundaryPath || '<missing>'}`,
        );
      }
    }

    const webApiPath = join(REPOSITORY_ROOT, adminStoreContextWebApiClient);
    if (adminStoreContextWebApiClient && existsSync(webApiPath)) {
      const source = readFileSync(webApiPath, 'utf8');
      if (
        source.includes('/staff/store/') ||
        source.includes('storeStableId?: string') ||
        !source.includes('staffStorePath(storeStableId: string') ||
        !source.includes('/staff/stores/${encodeURIComponent(storeStableId)}/${suffix}')
      ) {
        failures.push(
          `canonical Admin Store Web API must require explicit storeStableId and must not fall back to /staff/store/*: ${adminStoreContextWebApiClient}`,
        );
      }
    }

    const selectorPath = join(REPOSITORY_ROOT, adminStoreContextWebSelector);
    if (adminStoreContextWebSelector && existsSync(selectorPath)) {
      const source = readFileSync(selectorPath, 'utf8');
      if (
        !source.includes('fetchStaffStores') ||
        source.includes('fetchStaffStoreConfig') ||
        source.includes('configuredStoreStableId') ||
        !source.includes("nextParams.set('store', selectedStoreStableId)") ||
        !source.includes("return stores[0]?.storeStableId ?? ''")
      ) {
        failures.push(
          `Admin Store selector must establish explicit ?store= context from the Store directory without reading implicit Store config: ${adminStoreContextWebSelector}`,
        );
      }
    }

    const settingsPath = join(REPOSITORY_ROOT, adminStoreContextWebSettings);
    if (adminStoreContextWebSettings && existsSync(settingsPath)) {
      const source = readFileSync(settingsPath, 'utf8');
      if (
        source.includes("searchParams.get('store')?.trim() || undefined") ||
        !source.includes('if (!requestedStoreStableId)') ||
        !source.includes('fetchStaffStoreConfig(requestedStoreStableId)') ||
        !source.includes('fetchStaffStoreHours(requestedStoreStableId)') ||
        !source.includes('fetchStaffStoreHolidays(requestedStoreStableId)')
      ) {
        failures.push(
          `Admin Store settings must wait for explicit ?store= identity before loading Store config, hours, or holidays: ${adminStoreContextWebSettings}`,
        );
      }
    }

    const servicePath = join(REPOSITORY_ROOT, adminStoreContextService);
    if (adminStoreContextService && existsSync(servicePath)) {
      const source = readFileSync(servicePath, 'utf8');
      const requiredSignatures = [
        'getStoreConfig(storeStableId: string)',
        'storeStableId: string,\n  ): Promise<StoreConfigSnapshot>',
        'getStoreHours(storeStableId: string)',
        'storeStableId: string,\n  ): Promise<StoreBusinessHour[]>',
        'getStoreHolidays(storeStableId: string)',
        'storeStableId: string,\n  ): Promise<StoreHoliday[]>',
      ];
      if (
        source.includes('storeStableId?: string') ||
        requiredSignatures.some((signature) => !source.includes(signature))
      ) {
        failures.push(
          `canonical Admin Business Store methods must require explicit storeStableId: ${adminStoreContextService}`,
        );
      }
    }

    const apiPath = join(REPOSITORY_ROOT, adminStoreContextApiAdapter);
    if (adminStoreContextApiAdapter && existsSync(apiPath)) {
      const source = readFileSync(apiPath, 'utf8');
      const forbiddenSingularStoreRoutes = [
        "@Get('store/config')",
        "@Patch('store/config')",
        "@Get('store/hours')",
        "@Put('store/hours')",
        "@Get('store/holidays')",
        "@Put('store/holidays')",
      ];
      const requiredCanonicalStoreRoutes = [
        "@Get('stores/:storeStableId/config')",
        "@Patch('stores/:storeStableId/config')",
        "@Get('stores/:storeStableId/hours')",
        "@Put('stores/:storeStableId/hours')",
        "@Get('stores/:storeStableId/holidays')",
        "@Put('stores/:storeStableId/holidays')",
      ];
      if (
        source.includes('resolveConfiguredStoreStableId') ||
        source.includes('@compat brand-store.default-store-identity.v1') ||
        forbiddenSingularStoreRoutes.some((route) => source.includes(route)) ||
        requiredCanonicalStoreRoutes.some((route) => !source.includes(route))
      ) {
        failures.push(
          `Admin Store transport must expose only explicit storeStableId-scoped config/hours/holidays routes and must not restore /staff/store/* fallback: ${adminStoreContextApiAdapter}`,
        );
      }
    }

    for (const retiredPath of retiredAdminCompatibilityTransportFiles) {
      if (existsSync(join(REPOSITORY_ROOT, retiredPath))) {
        failures.push(
          `retired Admin Business compatibility transport must stay deleted: ${retiredPath}`,
        );
      }
    }

    for (const absolutePath of sourceFiles) {
      const sourcePath = repositoryPath(absolutePath);
      if (!sourcePath.startsWith('apps/api/src/')) continue;
      const source = readFileSync(absolutePath, 'utf8');
      if (/@Controller\((['"])admin\/business\1\)/.test(source)) {
        failures.push(
          `Admin must not restore the retired /admin/business/* compatibility transport: ${sourcePath}`,
        );
      }
    }
  }

  const privateTargets = new Set(
    [
      implementation,
      writerImplementation,
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
  const ordersPolicyConsumer = toPosix(
    benefitsLoyaltyPolicyOwnership.ordersPolicyConsumer,
  );
  const ordersCompositionModule = toPosix(
    benefitsLoyaltyPolicyOwnership.ordersCompositionModule,
  );
  const ordersRedemptionPolicy = toPosix(
    benefitsLoyaltyPolicyOwnership.ordersRedemptionPolicy,
  );
  const ordersRedemptionCharacterization = toPosix(
    benefitsLoyaltyPolicyOwnership.ordersRedemptionCharacterization,
  );
  const publicSymbols = benefitsLoyaltyPolicyOwnership.publicSymbols ?? [];
  const dedicatedStorageDelegate =
    benefitsLoyaltyPolicyOwnership.dedicatedStorageDelegate;
  const transitionalStorageDelegate =
    benefitsLoyaltyPolicyOwnership.transitionalStorageDelegate;
  const legacyStorageDelegate = benefitsLoyaltyPolicyOwnership.legacyStorageDelegate;
  const implementationForbiddenSymbols =
    benefitsLoyaltyPolicyOwnership.implementationForbiddenSymbols ?? [];
  const migratedLegacyConsumers =
    benefitsLoyaltyPolicyOwnership.migratedLegacyConsumers ?? [];
  const forbiddenBrandStoreContractFields =
    benefitsLoyaltyPolicyOwnership.forbiddenBrandStoreContractFields ?? [];
  const legacyAdminBusinessPolicyRoutes =
    benefitsLoyaltyPolicyOwnership.legacyAdminBusinessPolicyRoutes ?? [];
  const retiredAdminBusinessController = toPosix(
    benefitsLoyaltyPolicyOwnership.retiredAdminBusinessController,
  );
  const contractedAdminBusinessService = toPosix(
    benefitsLoyaltyPolicyOwnership.contractedAdminBusinessService,
  );
  const prismaSchema = toPosix(benefitsLoyaltyPolicyOwnership.prismaSchema);
  const contractionMigration = toPosix(
    benefitsLoyaltyPolicyOwnership.contractionMigration,
  );
  const allowedBusinessConfigPolicyFiles = new Set(
    (benefitsLoyaltyPolicyOwnership.allowedBusinessConfigPolicyFiles ?? []).map(
      toPosix,
    ),
  );
  const loyaltyPersistenceCompatId = 'benefits.business-config-loyalty-policy.v1';
  const activeLoyaltyPersistenceCompat = (registry.active ?? []).find(
    (entry) => entry.compat_id === loyaltyPersistenceCompatId,
  );
  const closedLoyaltyPersistenceCompat = (registry.closed ?? []).find(
    (entry) => entry.compat_id === loyaltyPersistenceCompatId,
  );
  if (
    activeLoyaltyPersistenceCompat ||
    closedLoyaltyPersistenceCompat?.status !== 'closed'
  ) {
    failures.push(
      `Benefits Loyalty persistence contraction must keep ${loyaltyPersistenceCompatId} closed after Phase D production verification`,
    );
  }

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
    const dedicatedDelegatePattern = new RegExp(
      `\\.\\s*${escapeRegExp(dedicatedStorageDelegate)}\\b`,
    );
    if (!dedicatedDelegatePattern.test(source)) {
      failures.push(
        `Benefits loyalty policy reader must use dedicated ${dedicatedStorageDelegate} storage: ${implementation}`,
      );
    }
    const transitionalDelegatePattern = new RegExp(
      `\\.\\s*${escapeRegExp(transitionalStorageDelegate)}\\b`,
    );
    if (transitionalDelegatePattern.test(source)) {
      failures.push(
        `Benefits contracted loyalty policy reader must not access transitional ${transitionalStorageDelegate}: ${implementation}`,
      );
    }
    const transactionalPolicyReaderStart = source.indexOf(
      'getLoyaltyPolicySnapshotWithTx',
    );
    const transactionalPolicyReaderSource =
      transactionalPolicyReaderStart >= 0
        ? source.slice(transactionalPolicyReaderStart, transactionalPolicyReaderStart + 2400)
        : '';
    if (
      !transactionalPolicyReaderSource.includes('Prisma.TransactionClient') ||
      !transactionalPolicyReaderSource.includes(
        `tx.${dedicatedStorageDelegate}.findUnique`,
      ) ||
      transactionalPolicyReaderSource.includes(
        `tx.${transitionalStorageDelegate}.`,
      ) ||
      !transactionalPolicyReaderSource.includes(
        'normalizeLoyaltyPolicy(loyaltyProgramPolicy)',
      )
    ) {
      failures.push(
        `Benefits contracted transaction-bound policy reader must use only ${dedicatedStorageDelegate} through the supplied Prisma transaction client: ${implementation}`,
      );
    }
    const policyReaderStart = source.indexOf('async getLoyaltyPolicySnapshot()');
    const policyReaderSource =
      policyReaderStart >= 0 ? source.slice(policyReaderStart, policyReaderStart + 2200) : '';
    if (
      !policyReaderSource.includes(
        `this.prisma.${dedicatedStorageDelegate}.findUnique`,
      ) ||
      policyReaderSource.includes(
        `this.prisma.${transitionalStorageDelegate}.`,
      ) ||
      !policyReaderSource.includes(
        'normalizeLoyaltyPolicy(loyaltyProgramPolicy)',
      )
    ) {
      failures.push(
        `Benefits contracted runtime policy reader must use only ${dedicatedStorageDelegate}: ${implementation}`,
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
    const settingsReaderStart = writerSource.indexOf(
      'async getLoyaltyPolicySettings()',
    );
    const settingsReaderSource =
      settingsReaderStart >= 0
        ? writerSource.slice(settingsReaderStart, settingsReaderStart + 1800)
        : '';
    if (
      !settingsReaderSource.includes(
        `this.prisma.${dedicatedStorageDelegate}.findUnique`,
      ) ||
      settingsReaderSource.includes(
        `this.prisma.${transitionalStorageDelegate}.`,
      ) ||
      !settingsReaderSource.includes(
        'return requireLoyaltyPolicySettings(loyaltyProgramPolicy)',
      )
    ) {
      failures.push(
        `Benefits contracted editable policy reader must use only ${dedicatedStorageDelegate}: ${writerImplementation}`,
      );
    }
    if (
      !writerSource.includes('normalizeLoyaltyPolicyUpdate') ||
      !/\.\$transaction\s*\(/.test(writerSource) ||
      !writerSource.includes(`tx.${dedicatedStorageDelegate}.findUnique`) ||
      !writerSource.includes('const current = loyaltyProgramPolicy;') ||
      !writerSource.includes(`tx.${dedicatedStorageDelegate}.update`) ||
      writerSource.includes(`tx.${transitionalStorageDelegate}.`) ||
      /tx\.businessConfig\./.test(writerSource)
    ) {
      failures.push(
        `Benefits contracted loyalty writer must merge from and write only ${dedicatedStorageDelegate} in one transaction: ${writerImplementation}`,
      );
    }
    if (
      writerSource.includes('DEFAULT_LOYALTY_POLICY') ||
      /(?:loyaltyProgramPolicy|brandConfig|businessConfig)\.upsert\s*\(/.test(
        writerSource,
      )
    ) {
      failures.push(
        `Benefits loyalty policy writer must not invent runtime defaults or create missing policy config: ${writerImplementation}`,
      );
    }
    if (writerSource.includes('@compat benefits.business-config-loyalty-policy.v1')) {
      failures.push(
        `Benefits contracted loyalty policy writer must not retain the legacy persistence compatibility annotation: ${writerImplementation}`,
      );
    }
  }

  const prismaSchemaPath = join(REPOSITORY_ROOT, prismaSchema);
  if (!existsSync(prismaSchemaPath)) {
    failures.push(`Benefits loyalty policy Prisma schema missing: ${prismaSchema}`);
  } else {
    const schemaSource = readFileSync(prismaSchemaPath, 'utf8');
    const brandConfigModelMatch = schemaSource.match(
      /model\s+BrandConfig\s*\{([\s\S]*?)\n\}/,
    );
    if (!brandConfigModelMatch) {
      failures.push(
        `Benefits Loyalty contraction model missing: ${prismaSchema} -> BrandConfig`,
      );
    } else {
      for (const field of forbiddenBrandStoreContractFields) {
        if (
          new RegExp(`^\\s*${escapeRegExp(field)}\\s+`, 'm').test(
            brandConfigModelMatch[1],
          )
        ) {
          failures.push(
            `Benefits Loyalty contraction must remove duplicated policy column: ${prismaSchema} -> BrandConfig.${field}`,
          );
        }
      }
    }

    const dedicatedModelMatch = schemaSource.match(
      /model\s+LoyaltyProgramPolicy\s*\{([\s\S]*?)\n\}/,
    );
    if (!dedicatedModelMatch) {
      failures.push(`Benefits dedicated LoyaltyProgramPolicy model missing: ${prismaSchema}`);
    } else {
      for (const field of forbiddenBrandStoreContractFields) {
        if (!new RegExp(`^\\s*${escapeRegExp(field)}\\s+`, 'm').test(dedicatedModelMatch[1])) {
          failures.push(
            `Benefits dedicated LoyaltyProgramPolicy field missing after contraction: ${prismaSchema} -> ${field}`,
          );
        }
      }
    }
  }

  const contractionMigrationPath = join(REPOSITORY_ROOT, contractionMigration);
  if (!existsSync(contractionMigrationPath)) {
    failures.push(
      `Benefits Loyalty contraction migration missing: ${contractionMigration}`,
    );
  } else {
    const migrationSource = readFileSync(contractionMigrationPath, 'utf8');
    const triggerFunctionMatch = migrationSource.match(
      /CREATE OR REPLACE FUNCTION "syncBusinessConfigToCanonicalConfig"\(\)[\s\S]*?\$\$ LANGUAGE plpgsql;/,
    );
    if (!triggerFunctionMatch) {
      failures.push(
        `Benefits Loyalty contraction must replace syncBusinessConfigToCanonicalConfig(): ${contractionMigration}`,
      );
    } else {
      for (const field of forbiddenBrandStoreContractFields) {
        if (triggerFunctionMatch[0].includes(`"${field}"`)) {
          failures.push(
            `BusinessConfig compatibility trigger must not propagate Loyalty field after contraction: ${contractionMigration} -> ${field}`,
          );
        }
      }
    }

    for (const field of forbiddenBrandStoreContractFields) {
      const dropCount = (
        migrationSource.match(
          new RegExp(`DROP COLUMN "${escapeRegExp(field)}"`, 'g'),
        ) ?? []
      ).length;
      if (dropCount !== 2) {
        failures.push(
          `Benefits Loyalty contraction migration must drop ${field} from both BrandConfig and BusinessConfig: ${contractionMigration}`,
        );
      }
    }

    if (
      !migrationSource.includes('BEGIN;') ||
      !migrationSource.includes('COMMIT;') ||
      !migrationSource.includes(
        'Loyalty Phase D contraction blocked: persistence drift detected',
      )
    ) {
      failures.push(
        `Benefits Loyalty contraction migration must be atomic and fail closed on pre-drop parity drift: ${contractionMigration}`,
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

  const retiredAdminBusinessControllerPath = join(
    REPOSITORY_ROOT,
    retiredAdminBusinessController,
  );
  if (existsSync(retiredAdminBusinessControllerPath)) {
    failures.push(
      `retired Admin Business compatibility controller must stay deleted: ${retiredAdminBusinessController}`,
    );
  }

  const contractedAdminBusinessServicePath = join(
    REPOSITORY_ROOT,
    contractedAdminBusinessService,
  );
  if (!existsSync(contractedAdminBusinessServicePath)) {
    failures.push(
      `contracted Admin Business service missing: ${contractedAdminBusinessService}`,
    );
  } else {
    const source = readFileSync(contractedAdminBusinessServicePath, 'utf8');
    for (const field of forbiddenBrandStoreContractFields) {
      if (new RegExp(`\\b${escapeRegExp(field)}\\b`).test(source)) {
        failures.push(
          `contracted Admin Business service must not retain Benefits policy field after compatibility transport removal: ${contractedAdminBusinessService} -> ${field}`,
        );
      }
    }

    if (
      source.includes('BusinessConfigResponse') ||
      source.includes('LEGACY_LOYALTY_POLICY_FIELDS') ||
      source.includes('/admin/benefits/loyalty-policy') ||
      source.includes('../../loyalty/') ||
      source.includes('LOYALTY_POLICY_WRITER') ||
      source.includes('LOYALTY_POLICY_SETTINGS_READER') ||
      source.includes('updateLoyaltyPolicy') ||
      source.includes('getLoyaltyPolicySettings') ||
      source.includes('@compat benefits.business-config-loyalty-policy.v1')
    ) {
      failures.push(
        `retired Admin Business/Benefits compatibility contract must stay deleted: ${contractedAdminBusinessService}`,
      );
    }
  }

  for (const absolutePath of sourceFiles) {
    const sourcePath = repositoryPath(absolutePath);
    const source = readFileSync(absolutePath, 'utf8');
    if (sourcePath.startsWith('apps/web/src/')) {
      if (source.includes('/admin/business/')) {
        failures.push(
          `Web must use Brand/Store-owned staff contracts instead of legacy /admin/business/* routes: ${sourcePath}`,
        );
      }
      const legacyRoute = legacyAdminBusinessPolicyRoutes.find((route) =>
        source.includes(route),
      );
      if (legacyRoute) {
        for (const field of forbiddenBrandStoreContractFields) {
          if (new RegExp(`\\b${escapeRegExp(field)}\\b`).test(source)) {
            failures.push(
              `Web must not read or write Benefits policy through legacy Admin Business route ${legacyRoute}: ${sourcePath} -> ${field}`,
            );
          }
        }
      }
    }

    if (
      sourcePath.startsWith('apps/api/src/') &&
      /\.\s*businessConfig\b/.test(source) &&
      !allowedBusinessConfigPolicyFiles.has(sourcePath)
    ) {
      const directDelegateMatches = [
        ...source.matchAll(/\.\s*businessConfig\s*\./g),
      ];
      for (const match of directDelegateMatches) {
        const start = match.index ?? 0;
        const delegateWindow = source.slice(start, start + 5000);
        for (const field of forbiddenBrandStoreContractFields) {
          if (new RegExp(`\\b${escapeRegExp(field)}\\b`).test(delegateWindow)) {
            failures.push(
              `Benefits policy must not gain a new direct BusinessConfig persistence consumer: ${sourcePath} -> ${field}`,
            );
          }
        }
      }
    }
  }

  for (const ordersPath of [
    ordersPolicyConsumer,
    ordersCompositionModule,
    ordersRedemptionPolicy,
    ordersRedemptionCharacterization,
  ]) {
    if (!existsSync(join(REPOSITORY_ROOT, ordersPath))) {
      failures.push(`Orders Benefits policy migration path missing: ${ordersPath}`);
    }
  }

  const ordersPolicyConsumerPath = join(REPOSITORY_ROOT, ordersPolicyConsumer);
  if (existsSync(ordersPolicyConsumerPath)) {
    const source = readFileSync(ordersPolicyConsumerPath, 'utf8');
    const importsPublicSurface = importSpecifiers(source).some((specifier) => {
      if (!specifier.startsWith('.')) return false;
      return (
        resolveTarget(ordersPolicyConsumerPath, specifier).replace(
          /\.(?:[cm]?[jt]sx?)$/,
          '',
        ) === publicSurface.replace(/\.(?:[cm]?[jt]sx?)$/, '')
      );
    });
    const policyReadCount = (
      source.match(/loyaltyPolicyReader\.getLoyaltyPolicySnapshot\s*\(\s*\)/g) ?? []
    ).length;
    const requestedPointsCallCount = (
      source.match(/resolveRequestedLoyaltyPoints\s*\(\s*dto\s*,/g) ?? []
    ).length;
    const requestedRedeemCallCount = (
      source.match(
        /resolveRequestedLoyaltyRedeemCents\s*\(\s*requestedPoints\s*,/g,
      ) ?? []
    ).length;
    if (
      !importsPublicSurface ||
      !source.includes('LOYALTY_POLICY_READER') ||
      policyReadCount < 2 ||
      requestedPointsCallCount < 2 ||
      requestedRedeemCallCount < 1 ||
      source.includes('DEFAULT_REDEEM_DOLLAR_PER_POINT') ||
      source.includes('pricingConfig.redeemDollarPerPoint') ||
      source.includes('existing.redeemDollarPerPoint')
    ) {
      failures.push(
        `Orders loyalty redemption policy must read redeemDollarPerPoint through the Benefits public reader without BusinessConfig fallback: ${ordersPolicyConsumer}`,
      );
    }
  }

  const ordersCompositionModulePath = join(
    REPOSITORY_ROOT,
    ordersCompositionModule,
  );
  if (existsSync(ordersCompositionModulePath)) {
    const source = readFileSync(ordersCompositionModulePath, 'utf8');
    if (
      !source.includes("../loyalty/public-api") ||
      source.includes("../loyalty/loyalty.module")
    ) {
      failures.push(
        `Orders composition must import LoyaltyModule through the Benefits public surface: ${ordersCompositionModule}`,
      );
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

const requireClosedCompatibility = (compatId) => {
  const entry = (registry.closed ?? []).find(
    (candidate) =>
      candidate.compat_id === compatId && candidate.status === 'closed',
  );
  if (!entry) {
    failures.push(`required closed compatibility is not closed: ${compatId}`);
    return false;
  }
  return true;
};

const readCompatibilityGuardSource = (sourcePath) => {
  const normalizedPath = toPosix(sourcePath);
  const absolutePath = join(REPOSITORY_ROOT, normalizedPath);
  if (!existsSync(absolutePath)) {
    failures.push(`closed compatibility guard source missing: ${normalizedPath}`);
    return null;
  }
  return readFileSync(absolutePath, 'utf8');
};

if (requireClosedCompatibility('pos-device.admin-db-id.v1')) {
  const controller = readCompatibilityGuardSource(
    'apps/api/src/admin/pos-devices/admin-pos-devices.controller.ts',
  );
  const createDto = readCompatibilityGuardSource(
    'apps/api/src/admin/pos-devices/dto/create-pos-device.dto.ts',
  );
  const posContract = readCompatibilityGuardSource(
    'apps/api/src/pos/pos-device-management.contract.ts',
  );
  const posModule = readCompatibilityGuardSource(
    'apps/api/src/pos/pos-device.module.ts',
  );
  const posPublicApi = readCompatibilityGuardSource(
    'apps/api/src/pos/public-api.ts',
  );
  const posService = readCompatibilityGuardSource(
    'apps/api/src/pos/pos-device.service.ts',
  );
  const storeContract = readCompatibilityGuardSource(
    'apps/api/src/store/brand-store-config.contract.ts',
  );
  const storeModule = readCompatibilityGuardSource(
    'apps/api/src/store/brand-store-config.module.ts',
  );
  const storePublicApi = readCompatibilityGuardSource(
    'apps/api/src/store/public-api.ts',
  );
  const storeReader = readCompatibilityGuardSource(
    'apps/api/src/store/brand-store-config.reader.ts',
  );

  if (
    createDto &&
    (!createDto.includes('storeStableId: string') ||
      /\bstoreId\??\s*:/.test(createDto) ||
      createDto.includes('IsUUID'))
  ) {
    failures.push(
      'closed pos-device.admin-db-id.v1 must keep Admin create DTO on storeStableId only',
    );
  }
  if (
    controller &&
    (!controller.includes("BadRequestException('storeStableId is required')") ||
      !controller.includes("@Patch(':deviceStableId/reset-code')") ||
      !controller.includes("@Patch(':deviceStableId/status')") ||
      !controller.includes("@Delete(':deviceStableId')") ||
      controller.includes('UUID_PATTERN') ||
      controller.includes('pos_device_admin_compatibility_used'))
  ) {
    failures.push(
      'closed pos-device.admin-db-id.v1 must keep Admin device routes on stable business IDs only',
    );
  }

  for (const [sourcePath, source] of [
    ['apps/api/src/pos/pos-device-management.contract.ts', posContract],
    ['apps/api/src/pos/pos-device.module.ts', posModule],
    ['apps/api/src/pos/public-api.ts', posPublicApi],
    ['apps/api/src/pos/pos-device.service.ts', posService],
  ]) {
    if (
      source &&
      [
        'POS_DEVICE_ADMIN_COMPATIBILITY',
        'PosDeviceAdminCompatibilityPort',
        '@compat pos-device.admin-db-id.v1',
      ].some((token) => source.includes(token))
    ) {
      failures.push(
        `closed pos-device.admin-db-id.v1 compatibility symbol returned: ${sourcePath}`,
      );
    }
  }
  if (
    posService &&
    (posService.includes('resolveDeviceStableId') ||
      posService.includes('resolveStoreStableId('))
  ) {
    failures.push(
      'closed pos-device.admin-db-id.v1 must not restore device/store DB-ID resolvers in POS service',
    );
  }

  for (const [sourcePath, source] of [
    ['apps/api/src/store/brand-store-config.contract.ts', storeContract],
    ['apps/api/src/store/brand-store-config.module.ts', storeModule],
    ['apps/api/src/store/public-api.ts', storePublicApi],
    ['apps/api/src/store/brand-store-config.reader.ts', storeReader],
  ]) {
    if (
      source &&
      [
        'STORE_LEGACY_DB_ID_RESOLVER',
        'StoreLegacyDbIdResolverPort',
        'resolveStoreStableIdByDbId',
        '@compat pos-device.admin-db-id.v1',
      ].some((token) => source.includes(token))
    ) {
      failures.push(
        `closed pos-device.admin-db-id.v1 Store compatibility symbol returned: ${sourcePath}`,
      );
    }
  }
}

if (requireClosedCompatibility('brand-store.default-store-identity.v1')) {
  const operationsRoot = join(
    REPOSITORY_ROOT,
    'apps/api/src/integrations/ubereats/application/operations',
  );
  for (const absolutePath of walk(operationsRoot)) {
    const source = readFileSync(absolutePath, 'utf8');
    if (/\bnormalizeUberStoreId\b|['"]default['"]/.test(source)) {
      failures.push(
        `closed brand-store.default-store-identity.v1 implicit Uber Operations store returned: ${repositoryPath(absolutePath)}`,
      );
    }
  }

  const prismaSchemaPath = join(REPOSITORY_ROOT, 'apps/api/prisma/schema.prisma');
  const prismaSchema = readFileSync(prismaSchemaPath, 'utf8');
  for (const match of prismaSchema.matchAll(/model\s+(Uber\w+)\s*\{([\s\S]*?)\n\}/g)) {
    if (/\bstoreId\s+String\b[^\n]*@default\(\s*"default"\s*\)/.test(match[2])) {
      failures.push(
        `closed brand-store.default-store-identity.v1 Prisma default returned: ${match[1]}.storeId`,
      );
    }
  }

  const persistenceRoot = join(
    REPOSITORY_ROOT,
    'apps/api/src/integrations/ubereats/infrastructure/persistence',
  );
  for (const absolutePath of walk(persistenceRoot)) {
    const source = readFileSync(absolutePath, 'utf8');
    if (
      /\bstoreId\s*:\s*['"]default['"]|\b(?:storeId|storeStableId)\s*(?:\?\?|\|\|)\s*['"]default['"]/.test(
        source,
      )
    ) {
      failures.push(
        `closed brand-store.default-store-identity.v1 implicit Uber persistence write returned: ${repositoryPath(absolutePath)}`,
      );
    }
  }
}

if (config.contexts.length !== 12 || new Set(config.contexts.map(({ id }) => id)).size !== 12) {
  failures.push('context-baseline.json must define exactly 12 unique contexts');
}
if (
  config.legacyPublicCycleComponents !== undefined &&
  !Array.isArray(config.legacyPublicCycleComponents)
) {
  failures.push('legacyPublicCycleComponents must be an array when configured');
}
if (
  Array.isArray(config.legacyPublicCycleComponents) &&
  config.legacyPublicCycleComponents.length !== legacyPublicCycleComponents.length
) {
  failures.push(
    'each legacy public-cycle baseline must define contexts and edges arrays',
  );
}
for (const baseline of legacyPublicCycleComponents) {
  const baselineContexts = new Set(baseline.contexts);
  if (
    baselineContexts.size !== baseline.contexts.length ||
    baseline.contexts.some((context) => !contextIds.includes(context))
  ) {
    failures.push(
      'legacy public-cycle baseline contains duplicate or unknown contexts: ' +
        baseline.contexts.join(', '),
    );
  }
  if (typeof baseline.reason !== 'string' || !baseline.reason.trim()) {
    failures.push('legacy public-cycle baseline must include a reason');
  }
  for (const edge of baseline.edges) {
    const { source, target } = parseContextEdge(edge);
    if (
      !source ||
      !target ||
      !baselineContexts.has(source) ||
      !baselineContexts.has(target) ||
      legacyDirectEdges.has(edge)
    ) {
      failures.push(
        'invalid legacy public-cycle baseline edge: ' + edge,
      );
    }
  }
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

for (const [edge, limit] of Object.entries(config.legacyDirectImportLimits)) {
  const current = directCounts.get(edge) ?? 0;
  if (current < limit) {
    failures.push(
      'legacy direct-import baseline is stale; lower/remove the allowance: ' +
        edge +
        ' baseline=' +
        limit +
        ' current=' +
        current,
    );
  }
}

for (const baseline of staleLegacyPublicCycleComponents) {
  failures.push(
    'legacy public-cycle baseline is stale; contract it to the exact current SCC or remove it: contexts=' +
      baseline.contexts.join(', ') +
      '; edges=' +
      baseline.edges.join(', '),
  );
}

for (const cycle of newPublicContractCycles) {
  failures.push(
    'new or expanded public-contract context cycle detected: contexts=' +
      cycle.contexts.join(', ') +
      '; edges=' +
      cycle.edges.join(', '),
  );
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

const awsMessageInfrastructureRetirementBoundary =
  config.awsMessageInfrastructureRetirementBoundary ?? null;
if (awsMessageInfrastructureRetirementBoundary) {
  const boundary = Object.fromEntries(
    Object.entries(awsMessageInfrastructureRetirementBoundary).map(
      ([key, value]) => [key, toPosix(value ?? '')],
    ),
  );

  for (const retiredPath of [
    boundary.retiredSnsController,
    boundary.retiredSnsService,
    boundary.retiredSqsProcessor,
  ]) {
    if (retiredPath && existsSync(join(REPOSITORY_ROOT, retiredPath))) {
      failures.push(
        `Retired AWS SNS/SQS infrastructure must stay deleted: ${retiredPath}`,
      );
    }
  }

  const forbiddenByPath = new Map([
    [boundary.main, ['webhooks/aws-sns']],
    [
      boundary.messagingModule,
      ['AwsSnsWebhookController', 'AwsSnsWebhookService'],
    ],
    [boundary.emailModule, ['SesEventProcessor']],
    [boundary.ordersService, ['PRINT_SNS_TOPIC_ARN']],
    [
      boundary.dockerCompose,
      ['SNS_TOPIC_ARN', 'SES_EVENTS_SQS_QUEUE_URL'],
    ],
  ]);

  for (const [sourcePath, forbiddenTokens] of forbiddenByPath.entries()) {
    if (!sourcePath || !existsSync(join(REPOSITORY_ROOT, sourcePath))) {
      failures.push(
        `AWS SNS/SQS retirement guard source is missing: ${sourcePath || '<missing-path>'}`,
      );
      continue;
    }
    const source = readFileSync(join(REPOSITORY_ROOT, sourcePath), 'utf8');
    for (const forbiddenToken of forbiddenTokens) {
      if (source.includes(forbiddenToken)) {
        failures.push(
          `Retired AWS SNS/SQS token ${forbiddenToken} must not return in ${sourcePath}`,
        );
      }
    }
  }

  if (boundary.sesProvider) {
    const sourcePath = join(REPOSITORY_ROOT, boundary.sesProvider);
    if (!existsSync(sourcePath)) {
      failures.push(
        `SES provider required by AWS SNS/SQS retirement guard is missing: ${boundary.sesProvider}`,
      );
    } else {
      const source = readFileSync(sourcePath, 'utf8');
      if (
        !source.includes('process.env.AWS_SES_CONFIGURATION_SET?.trim()') ||
        source.includes("AWS_SES_CONFIGURATION_SET ?? 'sanq-events'")
      ) {
        failures.push(
          `SES provider must keep configuration-set publishing opt-in after SNS/SQS retirement: ${boundary.sesProvider}`,
        );
      }
    }
  }
}

const orderPaidSettlementBoundary = config.orderPaidSettlementBoundary ?? null;
if (orderPaidSettlementBoundary) {
  const boundary = Object.fromEntries(
    Object.entries(orderPaidSettlementBoundary).map(([key, value]) => [
      key,
      toPosix(value ?? ''),
    ]),
  );
  const requiredPaths = [
    boundary.contract,
    boundary.loyaltyService,
    boundary.loyaltyModule,
    boundary.loyaltyPublicSurface,
    boundary.ordersService,
    boundary.ordersModule,
    boundary.ordersEventBus,
    boundary.ordersPublicSurface,
    boundary.messagingModule,
    boundary.orderIngestionContract,
    boundary.orderIngestionService,
    boundary.durableOutbox,
    boundary.uberModule,
    boundary.uberOrderImport,
  ];

  for (const sourcePath of requiredPaths) {
    if (!sourcePath || !existsSync(join(REPOSITORY_ROOT, sourcePath))) {
      failures.push(
        `Order-paid settlement boundary file is missing: ${sourcePath || '<missing-path>'}`,
      );
    }
  }

  for (const retiredPath of [
    boundary.retiredLoyaltyProcessor,
    boundary.retiredMessagingEventBus,
  ]) {
    if (retiredPath && existsSync(join(REPOSITORY_ROOT, retiredPath))) {
      failures.push(
        `Retired cross-context order-event path must stay deleted: ${retiredPath}`,
      );
    }
  }

  const readBoundarySource = (sourcePath) => {
    if (!sourcePath || !existsSync(join(REPOSITORY_ROOT, sourcePath))) return '';
    return readFileSync(join(REPOSITORY_ROOT, sourcePath), 'utf8');
  };

  const contractSource = readBoundarySource(boundary.contract);
  for (const requiredToken of [
    'LOYALTY_ORDER_PAID_SETTLEMENT',
    'LoyaltyOrderPaidSettlementPort',
    'settleOrderPaid',
    'orderStableId',
    'subtotalCents',
    'redeemValueCents',
    'earnMultiplier',
  ]) {
    if (contractSource && !contractSource.includes(requiredToken)) {
      failures.push(
        `Loyalty order-paid settlement contract is missing ${requiredToken}: ${boundary.contract}`,
      );
    }
  }
  for (const forbiddenToken of ['orderId:', 'userId:', 'Prisma', 'OrderEventsBus']) {
    if (contractSource.includes(forbiddenToken)) {
      failures.push(
        `Loyalty order-paid settlement contract must stay stable-ID-only; found ${forbiddenToken}: ${boundary.contract}`,
      );
    }
  }

  const loyaltyServiceSource = readBoundarySource(boundary.loyaltyService);
  for (const requiredToken of [
    'LoyaltyOrderPaidSettlementPort',
    'settleOrderPaid',
    'where: { orderStableId: input.orderStableId }',
    'orderId: order.id',
    'userId: order.userId',
  ]) {
    if (loyaltyServiceSource && !loyaltyServiceSource.includes(requiredToken)) {
      failures.push(
        `LoyaltyService must keep stable-ID settlement translation ${requiredToken}: ${boundary.loyaltyService}`,
      );
    }
  }

  const loyaltyModuleSource = readBoundarySource(boundary.loyaltyModule);
  if (
    loyaltyModuleSource &&
    (!loyaltyModuleSource.includes('LOYALTY_ORDER_PAID_SETTLEMENT') ||
      !loyaltyModuleSource.includes('useExisting: LoyaltyService') ||
      loyaltyModuleSource.includes('MessagingModule') ||
      loyaltyModuleSource.includes('LoyaltyEventProcessor'))
  ) {
    failures.push(
      `LoyaltyModule must expose settlement without Messaging/event-processor wiring: ${boundary.loyaltyModule}`,
    );
  }

  const loyaltyPublicSource = readBoundarySource(boundary.loyaltyPublicSurface);
  if (
    loyaltyPublicSource &&
    (!loyaltyPublicSource.includes('LOYALTY_ORDER_PAID_SETTLEMENT') ||
      !loyaltyPublicSource.includes(
        "from './loyalty-order-paid-settlement.contract'",
      ))
  ) {
    failures.push(
      `Loyalty public surface must expose the narrow order-paid settlement capability: ${boundary.loyaltyPublicSurface}`,
    );
  }

  const ordersServiceSource = readBoundarySource(boundary.ordersService);
  for (const requiredToken of [
    'LOYALTY_ORDER_PAID_SETTLEMENT',
    'loyaltyOrderPaidSettlement.settleOrderPaid',
    'orderStableId: order.orderStableId',
    "from './order-events.bus'",
  ]) {
    if (ordersServiceSource && !ordersServiceSource.includes(requiredToken)) {
      failures.push(
        `OrdersService must keep the stable Loyalty settlement/local event-bus shape ${requiredToken}: ${boundary.ordersService}`,
      );
    }
  }
  const promotionMultiplierCallPattern =
    /resolvePromotionLoyaltyMultiplier\(\s*order\.promotionSnapshot,?\s*\)/;
  if (
    ordersServiceSource &&
    !promotionMultiplierCallPattern.test(ordersServiceSource)
  ) {
    failures.push(
      `OrdersService must derive Loyalty settlement multiplier from the persisted promotion snapshot: ${boundary.ordersService}`,
    );
  }
  if (ordersServiceSource.includes("from '../messaging/order-events.bus'")) {
    failures.push(
      `OrdersService must not depend on Messaging for OrderEventsBus: ${boundary.ordersService}`,
    );
  }

  const ordersModuleSource = readBoundarySource(boundary.ordersModule);
  if (
    ordersModuleSource &&
    (!ordersModuleSource.includes("from './order-events.bus'") ||
      !ordersModuleSource.includes('OrderEventsBus,') ||
      ordersModuleSource.includes('MessagingModule'))
  ) {
    failures.push(
      `OrdersModule must privately own OrderEventsBus without MessagingModule: ${boundary.ordersModule}`,
    );
  }

  const ordersPublicSource = readBoundarySource(boundary.ordersPublicSurface);
  if (
    ordersPublicSource.includes('OrderEventsBus') ||
    ordersPublicSource.includes('order-events.bus')
  ) {
    failures.push(
      `OrderEventsBus must remain private and absent from Orders public API: ${boundary.ordersPublicSurface}`,
    );
  }

  const messagingModuleSource = readBoundarySource(boundary.messagingModule);
  if (messagingModuleSource.includes('OrderEventsBus')) {
    failures.push(
      `MessagingModule must not own or export OrderEventsBus: ${boundary.messagingModule}`,
    );
  }

  for (const sourcePath of [
    boundary.orderIngestionContract,
    boundary.orderIngestionService,
    boundary.uberOrderImport,
  ]) {
    const source = readBoundarySource(sourcePath);
    if (source.includes('emitPaidLifecycleEvent')) {
      failures.push(
        `Dead Uber ingestion paid-lifecycle switch must stay removed: ${sourcePath}`,
      );
    }
  }
  const ingestionServiceSource = readBoundarySource(boundary.orderIngestionService);
  if (ingestionServiceSource.includes('OrderEventsBus')) {
    failures.push(
      `Order ingestion must not require the local Orders event bus: ${boundary.orderIngestionService}`,
    );
  }

  const uberModuleSource = readBoundarySource(boundary.uberModule);
  for (const forbiddenToken of ['MessagingModule', 'OrderEventsBus']) {
    if (uberModuleSource.includes(forbiddenToken)) {
      failures.push(
        `Uber composition must not depend on retired Messaging order-event bridge ${forbiddenToken}: ${boundary.uberModule}`,
      );
    }
  }

  const durableOutboxSource = readBoundarySource(boundary.durableOutbox);
  for (const requiredToken of [
    'OrderLifecycleOutboxProcessor',
    'ORDER_LIFECYCLE_OUTBOX_SOURCE',
    'handleAcceptedLifecycle',
  ]) {
    if (durableOutboxSource && !durableOutboxSource.includes(requiredToken)) {
      failures.push(
        `Durable Orders lifecycle ownership must remain intact after bus contraction; missing ${requiredToken}: ${boundary.durableOutbox}`,
      );
    }
  }
}

const customerProfileAddressConsentBoundary =
  config.customerProfileAddressConsentBoundary ?? null;
if (customerProfileAddressConsentBoundary) {
  const boundary = Object.fromEntries(
    Object.entries(customerProfileAddressConsentBoundary).map(([key, value]) => [
      key,
      toPosix(value ?? ''),
    ]),
  );
  const requiredPaths = [
    boundary.customerService,
    boundary.membershipService,
    boundary.membershipController,
    boundary.membershipModule,
  ];
  for (const sourcePath of requiredPaths) {
    if (!sourcePath || !existsSync(join(REPOSITORY_ROOT, sourcePath))) {
      failures.push(
        `Customer profile/address/consent boundary file is missing: ${sourcePath || '<missing-path>'}`,
      );
    }
  }

  if (
    boundary.retiredOnboardingService &&
    existsSync(join(REPOSITORY_ROOT, boundary.retiredOnboardingService))
  ) {
    failures.push(
      `retired MembershipOnboardingService path must stay deleted: ${boundary.retiredOnboardingService}`,
    );
  }

  const readCustomerBoundarySource = (sourcePath) => {
    if (!sourcePath || !existsSync(join(REPOSITORY_ROOT, sourcePath))) return '';
    return readFileSync(join(REPOSITORY_ROOT, sourcePath), 'utf8');
  };

  const customerServiceSource = readCustomerBoundarySource(boundary.customerService);
  for (const requiredToken of [
    'export class CustomerService',
    'getOnboardingStatus',
    'finalizeOnboarding',
    'updateProfile',
    'updateMarketingConsent',
    'listAddresses',
    'createAddress',
    'updateAddress',
    'deleteAddress',
    'setDefaultAddress',
    'requireEligibleBirthday',
    'requireUserDbId',
    'addressStableId',
    'userStableId',
    'CUSTOMER_LIFECYCLE_NOTIFICATION',
    'COUPON_PROGRAM_TRIGGER',
  ]) {
    if (customerServiceSource && !customerServiceSource.includes(requiredToken)) {
      failures.push(
        `CustomerService must own customer profile/address/consent behavior; missing ${requiredToken}: ${boundary.customerService}`,
      );
    }
  }

  const membershipServiceSource = readCustomerBoundarySource(
    boundary.membershipService,
  );
  for (const forbiddenToken of [
    'updateProfile(',
    'updateMarketingConsent(',
    'listAddresses(',
    'createAddress(',
    'updateAddress(',
    'deleteAddress(',
    'setDefaultAddress(',
    'AuthChallenge',
    'PHONE_VERIFY',
    'authChallenge',
    'this.prisma.user.create(',
  ]) {
    if (membershipServiceSource.includes(forbiddenToken)) {
      failures.push(
        `MembershipService must not regain Customer-owned mutation ${forbiddenToken}: ${boundary.membershipService}`,
      );
    }
  }
  const existingStableUserLookupPattern = /where\s*:\s*\{\s*userStableId\s*\}/;
  if (
    membershipServiceSource &&
    (!membershipServiceSource.includes('requireExistingUser') ||
      !existingStableUserLookupPattern.test(membershipServiceSource))
  ) {
    failures.push(
      `MembershipService reads must require an existing stable-ID customer instead of implicit account mutation: ${boundary.membershipService}`,
    );
  }

  const membershipControllerSource = readCustomerBoundarySource(
    boundary.membershipController,
  );
  for (const requiredToken of [
    "from './customer.service'",
    'private readonly customer: CustomerService',
    'customer.getOnboardingStatus',
    'customer.finalizeOnboarding',
    'customer.updateProfile',
    'customer.updateMarketingConsent',
    'customer.listAddresses',
    'customer.createAddress',
    'customer.updateAddress',
    'customer.deleteAddress',
    'customer.setDefaultAddress',
  ]) {
    if (
      membershipControllerSource &&
      !membershipControllerSource.includes(requiredToken)
    ) {
      failures.push(
        `Membership transport must route Customer-owned use cases through CustomerService; missing ${requiredToken}: ${boundary.membershipController}`,
      );
    }
  }

  const membershipModuleSource = readCustomerBoundarySource(boundary.membershipModule);
  if (
    membershipModuleSource &&
    (!membershipModuleSource.includes("from './customer.service'") ||
      !membershipModuleSource.includes('CustomerService') ||
      membershipModuleSource.includes('MembershipOnboardingService'))
  ) {
    failures.push(
      `MembershipModule must wire CustomerService and keep the retired onboarding service absent: ${boundary.membershipModule}`,
    );
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
  publicContractCycles,
  newPublicContractCycles,
  legacyPublicCycleComponents,
  staleLegacyPublicCycleComponents,
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
