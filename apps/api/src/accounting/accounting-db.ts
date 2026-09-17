import type { PrismaClient } from '@prisma/client';

export const ACCOUNTING_DB = Symbol('ACCOUNTING_DB');

export type AccountingDb = PrismaClient;
