import { Prisma, type PrismaClient } from '@prisma/client';

export const ACCOUNTING_DB = Symbol('ACCOUNTING_DB');

export type AccountingDb = PrismaClient;
export type AccountingTransactionClient = Prisma.TransactionClient;
export type AccountingJsonValue = Prisma.InputJsonValue;
export const ACCOUNTING_JSON_NULL = Prisma.DbNull;
