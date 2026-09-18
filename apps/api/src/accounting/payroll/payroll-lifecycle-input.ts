import { BadRequestException } from '@nestjs/common';

export const parsePayrollDateOnly = (raw: string, field: string): Date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new BadRequestException(`${field} must use YYYY-MM-DD`);
  }
  const value = new Date(`${raw}T00:00:00.000Z`);
  if (
    Number.isNaN(value.getTime()) ||
    value.toISOString().slice(0, 10) !== raw
  ) {
    throw new BadRequestException(`${field} must be a valid calendar date`);
  }
  return value;
};

export const parseOptionalPayrollDateOnly = (
  raw: string | null | undefined,
  field: string,
): Date | null | undefined => {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  return parsePayrollDateOnly(raw, field);
};

export const parseOptionalPayrollTimestamp = (
  raw: string | null | undefined,
  field: string,
): Date | null | undefined => {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) {
    throw new BadRequestException(`${field} must be a valid ISO timestamp`);
  }
  return value;
};

export const payrollDateOnly = (date: Date | null | undefined): string | null =>
  date ? date.toISOString().slice(0, 10) : null;

export const requirePayrollStableId = (
  raw: string,
  field: string,
): string => {
  const value = raw?.trim();
  if (!value) throw new BadRequestException(`${field} is required`);
  return value;
};

export const normalizePayrollOptionalText = (
  raw: string | null | undefined,
): string | null | undefined => {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const value = raw.trim();
  return value || null;
};

export const requirePayrollText = (raw: string, field: string): string => {
  const value = raw?.trim();
  if (!value) throw new BadRequestException(`${field} is required`);
  return value;
};

export const requireNonNegativePayrollInteger = (
  value: number,
  field: string,
): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BadRequestException(
      `${field} must be a non-negative safe integer`,
    );
  }
  return value;
};

export const requirePositivePayrollInteger = (
  value: number,
  field: string,
): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new BadRequestException(`${field} must be a positive safe integer`);
  }
  return value;
};

export const requirePayrollEnum = <T extends string>(
  value: T,
  allowed: readonly T[],
  field: string,
): T => {
  if (!allowed.includes(value)) {
    throw new BadRequestException(
      `${field} must be one of: ${allowed.join(', ')}`,
    );
  }
  return value;
};
