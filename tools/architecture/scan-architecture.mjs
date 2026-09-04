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
        !source.includes('controllers: [OrdersController]')
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
