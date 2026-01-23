import { Injectable, Logger } from '@nestjs/common';
import {
  type CouponProgram,
  type CouponProgramTriggerType,
  type User,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CouponProgramIssuerService } from './coupon-program-issuer.service';
import { parseProgramItems } from './coupon-program.utils';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class CouponProgramTriggerService {
  private readonly logger = new Logger(CouponProgramTriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly issuer: CouponProgramIssuerService,
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
      if (!(await this.canIssueProgram(program, user))) continue;
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
        if (!(await this.canIssueProgram(program, user))) continue;
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

  private async canIssueProgram(program: CouponProgram, user: User) {
    if (program.totalLimit !== null) {
      const items = parseProgramItems(program.items);
      const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
      if (program.issuedCount + quantity > program.totalLimit) {
        return false;
      }
    }

    const whereInput: {
      userStableId: string;
      coupon: { campaign: string; issuedAt?: { gte: Date } };
    } = {
      userStableId: user.userStableId,
      coupon: { campaign: program.programStableId },
    };

    if (program.triggerType === 'BIRTHDAY_MONTH') {
      const currentYear = new Date().getFullYear();
      const startOfYear = new Date(currentYear, 0, 1);
      whereInput.coupon.issuedAt = { gte: startOfYear };
    }

    const issuedCount = await this.prisma.userCoupon.count({
      where: whereInput,
    });

    if (issuedCount >= program.perUserLimit) {
      return false;
    }

    return true;
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
