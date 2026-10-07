import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
} from './accounting-contracts';
import {
  FANTUAN_ADJUSTMENT_DETAIL_EVIDENCE_KIND,
  FANTUAN_ADJUSTMENT_SUPPORTED_RAW_CODES,
} from './accounting-fantuan-adjustment-detail.contract';

export type FantuanAdjustmentDetailPolicyLine = {
  lineStableId: string;
  lineNo: number;
  rawCode: string | null;
  component: AccountingFinancialComponent;
  postingTreatment: AccountingFinancialPostingTreatment;
  amountCents: number;
};

export type FantuanAdjustmentDetailPolicyDocument<
  TLine extends FantuanAdjustmentDetailPolicyLine,
> = {
  documentStableId: string;
  provider: AccountingFinancialProvider;
  documentType: AccountingFinancialDocumentType;
  evidenceKind: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  isConfirmed: boolean;
  lines: TLine[];
};

export type FantuanAdjustmentDetailResolution<
  TLine extends FantuanAdjustmentDetailPolicyLine,
> = {
  lines: TLine[];
  blockReasons: string[];
  selectedDetailDocumentStableId: string | null;
};

const isFantuanAdjustmentDetail = <
  TLine extends FantuanAdjustmentDetailPolicyLine,
>(
  document: FantuanAdjustmentDetailPolicyDocument<TLine>,
): boolean =>
  document.provider === AccountingFinancialProvider.FANTUAN &&
  document.documentType === AccountingFinancialDocumentType.OTHER &&
  document.evidenceKind === FANTUAN_ADJUSTMENT_DETAIL_EVIDENCE_KIND;

export const resolveFantuanAdjustmentDetailLines = <
  TLine extends FantuanAdjustmentDetailPolicyLine,
>(params: {
  statement: FantuanAdjustmentDetailPolicyDocument<TLine>;
  candidateDocuments: FantuanAdjustmentDetailPolicyDocument<TLine>[];
}): FantuanAdjustmentDetailResolution<TLine> => {
  const { statement } = params;
  const summaryAdjustments = statement.lines.filter(
    (line) =>
      line.component === AccountingFinancialComponent.ADJUSTMENT &&
      line.amountCents !== 0,
  );
  if (
    statement.provider !== AccountingFinancialProvider.FANTUAN ||
    statement.documentType !== AccountingFinancialDocumentType.STATEMENT ||
    summaryAdjustments.length === 0
  ) {
    return {
      lines: statement.lines,
      blockReasons: [],
      selectedDetailDocumentStableId: null,
    };
  }

  const controlLines = statement.lines.map((line) =>
    line.component === AccountingFinancialComponent.ADJUSTMENT
      ? {
          ...line,
          postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
        }
      : line,
  );
  if (!statement.periodStart || !statement.periodEnd) {
    return {
      lines: controlLines,
      blockReasons: ['FANTUAN_ADJUSTMENT_DETAIL_PERIOD_MISSING'],
      selectedDetailDocumentStableId: null,
    };
  }

  const details = params.candidateDocuments.filter(
    (document) =>
      isFantuanAdjustmentDetail(document) &&
      document.periodStart === statement.periodStart &&
      document.periodEnd === statement.periodEnd,
  );
  if (details.length === 0) {
    return {
      lines: controlLines,
      blockReasons: ['FANTUAN_ADJUSTMENT_DETAIL_REQUIRED'],
      selectedDetailDocumentStableId: null,
    };
  }
  if (details.length !== 1) {
    return {
      lines: controlLines,
      blockReasons: ['FANTUAN_ADJUSTMENT_DETAIL_AMBIGUOUS'],
      selectedDetailDocumentStableId: null,
    };
  }

  const detail = details[0];
  if (!detail?.isConfirmed) {
    return {
      lines: controlLines,
      blockReasons: ['FANTUAN_ADJUSTMENT_DETAIL_NOT_CONFIRMED'],
      selectedDetailDocumentStableId: null,
    };
  }

  const unsupportedLines = detail.lines.filter(
    (line) =>
      line.component !== AccountingFinancialComponent.ADJUSTMENT ||
      line.postingTreatment !==
        AccountingFinancialPostingTreatment.CONTROL_TOTAL ||
      !FANTUAN_ADJUSTMENT_SUPPORTED_RAW_CODES.has(line.rawCode ?? ''),
  );
  if (unsupportedLines.length > 0) {
    return {
      lines: controlLines,
      blockReasons: ['FANTUAN_ADJUSTMENT_DETAIL_UNSUPPORTED_FEE_TYPE'],
      selectedDetailDocumentStableId: null,
    };
  }

  const summaryNetCents = summaryAdjustments.reduce(
    (sum, line) => sum + line.amountCents,
    0,
  );
  const detailNetCents = detail.lines.reduce(
    (sum, line) => sum + line.amountCents,
    0,
  );
  if (
    !Number.isSafeInteger(summaryNetCents) ||
    !Number.isSafeInteger(detailNetCents) ||
    summaryNetCents !== detailNetCents
  ) {
    return {
      lines: controlLines,
      blockReasons: ['FANTUAN_ADJUSTMENT_DETAIL_NET_MISMATCH'],
      selectedDetailDocumentStableId: null,
    };
  }

  const detailPostingLines = detail.lines.map((line, index) => ({
    ...line,
    lineNo: statement.lines.length + index + 1,
    postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
  }));

  return {
    lines: [...controlLines, ...detailPostingLines],
    blockReasons: [],
    selectedDetailDocumentStableId: detail.documentStableId,
  };
};
