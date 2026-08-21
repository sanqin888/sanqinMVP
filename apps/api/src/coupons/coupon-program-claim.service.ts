import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type CouponDistributionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CouponProgramEligibilityService } from './coupon-program-eligibility.service';
import { CouponProgramIssuerService } from './coupon-program-issuer.service';
import { parseProgramItems } from './coupon-program.utils';

function normalizePromoCode(value: string): string {
  return value.trim().toUpperCase();
}

function isRetryableTransactionError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2034'
  );
}

@Injectable()
export class CouponProgramClaimService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly issuer: CouponProgramIssuerService,
    private readonly eligibility: CouponProgramEligibilityService,
  ) {}

  async listManualClaimPrograms(userStableId: string) {
    await this.ensureUser(userStableId);
    const now = new Date();
    const programs = await this.prisma.couponProgram.findMany({
      where: {
        status: 'ACTIVE',
        distributionType: 'MANUAL_CLAIM',
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validTo: null }, { validTo: { gt: now } }] },
        ],
      },
      orderBy: [{ validTo: 'asc' }, { createdAt: 'desc' }],
    });

    return Promise.all(
      programs.map(async (program) => {
        const eligibility = await this.eligibility.evaluate(
          program,
          userStableId,
        );
        return {
          programStableId: program.programStableId,
          titleZh: program.tittleCh,
          titleEn: program.tittleEn,
          giftValue: program.giftValue,
          validFrom: program.validFrom?.toISOString() ?? null,
          validTo: program.validTo?.toISOString() ?? null,
          perUserLimit: program.perUserLimit,
          issuedToUser: eligibility.issuedToUser,
          canClaim: eligibility.canIssue,
          unavailableReason:
            eligibility.reason === 'ELIGIBLE' ? null : eligibility.reason,
        };
      }),
    );
  }

  async claimManual(userStableId: string, programStableId: string) {
    const normalizedId = programStableId.trim();
    if (!normalizedId) {
      throw new BadRequestException('programStableId is required');
    }
    return this.claimWithRetry({
      userStableId,
      distributionType: 'MANUAL_CLAIM',
      where: { programStableId: normalizedId },
    });
  }

  async claimPromoCode(userStableId: string, code: string) {
    const promoCode = normalizePromoCode(code);
    if (!promoCode) {
      throw new BadRequestException('promo code is required');
    }
    return this.claimWithRetry({
      userStableId,
      distributionType: 'PROMO_CODE',
      where: { promoCode },
    });
  }

  private async claimWithRetry(input: {
    userStableId: string;
    distributionType: CouponDistributionType;
    where: Prisma.CouponProgramWhereUniqueInput;
  }) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.claimInTransaction(input);
      } catch (error) {
        lastError = error;
        if (!isRetryableTransactionError(error)) throw error;
      }
    }
    throw lastError;
  }

  private async claimInTransaction(input: {
    userStableId: string;
    distributionType: CouponDistributionType;
    where: Prisma.CouponProgramWhereUniqueInput;
  }) {
    return this.prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({
          where: { userStableId: input.userStableId },
        });
        if (!user || user.status !== 'ACTIVE') {
          throw new NotFoundException('User not found');
        }

        const program = await tx.couponProgram.findUnique({ where: input.where });
        if (!program || program.distributionType !== input.distributionType) {
          throw new NotFoundException('Promotion not found');
        }
        this.assertProgramActive(program);

        const eligibility = await this.eligibility.evaluate(
          program,
          input.userStableId,
          tx,
        );
        if (!eligibility.canIssue) {
          if (eligibility.reason === 'USER_LIMIT_REACHED') {
            throw new BadRequestException('promotion claim limit reached');
          }
          throw new BadRequestException('promotion is no longer available');
        }

        const result = await this.issuer.issueProgramToUser(program, user, { tx });
        return {
          programStableId: program.programStableId,
          titleZh: program.tittleCh,
          titleEn: program.tittleEn,
          issuedCount: result.issuedCount,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private assertProgramActive(program: {
    status: string;
    validFrom: Date | null;
    validTo: Date | null;
  }) {
    const now = new Date();
    if (program.status !== 'ACTIVE') {
      throw new BadRequestException('promotion is not active');
    }
    if (program.validFrom && program.validFrom > now) {
      throw new BadRequestException('promotion has not started');
    }
    if (program.validTo && program.validTo <= now) {
      throw new BadRequestException('promotion has ended');
    }
  }

  private async ensureUser(userStableId: string) {
    const user = await this.prisma.user.findUnique({
      where: { userStableId },
      select: { id: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async describeProgramContents(programStableId: string) {
    const program = await this.prisma.couponProgram.findUnique({
      where: { programStableId },
      select: { items: true },
    });
    if (!program) throw new NotFoundException('Promotion not found');
    return parseProgramItems(program.items);
  }
}
