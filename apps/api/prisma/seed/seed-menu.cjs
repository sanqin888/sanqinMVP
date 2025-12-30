//apps/api/prisma/seed/seed-menu.cjs
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function readSnapshot() {
  const p = path.resolve(__dirname, "menu.snapshot.json");
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

async function main() {
  const s = readSnapshot();

// 0.x) POS Devices
const isUuid = (v) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

async function upsertPosDevice(d) {
  const baseUpdate = {
    storeId: d.storeId,
    name: d.name ?? null,
    status: d.status ?? "ACTIVE",
    meta: typeof d.meta === "undefined" ? null : d.meta,
    lastSeenAt: d.lastSeenAt ?? null,
    // enrolledAt：一般不建议在 update 时回写历史时间；保留数据库现值更安全
  };

  // 1) 优先按 deviceStableId（unique）
  const byStable = await prisma.posDevice.findUnique({
    where: { deviceStableId: d.deviceStableId },
  });
  if (byStable) {
    return prisma.posDevice.update({
      where: { deviceStableId: d.deviceStableId },
      data: baseUpdate,
    });
  }

  // 2) 再按 enrollmentKeyHash（unique）
  const byEnrollHash = await prisma.posDevice.findUnique({
    where: { enrollmentKeyHash: d.enrollmentKeyHash },
  });
  if (byEnrollHash) {
    // 这里可以把 deviceStableId 对齐回 snapshot，保持一致（可选但推荐）
    return prisma.posDevice.update({
      where: { enrollmentKeyHash: d.enrollmentKeyHash },
      data: { ...baseUpdate, deviceStableId: d.deviceStableId },
    });
  }

  // 3) 都不存在则 create（此时必须带上 hash，保证设备仍能被识别/校验）
  return prisma.posDevice.create({
    data: {
      ...(isUuid(d.id) ? { id: d.id } : {}),
      deviceStableId: d.deviceStableId,
      storeId: d.storeId,
      name: d.name ?? null,
      status: d.status ?? "ACTIVE",
      enrollmentKeyHash: d.enrollmentKeyHash,
      deviceKeyHash: d.deviceKeyHash,
      meta: typeof d.meta === "undefined" ? null : d.meta,
      enrolledAt: d.enrolledAt ? new Date(d.enrolledAt) : undefined,
      lastSeenAt: d.lastSeenAt ? new Date(d.lastSeenAt) : null,
    },
  });
}

if (Array.isArray(s.posDevices) && s.posDevices.length > 0) {
  for (const d of s.posDevices) {
    await upsertPosDevice(d);
  }
} else {
  console.log("No posDevices in snapshot.");
}

// 0) Admin Users
async function upsertAdminUser(u) {
  const dataBase = {
    role: "ADMIN",
    status: u.status ?? "ACTIVE",
    userStableId: u.userStableId,
    email: u.email ?? null,
    phone: u.phone ?? null,
    phoneVerifiedAt: u.phoneVerifiedAt ?? null,
    name: u.name ?? null,
    marketingEmailOptIn: !!u.marketingEmailOptIn,
    marketingEmailOptInAt: u.marketingEmailOptInAt ?? null,
    referredByUserId: u.referredByUserId ?? null,
    birthdayMonth: u.birthdayMonth ?? null,
    birthdayDay: u.birthdayDay ?? null,
    googleSub: u.googleSub ?? null,
  };

  function withPasswordIfTargetEmpty(target) {
    const targetHasPwd = !!target.passwordHash;
    const snapshotHasPwd = !!u.passwordHash;

    // ✅ 默认策略：目标已有密码 -> 不覆盖；目标无密码且 snapshot 有 -> 写入
    if (!targetHasPwd && snapshotHasPwd) {
      return {
        ...dataBase,
        passwordHash: u.passwordHash ?? null,
      };
    }
    return dataBase;
  }

  // 依次定位已存在的目标用户（避免 unique 冲突）
  const candidates = [];

  if (u.id) candidates.push(prisma.user.findUnique({ where: { id: u.id } }));
  if (u.email) candidates.push(prisma.user.findUnique({ where: { email: u.email } }));
  if (u.phone) candidates.push(prisma.user.findUnique({ where: { phone: u.phone } }));
  if (u.userStableId) candidates.push(prisma.user.findUnique({ where: { userStableId: u.userStableId } }));
  if (u.googleSub) candidates.push(prisma.user.findUnique({ where: { googleSub: u.googleSub } }));

  const results = await Promise.allSettled(candidates);
  const found = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value)
    .find((v) => v);

  if (found) {
    const data = withPasswordIfTargetEmpty(found);
    return prisma.user.update({ where: { id: found.id }, data });
  }

  // 不存在则 create：✅ 可以直接带密码
  return prisma.user.create({
    data: {
      id: u.id, // 你希望稳定复用同一个 uuid
      ...dataBase,
      passwordHash: u.passwordHash ?? null,
    },
  });
}
if (Array.isArray(s.adminUsers) && s.adminUsers.length > 0) {
  for (const u of s.adminUsers) {
    await upsertAdminUser(u);
  }
} else {
  console.log("No adminUsers in snapshot.");
}

// 1) Business Hours (weekday is unique)
if (Array.isArray(s.businessHours)) {
  for (const h of s.businessHours) {
    await prisma.businessHour.upsert({
      where: { weekday: h.weekday }, // ✅ schema 里 weekday @unique
      create: {
        weekday: h.weekday,
        openMinutes: h.openMinutes ?? null,
        closeMinutes: h.closeMinutes ?? null,
        isClosed: !!h.isClosed,
      },
      update: {
        openMinutes: h.openMinutes ?? null,
        closeMinutes: h.closeMinutes ?? null,
        isClosed: !!h.isClosed,
      },
    });
  }
}

  // 2) Categories
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

  // 3) Option Group Templates
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

  // 4) Options (MenuOptionTemplateChoice)
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

  // 5) Items
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

  // 6) Join table MenuItemOptionGroup
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
