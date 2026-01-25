// apps/api/prisma/seed/seed-menu.cjs
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function readSnapshot() {
  const p = path.resolve(__dirname, "menu.snapshot.json");
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

const isUuid = (v) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );

const toDateOrNull = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

// update 阶段：null/undefined 视为“不要改”
const toUpdateOptional = (v) =>
  v === null || typeof v === "undefined" ? undefined : v;
// create 阶段：undefined → null（便于写入）
const toCreateOptional = (v) => (typeof v === "undefined" ? null : v);

async function main() {
  const s = readSnapshot();

  // 0.x) POS Devices
  async function upsertPosDevice(d) {
    const baseUpdate = {
      storeId: d.storeId,
      name: typeof d.name === "undefined" ? undefined : d.name,
      status: d.status ?? "ACTIVE",
      meta: typeof d.meta === "undefined" ? undefined : d.meta,
      lastSeenAt: toDateOrNull(d.lastSeenAt) ?? undefined,
      // enrolledAt：一般不建议在 update 时回写历史时间；保留数据库现值更安全
      // enrollmentKeyHash/deviceKeyHash：也不建议在 update 中覆盖（除非你明确想重置）
    };

    // 1) 优先按 deviceStableId（unique）
    if (d.deviceStableId) {
      const byStable = await prisma.posDevice.findUnique({
        where: { deviceStableId: d.deviceStableId },
      });
      if (byStable) {
        return prisma.posDevice.update({
          where: { deviceStableId: d.deviceStableId },
          data: baseUpdate,
        });
      }
    }

    // 2) 再按 enrollmentKeyHash（unique）
    if (d.enrollmentKeyHash) {
      const byEnrollHash = await prisma.posDevice.findUnique({
        where: { enrollmentKeyHash: d.enrollmentKeyHash },
      });
      if (byEnrollHash) {
        return prisma.posDevice.update({
          where: { enrollmentKeyHash: d.enrollmentKeyHash },
          data: {
            ...baseUpdate,
            ...(d.deviceStableId ? { deviceStableId: d.deviceStableId } : {}),
          },
        });
      }
    }

    // 3) 都不存在则 create（此时必须带上 hash）
    return prisma.posDevice.create({
      data: {
        ...(isUuid(d.id) ? { id: d.id } : {}),
        deviceStableId: d.deviceStableId, // undefined → 使用 default(cuid())
        storeId: d.storeId,
        name: toCreateOptional(d.name),
        status: d.status ?? "ACTIVE",
        enrollmentKeyHash: d.enrollmentKeyHash,
        deviceKeyHash: d.deviceKeyHash,
        meta: typeof d.meta === "undefined" ? null : d.meta,
        enrolledAt: d.enrolledAt ? new Date(d.enrolledAt) : undefined,
        lastSeenAt: toDateOrNull(d.lastSeenAt),
      },
    });
  }

  if (Array.isArray(s.posDevices) && s.posDevices.length > 0) {
    for (const d of s.posDevices) await upsertPosDevice(d);
  } else {
    console.log("No posDevices in snapshot.");
  }

  // 0) Admin Users
  async function upsertAdminUser(u) {
    const updateDataBase = {
      role: "ADMIN",
      status: u.status ?? "ACTIVE",

      email: toUpdateOptional(u.email),
      emailVerifiedAt: toDateOrNull(u.emailVerifiedAt) ?? undefined,

      phone: toUpdateOptional(u.phone),
      phoneVerifiedAt: toDateOrNull(u.phoneVerifiedAt) ?? undefined,

      name: toUpdateOptional(u.name),

      marketingEmailOptIn:
        typeof u.marketingEmailOptIn === "boolean"
          ? u.marketingEmailOptIn
          : undefined,
      marketingEmailOptInAt: toDateOrNull(u.marketingEmailOptInAt) ?? undefined,

      referredByUserId: toUpdateOptional(u.referredByUserId),
      birthdayMonth:
        typeof u.birthdayMonth === "number" ? u.birthdayMonth : undefined,
      birthdayDay: typeof u.birthdayDay === "number" ? u.birthdayDay : undefined,

      googleSub: toUpdateOptional(u.googleSub),

      twoFactorMethod: toUpdateOptional(u.twoFactorMethod),
      twoFactorEnabledAt: toDateOrNull(u.twoFactorEnabledAt) ?? undefined,
    };

    const createDataBase = {
      role: "ADMIN",
      status: u.status ?? "ACTIVE",

      ...(typeof u.userStableId === "string"
        ? { userStableId: u.userStableId }
        : {}),

      email: toCreateOptional(u.email),
      emailVerifiedAt: toDateOrNull(u.emailVerifiedAt),

      phone: toCreateOptional(u.phone),
      phoneVerifiedAt: toDateOrNull(u.phoneVerifiedAt),

      name: toCreateOptional(u.name),

      marketingEmailOptIn: !!u.marketingEmailOptIn,
      marketingEmailOptInAt: toDateOrNull(u.marketingEmailOptInAt),

      referredByUserId: toCreateOptional(u.referredByUserId),
      birthdayMonth:
        typeof u.birthdayMonth === "number" ? u.birthdayMonth : null,
      birthdayDay: typeof u.birthdayDay === "number" ? u.birthdayDay : null,

      googleSub: toCreateOptional(u.googleSub),

      twoFactorMethod: u.twoFactorMethod ?? "OFF",
      twoFactorEnabledAt: toDateOrNull(u.twoFactorEnabledAt),

      passwordHash: toCreateOptional(u.passwordHash),
      passwordChangedAt: toDateOrNull(u.passwordChangedAt),
    };

    function withPasswordIfTargetEmpty(target) {
      const targetHasPwd = !!target.passwordHash;
      const snapshotHasPwd = !!u.passwordHash;

      if (!targetHasPwd && snapshotHasPwd) {
        return {
          ...updateDataBase,
          passwordHash: u.passwordHash ?? undefined,
          passwordChangedAt: toDateOrNull(u.passwordChangedAt) ?? undefined,
        };
      }
      return updateDataBase;
    }

    // 依次定位已存在的目标用户（避免 unique 冲突）
    const candidates = [];

    if (isUuid(u.id))
      candidates.push(prisma.user.findUnique({ where: { id: u.id } }));
    if (u.email)
      candidates.push(prisma.user.findUnique({ where: { email: u.email } }));
    if (u.phone)
      candidates.push(prisma.user.findUnique({ where: { phone: u.phone } }));
    if (u.userStableId)
      candidates.push(
        prisma.user.findUnique({ where: { userStableId: u.userStableId } }),
      );
    if (u.googleSub)
      candidates.push(
        prisma.user.findUnique({ where: { googleSub: u.googleSub } }),
      );

    const results = await Promise.allSettled(candidates);
    const found = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value)
      .find((v) => v);

    if (found) {
      const data = withPasswordIfTargetEmpty(found);
      return prisma.user.update({ where: { id: found.id }, data });
    }

    return prisma.user.create({
      data: {
        ...(isUuid(u.id) ? { id: u.id } : {}),
        ...createDataBase,
      },
    });
  }

  if (Array.isArray(s.adminUsers) && s.adminUsers.length > 0) {
    for (const u of s.adminUsers) await upsertAdminUser(u);
  } else {
    console.log("No adminUsers in snapshot.");
  }

  // 0.5) BusinessConfig (id=1)
  if (s.businessConfig && typeof s.businessConfig === "object") {
    const c = s.businessConfig;

    await prisma.businessConfig.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        storeName:
          typeof c.storeName === "string" && c.storeName.trim()
            ? c.storeName
            : "SanQin",
        timezone:
          typeof c.timezone === "string" ? c.timezone : "America/Toronto",

        isTemporarilyClosed: !!c.isTemporarilyClosed,
        temporaryCloseReason: toCreateOptional(c.temporaryCloseReason),

        publicNotice: toCreateOptional(c.publicNotice),
        publicNoticeEn: toCreateOptional(c.publicNoticeEn),

        deliveryBaseFeeCents:
          typeof c.deliveryBaseFeeCents === "number"
            ? c.deliveryBaseFeeCents
            : 600,
        priorityPerKmCents:
          typeof c.priorityPerKmCents === "number" ? c.priorityPerKmCents : 100,
        maxDeliveryRangeKm:
          typeof c.maxDeliveryRangeKm === "number" ? c.maxDeliveryRangeKm : 10,
        priorityDefaultDistanceKm:
          typeof c.priorityDefaultDistanceKm === "number"
            ? c.priorityDefaultDistanceKm
            : 6,

        storeLatitude: typeof c.storeLatitude === "number" ? c.storeLatitude : null,
        storeLongitude:
          typeof c.storeLongitude === "number" ? c.storeLongitude : null,
        storeAddressLine1: toCreateOptional(c.storeAddressLine1),
        storeAddressLine2: toCreateOptional(c.storeAddressLine2),
        storeCity: toCreateOptional(c.storeCity),
        storeProvince: toCreateOptional(c.storeProvince),
        storePostalCode: toCreateOptional(c.storePostalCode),

        supportPhone: toCreateOptional(c.supportPhone),
        supportEmail: toCreateOptional(c.supportEmail),

        brandNameZh: toCreateOptional(c.brandNameZh),
        brandNameEn: toCreateOptional(c.brandNameEn),
        siteUrl: toCreateOptional(c.siteUrl),
        emailFromNameZh: toCreateOptional(c.emailFromNameZh),
        emailFromNameEn: toCreateOptional(c.emailFromNameEn),
        emailFromAddress: toCreateOptional(c.emailFromAddress),
        smsSignature: toCreateOptional(c.smsSignature),

        salesTaxRate: typeof c.salesTaxRate === "number" ? c.salesTaxRate : 0.13,
        wechatAlipayExchangeRate:
          typeof c.wechatAlipayExchangeRate === "number"
            ? c.wechatAlipayExchangeRate
            : 1.0,

        earnPtPerDollar:
          typeof c.earnPtPerDollar === "number" ? c.earnPtPerDollar : 0.01,
        redeemDollarPerPoint:
          typeof c.redeemDollarPerPoint === "number"
            ? c.redeemDollarPerPoint
            : 1,
        referralPtPerDollar:
          typeof c.referralPtPerDollar === "number"
            ? c.referralPtPerDollar
            : 0.01,
        tierMultiplierBronze:
          typeof c.tierMultiplierBronze === "number"
            ? c.tierMultiplierBronze
            : 1,
        tierMultiplierSilver:
          typeof c.tierMultiplierSilver === "number"
            ? c.tierMultiplierSilver
            : 2,
        tierMultiplierGold:
          typeof c.tierMultiplierGold === "number"
            ? c.tierMultiplierGold
            : 3,
        tierMultiplierPlatinum:
          typeof c.tierMultiplierPlatinum === "number"
            ? c.tierMultiplierPlatinum
            : 5,

        tierThresholdSilver:
          typeof c.tierThresholdSilver === "number"
            ? c.tierThresholdSilver
            : 100000,
        tierThresholdGold:
          typeof c.tierThresholdGold === "number"
            ? c.tierThresholdGold
            : 1000000,
        tierThresholdPlatinum:
          typeof c.tierThresholdPlatinum === "number"
            ? c.tierThresholdPlatinum
            : 3000000,

        enableDoorDash:
          typeof c.enableDoorDash === "boolean" ? c.enableDoorDash : true,
        enableUberDirect:
          typeof c.enableUberDirect === "boolean" ? c.enableUberDirect : true,
      },
      update: {
        storeName:
          typeof c.storeName === "string" && c.storeName.trim()
            ? c.storeName
            : undefined,
        timezone: typeof c.timezone === "string" ? c.timezone : undefined,

        isTemporarilyClosed:
          typeof c.isTemporarilyClosed === "boolean"
            ? c.isTemporarilyClosed
            : undefined,
        temporaryCloseReason: toUpdateOptional(c.temporaryCloseReason),

        publicNotice: toUpdateOptional(c.publicNotice),
        publicNoticeEn: toUpdateOptional(c.publicNoticeEn),

        deliveryBaseFeeCents:
          typeof c.deliveryBaseFeeCents === "number"
            ? c.deliveryBaseFeeCents
            : undefined,
        priorityPerKmCents:
          typeof c.priorityPerKmCents === "number"
            ? c.priorityPerKmCents
            : undefined,
        maxDeliveryRangeKm:
          typeof c.maxDeliveryRangeKm === "number" ? c.maxDeliveryRangeKm : undefined,
        priorityDefaultDistanceKm:
          typeof c.priorityDefaultDistanceKm === "number"
            ? c.priorityDefaultDistanceKm
            : undefined,

        storeLatitude:
          typeof c.storeLatitude === "number" ? c.storeLatitude : undefined,
        storeLongitude:
          typeof c.storeLongitude === "number" ? c.storeLongitude : undefined,
        storeAddressLine1: toUpdateOptional(c.storeAddressLine1),
        storeAddressLine2: toUpdateOptional(c.storeAddressLine2),
        storeCity: toUpdateOptional(c.storeCity),
        storeProvince: toUpdateOptional(c.storeProvince),
        storePostalCode: toUpdateOptional(c.storePostalCode),

        supportPhone: toUpdateOptional(c.supportPhone),
        supportEmail: toUpdateOptional(c.supportEmail),

        brandNameZh: toUpdateOptional(c.brandNameZh),
        brandNameEn: toUpdateOptional(c.brandNameEn),
        siteUrl: toUpdateOptional(c.siteUrl),
        emailFromNameZh: toUpdateOptional(c.emailFromNameZh),
        emailFromNameEn: toUpdateOptional(c.emailFromNameEn),
        emailFromAddress: toUpdateOptional(c.emailFromAddress),
        smsSignature: toUpdateOptional(c.smsSignature),

        salesTaxRate:
          typeof c.salesTaxRate === "number" ? c.salesTaxRate : undefined,
        wechatAlipayExchangeRate:
          typeof c.wechatAlipayExchangeRate === "number"
            ? c.wechatAlipayExchangeRate
            : undefined,

        earnPtPerDollar:
          typeof c.earnPtPerDollar === "number" ? c.earnPtPerDollar : undefined,
        redeemDollarPerPoint:
          typeof c.redeemDollarPerPoint === "number"
            ? c.redeemDollarPerPoint
            : undefined,
        referralPtPerDollar:
          typeof c.referralPtPerDollar === "number"
            ? c.referralPtPerDollar
            : undefined,
        tierMultiplierBronze:
          typeof c.tierMultiplierBronze === "number"
            ? c.tierMultiplierBronze
            : undefined,
        tierMultiplierSilver:
          typeof c.tierMultiplierSilver === "number"
            ? c.tierMultiplierSilver
            : undefined,
        tierMultiplierGold:
          typeof c.tierMultiplierGold === "number"
            ? c.tierMultiplierGold
            : undefined,
        tierMultiplierPlatinum:
          typeof c.tierMultiplierPlatinum === "number"
            ? c.tierMultiplierPlatinum
            : undefined,

        tierThresholdSilver:
          typeof c.tierThresholdSilver === "number"
            ? c.tierThresholdSilver
            : undefined,
        tierThresholdGold:
          typeof c.tierThresholdGold === "number"
            ? c.tierThresholdGold
            : undefined,
        tierThresholdPlatinum:
          typeof c.tierThresholdPlatinum === "number"
            ? c.tierThresholdPlatinum
            : undefined,

        enableDoorDash:
          typeof c.enableDoorDash === "boolean" ? c.enableDoorDash : undefined,
        enableUberDirect:
          typeof c.enableUberDirect === "boolean" ? c.enableUberDirect : undefined,
      },
    });
  } else {
    console.log("No businessConfig in snapshot.");
  }

  // 1) Business Hours (weekday is unique)
  if (Array.isArray(s.businessHours)) {
    for (const h of s.businessHours) {
      await prisma.businessHour.upsert({
        where: { weekday: h.weekday },
        create: {
          weekday: h.weekday,
          openMinutes: typeof h.openMinutes === "number" ? h.openMinutes : null,
          closeMinutes:
            typeof h.closeMinutes === "number" ? h.closeMinutes : null,
          isClosed: !!h.isClosed,
        },
        update: {
          openMinutes: typeof h.openMinutes === "number" ? h.openMinutes : null,
          closeMinutes:
            typeof h.closeMinutes === "number" ? h.closeMinutes : null,
          isClosed: !!h.isClosed,
        },
      });
    }
  }

  // 1.5) Holidays（无 unique 约束，date 做 updateMany + 不存在则 create）
  if (Array.isArray(s.holidays)) {
    for (const h of s.holidays) {
      const date = toDateOrNull(h.date);
      if (!date) continue;

      const data = {
        date,
        name: toCreateOptional(h.name),
        isClosed: typeof h.isClosed === "boolean" ? h.isClosed : true,
        openMinutes: typeof h.openMinutes === "number" ? h.openMinutes : null,
        closeMinutes:
          typeof h.closeMinutes === "number" ? h.closeMinutes : null,
      };

      const updated = await prisma.holiday.updateMany({
        where: { date },
        data: {
          name: data.name,
          isClosed: data.isClosed,
          openMinutes: data.openMinutes,
          closeMinutes: data.closeMinutes,
        },
      });

      if (updated.count === 0) {
        await prisma.holiday.create({ data });
      }
    }
  }

  // 2) Categories
  if (Array.isArray(s.categories)) {
    for (const c of s.categories) {
      await prisma.menuCategory.upsert({
        where: { stableId: c.stableId },
        create: {
          stableId: c.stableId,
          nameEn: c.nameEn,
          nameZh: typeof c.nameZh === "undefined" ? null : c.nameZh,
          sortOrder: c.sortOrder ?? 0,
          isActive: typeof c.isActive === "boolean" ? c.isActive : true,
          deletedAt: null,
        },
        update: {
          nameEn: c.nameEn,
          nameZh: typeof c.nameZh === "undefined" ? null : c.nameZh,
          sortOrder: c.sortOrder ?? 0,
          isActive: typeof c.isActive === "boolean" ? c.isActive : true,
          deletedAt: null,
        },
      });
    }
  }

  // 3) Option Group Templates
  if (Array.isArray(s.templateGroups)) {
    for (const g of s.templateGroups) {
      await prisma.menuOptionGroupTemplate.upsert({
        where: { stableId: g.stableId },
        create: {
          stableId: g.stableId,
          nameEn: g.nameEn,
          nameZh: typeof g.nameZh === "undefined" ? null : g.nameZh,
          sortOrder: g.sortOrder ?? 0,
          defaultMinSelect:
            typeof g.defaultMinSelect === "number" ? g.defaultMinSelect : 0,
          defaultMaxSelect:
            typeof g.defaultMaxSelect === "number" ? g.defaultMaxSelect : null,
          isAvailable:
            typeof g.isAvailable === "boolean" ? g.isAvailable : true,
          tempUnavailableUntil: toDateOrNull(g.tempUnavailableUntil),
          deletedAt: null,
        },
        update: {
          nameEn: g.nameEn,
          nameZh: typeof g.nameZh === "undefined" ? null : g.nameZh,
          sortOrder: g.sortOrder ?? 0,
          defaultMinSelect:
            typeof g.defaultMinSelect === "number" ? g.defaultMinSelect : 0,
          defaultMaxSelect:
            typeof g.defaultMaxSelect === "number" ? g.defaultMaxSelect : null,
          isAvailable:
            typeof g.isAvailable === "boolean" ? g.isAvailable : true,
          tempUnavailableUntil: toDateOrNull(g.tempUnavailableUntil),
          deletedAt: null,
        },
      });
    }
  }

  // 4) Options (MenuOptionTemplateChoice)
  if (Array.isArray(s.options)) {
    for (const o of s.options) {
      if (!o.templateGroupStableId) continue;

      await prisma.menuOptionTemplateChoice.upsert({
        where: { stableId: o.stableId },
        create: {
          stableId: o.stableId,
          templateGroup: { connect: { stableId: o.templateGroupStableId } },
          nameEn: o.nameEn,
          nameZh: typeof o.nameZh === "undefined" ? null : o.nameZh,
          priceDeltaCents: o.priceDeltaCents ?? 0,
          targetItemStableId:
            typeof o.targetItemStableId === "string" ? o.targetItemStableId : null,
          sortOrder: o.sortOrder ?? 0,
          isAvailable:
            typeof o.isAvailable === "boolean" ? o.isAvailable : true,
          tempUnavailableUntil: toDateOrNull(o.tempUnavailableUntil),
          deletedAt: null,
        },
        update: {
          templateGroup: { connect: { stableId: o.templateGroupStableId } },
          nameEn: o.nameEn,
          nameZh: typeof o.nameZh === "undefined" ? null : o.nameZh,
          priceDeltaCents: o.priceDeltaCents ?? 0,
          targetItemStableId:
            typeof o.targetItemStableId === "string" ? o.targetItemStableId : null,
          sortOrder: o.sortOrder ?? 0,
          isAvailable:
            typeof o.isAvailable === "boolean" ? o.isAvailable : true,
          tempUnavailableUntil: toDateOrNull(o.tempUnavailableUntil),
          deletedAt: null,
        },
      });
    }
  }

  // 4.5) Option Choice Links (MenuOptionChoiceLink)
  if (Array.isArray(s.optionChoiceLinks)) {
    const optionRows = await prisma.menuOptionTemplateChoice.findMany({
      where: { deletedAt: null },
      select: { id: true, stableId: true },
    });
    const optionIdByStable = new Map(optionRows.map((r) => [r.stableId, r.id]));

    for (const l of s.optionChoiceLinks) {
      const parentStableId = l?.parentOptionStableId;
      const childStableId = l?.childOptionStableId;
      if (!parentStableId || !childStableId) continue;

      const parentId = optionIdByStable.get(parentStableId);
      const childId = optionIdByStable.get(childStableId);
      if (!parentId || !childId) continue;

      const exists = await prisma.menuOptionChoiceLink.findUnique({
        where: {
          parentOptionId_childOptionId: {
            parentOptionId: parentId,
            childOptionId: childId,
          },
        },
        select: { id: true },
      });

      if (!exists) {
        await prisma.menuOptionChoiceLink.create({
          data: {
            parentOption: { connect: { id: parentId } },
            childOption: { connect: { id: childId } },
          },
        });
      }
    }
  }

  // 5) Items
  if (Array.isArray(s.items)) {
    for (const i of s.items) {
      if (!i.categoryStableId) continue;

      await prisma.menuItem.upsert({
        where: { stableId: i.stableId },
        create: {
          stableId: i.stableId,
          category: { connect: { stableId: i.categoryStableId } },
          nameEn: i.nameEn,
          nameZh: typeof i.nameZh === "undefined" ? null : i.nameZh,
          basePriceCents: i.basePriceCents,
          sortOrder: i.sortOrder ?? 0,
          imageUrl: typeof i.imageUrl === "undefined" ? null : i.imageUrl,
          ingredientsEn:
            typeof i.ingredientsEn === "undefined" ? null : i.ingredientsEn,
          ingredientsZh:
            typeof i.ingredientsZh === "undefined" ? null : i.ingredientsZh,
          isAvailable:
            typeof i.isAvailable === "boolean" ? i.isAvailable : true,
          visibility: i.visibility ?? "PUBLIC",
          tempUnavailableUntil: toDateOrNull(i.tempUnavailableUntil),
          deletedAt: null,
        },
        update: {
          category: { connect: { stableId: i.categoryStableId } },
          nameEn: i.nameEn,
          nameZh: typeof i.nameZh === "undefined" ? null : i.nameZh,
          basePriceCents: i.basePriceCents,
          sortOrder: i.sortOrder ?? 0,
          imageUrl: typeof i.imageUrl === "undefined" ? null : i.imageUrl,
          ingredientsEn:
            typeof i.ingredientsEn === "undefined" ? null : i.ingredientsEn,
          ingredientsZh:
            typeof i.ingredientsZh === "undefined" ? null : i.ingredientsZh,
          isAvailable:
            typeof i.isAvailable === "boolean" ? i.isAvailable : true,
          visibility: i.visibility ?? "PUBLIC",
          tempUnavailableUntil: toDateOrNull(i.tempUnavailableUntil),
          deletedAt: null,
        },
      });
    }
  }

  // 5.5) Daily Specials
  if (Array.isArray(s.dailySpecials)) {
    for (const ds of s.dailySpecials) {
      if (!ds.stableId || !ds.itemStableId) continue;

      await prisma.menuDailySpecial.upsert({
        where: { stableId: ds.stableId },
        create: {
          stableId: ds.stableId,
          weekday: ds.weekday,
          item: { connect: { stableId: ds.itemStableId } },

          pricingMode: ds.pricingMode,
          overridePriceCents:
            typeof ds.overridePriceCents === "number" ? ds.overridePriceCents : null,
          discountDeltaCents:
            typeof ds.discountDeltaCents === "number" ? ds.discountDeltaCents : null,
          discountPercent:
            typeof ds.discountPercent === "number" ? ds.discountPercent : null,

          startDate: toDateOrNull(ds.startDate),
          endDate: toDateOrNull(ds.endDate),
          startMinutes:
            typeof ds.startMinutes === "number" ? ds.startMinutes : null,
          endMinutes: typeof ds.endMinutes === "number" ? ds.endMinutes : null,

          disallowCoupons:
            typeof ds.disallowCoupons === "boolean" ? ds.disallowCoupons : true,
          isEnabled: typeof ds.isEnabled === "boolean" ? ds.isEnabled : true,
          sortOrder: typeof ds.sortOrder === "number" ? ds.sortOrder : 0,

          deletedAt: null,
        },
        update: {
          weekday: ds.weekday,
          item: { connect: { stableId: ds.itemStableId } },

          pricingMode: ds.pricingMode,
          overridePriceCents:
            typeof ds.overridePriceCents === "number" ? ds.overridePriceCents : null,
          discountDeltaCents:
            typeof ds.discountDeltaCents === "number" ? ds.discountDeltaCents : null,
          discountPercent:
            typeof ds.discountPercent === "number" ? ds.discountPercent : null,

          startDate: toDateOrNull(ds.startDate),
          endDate: toDateOrNull(ds.endDate),
          startMinutes:
            typeof ds.startMinutes === "number" ? ds.startMinutes : null,
          endMinutes: typeof ds.endMinutes === "number" ? ds.endMinutes : null,

          disallowCoupons:
            typeof ds.disallowCoupons === "boolean" ? ds.disallowCoupons : true,
          isEnabled: typeof ds.isEnabled === "boolean" ? ds.isEnabled : true,
          sortOrder: typeof ds.sortOrder === "number" ? ds.sortOrder : 0,

          deletedAt: null,
        },
      });
    }
  }

  // 6) Join table MenuItemOptionGroup
  if (Array.isArray(s.itemOptionGroups)) {
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
          minSelect: x.minSelect ?? 0,
          maxSelect: typeof x.maxSelect === "number" ? x.maxSelect : null,
          sortOrder: x.sortOrder ?? 0,
          isEnabled: typeof x.isEnabled === "boolean" ? x.isEnabled : true,
        },
        update: {
          minSelect: x.minSelect ?? 0,
          maxSelect: typeof x.maxSelect === "number" ? x.maxSelect : null,
          sortOrder: x.sortOrder ?? 0,
          isEnabled: typeof x.isEnabled === "boolean" ? x.isEnabled : true,
        },
      });
    }
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
