//apps/api/prisma/seed/export-menu-snapshot.cjs
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  // ===== Categories =====
  const categories = await prisma.menuCategory.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" },
    select: {
      stableId: true,
      nameEn: true,
      nameZh: true,
      sortOrder: true,
      isActive: true,
      deletedAt: true,
    },
  });

  // ===== Items =====
  const items = await prisma.menuItem.findMany({
    where: { deletedAt: null, category: { deletedAt: null } },
    orderBy: { sortOrder: "asc" },
    select: {
      stableId: true,
      nameEn: true,
      nameZh: true,
      basePriceCents: true,
      sortOrder: true,
      imageUrl: true,
      ingredientsEn: true,
      ingredientsZh: true,
      isAvailable: true,
      isVisible: true,
      tempUnavailableUntil: true,
      deletedAt: true,
      category: { select: { stableId: true } },
    },
  });

  // ===== Option Group Templates =====
  const templateGroups = await prisma.menuOptionGroupTemplate.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" },
    select: {
      stableId: true,
      nameEn: true,
      nameZh: true,
      sortOrder: true,
      defaultMinSelect: true,
      defaultMaxSelect: true,
      isAvailable: true,
      tempUnavailableUntil: true,
      deletedAt: true,
    },
  });

  // ===== Option Choices =====
  const options = await prisma.menuOptionTemplateChoice.findMany({
    where: { deletedAt: null, templateGroup: { deletedAt: null } },
    orderBy: [{ templateGroupId: "asc" }, { sortOrder: "asc" }],
    select: {
      stableId: true,
      nameEn: true,
      nameZh: true,
      priceDeltaCents: true,
      sortOrder: true,
      isAvailable: true,
      tempUnavailableUntil: true,
      deletedAt: true,
      templateGroup: { select: { stableId: true } },
    },
  });

  // ===== Item ↔ OptionGroup Links =====
  // 注意：你的 join 表没有 deletedAt，用 item/templateGroup 的 deletedAt 来过滤无效连接
  const itemOptionGroups = await prisma.menuItemOptionGroup.findMany({
    where: {
      item: { deletedAt: null },
      templateGroup: { deletedAt: null },
    },
    orderBy: { sortOrder: "asc" },
    select: {
      minSelect: true,
      maxSelect: true,
      sortOrder: true,
      isEnabled: true,
      item: { select: { stableId: true } },
      templateGroup: { select: { stableId: true } },
    },
  });

  const snapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),

    categories: categories.map((c) => ({
      stableId: c.stableId,
      nameEn: c.nameEn,
      nameZh: c.nameZh,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      deletedAt: c.deletedAt,
    })),

    items: items.map((i) => ({
      stableId: i.stableId,
      categoryStableId: i.category?.stableId ?? null,
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
      deletedAt: i.deletedAt,
    })),

    templateGroups: templateGroups.map((g) => ({
      stableId: g.stableId,
      nameEn: g.nameEn,
      nameZh: g.nameZh,
      sortOrder: g.sortOrder,
      defaultMinSelect: g.defaultMinSelect,
      defaultMaxSelect: g.defaultMaxSelect,
      isAvailable: g.isAvailable,
      tempUnavailableUntil: g.tempUnavailableUntil,
      deletedAt: g.deletedAt,
    })),

    options: options.map((o) => ({
      stableId: o.stableId,
      templateGroupStableId: o.templateGroup?.stableId ?? null,
      nameEn: o.nameEn,
      nameZh: o.nameZh,
      priceDeltaCents: o.priceDeltaCents,
      sortOrder: o.sortOrder,
      isAvailable: o.isAvailable,
      tempUnavailableUntil: o.tempUnavailableUntil,
      deletedAt: o.deletedAt,
    })),

    itemOptionGroups: itemOptionGroups.map((x) => ({
      itemStableId: x.item?.stableId ?? null,
      templateGroupStableId: x.templateGroup?.stableId ?? null,
      minSelect: x.minSelect,
      maxSelect: x.maxSelect ?? null,
      sortOrder: x.sortOrder,
      isEnabled: x.isEnabled,
    })),
  };

  const outDir = path.join(process.cwd(), "prisma", "seed");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "menu.snapshot.json");
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), "utf-8");
  console.log(`Wrote snapshot: ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
