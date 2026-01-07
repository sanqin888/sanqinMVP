// apps/api/src/admin/coupons/admin-coupons.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';

type CouponTemplateInput = {
  couponStableId?: string;
  name: string;
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
  triggerType: 'SIGNUP_COMPLETED' | 'REFERRAL_QUALIFIED';
  validFrom?: string | null;
  validTo?: string | null;
  eligibility?: Prisma.InputJsonValue | null;
  items: Prisma.InputJsonValue;
};

const UseRuleSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('FIXED_CENTS'),
      applyTo: z.literal('ORDER'),
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
      applyTo: z.literal('ORDER'),
      percentOff: z.number().int().min(1).max(100),
      constraints: z
        .object({
          minSubtotalCents: z.number().int().min(0),
        })
        .optional(),
      preset: z.string().optional(),
    })
    .passthrough(),
]);

const IssueRuleSchema = z
  .object({
    mode: z.enum(['MANUAL', 'AUTO']),
    preset: z.string().optional(),
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

function validateUseRule(value: unknown): Prisma.InputJsonValue {
  const parsed = UseRuleSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException(
      `Invalid useRule configuration: ${parsed.error.message}`,
    );
  }
  return parsed.data as Prisma.InputJsonValue;
}

function ensureArray(value: unknown, label: string): Prisma.InputJsonValue {
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${label} must be an array`);
  }
  return value as Prisma.InputJsonValue;
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

    return this.prisma.couponTemplate.create({
      data: {
        couponStableId: input.couponStableId,
        name: input.name,
        status: input.status,
        validFrom: parseDateInput(input.validFrom),
        validTo: parseDateInput(input.validTo),
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

    return this.prisma.couponTemplate.update({
      where: { couponStableId },
      data: {
        name: input.name,
        status: input.status,
        validFrom: parseDateInput(input.validFrom),
        validTo: parseDateInput(input.validTo),
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
    const items = ensureArray(input.items, 'items');
    const eligibility = normalizeOptionalObject(
      input.eligibility,
      'eligibility',
    );

    return this.prisma.couponProgram.create({
      data: {
        programStableId: input.programStableId,
        name: input.name,
        status: input.status,
        triggerType: input.triggerType,
        validFrom: parseDateInput(input.validFrom),
        validTo: parseDateInput(input.validTo),
        eligibility,
        items,
      },
    });
  }

  async updateProgram(programStableId: string, input: CouponProgramInput) {
    const existing = await this.prisma.couponProgram.findUnique({
      where: { programStableId },
    });
    if (!existing) throw new NotFoundException('Program not found');

    const items = ensureArray(input.items, 'items');
    const eligibility = normalizeOptionalObject(
      input.eligibility,
      'eligibility',
    );

    return this.prisma.couponProgram.update({
      where: { programStableId },
      data: {
        name: input.name,
        status: input.status,
        triggerType: input.triggerType,
        validFrom: parseDateInput(input.validFrom),
        validTo: parseDateInput(input.validTo),
        eligibility,
        items,
      },
    });
  }
}
