import { Prisma } from '@prisma/client';
import {
  AccountingProviderRecognitionPolicyError,
  getDefaultAccountingProviderRecognitionRule,
  type AccountingProviderRecognitionRuleUpdate,
} from './accounting-provider-recognition.policy';

type AccountingTx = Prisma.TransactionClient;

export async function upsertAccountingProviderRecognitionRuleInTx(
  tx: AccountingTx,
  ruleStableId: string,
  normalized: AccountingProviderRecognitionRuleUpdate,
  operatorUserStableId: string,
) {
  const defaultRule = getDefaultAccountingProviderRecognitionRule(ruleStableId);
  const existing = await tx.accountingProviderRecognitionRule.findUnique({
    where: { ruleStableId },
    select: {
      ruleStableId: true,
      provider: true,
      documentType: true,
      requiredKeywords: true,
      optionalKeywords: true,
      optionalMatchMode: true,
      priority: true,
      isActive: true,
      version: true,
      updatedByUserStableId: true,
    },
  });
  if (
    existing &&
    (existing.provider !== defaultRule.provider ||
      existing.documentType !== defaultRule.documentType)
  ) {
    throw new AccountingProviderRecognitionPolicyError(
      `provider recognition identity mismatch for ${ruleStableId}`,
    );
  }
  const before = existing ?? {
    ruleStableId: defaultRule.ruleStableId,
    provider: defaultRule.provider,
    documentType: defaultRule.documentType,
    requiredKeywords: [...defaultRule.requiredKeywords],
    optionalKeywords: [...defaultRule.optionalKeywords],
    optionalMatchMode: defaultRule.optionalMatchMode,
    priority: defaultRule.priority,
    isActive: defaultRule.isActive,
    version: defaultRule.version,
    updatedByUserStableId: defaultRule.updatedByUserStableId,
  };

  if (sameRecognitionRuleConfig(before, normalized)) {
    return {
      ...before,
      persisted: Boolean(existing),
      changed: false,
    };
  }

  const row = await tx.accountingProviderRecognitionRule.upsert({
    where: { ruleStableId },
    create: {
      ruleStableId,
      provider: defaultRule.provider,
      documentType: defaultRule.documentType,
      requiredKeywords: normalized.requiredKeywords,
      optionalKeywords: normalized.optionalKeywords,
      optionalMatchMode: normalized.optionalMatchMode,
      priority: normalized.priority,
      isActive: normalized.isActive,
      version: defaultRule.version + 1,
      updatedByUserStableId: operatorUserStableId,
    },
    update: {
      requiredKeywords: normalized.requiredKeywords,
      optionalKeywords: normalized.optionalKeywords,
      optionalMatchMode: normalized.optionalMatchMode,
      priority: normalized.priority,
      isActive: normalized.isActive,
      version: { increment: 1 },
      updatedByUserStableId: operatorUserStableId,
    },
    select: {
      ruleStableId: true,
      provider: true,
      documentType: true,
      requiredKeywords: true,
      optionalKeywords: true,
      optionalMatchMode: true,
      priority: true,
      isActive: true,
      version: true,
      updatedByUserStableId: true,
    },
  });
  await tx.accountingAuditLog.create({
    data: {
      action: 'UPDATE_RECOGNITION_RULE',
      entityType: 'ACCOUNTING_PROVIDER_RECOGNITION_RULE',
      entityId: ruleStableId,
      operatorUserId: operatorUserStableId,
      beforeJson: before as unknown as Prisma.InputJsonValue,
      afterJson: row as unknown as Prisma.InputJsonValue,
    },
  });
  return { ...row, persisted: true, changed: true };
}

function sameRecognitionRuleConfig(
  current: {
    requiredKeywords: string[];
    optionalKeywords: string[];
    optionalMatchMode: AccountingProviderRecognitionRuleUpdate['optionalMatchMode'];
    priority: number;
    isActive: boolean;
  },
  next: AccountingProviderRecognitionRuleUpdate,
) {
  return (
    current.optionalMatchMode === next.optionalMatchMode &&
    current.priority === next.priority &&
    current.isActive === next.isActive &&
    sameStrings(current.requiredKeywords, next.requiredKeywords) &&
    sameStrings(current.optionalKeywords, next.optionalKeywords)
  );
}

function sameStrings(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
