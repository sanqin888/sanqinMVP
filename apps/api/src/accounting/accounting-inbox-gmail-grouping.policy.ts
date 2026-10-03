import {
  AccountingArtifactAcquisitionMode,
  AccountingArtifactKind,
  AccountingInboxClassification,
  type AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
} from './accounting-contracts';

type GmailGroupingArtifact = {
  acquisitionMode: AccountingArtifactAcquisitionMode;
  kind: AccountingArtifactKind;
  storedUrl?: string | null;
  metadataJson?: unknown;
  parseRuns?: Array<{ resultJson?: unknown }>;
};

export type GmailGroupingInboxItem = {
  inboxItemStableId: string;
  status: AccountingInboxStatus;
  classification: AccountingInboxClassification;
  selectedProvider?: string | null;
  materializedEntityType?: AccountingInboxMaterializedEntityType | null;
  materializedEntityStableId?: string | null;
  artifact: GmailGroupingArtifact;
};

export type AccountingGmailInboxGroup<T extends GmailGroupingInboxItem> = {
  gmailMessageId: string | null;
  representative: T;
  members: T[];
  primaryExpenseSource: T | null;
  primaryExpenseSourceAmbiguous: boolean;
};

export function accountingGmailMessageId(metadataJson: unknown): string | null {
  if (
    !metadataJson ||
    typeof metadataJson !== 'object' ||
    Array.isArray(metadataJson)
  ) {
    return null;
  }
  const value = (metadataJson as Record<string, unknown>).gmailMessageId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function groupAccountingInboxByGmailMessage<
  T extends GmailGroupingInboxItem,
>(rows: T[]): AccountingGmailInboxGroup<T>[] {
  const groups = new Map<string, T[]>();
  const order: string[] = [];

  for (const row of rows) {
    const gmailMessageId =
      row.artifact.acquisitionMode === AccountingArtifactAcquisitionMode.EMAIL
        ? accountingGmailMessageId(row.artifact.metadataJson)
        : null;
    const key = gmailMessageId
      ? `gmail:${gmailMessageId}`
      : `inbox:${row.inboxItemStableId}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(row);
  }

  return order.map((key) => {
    const members = groups.get(key)!;
    const gmailMessageId = key.startsWith('gmail:')
      ? key.slice('gmail:'.length)
      : null;
    const representative = selectAccountingGmailRepresentative(members);
    const primary = selectAccountingGmailPrimaryExpenseSource(members);
    return {
      gmailMessageId,
      representative,
      members,
      primaryExpenseSource: primary.source,
      primaryExpenseSourceAmbiguous: primary.ambiguous,
    };
  });
}

export function accountingGmailGroupRequiresSeparateReview<
  T extends GmailGroupingInboxItem,
>(group: AccountingGmailInboxGroup<T>): boolean {
  const statuses = new Set(group.members.map((member) => member.status));
  return (
    group.primaryExpenseSourceAmbiguous ||
    statuses.size > 1 ||
    group.members.some((member) => {
      const extraction = jsonRecord(
        member.artifact.parseRuns?.[0]?.resultJson,
      );
      return (
        member.classification ===
          AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT ||
        Boolean(member.selectedProvider) ||
        extraction.providerFinancial === true ||
        extraction.providerRecognition === true
      );
    })
  );
}

export function selectAccountingGmailRepresentative<
  T extends GmailGroupingInboxItem,
>(members: T[]): T {
  if (!members.length) {
    throw new Error('gmail inbox group must contain at least one member');
  }
  return [...members].sort(
    (left, right) =>
      accountingGmailRepresentativeScore(right) -
      accountingGmailRepresentativeScore(left),
  )[0]!;
}

export function selectAccountingGmailPrimaryExpenseSource<
  T extends GmailGroupingInboxItem,
>(members: T[]): { source: T | null; ambiguous: boolean } {
  const candidates = members.filter(isEligibleGmailExpenseFile);
  if (candidates.length === 0) return { source: null, ambiguous: false };
  if (candidates.length === 1) {
    return { source: candidates[0]!, ambiguous: false };
  }

  const scored = candidates
    .map((row) => ({ row, score: accountingGmailExpenseSourceScore(row) }))
    .sort((left, right) => right.score - left.score);
  if (scored[0]!.score > scored[1]!.score) {
    return { source: scored[0]!.row, ambiguous: false };
  }
  return { source: null, ambiguous: true };
}

function accountingGmailRepresentativeScore(
  row: GmailGroupingInboxItem,
): number {
  let score = 0;
  switch (row.classification) {
    case AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT:
      score += 500;
      break;
    case AccountingInboxClassification.EXPENSE_DOCUMENT:
      score += 400;
      break;
    case AccountingInboxClassification.OTHER_DOCUMENT:
      score += 300;
      break;
    case AccountingInboxClassification.UNKNOWN:
      break;
  }
  if (row.artifact.kind !== AccountingArtifactKind.EMAIL_BODY) score += 100;
  if (row.status === AccountingInboxStatus.PENDING_REVIEW) score += 20;
  if (row.status === AccountingInboxStatus.QUARANTINED) score += 10;
  return score;
}

function isEligibleGmailExpenseFile(row: GmailGroupingInboxItem): boolean {
  const extraction = jsonRecord(row.artifact.parseRuns?.[0]?.resultJson);
  return Boolean(
    row.status === AccountingInboxStatus.PENDING_REVIEW &&
      row.artifact.acquisitionMode === AccountingArtifactAcquisitionMode.EMAIL &&
      row.artifact.kind !== AccountingArtifactKind.EMAIL_BODY &&
      row.artifact.storedUrl &&
      row.classification !==
        AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT &&
      !row.selectedProvider &&
      !row.materializedEntityType &&
      !row.materializedEntityStableId &&
      extraction.requiresBatchExpenseImport !== true,
  );
}

function accountingGmailExpenseSourceScore(
  row: GmailGroupingInboxItem,
): number {
  const extraction = jsonRecord(row.artifact.parseRuns?.[0]?.resultJson);
  let score = 0;
  if (extraction.reviewDisposition === 'LIKELY_BILL') score += 100;
  if (extraction.financialConsistency === 'MATCHED') score += 50;
  if (typeof extraction.totalCents === 'number') score += 20;
  if (typeof extraction.date === 'string' && extraction.date.trim()) {
    score += 10;
  }
  if (row.artifact.kind === AccountingArtifactKind.PDF) score += 5;
  return score;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
