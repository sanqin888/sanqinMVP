import { createHash } from 'node:crypto';
import argon2, { argon2id } from 'argon2';
import {
  MenuItemVisibility,
  PosDeviceStatus,
  PrismaClient,
  TwoFactorMethod,
  UserLanguage,
  UserRole,
  UserStatus,
} from '@prisma/client';

const E2E_DATABASE_NAME = 'sanq_e2e';
const E2E_STORE_STABLE_ID = 'e2e_store';
const E2E_MENU_CATEGORY_STABLE_ID = 'c000000000000000000000001';
const E2E_MENU_ITEM_STABLE_ID = 'c000000000000000000000002';
const E2E_POS_DEVICE_STABLE_ID = 'c000000000000000000000003';

const prisma = new PrismaClient();

function assertDisposableDatabase(): void {
  if (process.env.SANQ_E2E !== '1') {
    throw new Error('SANQ_E2E=1 is required before seeding browser E2E data');
  }
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      'NODE_ENV=test is required before seeding browser E2E data',
    );
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for browser E2E seeding');
  }

  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\/+/, '');
  const isLocalHost =
    parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';

  if (!isLocalHost || databaseName !== E2E_DATABASE_NAME) {
    throw new Error(
      `Refusing browser E2E seed outside local disposable ${E2E_DATABASE_NAME}`,
    );
  }
}

function requireFixtureSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.length < 12) {
    throw new Error(
      `${name} must be set to an E2E-only value of at least 12 characters`,
    );
  }
  return value;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function upsertStaffIdentity(params: {
  email: string;
  userStableId: string;
  role: UserRole;
  passwordHash: string;
  phone?: string;
}): Promise<void> {
  const verifiedAt = new Date('2026-01-01T00:00:00.000Z');
  await prisma.user.upsert({
    where: { email: params.email },
    update: {
      role: params.role,
      status: UserStatus.ACTIVE,
      passwordHash: params.passwordHash,
      emailVerifiedAt: verifiedAt,
      ...(params.phone
        ? {
            phone: params.phone,
            phoneVerifiedAt: verifiedAt,
            twoFactorEnabledAt: verifiedAt,
            twoFactorMethod: TwoFactorMethod.SMS,
          }
        : {}),
    },
    create: {
      userStableId: params.userStableId,
      email: params.email,
      emailVerifiedAt: verifiedAt,
      role: params.role,
      status: UserStatus.ACTIVE,
      passwordHash: params.passwordHash,
      language: UserLanguage.EN,
      ...(params.phone
        ? {
            phone: params.phone,
            phoneVerifiedAt: verifiedAt,
            twoFactorEnabledAt: verifiedAt,
            twoFactorMethod: TwoFactorMethod.SMS,
          }
        : {}),
    },
  });
}

async function main(): Promise<void> {
  assertDisposableDatabase();

  const staffPassword = requireFixtureSecret('SANQ_E2E_STAFF_PASSWORD');
  const enrollmentCode = requireFixtureSecret('SANQ_E2E_POS_ENROLLMENT_CODE');
  const passwordHash = await argon2.hash(staffPassword, { type: argon2id });

  const store = await prisma.store.upsert({
    where: { storeStableId: E2E_STORE_STABLE_ID },
    update: {
      name: 'SanQ E2E Store',
      isActive: true,
    },
    create: {
      storeStableId: E2E_STORE_STABLE_ID,
      name: 'SanQ E2E Store',
      isActive: true,
    },
  });

  await prisma.storeConfig.upsert({
    where: { storeId: store.id },
    update: {
      timezone: 'America/Toronto',
      autoAcceptOnlineOrders: true,
      isTemporarilyClosed: false,
    },
    create: {
      storeId: store.id,
      timezone: 'America/Toronto',
      autoAcceptOnlineOrders: true,
      isTemporarilyClosed: false,
    },
  });

  for (let weekday = 0; weekday < 7; weekday += 1) {
    await prisma.businessHour.upsert({
      where: {
        storeDbId_weekday: {
          storeDbId: store.id,
          weekday,
        },
      },
      update: {
        isClosed: false,
        openMinutes: 0,
        closeMinutes: 1440,
      },
      create: {
        storeDbId: store.id,
        weekday,
        isClosed: false,
        openMinutes: 0,
        closeMinutes: 1440,
      },
    });
  }

  const category = await prisma.menuCategory.upsert({
    where: { stableId: E2E_MENU_CATEGORY_STABLE_ID },
    update: {
      nameEn: 'E2E Category',
      nameZh: 'E2E 分类',
      isActive: true,
      deletedAt: null,
      sortOrder: 1,
    },
    create: {
      stableId: E2E_MENU_CATEGORY_STABLE_ID,
      nameEn: 'E2E Category',
      nameZh: 'E2E 分类',
      isActive: true,
      sortOrder: 1,
    },
  });

  await prisma.menuItem.upsert({
    where: { stableId: E2E_MENU_ITEM_STABLE_ID },
    update: {
      categoryId: category.id,
      nameEn: 'E2E Item',
      nameZh: 'E2E 测试商品',
      basePriceCents: 500,
      isAvailable: true,
      visibility: MenuItemVisibility.PUBLIC,
      isVisibleOnMainMenu: true,
      deletedAt: null,
      sortOrder: 1,
    },
    create: {
      stableId: E2E_MENU_ITEM_STABLE_ID,
      categoryId: category.id,
      nameEn: 'E2E Item',
      nameZh: 'E2E 测试商品',
      basePriceCents: 500,
      isAvailable: true,
      visibility: MenuItemVisibility.PUBLIC,
      isVisibleOnMainMenu: true,
      sortOrder: 1,
    },
  });

  await upsertStaffIdentity({
    email: 'e2e-admin@example.invalid',
    userStableId: 'c000000000000000000000004',
    role: UserRole.ADMIN,
    passwordHash,
    phone: '+14165550101',
  });
  await upsertStaffIdentity({
    email: 'e2e-accountant@example.invalid',
    userStableId: 'c000000000000000000000005',
    role: UserRole.ACCOUNTANT,
    passwordHash,
  });
  await upsertStaffIdentity({
    email: 'e2e-staff@example.invalid',
    userStableId: 'c000000000000000000000006',
    role: UserRole.STAFF,
    passwordHash,
  });

  await prisma.posDevice.upsert({
    where: { deviceStableId: E2E_POS_DEVICE_STABLE_ID },
    update: {
      storeId: store.id,
      name: 'A5 E2E POS',
      status: PosDeviceStatus.ACTIVE,
      enrollmentKeyHash: sha256(enrollmentCode),
      deviceKeyHash: sha256('not-yet-claimed-e2e-device-key'),
      meta: { source: 'A5_BROWSER_E2E' },
    },
    create: {
      deviceStableId: E2E_POS_DEVICE_STABLE_ID,
      storeId: store.id,
      name: 'A5 E2E POS',
      status: PosDeviceStatus.ACTIVE,
      enrollmentKeyHash: sha256(enrollmentCode),
      deviceKeyHash: sha256('not-yet-claimed-e2e-device-key'),
      meta: { source: 'A5_BROWSER_E2E' },
    },
  });
}

void main().finally(async () => {
  await prisma.$disconnect();
});
