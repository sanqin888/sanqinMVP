import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type CouponProgram, type User } from '@prisma/client';
import type {
  CouponProgramTriggerPort,
  CouponProgramTriggerType,
} from '../benefits/contracts/coupon-program.contract';
import {
  COUPON_ISSUED_NOTIFICATION,
  type CouponIssuedNotificationPort,
} from '../notifications/public-api';
import { PrismaService } from '../prisma/prisma.service';
import { CouponProgramEligibilityService } from './coupon-program-eligibility.service';
import { CouponProgramIssuerService } from './coupon-program-issuer.service';

@Injectable()
export class CouponProgramTriggerService implements CouponProgramTriggerPort {
  private readonly logger = new Logger(CouponProgramTriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly issuer: CouponProgramIssuerService,
    private readonly eligibility: CouponProgramEligibilityService,
    @Inject(COUPON_ISSUED_NOTIFICATION)
    private readonly couponIssuedNotification: CouponIssuedNotificationPort,
  ) {}

  async issueProgramsForUser(
    triggerType: CouponProgramTriggerType,
    userStableId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { userStableId },
    });
    if (!user) throw new NotFoundException('User not found');

    const programs = await this.findActivePrograms(triggerType);
    if (programs.length === 0) return { issuedCount: 0 };

    let issuedCount = 0;
    for (const program of programs) {
      const eligibility = await this.eligibility.evaluate(
        program,
        user.userStableId,
      );
      if (!eligibility.canIssue) continue;

      const issuedAt = new Date();
      const result = await this.issuer.issueProgramToUser(program, user);
      issuedCount += result.issuedCount;
      if (result.issuedCount > 0) {
        void this.notifyCouponsIssued(user, program, issuedAt);
      }
    }

    return { issuedCount };
  }

  async issueBirthdayProgramsForMonth(targetDate = new Date()) {
    const month = targetDate.getMonth() + 1;
    const programs = await this.findActivePrograms('BIRTHDAY_MONTH');
    if (programs.length === 0) return { issuedCount: 0, userCount: 0 };

    const users = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        birthdayMonth: month,
      },
    });

    let issuedCount = 0;
    for (const user of users) {
      for (const program of programs) {
        const eligibility = await this.eligibility.evaluate(
          program,
          user.userStableId,
        );
        if (!eligibility.canIssue) continue;

        const issuedAt = new Date();
        const result = await this.issuer.issueProgramToUser(program, user);
        issuedCount += result.issuedCount;
        if (result.issuedCount > 0) {
          void this.notifyCouponsIssued(user, program, issuedAt);
        }
      }
    }

    this.logger.log(
      `Issued birthday programs for month=${month}, users=${users.length}, coupons=${issuedCount}`,
    );

    return { issuedCount, userCount: users.length };
  }

  private async findActivePrograms(triggerType: CouponProgramTriggerType) {
    const now = new Date();
    return this.prisma.couponProgram.findMany({
      where: {
        triggerType,
        status: 'ACTIVE',
        distributionType: 'AUTOMATIC_TRIGGER',
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validTo: null }, { validTo: { gt: now } }] },
        ],
      },
    });
  }

  private async notifyCouponsIssued(
    user: User,
    program: CouponProgram,
    issuedAt: Date,
  ) {
    const coupons = await this.prisma.coupon.findMany({
      where: {
        userId: user.id,
        campaign: program.programStableId,
        issuedAt: { gte: issuedAt },
      },
      select: { expiresAt: true },
    });

    if (coupons.length === 0) return;

    await this.couponIssuedNotification.notifyCouponIssued({
      recipient: {
        userStableId: user.userStableId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        language: user.language,
      },
      program: {
        titleZh: program.tittleCh,
        titleEn: program.tittleEn,
        programStableId: program.programStableId,
        giftValue: program.giftValue,
        reason: program.triggerType,
      },
    });
  }
}
