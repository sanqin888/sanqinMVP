import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail } from '../common/utils/email';

const MINIMUM_MEMBERSHIP_AGE = 13;
const LEGACY_REFERRAL_CUTOFF = new Date('2026-08-22T16:45:00.000Z');
const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class MembershipOnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(userStableId: string) {
    const user = await this.prisma.user.findUnique({
      where: { userStableId },
      select: {
        createdAt: true,
        birthdayYear: true,
        birthdayMonth: true,
        referralFinalizedAt: true,
        referredByUserId: true,
      },
    });
    if (!user) throw new NotFoundException('user not found');

    return {
      finalized: this.isFinalized(user),
      birthdayYear: user.birthdayYear,
      birthdayMonth: user.birthdayMonth,
      hasReferrer: Boolean(user.referredByUserId),
    };
  }

  async finalize(params: {
    userStableId: string;
    birthdayYear: number;
    birthdayMonth: number;
    referrerEmail?: string | null;
  }) {
    const birthdayYear = Math.trunc(params.birthdayYear);
    const birthdayMonth = Math.trunc(params.birthdayMonth);
    this.assertEligibleBirthday({ birthdayYear, birthdayMonth });

    const user = await this.prisma.user.findUnique({
      where: { userStableId: params.userStableId },
      select: {
        id: true,
        createdAt: true,
        referralFinalizedAt: true,
        referredByUserId: true,
      },
    });
    if (!user) throw new NotFoundException('user not found');
    if (this.isFinalized(user)) {
      throw new ConflictException('membership onboarding is already finalized');
    }

    const normalizedReferrerEmail = normalizeEmail(params.referrerEmail);
    let referrerId: string | undefined;
    if (
      params.referrerEmail?.trim() &&
      (!normalizedReferrerEmail || !SIMPLE_EMAIL_PATTERN.test(normalizedReferrerEmail))
    ) {
      throw new BadRequestException('valid referrerEmail is required');
    }

    if (normalizedReferrerEmail) {
      const referrer = await this.prisma.user.findUnique({
        where: { email: normalizedReferrerEmail },
        select: { id: true },
      });
      if (!referrer || referrer.id === user.id) {
        throw new NotFoundException('referrer not found');
      }
      referrerId = referrer.id;
    }

    const finalizedAt = new Date();
    const updated = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        createdAt: { gte: LEGACY_REFERRAL_CUTOFF },
        referralFinalizedAt: null,
        referredByUserId: null,
      },
      data: {
        birthdayYear,
        birthdayMonth,
        birthdayDay: null,
        referredByUserId: referrerId,
        referralFinalizedAt: finalizedAt,
      },
    });

    if (updated.count !== 1) {
      throw new ConflictException('membership onboarding is already finalized');
    }

    return {
      finalized: true,
      hasReferrer: Boolean(referrerId),
      birthdayYear,
      birthdayMonth,
    };
  }

  private isFinalized(user: {
    createdAt: Date;
    referralFinalizedAt: Date | null;
    referredByUserId: string | null;
  }): boolean {
    return (
      Boolean(user.referralFinalizedAt) ||
      Boolean(user.referredByUserId) ||
      user.createdAt.getTime() < LEGACY_REFERRAL_CUTOFF.getTime()
    );
  }

  private assertEligibleBirthday(params: {
    birthdayYear: number;
    birthdayMonth: number;
  }) {
    const { birthdayYear, birthdayMonth } = params;
    if (
      !Number.isInteger(birthdayYear) ||
      !Number.isInteger(birthdayMonth) ||
      birthdayYear < 1900 ||
      birthdayMonth < 1 ||
      birthdayMonth > 12
    ) {
      throw new BadRequestException('valid birth year and month are required');
    }

    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;
    const yearDifference = currentYear - birthdayYear;
    const safelyAtLeastMinimumAge =
      yearDifference > MINIMUM_MEMBERSHIP_AGE ||
      (yearDifference === MINIMUM_MEMBERSHIP_AGE &&
        currentMonth > birthdayMonth);

    if (!safelyAtLeastMinimumAge) {
      throw new BadRequestException('membership is not available under age 13');
    }
  }
}
