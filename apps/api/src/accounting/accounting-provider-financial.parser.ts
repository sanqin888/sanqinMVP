import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole,
} from './accounting-contracts';
import {
  sliceAccountingDocumentExtractionBeforeMarker,
  type AccountingDocumentExtraction,
  type AccountingDocumentExtractionLine,
} from './accounting-document-extraction';
import { CLOVER_CLOSEOUT_RAW_CODES } from './accounting-clover-closeout.contract';
import { CLOVER_STATEMENT_RAW_CODES } from './accounting-clover-statement.contract';

export const ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME =
  'accounting-provider-financial';
export const ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION = '9';

export type ProviderFinancialParseInput = {
  text: string;
  documentExtraction?: AccountingDocumentExtraction;
  originalFilename?: string | null;
  emailSubject?: string | null;
  providerHint?: AccountingFinancialProvider | null;
  documentTypeHint?: AccountingFinancialDocumentType | null;
  reportTypeHint?: string | null;
  periodStartHint?: string | null;
  periodEndHint?: string | null;
  providerDocumentRefHint?: string | null;
};

type ParsedLine = {
  rawCode?: string;
  rawName: string;
  component: AccountingFinancialComponent;
  postingTreatment: AccountingFinancialPostingTreatment;
  taxRole: AccountingFinancialTaxRole;
  amountCents: number;
  rawPayload?: Record<string, unknown>;
};

export type ParsedProviderFinancialDocument = {
  provider: AccountingFinancialProvider;
  documentType: AccountingFinancialDocumentType;
  businessIdentityKey: string;
  providerMerchantRef: string | null;
  providerDocumentRef: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  currency: string;
  rawMetadata: Record<string, unknown>;
  lines: ParsedLine[];
};

export function parseProviderFinancialEvidence(
  input: ProviderFinancialParseInput,
): ParsedProviderFinancialDocument | null {
  const text = normalizeText(input.text);
  if (!text) return null;

  if (!input.providerHint) return null;

  switch (input.providerHint) {
    case AccountingFinancialProvider.CLOVER:
      if (
        input.documentTypeHint === AccountingFinancialDocumentType.BATCH_CONTROL
      ) {
        return parseCloverCloseout(text, input);
      }
      if (
        input.documentTypeHint === AccountingFinancialDocumentType.STATEMENT
      ) {
        return parseCloverStatement(text, input);
      }
      if (input.documentTypeHint) return null;
      return (
        parseCloverCloseout(text, input) ?? parseCloverStatement(text, input)
      );
    case AccountingFinancialProvider.UBER_EATS:
      if (
        input.documentTypeHint &&
        input.documentTypeHint !== AccountingFinancialDocumentType.STATEMENT
      ) {
        return null;
      }
      return parseUberMonthlyStatement(text, input);
    case AccountingFinancialProvider.FANTUAN:
      if (
        input.documentTypeHint &&
        input.documentTypeHint !== AccountingFinancialDocumentType.STATEMENT
      ) {
        return null;
      }
      return parseFantuanStatement(text);
  }
  return null;
}

function parseCloverCloseout(
  text: string,
  input: ProviderFinancialParseInput,
): ParsedProviderFinancialDocument | null {
  if (
    !/Closeout Batch Report/i.test(text) ||
    !/Batch Totals/i.test(text) ||
    !/Batch ID:/i.test(text)
  ) {
    return null;
  }
  const batchId = capture(text, /Batch ID:\s*\n?\s*([A-Z0-9_-]+)/i);
  if (!batchId) return null;
  const subjectDate = capture(
    input.emailSubject ?? '',
    /Closeout Report for\s+([A-Za-z]{3}\s+\d{1,2},\s+\d{4})/i,
  );
  const created = capture(
    text,
    /Created:\s*\n?\s*([A-Za-z]{3}\s+\d{1,2},\s+\d{4})/i,
  );
  const businessDate = subjectDate
    ? parseEnglishDate(subjectDate)
    : created
      ? parseEnglishDate(created)
      : null;
  const block = between(text, 'Batch Totals', 'Card Type Totals') ?? text;
  const lines: ParsedLine[] = [];
  pushLabelCountAmount(
    lines,
    block,
    CLOVER_CLOSEOUT_RAW_CODES.SALES,
    'Sales',
    AccountingFinancialComponent.SALES,
    AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
  );
  pushLabelCountAmount(
    lines,
    block,
    CLOVER_CLOSEOUT_RAW_CODES.REFUNDS,
    'Refunds',
    AccountingFinancialComponent.REFUND,
    AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
  );
  pushLabelCountAmount(
    lines,
    block,
    CLOVER_CLOSEOUT_RAW_CODES.NET,
    'Net',
    AccountingFinancialComponent.CONTROL_TOTAL,
    AccountingFinancialPostingTreatment.CONTROL_TOTAL,
  );
  pushLabelCountAmount(
    lines,
    block,
    CLOVER_CLOSEOUT_RAW_CODES.TAX,
    'Tax',
    AccountingFinancialComponent.SALES_TAX,
    AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
    AccountingFinancialTaxRole.SALES_TAX,
  );
  pushLabelCountAmount(
    lines,
    block,
    CLOVER_CLOSEOUT_RAW_CODES.TIPS,
    'Tips',
    AccountingFinancialComponent.TIP,
    AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
  );
  const requiredRawCodes = Object.values(CLOVER_CLOSEOUT_RAW_CODES);
  if (
    !businessDate ||
    requiredRawCodes.some(
      (rawCode) => !lines.some((line) => line.rawCode === rawCode),
    )
  ) {
    return null;
  }
  return {
    provider: AccountingFinancialProvider.CLOVER,
    documentType: AccountingFinancialDocumentType.BATCH_CONTROL,
    businessIdentityKey: `clover:batch:${batchId}`,
    providerMerchantRef:
      capture(input.emailSubject ?? '', /MID\s+(\d+)/i) ??
      capture(text, /MID\s+(\d+)/i),
    providerDocumentRef: batchId,
    periodStart: businessDate,
    periodEnd: businessDate,
    currency: 'CAD',
    rawMetadata: {
      evidenceKind: 'CLOVER_CLOSEOUT',
      batchId,
      businessDateSource: subjectDate ? 'EMAIL_SUBJECT' : 'CREATED_TIMESTAMP',
    },
    lines,
  };
}

