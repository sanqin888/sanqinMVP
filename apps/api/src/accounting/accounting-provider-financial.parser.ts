import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole,
} from '@prisma/client';

export const ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME =
  'accounting-provider-financial';
export const ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION = '1';

export type ProviderFinancialParseInput = {
  text: string;
  originalFilename?: string | null;
  emailSubject?: string | null;
  providerHint?: AccountingFinancialProvider | null;
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

  if (looksLikeCloverCloseout(text)) return parseCloverCloseout(text, input);
  if (looksLikeCloverStatement(text)) return parseCloverStatement(text);
  if (looksLikeUberMonthlyStatement(text)) {
    return parseUberMonthlyStatement(text);
  }
  if (looksLikeFantuanStatement(text)) return parseFantuanStatement(text);

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
  const lines: ParsedLine[] = [];
  const add = (
    label: string,
    component: AccountingFinancialComponent,
    treatment: AccountingFinancialPostingTreatment,
    taxRole: AccountingFinancialTaxRole = AccountingFinancialTaxRole.NONE,
  ) => pushNamedSummary(lines, summary, label, component, treatment, taxRole);

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
    AccountingFinancialComponent.OTHER,
    AccountingFinancialPostingTreatment.POSTABLE,
  );
  add(
    'Tax On Other Charges',
    AccountingFinancialComponent.OTHER,
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
    AccountingFinancialComponent.OTHER,
    AccountingFinancialPostingTreatment.POSTABLE,
    AccountingFinancialTaxRole.INPUT_TAX,
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
    AccountingFinancialComponent.OTHER,
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
    AccountingFinancialComponent.ADJUSTMENT,
    AccountingFinancialPostingTreatment.POSTABLE,
    AccountingFinancialTaxRole.OTHER_TAX,
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

function looksLikeCloverCloseout(text: string) {
  return (
    /Closeout Batch Report/i.test(text) &&
    /Batch Totals/i.test(text) &&
    /Batch ID:/i.test(text)
  );
}

function looksLikeCloverStatement(text: string) {
  return (
    /MERCHANT CARD PROCESSING STATEMENT LOCATION RECAP/i.test(text) &&
    /StatementPeriod/i.test(text) &&
    /Total Amount Funded/i.test(text)
  );
}

function looksLikeUberMonthlyStatement(text: string) {
  return (
    /Monthly\s+Statement/i.test(text) &&
    /Consolidated Monthly Summary/i.test(text) &&
    /Marketplace Fees/i.test(text) &&
    /Net Total/i.test(text)
  );
}

function looksLikeFantuanStatement(text: string) {
  return (
    /Fantuan Subsidy for Promotion events/i.test(text) &&
    /Total Transfer Amount/i.test(text) &&
    /Commission GST\/HST/i.test(text)
  );
}

function pushNamedSummary(
  lines: ParsedLine[],
  text: string,
  label: string,
  component: AccountingFinancialComponent,
  treatment: AccountingFinancialPostingTreatment,
  taxRole: AccountingFinancialTaxRole = AccountingFinancialTaxRole.NONE,
) {
  const amount = findNamedAmount(text, label);
  if (amount == null) return;
  lines.push({
    rawName: label,
    component,
    postingTreatment: treatment,
    taxRole,
    amountCents: amount,
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

function findNamedAmount(text: string, label: string): number | null {
  const regex = new RegExp(
    `${escapeRegex(label)}(?:\\s*\\([^\\n)]*\\))?\\s+([^\\s]+)`,
    'i',
  );
  const raw = regex.exec(text)?.[1];
  return raw ? parseMoneyCents(raw) : null;
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
