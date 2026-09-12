import { createHash } from 'node:crypto';
import {
  AccountingArtifactAcquisitionMode,
  AccountingArtifactKind,
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole,
  AccountingInboxTrustDecision,
  AccountingParseStatus,
} from '@prisma/client';

export const PROVIDER_FINANCIAL_HISTORY_START_DATE = '2026-06-01';

export type AccountingInboxArtifactInput = {
  acquisitionMode: AccountingArtifactAcquisitionMode;
  kind: AccountingArtifactKind;
  transportIdentity: string;
  contentHash: string;
  mimeType?: string | null;
  originalFilename?: string | null;
  byteSize?: number | null;
  storedUrl?: string | null;
  bodyText?: string | null;
  senderEmail?: string | null;
  emailSubject?: string | null;
  metadataJson?: unknown;
  trustDecision: AccountingInboxTrustDecision;
};

export type AccountingParseRunInput = {
  artifactStableId: string;
  parserName: string;
  parserVersion: string;
  status: AccountingParseStatus;
  resultHash?: string | null;
  resultJson?: unknown;
  errorMessage?: string | null;
};

export type AccountingTrustedSenderInput = {
  email: string;
  label?: string | null;
  isActive?: boolean;
};

export type AccountingProviderFinancialLineInput = {
  externalRef?: string | null;
  rawCode?: string | null;
  rawName?: string | null;
  component: AccountingFinancialComponent;
  postingTreatment: AccountingFinancialPostingTreatment;
  taxRole?: AccountingFinancialTaxRole;
  amountCents: number;
  occurredAt?: Date | string | null;
  rawPayload?: unknown;
};

export type AccountingProviderFinancialDocumentInput = {
  artifactStableId: string;
  provider: AccountingFinancialProvider;
  documentType: AccountingFinancialDocumentType;
  businessIdentityKey: string;
  storeStableId?: string | null;
  providerMerchantRef?: string | null;
  providerDocumentRef?: string | null;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  settledAt?: Date | string | null;
  payoutAt?: Date | string | null;
  currency?: string;
  parserName: string;
  parserVersion: string;
  rawMetadata?: unknown;
  lines: AccountingProviderFinancialLineInput[];
};

export class AccountingInboxPolicyError extends Error {}

export function normalizeAccountingInboxArtifact(
  input: AccountingInboxArtifactInput,
) {
  const transportIdentity = requireText(
    input.transportIdentity,
    'transportIdentity',
  );
  const contentHash = normalizeSha256(input.contentHash, 'contentHash');
  const byteSize = input.byteSize ?? null;
  if (byteSize !== null && (!Number.isSafeInteger(byteSize) || byteSize < 0)) {
    throw new AccountingInboxPolicyError(
      'byteSize must be a non-negative integer when provided',
    );
  }
  if (
    input.acquisitionMode === AccountingArtifactAcquisitionMode.EMAIL &&
    input.trustDecision === AccountingInboxTrustDecision.NOT_APPLICABLE
  ) {
    throw new AccountingInboxPolicyError(
      'EMAIL acquisition requires an explicit sender trust decision',
    );
  }
  if (
    input.acquisitionMode !== AccountingArtifactAcquisitionMode.EMAIL &&
    input.trustDecision !== AccountingInboxTrustDecision.NOT_APPLICABLE
  ) {
    throw new AccountingInboxPolicyError(
      'non-EMAIL acquisition must use NOT_APPLICABLE trust decision',
    );
  }

  const storedUrl = optionalText(input.storedUrl);
  const bodyText = optionalText(input.bodyText);
  if (
    (input.kind === AccountingArtifactKind.EMAIL_BODY ||
      input.kind === AccountingArtifactKind.TEXT) &&
    !bodyText
  ) {
    throw new AccountingInboxPolicyError('text artifact requires bodyText');
  }
  if (
    (input.kind === AccountingArtifactKind.PDF ||
      input.kind === AccountingArtifactKind.IMAGE ||
      input.kind === AccountingArtifactKind.CSV) &&
    !storedUrl
  ) {
    throw new AccountingInboxPolicyError('file artifact requires storedUrl');
  }
  return {
    ...input,
    transportIdentity,
    contentHash,
    mimeType: optionalText(input.mimeType),
    originalFilename: optionalText(input.originalFilename),
    byteSize,
    storedUrl,
    bodyText,
    senderEmail: optionalEmail(input.senderEmail),
    emailSubject: optionalText(input.emailSubject),
  };
}

