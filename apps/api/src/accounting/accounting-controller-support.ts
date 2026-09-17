import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AccountingFinancialProvider } from './accounting-contracts';

export type AuthedAccountingRequest = Request & {
  user?: { id?: string; userStableId?: string };
};

export function parseNonNegativeAccountingNumber(
  raw: string | undefined,
  fieldName: string,
): number | undefined {
  if (raw == null || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestException(
      `${fieldName} must be a non-negative integer`,
    );
  }
  return value;
}

export function parseAccountingFinancialProvider(
  raw: string | undefined,
): AccountingFinancialProvider | undefined {
  if (!raw?.trim()) return undefined;
  const normalized = raw.trim().toUpperCase();
  switch (normalized) {
    case AccountingFinancialProvider.CLOVER:
      return AccountingFinancialProvider.CLOVER;
    case AccountingFinancialProvider.UBER_EATS:
      return AccountingFinancialProvider.UBER_EATS;
    case AccountingFinancialProvider.FANTUAN:
      return AccountingFinancialProvider.FANTUAN;
    default:
      throw new BadRequestException(
        'provider must be CLOVER, UBER_EATS, or FANTUAN',
      );
  }
}

export function requireAccountingOperatorUserId(
  req: AuthedAccountingRequest,
): string {
  const operatorUserId = req.user?.userStableId?.trim();
  if (!operatorUserId) {
    throw new UnauthorizedException('operator stable user id is required');
  }
  return operatorUserId;
}
