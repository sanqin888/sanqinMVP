import { Injectable, Logger } from '@nestjs/common';
import {
  type CouponProgram,
  type CouponProgramTriggerType,
  type User,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CouponProgramEligibilityService } from './coupon-program-eligibility.service';
import { CouponProgramIssuerService } from './coupon-program-issuer.service';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class CouponProgramTriggerService {
  private readonly logger = new Logger(CouponProgramTriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly issuer: CouponProgramIssuerService,
    private readonly eligibility: CouponProgramEligibilityService,
    private readonly notificationService: NotificationService,
  ) {}

  async issueProgramsForUser(
    triggerType: CouponProgramTriggerType,
    user: User,
  ) {
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

    await this.notificationService.notifyCouponIssued({
      user,
      program,
    });
  }
}
