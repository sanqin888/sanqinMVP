import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { normalizeEmail } from '../common/utils/email';
import { generateStableId } from '../common/utils/stable-id';
import { PrismaService } from '../prisma/prisma.service';
import {
  COUPON_PROGRAM_TRIGGER,
  type CouponProgramTriggerPort,
} from '../benefits/public-api';
import {
  CUSTOMER_LIFECYCLE_NOTIFICATION,
  type CustomerLifecycleNotificationPort,
} from '../notifications/public-api';

const MINIMUM_MEMBERSHIP_AGE = 13;
const LEGACY_REFERRAL_CUTOFF = new Date('2026-08-22T16:45:00.000Z');
const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CustomerLanguage = 'ZH' | 'EN';
type CustomerProfileUpdate = {
  firstName?: string;
  lastName?: string;
  birthdayYear?: number;
  birthdayMonth?: number;
  language?: CustomerLanguage;
};

const createStableId = (prefix: string): string => {
  const base = generateStableId();
  return `${prefix}${base.slice(1)}`;
};

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(COUPON_PROGRAM_TRIGGER)
    private readonly couponTriggerService: CouponProgramTriggerPort,
    @Inject(CUSTOMER_LIFECYCLE_NOTIFICATION)
    private readonly customerLifecycleNotification: CustomerLifecycleNotificationPort,
  ) {}

  async getOnboardingStatus(userStableId: string) {
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
      finalized: this.isOnboardingFinalized(user),
      birthdayYear: user.birthdayYear,
      birthdayMonth: user.birthdayMonth,
      hasReferrer: Boolean(user.referredByUserId),
    };
  }

  async finalizeOnboarding(params: {
    userStableId: string;
    birthdayYear: number;
    birthdayMonth: number;
    referrerEmail?: string | null;
  }) {
    const { birthdayYear, birthdayMonth } = this.requireEligibleBirthday(
      {
        birthdayYear: params.birthdayYear,
        birthdayMonth: params.birthdayMonth,
      },
      'valid birth year and month are required',
    );

    const user = await this.prisma.user.findUnique({
      where: { userStableId: params.userStableId },
      select: {
        id: true,
        createdAt: true,
        phoneVerifiedAt: true,
        referralFinalizedAt: true,
        referredByUserId: true,
      },
    });
    if (!user) throw new NotFoundException('user not found');
    if (this.isOnboardingFinalized(user)) {
      throw new ConflictException('membership onboarding is already finalized');
    }

    const normalizedReferrerEmail = normalizeEmail(params.referrerEmail);
    let referrerId: string | undefined;
    if (
      params.referrerEmail?.trim() &&
      (!normalizedReferrerEmail ||
        !SIMPLE_EMAIL_PATTERN.test(normalizedReferrerEmail))
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
        referredByUserId: referrerId,
        referralFinalizedAt: finalizedAt,
      },
    });

    if (updated.count !== 1) {
      throw new ConflictException('membership onboarding is already finalized');
    }

    if (referrerId && user.phoneVerifiedAt) {
      void this.issueQualifiedReferralReward(referrerId);
    }

    return {
      finalized: true,
      hasReferrer: Boolean(referrerId),
      birthdayYear,
      birthdayMonth,
    };
  }

  async updateProfile(params: {
    userStableId: string;
    firstName?: string | null;
    lastName?: string | null;
    birthdayYear?: number | null;
    birthdayMonth?: number | null;
    language?: string | null;
  }) {
    const {
      userStableId,
      firstName,
      lastName,
      birthdayYear,
      birthdayMonth,
      language,
    } = params;

    const user = await this.prisma.user.findUnique({
      where: { userStableId },
    });
    if (!user) throw new NotFoundException('user not found');

    const updateData: CustomerProfileUpdate = {};
    const trimmedFirstName =
      typeof firstName === 'string' && firstName.trim().length > 0
        ? firstName.trim()
        : null;
    const trimmedLastName =
      typeof lastName === 'string' && lastName.trim().length > 0
        ? lastName.trim()
        : null;
    const normalizedLanguage = this.normalizeLanguage(language);

    if (trimmedFirstName && trimmedFirstName !== user.firstName) {
      updateData.firstName = trimmedFirstName;
    }
    if (trimmedLastName && trimmedLastName !== user.lastName) {
      updateData.lastName = trimmedLastName;
    }
    if (normalizedLanguage && normalizedLanguage !== user.language) {
      updateData.language = normalizedLanguage;
    }

    const wantsBirthdayUpdate = birthdayYear != null || birthdayMonth != null;
    if (wantsBirthdayUpdate) {
      const validatedBirthday = this.requireEligibleBirthday({
        birthdayYear,
        birthdayMonth,
      });
      const hasCompleteBirthday =
        user.birthdayYear != null && user.birthdayMonth != null;
      if (!hasCompleteBirthday) {
        updateData.birthdayYear = validatedBirthday.birthdayYear;
        updateData.birthdayMonth = validatedBirthday.birthdayMonth;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return this.serializeProfile(user);
    }

    const updated = await this.prisma.user.update({
      where: { userStableId },
      data: updateData,
      select: {
        firstName: true,
        lastName: true,
        birthdayYear: true,
        birthdayMonth: true,
        language: true,
      },
    });

    return this.serializeProfile(updated);
  }

  async updateMarketingConsent(params: {
    userStableId: string;
    marketingEmailOptIn: boolean;
  }) {
    const { userStableId, marketingEmailOptIn } = params;
    const now = new Date();

    try {
      const existing = await this.prisma.user.findUnique({
        where: { userStableId },
        select: { id: true, marketingEmailOptIn: true, email: true },
      });
      if (!existing) {
        throw new NotFoundException('user not found');
      }

      if (!existing.marketingEmailOptIn && marketingEmailOptIn) {
        if (!existing.email) {
          throw new BadRequestException('email_not_linked');
        }
      }

      const user = await this.prisma.user.update({
        where: { userStableId },
        data: {
          marketingEmailOptIn,
          marketingEmailOptInAt: marketingEmailOptIn ? now : null,
        },
        select: {
          id: true,
          userStableId: true,
          email: true,
          marketingEmailOptIn: true,
          marketingEmailOptInAt: true,
        },
      });

      if (!existing.marketingEmailOptIn && marketingEmailOptIn) {
        await this.triggerMarketingOptInPrograms(user);
      }

      const { id, ...response } = user;
      void id;
      return response;
    } catch (err) {
      if (this.isPrismaErrorCode(err, 'P2025')) {
        throw new NotFoundException('user not found');
      }

      if (err instanceof NotFoundException) {
        throw err;
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

  async listAddresses(params: { userStableId: string }) {
    const userDbId = await this.requireUserDbId(params.userStableId);
    const addresses = await this.prisma.userAddress.findMany({
      where: { userId: userDbId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return addresses.map((address) => this.serializeAddress(address));
  }

  async createAddress(params: {
    userStableId: string;
    label: string;
    receiver: string;
    phone?: string | null;
    addressLine1: string;
    addressLine2?: string | null;
    remark?: string | null;
    city: string;
    province: string;
    postalCode: string;
    placeId?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    isDefault?: boolean;
  }) {
    const userDbId = await this.requireUserDbId(params.userStableId);
    const normalized = this.normalizeAddress(params);
    const coords = this.normalizeCoordinates(params.latitude, params.longitude);
    const hasDefault = await this.prisma.userAddress.count({
      where: { userId: userDbId, isDefault: true },
    });
    const shouldDefault = (params.isDefault ?? false) || hasDefault === 0;

    const created = await this.prisma.$transaction(async (tx) => {
      if (shouldDefault) {
        await tx.userAddress.updateMany({
          where: { userId: userDbId },
          data: { isDefault: false },
        });
      }

      return tx.userAddress.create({
        data: {
          userId: userDbId,
          addressStableId: createStableId('a'),
          ...normalized,
          isDefault: shouldDefault,
          placeId: params.placeId?.trim() || null,
          latitude: coords.latitude,
          longitude: coords.longitude,
        },
      });
    });

    return this.serializeAddress(created);
  }

  async updateAddress(params: {
    userStableId: string;
    addressStableId: string;
    label: string;
    receiver: string;
    phone?: string | null;
    addressLine1: string;
    addressLine2?: string | null;
    remark?: string | null;
    city: string;
    province: string;
    postalCode: string;
    placeId?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    isDefault?: boolean;
  }) {
    const userDbId = await this.requireUserDbId(params.userStableId);
    const target = await this.prisma.userAddress.findFirst({
      where: { addressStableId: params.addressStableId, userId: userDbId },
    });
    if (!target) throw new NotFoundException('address not found');

    const normalized = this.normalizeAddress(params);
    const coords = this.normalizeCoordinates(params.latitude, params.longitude);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (params.isDefault) {
        await tx.userAddress.updateMany({
          where: { userId: userDbId },
          data: { isDefault: false },
        });
      }

      return tx.userAddress.update({
        where: { id: target.id },
        data: {
          ...normalized,
          ...(params.isDefault ? { isDefault: true } : {}),
          placeId: params.placeId?.trim() || null,
          latitude: coords.latitude,
          longitude: coords.longitude,
        },
      });
    });

    return this.serializeAddress(updated);
  }

  async deleteAddress(params: {
    userStableId: string;
    addressStableId: string;
  }) {
    const userDbId = await this.requireUserDbId(params.userStableId);
    const target = await this.prisma.userAddress.findFirst({
      where: { addressStableId: params.addressStableId, userId: userDbId },
    });
    if (!target) throw new NotFoundException('address not found');

    await this.prisma.userAddress.delete({ where: { id: target.id } });
    if (!target.isDefault) return { success: true };

    const nextDefault = await this.prisma.userAddress.findFirst({
      where: { userId: userDbId },
      orderBy: { createdAt: 'desc' },
    });
    if (nextDefault) {
      await this.prisma.userAddress.update({
        where: { id: nextDefault.id },
        data: { isDefault: true },
      });
    }

    return { success: true };
  }

  async setDefaultAddress(params: {
    userStableId: string;
    addressStableId: string;
  }) {
    const userDbId = await this.requireUserDbId(params.userStableId);
    const target = await this.prisma.userAddress.findFirst({
      where: { addressStableId: params.addressStableId, userId: userDbId },
    });
    if (!target) throw new NotFoundException('address not found');

    await this.prisma.$transaction([
      this.prisma.userAddress.updateMany({
        where: { userId: userDbId },
        data: { isDefault: false },
      }),
      this.prisma.userAddress.update({
        where: { id: target.id },
        data: { isDefault: true },
      }),
    ]);

    return { success: true };
  }

  private async requireUserDbId(userStableId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { userStableId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('user not found');
    return user.id;
  }

  private isPrismaErrorCode(error: unknown, code: string): boolean {
    if (!error || typeof error !== 'object' || !('code' in error)) return false;
    return error.code === code;
  }

  private normalizeLanguage(language?: string | null): CustomerLanguage | null {
    if (!language) return null;
    const normalized = language.trim().toLowerCase();
    if (normalized === 'zh') return 'ZH';
    if (normalized === 'en') return 'EN';
    return null;
  }

  private normalizeCoordinates(
    latitude?: number | null,
    longitude?: number | null,
  ): { latitude: number | null; longitude: number | null } {
    const lat = typeof latitude === 'number' ? latitude : null;
    const lng = typeof longitude === 'number' ? longitude : null;
    if (lat === null || lng === null) {
      return { latitude: null, longitude: null };
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { latitude: null, longitude: null };
    }
    return { latitude: lat, longitude: lng };
  }

  private normalizeAddress(params: {
    label: string;
    receiver: string;
    phone?: string | null;
    addressLine1: string;
    addressLine2?: string | null;
    remark?: string | null;
    city: string;
    province: string;
    postalCode: string;
  }) {
    return {
      label: params.label.trim() || 'Address',
      receiver: params.receiver.trim(),
      phone: params.phone?.trim() || null,
      addressLine1: params.addressLine1.trim(),
      addressLine2: params.addressLine2?.trim() || null,
      remark: params.remark?.trim() || null,
      city: params.city.trim(),
      province: params.province.trim(),
      postalCode: params.postalCode.trim(),
    };
  }

  private serializeAddress(address: {
    addressStableId: string;
    label: string;
    receiver: string;
    phone: string | null;
    addressLine1: string;
    addressLine2: string | null;
    remark: string | null;
    city: string;
    province: string;
    postalCode: string;
    placeId: string | null;
    latitude: number | null;
    longitude: number | null;
    isDefault: boolean;
  }) {
    return {
      addressStableId: address.addressStableId,
      label: address.label,
      receiver: address.receiver,
      phone: address.phone ?? '',
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 ?? '',
      remark: address.remark ?? '',
      city: address.city,
      province: address.province,
      postalCode: address.postalCode,
      placeId: address.placeId ?? undefined,
      latitude: address.latitude ?? undefined,
      longitude: address.longitude ?? undefined,
      isDefault: address.isDefault,
    };
  }

  private serializeProfile(profile: {
    firstName: string | null;
    lastName: string | null;
    birthdayYear: number | null;
    birthdayMonth: number | null;
    language: CustomerLanguage;
  }) {
    return {
      firstName: profile.firstName,
      lastName: profile.lastName,
      birthdayYear: profile.birthdayYear,
      birthdayMonth: profile.birthdayMonth,
      language: profile.language === 'ZH' ? 'zh' : 'en',
    };
  }

  private requireEligibleBirthday(
    params: {
      birthdayYear?: number | null;
      birthdayMonth?: number | null;
    },
    invalidMessage = 'invalid birthday',
  ): { birthdayYear: number; birthdayMonth: number } {
    const { birthdayYear, birthdayMonth } = params;
    const validBirthday =
      typeof birthdayYear === 'number' &&
      typeof birthdayMonth === 'number' &&
      Number.isInteger(birthdayYear) &&
      Number.isInteger(birthdayMonth) &&
      birthdayYear >= 1900 &&
      birthdayMonth >= 1 &&
      birthdayMonth <= 12;

    if (!validBirthday) {
      throw new BadRequestException(invalidMessage);
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

    return { birthdayYear, birthdayMonth };
  }

  private isOnboardingFinalized(user: {
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

  private async issueQualifiedReferralReward(referrerId: string) {
    try {
      const referrer = await this.prisma.user.findUnique({
        where: { id: referrerId },
      });
      if (!referrer) return;

      await this.couponTriggerService.issueProgramsForUser(
        'REFERRAL_QUALIFIED',
        referrer.userStableId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to issue referral qualification programs referrerId=${referrerId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async triggerMarketingOptInPrograms(user: {
    id: string;
    userStableId: string;
  }) {
    try {
      const fullUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: {
          userStableId: true,
          email: true,
          firstName: true,
          lastName: true,
          language: true,
          marketingEmailOptIn: true,
        },
      });
      if (!fullUser) return;

      if (fullUser.email && fullUser.marketingEmailOptIn) {
        await this.customerLifecycleNotification.notifySubscriptionWelcome({
          userStableId: fullUser.userStableId,
          email: fullUser.email,
          firstName: fullUser.firstName,
          lastName: fullUser.lastName,
          language: fullUser.language === 'ZH' ? 'ZH' : 'EN',
        });
      }

      await this.couponTriggerService.issueProgramsForUser(
        'MARKETING_OPT_IN',
        fullUser.userStableId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to issue marketing opt-in programs for userStableId=${user.userStableId}`,
        (error as Error).stack,
      );
    }
  }
}
