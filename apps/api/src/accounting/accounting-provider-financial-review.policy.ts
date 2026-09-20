import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialTaxRole,
  AccountingProviderFinancialCorrectionReason,
  type AccountingProviderFinancialCorrectionReason as AccountingProviderFinancialCorrectionReasonValue,
} from './accounting-contracts';

export class AccountingProviderFinancialReviewPolicyError extends Error {}

export type ProviderFinancialReviewSourceLine = {
  lineStableId: string;
  lineNo: number;
  rawCode: string | null;
  rawName: string | null;
  component: AccountingFinancialComponent;
  postingTreatment: AccountingFinancialPostingTreatment;
  taxRole: AccountingFinancialTaxRole;
  amountCents: number;
};

export type ProviderFinancialReviewCorrectionInput = {
  sourceLineStableId: string;
  reason: AccountingProviderFinancialCorrectionReasonValue;
  note?: string | null;
  rawCode?: string | null;
  rawName?: string | null;
  component?: AccountingFinancialComponent;
  postingTreatment?: AccountingFinancialPostingTreatment;
  taxRole?: AccountingFinancialTaxRole;
  amountCents?: number;
};

export type ProviderFinancialReviewDraftInput = {
  expectedDocumentRevision: number;
  note?: string | null;
  corrections: ProviderFinancialReviewCorrectionInput[];
};

export type NormalizedProviderFinancialReviewCorrection = {
  sourceLineStableId: string;
  reason: AccountingProviderFinancialCorrectionReasonValue;
  note: string | null;
  effectiveRawCode: string | null;
  effectiveRawName: string | null;
  effectiveComponent: AccountingFinancialComponent;
  effectivePostingTreatment: AccountingFinancialPostingTreatment;
  effectiveTaxRole: AccountingFinancialTaxRole;
  effectiveAmountCents: number;
};

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const optionalText = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  return normalized || null;
};

const requireStableId = (value: string, field: string): string => {
  const normalized = value?.trim();
  if (!normalized) {
    throw new AccountingProviderFinancialReviewPolicyError(
      `${field} is required`,
    );
  }
  return normalized;
};

const requirePositiveInteger = (value: number, field: string): number => {
  if (!Number.isInteger(value) || value < 1) {
    throw new AccountingProviderFinancialReviewPolicyError(
      `${field} must be a positive integer`,
    );
  }
  return value;
};

const requireSafeInteger = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new AccountingProviderFinancialReviewPolicyError(
      `${field} must be a safe integer`,
    );
  }
  return value;
};

const enumHasValue = <T extends string>(
  values: readonly T[],
  value: unknown,
): value is T => typeof value === 'string' && values.includes(value as T);

const componentValues = Object.values(AccountingFinancialComponent);
const postingTreatmentValues = Object.values(
  AccountingFinancialPostingTreatment,
);
const taxRoleValues = Object.values(AccountingFinancialTaxRole);
const correctionReasonValues = Object.values(
  AccountingProviderFinancialCorrectionReason,
);

const equalLine = (
  source: ProviderFinancialReviewSourceLine,
  correction: NormalizedProviderFinancialReviewCorrection,
): boolean =>
  source.rawCode === correction.effectiveRawCode &&
  source.rawName === correction.effectiveRawName &&
  source.component === correction.effectiveComponent &&
  source.postingTreatment === correction.effectivePostingTreatment &&
  source.taxRole === correction.effectiveTaxRole &&
  source.amountCents === correction.effectiveAmountCents;

