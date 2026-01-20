// apps/api/prisma/seed/export-menu-snapshot.cjs
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  // ===== Admin Users (role = ADMIN) =====
  // ⚠️ dev snapshot：会包含 passwordHash、deviceKeyHash、enrollmentKeyHash 等敏感字段，确保该文件产物在 .gitignore 内
  const adminUsers = await prisma.user.findMany({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userStableId: true,

      email: true,
      emailVerifiedAt: true,

      phone: true,
      phoneVerifiedAt: true,

      name: true,
      role: true,
      status: true,

      passwordHash: true,
      passwordChangedAt: true,

      twoFactorEnabledAt: true,
      twoFactorMethod: true,

      marketingEmailOptIn: true,
      marketingEmailOptInAt: true,

      birthdayMonth: true,
      birthdayDay: true,

      referredByUserId: true,
      googleSub: true,

      createdAt: true,
      updatedAt: true,
    },
  });

  // ===== Business Config (id=1) =====
  // 可能还没初始化过（不存在 row），则导出为 null
  const businessConfig = await prisma.businessConfig.findUnique({
    where: { id: 1 },
    select: {
      id: true,
      storeName: true,
      timezone: true,

      isTemporarilyClosed: true,
      temporaryCloseReason: true,

      deliveryBaseFeeCents: true,
      priorityPerKmCents: true,
      maxDeliveryRangeKm: true,
      priorityDefaultDistanceKm: true,

      salesTaxRate: true,

      // Loyalty config
      earnPtPerDollar: true,
      redeemDollarPerPoint: true,
      referralPtPerDollar: true,
      tierMultiplierBronze: true,
      tierMultiplierSilver: true,
      tierMultiplierGold: true,
      tierMultiplierPlatinum: true,
      tierThresholdSilver: true,
      tierThresholdGold: true,
      tierThresholdPlatinum: true,

      // Delivery provider toggles
      enableDoorDash: true,
      enableUberDirect: true,

      // Store geo/address/support
      storeLatitude: true,
      storeLongitude: true,
      storeAddressLine1: true,
      storeAddressLine2: true,
      storeCity: true,
      storeProvince: true,
      storePostalCode: true,
      supportPhone: true,
      supportEmail: true,

      createdAt: true,
      updatedAt: true,
    },
  });

  // ===== Business Hours =====
  const businessHours = await prisma.businessHour.findMany({
    orderBy: { weekday: "asc" },
    select: {
      weekday: true,
      openMinutes: true,
      closeMinutes: true,
      isClosed: true,
    },
  });

  // ===== Holidays =====
  const holidays = await prisma.holiday.findMany({
    orderBy: { date: "asc" },
    select: {
      date: true,
      name: true,
      isClosed: true,
      openMinutes: true,
      closeMinutes: true,
    },
  });

  // ===== POS Devices =====
  const posDevices = await prisma.posDevice.findMany({
    orderBy: { enrolledAt: "asc" },
    select: {
      id: true,
      deviceStableId: true,
      storeId: true,
      name: true,
      status: true,

      enrollmentKeyHash: true,
      deviceKeyHash: true,

      meta: true,
      enrolledAt: true,
      lastSeenAt: true,
    },
  });

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
      visibility: true,
      tempUnavailableUntil: true,
      deletedAt: true,
      category: { select: { stableId: true } },
    },
  });

  // ===== Daily Specials =====
  const dailySpecials = await prisma.menuDailySpecial.findMany({
    where: {
      deletedAt: null,
      item: { deletedAt: null },
    },
    orderBy: [{ weekday: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    select: {
      stableId: true,
      weekday: true,
      itemStableId: true,

      pricingMode: true,
      overridePriceCents: true,
      discountDeltaCents: true,
      discountPercent: true,

      startDate: true,
      endDate: true,
      startMinutes: true,
      endMinutes: true,

      disallowCoupons: true,
      isEnabled: true,
      sortOrder: true,

      deletedAt: true,
      createdAt: true,
      updatedAt: true,
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
  const optionChoices = await prisma.menuOptionTemplateChoice.findMany({
    where: { deletedAt: null, templateGroup: { deletedAt: null } },
    orderBy: [{ templateGroupId: "asc" }, { sortOrder: "asc" }],
    select: {
      stableId: true,
      nameEn: true,
      nameZh: true,
      priceDeltaCents: true,
      targetItemStableId: true, // ✅ schema 新增：指向目标菜品 stableId（可选）
      sortOrder: true,
      isAvailable: true,
      tempUnavailableUntil: true,
      deletedAt: true,
      templateGroup: { select: { stableId: true } },
    },
  });

  // ===== Option Choice Links (Parent -> Child) =====
  const optionChoiceLinks = await prisma.menuOptionChoiceLink.findMany({
    where: {
      parentOption: { deletedAt: null },
      childOption: { deletedAt: null },
    },
    orderBy: [{ parentOptionId: "asc" }, { childOptionId: "asc" }],
    select: {
      parentOption: { select: { stableId: true } },
      childOption: { select: { stableId: true } },
    },
  });

  // ===== Item ↔ OptionGroup Links =====
  // join 表本身无 deletedAt，因此用两侧 deletedAt  пикир
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
    version: 3,
    exportedAt: new Date().toISOString(),

    adminUsers: adminUsers.map((u) => ({
      id: u.id,
      userStableId: u.userStableId,

      email: u.email,
      emailVerifiedAt: u.emailVerifiedAt,

      phone: u.phone,
      phoneVerifiedAt: u.phoneVerifiedAt,

      name: u.name,
      role: u.role,
      status: u.status,

      passwordHash: u.passwordHash,
      passwordChangedAt: u.passwordChangedAt,

      twoFactorEnabledAt: u.twoFactorEnabledAt,
      twoFactorMethod: u.twoFactorMethod,

      marketingEmailOptIn: u.marketingEmailOptIn,
      marketingEmailOptInAt: u.marketingEmailOptInAt,

      referredByUserId: u.referredByUserId,
      birthdayMonth: u.birthdayMonth,
      birthdayDay: u.birthdayDay,

      googleSub: u.googleSub,

      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    })),

    businessConfig: businessConfig
      ? {
          id: businessConfig.id,
          storeName: businessConfig.storeName,
          timezone: businessConfig.timezone,

          isTemporarilyClosed: businessConfig.isTemporarilyClosed,
          temporaryCloseReason: businessConfig.temporaryCloseReason,

          deliveryBaseFeeCents: businessConfig.deliveryBaseFeeCents,
          priorityPerKmCents: businessConfig.priorityPerKmCents,
          maxDeliveryRangeKm: businessConfig.maxDeliveryRangeKm,
          priorityDefaultDistanceKm: businessConfig.priorityDefaultDistanceKm,

          salesTaxRate: businessConfig.salesTaxRate,

          earnPtPerDollar: businessConfig.earnPtPerDollar,
          redeemDollarPerPoint: businessConfig.redeemDollarPerPoint,
          referralPtPerDollar: businessConfig.referralPtPerDollar,
          tierMultiplierBronze: businessConfig.tierMultiplierBronze,
          tierMultiplierSilver: businessConfig.tierMultiplierSilver,
          tierMultiplierGold: businessConfig.tierMultiplierGold,
          tierMultiplierPlatinum: businessConfig.tierMultiplierPlatinum,
          tierThresholdSilver: businessConfig.tierThresholdSilver,
          tierThresholdGold: businessConfig.tierThresholdGold,
          tierThresholdPlatinum: businessConfig.tierThresholdPlatinum,

          enableDoorDash: businessConfig.enableDoorDash,
          enableUberDirect: businessConfig.enableUberDirect,

          storeLatitude: businessConfig.storeLatitude,
          storeLongitude: businessConfig.storeLongitude,
          storeAddressLine1: businessConfig.storeAddressLine1,
          storeAddressLine2: businessConfig.storeAddressLine2,
          storeCity: businessConfig.storeCity,
          storeProvince: businessConfig.storeProvince,
          storePostalCode: businessConfig.storePostalCode,
          supportPhone: businessConfig.supportPhone,
          supportEmail: businessConfig.supportEmail,

          createdAt: businessConfig.createdAt,
          updatedAt: businessConfig.updatedAt,
        }
      : null,

    businessHours: businessHours.map((h) => ({
      weekday: h.weekday,
      openMinutes: h.openMinutes,
      closeMinutes: h.closeMinutes,
      isClosed: h.isClosed,
    })),

    holidays: holidays.map((x) => ({
      date: x.date,
      name: x.name,
      isClosed: x.isClosed,
      openMinutes: x.openMinutes,
      closeMinutes: x.closeMinutes,
    })),

    posDevices: posDevices.map((d) => ({
      id: d.id,
      deviceStableId: d.deviceStableId,
      storeId: d.storeId,
      name: d.name,
      status: d.status,
      enrollmentKeyHash: d.enrollmentKeyHash,
      deviceKeyHash: d.deviceKeyHash,
      meta: d.meta,
      enrolledAt: d.enrolledAt,
      lastSeenAt: d.lastSeenAt,
    })),

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
      visibility: i.visibility,
      tempUnavailableUntil: i.tempUnavailableUntil,
      deletedAt: i.deletedAt,
    })),

    dailySpecials: dailySpecials.map((s) => ({
      stableId: s.stableId,
      weekday: s.weekday,
      itemStableId: s.itemStableId,

      pricingMode: s.pricingMode,
      overridePriceCents: s.overridePriceCents ?? null,
      discountDeltaCents: s.discountDeltaCents ?? null,
      discountPercent: s.discountPercent ?? null,

      startDate: s.startDate,
      endDate: s.endDate,
      startMinutes: s.startMinutes ?? null,
      endMinutes: s.endMinutes ?? null,

      disallowCoupons: s.disallowCoupons,
      isEnabled: s.isEnabled,
      sortOrder: s.sortOrder,

      deletedAt: s.deletedAt,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),

    templateGroups: templateGroups.map((g) => ({
      stableId: g.stableId,
      nameEn: g.nameEn,
      nameZh: g.nameZh,
      sortOrder: g.sortOrder,
      defaultMinSelect: g.defaultMinSelect,
      defaultMaxSelect: g.defaultMaxSelect ?? null,
      isAvailable: g.isAvailable,
      tempUnavailableUntil: g.tempUnavailableUntil,
      deletedAt: g.deletedAt,
    })),

    options: optionChoices.map((o) => ({
      stableId: o.stableId,
      templateGroupStableId: o.templateGroup?.stableId ?? null,
      nameEn: o.nameEn,
      nameZh: o.nameZh,
      priceDeltaCents: o.priceDeltaCents,
      targetItemStableId: o.targetItemStableId ?? null,
      sortOrder: o.sortOrder,
      isAvailable: o.isAvailable,
      tempUnavailableUntil: o.tempUnavailableUntil,
      deletedAt: o.deletedAt,
    })),

    optionChoiceLinks: optionChoiceLinks.map((l) => ({
      parentOptionStableId: l.parentOption?.stableId ?? null,
      childOptionStableId: l.childOption?.stableId ?? null,
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
