import { createId } from '@paralleldrive/cuid2';
import {
  AccountingFinancialProvider,
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
  AccountingInboxTrustDecision,
  AccountingParseStatus,
  Prisma,
} from '@prisma/client';
import type {
  normalizeAccountingInboxArtifact,
  normalizeAccountingParseRun,
  normalizeAccountingTrustedSender,
  normalizeProviderFinancialDocument,
} from './accounting-inbox-core.policy';

export class AccountingInboxWriterConflictError extends Error {}
export class AccountingInboxWriterNotFoundError extends Error {}

type NormalizedArtifact = ReturnType<typeof normalizeAccountingInboxArtifact>;
type NormalizedParseRun = ReturnType<typeof normalizeAccountingParseRun>;
type NormalizedTrustedSender = ReturnType<
  typeof normalizeAccountingTrustedSender
>;
type NormalizedFinancialDocument = ReturnType<
  typeof normalizeProviderFinancialDocument
>;

type AccountingTx = Prisma.TransactionClient;

const ARTIFACT_PUBLIC_SELECT = {
  artifactStableId: true,
  contentHash: true,
  kind: true,
  storedUrl: true,
  inboxItem: {
    select: {
      id: true,
      inboxItemStableId: true,
      status: true,
      classification: true,
      trustDecision: true,
      materializedEntityType: true,
      materializedEntityStableId: true,
      duplicateOfArtifact: { select: { artifactStableId: true } },
    },
  },
} satisfies Prisma.AccountingSourceArtifactSelect;

export async function registerInboxArtifactInTx(
  tx: AccountingTx,
  normalized: NormalizedArtifact,
) {
  const existing = await tx.accountingSourceArtifact.findUnique({
    where: {
      acquisitionMode_transportIdentity: {
        acquisitionMode: normalized.acquisitionMode,
        transportIdentity: normalized.transportIdentity,
      },
    },
    select: ARTIFACT_PUBLIC_SELECT,
  });
  if (existing) {
    if (
      existing.contentHash !== normalized.contentHash ||
      existing.kind !== normalized.kind
    ) {
      throw new AccountingInboxWriterConflictError(
        'artifact transport identity was reused with different content',
      );
    }
    const promoted = await promoteArtifactTrustIfNeeded(
      tx,
      existing,
      normalized,
    );
    return presentRegisteredArtifact(promoted, true);
  }

  const duplicate = await tx.accountingSourceArtifact.findFirst({
    where: { contentHash: normalized.contentHash },
    orderBy: { createdAt: 'asc' },
    select: { id: true, artifactStableId: true },
  });
  const artifact = await tx.accountingSourceArtifact.create({
    data: {
      artifactStableId: `acctart_${createId()}`,
      acquisitionMode: normalized.acquisitionMode,
      kind: normalized.kind,
      transportIdentity: normalized.transportIdentity,
      contentHash: normalized.contentHash,
      mimeType: normalized.mimeType,
      originalFilename: normalized.originalFilename,
      byteSize: normalized.byteSize,
      storedUrl: normalized.storedUrl,
      bodyText: normalized.bodyText,
      senderEmail: normalized.senderEmail,
      emailSubject: normalized.emailSubject,
      ...(normalized.metadataJson === undefined
        ? {}
        : { metadataJson: normalized.metadataJson as Prisma.InputJsonValue }),
    },
    select: { id: true, artifactStableId: true },
  });
  const status = duplicate
    ? AccountingInboxStatus.DUPLICATE
    : normalized.trustDecision === AccountingInboxTrustDecision.UNTRUSTED
      ? AccountingInboxStatus.QUARANTINED
      : AccountingInboxStatus.PENDING_REVIEW;
  const inboxItem = await tx.accountingInboxItem.create({
    data: {
      inboxItemStableId: `acctinbox_${createId()}`,
      artifactId: artifact.id,
      status,
      classification: AccountingInboxClassification.UNKNOWN,
      trustDecision: normalized.trustDecision,
      duplicateOfArtifactId: duplicate?.id ?? null,
    },
    select: {
      inboxItemStableId: true,
      status: true,
      classification: true,
      trustDecision: true,
      materializedEntityType: true,
      materializedEntityStableId: true,
      duplicateOfArtifact: { select: { artifactStableId: true } },
    },
  });
  return {
    artifactStableId: artifact.artifactStableId,
    contentHash: normalized.contentHash,
    kind: normalized.kind,
    storedUrl: normalized.storedUrl,
    inboxItem,
    duplicateOfArtifactStableId: duplicate?.artifactStableId ?? null,
    replayed: false,
  };
}