export function normalizeProviderFinancialReviewDraft(params: {
  documentType: AccountingFinancialDocumentType;
  sourceLines: ProviderFinancialReviewSourceLine[];
  input: ProviderFinancialReviewDraftInput;
}) {
  const expectedDocumentRevision = requirePositiveInteger(
    params.input.expectedDocumentRevision,
    'expectedDocumentRevision',
  );
  if (!Array.isArray(params.input.corrections)) {
    throw new AccountingProviderFinancialReviewPolicyError(
      'review corrections must be an array',
    );
  }
  if (params.input.corrections.length > 200) {
    throw new AccountingProviderFinancialReviewPolicyError(
      'review corrections cannot exceed 200 lines',
    );
  }

  const sourceByStableId = new Map(
    params.sourceLines.map((line) => [line.lineStableId, line] as const),
  );
  const seen = new Set<string>();
  const corrections = params.input.corrections.map((inputCorrection) => {
    const sourceLineStableId = requireStableId(
      inputCorrection.sourceLineStableId,
      'sourceLineStableId',
    );
    if (seen.has(sourceLineStableId)) {
      throw new AccountingProviderFinancialReviewPolicyError(
        `duplicate correction for source line: ${sourceLineStableId}`,
      );
    }
    seen.add(sourceLineStableId);

    const source = sourceByStableId.get(sourceLineStableId);
    if (!source) {
      throw new AccountingProviderFinancialReviewPolicyError(
        `review correction references an unknown source line: ${sourceLineStableId}`,
      );
    }
    if (!enumHasValue(correctionReasonValues, inputCorrection.reason)) {
      throw new AccountingProviderFinancialReviewPolicyError(
        'review correction reason is invalid',
      );
    }

    const hasRawCode = hasOwn(inputCorrection, 'rawCode');
    const hasRawName = hasOwn(inputCorrection, 'rawName');
    const hasAmount = hasOwn(inputCorrection, 'amountCents');
    const hasComponent = hasOwn(inputCorrection, 'component');
    const hasPostingTreatment = hasOwn(
      inputCorrection,
      'postingTreatment',
    );
    const hasTaxRole = hasOwn(inputCorrection, 'taxRole');

    if (
      inputCorrection.reason ===
      AccountingProviderFinancialCorrectionReason.EXTRACTION_CORRECTION
    ) {
      if (hasComponent || hasPostingTreatment || hasTaxRole) {
        throw new AccountingProviderFinancialReviewPolicyError(
          'EXTRACTION_CORRECTION cannot change accounting classification fields',
        );
      }
      if (!hasRawCode && !hasRawName && !hasAmount) {
        throw new AccountingProviderFinancialReviewPolicyError(
          'EXTRACTION_CORRECTION must change raw evidence mapping or amount',
        );
      }
    } else {
      if (hasRawCode || hasRawName || hasAmount) {
        throw new AccountingProviderFinancialReviewPolicyError(
          'SEMANTIC_CLASSIFICATION cannot change source evidence values',
        );
      }
      if (!hasComponent && !hasPostingTreatment && !hasTaxRole) {
        throw new AccountingProviderFinancialReviewPolicyError(
          'SEMANTIC_CLASSIFICATION must change accounting classification',
        );
      }
      if (!optionalText(inputCorrection.note)) {
        throw new AccountingProviderFinancialReviewPolicyError(
          'SEMANTIC_CLASSIFICATION requires a review note',
        );
      }
    }

    const effectiveComponent = hasComponent
      ? inputCorrection.component
      : source.component;
    const effectivePostingTreatment = hasPostingTreatment
      ? inputCorrection.postingTreatment
      : source.postingTreatment;
    const effectiveTaxRole = hasTaxRole
      ? inputCorrection.taxRole
      : source.taxRole;

    if (
      !enumHasValue(componentValues, effectiveComponent) ||
      !enumHasValue(postingTreatmentValues, effectivePostingTreatment) ||
      !enumHasValue(taxRoleValues, effectiveTaxRole)
    ) {
      throw new AccountingProviderFinancialReviewPolicyError(
        'review correction contains an invalid accounting classification',
      );
    }

    const correction: NormalizedProviderFinancialReviewCorrection = {
      sourceLineStableId,
      reason: inputCorrection.reason,
      note: optionalText(inputCorrection.note),
      effectiveRawCode: hasRawCode
        ? optionalText(inputCorrection.rawCode)
        : source.rawCode,
      effectiveRawName: hasRawName
        ? optionalText(inputCorrection.rawName)
        : source.rawName,
      effectiveComponent,
      effectivePostingTreatment,
      effectiveTaxRole,
      effectiveAmountCents: hasAmount
        ? requireSafeInteger(inputCorrection.amountCents, 'amountCents')
        : source.amountCents,
    };

    if (
      params.documentType === AccountingFinancialDocumentType.BATCH_CONTROL &&
      correction.effectivePostingTreatment ===
        AccountingFinancialPostingTreatment.POSTABLE
    ) {
      throw new AccountingProviderFinancialReviewPolicyError(
        'BATCH_CONTROL lines cannot be made POSTABLE by human review',
      );
    }
    if (
      (source.component === AccountingFinancialComponent.CONTROL_TOTAL ||
        source.postingTreatment ===
          AccountingFinancialPostingTreatment.CONTROL_TOTAL ||
        correction.effectiveComponent ===
          AccountingFinancialComponent.CONTROL_TOTAL) &&
      correction.effectivePostingTreatment ===
        AccountingFinancialPostingTreatment.POSTABLE
    ) {
      throw new AccountingProviderFinancialReviewPolicyError(
        'CONTROL_TOTAL lines cannot be made POSTABLE by human review',
      );
    }
    if (equalLine(source, correction)) {
      throw new AccountingProviderFinancialReviewPolicyError(
        `review correction does not change source line: ${sourceLineStableId}`,
      );
    }
    return {
      sourceLineNo: source.lineNo,
      correction,
    };
  });

  corrections.sort(
    (left, right) =>
      left.sourceLineNo - right.sourceLineNo ||
      left.correction.sourceLineStableId.localeCompare(
        right.correction.sourceLineStableId,
      ),
  );

  return {
    expectedDocumentRevision,
    note: optionalText(params.input.note),
    corrections: corrections.map((item) => item.correction),
  };
}

export function applyProviderFinancialReviewCorrections<
  T extends ProviderFinancialReviewSourceLine,
>(params: {
  sourceLines: T[];
  corrections: NormalizedProviderFinancialReviewCorrection[];
}): T[] {
  const bySourceLine = new Map(
    params.corrections.map(
      (correction) => [correction.sourceLineStableId, correction] as const,
    ),
  );
  return params.sourceLines.map((source) => {
    const correction = bySourceLine.get(source.lineStableId);
    if (!correction) return source;
    return {
      ...source,
      rawCode: correction.effectiveRawCode,
      rawName: correction.effectiveRawName,
      component: correction.effectiveComponent,
      postingTreatment: correction.effectivePostingTreatment,
      taxRole: correction.effectiveTaxRole,
      amountCents: correction.effectiveAmountCents,
    };
  });
}
