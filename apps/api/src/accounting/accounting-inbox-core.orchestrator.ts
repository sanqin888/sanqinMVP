import { AccountingFinancialProvider } from '@prisma/client';
import { runSerializableAccountingWrite } from './accounting-atomic-write';
import {
  AccountingInboxPolicyError,
  PROVIDER_FINANCIAL_HISTORY_START_DATE,
  normalizeAccountingInboxArtifact,
  normalizeAccountingParseRun,
  normalizeAccountingTrustedSender,
  normalizeProviderFinancialDocument,
  type AccountingInboxArtifactInput,
  type AccountingParseRunInput,
  type AccountingProviderFinancialDocumentInput,
  type AccountingTrustedSenderInput,
} from './accounting-inbox-core.policy';
import {
  AccountingInboxWriterConflictError,
  ensureProviderFinancialCoverageInTx,
  readInboxArtifactReplay,
  readProviderFinancialDocumentReplay,
  recordParseRunInTx,
  recordProviderFinancialDocumentInTx,
  registerInboxArtifactInTx,
  upsertTrustedSenderInTx,
} from './accounting-inbox-core.writer';

type AccountingTransactionRunner = Parameters<
  typeof runSerializableAccountingWrite
>[0];

export async function registerAccountingInboxArtifact(
  prisma: AccountingTransactionRunner,
  input: AccountingInboxArtifactInput,
) {
  const normalized = normalizeAccountingInboxArtifact(input);
  try {
    return await runSerializableAccountingWrite(prisma, (tx) =>
      registerInboxArtifactInTx(tx, normalized),
    );
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    return runSerializableAccountingWrite(prisma, (tx) =>
      readInboxArtifactReplay(tx, normalized),
    );
  }
}

export async function recordAccountingInboxParseRun(
  prisma: AccountingTransactionRunner,
  input: AccountingParseRunInput,
) {
  const normalized = normalizeAccountingParseRun(input);
  return runSerializableAccountingWrite(prisma, (tx) =>
    recordParseRunInTx(tx, normalized),
  );
}

export async function upsertAccountingTrustedSender(
  prisma: AccountingTransactionRunner,
  input: AccountingTrustedSenderInput,
  operatorUserStableId: string,
) {
  const normalized = normalizeAccountingTrustedSender(input);
  const operator = requireStableValue(
    operatorUserStableId,
    'operatorUserStableId',
  );
  return runSerializableAccountingWrite(prisma, (tx) =>
    upsertTrustedSenderInTx(tx, normalized, operator),
  );
}

export async function recordAccountingProviderFinancialDocument(
  prisma: AccountingTransactionRunner,
  input: AccountingProviderFinancialDocumentInput,
) {
  const normalized = normalizeProviderFinancialDocument(input);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await runSerializableAccountingWrite(prisma, (tx) =>
        recordProviderFinancialDocumentInTx(tx, normalized),
      );
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      try {
        return await runSerializableAccountingWrite(prisma, (tx) =>
          readProviderFinancialDocumentReplay(tx, normalized),
        );
      } catch (replayError) {
        if (
          attempt === 0 &&
          replayError instanceof AccountingInboxWriterConflictError
        ) {
          continue;
        }
        throw replayError;
      }
    }
  }
  throw new AccountingInboxWriterConflictError(
    'financial document revision conflict',
  );
}

export async function ensureAccountingProviderFinancialCoverage(
  prisma: AccountingTransactionRunner,
  provider: AccountingFinancialProvider,
  storeStableId: string,
  operatorUserStableId?: string,
) {
  const store = requireStableValue(storeStableId, 'storeStableId');
  const operator = operatorUserStableId?.trim() || null;
  const requiredFrom = new Date(
    `${PROVIDER_FINANCIAL_HISTORY_START_DATE}T00:00:00.000Z`,
  );
  return runSerializableAccountingWrite(prisma, (tx) =>
    ensureProviderFinancialCoverageInTx(
      tx,
      provider,
      store,
      requiredFrom,
      operator,
    ),
  );
}

function requireStableValue(raw: string, field: string): string {
  const value = raw.trim();
  if (!value) throw new AccountingInboxPolicyError(`${field} is required`);
  return value;
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002',
  );
}
