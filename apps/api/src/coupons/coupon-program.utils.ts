import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';

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

const ProgramItemsSchema = z
  .array(
    z.object({
      couponStableId: z.string().cuid(),
      quantity: z.number().int().positive().optional().default(1),
    }),
  )
  .min(1);

export type ProgramItem = z.infer<typeof ProgramItemsSchema>[number];

export function validateUseRule(value: unknown): Prisma.InputJsonValue {
  const parsed = UseRuleSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException(
      `Invalid useRule configuration: ${parsed.error.message}`,
    );
  }
  return parsed.data as Prisma.InputJsonValue;
}

export function parseProgramItems(value: unknown): ProgramItem[] {
  const parsed = ProgramItemsSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException(
      `Invalid items configuration: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

export function getExpiresInDays(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.expiresInDays !== 'number') return null;
  if (!Number.isFinite(record.expiresInDays) || record.expiresInDays <= 0) {
    return null;
  }
  return Math.floor(record.expiresInDays);
}

export async function ensureProgramItemsExist(
  prisma: PrismaService,
  items: { couponStableId: string }[],
) {
  const ids = items.map((item) => item.couponStableId);
  const uniqueIds = Array.from(new Set(ids));
  const count = await prisma.couponTemplate.count({
    where: { couponStableId: { in: uniqueIds } },
  });
  if (count !== uniqueIds.length) {
    throw new BadRequestException('包含不存在的优惠券模板');
  }
}