export async function readInboxArtifactReplay(
  tx: AccountingTx,
  normalized: NormalizedArtifact,
) {
  const existing = await tx.accountingSourceArtifact.findUnique({
    where: {
      acquisitionMode_transportIdentity: {
        acquisitionMode: normalized.acquisitionMode,
        transportIdentity: normalized.transportIdentity,
      },
    },
    select: ARTIFACT_PUBLIC_SELECT,
  });
  if (
    !existing ||
    existing.contentHash !== normalized.contentHash ||
    existing.kind !== normalized.kind
  ) {
    throw new AccountingInboxWriterConflictError(
      'artifact registration conflict',
    );
  }
  const promoted = await promoteArtifactTrustIfNeeded(tx, existing, normalized);
  return presentRegisteredArtifact(promoted, true);
}

export async function recordParseRunInTx(
  tx: AccountingTx,
  normalized: NormalizedParseRun,
) {
  const artifact = await tx.accountingSourceArtifact.findUnique({
    where: { artifactStableId: normalized.artifactStableId },
    select: { id: true },
  });
  if (!artifact) {
    throw new AccountingInboxWriterNotFoundError(
      'accounting artifact not found',
    );
  }

  const existing = await tx.accountingParseRun.findUnique({
    where: { idempotencyKey: normalized.idempotencyKey },
    select: {
      artifactId: true,
      status: true,
      resultHash: true,
    },
  });
  if (existing && existing.artifactId !== artifact.id) {
    throw new AccountingInboxWriterConflictError(
      'parse idempotency key belongs to another artifact',
    );
  }
  if (
    existing?.status === AccountingParseStatus.SUCCESS &&
    (normalized.status !== AccountingParseStatus.SUCCESS ||
      existing.resultHash !== normalized.resultHash)
  ) {
    throw new AccountingInboxWriterConflictError(
      'successful parser result is immutable for the same parser version',
    );
  }

  const completedAt =
    normalized.status === AccountingParseStatus.PENDING ? null : new Date();
  const row = await tx.accountingParseRun.upsert({
    where: { idempotencyKey: normalized.idempotencyKey },
    create: {
      parseRunStableId: `acctparse_${createId()}`,
      artifactId: artifact.id,
      idempotencyKey: normalized.idempotencyKey,
      parserName: normalized.parserName,
      parserVersion: normalized.parserVersion,
      status: normalized.status,
      resultHash: normalized.resultHash,
      ...(normalized.resultJson === undefined
        ? {}
        : { resultJson: normalized.resultJson as Prisma.InputJsonValue }),
      errorMessage: normalized.errorMessage,
      completedAt,
    },
    update: {
      status: normalized.status,
      resultHash: normalized.resultHash,
      ...(normalized.resultJson === undefined
        ? {}
        : { resultJson: normalized.resultJson as Prisma.InputJsonValue }),
      errorMessage: normalized.errorMessage,
      completedAt,
    },
    select: {
      parseRunStableId: true,
      status: true,
      resultHash: true,
      completedAt: true,
    },
  });
  return {
    ...row,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export async function upsertTrustedSenderInTx(
  tx: AccountingTx,
  normalized: NormalizedTrustedSender,
  operatorUserStableId: string,
) {
  const existing = await tx.accountingTrustedSender.findUnique({
    where: { email: normalized.email },
    select: {
      trustedSenderStableId: true,
      email: true,
      label: true,
      isActive: true,
    },
  });
  const row = await tx.accountingTrustedSender.upsert({
    where: { email: normalized.email },
    create: {
      trustedSenderStableId: `acctsender_${createId()}`,
      email: normalized.email,
      label: normalized.label,
      isActive: normalized.isActive,
      createdByUserStableId: operatorUserStableId,
      updatedByUserStableId: operatorUserStableId,
    },
    update: {
      label: normalized.label,
      isActive: normalized.isActive,
      updatedByUserStableId: operatorUserStableId,
    },
    select: {
      trustedSenderStableId: true,
      email: true,
      label: true,
      isActive: true,
    },
  });
  await tx.accountingAuditLog.create({
    data: {
      action: existing ? 'UPDATE' : 'CREATE',
      entityType: 'ACCOUNTING_TRUSTED_SENDER',
      entityId: row.trustedSenderStableId,
      operatorUserId: operatorUserStableId,
      ...(existing
        ? { beforeJson: existing as unknown as Prisma.InputJsonValue }
        : {}),
      afterJson: row as unknown as Prisma.InputJsonValue,
    },
  });
  return row;
}

export async function recordProviderFinancialDocumentInTx(
  tx: AccountingTx,
  normalized: NormalizedFinancialDocument,
) {
  const artifact = await tx.accountingSourceArtifact.findUnique({
    where: { artifactStableId: normalized.artifactStableId },
    select: {
      id: true,
      contentHash: true,
      inboxItem: { select: { id: true, status: true } },
    },
  });
  if (!artifact?.inboxItem) {
    throw new AccountingInboxWriterNotFoundError(
      'accounting inbox artifact not found',
    );
  }
  if (
    artifact.inboxItem.status === AccountingInboxStatus.QUARANTINED ||
    artifact.inboxItem.status === AccountingInboxStatus.DUPLICATE ||
    artifact.inboxItem.status === AccountingInboxStatus.ERROR ||
    artifact.inboxItem.status === AccountingInboxStatus.DISCARDED
  ) {
    throw new AccountingInboxWriterConflictError(
      'inbox artifact is not eligible for financial document materialization',
    );
  }

  const latest = await tx.accountingProviderFinancialDocument.findFirst({
    where: {
      provider: normalized.provider,
      documentType: normalized.documentType,
      businessIdentityKey: normalized.businessIdentityKey,
    },
    orderBy: { revision: 'desc' },
    select: {
      id: true,
      documentStableId: true,
      revision: true,
      provider: true,
      documentType: true,
      artifact: { select: { contentHash: true } },
    },
  });
  if (latest?.artifact.contentHash === artifact.contentHash) {
    return {
      documentStableId: latest.documentStableId,
      provider: latest.provider,
      documentType: latest.documentType,
      revision: latest.revision,
      replayed: true,
    };
  }

  const revision = (latest?.revision ?? 0) + 1;
  const documentStableId = `acctfindoc_${createId()}`;
  await tx.accountingProviderFinancialDocument.create({
    data: {
      documentStableId,
      artifactId: artifact.id,
      provider: normalized.provider,
      documentType: normalized.documentType,
      businessIdentityKey: normalized.businessIdentityKey,
      revision,
      supersedesDocumentId: latest?.id ?? null,
      storeStableId: normalized.storeStableId,
      providerMerchantRef: normalized.providerMerchantRef,
      providerDocumentRef: normalized.providerDocumentRef,
      periodStart: normalized.periodStart,
      periodEnd: normalized.periodEnd,
      settledAt: normalized.settledAt,
      payoutAt: normalized.payoutAt,
      currency: normalized.currency,
      parserName: normalized.parserName,
      parserVersion: normalized.parserVersion,
      ...(normalized.rawMetadata === undefined
        ? {}
        : { rawMetadata: normalized.rawMetadata as Prisma.InputJsonValue }),
      lines: {
        create: normalized.lines.map((line) => ({
          lineStableId: `acctfinline_${createId()}`,
          lineNo: line.lineNo,
          externalRef: line.externalRef,
          rawCode: line.rawCode,
          rawName: line.rawName,
          component: line.component,
          postingTreatment: line.postingTreatment,
          taxRole: line.taxRole,
          amountCents: line.amountCents,
          occurredAt: line.occurredAt,
          ...(line.rawPayload === undefined
            ? {}
            : { rawPayload: line.rawPayload as Prisma.InputJsonValue }),
        })),
      },
    },
  });
  await tx.accountingInboxItem.update({
    where: { id: artifact.inboxItem.id },
    data: {
      classification: AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
      materializedEntityType:
        AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT,
      materializedEntityStableId: documentStableId,
      version: { increment: 1 },
    },
  });
  return {
    documentStableId,
    provider: normalized.provider,
    documentType: normalized.documentType,
    revision,
    replayed: false,
  };
}

export async function readProviderFinancialDocumentReplay(
  tx: AccountingTx,
  normalized: NormalizedFinancialDocument,
) {
  const artifact = await tx.accountingSourceArtifact.findUnique({
    where: { artifactStableId: normalized.artifactStableId },
    select: { contentHash: true },
  });
  const latest = await tx.accountingProviderFinancialDocument.findFirst({
    where: {
      provider: normalized.provider,
      documentType: normalized.documentType,
      businessIdentityKey: normalized.businessIdentityKey,
    },
    orderBy: { revision: 'desc' },
    select: {
      documentStableId: true,
      provider: true,
      documentType: true,
      revision: true,
      artifact: { select: { contentHash: true } },
    },
  });
  if (!artifact || latest?.artifact.contentHash !== artifact.contentHash) {
    throw new AccountingInboxWriterConflictError(
      'financial document revision conflict',
    );
  }
  return {
    documentStableId: latest.documentStableId,
    provider: latest.provider,
    documentType: latest.documentType,
    revision: latest.revision,
    replayed: true,
  };
}

export async function ensureProviderFinancialCoverageInTx(
  tx: AccountingTx,
  provider: AccountingFinancialProvider,
  storeStableId: string,
  requiredFrom: Date,
  operatorUserStableId: string | null,
) {
  const row = await tx.accountingProviderFinancialCoverage.upsert({
    where: {
      provider_storeStableId: {
        provider,
        storeStableId,
      },
    },
    create: {
      coverageStableId: `acctcoverage_${createId()}`,
      provider,
      storeStableId,
      financialHistoryRequiredFrom: requiredFrom,
      updatedByUserStableId: operatorUserStableId,
    },
    update: {
      financialHistoryRequiredFrom: requiredFrom,
      ...(operatorUserStableId
        ? { updatedByUserStableId: operatorUserStableId }
        : {}),
    },
    select: {
      coverageStableId: true,
      provider: true,
      storeStableId: true,
      financialHistoryRequiredFrom: true,
      financialCompleteThrough: true,
      liveOrderFactCutoverAt: true,
      orderDetailCoverageFrom: true,
    },
  });
  return {
    ...row,
    financialHistoryRequiredFrom: row.financialHistoryRequiredFrom
      .toISOString()
      .slice(0, 10),
    financialCompleteThrough:
      row.financialCompleteThrough?.toISOString().slice(0, 10) ?? null,
    liveOrderFactCutoverAt: row.liveOrderFactCutoverAt?.toISOString() ?? null,
    orderDetailCoverageFrom:
      row.orderDetailCoverageFrom?.toISOString().slice(0, 10) ?? null,
  };
}

type ArtifactPublicRow = Prisma.AccountingSourceArtifactGetPayload<{
  select: typeof ARTIFACT_PUBLIC_SELECT;
}>;

async function promoteArtifactTrustIfNeeded(
  tx: AccountingTx,
  row: ArtifactPublicRow,
  normalized: NormalizedArtifact,
): Promise<ArtifactPublicRow> {
  if (
    normalized.trustDecision !== AccountingInboxTrustDecision.TRUSTED ||
    row.inboxItem?.status !== AccountingInboxStatus.QUARANTINED ||
    row.inboxItem.trustDecision !== AccountingInboxTrustDecision.UNTRUSTED
  ) {
    return row;
  }
  const inboxItem = await tx.accountingInboxItem.update({
    where: { id: row.inboxItem.id },
    data: {
      status: AccountingInboxStatus.PENDING_REVIEW,
      trustDecision: AccountingInboxTrustDecision.TRUSTED,
      version: { increment: 1 },
    },
    select: ARTIFACT_PUBLIC_SELECT.inboxItem.select,
  });
  return { ...row, inboxItem };
}

export function presentRegisteredArtifact(
  row: ArtifactPublicRow,
  replayed = false,
) {
  return {
    artifactStableId: row.artifactStableId,
    contentHash: row.contentHash,
    kind: row.kind,
    storedUrl: row.storedUrl,
    inboxItem: row.inboxItem
      ? {
          inboxItemStableId: row.inboxItem.inboxItemStableId,
          status: row.inboxItem.status,
          classification: row.inboxItem.classification,
          trustDecision: row.inboxItem.trustDecision,
          materializedEntityType: row.inboxItem.materializedEntityType,
          materializedEntityStableId: row.inboxItem.materializedEntityStableId,
          duplicateOfArtifact: row.inboxItem.duplicateOfArtifact,
        }
      : null,
    duplicateOfArtifactStableId:
      row.inboxItem?.duplicateOfArtifact?.artifactStableId ?? null,
    replayed,
  };
}
