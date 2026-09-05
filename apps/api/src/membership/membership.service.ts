// apps/api/src/membership/membership.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserLanguage } from '@prisma/client';
import { normalizeEmail } from '../common/utils/email';
import { normalizePhone } from '../common/utils/phone';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import type {
  HoldPaymentCouponReservationInput,
  PaymentCouponReservationPort,
} from '../benefits/contracts/payment-benefit-reservation.contract';
import type { OrderItemOptionsSnapshot } from '../orders/order-item-options';

const MICRO_PER_POINT = 1_000_000;

@Injectable()
export class MembershipService implements PaymentCouponReservationPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
  ) {}

  private couponStatus(coupon: {
    expiresAt: Date | null;
    usedAt: Date | null;
    isActive: boolean;
    isFrozen: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
    reservationAttemptId: string | null;
  }): 'active' | 'used' | 'expired' | 'inactive' | 'not_started' | 'reserved' {
    const now = Date.now();
    if (coupon.usedAt) return 'used';
    if (
      (coupon.expiresAt && coupon.expiresAt.getTime() < now) ||
      (coupon.endsAt && coupon.endsAt.getTime() < now)
    ) {
      return 'expired';
    }
    if (!coupon.isActive || coupon.isFrozen) return 'inactive';
    if (coupon.startsAt && coupon.startsAt.getTime() > now) {
      return 'not_started';
    }
    if (coupon.reservationAttemptId) return 'reserved';
    return 'active';
  }

  private serializeCoupon(coupon: {
    id: string;
    couponStableId: string;
    title: string;
    code: string;
    discountCents: number;
    discountPercent: number | null;
    minSpendCents: number | null;
    expiresAt: Date | null;
    usedAt: Date | null;
    issuedAt: Date;
    source: string | null;
    unlockedItemStableIds: string[];
    isActive: boolean;
    isFrozen: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
    reservationAttemptId: string | null;
  }) {
    const status = this.couponStatus(coupon);

    return {
      // ✅ 对外统一：对外只用 stableId
      couponStableId: coupon.couponStableId,

      title: coupon.title,
      code: coupon.code,
      discountCents: coupon.discountCents,
      discountPercent: coupon.discountPercent ?? undefined,
      minSpendCents: coupon.minSpendCents ?? undefined,
      expiresAt: coupon.expiresAt?.toISOString(),
      issuedAt: coupon.issuedAt.toISOString(),
      status,
      source: coupon.source ?? undefined,
      unlockedItemStableIds: coupon.unlockedItemStableIds,
    };
  }

  private parseOrderItemOptionsSnapshot(
    raw: unknown,
  ): OrderItemOptionsSnapshot {
    if (!Array.isArray(raw)) return [];

    return raw.flatMap((group) => {
      if (!group || typeof group !== 'object') return [];
      const groupRecord = group as Record<string, unknown>;
      const templateGroupStableId =
        typeof groupRecord.templateGroupStableId === 'string'
          ? groupRecord.templateGroupStableId
          : '';
      if (!templateGroupStableId) return [];

      const choicesRaw = Array.isArray(groupRecord.choices)
        ? groupRecord.choices
        : [];
      const choices = choicesRaw.flatMap((choice) => {
        if (!choice || typeof choice !== 'object') return [];
        const choiceRecord = choice as Record<string, unknown>;
        const stableId =
          typeof choiceRecord.stableId === 'string'
            ? choiceRecord.stableId
            : '';
        if (!stableId) return [];

        return [
          {
            stableId,
            templateGroupStableId,
            nameEn:
              typeof choiceRecord.nameEn === 'string'
                ? choiceRecord.nameEn
                : '',
            nameZh:
              typeof choiceRecord.nameZh === 'string'
                ? choiceRecord.nameZh
                : null,
            priceDeltaCents:
              typeof choiceRecord.priceDeltaCents === 'number'
                ? choiceRecord.priceDeltaCents
                : 0,
            sortOrder:
              typeof choiceRecord.sortOrder === 'number'
                ? choiceRecord.sortOrder
                : 0,
          },
        ];
      });

      return [
        {
          templateGroupStableId,
          nameEn:
            typeof groupRecord.nameEn === 'string' ? groupRecord.nameEn : '',
          nameZh:
            typeof groupRecord.nameZh === 'string' ? groupRecord.nameZh : null,
          minSelect:
            typeof groupRecord.minSelect === 'number'
              ? groupRecord.minSelect
              : 0,
          maxSelect:
            typeof groupRecord.maxSelect === 'number'
              ? groupRecord.maxSelect
              : null,
          sortOrder:
            typeof groupRecord.sortOrder === 'number'
              ? groupRecord.sortOrder
              : 0,
          choices,
        },
      ];
    });
  }

  private async requireExistingUser(userStableId: string) {
    const user = await this.prisma.user.findUnique({
      where: { userStableId },
    });
    if (!user) {
      throw new NotFoundException('user not found');
    }
    return user;
  }

  /**
   * 会员概要：
   * - User 信息
   * - LoyaltyAccount（积分、等级、累计消费）
   * - 最近 10 笔订单
   */
  async getMemberSummary(params: { userStableId: string }) {
    const user = await this.requireExistingUser(params.userStableId);

    let referrerEmail: string | null = null;
    if (user.referredByUserId) {
      const referrer = await this.prisma.user.findUnique({
        where: { id: user.referredByUserId },
        select: { email: true },
      });
      referrerEmail = referrer?.email ?? null;
    }

    const account = await this.loyalty.ensureAccount(user.id);
    const availableDiscountCents =
      await this.loyalty.maxRedeemableCentsFromBalance(account.pointsMicro);

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
        items: {
          select: {
            productStableId: true,
            qty: true,
            displayName: true,
            nameEn: true,
            nameZh: true,
            optionsJson: true,
          },
        },
      },
    });

    return {
      userStableId: user.userStableId,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName:
        [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
      email: user.email,
      tier: account.tier,
      balance: Number(account.balanceMicro) / MICRO_PER_POINT,
      points: Number(account.pointsMicro) / MICRO_PER_POINT,
      lifetimeSpendCents: account.lifetimeSpendCents ?? 0,
      availableDiscountCents,
      marketingEmailOptIn: user.marketingEmailOptIn ?? false,
      phone: user.phone ?? null,
      emailVerified: !!user.emailVerifiedAt,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      phoneVerified: !!user.phoneVerifiedAt,
      twoFactorEnabledAt: user.twoFactorEnabledAt,
      twoFactorMethod: user.twoFactorMethod,
      birthdayYear: user.birthdayYear ?? null,
      birthdayMonth: user.birthdayMonth ?? null,
      referrerEmail,
      language: user.language === UserLanguage.ZH ? 'zh' : 'en',

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
        items: o.items.map((item) => ({
          productStableId: item.productStableId,
          quantity: item.qty,
          displayName: item.displayName,
          nameEn: item.nameEn,
          nameZh: item.nameZh,
          options: this.parseOrderItemOptionsSnapshot(item.optionsJson),
        })),
      })),
    };
  }

  async getDeviceManagement(params: {
    userId: string;
    currentSessionId?: string;
  }) {
    const { userId, currentSessionId } = params;

    const [sessions, trustedDevices] = await Promise.all([
      this.prisma.userSession.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          sessionId: true,
          createdAt: true,
          expiresAt: true,
          mfaVerifiedAt: true,
          deviceInfo: true,
          loginLocation: true,
        },
      }),
      this.prisma.trustedDevice.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          label: true,
          createdAt: true,
          lastSeenAt: true,
          expiresAt: true,
        },
      }),
    ]);

    const sessionItems = sessions.map((session) => ({
      sessionId: session.sessionId,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      mfaVerifiedAt: session.mfaVerifiedAt?.toISOString() ?? null,
      deviceInfo: session.deviceInfo ?? null,
      loginLocation: session.loginLocation ?? null,
      isCurrent: session.sessionId === currentSessionId,
    }));

    const dedupedSessions = (() => {
      const seen = new Map<string, (typeof sessionItems)[number]>();
      const order: string[] = [];

      for (const session of sessionItems) {
        const key = session.deviceInfo
          ? `device:${session.deviceInfo}|${session.loginLocation ?? ''}`
          : `session:${session.sessionId}`;
        const existing = seen.get(key);
        if (!existing) {
          seen.set(key, session);
          order.push(key);
          continue;
        }
        if (session.isCurrent && !existing.isCurrent) {
          seen.set(key, session);
        }
      }

      return order.map((key) => seen.get(key)!);
    })();

    return {
      sessions: dedupedSessions,
      trustedDevices: trustedDevices.map((device) => ({
        id: device.id,
        label: device.label ?? null,
        createdAt: device.createdAt.toISOString(),
        lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
        expiresAt: device.expiresAt.toISOString(),
      })),
    };
  }

  async revokeSession(params: { userId: string; sessionId: string }) {
    await this.prisma.userSession.deleteMany({
      where: {
        userId: params.userId,
        sessionId: params.sessionId,
      },
    });
  }

  async revokeTrustedDevice(params: { userId: string; deviceId: string }) {
    await this.prisma.trustedDevice.deleteMany({
      where: {
        userId: params.userId,
        id: params.deviceId,
      },
    });
  }

  async getSessionDeviceLabel(params: { userId: string; sessionId: string }) {
    const session = await this.prisma.userSession.findFirst({
      where: {
        userId: params.userId,
        sessionId: params.sessionId,
      },
      select: {
        deviceInfo: true,
        loginLocation: true,
      },
    });

    if (!session) {
      throw new NotFoundException('session not found');
    }

    const parts = [session.deviceInfo, session.loginLocation].filter(
      (segment): segment is string => !!segment,
    );
    const label = parts.join(' · ').trim();

    return { label: label || undefined };
  }

  async bindReferrerEmail(params: {
    userStableId: string;
    referrerInput: string;
  }) {
    const referrerEmail = normalizeEmail(params.referrerInput);
    const referrerPhone = normalizePhone(params.referrerInput);
    if (!referrerEmail && !referrerPhone) {
      throw new BadRequestException('referrerEmailOrPhone is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { userStableId: params.userStableId },
    });
    if (!user) {
      throw new NotFoundException('user not found');
    }

    if (user.referredByUserId) {
      const existingReferrer = await this.prisma.user.findUnique({
        where: { id: user.referredByUserId },
        select: { email: true },
      });
      return {
        bound: false,
        alreadyBound: true,
        referrerEmail: existingReferrer?.email ?? null,
      };
    }

    const referrer = referrerEmail
      ? await this.prisma.user.findUnique({
          where: { email: referrerEmail },
          select: { id: true, userStableId: true, email: true },
        })
      : await this.prisma.user.findUnique({
          where: { phone: referrerPhone ?? undefined },
          select: { id: true, userStableId: true, email: true },
        });

    if (!referrer || referrer.userStableId === params.userStableId) {
      throw new NotFoundException('referrer not found');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { referredByUserId: referrer.id },
    });

    return {
      bound: true,
      alreadyBound: false,
      referrerEmail: referrer.email ?? referrerEmail ?? null,
    };
  }

  /**
   * 返回用户的所有优惠券列表
   */
  async listCoupons(params: { userStableId: string; locale?: 'zh' | 'en' }) {
    const { userStableId, locale } = params;
    const user = await this.requireExistingUser(userStableId);

    const coupons = await this.prisma.coupon.findMany({
      where: { userId: user.id },
      orderBy: [{ expiresAt: 'asc' }, { issuedAt: 'desc' }],
    });

    const preferEnglish = locale === 'en';
    const templateIds = Array.from(
      new Set(
        coupons
          .map((coupon) => coupon.fromTemplateId)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const programStableIds = Array.from(
      new Set(
        coupons
          .map((coupon) => coupon.campaign)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    type CouponTemplateLocalization = {
      id: string;
      tittleCh: string | null;
      titleEn: string | null;
    };
    type CouponProgramLocalization = {
      programStableId: string;
      tittleCh: string | null;
      tittleEn: string | null;
    };

    const [templates, programs] = await Promise.all([
      templateIds.length > 0
        ? this.prisma.couponTemplate.findMany({
            where: { id: { in: templateIds } },
            select: { id: true, tittleCh: true, titleEn: true },
          })
        : Promise.resolve<CouponTemplateLocalization[]>([]),
      programStableIds.length > 0
        ? this.prisma.couponProgram.findMany({
            where: { programStableId: { in: programStableIds } },
            select: { programStableId: true, tittleCh: true, tittleEn: true },
          })
        : Promise.resolve<CouponProgramLocalization[]>([]),
    ] as const);

    const templateMap = new Map(
      templates.map((template) => [template.id, template]),
    );
    const programMap = new Map(
      programs.map((program) => [program.programStableId, program]),
    );

    return coupons.map((coupon) => {
      const template = coupon.fromTemplateId
        ? templateMap.get(coupon.fromTemplateId)
        : undefined;
      const program = coupon.campaign
        ? programMap.get(coupon.campaign)
        : undefined;
      const localizedTitle =
        preferEnglish && template
          ? template.titleEn?.trim() ||
            template.tittleCh?.trim() ||
            coupon.title
          : coupon.title;
      const localizedSource =
        preferEnglish && program
          ? `Program: ${program.tittleEn?.trim() || program.tittleCh}`
          : coupon.source;

      return this.serializeCoupon({
        id: coupon.id,
        couponStableId: coupon.couponStableId,
        title: localizedTitle,
        code: coupon.code,
        discountCents: coupon.discountCents,
        discountPercent: coupon.discountPercent,
        minSpendCents: coupon.minSpendCents,
        expiresAt: coupon.expiresAt,
        usedAt: coupon.usedAt,
        issuedAt: coupon.issuedAt,
        source: localizedSource,
        unlockedItemStableIds: coupon.unlockedItemStableIds ?? [],
        isActive: coupon.isActive,
        isFrozen: coupon.isFrozen,
        startsAt: coupon.startsAt,
        endsAt: coupon.endsAt,
        reservationAttemptId: coupon.reservationAttemptId,
      });
    });
  }

  /**
   * 获取积分流水（最近 N 条）
   */
  async getLoyaltyLedger(params: { userStableId: string; limit?: number }) {
    const { userStableId, limit = 50 } = params;

    const user = await this.requireExistingUser(userStableId);

    const account = await this.loyalty.ensureAccount(user.id);

    const entries = await this.prisma.loyaltyLedger.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        ledgerStableId: true,
        createdAt: true,
        type: true,
        target: true,
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
            ? orderStableById.get(entry.orderId)
            : undefined;

        return {
          // ✅ 对外统一：不用裸 id
          ledgerStableId: entry.ledgerStableId,

          createdAt: entry.createdAt.toISOString(),
          type: entry.type,
          target: entry.target,
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
      couponStableId?: string;
    },
    options?: { tx?: Prisma.TransactionClient },
  ) {
    const { userId, couponStableId } = params;
    if (!couponStableId) return null;
    return this.validateCouponForOrderWithWhere(
      {
        userId,
        where: { couponStableId },
      },
      options,
    );
  }

  private async validateCouponForOrderById(
    params: {
      userId?: string;
      couponId?: string;
    },
    options?: { tx?: Prisma.TransactionClient },
  ) {
    const { userId, couponId } = params;
    if (!couponId) return null;
    return this.validateCouponForOrderWithWhere(
      {
        userId,
        where: { id: couponId },
      },
      options,
    );
  }

  private async validateCouponForOrderWithWhere(
    params: {
      userId?: string;
      where: Prisma.CouponWhereUniqueInput;
    },
    options?: { tx?: Prisma.TransactionClient },
  ) {
    const { userId, where } = params;
    const prisma = options?.tx ?? this.prisma;
    if (!userId) {
      throw new BadRequestException('userId is required when applying coupon');
    }

    const coupon = await prisma.coupon.findUnique({ where });

    if (!coupon || coupon.userId !== userId) {
      throw new BadRequestException('coupon not found for user');
    }

    const status = this.couponStatus(coupon);
    if (status !== 'active') {
      throw new BadRequestException('coupon is not available');
    }

    return { coupon };
  }

  async holdPaymentCoupons(
    params: HoldPaymentCouponReservationInput,
  ): Promise<void> {
    const attemptId = params.attemptId.trim();
    const userStableId = params.userStableId?.trim();
    if (!attemptId) {
      throw new BadRequestException('payment attemptId is required');
    }
    if (!params.couponStableId && !params.selectedUserCouponId) {
      return;
    }

    return this.prisma.$transaction(async (tx) => {
      if (params.couponStableId) {
        if (!userStableId) {
          throw new BadRequestException(
            'userStableId is required when holding a coupon',
          );
        }
        const user = await tx.user.findUnique({
          where: { userStableId },
          select: { id: true },
        });
        const coupon = await tx.coupon.findUnique({
          where: { couponStableId: params.couponStableId },
        });
        if (!user || !coupon || coupon.userId !== user.id) {
          throw new BadRequestException('coupon not found for user');
        }
        const status = this.couponStatus({
          ...coupon,
          reservationAttemptId:
            coupon.reservationAttemptId === attemptId
              ? null
              : coupon.reservationAttemptId,
        });
        if (status !== 'active') {
          throw new BadRequestException('coupon is not available');
        }
        if (coupon.reservationAttemptId !== attemptId) {
          const held = await tx.coupon.updateMany({
            where: {
              id: coupon.id,
              usedAt: null,
              OR: [
                { reservationAttemptId: null },
                { reservationAttemptId: attemptId },
              ],
            },
            data: {
              reservedAt: new Date(),
              reservationAttemptId: attemptId,
              reservationExpiresAt: params.expiresAt,
            },
          });
          if (held.count === 0) {
            throw new BadRequestException('coupon is not available');
          }
        }
      }

      if (params.selectedUserCouponId) {
        if (!userStableId) {
          throw new BadRequestException(
            'userStableId is required when holding a user coupon',
          );
        }
        const userCoupon = await tx.userCoupon.findFirst({
          where: {
            id: params.selectedUserCouponId,
            userStableId,
          },
          include: { coupon: true },
        });
        const now = new Date();
        const underlyingCouponAvailable =
          !!userCoupon?.coupon.isActive &&
          (!userCoupon.coupon.startsAt || userCoupon.coupon.startsAt <= now) &&
          (!userCoupon.coupon.endsAt || userCoupon.coupon.endsAt > now);
        const userCouponAvailable =
          !!userCoupon &&
          (!userCoupon.expiresAt || userCoupon.expiresAt > now) &&
          underlyingCouponAvailable &&
          (userCoupon.status === 'AVAILABLE' ||
            (userCoupon.status === 'RESERVED' &&
              userCoupon.reservationAttemptId === attemptId));
        if (!userCouponAvailable || !userCoupon) {
          throw new BadRequestException('coupon is not available');
        }
        if (
          userCoupon.status !== 'RESERVED' ||
          userCoupon.reservationAttemptId !== attemptId
        ) {
          const held = await tx.userCoupon.updateMany({
            where: {
              id: userCoupon.id,
              userStableId,
              status: 'AVAILABLE',
            },
            data: {
              status: 'RESERVED',
              reservedAt: now,
              reservationAttemptId: attemptId,
              reservationExpiresAt: params.expiresAt,
            },
          });
          if (held.count === 0) {
            throw new BadRequestException('coupon is not available');
          }
        }
      }
    });
  }

  async commitPaymentCouponsForOrder(params: {
    tx: Prisma.TransactionClient;
    attemptId: string;
    orderId: string;
    orderStableId: string;
  }): Promise<void> {
    const attemptId = params.attemptId.trim();
    if (!attemptId) {
      throw new BadRequestException('payment attemptId is required');
    }
    const now = new Date();

    const coupon = await params.tx.coupon.findFirst({
      where: { reservationAttemptId: attemptId },
      select: { id: true, usedAt: true, orderId: true },
    });
    if (coupon) {
      if (coupon.usedAt && coupon.orderId !== params.orderId) {
        throw new BadRequestException(
          'payment coupon is already committed to another order',
        );
      }
      if (!coupon.usedAt) {
        const committed = await params.tx.coupon.updateMany({
          where: {
            id: coupon.id,
            reservationAttemptId: attemptId,
            usedAt: null,
          },
          data: {
            usedAt: now,
            orderId: params.orderId,
            reservationExpiresAt: null,
          },
        });
        if (committed.count === 0) {
          throw new BadRequestException('payment coupon hold was lost');
        }
      }
    }

    const userCoupon = await params.tx.userCoupon.findFirst({
      where: { reservationAttemptId: attemptId },
      select: {
        id: true,
        status: true,
        orderStableId: true,
      },
    });
    if (userCoupon) {
      if (
        userCoupon.status === 'REDEEMED' &&
        userCoupon.orderStableId !== params.orderStableId
      ) {
        throw new BadRequestException(
          'payment user coupon is already committed to another order',
        );
      }
      if (userCoupon.status === 'RESERVED') {
        const committed = await params.tx.userCoupon.updateMany({
          where: {
            id: userCoupon.id,
            reservationAttemptId: attemptId,
            status: 'RESERVED',
          },
          data: {
            status: 'REDEEMED',
            redeemedAt: now,
            orderStableId: params.orderStableId,
            reservationExpiresAt: null,
          },
        });
        if (committed.count === 0) {
          throw new BadRequestException('payment user coupon hold was lost');
        }
      } else if (userCoupon.status !== 'REDEEMED') {
        throw new BadRequestException('payment user coupon hold was released');
      }
    }
  }

  async releasePaymentCoupons(attemptIdRaw: string): Promise<void> {
    const attemptId = attemptIdRaw.trim();
    if (!attemptId) return;
    await this.prisma.$transaction([
      this.prisma.coupon.updateMany({
        where: {
          reservationAttemptId: attemptId,
          usedAt: null,
        },
        data: {
          reservedAt: null,
          reservationAttemptId: null,
          reservationExpiresAt: null,
        },
      }),
      this.prisma.userCoupon.updateMany({
        where: {
          reservationAttemptId: attemptId,
          status: 'RESERVED',
        },
        data: {
          status: 'AVAILABLE',
          reservedAt: null,
          reservationAttemptId: null,
          reservationExpiresAt: null,
        },
      }),
    ]);
  }

  async reserveCouponForOrder(params: {
    tx: Prisma.TransactionClient;
    userId?: string;
    couponId?: string | null;
    orderId: string;
  }) {
    const { tx, userId, couponId, orderId } = params;
    if (!couponId) return null;

    const couponInfo = await this.validateCouponForOrderById(
      { userId, couponId },
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

}
