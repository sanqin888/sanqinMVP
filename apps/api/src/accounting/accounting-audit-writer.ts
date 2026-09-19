import { Prisma } from '@prisma/client';

export type AccountingAuditDbClient = Pick<
  Prisma.TransactionClient,
  'accountingAuditLog'
>;

export type AccountingAuditWriteInput = {
  action: string;
  entityType: string;
  entityId: string;
  operatorActorRef: string;
  beforeJson?: Prisma.InputJsonValue | null;
  afterJson?: Prisma.InputJsonValue | null;
};

export async function writeAccountingAuditLog(
  db: AccountingAuditDbClient,
  input: AccountingAuditWriteInput,
): Promise<void> {
  await db.accountingAuditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      operatorActorRef: input.operatorActorRef,
      beforeJson:
        input.beforeJson === null ? Prisma.JsonNull : input.beforeJson,
      afterJson: input.afterJson === null ? Prisma.JsonNull : input.afterJson,
    },
  });
}
