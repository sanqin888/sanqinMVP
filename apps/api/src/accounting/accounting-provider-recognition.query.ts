import { Prisma } from '@prisma/client';
import { mergeAccountingProviderRecognitionRules } from './accounting-provider-recognition.policy';

type AccountingProviderRecognitionReadClient = Pick<
  Prisma.TransactionClient,
  'accountingProviderRecognitionRule'
>;

export async function listAccountingProviderRecognitionRules(
  client: AccountingProviderRecognitionReadClient,
) {
  const rows = await client.accountingProviderRecognitionRule.findMany({
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
  return mergeAccountingProviderRecognitionRules(rows);
}