export function normalizeAccountingParseRun(input: AccountingParseRunInput) {
  const artifactStableId = requireText(
    input.artifactStableId,
    'artifactStableId',
  );
  const parserName = requireText(input.parserName, 'parserName');
  const parserVersion = requireText(input.parserVersion, 'parserVersion');
  const resultHash = input.resultHash
    ? normalizeSha256(input.resultHash, 'resultHash')
    : null;
  const errorMessage = optionalText(input.errorMessage);
  if (input.status === AccountingParseStatus.SUCCESS && !resultHash) {
    throw new AccountingInboxPolicyError(
      'successful parse requires resultHash',
    );
  }
  if (input.status === AccountingParseStatus.ERROR && !errorMessage) {
    throw new AccountingInboxPolicyError('failed parse requires errorMessage');
  }
  return {
    ...input,
    artifactStableId,
    parserName,
    parserVersion,
    resultHash,
    errorMessage,
    idempotencyKey: `accounting-parse:${artifactStableId}:${parserName}:${parserVersion}`,
  };
}

export function normalizeAccountingTrustedSender(
  input: AccountingTrustedSenderInput,
) {
  return {
    email: normalizeEmail(input.email),
    label: optionalText(input.label),
    isActive: input.isActive ?? true,
  };
}

export function normalizeProviderFinancialDocument(
  input: AccountingProviderFinancialDocumentInput,
) {
  const artifactStableId = requireText(
    input.artifactStableId,
    'artifactStableId',
  );
  const businessIdentityKey = requireText(
    input.businessIdentityKey,
    'businessIdentityKey',
  );
  const parserName = requireText(input.parserName, 'parserName');
  const parserVersion = requireText(input.parserVersion, 'parserVersion');
  const periodStart = optionalDate(input.periodStart, 'periodStart');
  const periodEnd = optionalDate(input.periodEnd, 'periodEnd');
  if (periodStart && periodEnd && periodStart > periodEnd) {
    throw new AccountingInboxPolicyError(
      'periodStart must be on or before periodEnd',
    );
  }
  const currency = input.currency?.trim().toUpperCase() || 'CAD';
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new AccountingInboxPolicyError('currency must be a 3-letter code');
  }
  if (!input.lines.length) {
    throw new AccountingInboxPolicyError(
      'provider financial document requires at least one line',
    );
  }

  const lines = input.lines.map((line, index) => {
    if (!Number.isSafeInteger(line.amountCents)) {
      throw new AccountingInboxPolicyError(
        'line amountCents must be an integer',
      );
    }
    return {
      ...line,
      lineNo: index + 1,
      externalRef: optionalText(line.externalRef),
      rawCode: optionalText(line.rawCode),
      rawName: optionalText(line.rawName),
      taxRole: line.taxRole ?? AccountingFinancialTaxRole.NONE,
      occurredAt: optionalDate(line.occurredAt, 'line.occurredAt'),
    };
  });

  return {
    ...input,
    artifactStableId,
    businessIdentityKey,
    storeStableId: optionalText(input.storeStableId),
    providerMerchantRef: optionalText(input.providerMerchantRef),
    providerDocumentRef: optionalText(input.providerDocumentRef),
    periodStart,
    periodEnd,
    settledAt: optionalDate(input.settledAt, 'settledAt'),
    payoutAt: optionalDate(input.payoutAt, 'payoutAt'),
    currency,
    parserName,
    parserVersion,
    lines,
  };
}

export function hashAccountingJson(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function normalizeSha256(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new AccountingInboxPolicyError(
      `${field} must be a SHA-256 hex digest`,
    );
  }
  return normalized;
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new AccountingInboxPolicyError(`${field} is required`);
  }
  return normalized;
}

function optionalText(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AccountingInboxPolicyError('email is invalid');
  }
  return normalized;
}

function optionalEmail(value?: string | null): string | null {
  return value?.trim() ? normalizeEmail(value) : null;
}

function optionalDate(
  value: Date | string | null | undefined,
  field: string,
): Date | null {
  if (value == null || value === '') return null;
  const parsed =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AccountingInboxPolicyError(`${field} must be a valid date`);
  }
  return parsed;
}

function stableJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}
