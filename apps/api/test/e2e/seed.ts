import { createHash, createHmac } from 'node:crypto';
import argon2, { argon2id } from 'argon2';
import {
  AuthChallengeStatus,
  AuthChallengeType,
  LoyaltyTier,
  MenuItemVisibility,
  MessagingChannel,
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
const E2E_CUSTOMER_STABLE_ID = 'c000000000000000000000007';
const E2E_CUSTOMER_PHONE = '14165550111';
const E2E_CUSTOMER_PHONE_ADDRESS = '+14165550111';
const E2E_COUPON_STABLE_ID = 'c000000000000000000000008';
const E2E_CUSTOMER_LOGIN_CHALLENGE_ID = '00000000-0000-4000-8000-000000000009';
const E2E_CUSTOMER_LOGIN_CODE = '654321';

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
  const otpSecret = requireFixtureSecret('OTP_SECRET');
  const passwordHash = await argon2.hash(staffPassword, { type: argon2id });

  await prisma.brandConfig.upsert({
    where: { id: 1 },
    update: {
      brandNameEn: 'SanQ E2E',
      brandNameZh: 'SanQ E2E',
      siteUrl: 'https://e2e.invalid',
      emailFromNameEn: 'SanQ E2E',
      emailFromNameZh: 'SanQ E2E',
      emailFromAddress: 'no-reply@e2e.invalid',
      supportEmail: 'support@e2e.invalid',
      smsSignature: '[SanQ E2E]',
    },
    create: {
      id: 1,
      brandNameEn: 'SanQ E2E',
      brandNameZh: 'SanQ E2E',
      siteUrl: 'https://e2e.invalid',
      emailFromNameEn: 'SanQ E2E',
      emailFromNameZh: 'SanQ E2E',
      emailFromAddress: 'no-reply@e2e.invalid',
      supportEmail: 'support@e2e.invalid',
      smsSignature: '[SanQ E2E]',
    },
  });

  await prisma.loyaltyProgramPolicy.upsert({
    where: { id: 1 },
    update: {
      earnPtPerDollar: 0.01,
      redeemDollarPerPoint: 1,
      referralPtPerDollar: 0.01,
      tierMultiplierBronze: 1,
      tierMultiplierSilver: 2,
      tierMultiplierGold: 3,
      tierMultiplierPlatinum: 5,
      tierThresholdSilver: 100000,
      tierThresholdGold: 1000000,
      tierThresholdPlatinum: 3000000,
    },
    create: {
      id: 1,
      earnPtPerDollar: 0.01,
      redeemDollarPerPoint: 1,
      referralPtPerDollar: 0.01,
      tierMultiplierBronze: 1,
      tierMultiplierSilver: 2,
      tierMultiplierGold: 3,
      tierMultiplierPlatinum: 5,
      tierThresholdSilver: 100000,
      tierThresholdGold: 1000000,
      tierThresholdPlatinum: 3000000,
    },
  });

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

  const customerVerifiedAt = new Date('2026-01-01T00:00:00.000Z');
  const customer = await prisma.user.upsert({
    where: { phone: E2E_CUSTOMER_PHONE },
    update: {
      userStableId: E2E_CUSTOMER_STABLE_ID,
      email: 'e2e-customer@example.invalid',
      emailVerifiedAt: customerVerifiedAt,
      phoneVerifiedAt: customerVerifiedAt,
      firstName: 'E2E',
      lastName: 'Customer',
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      twoFactorEnabledAt: customerVerifiedAt,
      twoFactorMethod: TwoFactorMethod.SMS,
      language: UserLanguage.EN,
      birthdayYear: 1990,
      birthdayMonth: 1,
    },
    create: {
      userStableId: E2E_CUSTOMER_STABLE_ID,
      email: 'e2e-customer@example.invalid',
      emailVerifiedAt: customerVerifiedAt,
      phone: E2E_CUSTOMER_PHONE,
      phoneVerifiedAt: customerVerifiedAt,
      firstName: 'E2E',
      lastName: 'Customer',
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      twoFactorEnabledAt: customerVerifiedAt,
      twoFactorMethod: TwoFactorMethod.SMS,
      language: UserLanguage.EN,
      birthdayYear: 1990,
      birthdayMonth: 1,
    },
  });

  await prisma.loyaltyAccount.upsert({
    where: { userId: customer.id },
    update: {
      pointsMicro: 10_000_000n,
      balanceMicro: 20_000_000n,
      tier: LoyaltyTier.SILVER,
      lifetimeSpendCents: 12_500,
    },
    create: {
      userId: customer.id,
      pointsMicro: 10_000_000n,
      balanceMicro: 20_000_000n,
      tier: LoyaltyTier.SILVER,
      lifetimeSpendCents: 12_500,
    },
  });

  await prisma.authChallenge.upsert({
    where: { id: E2E_CUSTOMER_LOGIN_CHALLENGE_ID },
    update: {
      userId: null,
      type: AuthChallengeType.PHONE_VERIFY,
      status: AuthChallengeStatus.PENDING,
      channel: MessagingChannel.SMS,
      addressNorm: E2E_CUSTOMER_PHONE_ADDRESS,
      addressRaw: E2E_CUSTOMER_PHONE_ADDRESS,
      codeHash: createHmac('sha256', otpSecret)
        .update(E2E_CUSTOMER_LOGIN_CODE)
        .digest('hex'),
      tokenHash: null,
      purpose: 'membership-login',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      consumedAt: null,
      attempts: 0,
      maxAttempts: 5,
      ip: null,
      userAgent: null,
      messagingSendId: null,
    },
    create: {
      id: E2E_CUSTOMER_LOGIN_CHALLENGE_ID,
      userId: null,
      type: AuthChallengeType.PHONE_VERIFY,
      status: AuthChallengeStatus.PENDING,
      channel: MessagingChannel.SMS,
      addressNorm: E2E_CUSTOMER_PHONE_ADDRESS,
      addressRaw: E2E_CUSTOMER_PHONE_ADDRESS,
      codeHash: createHmac('sha256', otpSecret)
        .update(E2E_CUSTOMER_LOGIN_CODE)
        .digest('hex'),
      purpose: 'membership-login',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      attempts: 0,
      maxAttempts: 5,
    },
  });

  await prisma.coupon.upsert({
    where: { couponStableId: E2E_COUPON_STABLE_ID },
    update: {
      userId: customer.id,
      code: 'A5E2E100',
      title: 'A5 E2E $1 Coupon',
      discountCents: 100,
      discountPercent: null,
      minSpendCents: 500,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      usedAt: null,
      reservedAt: null,
      reservationAttemptId: null,
      reservationExpiresAt: null,
      orderId: null,
      source: 'A5_BROWSER_E2E',
      campaign: null,
      isFrozen: false,
      isActive: true,
      startsAt: null,
      endsAt: null,
    },
    create: {
      couponStableId: E2E_COUPON_STABLE_ID,
      userId: customer.id,
      code: 'A5E2E100',
      title: 'A5 E2E $1 Coupon',
      discountCents: 100,
      minSpendCents: 500,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      source: 'A5_BROWSER_E2E',
      isFrozen: false,
      isActive: true,
    },
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
