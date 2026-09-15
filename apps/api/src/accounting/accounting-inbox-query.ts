import {
  AccountingArtifactBinaryRetentionState,
  AccountingArtifactKind,
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
  AccountingInboxTrustDecision,
  Prisma,
} from '@prisma/client';

export type AccountingInboxReadClient = Pick<
  Prisma.TransactionClient,
  'accountingInboxItem' | 'accountingSourceArtifact' | 'accountingTrustedSender'
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
      selectedProvider: true,
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
          financialDocument: {
            select: {
              documentStableId: true,
              provider: true,
              documentType: true,
              revision: true,
              providerMerchantRef: true,
              providerDocumentRef: true,
              periodStart: true,
              periodEnd: true,
              settledAt: true,
              payoutAt: true,
              currency: true,
              lines: {
                orderBy: { lineNo: 'asc' },
                select: {
                  lineStableId: true,
                  lineNo: true,
                  rawName: true,
                  component: true,
                  postingTreatment: true,
                  taxRole: true,
                  amountCents: true,
                  occurredAt: true,
                },
              },
            },
          },
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
      storedUrl:
        row.artifact.kind === AccountingArtifactKind.IMAGE
          ? `/api/v1/accounting/inbox/artifacts/${encodeURIComponent(row.artifact.artifactStableId)}/content`
          : row.artifact.storedUrl,
      bodyText: row.artifact.bodyText?.slice(0, 20_000) ?? null,
      financialDocument: row.artifact.financialDocument
        ? {
            ...row.artifact.financialDocument,
            periodStart:
              row.artifact.financialDocument.periodStart
                ?.toISOString()
                .slice(0, 10) ?? null,
            periodEnd:
              row.artifact.financialDocument.periodEnd
                ?.toISOString()
                .slice(0, 10) ?? null,
            settledAt:
              row.artifact.financialDocument.settledAt?.toISOString() ?? null,
            payoutAt:
              row.artifact.financialDocument.payoutAt?.toISOString() ?? null,
            lines: row.artifact.financialDocument.lines.map((line) => ({
              ...line,
              occurredAt: line.occurredAt?.toISOString().slice(0, 10) ?? null,
            })),
          }
        : null,
    },
  }));
}

