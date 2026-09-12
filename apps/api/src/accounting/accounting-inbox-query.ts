import {
  AccountingInboxStatus,
  AccountingInboxTrustDecision,
  Prisma,
} from '@prisma/client';

export type AccountingInboxReadClient = Pick<
  Prisma.TransactionClient,
  'accountingInboxItem' | 'accountingTrustedSender'
>;

export async function getAccountingSenderTrustDecision(
  client: AccountingInboxReadClient,
  email: string,
) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return AccountingInboxTrustDecision.UNTRUSTED;
  const sender = await client.accountingTrustedSender.findUnique({
    where: { email: normalized },
    select: { isActive: true },
  });
  return sender?.isActive
    ? AccountingInboxTrustDecision.TRUSTED
    : AccountingInboxTrustDecision.UNTRUSTED;
}

export async function listAccountingTrustedSenders(
  client: AccountingInboxReadClient,
) {
  return client.accountingTrustedSender.findMany({
    select: {
      trustedSenderStableId: true,
      email: true,
      label: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { email: 'asc' },
  });
}

export async function listAccountingUnifiedInboxItems(
  client: AccountingInboxReadClient,
  params: { status?: AccountingInboxStatus; limit?: number },
) {
  const take = Math.min(Math.max(params.limit ?? 100, 1), 200);
  const statuses = params.status
    ? [params.status]
    : [AccountingInboxStatus.PENDING_REVIEW, AccountingInboxStatus.QUARANTINED];
  const rows = await client.accountingInboxItem.findMany({
    where: { status: { in: statuses } },
    select: {
      inboxItemStableId: true,
      status: true,
      classification: true,
      trustDecision: true,
      materializedEntityType: true,
      materializedEntityStableId: true,
      createdAt: true,
      updatedAt: true,
      version: true,
      artifact: {
        select: {
          artifactStableId: true,
          acquisitionMode: true,
          kind: true,
          originalFilename: true,
          storedUrl: true,
          bodyText: true,
          senderEmail: true,
          emailSubject: true,
          metadataJson: true,
          parseRuns: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              parseRunStableId: true,
              parserName: true,
              parserVersion: true,
              status: true,
              resultJson: true,
              errorMessage: true,
              completedAt: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take,
  });
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    artifact: {
      ...row.artifact,
      bodyText: row.artifact.bodyText?.slice(0, 20_000) ?? null,
    },
  }));
}

export async function countAccountingInboxReviewItems(
  client: AccountingInboxReadClient,
) {
  return client.accountingInboxItem.count({
    where: {
      status: {
        in: [
          AccountingInboxStatus.PENDING_REVIEW,
          AccountingInboxStatus.QUARANTINED,
        ],
      },
    },
  });
}

export async function readAccountingInboxExpenseContext(
  client: AccountingInboxReadClient,
  inboxItemStableId: string,
) {
  return client.accountingInboxItem.findUnique({
    where: { inboxItemStableId },
    select: {
      status: true,
      materializedEntityType: true,
      materializedEntityStableId: true,
      artifact: {
        select: {
          artifactStableId: true,
          acquisitionMode: true,
          storedUrl: true,
          bodyText: true,
          emailSubject: true,
          metadataJson: true,
          parseRuns: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { resultJson: true },
          },
        },
      },
    },
  });
}

export function accountingJsonRecord(
  value: Prisma.JsonValue | null | undefined,
): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function accountingOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
