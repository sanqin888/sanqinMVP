// apps/api/src/membership/membership.service.ts
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';

const MICRO_PER_POINT = 1_000_000;

@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
  ) {}

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
      id: coupon.id,
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
   * - id 必填，和 next-auth userId 对齐
   * - name / email：可以更新（和你之前的 upsert 行为保持一致/略微保守）
   * - referredByUserId：只在“当前为空且传入 referrerEmail 有效”时写入一次
   * - birthdayMonth / birthdayDay：只在“当前为空且传入生日合法”时写入一次
   */
  private async ensureUser(params: {
    userId: string;
    name?: string | null;
    email?: string | null;
    referrerEmail?: string;
    birthdayMonth?: number;
    birthdayDay?: number;
    phone?: string;
    phoneVerificationToken?: string;
  }) {
    const {
      userId,
      name,
      email,
      referrerEmail,
      birthdayMonth,
      birthdayDay,
      phone,
      phoneVerificationToken,
    } = params;

    if (!userId) {
      throw new Error('userId is required');
    }

    // —— 解析推荐人（通过邮箱查 User），不能是自己
    let referrerId: string | undefined;
    if (referrerEmail && referrerEmail.trim()) {
      const ref = await this.prisma.user.findUnique({
        where: { email: referrerEmail.trim() },
        select: { id: true },
      });

      if (ref && ref.id !== userId) {
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
      where: { id: userId },
    });

    if (!user) {
      // ⭐ 首次注册：可以一次性写入推荐人和生日
      user = await this.prisma.user.create({
        data: {
          id: userId,
          email: email ?? null,
          name: name ?? null,
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

      if (typeof name === 'string' && name !== user.name) {
        updateData.name = name;
      }
      if (typeof email === 'string' && email !== user.email) {
        updateData.email = email;
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
          where: { id: userId },
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

    return user;
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
   * - User 信息（含营销订阅）
   * - LoyaltyAccount（积分、等级、累计消费）
   * - 最近 10 笔订单
   *
   * 现在新增可选参数：
   * - referrerEmail: 推荐人邮箱（只在 User.referredByUserId 为空时写入一次）
   * - birthdayMonth / birthdayDay: 生日（月/日，只能首次写入）
   */
  async getMemberSummary(params: {
    userId: string;
    name?: string | null;
    email?: string | null;
    referrerEmail?: string;
    birthdayMonth?: number;
    birthdayDay?: number;
    phone?: string;
    phoneVerificationToken?: string;
  }) {
    const {
      userId,
      name,
      email,
      referrerEmail,
      birthdayMonth,
      birthdayDay,
      phone,
      phoneVerificationToken,
    } = params;

    const user = await this.ensureUser({
      userId,
      name,
      email,
      referrerEmail,
      birthdayMonth,
      birthdayDay,
      phone,
      phoneVerificationToken,
    });

    // 后面原逻辑不动
    const account = await this.loyalty.ensureAccount(user.id);
    const availableDiscountCents = this.loyalty.maxRedeemableCentsFromBalance(
      account.pointsMicro,
    );

    const orders = await this.prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      userId: user.id,
      displayName: user.name,
      email: user.email,
      tier: account.tier,
      points: Number(account.pointsMicro) / MICRO_PER_POINT,
      lifetimeSpendCents: account.lifetimeSpendCents ?? 0,
      availableDiscountCents,
      marketingEmailOptIn: user.marketingEmailOptIn ?? false,
      phone: user.phone ?? null,
      phoneVerified: !!user.phoneVerifiedAt,
      recentOrders: orders.map((o) => ({
        id: o.id,
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
  async listCoupons(params: { userId: string }) {
    const { userId } = params;
    const user = await this.ensureUser({ userId, name: null, email: null });

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
  async getLoyaltyLedger(params: { userId: string; limit?: number }) {
    const { userId, limit = 50 } = params;

    // 确保 user 存在（不会改名，只用 id；推荐人/生日不在这里处理）
    const user = await this.ensureUser({
      userId,
      name: null,
      email: null,
    });

    // 确保账号存在
    const account = await this.loyalty.ensureAccount(user.id);

    const entries = await this.prisma.loyaltyLedger.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      entries: entries.map((entry) => ({
        id: entry.id,
        createdAt: entry.createdAt.toISOString(),
        type: entry.type,
        // 积分从 micro 转成“点数”，和 summary 里的 points 一致
        deltaPoints: Number(entry.deltaMicro) / MICRO_PER_POINT,
        balanceAfterPoints: Number(entry.balanceAfterMicro) / MICRO_PER_POINT,
        note: entry.note ?? undefined,
        orderId: entry.orderId,
      })),
    };
  }

  async validateCouponForOrder(params: {
    userId?: string;
    couponId?: string;
    subtotalCents: number;
  }) {
    const { userId, couponId, subtotalCents } = params;
    if (!couponId) return null;
    if (!userId) {
      throw new BadRequestException('userId is required when applying coupon');
    }

    const coupon = await this.prisma.coupon.findUnique({
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

  /**
   * 更新营销邮件订阅偏好
   */
  async updateMarketingConsent(params: {
    userId: string;
    marketingEmailOptIn: boolean;
  }) {
    const { userId, marketingEmailOptIn } = params;
    const now = new Date();

    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          marketingEmailOptIn,
          marketingEmailOptInAt: marketingEmailOptIn ? now : null,
        },
        select: {
          id: true,
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
        `Failed to update marketing consent for user=${userId}`,
        (err as Error).stack,
      );

      throw new InternalServerErrorException(
        'Failed to update marketing consent',
      );
    }
  }
}
