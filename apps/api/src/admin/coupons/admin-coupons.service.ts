// apps/api/src/admin/coupons/admin-coupons.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizePhone } from '../../common/utils/phone';
import { generateStableId } from '../../common/utils/stable-id';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';

type CouponTemplateInput = {
  couponStableId?: string;
  name: string;
  title?: string | null;
  titleEn?: string | null;
  description?: string | null;
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
  validFrom?: string | null;
  validTo?: string | null;
  useRule: Prisma.InputJsonValue;
  issueRule?: Prisma.InputJsonValue | null;
};

type CouponProgramInput = {
  programStableId?: string;
  name: string;
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
  distributionType?:
    | 'AUTOMATIC_TRIGGER'
    | 'MANUAL_CLAIM'
    | 'PROMO_CODE'
    | 'ADMIN_PUSH';
  triggerType?: 'SIGNUP_COMPLETED' | 'REFERRAL_QUALIFIED' | null;
  validFrom?: string | null;
  validTo?: string | null;
  promoCode?: string | null;
  totalLimit?: number | null;
  perUserLimit?: number | null;
  eligibility?: Prisma.InputJsonValue | null;
  items: Prisma.InputJsonValue;
};

const UseRuleSchema = z
  .discriminatedUnion('type', [
    z
      .object({
        type: z.literal('FIXED_CENTS'),
        applyTo: z.union([z.literal('ORDER'), z.literal('ITEM')]),
        itemStableIds: z.array(z.string().min(1)).optional(),
        amountCents: z.number().int().positive(),
        constraints: z
          .object({
            minSubtotalCents: z.number().int().min(0),
          })
          .optional(),
        preset: z.string().optional(),
      })
      .passthrough(),
    z
      .object({
        type: z.literal('PERCENT'),
        applyTo: z.union([z.literal('ORDER'), z.literal('ITEM')]),
        itemStableIds: z.array(z.string().min(1)).optional(),
        percentOff: z.number().int().min(1).max(100),
        constraints: z
          .object({
            minSubtotalCents: z.number().int().min(0),
          })
          .optional(),
        preset: z.string().optional(),
      })
      .passthrough(),
  ])
  .superRefine((value, ctx) => {
    if (value.applyTo === 'ITEM') {
      if (!value.itemStableIds || value.itemStableIds.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'itemStableIds is required when applyTo is ITEM',
        });
      }
    } else if (value.itemStableIds && value.itemStableIds.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'itemStableIds must be empty when applyTo is ORDER',
      });
    }
  });

const IssueRuleSchema = z
  .object({
    mode: z.enum(['MANUAL', 'AUTO']).optional(),
    preset: z.string().optional(),
    expiresInDays: z.number().int().positive().optional(),
  })
  .passthrough();

const ProgramItemsSchema = z
  .array(
    z.object({
      couponStableId: z.string().cuid(),
      quantity: z.number().int().positive().optional().default(1),
    }),
  )
  .min(1);

function parseDateInput(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid date: ${value}`);
  }
  return parsed;
}

function parseDateRange(validFrom?: string | null, validTo?: string | null) {
  const parsedFrom = parseDateInput(validFrom);
  const parsedTo = parseDateInput(validTo);
  if (parsedFrom && parsedTo && parsedTo < parsedFrom) {
    throw new BadRequestException('validTo must be later than validFrom');
  }
  return { validFrom: parsedFrom, validTo: parsedTo };
}

function validateUseRule(value: unknown): Prisma.InputJsonValue {
  const parsed = UseRuleSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException(
      `Invalid useRule configuration: ${parsed.error.message}`,
    );
  }
  return parsed.data as Prisma.InputJsonValue;
}

function parseProgramItems(value: unknown) {
  const parsed = ProgramItemsSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException(
      `Invalid items configuration: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

function parseNullableInteger(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new BadRequestException(`${label} must be a number`);
  }
  if (!Number.isInteger(value)) {
    throw new BadRequestException(`${label} must be an integer`);
  }
  if (value < 0) {
    throw new BadRequestException(`${label} must be non-negative`);
  }
  return value;
}

