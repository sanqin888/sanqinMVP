import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, type CouponProgram, type User } from '@prisma/client';
import { generateStableId } from '../common/utils/stable-id';
import { PrismaService } from '../prisma/prisma.service';
import {
  ensureProgramItemsExist,
  getExpiresInDays,
  parseProgramItems,
  validateUseRule,
} from './coupon-program.utils';

@Injectable()
export class CouponProgramIssuerService {
  constructor(private readonly prisma: PrismaService) {}

  async issueProgramToUser(program: CouponProgram, user: User) {
    const items = parseProgramItems(program.items);
    await ensureProgramItemsExist(this.prisma, items);

    const templates = await this.prisma.couponTemplate.findMany({
      where: {
        couponStableId: { in: items.map((item) => item.couponStableId) },
      },
    });
    const templateMap = new Map(
      templates.map((template) => [template.couponStableId, template]),
    );

    const now = new Date();
    const couponsToCreate: Prisma.CouponCreateManyInput[] = [];
    const userCouponsToCreate: Prisma.UserCouponCreateManyInput[] = [];

    for (const item of items) {
      const template = templateMap.get(item.couponStableId);
      if (!template) {
        throw new BadRequestException('Template not found for program item');
      }
      const useRule = validateUseRule(template.useRule);
      const rule = useRule as {
        type: 'FIXED_CENTS' | 'PERCENT';
        applyTo: 'ORDER' | 'ITEM';
        amountCents?: number;
        percentOff?: number;
        constraints?: { minSubtotalCents?: number };
        itemStableIds?: string[];
      };

      if (rule.type === 'PERCENT') {
        throw new BadRequestException(
          `Percent coupons are not supported for issuing: ${template.couponStableId}`,
        );
      }

      const minSpendCents =
        typeof rule.constraints?.minSubtotalCents === 'number'
          ? rule.constraints.minSubtotalCents
          : null;
      const unlockedItemStableIds =
        rule.applyTo === 'ITEM' ? (rule.itemStableIds ?? []) : [];
      const expiresInDays = getExpiresInDays(template.issueRule);
      const expiresAt = expiresInDays
        ? new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000)
        : (program.validTo ?? null);
      const startsAt = expiresInDays ? now : (program.validFrom ?? null);
      const endsAt = expiresInDays ? expiresAt : (program.validTo ?? null);

      for (let i = 0; i < item.quantity; i += 1) {
        const couponStableId = generateStableId();
        couponsToCreate.push({
          couponStableId,
          userId: user.id,
          code: template.couponStableId,
          title: template.title ?? template.name,
          discountCents: rule.amountCents ?? 0,
          minSpendCents,
          expiresAt,
          issuedAt: now,
          source: `Program: ${program.name}`,
          campaign: program.programStableId,
          fromTemplateId: template.id,
          unlockedItemStableIds,
          isActive: true,
          startsAt,
          endsAt,
          stackingPolicy: 'EXCLUSIVE',
        });
        userCouponsToCreate.push({
          userStableId: user.userStableId,
          couponStableId,
          status: 'AVAILABLE',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if (couponsToCreate.length === 0) {
      throw new BadRequestException('No coupons to issue');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.coupon.createMany({ data: couponsToCreate });
      await tx.userCoupon.createMany({ data: userCouponsToCreate });
      await tx.couponProgram.update({
        where: { programStableId: program.programStableId },
        data: { issuedCount: { increment: couponsToCreate.length } },
      });
    });

    return { issuedCount: couponsToCreate.length };
  }
}
