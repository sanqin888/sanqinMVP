// apps/api/src/admin/members/admin-members.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PhoneVerificationStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { normalizeEmail } from '../../common/utils/email';
import { generateStableId } from '../../common/utils/stable-id';
import { LoyaltyService } from '../../loyalty/loyalty.service';
import { MembershipService } from '../../membership/membership.service';
import { PhoneVerificationService } from '../../phone-verification/phone-verification.service';
import { PrismaService } from '../../prisma/prisma.service';

const MICRO_PER_POINT = 1_000_000;
const DEFAULT_TIER_THRESHOLD_SILVER = 1000 * 100;
const DEFAULT_TIER_THRESHOLD_GOLD = 10000 * 100;
const DEFAULT_TIER_THRESHOLD_PLATINUM = 30000 * 100;
const POS_RECHARGE_PURPOSE = 'pos-recharge';

const UseRuleSchema = z
  .discriminatedUnion('type', [
    z
      .object({
        type: z.literal('FIXED_CENTS'),
        applyTo: z.union([z.literal('ORDER'), z.literal('ITEM')]),
        itemStableIds: z.array(z.string().min(1)).optional(),
        amountCents: z.number().int().positive(),
        constraints: z
          .object({
            minSubtotalCents: z.number().int().min(0),
          })
          .optional(),
      })
      .passthrough(),
    z
      .object({
        type: z.literal('PERCENT'),
        applyTo: z.union([z.literal('ORDER'), z.literal('ITEM')]),
        itemStableIds: z.array(z.string().min(1)).optional(),
        percentOff: z.number().int().min(1).max(100),
        constraints: z
          .object({
            minSubtotalCents: z.number().int().min(0),
          })
          .optional(),
      })
      .passthrough(),
  ])
  .superRefine((value, ctx) => {
    if (value.applyTo === 'ITEM') {
      if (!value.itemStableIds || value.itemStableIds.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'itemStableIds is required when applyTo is ITEM',
        });
      }
    } else if (value.itemStableIds && value.itemStableIds.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'itemStableIds must be empty when applyTo is ORDER',
      });
    }
  });

type Tier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

type MemberListParams = {
  search?: string;
  tier?: string;
  status?: string;
  registeredFrom?: string;
  registeredTo?: string;
  page?: string;
  pageSize?: string;
};