function parsePositiveInteger(
  value: unknown,
  label: string,
): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new BadRequestException(`${label} must be a number`);
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${label} must be a positive integer`);
  }
  return value;
}

function normalizePromoCode(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException('promoCode must be a string');
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.toUpperCase();
}

function normalizeDistributionType(
  value: CouponProgramInput['distributionType'],
): 'AUTOMATIC_TRIGGER' | 'MANUAL_CLAIM' | 'PROMO_CODE' | 'ADMIN_PUSH' {
  return value ?? 'AUTOMATIC_TRIGGER';
}

function normalizeTriggerType(
  distributionType: CouponProgramInput['distributionType'],
  triggerType: CouponProgramInput['triggerType'],
): 'SIGNUP_COMPLETED' | 'REFERRAL_QUALIFIED' | null {
  if (distributionType && distributionType !== 'AUTOMATIC_TRIGGER') {
    return null;
  }
  if (!triggerType) {
    throw new BadRequestException(
      'triggerType is required for automatic programs',
    );
  }
  return triggerType;
}

function normalizeOptionalObject(
  value: unknown,
  label: string,
): Prisma.InputJsonValue | Prisma.NullTypes.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  if (!value || typeof value !== 'object') {
    throw new BadRequestException(`${label} must be an object or null`);
  }
  return value as Prisma.InputJsonValue;
}

function validateIssueRule(
  value: unknown,
  label: string,
): Prisma.InputJsonValue | Prisma.NullTypes.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  if (!value || typeof value !== 'object') {
    throw new BadRequestException(`${label} must be an object or null`);
  }

  const parsed = IssueRuleSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException(
      `Invalid ${label} configuration: ${parsed.error.message}`,
    );
  }
  return parsed.data as Prisma.InputJsonValue;
}

function getExpiresInDays(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.expiresInDays !== 'number') return null;
  if (!Number.isFinite(record.expiresInDays) || record.expiresInDays <= 0) {
    return null;
  }
  return Math.floor(record.expiresInDays);
}

@Injectable()
export class AdminCouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTemplates() {
    return this.prisma.couponTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTemplate(couponStableId: string) {
    const template = await this.prisma.couponTemplate.findUnique({
      where: { couponStableId },
    });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async createTemplate(input: CouponTemplateInput) {
    const useRule = validateUseRule(input.useRule);
    const issueRule = validateIssueRule(input.issueRule, 'issueRule');
    const { validFrom, validTo } = parseDateRange(
      input.validFrom,
      input.validTo,
    );

    return this.prisma.couponTemplate.create({
      data: {
        couponStableId: input.couponStableId,
        name: input.name,
        title: input.title ?? null,
        titleEn: input.titleEn ?? null,
        description: input.description ?? null,
        status: input.status,
        validFrom,
        validTo,
        useRule,
        issueRule,
      },
    });
  }

  async updateTemplate(couponStableId: string, input: CouponTemplateInput) {
    const existing = await this.prisma.couponTemplate.findUnique({
      where: { couponStableId },
    });
    if (!existing) throw new NotFoundException('Template not found');

    const useRule = validateUseRule(input.useRule);
    const issueRule = validateIssueRule(input.issueRule, 'issueRule');
    const { validFrom, validTo } = parseDateRange(
      input.validFrom,
      input.validTo,
    );

    return this.prisma.couponTemplate.update({
      where: { couponStableId },
      data: {
        name: input.name,
        title: input.title ?? null,
        titleEn: input.titleEn ?? null,
        description: input.description ?? null,
        status: input.status,
        validFrom,
        validTo,
        useRule,
        issueRule,
      },
    });
  }

  async listPrograms() {
    return this.prisma.couponProgram.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProgram(programStableId: string) {
    const program = await this.prisma.couponProgram.findUnique({
      where: { programStableId },
    });
    if (!program) throw new NotFoundException('Program not found');
    return program;
  }

  async createProgram(input: CouponProgramInput) {
    const items = parseProgramItems(input.items);
    await this.ensureProgramItemsExist(items);
    const eligibility = normalizeOptionalObject(
      input.eligibility,
      'eligibility',
    );
    const distributionType = normalizeDistributionType(input.distributionType);
    const triggerType = normalizeTriggerType(
      distributionType,
      input.triggerType,
    );
    const promoCode = normalizePromoCode(input.promoCode);
    const totalLimit = parseNullableInteger(input.totalLimit, 'totalLimit');
    const perUserLimit = parsePositiveInteger(
      input.perUserLimit,
      'perUserLimit',
    );
    const { validFrom, validTo } = parseDateRange(
      input.validFrom,
      input.validTo,
    );

    return this.prisma.couponProgram.create({
      data: {
        programStableId: input.programStableId,
        name: input.name,
        status: input.status,
        distributionType,
        triggerType,
        validFrom,
        validTo,
        promoCode,
        totalLimit,
        perUserLimit,
        eligibility,
        items: items as Prisma.InputJsonValue,
      },
    });
  }

  async updateProgram(programStableId: string, input: CouponProgramInput) {
    const existing = await this.prisma.couponProgram.findUnique({
      where: { programStableId },
    });
    if (!existing) throw new NotFoundException('Program not found');

    const items = parseProgramItems(input.items);
    await this.ensureProgramItemsExist(items);
    const eligibility = normalizeOptionalObject(
      input.eligibility,
      'eligibility',
    );
    const distributionType = normalizeDistributionType(input.distributionType);
    const triggerType = normalizeTriggerType(
      distributionType,
      input.triggerType,
    );
    const promoCode = normalizePromoCode(input.promoCode);
    const totalLimit = parseNullableInteger(input.totalLimit, 'totalLimit');
    const perUserLimit = parsePositiveInteger(
      input.perUserLimit,
      'perUserLimit',
    );
    const { validFrom, validTo } = parseDateRange(
      input.validFrom,
      input.validTo,
    );

    return this.prisma.couponProgram.update({
      where: { programStableId },
      data: {
        name: input.name,
        status: input.status,
        distributionType,
        triggerType,
        validFrom,
        validTo,
        promoCode,
        totalLimit,
        perUserLimit,
        eligibility,
        items: items as Prisma.InputJsonValue,
      },
    });
  }

  async issueProgram(
    programStableId: string,
    input: { userStableId?: string; phone?: string },
  ) {
    const program = await this.prisma.couponProgram.findUnique({
      where: { programStableId },
    });
    if (!program) throw new NotFoundException('Program not found');
    if (program.distributionType !== 'ADMIN_PUSH') {
      throw new BadRequestException('Program is not ADMIN_PUSH');
    }

    const userStableId = input.userStableId?.trim();
    const phone = normalizePhone(input.phone);
    if (!userStableId && !phone) {
      throw new BadRequestException('userStableId or phone is required');
    }

    const user = await this.prisma.user.findFirst({
      where: userStableId ? { userStableId } : { phone: phone ?? undefined },
    });
    if (!user) throw new NotFoundException('User not found');

    const items = parseProgramItems(program.items);
    await this.ensureProgramItemsExist(items);

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
        : program.validTo ?? null;
      const startsAt = expiresInDays ? now : program.validFrom ?? null;
      const endsAt = expiresInDays ? expiresAt : program.validTo ?? null;

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
        where: { programStableId },
        data: { issuedCount: { increment: couponsToCreate.length } },
      });
    });

    return { issuedCount: couponsToCreate.length };
  }

  private async ensureProgramItemsExist(items: { couponStableId: string }[]) {
    const ids = items.map((item) => item.couponStableId);
    const uniqueIds = Array.from(new Set(ids));
    const count = await this.prisma.couponTemplate.count({
      where: { couponStableId: { in: uniqueIds } },
    });
    if (count !== uniqueIds.length) {
      throw new BadRequestException('包含不存在的优惠券模板');
    }
  }
}
