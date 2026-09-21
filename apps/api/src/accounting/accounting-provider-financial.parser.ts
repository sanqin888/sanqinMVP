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

export const ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME =
  'accounting-provider-financial';
export const ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION = '5';

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
        return parseCloverStatement(text);
      }
      if (input.documentTypeHint) return null;
      return parseCloverCloseout(text, input) ?? parseCloverStatement(text);
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
  pushLabelAmount(
    lines,
    block,
    'Sales',
    AccountingFinancialComponent.SALES,
    AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
  );
  pushLabelAmount(
    lines,
    block,
    'Refunds',
    AccountingFinancialComponent.REFUND,
    AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
  );
  pushLabelAmount(
    lines,
    block,
    'Net',
    AccountingFinancialComponent.CONTROL_TOTAL,
    AccountingFinancialPostingTreatment.CONTROL_TOTAL,
  );
  pushLabelAmount(
    lines,
    block,
    'Tax',
    AccountingFinancialComponent.SALES_TAX,
    AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
    AccountingFinancialTaxRole.SALES_TAX,
  );
  pushLabelAmount(
    lines,
    block,
    'Tips',
    AccountingFinancialComponent.TIP,
    AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
  );
  if (!lines.length) return null;
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
): ParsedProviderFinancialDocument | null {
  const period = capturePeriod(
    text,
    /StatementPeriod\s+(\d{2}\/\d{2}\/\d{2})\s*-\s*(\d{2}\/\d{2}\/\d{2})/i,
    parseSlashDate,
  );
  const merchant = capture(text, /MerchantNumber\s+(\d+)/i);
  if (!period || !merchant) return null;
  const summary =
    between(text, 'LOCATION\nSUMMARY', 'All amounts shown') ?? text;
  const lines: ParsedLine[] = [];
  pushNamedSummary(
    lines,
    summary,
    'Total Amount Submitted',
    AccountingFinancialComponent.SALES,
    AccountingFinancialPostingTreatment.CONTROL_TOTAL,
  );
  pushNamedSummary(
    lines,
    summary,
    'Third-Party Transactions',
    AccountingFinancialComponent.OTHER,
    AccountingFinancialPostingTreatment.UNCLASSIFIED,
  );
  pushNamedSummary(
    lines,
    summary,
    'Adjustments',
    AccountingFinancialComponent.ADJUSTMENT,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  pushNamedSummary(
    lines,
    summary,
    'Interchange Charges',
    AccountingFinancialComponent.PROCESSING_FEE,
    AccountingFinancialPostingTreatment.POSTABLE,
  );

  const serviceCharges = findNamedAmount(summary, 'Service Charges');
  const serviceTax = sectionHst(text, 'SERVICE CHARGES');
  pushSplitFee(lines, 'Service Charges', serviceCharges, serviceTax);
  const fees = findNamedAmount(summary, 'Fees');
  const feesTax = sectionHst(text, 'FEES');
  pushSplitFee(lines, 'Fees', fees, feesTax);

  pushNamedSummary(
    lines,
    summary,
    'Chargebacks/Reversals',
    AccountingFinancialComponent.CHARGEBACK,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  pushNamedSummary(
    lines,
    summary,
    'Total Amount Funded',
    AccountingFinancialComponent.PAYOUT,
    AccountingFinancialPostingTreatment.CONTROL_TOTAL,
  );
  if (!lines.length) return null;
  return {
    provider: AccountingFinancialProvider.CLOVER,
    documentType: AccountingFinancialDocumentType.STATEMENT,
    businessIdentityKey: `clover:statement:${merchant}:${period.start}:${period.end}`,
    providerMerchantRef: merchant,
    providerDocumentRef: `${merchant}:${period.start}:${period.end}`,
    periodStart: period.start,
    periodEnd: period.end,
    currency: 'CAD',
    rawMetadata: { evidenceKind: 'CLOVER_MONTHLY_PROCESSING_STATEMENT' },
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
  if (
    hasUnresolvedPopplerTextOnlyNamedAmount(namedLabels, summaryExtraction)
  ) {
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

function pushLabelAmount(
  lines: ParsedLine[],
  text: string,
  label: string,
  component: AccountingFinancialComponent,
  treatment: AccountingFinancialPostingTreatment,
  taxRole: AccountingFinancialTaxRole = AccountingFinancialTaxRole.NONE,
) {
  const regex = new RegExp(
    `(?:^|\\n)${escapeRegex(label)}\\s+\\d+\\s+([^\\s]+)`,
    'i',
  );
  const raw = regex.exec(text)?.[1];
  const amount = raw ? parseMoneyCents(raw) : null;
  if (amount == null) return;
  lines.push({
    rawName: label,
    component,
    postingTreatment: treatment,
    taxRole,
    amountCents: amount,
  });
}

function pushSplitFee(
  lines: ParsedLine[],
  label: string,
  total: number | null,
  tax: number | null,
) {
  if (total == null) return;
  if (tax == null || tax === 0) {
    lines.push({
      rawName: label,
      component: AccountingFinancialComponent.PROCESSING_FEE,
      postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
      taxRole: AccountingFinancialTaxRole.NONE,
      amountCents: total,
    });
    return;
  }
  lines.push({
    rawName: `${label} before HST`,
    component: AccountingFinancialComponent.PROCESSING_FEE,
    postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
    taxRole: AccountingFinancialTaxRole.NONE,
    amountCents: total - tax,
  });
  lines.push({
    rawName: `${label} HST`,
    component: AccountingFinancialComponent.PROCESSING_FEE_TAX,
    postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
    taxRole: AccountingFinancialTaxRole.INPUT_TAX,
    amountCents: tax,
  });
}

function sectionHst(text: string, heading: string): number | null {
  const regex = new RegExp(
    `${escapeRegex(heading)}\\s+Date Invoice Description Tax Total[\\s\\S]*?Total HST:([^\\s]+)`,
    'i',
  );
  const raw = regex.exec(text)?.[1];
  return raw ? parseMoneyCents(raw) : null;
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

function findNamedAmount(text: string, label: string): number | null {
  return resolveNamedAmount(text, label)?.amountCents ?? null;
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

function parseSlashDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(value);
  if (!match) return null;
  return normalizeIsoDate(`20${match[3]}-${match[1]}-${match[2]}`);
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
