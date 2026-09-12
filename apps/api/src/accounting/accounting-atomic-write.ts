import { Prisma, type PrismaClient } from '@prisma/client';

const MAX_SERIALIZABLE_ATTEMPTS = 3;

type AccountingTransactionRunner = Pick<PrismaClient, '$transaction'>;

function isRetryableTransactionError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2034'
  );
}

export async function runSerializableAccountingWrite<T>(
  prisma: AccountingTransactionRunner,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      lastError = error;
      if (!isRetryableTransactionError(error)) throw error;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error('accounting serializable transaction retry exhausted');
}
