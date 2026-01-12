import { Injectable, Logger } from '@nestjs/common';
import {
  type CouponProgram,
  type CouponProgramTriggerType,
  type User,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CouponProgramIssuerService } from './coupon-program-issuer.service';
import { parseProgramItems } from './coupon-program.utils';

@Injectable()
export class CouponProgramTriggerService {
  private readonly logger = new Logger(CouponProgramTriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly issuer: CouponProgramIssuerService,
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
      const result = await this.issuer.issueProgramToUser(program, user);
      issuedCount += result.issuedCount;
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
        const result = await this.issuer.issueProgramToUser(program, user);
        issuedCount += result.issuedCount;
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

    const issuedCount = await this.prisma.userCoupon.count({
      where: {
        userStableId: user.userStableId,
        coupon: { campaign: program.programStableId },
      },
    });

    if (issuedCount >= program.perUserLimit) {
      return false;
    }

    return true;
  }
}
