//apps/api/prisma/seed/seed-menu.cjs
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function readSnapshot() {
  const p = path.join(process.cwd(), "prisma", "seed", "menu.snapshot.json");
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

async function main() {
  const s = readSnapshot();

  // 1) Categories
  for (const c of s.categories) {
    await prisma.menuCategory.upsert({
      where: { stableId: c.stableId },
      create: {
        stableId: c.stableId,
        nameEn: c.nameEn,
        nameZh: c.nameZh,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        deletedAt: null,
      },
      update: {
        nameEn: c.nameEn,
        nameZh: c.nameZh,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        deletedAt: null,
      },
    });
  }

  // 2) Option Group Templates
  for (const g of s.templateGroups) {
    await prisma.menuOptionGroupTemplate.upsert({
      where: { stableId: g.stableId },
      create: {
        stableId: g.stableId,
        nameEn: g.nameEn,
        nameZh: g.nameZh,
        sortOrder: g.sortOrder,
        defaultMinSelect: g.defaultMinSelect,
        defaultMaxSelect: g.defaultMaxSelect,
        isAvailable: g.isAvailable,
        tempUnavailableUntil: g.tempUnavailableUntil,
        deletedAt: null,
      },
      update: {
        nameEn: g.nameEn,
        nameZh: g.nameZh,
        sortOrder: g.sortOrder,
        defaultMinSelect: g.defaultMinSelect,
        defaultMaxSelect: g.defaultMaxSelect,
        isAvailable: g.isAvailable,
        tempUnavailableUntil: g.tempUnavailableUntil,
        deletedAt: null,
      },
    });
  }

  // 3) Options (MenuOptionTemplateChoice)
  for (const o of s.options) {
    if (!o.templateGroupStableId) continue;

    await prisma.menuOptionTemplateChoice.upsert({
      where: { stableId: o.stableId },
      create: {
        stableId: o.stableId,
        templateGroup: { connect: { stableId: o.templateGroupStableId } },
        nameEn: o.nameEn,
        nameZh: o.nameZh,
        priceDeltaCents: o.priceDeltaCents,
        sortOrder: o.sortOrder,
        isAvailable: o.isAvailable,
        tempUnavailableUntil: o.tempUnavailableUntil,
        deletedAt: null,
      },
      update: {
        templateGroup: { connect: { stableId: o.templateGroupStableId } },
        nameEn: o.nameEn,
        nameZh: o.nameZh,
        priceDeltaCents: o.priceDeltaCents,
        sortOrder: o.sortOrder,
        isAvailable: o.isAvailable,
        tempUnavailableUntil: o.tempUnavailableUntil,
        deletedAt: null,
      },
    });
  }

  // 4) Items
  for (const i of s.items) {
    if (!i.categoryStableId) continue;

    await prisma.menuItem.upsert({
      where: { stableId: i.stableId },
      create: {
        stableId: i.stableId,
        category: { connect: { stableId: i.categoryStableId } },
        nameEn: i.nameEn,
        nameZh: i.nameZh,
        basePriceCents: i.basePriceCents,
        sortOrder: i.sortOrder,
        imageUrl: i.imageUrl,
        ingredientsEn: i.ingredientsEn,
        ingredientsZh: i.ingredientsZh,
        isAvailable: i.isAvailable,
        isVisible: i.isVisible,
        tempUnavailableUntil: i.tempUnavailableUntil,
        deletedAt: null,
      },
      update: {
        category: { connect: { stableId: i.categoryStableId } },
        nameEn: i.nameEn,
        nameZh: i.nameZh,
        basePriceCents: i.basePriceCents,
        sortOrder: i.sortOrder,
        imageUrl: i.imageUrl,
        ingredientsEn: i.ingredientsEn,
        ingredientsZh: i.ingredientsZh,
        isAvailable: i.isAvailable,
        isVisible: i.isVisible,
        tempUnavailableUntil: i.tempUnavailableUntil,
        deletedAt: null,
      },
    });
  }

  // 5) Join table MenuItemOptionGroup
  // 因为 @@unique([itemId, templateGroupId]) 用的是内部 id，所以要先建映射表
  const itemRows = await prisma.menuItem.findMany({
    where: { deletedAt: null },
    select: { id: true, stableId: true },
  });
  const groupRows = await prisma.menuOptionGroupTemplate.findMany({
    where: { deletedAt: null },
    select: { id: true, stableId: true },
  });

  const itemIdByStable = new Map(itemRows.map((r) => [r.stableId, r.id]));
  const groupIdByStable = new Map(groupRows.map((r) => [r.stableId, r.id]));

  for (const x of s.itemOptionGroups) {
    const itemId = itemIdByStable.get(x.itemStableId);
    const templateGroupId = groupIdByStable.get(x.templateGroupStableId);
    if (!itemId || !templateGroupId) continue;

    await prisma.menuItemOptionGroup.upsert({
      where: {
        itemId_templateGroupId: { itemId, templateGroupId },
      },
      create: {
        item: { connect: { id: itemId } },
        templateGroup: { connect: { id: templateGroupId } },
        minSelect: x.minSelect,
        maxSelect: x.maxSelect ?? null,
        sortOrder: x.sortOrder,
        isEnabled: x.isEnabled,
      },
      update: {
        minSelect: x.minSelect,
        maxSelect: x.maxSelect ?? null,
        sortOrder: x.sortOrder,
        isEnabled: x.isEnabled,
      },
    });
  }

  console.log("Seed menu completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
