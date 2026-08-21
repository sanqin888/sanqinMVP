import { Injectable } from '@nestjs/common';
import { Prisma, type CouponProgram } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseProgramItems } from './coupon-program.utils';

type CouponProgramClient = Pick<Prisma.TransactionClient, 'userCoupon'>;

export type CouponProgramEligibility = {
  canIssue: boolean;
  issuedToUser: number;
  requiredQuantity: number;
  reason: 'ELIGIBLE' | 'TOTAL_LIMIT_REACHED' | 'USER_LIMIT_REACHED';
};

@Injectable()
export class CouponProgramEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(
    program: CouponProgram,
    userStableId: string,
    client: CouponProgramClient = this.prisma,
  ): Promise<CouponProgramEligibility> {
    const items = parseProgramItems(program.items);
    const requiredQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

    if (
      program.totalLimit !== null &&
      program.issuedCount + requiredQuantity > program.totalLimit
    ) {
      return {
        canIssue: false,
        issuedToUser: 0,
        requiredQuantity,
        reason: 'TOTAL_LIMIT_REACHED',
      };
    }

    const whereInput: Prisma.UserCouponWhereInput = {
      userStableId,
      coupon: { campaign: program.programStableId },
    };

    if (program.triggerType === 'BIRTHDAY_MONTH') {
      const currentYear = new Date().getFullYear();
      whereInput.coupon = {
        campaign: program.programStableId,
        issuedAt: { gte: new Date(currentYear, 0, 1) },
      };
    }

    const issuedToUser = await client.userCoupon.count({ where: whereInput });
    if (issuedToUser >= program.perUserLimit) {
      return {
        canIssue: false,
        issuedToUser,
        requiredQuantity,
        reason: 'USER_LIMIT_REACHED',
      };
    }

    return {
      canIssue: true,
      issuedToUser,
      requiredQuantity,
      reason: 'ELIGIBLE',
    };
  }
}
