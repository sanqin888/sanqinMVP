import { Prisma, PrismaClient } from '@prisma/client';
import {
  collectHistoricalOptionChoiceStableIds,
  collectHistoricalSnapshotTargetStableIds,
  planHistoricalOrderItemComponentsBackfill,
  type HistoricalComponentBackfillCatalog,
  type HistoricalComponentBackfillIssueCode,
  type HistoricalComponentBackfillPlan,
} from '../order-item-components-backfill';

const APPLY_CONFIRMATION = 'BACKFILL_ORDER_ITEM_COMPONENTS_V1';
const UNRESOLVED_SAMPLE_LIMIT = 50;

type BackfillMode = 'dry-run' | 'apply';

type BackfillRow = {
  id: string;
  productStableId: string;
  optionsJson: Prisma.JsonValue | null;
  componentsJson: Prisma.JsonValue | null;
  order: { orderStableId: string };
};

type BackfillReport = {
  compatId: 'orders.order-item-components.v1';
  mode: BackfillMode;
  scannedOrderItems: number;
  alreadyBackfilled: number;
  notCandidates: number;
  candidates: number;
  safe: number;
  unresolved: number;
  safeComponents: number;
  safeChildGroups: number;
  snapshotTargetCount: number;
  currentMappingTargetCount: number;
  warningsByCode: Record<string, number>;
  unresolvedByReason: Record<string, number>;
  byParentProduct: Array<{
    parentProductStableId: string;
    safe: number;
    unresolved: number;
  }>;
  unresolvedSamples: Array<{
    orderStableId: string;
    parentProductStableId: string;
    reasons: HistoricalComponentBackfillIssueCode[];
    issues: HistoricalComponentBackfillPlan['issues'];
  }>;
  apply?: {
    plannedSafe: number;
    applied: number;
    skippedBecauseAlreadyChanged: number;
    postCheckFilled: number;
    postCheckMissing: number;
  };
};

function resolveMode(args: string[]): BackfillMode {
  return args.includes('--apply') ? 'apply' : 'dry-run';
}

function resolveConfirmation(args: string[]): string | null {
  const prefix = '--confirm=';
  return (
    args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null
  );
}

function countCodes<T extends string>(codes: T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const code of codes) {
    counts[code] = (counts[code] ?? 0) + 1;
  }
  return counts;
}

function buildReport(
  mode: BackfillMode,
  plans: HistoricalComponentBackfillPlan[],
): BackfillReport {
  const safePlans = plans.filter((plan) => plan.status === 'SAFE');
  const unresolvedPlans = plans.filter((plan) => plan.status === 'UNRESOLVED');
  const parentSummary = new Map<
    string,
    { parentProductStableId: string; safe: number; unresolved: number }
  >();

  for (const plan of [...safePlans, ...unresolvedPlans]) {
    const existing = parentSummary.get(plan.parentProductStableId) ?? {
      parentProductStableId: plan.parentProductStableId,
      safe: 0,
      unresolved: 0,
    };
    if (plan.status === 'SAFE') existing.safe += 1;
    if (plan.status === 'UNRESOLVED') existing.unresolved += 1;
    parentSummary.set(plan.parentProductStableId, existing);
  }

  const warningCodes = plans.flatMap((plan) =>
    plan.warnings.map((warning) => warning.code),
  );
  const issueCodes = unresolvedPlans.flatMap((plan) =>
    plan.issues.map((issue) => issue.code),
  );

  return {
    compatId: 'orders.order-item-components.v1',
    mode,
    scannedOrderItems: plans.length,
    alreadyBackfilled: plans.filter(
      (plan) => plan.status === 'ALREADY_BACKFILLED',
    ).length,
    notCandidates: plans.filter((plan) => plan.status === 'NOT_CANDIDATE')
      .length,
    candidates: safePlans.length + unresolvedPlans.length,
    safe: safePlans.length,
    unresolved: unresolvedPlans.length,
    safeComponents: safePlans.reduce(
      (total, plan) => total + plan.components.length,
      0,
    ),
    safeChildGroups: safePlans.reduce(
      (total, plan) => total + plan.evidence.assignedChildGroupCount,
      0,
    ),
    snapshotTargetCount: plans.reduce(
      (total, plan) => total + plan.evidence.snapshotTargetCount,
      0,
    ),
    currentMappingTargetCount: plans.reduce(
      (total, plan) => total + plan.evidence.currentMappingTargetCount,
      0,
    ),
    warningsByCode: countCodes(warningCodes),
    unresolvedByReason: countCodes(issueCodes),
    byParentProduct: Array.from(parentSummary.values()).sort((a, b) =>
      a.parentProductStableId.localeCompare(b.parentProductStableId),
    ),
    unresolvedSamples: unresolvedPlans
      .slice(0, UNRESOLVED_SAMPLE_LIMIT)
      .map((plan) => ({
        orderStableId: plan.orderStableId,
        parentProductStableId: plan.parentProductStableId,
        reasons: Array.from(new Set(plan.issues.map((issue) => issue.code))),
        issues: plan.issues,
      })),
  };
}

