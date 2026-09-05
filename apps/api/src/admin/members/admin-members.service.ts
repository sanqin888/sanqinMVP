// apps/api/src/admin/members/admin-members.service.ts
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { normalizePhone } from '../../common/utils/phone';
import { generateStableId } from '../../common/utils/stable-id';
import { LoyaltyService } from '../../loyalty/loyalty.service';
import {
  LOYALTY_LEDGER_READER,
  LOYALTY_POLICY_READER,
  type LoyaltyLedgerReaderPort,
  type LoyaltyPolicyReaderPort,
} from '../../loyalty/public-api';
import {
  CUSTOMER_ADMINISTRATION,
  type CustomerAdministrationPort,
} from '../../membership/public-api';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ACCOUNT_SECURITY_ADMINISTRATION,
  AccountSecurityAdministrationError,
  type AccountSecurityAdministrationPort,
  MEMBER_RECHARGE_VERIFICATION,
  MemberRechargeVerificationError,
  type MemberRechargeVerificationPort,
} from '../../auth/public-api';

const MICRO_PER_POINT = 1_000_000;

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
type LedgerTarget = 'POINTS' | 'BALANCE';

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
    @Inject(LOYALTY_LEDGER_READER)
    private readonly loyaltyLedgerReader: LoyaltyLedgerReaderPort,
    @Inject(LOYALTY_POLICY_READER)
    private readonly loyaltyPolicyReader: LoyaltyPolicyReaderPort,
    @Inject(CUSTOMER_ADMINISTRATION)
    private readonly customerAdministration: CustomerAdministrationPort,
    @Inject(ACCOUNT_SECURITY_ADMINISTRATION)
    private readonly accountSecurityAdministration: AccountSecurityAdministrationPort,
    @Inject(MEMBER_RECHARGE_VERIFICATION)
    private readonly memberRechargeVerification: MemberRechargeVerificationPort,
  ) {}

  private maskPhone(phone: string): string {
    const trimmed = phone.trim();
    if (!trimmed) return '';
    if (trimmed.length <= 4) return '*'.repeat(trimmed.length);
    const head = trimmed.slice(0, Math.min(3, trimmed.length - 4));
    const tail = trimmed.slice(-4);
    return `${head}****${tail}`;
  }

  private formatDisplayName(user: {
    firstName?: string | null;
    lastName?: string | null;
  }): string | null {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return name.length > 0 ? name : null;
  }

  private parseDateInput(value?: string): Date | undefined {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    return parsed;
  }

  private getExpiresInDays(rule: unknown): number | null {
    if (!rule || typeof rule !== 'object') return null;
    const record = rule as Record<string, unknown>;
    if (typeof record.expiresInDays !== 'number') return null;
    if (!Number.isFinite(record.expiresInDays) || record.expiresInDays <= 0) {
      return null;
    }
    return Math.floor(record.expiresInDays);
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

  private parseLedgerTarget(value?: string): LedgerTarget | undefined {
    if (!value) return undefined;
    const normalized = value.trim().toUpperCase();
    if (normalized === 'POINTS' || normalized === 'BALANCE') {
      return normalized;
    }
    throw new BadRequestException('Invalid ledger target');
  }

  private requireUserStableId(userStableId: string): string {
    const stable = userStableId.trim();
    if (!stable) {
      throw new BadRequestException('userStableId is required');
    }
    return stable;
  }

  private async getUserByStableId(userStableId: string) {
    const stable = this.requireUserStableId(userStableId);
    const user = await this.prisma.user.findUnique({
      where: { userStableId: stable },
    });
    if (!user) {
      throw new NotFoundException('member not found');
    }
    return user;
  }

  private rethrowAccountSecurityError(error: unknown): never {
    if (
      error instanceof AccountSecurityAdministrationError &&
      error.code === 'USER_NOT_FOUND'
    ) {
      throw new NotFoundException('member not found');
    }
    throw error;
  }

  private rethrowMemberRechargeVerificationError(error: unknown): never {
    if (!(error instanceof MemberRechargeVerificationError)) {
      throw error;
    }
    if (error.code === 'USER_NOT_FOUND') {
      throw new NotFoundException(error.message);
    }
    throw new BadRequestException(error.message);
  }

  private async getTierThresholds() {
    const policy = await this.loyaltyPolicyReader.getLoyaltyPolicySnapshot();
    return policy.tierThresholdCents;
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
      const normalizedPhone = normalizePhone(search);
      where.OR = [
        {
          userStableId: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          firstName: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          lastName: {
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
          firstName: true,
          lastName: true,
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
        balanceMicro: true,
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
          displayName: this.formatDisplayName(user),
          email: user.email ?? null,
          phone: user.phone ? this.maskPhone(user.phone) : null,
          tier: account?.tier ?? 'BRONZE',
          balance: account ? Number(account.balanceMicro) / MICRO_PER_POINT : 0,
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
            select: {
              userStableId: true,
              firstName: true,
              lastName: true,
              email: true,
            },
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
      displayName: this.formatDisplayName(user),
      email: user.email,
      phone: user.phone,
      phoneVerifiedAt: user.phoneVerifiedAt?.toISOString() ?? null,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      marketingEmailOptIn: user.marketingEmailOptIn ?? false,
      birthdayYear: user.birthdayYear ?? null,
      birthdayMonth: user.birthdayMonth ?? null,
      referrer: referrer
        ? {
            userStableId: referrer.userStableId,
            name: this.formatDisplayName(referrer),
            email: referrer.email,
          }
        : null,
      availableDiscountCents,
      account: {
        tier: account.tier,
        balance: Number(account.balanceMicro) / MICRO_PER_POINT,
        points: Number(account.pointsMicro) / MICRO_PER_POINT,
        lifetimeSpendCents,
        nextTier: tierProgress.nextTier,
        spendToNextTierCents: tierProgress.spendToNextTierCents,
      },
    };
  }

  async getLoyaltyLedger(
    userStableId: string,
    limitRaw?: string,
    targetRaw?: string,
  ) {
    await this.getUserByStableId(userStableId);
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) || 50 : 50;
    const target = this.parseLedgerTarget(targetRaw);

    return this.loyaltyLedgerReader.getLoyaltyLedger({
      userStableId,
      limit,
      ...(target ? { target } : {}),
    });
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
      discountPercent: coupon.discountPercent ?? undefined,
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
    return this.customerAdministration.listAddressesAsAdmin({
      userStableId: this.requireUserStableId(userStableId),
    });
  }

  async getDeviceManagement(userStableId: string) {
    try {
      return await this.accountSecurityAdministration.getDeviceManagement(
        this.requireUserStableId(userStableId),
      );
    } catch (error) {
      this.rethrowAccountSecurityError(error);
    }
  }

  async revokeSession(userStableId: string, sessionId: string) {
    try {
      await this.accountSecurityAdministration.revokeSession(
        this.requireUserStableId(userStableId),
        sessionId,
      );
    } catch (error) {
      this.rethrowAccountSecurityError(error);
    }
  }

  async revokeTrustedDevice(
    userStableId: string,
    trustedDeviceStableId: string,
  ) {
    try {
      await this.accountSecurityAdministration.revokeTrustedDevice(
        this.requireUserStableId(userStableId),
        trustedDeviceStableId,
      );
    } catch (error) {
      this.rethrowAccountSecurityError(error);
    }
  }

  async updateMember(
    userStableId: string,
    body: {
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      phone?: string | null;
      birthdayYear?: number | null;
      birthdayMonth?: number | null;
    },
  ) {
    return this.customerAdministration.updateProfileAsAdmin({
      userStableId: this.requireUserStableId(userStableId),
      ...body,
    });
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
    try {
      return await this.accountSecurityAdministration.setAccountStatus(
        this.requireUserStableId(userStableId),
        disabled,
      );
    } catch (error) {
      this.rethrowAccountSecurityError(error);
    }
  }

  async sendRechargeCode(
    userStableId: string,
    body: {
      email?: string;
      phone?: string;
      locale?: string;
    },
  ) {
    try {
      return await this.memberRechargeVerification.sendCode({
        userStableId,
        email: body.email,
        phone: body.phone,
        locale: body.locale,
      });
    } catch (error) {
      this.rethrowMemberRechargeVerificationError(error);
    }
  }

  async verifyRechargeCode(
    userStableId: string,
    body: {
      email?: string;
      phone?: string;
      code?: string;
    },
  ) {
    try {
      return await this.memberRechargeVerification.verifyCode({
        userStableId,
        email: body.email,
        phone: body.phone,
        code: body.code,
      });
    } catch (error) {
      this.rethrowMemberRechargeVerificationError(error);
    }
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

    try {
      await this.memberRechargeVerification.consumeVerificationToken({
        userStableId,
        verificationToken,
      });
    } catch (error) {
      this.rethrowMemberRechargeVerificationError(error);
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
      percentOff?: number;
      constraints?: { minSubtotalCents?: number };
      itemStableIds?: string[];
    };

    const unlockedItemStableIds =
      rule.applyTo === 'ITEM' ? (rule.itemStableIds ?? []) : [];

    const couponStableId = generateStableId();
    const now = new Date();
    const minSpendCents =
      typeof rule.constraints?.minSubtotalCents === 'number'
        ? rule.constraints.minSubtotalCents
        : null;
    const expiresInDays = this.getExpiresInDays(template.issueRule);
    const expiresAt = expiresInDays
      ? new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000)
      : (template.validTo ?? null);
    const startsAt = expiresInDays ? now : (template.validFrom ?? null);
    const endsAt = expiresInDays ? expiresAt : (template.validTo ?? null);

    const source = body.note?.trim() ? `Admin: ${body.note.trim()}` : 'Admin';

    await this.prisma.$transaction(async (tx) => {
      await tx.coupon.create({
        data: {
          couponStableId,
          userId: user.id,
          code: template.couponStableId,
          title:
            template.tittleCh ?? template.titleEn ?? template.couponStableId,
          discountCents:
            rule.type === 'FIXED_CENTS' ? (rule.amountCents ?? 0) : 0,
          discountPercent:
            rule.type === 'PERCENT' ? (rule.percentOff ?? null) : null,
          minSpendCents,
          expiresAt,
          issuedAt: now,
          source,
          fromTemplateId: template.id,
          unlockedItemStableIds,
          isActive: true,
          stackingPolicy: template.stackingPolicy,
          startsAt,
          endsAt,
        },
      });

      await tx.userCoupon.create({
        data: {
          userStableId: user.userStableId,
          couponStableId,
          status: 'AVAILABLE',
          expiresAt,
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