export async function listAccountingImageRetentionQueue(
  client: AccountingInboxReadClient,
  limit = 100,
) {
  const take = Math.min(Math.max(limit, 1), 200);
  const rows = await client.accountingInboxItem.findMany({
    where: {
      status: AccountingInboxStatus.CONFIRMED,
      classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
      materializedEntityType:
        AccountingInboxMaterializedEntityType.EXPENSE_DOCUMENT,
      artifact: {
        is: {
          kind: AccountingArtifactKind.IMAGE,
          binaryRetention: {
            is: {
              state: {
                in: [
                  AccountingArtifactBinaryRetentionState.ORIGINAL_PRESENT,
                  AccountingArtifactBinaryRetentionState.CANDIDATE_READY,
                  AccountingArtifactBinaryRetentionState.PURGE_PENDING,
                ],
              },
            },
          },
        },
      },
    },
    select: {
      inboxItemStableId: true,
      createdAt: true,
      updatedAt: true,
      artifact: {
        select: {
          artifactStableId: true,
          originalFilename: true,
          mimeType: true,
          byteSize: true,
          binaryRetention: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take,
  });

  return rows.map((row) => {
    const retention = row.artifact.binaryRetention!;
    const candidate =
      retention.state ===
        AccountingArtifactBinaryRetentionState.CANDIDATE_READY &&
      retention.candidateStoredUrl &&
      retention.candidateContentHash &&
      retention.candidateByteSize &&
      retention.candidateMimeType &&
      retention.candidateWidth &&
      retention.candidateHeight &&
      retention.candidateProfile &&
      retention.candidateMaxDimension &&
      retention.candidateQuality
        ? {
            url: retention.candidateStoredUrl,
            contentHash: retention.candidateContentHash,
            byteSize: retention.candidateByteSize,
            mimeType: retention.candidateMimeType,
            width: retention.candidateWidth,
            height: retention.candidateHeight,
            profile: retention.candidateProfile,
            maxDimension: retention.candidateMaxDimension,
            quality: retention.candidateQuality,
            savingsPercent: accountingRetentionSavingsPercent(
              row.artifact.byteSize,
              retention.candidateByteSize,
            ),
          }
        : retention.state ===
              AccountingArtifactBinaryRetentionState.PURGE_PENDING &&
            retention.retainedStoredUrl &&
            retention.retainedContentHash &&
            retention.retainedByteSize &&
            retention.retainedMimeType &&
            retention.retainedWidth &&
            retention.retainedHeight &&
            retention.retainedProfile &&
            retention.retainedMaxDimension &&
            retention.retainedQuality
          ? {
              url: retention.retainedStoredUrl,
              contentHash: retention.retainedContentHash,
              byteSize: retention.retainedByteSize,
              mimeType: retention.retainedMimeType,
              width: retention.retainedWidth,
              height: retention.retainedHeight,
              profile: retention.retainedProfile,
              maxDimension: retention.retainedMaxDimension,
              quality: retention.retainedQuality,
              savingsPercent: accountingRetentionSavingsPercent(
                row.artifact.byteSize,
                retention.retainedByteSize,
              ),
            }
          : null;

    return {
      inboxItemStableId: row.inboxItemStableId,
      artifactStableId: row.artifact.artifactStableId,
      originalFilename: row.artifact.originalFilename,
      retentionState: retention.state,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      original: {
        url: `/api/v1/accounting/inbox/artifacts/${encodeURIComponent(row.artifact.artifactStableId)}/content`,
        byteSize: row.artifact.byteSize,
        mimeType: row.artifact.mimeType,
        width: retention.originalWidth,
        height: retention.originalHeight,
      },
      derivative: candidate,
    };
  });
}

function accountingRetentionSavingsPercent(
  originalBytes: number | null,
  retainedBytes: number,
) {
  if (!originalBytes || originalBytes <= 0) return 0;
  return Math.max(
    0,
    Math.round((1 - retainedBytes / originalBytes) * 10_000) / 100,
  );
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
      classification: true,
      selectedProvider: true,
      materializedEntityType: true,
      materializedEntityStableId: true,
      artifact: {
        select: {
          artifactStableId: true,
          acquisitionMode: true,
          kind: true,
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

export async function readAccountingImageRetentionContext(
  client: AccountingInboxReadClient,
  inboxItemStableId: string,
) {
  return client.accountingInboxItem.findUnique({
    where: { inboxItemStableId },
    select: {
      status: true,
      classification: true,
      selectedProvider: true,
      materializedEntityType: true,
      materializedEntityStableId: true,
      artifact: {
        select: {
          artifactStableId: true,
          kind: true,
          contentHash: true,
          mimeType: true,
          byteSize: true,
          storedUrl: true,
          binaryRetention: true,
        },
      },
    },
  });
}

export async function readAccountingImageArtifactContentContext(
  client: AccountingInboxReadClient,
  artifactStableId: string,
) {
  return client.accountingSourceArtifact.findUnique({
    where: { artifactStableId },
    select: {
      artifactStableId: true,
      kind: true,
      mimeType: true,
      storedUrl: true,
      binaryRetention: true,
    },
  });
}

export async function readAccountingInboxProviderReviewContext(
  client: AccountingInboxReadClient,
  inboxItemStableId: string,
) {
  return client.accountingInboxItem.findUnique({
    where: { inboxItemStableId },
    select: {
      status: true,
      classification: true,
      selectedProvider: true,
      materializedEntityType: true,
      materializedEntityStableId: true,
      artifact: {
        select: {
          artifactStableId: true,
          acquisitionMode: true,
          bodyText: true,
          emailSubject: true,
          financialDocument: {
            select: {
              documentStableId: true,
              provider: true,
              documentType: true,
              revision: true,
            },
          },
          parseRuns: {
            orderBy: { createdAt: 'desc' },
            select: {
              parserName: true,
              parserVersion: true,
              status: true,
              resultJson: true,
            },
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