@Injectable()
export class AdminMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
    private readonly membership: MembershipService,
    private readonly phoneVerification: PhoneVerificationService,
  ) {}

  private maskPhone(phone: string): string {
    const trimmed = phone.trim();
    if (!trimmed) return '';
    if (trimmed.length <= 4) return '*'.repeat(trimmed.length);
    const head = trimmed.slice(0, Math.min(3, trimmed.length - 4));
    const tail = trimmed.slice(-4);
    return `${head}****${tail}`;
  }

  private normalizePhone(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return trimmed.replace(/\s+/g, '').replace(/-/g, '');
  }

  private resolveRechargePhone(params: {
    userPhone: string | null;
    inputPhone?: string;
  }): string {
    const normalizedInput = this.normalizePhone(params.inputPhone);
    const normalizedUser = this.normalizePhone(params.userPhone);

    if (normalizedInput) {
      if (normalizedUser && normalizedInput !== normalizedUser) {
        throw new BadRequestException('phone does not match member profile');
      }
      return normalizedInput;
    }

    if (!normalizedUser) {
      throw new BadRequestException('member does not have a phone');
    }

    return normalizedUser;
  }

  private parseDateInput(value?: string): Date | undefined {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    return parsed;
  }

  private parsePage(value?: string, fallback = 1): number {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
  }

  private parsePageSize(value?: string, fallback = 20): number {
    const parsed = this.parsePage(value, fallback);
    return Math.min(parsed, 100);
  }

  private parseTier(value?: string): Tier | undefined {
    if (!value) return undefined;
    const normalized = value.trim().toUpperCase();
    if (
      normalized === 'BRONZE' ||
      normalized === 'SILVER' ||
      normalized === 'GOLD' ||
      normalized === 'PLATINUM'
    ) {
      return normalized;
    }
    throw new BadRequestException('Invalid tier');
  }

  private parseStatus(value?: string): 'ACTIVE' | 'DISABLED' | undefined {
    if (!value) return undefined;
    const normalized = value.trim().toUpperCase();
    if (normalized === 'ACTIVE' || normalized === 'DISABLED') {
      return normalized;
    }
    throw new BadRequestException('Invalid status');
  }

  private async getUserByStableId(userStableId: string) {
    const stable = userStableId.trim();
    if (!stable) {
      throw new BadRequestException('userStableId is required');
    }
    const user = await this.prisma.user.findUnique({
      where: { userStableId: stable },
    });
    if (!user) {
      throw new NotFoundException('member not found');
    }
    return user;
  }

  private async getTierThresholds() {
    const config = await this.prisma.businessConfig.findUnique({
      where: { id: 1 },
    });

    return {
      SILVER:
        typeof config?.tierThresholdSilver === 'number'
          ? config.tierThresholdSilver
          : DEFAULT_TIER_THRESHOLD_SILVER,
      GOLD:
        typeof config?.tierThresholdGold === 'number'
          ? config.tierThresholdGold
          : DEFAULT_TIER_THRESHOLD_GOLD,
      PLATINUM:
        typeof config?.tierThresholdPlatinum === 'number'
          ? config.tierThresholdPlatinum
          : DEFAULT_TIER_THRESHOLD_PLATINUM,
    };
  }

  private computeTierProgress(
    tier: Tier,
    lifetimeSpendCents: number,
    thresholds: {
      SILVER: number;
      GOLD: number;
      PLATINUM: number;
    },
  ) {
    if (tier === 'PLATINUM') {
      return { nextTier: null, spendToNextTierCents: 0 };
    }

    if (tier === 'GOLD') {
      return {
        nextTier: 'PLATINUM',
        spendToNextTierCents: Math.max(
          0,
          thresholds.PLATINUM - lifetimeSpendCents,
        ),
      };
    }

    if (tier === 'SILVER') {
      return {
        nextTier: 'GOLD',
        spendToNextTierCents: Math.max(0, thresholds.GOLD - lifetimeSpendCents),
      };
    }

    return {
      nextTier: 'SILVER',
      spendToNextTierCents: Math.max(0, thresholds.SILVER - lifetimeSpendCents),
    };
  }

  private couponStatus(coupon: {
    expiresAt: Date | null;
    usedAt: Date | null;
  }): 'active' | 'used' | 'expired' {
    if (coupon.usedAt) return 'used';
    if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
      return 'expired';
    }
    return 'active';
  }

  async listMembers(params: MemberListParams) {
    const page = this.parsePage(params.page, 1);
    const pageSize = this.parsePageSize(params.pageSize, 20);
    const tier = this.parseTier(params.tier);
    const status = this.parseStatus(params.status);

    const where: Prisma.UserWhereInput = {};

    if (status) {
      where.status = status;
    }

    const registeredFrom = this.parseDateInput(params.registeredFrom);
    const registeredTo = this.parseDateInput(params.registeredTo);

    if (registeredFrom || registeredTo) {
      where.createdAt = {
        ...(registeredFrom ? { gte: registeredFrom } : {}),
        ...(registeredTo ? { lte: registeredTo } : {}),
      };
    }

    const search = params.search?.trim();
    if (search) {
      const normalizedPhone = this.normalizePhone(search);
      where.OR = [
        {
          userStableId: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          email: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          phone: {
            contains: search,
          },
        },
        ...(normalizedPhone
          ? [
              {
                phone: {
                  contains: normalizedPhone,
                },
              },
            ]
          : []),
      ];
    }

    if (tier) {
      const tierAccounts = await this.prisma.loyaltyAccount.findMany({
        where: { tier },
        select: { userId: true },
      });
      const userIds = tierAccounts.map((account) => account.userId);
      if (userIds.length === 0) {
        return { items: [], page, pageSize, total: 0 };
      }
      where.id = { in: userIds };
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          userStableId: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    const userIds = users.map((user) => user.id);
    const accounts = await this.prisma.loyaltyAccount.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        pointsMicro: true,
        tier: true,
        lifetimeSpendCents: true,
      },
    });
    const accountMap = new Map(
      accounts.map((account) => [account.userId, account]),
    );

    return {
      page,
      pageSize,
      total,
      items: users.map((user) => {
        const account = accountMap.get(user.id);
        return {
          userStableId: user.userStableId,
          displayName: user.name,
          email: user.email ?? null,
          phone: user.phone ? this.maskPhone(user.phone) : null,
          tier: account?.tier ?? 'BRONZE',
          points: account ? Number(account.pointsMicro) / MICRO_PER_POINT : 0,
          lifetimeSpendCents: account?.lifetimeSpendCents ?? 0,
          status: user.status,
          createdAt: user.createdAt.toISOString(),
        };
      }),
    };
  }

  async getMemberDetail(userStableId: string) {
    const user = await this.getUserByStableId(userStableId);
    const [referrer, account, thresholds] = await Promise.all([
      user.referredByUserId
        ? this.prisma.user.findUnique({
            where: { id: user.referredByUserId },
            select: { userStableId: true, name: true, email: true },
          })
        : null,
      this.loyalty.ensureAccount(user.id),
      this.getTierThresholds(),
    ]);
    const availableDiscountCents =
      await this.loyalty.maxRedeemableCentsFromBalance(account.pointsMicro);

    const lifetimeSpendCents = account.lifetimeSpendCents ?? 0;
    const tierProgress = this.computeTierProgress(
      account.tier,
      lifetimeSpendCents,
      thresholds,
    );

    return {
      userStableId: user.userStableId,
      displayName: user.name,
      email: user.email,
      phone: user.phone,
      phoneVerifiedAt: user.phoneVerifiedAt?.toISOString() ?? null,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      marketingEmailOptIn: user.marketingEmailOptIn ?? false,
      birthdayMonth: user.birthdayMonth ?? null,
      birthdayDay: user.birthdayDay ?? null,
      referrer: referrer
        ? {
            userStableId: referrer.userStableId,
            name: referrer.name,
            email: referrer.email,
          }
        : null,
      availableDiscountCents,
      account: {
        tier: account.tier,
        points: Number(account.pointsMicro) / MICRO_PER_POINT,
        lifetimeSpendCents,
        nextTier: tierProgress.nextTier,
        spendToNextTierCents: tierProgress.spendToNextTierCents,
      },
    };
  }

  async getLoyaltyLedger(userStableId: string, limitRaw?: string) {
    const user = await this.getUserByStableId(userStableId);
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) || 50 : 50;

    const account = await this.loyalty.ensureAccount(user.id);
    const entries = await this.prisma.loyaltyLedger.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        ledgerStableId: true,
        createdAt: true,
        type: true,
        orderId: true,
        deltaMicro: true,
        balanceAfterMicro: true,
        note: true,
      },
    });

    const orderIds = Array.from(
      new Set(
        entries
          .map((entry) => entry.orderId)
          .filter((value): value is string => typeof value === 'string'),
      ),
    );

    const orderStableById = new Map<string, string>();
    if (orderIds.length > 0) {
      const rows = await this.prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, orderStableId: true },
      });
      for (const row of rows) {
        orderStableById.set(row.id, row.orderStableId);
      }
    }

    return {
      entries: entries.map((entry) => {
        const orderStableId =
          entry.orderId != null
            ? orderStableById.get(entry.orderId)
            : undefined;
        return {
          ledgerStableId: entry.ledgerStableId,
          createdAt: entry.createdAt.toISOString(),
          type: entry.type,
          deltaPoints: Number(entry.deltaMicro) / MICRO_PER_POINT,
          balanceAfterPoints: Number(entry.balanceAfterMicro) / MICRO_PER_POINT,
          note: entry.note ?? undefined,
          ...(orderStableId ? { orderStableId } : {}),
        };
      }),
    };
  }

  async listOrders(userStableId: string, limitRaw?: string) {
    const user = await this.getUserByStableId(userStableId);
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) || 50 : 50;

    const orders = await this.prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        orderStableId: true,
        createdAt: true,
        status: true,
        totalCents: true,
        fulfillmentType: true,
        deliveryType: true,
      },
    });

    return {
      orders: orders.map((order) => ({
        orderStableId: order.orderStableId,
        createdAt: order.createdAt.toISOString(),
        status: order.status,
        totalCents: order.totalCents,
        fulfillmentType: order.fulfillmentType,
        deliveryType: order.deliveryType,
      })),
    };
  }

  async listCoupons(userStableId: string) {
    const user = await this.getUserByStableId(userStableId);
    const coupons = await this.prisma.coupon.findMany({
      where: { userId: user.id },
      orderBy: [{ expiresAt: 'asc' }, { issuedAt: 'desc' }],
    });

    return coupons.map((coupon) => ({
      couponStableId: coupon.couponStableId,
      title: coupon.title,
      code: coupon.code,
      discountCents: coupon.discountCents,
      minSpendCents: coupon.minSpendCents ?? undefined,
      expiresAt: coupon.expiresAt?.toISOString(),
      issuedAt: coupon.issuedAt.toISOString(),
      status: this.couponStatus({
        expiresAt: coupon.expiresAt,
        usedAt: coupon.usedAt,
      }),
      source: coupon.source ?? undefined,
    }));
  }

  async listAddresses(userStableId: string) {
    const user = await this.getUserByStableId(userStableId);
    const addresses = await this.prisma.userAddress.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return addresses.map((addr) => ({
      addressStableId: addr.addressStableId,
      label: addr.label,
      receiver: addr.receiver,
      phone: addr.phone ?? '',
      addressLine1: addr.addressLine1,
      addressLine2: addr.addressLine2 ?? '',
      remark: addr.remark ?? '',
      city: addr.city,
      province: addr.province,
      postalCode: addr.postalCode,
      isDefault: addr.isDefault,
    }));
  }

  async getDeviceManagement(userStableId: string) {
    const user = await this.getUserByStableId(userStableId);
    return this.membership.getDeviceManagement({ userId: user.id });
  }

  async revokeSession(userStableId: string, sessionId: string) {
    const user = await this.getUserByStableId(userStableId);
    await this.membership.revokeSession({ userId: user.id, sessionId });
  }

  async revokeTrustedDevice(userStableId: string, deviceId: string) {
    const user = await this.getUserByStableId(userStableId);
    await this.membership.revokeTrustedDevice({ userId: user.id, deviceId });
  }

  async updateMember(
    userStableId: string,
    body: {
      name?: string | null;
      email?: string | null;
      phone?: string | null;
      birthdayMonth?: number | null;
      birthdayDay?: number | null;
    },
  ) {
    const user = await this.getUserByStableId(userStableId);

    const updateData: Prisma.UserUpdateInput = {};

    if (body.name !== undefined) {
      const trimmed = body.name?.trim();
      updateData.name = trimmed && trimmed.length > 0 ? trimmed : null;
    }

    if (body.email !== undefined) {
      const normalizedEmail = normalizeEmail(body.email);
      if (normalizedEmail) {
        const existing = await this.prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true },
        });
        if (existing && existing.id !== user.id) {
          throw new BadRequestException('email already in use');
        }
      }
      updateData.email = normalizedEmail;
    }

    if (body.phone !== undefined) {
      const normalizedPhone = this.normalizePhone(body.phone);
      if (normalizedPhone) {
        const existing = await this.prisma.user.findUnique({
          where: { phone: normalizedPhone },
          select: { id: true },
        });
        if (existing && existing.id !== user.id) {
          throw new BadRequestException('phone already in use');
        }
      }
      if (normalizedPhone !== user.phone) {
        updateData.phone = normalizedPhone;
        updateData.phoneVerifiedAt = null;
      }
    }

    const wantsBirthdayUpdate =
      body.birthdayMonth !== undefined || body.birthdayDay !== undefined;
    if (wantsBirthdayUpdate) {
      if (body.birthdayMonth == null && body.birthdayDay == null) {
        updateData.birthdayMonth = null;
        updateData.birthdayDay = null;
      } else {
        const month = body.birthdayMonth;
        const day = body.birthdayDay;
        const validBirthday =
          typeof month === 'number' &&
          typeof day === 'number' &&
          Number.isInteger(month) &&
          Number.isInteger(day) &&
          month >= 1 &&
          month <= 12 &&
          day >= 1 &&
          day <= 31;
        if (!validBirthday) {
          throw new BadRequestException('invalid birthday');
        }
        updateData.birthdayMonth = month;
        updateData.birthdayDay = day;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return {
        userStableId: user.userStableId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        birthdayMonth: user.birthdayMonth,
        birthdayDay: user.birthdayDay,
      };
    }

    const updated = await this.prisma.user.update({
      where: { userStableId },
      data: updateData,
      select: {
        userStableId: true,
        name: true,
        email: true,
        phone: true,
        birthdayMonth: true,
        birthdayDay: true,
        phoneVerifiedAt: true,
      },
    });

    return {
      ...updated,
      phoneVerifiedAt: updated.phoneVerifiedAt?.toISOString() ?? null,
    };
  }

  async adjustPoints(
    userStableId: string,
    body: {
      deltaPoints?: number;
      idempotencyKey?: string;
      note?: string;
    },
  ) {
    const idempotencyKey =
      typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
        ? body.idempotencyKey.trim()
        : generateStableId();

    return this.loyalty.adjustPointsManual({
      userStableId,
      deltaPoints: body.deltaPoints ?? NaN,
      idempotencyKey,
      note: body.note,
    });
  }

  async setMemberStatus(userStableId: string, disabled: boolean) {
    const user = await this.getUserByStableId(userStableId);
    const status = disabled ? 'DISABLED' : 'ACTIVE';
    if (user.status === status) {
      return { userStableId: user.userStableId, status: user.status };
    }

    const updated = await this.prisma.user.update({
      where: { userStableId },
      data: { status },
      select: { userStableId: true, status: true },
    });

    return updated;
  }

  async sendRechargeCode(
    userStableId: string,
    body: {
      phone?: string;
      locale?: string;
    },
  ) {
    const user = await this.getUserByStableId(userStableId);
    const phone = this.resolveRechargePhone({
      userPhone: user.phone,
      inputPhone: body.phone,
    });

    return this.phoneVerification.sendCode({
      phone,
      locale: body.locale,
      purpose: POS_RECHARGE_PURPOSE,
    });
  }

  async verifyRechargeCode(
    userStableId: string,
    body: {
      phone?: string;
      code?: string;
    },
  ) {
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!code) {
      throw new BadRequestException('code is required');
    }

    const user = await this.getUserByStableId(userStableId);
    const phone = this.resolveRechargePhone({
      userPhone: user.phone,
      inputPhone: body.phone,
    });

    return this.phoneVerification.verifyCode({
      phone,
      code,
      purpose: POS_RECHARGE_PURPOSE,
    });
  }

  async rechargeWithVerification(
    userStableId: string,
    body: {
      amountCents?: number;
      bonusPoints?: number;
      verificationToken?: string;
      idempotencyKey?: string;
    },
  ) {
    const amountCents =
      typeof body.amountCents === 'number' ? Math.round(body.amountCents) : NaN;
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new BadRequestException('amountCents must be a positive number');
    }

    const verificationToken =
      typeof body.verificationToken === 'string'
        ? body.verificationToken.trim()
        : '';
    if (!verificationToken) {
      throw new BadRequestException('verificationToken is required');
    }

    const user = await this.getUserByStableId(userStableId);
    const phone = this.resolveRechargePhone({ userPhone: user.phone });
    const now = new Date();

    const record = await this.prisma.phoneVerification.findUnique({
      where: { token: verificationToken },
    });

    if (
      !record ||
      record.status !== PhoneVerificationStatus.VERIFIED ||
      record.purpose !== POS_RECHARGE_PURPOSE ||
      this.normalizePhone(record.phone) !== phone
    ) {
      throw new BadRequestException('verificationToken is invalid');
    }

    if (record.expiresAt.getTime() < now.getTime()) {
      throw new BadRequestException('verificationToken has expired');
    }

    const updated = await this.prisma.phoneVerification.updateMany({
      where: {
        token: verificationToken,
        status: PhoneVerificationStatus.VERIFIED,
        purpose: POS_RECHARGE_PURPOSE,
      },
      data: {
        status: PhoneVerificationStatus.CONSUMED,
        consumedAt: now,
      },
    });

    if (updated.count === 0) {
      throw new BadRequestException('verificationToken already used');
    }

    const idempotencyKey =
      typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
        ? body.idempotencyKey.trim()
        : generateStableId();

    const result = await this.loyalty.applyTopup({
      userStableId,
      amountCents,
      bonusPoints: body.bonusPoints,
      idempotencyKey,
    });

    return { userStableId, ...result };
  }

  async issueCoupon(
    userStableId: string,
    body: { couponTemplateStableId?: string; note?: string },
  ) {
    const templateStableId = body.couponTemplateStableId?.trim();
    if (!templateStableId) {
      throw new BadRequestException('couponTemplateStableId is required');
    }

    const [user, template] = await Promise.all([
      this.getUserByStableId(userStableId),
      this.prisma.couponTemplate.findUnique({
        where: { couponStableId: templateStableId },
      }),
    ]);

    if (!template) {
      throw new NotFoundException('coupon template not found');
    }
    if (template.status !== 'ACTIVE') {
      throw new BadRequestException('coupon template is not active');
    }

    const parsed = UseRuleSchema.safeParse(template.useRule);
    if (!parsed.success) {
      throw new BadRequestException(
        `Invalid useRule configuration: ${parsed.error.message}`,
      );
    }

    const rule = parsed.data as {
      type: 'FIXED_CENTS' | 'PERCENT';
      applyTo: 'ORDER' | 'ITEM';
      amountCents?: number;
      constraints?: { minSubtotalCents?: number };
      itemStableIds?: string[];
    };

    if (rule.type === 'PERCENT') {
      throw new BadRequestException('Percent coupons are not supported');
    }

    const unlockedItemStableIds =
      rule.applyTo === 'ITEM' ? (rule.itemStableIds ?? []) : [];

    const couponStableId = generateStableId();
    const now = new Date();
    const minSpendCents =
      typeof rule.constraints?.minSubtotalCents === 'number'
        ? rule.constraints.minSubtotalCents
        : null;

    const source = body.note?.trim() ? `Admin: ${body.note.trim()}` : 'Admin';

    await this.prisma.$transaction(async (tx) => {
      await tx.coupon.create({
        data: {
          couponStableId,
          userId: user.id,
          code: template.couponStableId,
          title: template.title ?? template.name,
          discountCents: rule.amountCents ?? 0,
          minSpendCents,
          expiresAt: template.validTo ?? null,
          issuedAt: now,
          source,
          fromTemplateId: template.id,
          unlockedItemStableIds,
          isActive: true,
          startsAt: template.validFrom ?? null,
          endsAt: template.validTo ?? null,
          stackingPolicy: 'EXCLUSIVE',
        },
      });

      await tx.userCoupon.create({
        data: {
          userStableId: user.userStableId,
          couponStableId,
          status: 'AVAILABLE',
          expiresAt: template.validTo ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });
    });

    return {
      couponStableId,
      userStableId: user.userStableId,
    };
  }
}
