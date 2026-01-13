// apps/api/src/admin/coupons/admin-coupons.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizePhone } from '../../common/utils/phone';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ensureProgramItemsExist,
  parseProgramItems,
  validateUseRule,
} from '../../coupons/coupon-program.utils';
import { CouponProgramIssuerService } from '../../coupons/coupon-program-issuer.service';

type CouponTemplateInput = {
  couponStableId?: string;
  name: string;
  title?: string | null;
  titleEn?: string | null;
  description?: string | null;
  stackingPolicy?: 'EXCLUSIVE' | 'STACKABLE';
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
  triggerType?:
    | 'SIGNUP_COMPLETED'
    | 'REFERRAL_QUALIFIED'
    | 'MARKETING_OPT_IN'
    | 'BIRTHDAY_MONTH'
    | 'TIER_UPGRADE'
    | null;
  validFrom?: string | null;
  validTo?: string | null;
  promoCode?: string | null;
  totalLimit?: number | null;
  perUserLimit?: number | null;
  items: Prisma.InputJsonValue;
};

const IssueRuleSchema = z
  .object({
    mode: z.enum(['MANUAL', 'AUTO']).optional(),
    preset: z.string().optional(),
    expiresInDays: z.number().int().positive().optional(),
  })
  .passthrough();

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

function normalizeStackingPolicy(
  value: CouponTemplateInput['stackingPolicy'],
): 'EXCLUSIVE' | 'STACKABLE' {
  if (!value) return 'EXCLUSIVE';
  if (value === 'EXCLUSIVE' || value === 'STACKABLE') return value;
  throw new BadRequestException(
    'stackingPolicy must be EXCLUSIVE or STACKABLE',
  );
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
):
  | 'SIGNUP_COMPLETED'
  | 'REFERRAL_QUALIFIED'
  | 'MARKETING_OPT_IN'
  | 'BIRTHDAY_MONTH'
  | 'TIER_UPGRADE'
  | null {
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

@Injectable()
export class AdminCouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly issuer: CouponProgramIssuerService,
  ) {}

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
    const stackingPolicy = normalizeStackingPolicy(input.stackingPolicy);

    return this.prisma.couponTemplate.create({
      data: {
        couponStableId: input.couponStableId,
        name: input.name,
        title: input.title ?? null,
        titleEn: input.titleEn ?? null,
        description: input.description ?? null,
        stackingPolicy,
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
    const stackingPolicy = normalizeStackingPolicy(input.stackingPolicy);

    return this.prisma.couponTemplate.update({
      where: { couponStableId },
      data: {
        name: input.name,
        title: input.title ?? null,
        titleEn: input.titleEn ?? null,
        description: input.description ?? null,
        stackingPolicy,
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
    await ensureProgramItemsExist(this.prisma, items);
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
    await ensureProgramItemsExist(this.prisma, items);
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

    return this.issuer.issueProgramToUser(program, user);
  }
}
