import {
  AccountingArtifactAcquisitionMode,
  AccountingArtifactKind,
  AccountingInboxClassification,
  AccountingInboxStatus,
} from './accounting-contracts';

export type AccountingExpenseEvidenceReadinessReason =
  | 'FILE_SOURCE'
  | 'STANDALONE_EMAIL_DOCUMENT'
  | 'LINKED_SOURCE_DOCUMENT'
  | 'EMAIL_BILL_NOTIFICATION_ONLY'
  | 'EMAIL_BODY_INSUFFICIENT'
  | 'LINKED_SOURCE_UNAVAILABLE';

export type AccountingExpenseEvidenceReadiness = {
  status: 'READY' | 'SUPPLEMENT_REQUIRED';
  reason: AccountingExpenseEvidenceReadinessReason;
};

type AccountingExpenseEvidenceArtifact = {
  acquisitionMode: AccountingArtifactAcquisitionMode;
  kind: AccountingArtifactKind;
  storedUrl?: string | null;
  bodyText?: string | null;
  emailSubject?: string | null;
};

type AccountingExpenseEvidenceInboxState = {
  status: AccountingInboxStatus;
  classification: AccountingInboxClassification;
  selectedProvider?: string | null;
  materializedEntityType?: string | null;
  materializedEntityStableId?: string | null;
};

type AccountingExpenseEvidenceExtraction = {
  date?: unknown;
  totalCents?: unknown;
  financialConsistency?: unknown;
  reviewDisposition?: unknown;
  requiresBatchExpenseImport?: unknown;
};

type AccountingLinkedExpenseEvidence = AccountingExpenseEvidenceInboxState & {
  artifact: AccountingExpenseEvidenceArtifact;
  extraction?: AccountingExpenseEvidenceExtraction | null;
};

const BILL_NOTIFICATION_PATTERNS = [
  /\byour\s+(?:e-?bill|bill|invoice|statement)\s+(?:is\s+)?(?:now\s+)?ready\b/i,
  /\b(?:e-?bill|bill|invoice|statement)\s+(?:is\s+)?(?:now\s+)?available\b/i,
  /\bview\s+(?:your\s+)?(?:e-?bill|bill|invoice|statement)\b/i,
  /\bdownload\s+(?:your\s+)?(?:e-?bill|bill|invoice|statement)\b/i,
  /\blog\s*in\s+to\s+(?:view|download)\s+(?:your\s+)?(?:e-?bill|bill|invoice|statement)\b/i,
  /(?:账单|发票|对账单).{0,12}(?:已生成|已准备好|可查看|可下载)/i,
  /(?:查看|下载).{0,8}(?:账单|发票|对账单)/i,
];

export function isAccountingBillNotificationOnlyText(input: {
  subject?: string | null;
  bodyText?: string | null;
}): boolean {
  const text = [input.subject, input.bodyText].filter(Boolean).join('\n');
  return BILL_NOTIFICATION_PATTERNS.some((pattern) => pattern.test(text));
}

export function assessAccountingExpenseEvidenceReadiness(input: {
  artifact: AccountingExpenseEvidenceArtifact;
  extraction?: AccountingExpenseEvidenceExtraction | null;
  linkedSource?: AccountingLinkedExpenseEvidence | null;
}): AccountingExpenseEvidenceReadiness {
  const linked = input.linkedSource;
  if (linked) {
    if (isReadyLinkedExpenseSource(linked)) {
      return { status: 'READY', reason: 'LINKED_SOURCE_DOCUMENT' };
    }
    return {
      status: 'SUPPLEMENT_REQUIRED',
      reason: 'LINKED_SOURCE_UNAVAILABLE',
    };
  }

  if (
    input.artifact.kind !== AccountingArtifactKind.EMAIL_BODY &&
    Boolean(input.artifact.storedUrl)
  ) {
    return { status: 'READY', reason: 'FILE_SOURCE' };
  }

  if (input.artifact.kind !== AccountingArtifactKind.EMAIL_BODY) {
    return {
      status: 'SUPPLEMENT_REQUIRED',
      reason: 'LINKED_SOURCE_UNAVAILABLE',
    };
  }

  if (isStandaloneEmailExpenseDocument(input.extraction)) {
    return { status: 'READY', reason: 'STANDALONE_EMAIL_DOCUMENT' };
  }

  if (
    isAccountingBillNotificationOnlyText({
      subject: input.artifact.emailSubject,
      bodyText: input.artifact.bodyText,
    })
  ) {
    return {
      status: 'SUPPLEMENT_REQUIRED',
      reason: 'EMAIL_BILL_NOTIFICATION_ONLY',
    };
  }

  return { status: 'SUPPLEMENT_REQUIRED', reason: 'EMAIL_BODY_INSUFFICIENT' };
}

function isStandaloneEmailExpenseDocument(
  extraction: AccountingExpenseEvidenceExtraction | null | undefined,
): boolean {
  return Boolean(
    extraction?.reviewDisposition === 'LIKELY_BILL' &&
    typeof extraction.date === 'string' &&
    extraction.date.trim() &&
    Number.isSafeInteger(extraction.totalCents) &&
    Number(extraction.totalCents) > 0 &&
    extraction.financialConsistency === 'MATCHED',
  );
}

function isReadyLinkedExpenseSource(
  source: AccountingLinkedExpenseEvidence,
): boolean {
  return Boolean(
    source.status === AccountingInboxStatus.PENDING_REVIEW &&
    source.artifact.kind !== AccountingArtifactKind.EMAIL_BODY &&
    source.artifact.acquisitionMode !==
      AccountingArtifactAcquisitionMode.PROVIDER_API &&
    source.artifact.storedUrl &&
    source.classification !==
      AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT &&
    !source.selectedProvider &&
    !source.materializedEntityType &&
    !source.materializedEntityStableId &&
    source.extraction?.requiresBatchExpenseImport !== true,
  );
}