function parseCloverStatement(
  text: string,
  input: ProviderFinancialParseInput,
): ParsedProviderFinancialDocument | null {
  if (!/YOUR\s+CARD\s+PROCESSING\s+STATEMENT/i.test(text)) return null;
  const period = capturePeriod(
    text,
    /PERIOD:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i,
    parseSlashDateFourDigit,
  );
  const merchant = capture(text, /Merchant\s*Number\s*:?\s*(\d+)/i);
  const extraction = input.documentExtraction;
  if (
    !period ||
    !merchant ||
    !extraction ||
    extraction.layoutMode !== 'GEOMETRY'
  ) {
    return null;
  }

  const accountSummary = cloverModernAccountSummaryFromLayout(extraction);
  const feeSummary = cloverModernFeeSummaryFromLayout(extraction);
  const cardProcessingTotalFees =
    cloverModernCardProcessingTotalFeesFromLayout(extraction);
  const authorityControls =
    extractCloverModernStatementAuthorityControls(extraction);
  if (!accountSummary || !feeSummary || !cardProcessingTotalFees) return null;

  const lines: ParsedLine[] = [];
  const pushControl = (
    rawCode: string,
    rawName: string,
    component: AccountingFinancialComponent,
    resolution: NamedAmountResolution,
    treatment: AccountingFinancialPostingTreatment = AccountingFinancialPostingTreatment.CONTROL_TOTAL,
  ) => {
    lines.push({
      rawCode,
      rawName,
      component,
      postingTreatment: treatment,
      taxRole: AccountingFinancialTaxRole.NONE,
      amountCents: resolution.amountCents,
      ...(resolution.rawPayload ? { rawPayload: resolution.rawPayload } : {}),
    });
  };

  pushControl(
    CLOVER_STATEMENT_RAW_CODES.ACCOUNT_AMOUNT_SUBMITTED,
    'Amount Submitted',
    AccountingFinancialComponent.SALES,
    accountSummary.amountSubmitted,
  );
  pushControl(
    CLOVER_STATEMENT_RAW_CODES.ACCOUNT_PAID_BY_OTHERS,
    'Paid by Others',
    AccountingFinancialComponent.OTHER,
    accountSummary.paidByOthers,
  );
  pushControl(
    CLOVER_STATEMENT_RAW_CODES.ACCOUNT_DISPUTES,
    'Disputes',
    AccountingFinancialComponent.CHARGEBACK,
    accountSummary.disputes,
  );
  pushControl(
    CLOVER_STATEMENT_RAW_CODES.ACCOUNT_ADJUSTMENTS,
    'Adjustments',
    AccountingFinancialComponent.ADJUSTMENT,
    accountSummary.adjustments,
  );
  pushControl(
    CLOVER_STATEMENT_RAW_CODES.ACCOUNT_FEES_TOTAL,
    'Account Summary Fees',
    AccountingFinancialComponent.CONTROL_TOTAL,
    accountSummary.fees,
  );
  pushControl(
    CLOVER_STATEMENT_RAW_CODES.ACCOUNT_AMOUNT_PROCESSED,
    'Amount Processed',
    AccountingFinancialComponent.CONTROL_TOTAL,
    accountSummary.amountProcessed,
  );
  if (authorityControls?.surchargeCollectedCents != null) {
    lines.push({
      rawCode: CLOVER_STATEMENT_RAW_CODES.SURCHARGE_COLLECTED,
      rawName: 'Surcharge Collected',
      component: AccountingFinancialComponent.OTHER,
      postingTreatment: AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
      taxRole: AccountingFinancialTaxRole.NONE,
      amountCents: authorityControls.surchargeCollectedCents,
      rawPayload: {
        evidenceRole: 'EXPLICIT_PROVIDER_SURCHARGE',
      },
    });
  }

  pushControl(
    CLOVER_STATEMENT_RAW_CODES.FEE_SUMMARY_FEES,
    'Fee Summary Fees',
    AccountingFinancialComponent.CONTROL_TOTAL,
    feeSummary.fees,
  );
  pushControl(
    CLOVER_STATEMENT_RAW_CODES.FEE_SUMMARY_ICPF,
    'IC/PF',
    AccountingFinancialComponent.OTHER,
    feeSummary.icpf,
    feeSummary.icpf.amountCents === 0
      ? AccountingFinancialPostingTreatment.CONTROL_TOTAL
      : AccountingFinancialPostingTreatment.UNCLASSIFIED,
  );
  pushControl(
    CLOVER_STATEMENT_RAW_CODES.SERVICE_CHARGES_TOTAL,
    'Service Charges Total',
    AccountingFinancialComponent.CONTROL_TOTAL,
    feeSummary.serviceCharges,
  );
  pushControl(
    CLOVER_STATEMENT_RAW_CODES.CARD_PROCESSING_TOTAL_FEES,
    'Card Processing Total Fees',
    AccountingFinancialComponent.CONTROL_TOTAL,
    cardProcessingTotalFees,
  );

  appendCloverModernFeeLines(
    lines,
    cloverModernFeeRowsFromLayout(extraction),
    feeSummary.fees.amountCents,
    feeSummary.serviceCharges.amountCents,
  );

  return {
    provider: AccountingFinancialProvider.CLOVER,
    documentType: AccountingFinancialDocumentType.STATEMENT,
    businessIdentityKey: `clover:statement:${merchant}:${period.start}:${period.end}`,
    providerMerchantRef: merchant,
    providerDocumentRef: `${merchant}:${period.start}:${period.end}`,
    periodStart: period.start,
    periodEnd: period.end,
    currency: 'CAD',
    rawMetadata: {
      evidenceKind: 'CLOVER_MONTHLY_PROCESSING_STATEMENT',
      statementLayout: 'MODERN_V1',
      documentExtractionEngine: extraction.engine,
      layoutAwareExtraction: true,
      amountsFundedExcludedFromNormalizedLines: true,
      ...(authorityControls
        ? { authorityControls }
        : {}),
    },
    lines,
  };
}

