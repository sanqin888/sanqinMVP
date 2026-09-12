import {
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
  Prisma,
} from '@prisma/client';
import {
  AccountingInboxWriterConflictError,
  AccountingInboxWriterNotFoundError,
} from './accounting-inbox-core.writer';

type AccountingTx = Prisma.TransactionClient;

export async function confirmProviderFinancialInboxItemInTx(
  tx: AccountingTx,
  inboxItemStableId: string,
  operatorUserStableId: string,
) {
  const item = await tx.accountingInboxItem.findUnique({
    where: { inboxItemStableId },
    select: {
      id: true,
      status: true,
      materializedEntityType: true,
      materializedEntityStableId: true,
    },
  });
  if (!item) {
    throw new AccountingInboxWriterNotFoundError(
      'accounting inbox item not found',
    );
  }
  if (
    item.materializedEntityType !==
      AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT ||
    !item.materializedEntityStableId
  ) {
    throw new AccountingInboxWriterConflictError(
      'inbox item is not linked to provider financial evidence',
    );
  }
  if (item.status === AccountingInboxStatus.CONFIRMED) {
    return {
      inboxItemStableId,
      documentStableId: item.materializedEntityStableId,
      confirmed: true,
      replayed: true,
    };
  }
  if (item.status !== AccountingInboxStatus.PENDING_REVIEW) {
    throw new AccountingInboxWriterConflictError(
      'only pending provider financial evidence can be confirmed',
    );
  }

  const document = await tx.accountingProviderFinancialDocument.findUnique({
    where: { documentStableId: item.materializedEntityStableId },
    select: {
      documentStableId: true,
      provider: true,
      documentType: true,
      revision: true,
    },
  });
  if (!document) {
    throw new AccountingInboxWriterNotFoundError(
      'provider financial document not found',
    );
  }

  await tx.accountingInboxItem.update({
    where: { id: item.id },
    data: {
      status: AccountingInboxStatus.CONFIRMED,
      reviewedAt: new Date(),
      reviewedByUserStableId: operatorUserStableId,
      version: { increment: 1 },
    },
  });
  await tx.accountingAuditLog.create({
    data: {
      action: 'CONFIRM',
      entityType: 'ACCOUNTING_PROVIDER_FINANCIAL_DOCUMENT',
      entityId: document.documentStableId,
      operatorUserId: operatorUserStableId,
      afterJson: {
        provider: document.provider,
        documentType: document.documentType,
        revision: document.revision,
      },
    },
  });

  return {
    inboxItemStableId,
    documentStableId: document.documentStableId,
    provider: document.provider,
    documentType: document.documentType,
    revision: document.revision,
    confirmed: true,
    replayed: false,
  };
}