async function loadRows(prisma: PrismaClient): Promise<BackfillRow[]> {
  return prisma.orderItem.findMany({
    select: {
      id: true,
      productStableId: true,
      optionsJson: true,
      componentsJson: true,
      order: { select: { orderStableId: true } },
    },
  });
}

async function buildCatalog(
  prisma: PrismaClient,
  rows: BackfillRow[],
): Promise<HistoricalComponentBackfillCatalog> {
  const choiceStableIds = Array.from(
    new Set(
      rows.flatMap((row) =>
        collectHistoricalOptionChoiceStableIds(row.optionsJson),
      ),
    ),
  );
  const choiceTargets = choiceStableIds.length
    ? await prisma.menuOptionTemplateChoice.findMany({
        where: { stableId: { in: choiceStableIds } },
        select: { stableId: true, targetItemStableId: true },
      })
    : [];
  const currentTargetByChoiceStableId = new Map<string, string | null>(
    choiceTargets.map((choice) => [choice.stableId, choice.targetItemStableId]),
  );

  const relevantItemStableIds = new Set<string>(
    rows.map((row) => row.productStableId),
  );
  for (const row of rows) {
    for (const targetStableId of collectHistoricalSnapshotTargetStableIds(
      row.optionsJson,
    )) {
      relevantItemStableIds.add(targetStableId);
    }
    for (const choiceStableId of collectHistoricalOptionChoiceStableIds(
      row.optionsJson,
    )) {
      const targetStableId = currentTargetByChoiceStableId.get(choiceStableId);
      if (targetStableId) relevantItemStableIds.add(targetStableId);
    }
  }

  const menuItems = relevantItemStableIds.size
    ? await prisma.menuItem.findMany({
        where: { stableId: { in: Array.from(relevantItemStableIds) } },
        select: {
          stableId: true,
          optionGroups: {
            select: {
              templateGroup: { select: { stableId: true } },
            },
          },
        },
      })
    : [];

  return {
    currentTargetByChoiceStableId,
    knownMenuItemStableIds: new Set(menuItems.map((item) => item.stableId)),
    optionGroupStableIdsByItemStableId: new Map<string, ReadonlySet<string>>(
      menuItems.map((item): [string, ReadonlySet<string>] => [
        item.stableId,
        new Set(item.optionGroups.map((group) => group.templateGroup.stableId)),
      ]),
    ),
  };
}

async function applySafePlans(
  prisma: PrismaClient,
  safePlans: HistoricalComponentBackfillPlan[],
): Promise<NonNullable<BackfillReport['apply']>> {
  let applied = 0;
  let skippedBecauseAlreadyChanged = 0;

  for (const plan of safePlans) {
    const result = await prisma.orderItem.updateMany({
      where: {
        id: plan.orderItemDbId,
        componentsJson: { equals: Prisma.DbNull },
      },
      data: {
        componentsJson: plan.components as unknown as Prisma.InputJsonValue,
      },
    });
    if (result.count === 1) applied += 1;
    else skippedBecauseAlreadyChanged += 1;
  }

  const postRows = safePlans.length
    ? await prisma.orderItem.findMany({
        where: { id: { in: safePlans.map((plan) => plan.orderItemDbId) } },
        select: { componentsJson: true },
      })
    : [];
  const postCheckFilled = postRows.filter(
    (row) => row.componentsJson !== null,
  ).length;

  return {
    plannedSafe: safePlans.length,
    applied,
    skippedBecauseAlreadyChanged,
    postCheckFilled,
    postCheckMissing: Math.max(0, safePlans.length - postCheckFilled),
  };
}

async function main(): Promise<void> {
  const mode = resolveMode(process.argv.slice(2));
  if (
    mode === 'apply' &&
    resolveConfirmation(process.argv.slice(2)) !== APPLY_CONFIRMATION
  ) {
    throw new Error(
      `Apply mode requires --confirm=${APPLY_CONFIRMATION}. Run without --apply for dry-run.`,
    );
  }

  const prisma = new PrismaClient();
  try {
    const rows = await loadRows(prisma);
    const catalog = await buildCatalog(prisma, rows);
    const plans = rows.map((row) =>
      planHistoricalOrderItemComponentsBackfill(
        {
          orderItemDbId: row.id,
          orderStableId: row.order.orderStableId,
          parentProductStableId: row.productStableId,
          optionsJson: row.optionsJson,
          componentsJson: row.componentsJson,
        },
        catalog,
      ),
    );
    const report = buildReport(mode, plans);

    if (mode === 'apply') {
      const safePlans = plans.filter((plan) => plan.status === 'SAFE');
      report.apply = await applySafePlans(prisma, safePlans);
    }

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if ((report.apply?.postCheckMissing ?? 0) > 0) {
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`order item component backfill failed: ${message}\n`);
  process.exitCode = 1;
});