function parseUberMonthlyStatement(
  text: string,
  input: ProviderFinancialParseInput,
): ParsedProviderFinancialDocument | null {
  const periodMatch =
    /Date\s+([A-Za-z]{3})\s+(\d{1,2})-(\d{1,2}),\s+(\d{4})/i.exec(text);
  if (!periodMatch) return null;
  const period = monthRange(
    periodMatch[1],
    periodMatch[2],
    periodMatch[3],
    periodMatch[4],
  );
  if (!period) return null;
  const statementNumber = capture(text, /Statement Number\s*#?([A-Z0-9_-]+)/i);
  const summary = text.split(/Payout Period:/i)[0] ?? text;
  const summaryExtraction = sliceAccountingDocumentExtractionBeforeMarker(
    input.documentExtraction,
    'Payout Period:',
  );
  const lines: ParsedLine[] = [];
  const namedLabels: string[] = [];
  const add = (
    label: string,
    component: AccountingFinancialComponent,
    treatment: AccountingFinancialPostingTreatment,
    taxRole: AccountingFinancialTaxRole = AccountingFinancialTaxRole.NONE,
  ) => {
    namedLabels.push(label);
    pushNamedSummary(
      lines,
      summary,
      label,
      component,
      treatment,
      taxRole,
      summaryExtraction,
    );
  };

  add(
    'Sales',
    AccountingFinancialComponent.SALES,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  add(
    'Tax on Sales',
    AccountingFinancialComponent.SALES_TAX,
    AccountingFinancialPostingTreatment.POSTABLE,
    AccountingFinancialTaxRole.SALES_TAX,
  );
  add(
    'Tips',
    AccountingFinancialComponent.TIP,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  add(
    'Container Fees',
    AccountingFinancialComponent.OTHER,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  add(
    'Tax on Container Fees',
    AccountingFinancialComponent.OTHER,
    AccountingFinancialPostingTreatment.POSTABLE,
    AccountingFinancialTaxRole.SALES_TAX,
  );
  add(
    'Other Earnings',
    AccountingFinancialComponent.OTHER,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  add(
    'Tax on Other Earnings',
    AccountingFinancialComponent.OTHER,
    AccountingFinancialPostingTreatment.POSTABLE,
    AccountingFinancialTaxRole.SALES_TAX,
  );
  add(
    'Total Earnings',
    AccountingFinancialComponent.CONTROL_TOTAL,
    AccountingFinancialPostingTreatment.CONTROL_TOTAL,
  );
  add(
    'Marketplace Fees',
    AccountingFinancialComponent.COMMISSION,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  add(
    'Tax on Marketplace Fees',
    AccountingFinancialComponent.COMMISSION_TAX,
    AccountingFinancialPostingTreatment.POSTABLE,
    AccountingFinancialTaxRole.INPUT_TAX,
  );
  add(
    'Other Charges',
    AccountingFinancialComponent.PLATFORM_OTHER_FEE,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  add(
    'Tax On Other Charges',
    AccountingFinancialComponent.PLATFORM_OTHER_FEE_TAX,
    AccountingFinancialPostingTreatment.POSTABLE,
    AccountingFinancialTaxRole.INPUT_TAX,
  );
  add(
    'Total Uber Fees',
    AccountingFinancialComponent.CONTROL_TOTAL,
    AccountingFinancialPostingTreatment.CONTROL_TOTAL,
  );
  add(
    'Offers On Items',
    AccountingFinancialComponent.PROMOTION,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  add(
    'Marketing Adjustment',
    AccountingFinancialComponent.ADJUSTMENT,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  add(
    'Other Offer Charges',
    AccountingFinancialComponent.PROMOTION,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  add(
    'Tax on offer spends',
    AccountingFinancialComponent.SALES_TAX,
    AccountingFinancialPostingTreatment.POSTABLE,
    AccountingFinancialTaxRole.SALES_TAX,
  );
  add(
    'Ad Spends',
    AccountingFinancialComponent.ADVERTISING,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  add(
    'Ad Credits',
    AccountingFinancialComponent.ADVERTISING_CREDIT,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  add(
    'Tax on Net Ad Spends',
    AccountingFinancialComponent.ADVERTISING_TAX,
    AccountingFinancialPostingTreatment.POSTABLE,
    AccountingFinancialTaxRole.INPUT_TAX,
  );
  add(
    'Total Marketing Spends',
    AccountingFinancialComponent.CONTROL_TOTAL,
    AccountingFinancialPostingTreatment.CONTROL_TOTAL,
  );
  add(
    'Net Chargeback Amount',
    AccountingFinancialComponent.CHARGEBACK,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  add(
    'Net Tax On Chargeback',
    AccountingFinancialComponent.CHARGEBACK_TAX,
    AccountingFinancialPostingTreatment.POSTABLE,
    AccountingFinancialTaxRole.SALES_TAX,
  );
  add(
    'Marketplace Facilitator Tax',
    AccountingFinancialComponent.OTHER,
    AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
    AccountingFinancialTaxRole.OTHER_TAX,
  );
  add(
    'Adjustments',
    AccountingFinancialComponent.ADJUSTMENT,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  add(
    'Tax On Adjustments',
    AccountingFinancialComponent.ADJUSTMENT,
    AccountingFinancialPostingTreatment.POSTABLE,
    AccountingFinancialTaxRole.OTHER_TAX,
  );
  add(
    'Total Amendments',
    AccountingFinancialComponent.CONTROL_TOTAL,
    AccountingFinancialPostingTreatment.CONTROL_TOTAL,
  );
  add(
    'Net Total',
    AccountingFinancialComponent.CONTROL_TOTAL,
    AccountingFinancialPostingTreatment.CONTROL_TOTAL,
  );
  if (hasUnresolvedPopplerTextOnlyNamedAmount(namedLabels, summaryExtraction)) {
    return null;
  }
  if (!lines.length) return null;
  return {
    provider: AccountingFinancialProvider.UBER_EATS,
    documentType: AccountingFinancialDocumentType.STATEMENT,
    businessIdentityKey: `uber:statement:${statementNumber ?? `${period.start}:${period.end}`}`,
    providerMerchantRef: null,
    providerDocumentRef: statementNumber,
    periodStart: period.start,
    periodEnd: period.end,
    currency: 'CAD',
    rawMetadata: {
      evidenceKind: 'UBER_MONTHLY_STATEMENT',
      monthlySummaryOnly: true,
      payoutSectionsExcludedFromNormalizedLines: true,
      documentExtractionEngine: summaryExtraction?.engine ?? null,
      layoutAwareExtraction: summaryExtraction?.layoutMode === 'GEOMETRY',
    },
    lines,
  };
}

function parseFantuanStatement(
  text: string,
): ParsedProviderFinancialDocument | null {
  const period = capturePeriod(
    text,
    /From:\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i,
    (value) => value,
  );
  if (!period) return null;
  const lines: ParsedLine[] = [];
  const add = (
    label: string,
    component: AccountingFinancialComponent,
    treatment: AccountingFinancialPostingTreatment,
    taxRole: AccountingFinancialTaxRole = AccountingFinancialTaxRole.NONE,
  ) => pushNamedSummary(lines, text, label, component, treatment, taxRole);
  add(
    'Sales',
    AccountingFinancialComponent.SALES,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  add(
    'Item Subtotal',
    AccountingFinancialComponent.CONTROL_TOTAL,
    AccountingFinancialPostingTreatment.CONTROL_TOTAL,
  );
  add(
    'Marketing and Fantuan Event Charges',
    AccountingFinancialComponent.CONTROL_TOTAL,
    AccountingFinancialPostingTreatment.CONTROL_TOTAL,
  );
  add(
    'Discounts from Promotion events',
    AccountingFinancialComponent.PROMOTION,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  add(
    'Fantuan Subsidy for Promotion events',
    AccountingFinancialComponent.SUBSIDY,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  add(
    'Commission',
    AccountingFinancialComponent.COMMISSION,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  add(
    'Adjustment',
    AccountingFinancialComponent.ADJUSTMENT,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  add(
    'Net Taxes',
    AccountingFinancialComponent.CONTROL_TOTAL,
    AccountingFinancialPostingTreatment.CONTROL_TOTAL,
  );
  add(
    'Net Sales GST/HST',
    AccountingFinancialComponent.SALES_TAX,
    AccountingFinancialPostingTreatment.POSTABLE,
    AccountingFinancialTaxRole.SALES_TAX,
  );
  add(
    'Commission GST/HST',
    AccountingFinancialComponent.COMMISSION_TAX,
    AccountingFinancialPostingTreatment.POSTABLE,
    AccountingFinancialTaxRole.INPUT_TAX,
  );
  add(
    'Total transfer amount',
    AccountingFinancialComponent.PAYOUT,
    AccountingFinancialPostingTreatment.CONTROL_TOTAL,
  );
  if (!lines.length) return null;
  return {
    provider: AccountingFinancialProvider.FANTUAN,
    documentType: AccountingFinancialDocumentType.STATEMENT,
    businessIdentityKey: `fantuan:statement:${period.start}:${period.end}`,
    providerMerchantRef: null,
    providerDocumentRef: `${period.start}:${period.end}`,
    periodStart: period.start,
    periodEnd: period.end,
    currency: 'CAD',
    rawMetadata: {
      evidenceKind: 'FANTUAN_SETTLEMENT_SUMMARY',
      legalEntityName: capture(text, /Name:\s*([^\n]+)/i),
      restaurantLabel: capture(text, /Restaurant:\s*([^\n]+)/i),
    },
    lines,
  };
}

function pushNamedSummary(
  lines: ParsedLine[],
  text: string,
  label: string,
  component: AccountingFinancialComponent,
  treatment: AccountingFinancialPostingTreatment,
  taxRole: AccountingFinancialTaxRole = AccountingFinancialTaxRole.NONE,
  documentExtraction?: AccountingDocumentExtraction,
) {
  const resolution = resolveNamedAmount(text, label, documentExtraction);
  if (!resolution) return;
  lines.push({
    rawName: label,
    component,
    postingTreatment: treatment,
    taxRole,
    amountCents: resolution.amountCents,
    ...(resolution.rawPayload ? { rawPayload: resolution.rawPayload } : {}),
  });
}

function pushLabelCountAmount(
  lines: ParsedLine[],
  text: string,
  rawCode: string,
  label: string,
  component: AccountingFinancialComponent,
  treatment: AccountingFinancialPostingTreatment,
  taxRole: AccountingFinancialTaxRole = AccountingFinancialTaxRole.NONE,
) {
  const regex = new RegExp(
    `(?:^|\\n)${escapeRegex(label)}\\s+(\\d+)\\s+([^\\s]+)`,
    'i',
  );
  const match = regex.exec(text);
  const transactionCount = match ? Number(match[1]) : null;
  const amount = match?.[2] ? parseMoneyCents(match[2]) : null;
  if (
    amount == null ||
    transactionCount == null ||
    !Number.isSafeInteger(transactionCount) ||
    transactionCount < 0
  ) {
    return;
  }
  lines.push({
    rawCode,
    rawName: label,
    component,
    postingTreatment: treatment,
    taxRole,
    amountCents: amount,
    rawPayload: { transactionCount },
  });
}

type CloverModernSummary = {
  amountSubmitted: NamedAmountResolution;
  paidByOthers: NamedAmountResolution;
  disputes: NamedAmountResolution;
  adjustments: NamedAmountResolution;
  fees: NamedAmountResolution;
  amountProcessed: NamedAmountResolution;
};

type CloverModernFeeSummary = {
  fees: NamedAmountResolution;
  icpf: NamedAmountResolution;
  serviceCharges: NamedAmountResolution;
};

export type CloverModernStatementAuthorityControls = {
  transactionCount: number;
  amountSubmittedCents: number;
  refundCount: number;
  refundAmountCents: number;
  surchargeCollectedCents: number | null;
};

type CloverModernFeeDetailRow = {
  invoice: string;
  description: string;
  rowType: 'Fees' | 'Service Charges';
  totalCents: number;
  taxCents: number;
  rawPayload: Record<string, unknown>;
};

const CLOVER_EQUIPMENT_FEE_DESCRIPTION =
  /^(?:MONTHLY\s+EQUIPMENT\s+BILL|CLOVER\s+FLEX\s+3)$/i;
const CLOVER_NETWORK_FEE_DESCRIPTION =
  /^(?:MC(?:-|\s)|MASTERCARD\b|VISA\b|VI(?:-|\s)|INTERAC\b)/i;

function exactLayoutLines(
  extraction: AccountingDocumentExtraction,
  text: string,
): AccountingDocumentExtractionLine[] {
  return extraction.lines
    .filter(
      (line) =>
        line.geometry && line.text.trim().toLowerCase() === text.toLowerCase(),
    )
    .sort(
      (left, right) =>
        left.page - right.page ||
        (left.geometry?.top ?? 0) - (right.geometry?.top ?? 0) ||
        (left.geometry?.left ?? 0) - (right.geometry?.left ?? 0),
    );
}

function resolveStackedAmountFromLayout(params: {
  extraction: AccountingDocumentExtraction;
  label: string;
  page: number;
  afterTop: number;
  beforeTop: number;
  maxTopDelta?: number;
}): NamedAmountResolution | null {
  const labelLines = exactLayoutLines(params.extraction, params.label).filter(
    (line) =>
      line.page === params.page &&
      line.geometry &&
      line.geometry.top >= params.afterTop &&
      line.geometry.top < params.beforeTop,
  );
  for (const labelLine of labelLines) {
    const labelGeometry = labelLine.geometry;
    if (!labelGeometry) continue;
    const labelCenter = labelGeometry.left + labelGeometry.width / 2;
    const candidates = params.extraction.lines
      .flatMap((line) => {
        if (
          line.lineId === labelLine.lineId ||
          line.page !== labelLine.page ||
          !line.geometry
        ) {
          return [];
        }
        const amountCents = parseMoneyCents(line.text);
        if (amountCents == null) return [];
        const topDelta = line.geometry.top - labelGeometry.top;
        if (topDelta < -0.005 || topDelta > (params.maxTopDelta ?? 0.08)) {
          return [];
        }
        const amountCenter = line.geometry.left + line.geometry.width / 2;
        const centerDelta = Math.abs(amountCenter - labelCenter);
        if (centerDelta > Math.max(0.09, labelGeometry.width * 0.8)) return [];
        return [{ line, amountCents, topDelta, centerDelta }];
      })
      .sort(
        (left, right) =>
          left.topDelta - right.topDelta ||
          left.centerDelta - right.centerDelta,
      );
    const best = candidates[0];
    if (!best) continue;
    return {
      amountCents: best.amountCents,
      rawPayload: {
        extractionEvidence: {
          version: 1,
          strategy: 'CLOVER_MODERN_STACKED_LABEL',
          engine: params.extraction.engine,
          labelLine: documentLineEvidence(labelLine),
          amountLine: documentLineEvidence(best.line),
        },
      },
    };
  }
  return null;
}

function cloverModernAccountSummaryFromLayout(
  extraction: AccountingDocumentExtraction,
): CloverModernSummary | null {
  const statementHeading = exactLayoutLines(
    extraction,
    'YOUR CARD PROCESSING STATEMENT',
  )[0];
  if (!statementHeading?.geometry) return null;
  const statementGeometry = statementHeading.geometry;
  const page = statementHeading.page;
  const accountHeading = exactLayoutLines(extraction, 'Account Summary').find(
    (line) =>
      line.page === page &&
      line.geometry &&
      line.geometry.top > statementGeometry.top,
  );
  if (!accountHeading?.geometry) return null;
  const accountGeometry = accountHeading.geometry;

  const resolve = (label: string) =>
    resolveStackedAmountFromLayout({
      extraction,
      label,
      page,
      afterTop: statementGeometry.top,
      beforeTop: accountGeometry.top,
    });
  const amountSubmitted = resolve('Amount Submitted');
  const paidByOthers = resolve('Paid by Others');
  const disputes = resolve('Disputes');
  const adjustments = resolve('Adjustments');
  const fees = resolve('Fees');
  const amountProcessed = resolve('Amount Processed');
  if (
    !amountSubmitted ||
    !paidByOthers ||
    !disputes ||
    !adjustments ||
    !fees ||
    !amountProcessed
  ) {
    return null;
  }
  return {
    amountSubmitted,
    paidByOthers,
    disputes,
    adjustments,
    fees,
    amountProcessed,
  };
}

function cloverModernFeeSummaryFromLayout(
  extraction: AccountingDocumentExtraction,
): CloverModernFeeSummary | null {
  const heading = exactLayoutLines(extraction, 'Fee Summary')[0];
  if (!heading?.geometry) return null;
  const headingGeometry = heading.geometry;
  const beforeTop = Math.min(1, headingGeometry.top + 0.13);
  const resolve = (label: string) =>
    resolveStackedAmountFromLayout({
      extraction,
      label,
      page: heading.page,
      afterTop: headingGeometry.top,
      beforeTop,
      maxTopDelta: 0.06,
    });
  const fees = resolve('Fees');
  const icpf = resolve('IC/PF');
  const serviceCharges = resolve('Service Charges');
  return fees && icpf && serviceCharges ? { fees, icpf, serviceCharges } : null;
}

function cloverModernCardProcessingTotalFeesFromLayout(
  extraction: AccountingDocumentExtraction,
): NamedAmountResolution | null {
  const heading = exactLayoutLines(
    extraction,
    'Card Processing and Fee Summary',
  )[0];
  if (!heading?.geometry) return null;
  const headingGeometry = heading.geometry;

  const feesHeader = exactLayoutLines(extraction, 'Fees')
    .filter(
      (line) =>
        line.page === heading.page &&
        line.geometry &&
        line.geometry.left > 0.7 &&
        line.geometry.top > headingGeometry.top &&
        line.geometry.top - headingGeometry.top < 0.2,
    )
    .sort(
      (left, right) => (left.geometry?.top ?? 0) - (right.geometry?.top ?? 0),
    )[0];
  if (!feesHeader?.geometry) return null;
  const feesHeaderGeometry = feesHeader.geometry;

  const totalRow = exactLayoutLines(extraction, 'Total')
    .filter(
      (line) =>
        line.page === heading.page &&
        line.geometry &&
        line.geometry.left < 0.2 &&
        line.geometry.top > feesHeaderGeometry.top &&
        line.geometry.top - feesHeaderGeometry.top < 0.25,
    )
    .sort(
      (left, right) => (left.geometry?.top ?? 0) - (right.geometry?.top ?? 0),
    )[0];
  if (!totalRow?.geometry) return null;

  const headerCenter = feesHeaderGeometry.left + feesHeaderGeometry.width / 2;
  const value = extraction.lines
    .flatMap((line) => {
      if (
        line.page !== totalRow.page ||
        !line.geometry ||
        verticalOverlapRatio(totalRow, line) < 0.35
      ) {
        return [];
      }
      const amountCents = parseMoneyCents(line.text);
      if (amountCents == null) return [];
      const center = line.geometry.left + line.geometry.width / 2;
      const centerDelta = Math.abs(center - headerCenter);
      if (centerDelta > 0.1) return [];
      return [{ line, amountCents, centerDelta }];
    })
    .sort((left, right) => left.centerDelta - right.centerDelta)[0];
  if (!value) return null;

  return {
    amountCents: -Math.abs(value.amountCents),
    rawPayload: {
      extractionEvidence: {
        version: 1,
        strategy: 'CLOVER_MODERN_CARD_PROCESSING_TOTAL_FEES',
        engine: extraction.engine,
        sectionHeadingLine: documentLineEvidence(heading),
        headerLine: documentLineEvidence(feesHeader),
        totalRowLine: documentLineEvidence(totalRow),
        amountLine: documentLineEvidence(value.line),
      },
    },
  };
}

function rowValueNearestHeader(params: {
  extraction: AccountingDocumentExtraction;
  row: AccountingDocumentExtractionLine;
  header: AccountingDocumentExtractionLine;
  parse: (value: string) => number | null;
}): number | null {
  if (!params.row.geometry || !params.header.geometry) return null;
  const headerCenter =
    params.header.geometry.left + params.header.geometry.width / 2;
  const candidate = params.extraction.lines
    .flatMap((line) => {
      if (
        line.page !== params.row.page ||
        !line.geometry ||
        verticalOverlapRatio(params.row, line) < 0.35
      ) {
        return [];
      }
      const value = params.parse(line.text);
      if (value == null) return [];
      const center = line.geometry.left + line.geometry.width / 2;
      const centerDelta = Math.abs(center - headerCenter);
      return centerDelta <= 0.09 ? [{ value, centerDelta }] : [];
    })
    .sort((left, right) => left.centerDelta - right.centerDelta)[0];
  return candidate?.value ?? null;
}

const parseNonNegativeIntegerToken = (value: string): number | null => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

export function extractCloverModernStatementAuthorityControls(
  extraction: AccountingDocumentExtraction | undefined,
): CloverModernStatementAuthorityControls | null {
  if (!extraction || extraction.layoutMode !== 'GEOMETRY') return null;

  const processingHeading = exactLayoutLines(
    extraction,
    'Card Processing and Fee Summary',
  )[0];
  if (!processingHeading?.geometry) return null;
  const page = processingHeading.page;
  const itemHeaders = exactLayoutLines(extraction, 'Items')
    .filter(
      (line) =>
        line.page === page &&
        line.geometry &&
        line.geometry.top > processingHeading.geometry!.top &&
        line.geometry.top - processingHeading.geometry!.top < 0.15,
    )
    .sort(
      (left, right) =>
        (left.geometry?.left ?? 0) - (right.geometry?.left ?? 0),
    );
  const amountHeaders = exactLayoutLines(extraction, 'Amount')
    .filter(
      (line) =>
        line.page === page &&
        line.geometry &&
        line.geometry.top > processingHeading.geometry!.top &&
        line.geometry.top - processingHeading.geometry!.top < 0.15,
    )
    .sort(
      (left, right) =>
        (left.geometry?.left ?? 0) - (right.geometry?.left ?? 0),
    );
  if (itemHeaders.length < 2 || amountHeaders.length < 2) return null;

  const processingTotalRow = exactLayoutLines(extraction, 'Total')
    .filter(
      (line) =>
        line.page === page &&
        line.geometry &&
        line.geometry.left < 0.2 &&
        line.geometry.top > itemHeaders[0]!.geometry!.top &&
        line.geometry.top - itemHeaders[0]!.geometry!.top < 0.2,
    )
    .sort(
      (left, right) =>
        (left.geometry?.top ?? 0) - (right.geometry?.top ?? 0),
    )[0];
  if (!processingTotalRow) return null;

  const transactionCount = rowValueNearestHeader({
    extraction,
    row: processingTotalRow,
    header: itemHeaders[0]!,
    parse: parseNonNegativeIntegerToken,
  });
  const amountSubmittedCents = rowValueNearestHeader({
    extraction,
    row: processingTotalRow,
    header: amountHeaders[0]!,
    parse: parseMoneyCents,
  });
  const refundCount = rowValueNearestHeader({
    extraction,
    row: processingTotalRow,
    header: itemHeaders[1]!,
    parse: parseNonNegativeIntegerToken,
  });
  const refundAmountCents = rowValueNearestHeader({
    extraction,
    row: processingTotalRow,
    header: amountHeaders[1]!,
    parse: parseMoneyCents,
  });
  if (
    transactionCount == null ||
    amountSubmittedCents == null ||
    refundCount == null ||
    refundAmountCents == null
  ) {
    return null;
  }

  let surchargeCollectedCents: number | null = null;
  const surchargeLines = exactLayoutLines(extraction, 'Surcharge Collected');
  const cardTypeHeader = exactLayoutLines(extraction, 'Card Type')
    .filter((line) => line.geometry)
    .find((line) =>
      surchargeLines.some(
        (surcharge) =>
          surcharge.page === line.page &&
          surcharge.geometry &&
          line.geometry &&
          Math.abs(surcharge.geometry.top - line.geometry.top) < 0.03 &&
          surcharge.geometry.left > 0.7,
      ),
    );
  if (cardTypeHeader?.geometry) {
    const surchargeHeader = surchargeLines
      .filter(
        (line) =>
          line.page === cardTypeHeader.page &&
          line.geometry &&
          line.geometry.left > 0.7 &&
          Math.abs(line.geometry.top - cardTypeHeader.geometry!.top) < 0.03,
      )
      .sort(
        (left, right) =>
          Math.abs(
            (left.geometry?.top ?? 0) - cardTypeHeader.geometry!.top,
          ) -
          Math.abs(
            (right.geometry?.top ?? 0) - cardTypeHeader.geometry!.top,
          ),
      )[0];
    const cardTypeTotalRow = exactLayoutLines(extraction, 'Total')
      .filter(
        (line) =>
          line.page === cardTypeHeader.page &&
          line.geometry &&
          line.geometry.left < 0.2 &&
          line.geometry.top > cardTypeHeader.geometry!.top &&
          line.geometry.top - cardTypeHeader.geometry!.top < 0.25,
      )
      .sort(
        (left, right) =>
          (left.geometry?.top ?? 0) - (right.geometry?.top ?? 0),
      )[0];
    if (surchargeHeader?.geometry && cardTypeTotalRow) {
      surchargeCollectedCents = rowValueNearestHeader({
        extraction,
        row: cardTypeTotalRow,
        header: surchargeHeader,
        parse: parseMoneyCents,
      });
    }
  }

  return {
    transactionCount,
    amountSubmittedCents,
    refundCount,
    refundAmountCents,
    surchargeCollectedCents,
  };
}

function parseHstToken(value: string): number | null {
  const raw = /^HST:\s*([^\s]+)$/i.exec(value.trim())?.[1];
  return raw ? parseMoneyCents(raw) : null;
}

function cloverModernFeeRowsFromLayout(
  extraction: AccountingDocumentExtraction,
): CloverModernFeeDetailRow[] {
  const invoiceLines = extraction.lines
    .filter(
      (line) =>
        line.geometry &&
        line.geometry.left >= 0.2 &&
        line.geometry.left < 0.36 &&
        /^\d{6,12}$/.test(line.text.trim()),
    )
    .sort(
      (left, right) =>
        left.page - right.page ||
        (left.geometry?.top ?? 0) - (right.geometry?.top ?? 0),
    );

  return invoiceLines.flatMap((invoiceLine) => {
    const invoiceGeometry = invoiceLine.geometry;
    if (!invoiceGeometry) return [];
    const rowLines = extraction.lines.filter(
      (line) =>
        line.page === invoiceLine.page &&
        line.geometry &&
        verticalOverlapRatio(invoiceLine, line) >= 0.35,
    );
    const typeLine = rowLines.find(
      (line) =>
        line.geometry &&
        line.geometry.left > 0.55 &&
        line.geometry.left < 0.8 &&
        /^(?:Fees|Service Charges)$/i.test(line.text.trim()),
    );
    if (!typeLine?.geometry) return [];
    const typeGeometry = typeLine.geometry;
    const rowType = /^Fees$/i.test(typeLine.text.trim())
      ? ('Fees' as const)
      : ('Service Charges' as const);

    const invoiceRight = invoiceGeometry.left + invoiceGeometry.width;
    const descriptionLine = rowLines
      .filter(
        (line) =>
          line.geometry &&
          line.geometry.left > invoiceRight &&
          line.geometry.left < typeGeometry.left &&
          line.text.trim() !== typeLine.text.trim(),
      )
      .sort(
        (left, right) =>
          (left.geometry?.left ?? 0) - (right.geometry?.left ?? 0),
      )[0];
    const amountLine = rowLines
      .filter(
        (line) =>
          line.geometry &&
          line.geometry.left > 0.85 &&
          parseMoneyCents(line.text) != null,
      )
      .sort(
        (left, right) =>
          (right.geometry?.left ?? 0) - (left.geometry?.left ?? 0),
      )[0];
    if (!descriptionLine || !amountLine) return [];

    const totalCents = parseMoneyCents(amountLine.text);
    if (totalCents == null) return [];
    const taxLine = rowLines.find((line) =>
      /^HST:\s*[^\s]+$/i.test(line.text.trim()),
    );
    if (rowType === 'Fees' && !taxLine) return [];
    const taxCents = taxLine ? parseHstToken(taxLine.text) : 0;
    if (taxCents == null) return [];

    return [
      {
        invoice: invoiceLine.text.trim(),
        description: descriptionLine.text.trim(),
        rowType,
        totalCents,
        taxCents,
        rawPayload: {
          extractionEvidence: {
            version: 1,
            strategy: 'CLOVER_MODERN_FEE_TABLE_ROW',
            engine: extraction.engine,
            invoiceLine: documentLineEvidence(invoiceLine),
            descriptionLine: documentLineEvidence(descriptionLine),
            typeLine: documentLineEvidence(typeLine),
            taxLine: taxLine ? documentLineEvidence(taxLine) : null,
            amountLine: documentLineEvidence(amountLine),
          },
        },
      },
    ];
  });
}

function appendCloverModernFeeLines(
  lines: ParsedLine[],
  rows: CloverModernFeeDetailRow[],
  expectedFeesCents: number,
  expectedServiceChargesCents: number,
) {
  const feeRows = rows.filter((row) => row.rowType === 'Fees');
  const serviceRows = rows.filter((row) => row.rowType === 'Service Charges');
  const equipmentRows = feeRows.filter((row) =>
    CLOVER_EQUIPMENT_FEE_DESCRIPTION.test(row.description),
  );
  const networkRows = feeRows.filter(
    (row) =>
      !CLOVER_EQUIPMENT_FEE_DESCRIPTION.test(row.description) &&
      CLOVER_NETWORK_FEE_DESCRIPTION.test(row.description),
  );
  const unknownFeeRows = feeRows.filter(
    (row) =>
      !CLOVER_EQUIPMENT_FEE_DESCRIPTION.test(row.description) &&
      !CLOVER_NETWORK_FEE_DESCRIPTION.test(row.description),
  );

  const sumRows = (
    selected: CloverModernFeeDetailRow[],
    selector: (row: CloverModernFeeDetailRow) => number,
  ) =>
    selected.reduce((sum, row) => {
      const next = sum + selector(row);
      if (!Number.isSafeInteger(next)) {
        throw new Error('Clover modern fee detail exceeds safe integer range');
      }
      return next;
    }, 0);

  const pushAggregate = (params: {
    rawCode: string;
    rawName: string;
    component: AccountingFinancialComponent;
    amountCents: number;
    sourceRows: CloverModernFeeDetailRow[];
    taxRole?: AccountingFinancialTaxRole;
  }) => {
    if (params.amountCents === 0) return;
    lines.push({
      rawCode: params.rawCode,
      rawName: params.rawName,
      component: params.component,
      postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
      taxRole: params.taxRole ?? AccountingFinancialTaxRole.NONE,
      amountCents: params.amountCents,
      rawPayload: {
        cloverFeeDetailRows: params.sourceRows.map((row) => ({
          invoice: row.invoice,
          description: row.description,
          rowType: row.rowType,
          totalCents: row.totalCents,
          taxCents: row.taxCents,
          evidence: row.rawPayload,
        })),
      },
    });
  };

  if (feeRows.length === 0 && expectedFeesCents !== 0) {
    lines.push({
      rawCode: CLOVER_STATEMENT_RAW_CODES.UNCLASSIFIED_FEES,
      rawName: 'Fees detail extraction unresolved',
      component: AccountingFinancialComponent.OTHER,
      postingTreatment: AccountingFinancialPostingTreatment.UNCLASSIFIED,
      taxRole: AccountingFinancialTaxRole.NONE,
      amountCents: expectedFeesCents,
    });
  } else {
    pushAggregate({
      rawCode: CLOVER_STATEMENT_RAW_CODES.EQUIPMENT_FEE,
      rawName: 'Clover Equipment Fee',
      component: AccountingFinancialComponent.PLATFORM_OTHER_FEE,
      amountCents: sumRows(
        equipmentRows,
        (row) => row.totalCents - row.taxCents,
      ),
      sourceRows: equipmentRows,
    });
    pushAggregate({
      rawCode: CLOVER_STATEMENT_RAW_CODES.EQUIPMENT_FEE_HST,
      rawName: 'Clover Equipment Fee HST',
      component: AccountingFinancialComponent.PLATFORM_OTHER_FEE_TAX,
      taxRole: AccountingFinancialTaxRole.INPUT_TAX,
      amountCents: sumRows(equipmentRows, (row) => row.taxCents),
      sourceRows: equipmentRows,
    });
    pushAggregate({
      rawCode: CLOVER_STATEMENT_RAW_CODES.NETWORK_FEES,
      rawName: 'Other Card/Network Fees',
      component: AccountingFinancialComponent.PROCESSING_FEE,
      amountCents: sumRows(networkRows, (row) => row.totalCents - row.taxCents),
      sourceRows: networkRows,
    });
    pushAggregate({
      rawCode: CLOVER_STATEMENT_RAW_CODES.NETWORK_FEES_HST,
      rawName: 'Other Card/Network Fees HST',
      component: AccountingFinancialComponent.PROCESSING_FEE_TAX,
      taxRole: AccountingFinancialTaxRole.INPUT_TAX,
      amountCents: sumRows(networkRows, (row) => row.taxCents),
      sourceRows: networkRows,
    });
    for (const row of unknownFeeRows) {
      lines.push({
        rawCode: CLOVER_STATEMENT_RAW_CODES.UNCLASSIFIED_FEES,
        rawName: row.description,
        component: AccountingFinancialComponent.OTHER,
        postingTreatment: AccountingFinancialPostingTreatment.UNCLASSIFIED,
        taxRole: AccountingFinancialTaxRole.NONE,
        amountCents: row.totalCents,
        rawPayload: row.rawPayload,
      });
    }
  }

  if (serviceRows.length === 0 && expectedServiceChargesCents !== 0) {
    lines.push({
      rawCode: CLOVER_STATEMENT_RAW_CODES.UNCLASSIFIED_SERVICE_CHARGES,
      rawName: 'Service Charges detail extraction unresolved',
      component: AccountingFinancialComponent.OTHER,
      postingTreatment: AccountingFinancialPostingTreatment.UNCLASSIFIED,
      taxRole: AccountingFinancialTaxRole.NONE,
      amountCents: expectedServiceChargesCents,
    });
    return;
  }

  pushAggregate({
    rawCode: CLOVER_STATEMENT_RAW_CODES.SERVICE_CHARGES,
    rawName: 'Service Charges',
    component: AccountingFinancialComponent.PROCESSING_FEE,
    amountCents: sumRows(serviceRows, (row) => row.totalCents - row.taxCents),
    sourceRows: serviceRows,
  });
  pushAggregate({
    rawCode: CLOVER_STATEMENT_RAW_CODES.SERVICE_CHARGES_HST,
    rawName: 'Service Charges HST',
    component: AccountingFinancialComponent.PROCESSING_FEE_TAX,
    taxRole: AccountingFinancialTaxRole.INPUT_TAX,
    amountCents: sumRows(serviceRows, (row) => row.taxCents),
    sourceRows: serviceRows,
  });
}

type NamedAmountResolution = {
  amountCents: number;
  rawPayload?: Record<string, unknown>;
};

function verticalOverlapRatio(
  left: AccountingDocumentExtractionLine,
  right: AccountingDocumentExtractionLine,
): number {
  if (!left.geometry || !right.geometry || left.page !== right.page) return 0;
  const overlap = Math.max(
    0,
    Math.min(
      left.geometry.top + left.geometry.height,
      right.geometry.top + right.geometry.height,
    ) - Math.max(left.geometry.top, right.geometry.top),
  );
  const minHeight = Math.min(left.geometry.height, right.geometry.height);
  return minHeight > 0 ? overlap / minHeight : 0;
}

function documentLineEvidence(line: AccountingDocumentExtractionLine) {
  return {
    lineId: line.lineId,
    page: line.page,
    text: line.text,
    confidence: line.confidence,
    geometry: line.geometry,
  };
}

function resolveNamedAmountFromLayout(
  label: string,
  extraction: AccountingDocumentExtraction | undefined,
): NamedAmountResolution | null {
  if (!extraction || extraction.layoutMode !== 'GEOMETRY') return null;
  const labelPattern = new RegExp(
    `^${escapeRegex(label)}(?:\\s*\\([^)]*\\))?(?:\\s+|$)`,
    'i',
  );
  const labelLines = extraction.lines
    .filter((line) => labelPattern.test(line.text))
    .sort(
      (left, right) =>
        left.page - right.page ||
        (left.geometry?.top ?? 0) - (right.geometry?.top ?? 0) ||
        (left.geometry?.left ?? 0) - (right.geometry?.left ?? 0),
    );

  for (const labelLine of labelLines) {
    const match = labelPattern.exec(labelLine.text);
    const inlineToken = match
      ? labelLine.text.slice(match[0].length).trim().split(/\\s+/)[0]
      : undefined;
    const inlineAmount = inlineToken ? parseMoneyCents(inlineToken) : null;
    if (inlineAmount != null) {
      return {
        amountCents: inlineAmount,
        rawPayload: {
          extractionEvidence: {
            version: 1,
            strategy: 'LAYOUT_INLINE',
            engine: extraction.engine,
            labelLine: documentLineEvidence(labelLine),
            amountLine: documentLineEvidence(labelLine),
          },
        },
      };
    }
    const labelGeometry = labelLine.geometry;
    if (!labelGeometry) continue;

    const rowCandidates = extraction.lines
      .flatMap((line) => {
        if (
          line.lineId === labelLine.lineId ||
          line.page !== labelLine.page ||
          !line.geometry
        ) {
          return [];
        }
        const amountCents = parseMoneyCents(line.text);
        if (amountCents == null) return [];
        const labelRight = labelGeometry.left + labelGeometry.width;
        if (line.geometry.left + 0.005 < labelRight) return [];
        const overlapRatio = verticalOverlapRatio(labelLine, line);
        if (overlapRatio < 0.35) return [];
        const labelCenter = labelGeometry.top + labelGeometry.height / 2;
        const valueCenter = line.geometry.top + line.geometry.height / 2;
        return [
          {
            line,
            amountCents,
            overlapRatio,
            centerDelta: Math.abs(labelCenter - valueCenter),
            horizontalGap: Math.max(0, line.geometry.left - labelRight),
          },
        ];
      })
      .sort(
        (left, right) =>
          right.overlapRatio - left.overlapRatio ||
          left.centerDelta - right.centerDelta ||
          left.horizontalGap - right.horizontalGap,
      );

    const best = rowCandidates[0];
    if (best) {
      return {
        amountCents: best.amountCents,
        rawPayload: {
          extractionEvidence: {
            version: 1,
            strategy: 'LAYOUT_ROW_PAIR',
            engine: extraction.engine,
            labelLine: documentLineEvidence(labelLine),
            amountLine: documentLineEvidence(best.line),
          },
        },
      };
    }
  }
  return null;
}

function hasUnresolvedPopplerTextOnlyNamedAmount(
  labels: string[],
  extraction: AccountingDocumentExtraction | undefined,
): boolean {
  if (
    !extraction ||
    extraction.inputKind !== 'PDF' ||
    extraction.engine !== 'POPPLER' ||
    extraction.layoutMode !== 'TEXT_ONLY'
  ) {
    return false;
  }

  return labels.some((label) => {
    const labelPattern = new RegExp(
      `^${escapeRegex(label)}(?:\\s*\\([^)]*\\))?(?:\\s+|$)`,
      'i',
    );
    const matchingLines = extraction.lines.filter((line) =>
      labelPattern.test(line.text),
    );
    if (!matchingLines.length) return false;
    return matchingLines.some((line) => {
      const match = labelPattern.exec(line.text);
      if (!match) return true;
      const inlineToken = line.text
        .slice(match[0].length)
        .trim()
        .split(/\\s+/)[0];
      return !inlineToken || parseMoneyCents(inlineToken) == null;
    });
  });
}

function resolveNamedAmountFromPopplerTextLine(
  label: string,
  extraction: AccountingDocumentExtraction | undefined,
): NamedAmountResolution | null {
  if (
    !extraction ||
    extraction.inputKind !== 'PDF' ||
    extraction.engine !== 'POPPLER' ||
    extraction.layoutMode !== 'TEXT_ONLY'
  ) {
    return null;
  }
  const labelPattern = new RegExp(
    `^${escapeRegex(label)}(?:\\s*\\([^)]*\\))?(?:\\s+|$)`,
    'i',
  );
  for (const line of extraction.lines) {
    const match = labelPattern.exec(line.text);
    if (!match) continue;
    const inlineToken = line.text
      .slice(match[0].length)
      .trim()
      .split(/\\s+/)[0];
    const amountCents = inlineToken ? parseMoneyCents(inlineToken) : null;
    if (amountCents == null) continue;
    return {
      amountCents,
      rawPayload: {
        extractionEvidence: {
          version: 1,
          strategy: 'TEXT_LINE_INLINE',
          engine: extraction.engine,
          labelLine: documentLineEvidence(line),
          amountLine: documentLineEvidence(line),
        },
      },
    };
  }
  return null;
}

function resolveNamedAmount(
  text: string,
  label: string,
  extraction?: AccountingDocumentExtraction,
): NamedAmountResolution | null {
  const layout = resolveNamedAmountFromLayout(label, extraction);
  if (layout) return layout;
  if (
    extraction?.inputKind === 'PDF' &&
    extraction.engine === 'POPPLER' &&
    extraction.layoutMode === 'TEXT_ONLY'
  ) {
    return resolveNamedAmountFromPopplerTextLine(label, extraction);
  }
  if (extraction?.layoutMode === 'GEOMETRY') {
    const labelPattern = new RegExp(
      `^${escapeRegex(label)}(?:\\s*\\([^)]*\\))?(?:\\s+|$)`,
      'i',
    );
    if (extraction.lines.some((line) => labelPattern.test(line.text))) {
      return null;
    }
  }

  const regex = new RegExp(
    `${escapeRegex(label)}(?:\\s*\\([^\\n)]*\\))?\\s+([^\\s]+)`,
    'gi',
  );
  for (const match of text.matchAll(regex)) {
    const raw = match[1];
    const amountCents = raw ? parseMoneyCents(raw) : null;
    if (amountCents != null) return { amountCents };
  }
  return null;
}

function parseMoneyCents(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;
  const negativeByParens = /^\(.*\)$/.test(value);
  const cleaned = value.replace(/[,$*()]/g, '').replace(/^\+/, '');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  const cents = Math.round(parsed * 100);
  return negativeByParens ? -Math.abs(cents) : cents;
}

function capture(text: string, regex: RegExp): string | null {
  return regex.exec(text)?.[1]?.trim() || null;
}

function capturePeriod(
  text: string,
  regex: RegExp,
  parse: (value: string) => string | null,
) {
  const match = regex.exec(text);
  if (!match) return null;
  const start = parse(match[1]);
  const end = parse(match[2]);
  return start && end ? { start, end } : null;
}

function parseSlashDateFourDigit(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  return normalizeIsoDate(`${match[3]}-${match[1]}-${match[2]}`);
}

function parseEnglishDate(value: string): string | null {
  const parsed = new Date(`${value} 00:00:00 UTC`);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString().slice(0, 10);
}

function monthRange(
  mon: string,
  startDay: string,
  endDay: string,
  year: string,
) {
  const month =
    [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ].indexOf(mon.toLowerCase()) + 1;
  if (!month) return null;
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const start = normalizeIsoDate(
    `${prefix}-${String(Number(startDay)).padStart(2, '0')}`,
  );
  const end = normalizeIsoDate(
    `${prefix}-${String(Number(endDay)).padStart(2, '0')}`,
  );
  return start && end ? { start, end } : null;
}

function normalizeIsoDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

function between(text: string, start: string, end: string): string | null {
  const startIndex = text.toLowerCase().indexOf(start.toLowerCase());
  if (startIndex < 0) return null;
  const endIndex = text
    .toLowerCase()
    .indexOf(end.toLowerCase(), startIndex + start.length);
  return text.slice(startIndex, endIndex < 0 ? undefined : endIndex);
}

function normalizeText(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
