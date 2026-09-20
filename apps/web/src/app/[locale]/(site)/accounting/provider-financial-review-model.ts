import type {
  AccountingFinancialComponent,
  AccountingFinancialPostingTreatment,
  AccountingFinancialTaxRole,
  AccountingProviderFinancialDocument,
  AccountingProviderFinancialLine,
  AccountingProviderFinancialReviewCorrection,
  AccountingProviderFinancialReviewCorrectionInput,
  AccountingProviderFinancialReviewRevision,
} from './contracts/provider-financial';

export const ACCOUNTING_FINANCIAL_COMPONENT_OPTIONS: AccountingFinancialComponent[] =
  [
    'SALES',
    'SALES_TAX',
    'REFUND',
    'TIP',
    'COMMISSION',
    'COMMISSION_TAX',
    'PROCESSING_FEE',
    'PROCESSING_FEE_TAX',
    'PROMOTION',
    'SUBSIDY',
    'ADVERTISING',
    'ADVERTISING_TAX',
    'ADVERTISING_CREDIT',
    'CHARGEBACK',
    'CHARGEBACK_TAX',
    'PLATFORM_OTHER_FEE',
    'PLATFORM_OTHER_FEE_TAX',
    'ADJUSTMENT',
    'PAYOUT',
    'CONTROL_TOTAL',
    'OTHER',
  ];

export const ACCOUNTING_POSTING_TREATMENT_OPTIONS: AccountingFinancialPostingTreatment[] =
  ['POSTABLE', 'CONTROL_TOTAL', 'RECONCILIATION_ONLY', 'UNCLASSIFIED'];

export const ACCOUNTING_TAX_ROLE_OPTIONS: AccountingFinancialTaxRole[] = [
  'NONE',
  'SALES_TAX',
  'INPUT_TAX',
  'OTHER_TAX',
];

export function formatCad(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(cents / 100);
}

export function reviewStatusClass(status: string): string {
  if (status === 'CONFIRMED' || status === 'MATCHED') {
    return 'bg-emerald-100 text-emerald-800';
  }
  if (status === 'DRAFT' || status === 'INCOMPLETE') {
    return 'bg-amber-100 text-amber-800';
  }
  if (status === 'MISMATCH') return 'bg-red-100 text-red-800';
  return 'bg-slate-100 text-slate-700';
}

export type ProviderFinancialReviewDraftRow = {
  sourceLineStableId: string;
  reason: 'EXTRACTION_CORRECTION' | 'SEMANTIC_CLASSIFICATION';
  rawName: string;
  amount: string;
  component: AccountingFinancialComponent;
  postingTreatment: AccountingFinancialPostingTreatment;
  taxRole: AccountingFinancialTaxRole;
  note: string;
};

export function centsToMoneyInput(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(
    2,
    '0',
  )}`;
}

export function parseMoneyInputToCents(value: string): number | null {
  const normalized = value.trim();
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const whole = Number(match[2]);
  const fraction = Number((match[3] ?? '').padEnd(2, '0') || '0');
  const cents = whole * 100 + fraction;
  if (!Number.isSafeInteger(cents)) return null;
  return match[1] === '-' ? -cents : cents;
}

export function latestConfirmedProviderReview(
  revisions: AccountingProviderFinancialReviewRevision[],
): AccountingProviderFinancialReviewRevision | null {
  return (
    revisions
      .filter((revision) => revision.status === 'CONFIRMED')
      .sort((left, right) => right.revision - left.revision)[0] ?? null
  );
}

export function latestDraftProviderReview(
  revisions: AccountingProviderFinancialReviewRevision[],
): AccountingProviderFinancialReviewRevision | null {
  return (
    revisions
      .filter((revision) => revision.status === 'DRAFT')
      .sort((left, right) => right.revision - left.revision)[0] ?? null
  );
}

export function applyReviewedProviderFinancialLines(
  document: AccountingProviderFinancialDocument,
  review: AccountingProviderFinancialReviewRevision | null,
): AccountingProviderFinancialLine[] {
  if (!review) return document.lines;
  const corrections = new Map(
    review.corrections.map((correction) => [
      correction.sourceLineStableId,
      correction,
    ]),
  );
  return document.lines.map((line) => {
    const correction = corrections.get(line.lineStableId);
    if (!correction) return line;
    return {
      ...line,
      rawName: correction.effectiveRawName,
      component: correction.effectiveComponent,
      postingTreatment: correction.effectivePostingTreatment,
      taxRole: correction.effectiveTaxRole,
      amountCents: correction.effectiveAmountCents,
    };
  });
}

export function reviewRowsFromRevision(
  document: AccountingProviderFinancialDocument,
  revision: AccountingProviderFinancialReviewRevision | null,
): ProviderFinancialReviewDraftRow[] {
  if (!revision) return [];
  const sourceByStableId = new Map(
    document.lines.map((line) => [line.lineStableId, line]),
  );
  return revision.corrections.flatMap((correction) => {
    const source = sourceByStableId.get(correction.sourceLineStableId);
    if (!source) return [];
    return [
      {
        sourceLineStableId: correction.sourceLineStableId,
        reason: correction.reason,
        rawName: correction.effectiveRawName ?? '',
        amount: centsToMoneyInput(correction.effectiveAmountCents),
        component: correction.effectiveComponent,
        postingTreatment: correction.effectivePostingTreatment,
        taxRole: correction.effectiveTaxRole,
        note: correction.note ?? '',
      },
    ];
  });
}

export function newReviewRowForLine(
  line: AccountingProviderFinancialLine,
): ProviderFinancialReviewDraftRow {
  return {
    sourceLineStableId: line.lineStableId,
    reason: 'EXTRACTION_CORRECTION',
    rawName: line.rawName ?? '',
    amount: centsToMoneyInput(line.amountCents),
    component: line.component,
    postingTreatment: line.postingTreatment,
    taxRole: line.taxRole,
    note: '',
  };
}

export function buildReviewCorrectionInputs(
  rows: ProviderFinancialReviewDraftRow[],
): {
  corrections: AccountingProviderFinancialReviewCorrectionInput[];
  error: string | null;
} {
  const corrections: AccountingProviderFinancialReviewCorrectionInput[] = [];
  for (const row of rows) {
    if (row.reason === 'EXTRACTION_CORRECTION') {
      const amountCents = parseMoneyInputToCents(row.amount);
      if (amountCents === null) {
        return {
          corrections: [],
          error: `Invalid money value for ${row.sourceLineStableId}`,
        };
      }
      corrections.push({
        sourceLineStableId: row.sourceLineStableId,
        reason: row.reason,
        rawName: row.rawName.trim() || null,
        amountCents,
        note: row.note.trim() || null,
      });
      continue;
    }
    if (!row.note.trim()) {
      return {
        corrections: [],
        error: `Classification note is required for ${row.sourceLineStableId}`,
      };
    }
    corrections.push({
      sourceLineStableId: row.sourceLineStableId,
      reason: row.reason,
      component: row.component,
      postingTreatment: row.postingTreatment,
      taxRole: row.taxRole,
      note: row.note.trim(),
    });
  }
  return { corrections, error: null };
}

export function correctionForLine(
  review: AccountingProviderFinancialReviewRevision | null,
  lineStableId: string,
): AccountingProviderFinancialReviewCorrection | null {
  return (
    review?.corrections.find(
      (correction) => correction.sourceLineStableId === lineStableId,
    ) ?? null
  );
}
