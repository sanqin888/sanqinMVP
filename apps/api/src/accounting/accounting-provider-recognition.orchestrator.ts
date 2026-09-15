import { runSerializableAccountingWrite } from './accounting-atomic-write';
import {
  AccountingProviderRecognitionPolicyError,
  normalizeAccountingProviderRecognitionRuleUpdate,
  type AccountingProviderRecognitionRuleUpdate,
} from './accounting-provider-recognition.policy';
import {
  upsertAccountingProviderRecognitionRuleInTx,
} from './accounting-provider-recognition.writer';

type AccountingTransactionRunner = Parameters<
  typeof runSerializableAccountingWrite
>[0];

export async function updateAccountingProviderRecognitionRule(
  prisma: AccountingTransactionRunner,
  ruleStableId: string,
  input: AccountingProviderRecognitionRuleUpdate,
  operatorUserStableId: string,
) {
  const rule = requireStableValue(ruleStableId, 'ruleStableId');
  const operator = requireStableValue(
    operatorUserStableId,
    'operatorUserStableId',
  );
  const normalized = normalizeAccountingProviderRecognitionRuleUpdate(
    rule,
    input,
  );
  return runSerializableAccountingWrite(prisma, (tx) =>
    upsertAccountingProviderRecognitionRuleInTx(
      tx,
      rule,
      normalized,
      operator,
    ),
  );
}

function requireStableValue(raw: string, field: string): string {
  const value = raw.trim();
  if (!value) {
    throw new AccountingProviderRecognitionPolicyError(`${field} is required`);
  }
  return value;
}
