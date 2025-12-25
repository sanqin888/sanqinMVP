// apps/api/src/membership/membership.service.ts
// apps/api/src/membership/membership.service.ts
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';

const MICRO_PER_POINT = 1_000_000;
const createStableId = (): string =>
  `c${randomUUID().replace(/-/g, '').slice(0, 24)}`;

@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
  ) {}

  private generateUserStableId(): string {
    return createStableId();
  }

  private async ensureUserStableId(user: User): Promise<User> {
    if (user.userStableId) return user;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidate = this.generateUserStableId();
      try {
        return await this.prisma.user.update({
          where: { id: user.id },
          data: { userStableId: candidate },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2002') {
            continue;
          }
        }
        throw error;
      }
    }

    throw new InternalServerErrorException('failed to allocate userStableId');
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

  private serializeCoupon(coupon: {
    id: string;
    title: string;
    code: string;
    discountCents: number;
    minSpendCents: number | null;
    expiresAt: Date | null;
    usedAt: Date | null;
    issuedAt: Date;
    source: string | null;
  }) {
    const status = this.couponStatus({
      expiresAt: coupon.expiresAt,
      usedAt: coupon.usedAt,
    });

    return {
      // ✅ 对外统一：不暴露裸字段名 id
      couponId: coupon.id,

      title: coupon.title,
      code: coupon.code,
      discountCents: coupon.discountCents,
      minSpendCents: coupon.minSpendCents ?? undefined,
      expiresAt: coupon.expiresAt?.toISOString(),
      issuedAt: coupon.issuedAt.toISOString(),
      status,
      source: coupon.source ?? undefined,
    };
  }

  /** 和短信验证那边保持一致：去空格和横杠 */
  private normalizePhone(raw: string | undefined | null): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return trimmed.replace(/\s+/g, '').replace(/-/g, '');
  }

  /** 如果带了 phone + verificationToken，就尝试把手机号绑定到 User 上 */
  private async bindPhoneIfNeeded(params: {
    user: User;
    rawPhone?: string;
    verificationToken?: string;
  }): Promise<User> {
    const { user, rawPhone, verificationToken } = params;

    const normalizedPhone = this.normalizePhone(rawPhone);
    if (!normalizedPhone || !verificationToken) return user;

    // ✅ 额外防御：如果 token 形状明显不像 UUID，就直接忽略，避免 Prisma 报 “invalid length”
    if (!/^[0-9a-fA-F-]{32,36}$/.test(verificationToken)) {
      return user;
    }

    // 已经有手机而且和这次一致，就顺手把 token 标记为 CONSUMED 即可
    if (user.phone && this.normalizePhone(user.phone) === normalizedPhone) {
      try {
        await this.prisma.phoneVerification.update({
          where: { id: verificationToken },
          data: {
            status: 'CONSUMED',
            consumedAt: new Date(),
          },
        });
      } catch {
        // 忽略错误（比如 token 找不到）
      }
      return user;
    }

    // 查这条验证码记录
    const pv = await this.prisma.phoneVerification.findUnique({
      where: { id: verificationToken },
    });

    if (
      !pv ||
      pv.status !== 'VERIFIED' ||
      this.normalizePhone(pv.phone) !== normalizedPhone
    ) {
      // 找不到 / 状态不对 / 手机不匹配，都直接忽略绑定
      return user;
    }

    // 避免同一手机号被绑定到多个 User
    const conflict = await this.prisma.user.findFirst({
      where: {
        phone: normalizedPhone,
        NOT: { id: user.id },
      },
      select: { id: true },
    });
    if (conflict) {
      // 已经被别人占用了，这里我们选择“忽略这次绑定”，而不是报错
      return user;
    }

    const now = new Date();

    // 真正绑定手机号，并把这条验证码标记为已消费
    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          phone: normalizedPhone,
          phoneVerifiedAt: user.phoneVerifiedAt ?? now,
        },
      }),
      this.prisma.phoneVerification.update({
        where: { id: pv.id },
        data: {
          status: 'CONSUMED',
          consumedAt: now,
        },
      }),
    ]);

    return updated;
  }

  /**
   * 确保 User 存在，并在需要时补全信息：
   * - userStableId 必填，供前后端识别
   * - name / email：可以更新
   * - referredByUserId：只在“当前为空且 referrerEmail 有效”时写入一次
   * - birthdayMonth / birthdayDay：只在“当前为空且生日合法”时写入一次
   */
  private async ensureUser(params: {
    userStableId: string;
    name?: string | null;
    email?: string | null;
    referrerEmail?: string;
    birthdayMonth?: number;
    birthdayDay?: number;
    phone?: string;
    phoneVerificationToken?: string;
  }) {
    const {
      userStableId,
      name,
      email,
      referrerEmail: referrerEmailParam,
      birthdayMonth,
      birthdayDay,
      phone,
      phoneVerificationToken,
    } = params;

    if (!userStableId) {
      throw new Error('userStableId is required');
    }

    const normalizedName =
      typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;
    const normalizedEmail =
      typeof email === 'string' && email.trim().length > 0
        ? email.trim()
        : null;
    const emailPrefix =
      normalizedEmail && normalizedEmail.includes('@')
        ? normalizedEmail.split('@')[0].trim()
        : null;
    const initialName = emailPrefix || normalizedName;

    // —— 解析推荐人（通过邮箱查 User），不能是自己
    const referrerEmail =
      typeof referrerEmailParam === 'string' ? referrerEmailParam.trim() : '';
    let referrerId: string | undefined;
    if (referrerEmail) {
      const ref = await this.prisma.user.findUnique({
        where: { email: referrerEmail },
        select: { id: true, userStableId: true },
      });

      if (ref && ref.userStableId !== userStableId) {
        referrerId = ref.id;
      }
    }

    // —— 校验生日（只要简单范围；月份和日期都存在才算）
    const validBirthday =
      typeof birthdayMonth === 'number' &&
      typeof birthdayDay === 'number' &&
      Number.isInteger(birthdayMonth) &&
      Number.isInteger(birthdayDay) &&
      birthdayMonth >= 1 &&
      birthdayMonth <= 12 &&
      birthdayDay >= 1 &&
      birthdayDay <= 31;

    // 先查是否已有该 User
    let user = await this.prisma.user.findUnique({
      where: { userStableId },
    });

    if (!user) {
      // ⭐ 首次注册：可以一次性写入推荐人和生日
      user = await this.prisma.user.create({
        data: {
          userStableId,
          email: normalizedEmail,
          name: initialName,
          ...(referrerId ? { referredByUserId: referrerId } : {}),
          ...(validBirthday
            ? {
                birthdayMonth,
                birthdayDay,
              }
            : {}),
        },
      });
    } else {
      // ⭐ 已有用户：只在字段为空时补充 referrer / 生日；name/email 按需更新
      const updateData: Prisma.UserUpdateInput = {};

      if (!user.name && normalizedName) {
        updateData.name = normalizedName;
      }
      if (normalizedEmail && normalizedEmail !== user.email) {
        updateData.email = normalizedEmail;
      }

      if (!user.referredByUserId && referrerId) {
        updateData.referredByUserId = referrerId;
      }

      if (
        user.birthdayMonth == null &&
        user.birthdayDay == null &&
        validBirthday
      ) {
        updateData.birthdayMonth = birthdayMonth!;
        updateData.birthdayDay = birthdayDay!;
      }

      if (Object.keys(updateData).length > 0) {
        user = await this.prisma.user.update({
          where: { userStableId },
          data: updateData,
        });
      }
    }

    // ⭐ 最后一步：如果这次带了 phone + token，就尝试绑定手机号
    if (phone || phoneVerificationToken) {
      user = await this.bindPhoneIfNeeded({
        user,
        rawPhone: phone,
        verificationToken: phoneVerificationToken,
      });
    }

    return this.ensureUserStableId(user);
  }

  async getMemberByPhone(phone: string) {
    const normalized = this.normalizePhone(phone);
    if (!normalized) {
      throw new BadRequestException('phone is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { phone: normalized },
    });
    if (!user) {
      throw new NotFoundException('member not found');
    }

    const safeUser = await this.ensureUserStableId(user);
    const account = await this.loyalty.ensureAccount(safeUser.id);

    return {
      userStableId: safeUser.userStableId,
      displayName: safeUser.name,
      phone: safeUser.phone ?? null,
      tier: account.tier,
      points: Number(account.pointsMicro) / MICRO_PER_POINT,
      lifetimeSpendCents: account.lifetimeSpendCents ?? 0,
      availableDiscountCents: this.loyalty.maxRedeemableCentsFromBalance(
        account.pointsMicro,
      ),
    };
  }

  private async ensureWelcomeCoupon(userId: string) {
    const existing = await this.prisma.coupon.findFirst({
      where: { userId, campaign: 'WELCOME' },
      orderBy: { issuedAt: 'desc' },
    });

    if (existing) return existing;

    const expiresAt = (() => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      return d;
    })();

    return this.prisma.coupon.create({
      data: {
        userId,
        campaign: 'WELCOME',
        code: 'WELCOME10',
        title: 'Welcome bonus',
        discountCents: 1000,
        minSpendCents: 3000,
        expiresAt,
        source: 'Signup bonus',
      },
    });
  }

  private async ensureBirthdayCoupon(user: {
    id: string;
    birthdayMonth: number | null;
    birthdayDay: number | null;
  }) {
    if (!user.birthdayMonth || !user.birthdayDay) return null;

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    if (currentMonth !== user.birthdayMonth) return null;

    const campaign = `BIRTHDAY-${now.getFullYear()}`;
    const existed = await this.prisma.coupon.findFirst({
      where: { userId: user.id, campaign },
    });
    if (existed) return existed;

    // 过期时间：生日当月的最后一天 23:59:59
    const expiresAt = new Date(
      Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
    );

    return this.prisma.coupon.create({
      data: {
        userId: user.id,
        campaign,
        code: 'BDAY15',
        title: 'Birthday treat',
        discountCents: 1500,
        minSpendCents: 4500,
        expiresAt,
        source: 'Birthday month reward',
      },
    });
  }

  /**
   * 会员概要：
   * - User 信息
   * - LoyaltyAccount（积分、等级、累计消费）
   * - 最近 10 笔订单
   */
  async getMemberSummary(params: {
    userStableId: string;
    name?: string | null;
    email?: string | null;
    referrerEmail?: string;
    birthdayMonth?: number;
    birthdayDay?: number;
    phone?: string;
    phoneVerificationToken?: string;
  }) {
    const {
      userStableId,
      name,
      email,
      referrerEmail: referrerEmailParam,
      birthdayMonth,
      birthdayDay,
      phone,
      phoneVerificationToken,
    } = params;

    const user = await this.ensureUser({
      userStableId,
      name,
      email,
      referrerEmail: referrerEmailParam,
      birthdayMonth,
      birthdayDay,
      phone,
      phoneVerificationToken,
    });

    let referrerEmail: string | null = null;
    if (user.referredByUserId) {
      const referrer = await this.prisma.user.findUnique({
        where: { id: user.referredByUserId },
        select: { email: true },
      });
      referrerEmail = referrer?.email ?? null;
    }

    const account = await this.loyalty.ensureAccount(user.id);
    const availableDiscountCents = this.loyalty.maxRedeemableCentsFromBalance(
      account.pointsMicro,
    );

    const orders = await this.prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        orderStableId: true,
        clientRequestId: true,
        pickupCode: true,
        createdAt: true,
        totalCents: true,
        status: true,
        fulfillmentType: true,
        deliveryType: true,
      },
    });

    return {
      userStableId: user.userStableId,
      displayName: user.name,
      email: user.email,
      tier: account.tier,
      points: Number(account.pointsMicro) / MICRO_PER_POINT,
      lifetimeSpendCents: account.lifetimeSpendCents ?? 0,
      availableDiscountCents,
      marketingEmailOptIn: user.marketingEmailOptIn ?? false,
      phone: user.phone ?? null,
      phoneVerified: !!user.phoneVerifiedAt,
      birthdayMonth: user.birthdayMonth ?? null,
      birthdayDay: user.birthdayDay ?? null,
      referrerEmail,

      // ✅ 对外统一：不用裸 id；用稳定标识
      recentOrders: orders.map((o) => ({
        orderStableId: o.orderStableId,
        clientRequestId: o.clientRequestId,
        pickupCode: o.pickupCode,
        createdAt: o.createdAt.toISOString(),
        totalCents: o.totalCents,
        status: o.status,
        fulfillmentType: o.fulfillmentType,
        deliveryType: o.deliveryType,
      })),
    };
  }

  /**
   * 返回用户的所有优惠券列表，会自动补发：
   * - 欢迎券（仅一次）
   * - 当月生日券（每年一次，需已填写生日）
   */
  async listCoupons(params: { userStableId: string }) {
    const { userStableId } = params;
    const user = await this.ensureUser({
      userStableId,
      name: null,
      email: null,
    });

    await this.ensureWelcomeCoupon(user.id);
    await this.ensureBirthdayCoupon({
      id: user.id,
      birthdayMonth: user.birthdayMonth,
      birthdayDay: user.birthdayDay,
    });

    const coupons = await this.prisma.coupon.findMany({
      where: { userId: user.id },
      orderBy: [{ expiresAt: 'asc' }, { issuedAt: 'desc' }],
    });

    return coupons.map((coupon) =>
      this.serializeCoupon({
        id: coupon.id,
        title: coupon.title,
        code: coupon.code,
        discountCents: coupon.discountCents,
        minSpendCents: coupon.minSpendCents,
        expiresAt: coupon.expiresAt,
        usedAt: coupon.usedAt,
        issuedAt: coupon.issuedAt,
        source: coupon.source,
      }),
    );
  }

  /**
   * 获取积分流水（最近 N 条）
   */
  async getLoyaltyLedger(params: { userStableId: string; limit?: number }) {
    const { userStableId, limit = 50 } = params;

    const user = await this.ensureUser({
      userStableId,
      name: null,
      email: null,
    });

    const account = await this.loyalty.ensureAccount(user.id);

    const entries = await this.prisma.loyaltyLedger.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        type: true,
        orderId: true,
        deltaMicro: true,
        balanceAfterMicro: true,
        note: true,
      },
    });

    // ✅ orderStableId：优先使用订单稳定号
    const orderIds = Array.from(
      new Set(
        entries
          .map((e) => e.orderId)
          .filter((v): v is string => typeof v === 'string' && v.length > 0),
      ),
    );

    const orderStableById = new Map<string, string>();
    if (orderIds.length > 0) {
      const rows = await this.prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, orderStableId: true },
      });
      for (const r of rows) {
        orderStableById.set(r.id, r.orderStableId);
      }
    }

    return {
      entries: entries.map((entry) => {
        const orderStableId =
          entry.orderId != null
            ? (orderStableById.get(entry.orderId) ?? entry.orderId)
            : undefined;

        return {
          // ✅ 对外统一：不用裸 id
          ledgerId: entry.id,

          createdAt: entry.createdAt.toISOString(),
          type: entry.type,
          deltaPoints: Number(entry.deltaMicro) / MICRO_PER_POINT,
          balanceAfterPoints: Number(entry.balanceAfterMicro) / MICRO_PER_POINT,
          note: entry.note ?? undefined,

          // ✅ 统一稳定标识
          ...(orderStableId ? { orderStableId } : {}),
        };
      }),
    };
  }

  async validateCouponForOrder(
    params: {
      userId?: string;
      couponId?: string;
      subtotalCents: number;
    },
    options?: { tx?: Prisma.TransactionClient },
  ) {
    const { userId, couponId, subtotalCents } = params;
    const prisma = options?.tx ?? this.prisma;
    if (!couponId) return null;
    if (!userId) {
      throw new BadRequestException('userId is required when applying coupon');
    }

    const coupon = await prisma.coupon.findUnique({
      where: { id: couponId },
    });

    if (!coupon || coupon.userId !== userId) {
      throw new BadRequestException('coupon not found for user');
    }

    const status = this.couponStatus({
      expiresAt: coupon.expiresAt,
      usedAt: coupon.usedAt,
    });
    if (status !== 'active') {
      throw new BadRequestException('coupon is not available');
    }

    if (
      typeof coupon.minSpendCents === 'number' &&
      subtotalCents < coupon.minSpendCents
    ) {
      throw new BadRequestException(
        'order subtotal does not meet coupon rules',
      );
    }

    const discountCents = Math.max(
      0,
      Math.min(coupon.discountCents, subtotalCents),
    );

    return {
      discountCents,
      coupon,
    };
  }

  async reserveCouponForOrder(params: {
    tx: Prisma.TransactionClient;
    userId?: string;
    couponId?: string | null;
    subtotalCents: number;
    orderId: string;
  }) {
    const { tx, userId, couponId, subtotalCents, orderId } = params;
    if (!couponId) return null;

    const couponInfo = await this.validateCouponForOrder(
      { userId, couponId, subtotalCents },
      { tx },
    );

    if (!couponInfo) return null;

    const { coupon } = couponInfo;

    if (coupon.orderId && coupon.orderId !== orderId) {
      throw new BadRequestException('coupon is not available');
    }

    const alreadyReserved =
      coupon.usedAt !== null && coupon.orderId === orderId;

    const now = new Date();

    if (!alreadyReserved) {
      const updated = await tx.coupon.updateMany({
        where: {
          id: coupon.id,
          usedAt: null,
        },
        data: {
          usedAt: now,
          orderId,
        },
      });

      if (updated.count === 0) {
        const latest = await tx.coupon.findUnique({
          where: { id: coupon.id },
          select: { usedAt: true, orderId: true },
        });

        if (!latest || latest.orderId !== orderId || latest.usedAt === null) {
          throw new BadRequestException('coupon is not available');
        }
      }
    }

    return {
      ...couponInfo,
      coupon: {
        ...coupon,
        usedAt: coupon.usedAt ?? now,
        orderId,
      },
    };
  }

  async markCouponUsedForOrder(params: {
    couponId?: string | null;
    orderId: string;
  }) {
    const { couponId, orderId } = params;
    if (!couponId) return;

    const now = new Date();
    await this.prisma.coupon.updateMany({
      where: { id: couponId, usedAt: null },
      data: { usedAt: now, orderId },
    });
  }

  async releaseCouponForOrder(params: {
    orderId: string;
    couponId?: string | null;
    tx?: Prisma.TransactionClient;
  }) {
    const { orderId, couponId, tx } = params;
    if (!couponId) return;

    const prisma = tx ?? this.prisma;

    const coupon = await prisma.coupon.findUnique({
      where: { id: couponId },
      select: { usedAt: true, orderId: true },
    });

    if (!coupon || coupon.orderId !== orderId || coupon.usedAt === null) {
      return;
    }

    await prisma.coupon.update({
      where: { id: couponId },
      data: {
        usedAt: null,
        orderId: null,
      },
    });
  }

  /**
   * 更新营销邮件订阅偏好
   */
  async updateMarketingConsent(params: {
    userStableId: string;
    marketingEmailOptIn: boolean;
  }) {
    const { userStableId, marketingEmailOptIn } = params;
    const now = new Date();

    try {
      const user = await this.prisma.user.update({
        where: { userStableId },
        data: {
          marketingEmailOptIn,
          marketingEmailOptInAt: marketingEmailOptIn ? now : null,
        },
        select: {
          userStableId: true,
          email: true,
          marketingEmailOptIn: true,
          marketingEmailOptInAt: true,
        },
      });

      return user;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException('user not found');
      }

      this.logger.error(
        `Failed to update marketing consent for userStableId=${userStableId}`,
        (err as Error).stack,
      );

      throw new InternalServerErrorException(
        'Failed to update marketing consent',
      );
    }
  }

  async updateProfile(params: {
    userStableId: string;
    name?: string | null;
    birthdayMonth?: number | null;
    birthdayDay?: number | null;
  }) {
    const { userStableId, name, birthdayMonth, birthdayDay } = params;

    const user = await this.prisma.user.findUnique({
      where: { userStableId },
    });

    if (!user) {
      throw new NotFoundException('user not found');
    }

    const updateData: Prisma.UserUpdateInput = {};
    const trimmedName =
      typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;

    if (trimmedName && trimmedName !== user.name) {
      updateData.name = trimmedName;
    }

    const wantsBirthdayUpdate = birthdayMonth != null || birthdayDay != null;

    if (wantsBirthdayUpdate) {
      const validBirthday =
        typeof birthdayMonth === 'number' &&
        typeof birthdayDay === 'number' &&
        Number.isInteger(birthdayMonth) &&
        Number.isInteger(birthdayDay) &&
        birthdayMonth >= 1 &&
        birthdayMonth <= 12 &&
        birthdayDay >= 1 &&
        birthdayDay <= 31;

      if (!validBirthday) {
        throw new BadRequestException('invalid birthday');
      }

      if (user.birthdayMonth == null && user.birthdayDay == null) {
        updateData.birthdayMonth = birthdayMonth;
        updateData.birthdayDay = birthdayDay;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return {
        name: user.name,
        birthdayMonth: user.birthdayMonth,
        birthdayDay: user.birthdayDay,
      };
    }

    const updated = await this.prisma.user.update({
      where: { userStableId },
      data: updateData,
      select: {
        name: true,
        birthdayMonth: true,
        birthdayDay: true,
      },
    });

    return updated;
  }
}
