import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingFinancialTaxRole,
} from './accounting-contracts';
import { parseAccountingCsvTable } from './accounting-csv';
import {
  normalizeUberAccountingReportEvidenceKind,
  UBER_ACCOUNTING_REPORT_EVIDENCE_KIND,
  UBER_PAYMENT_DETAILS_HEADERS,
  UBER_PAYOUT_SUMMARY_HEADERS,
  type UberAccountingReportEvidenceKind,
} from './accounting-uber-reporting.contract';

type UberReportParseInput = {
  text: string;
  requestedReportType: string | null | undefined;
  providerReportType: string | null | undefined;
  periodStart: string | null | undefined;
  periodEnd: string | null | undefined;
  providerDocumentRef: string | null | undefined;
};

type UberReportLine = {
  rawCode: string;
  rawName: string;
  component: AccountingFinancialComponent;
  postingTreatment: AccountingFinancialPostingTreatment;
  taxRole: AccountingFinancialTaxRole;
  amountCents: number;
  rawPayload: Record<string, unknown>;
};

const NON_AMOUNT_HEADERS = new Set([
  'Store Name',
  'External Store ID',
  'Store UUID',
  'Order Count',
  'Count of Misc payment',
  'Order ID',
  'Workflow ID',
  'Order Date',
  'Order Accept Time',
  'Order Completion time',
  'Dining Mode',
  'Payment Mode',
  'Order Channel',
  'Order Status',
  'Customer Uber-Membership Status',
  'Currency Code',
  'Other payments description',
  'Payout Date',
  'Payout Status',
  'Invoice link U2R',
  'Invoice link C2R',
  'Invoice link R2E',
  'Retailer Loyalty ID',
  'Payout reference ID',
]);

const LINE_MAPPINGS: Array<{
  header: string;
  component: AccountingFinancialComponent;
  taxRole?: AccountingFinancialTaxRole;
  control?: boolean;
}> = [
  {
    header: 'Sales (excl. tax)',
    component: AccountingFinancialComponent.SALES,
  },
  {
    header: 'Tax on Sales',
    component: AccountingFinancialComponent.SALES_TAX,
    taxRole: AccountingFinancialTaxRole.SALES_TAX,
  },
  {
    header: 'Chargeback Amount',
    component: AccountingFinancialComponent.CHARGEBACK,
  },
  {
    header: 'Tax on Chargeback Amount',
    component: AccountingFinancialComponent.CHARGEBACK_TAX,
    taxRole: AccountingFinancialTaxRole.SALES_TAX,
  },
  {
    header: 'Price adjustments (excl. tax)',
    component: AccountingFinancialComponent.ADJUSTMENT,
  },
  {
    header: 'Offers on items',
    component: AccountingFinancialComponent.PROMOTION,
  },
  {
    header: 'Marketing Adjustment',
    component: AccountingFinancialComponent.ADJUSTMENT,
  },
  {
    header: 'Marketplace Fee',
    component: AccountingFinancialComponent.COMMISSION,
  },
  {
    header: 'Marketplace fee discount',
    component: AccountingFinancialComponent.SUBSIDY,
  },
  {
    header: 'Tax on Marketplace fee',
    component: AccountingFinancialComponent.COMMISSION_TAX,
    taxRole: AccountingFinancialTaxRole.INPUT_TAX,
  },
  { header: 'Tips', component: AccountingFinancialComponent.TIP },
  {
    header: 'Other payments',
    component: AccountingFinancialComponent.OTHER,
  },
  {
    header: 'Marketplace Facilitator Tax',
    component: AccountingFinancialComponent.OTHER,
    taxRole: AccountingFinancialTaxRole.OTHER_TAX,
  },
  { header: 'Garnishment', component: AccountingFinancialComponent.OTHER },
  {
    header: 'Total payout',
    component: AccountingFinancialComponent.PAYOUT,
    control: true,
  },
];

const normalized = (value: string) => value.trim();

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function parseMoneyCents(raw: string): number | null {
  const value = raw.trim();
  if (!value) return 0;
  const negativeByParens = /^\(.*\)$/.test(value);
  const cleaned = value.replace(/[,$*()]/g, '').replace(/^\+/, '');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  const cents = Math.round(parsed * 100);
  return negativeByParens ? -Math.abs(cents) : cents;
}

function expectedHeaders(
  kind: UberAccountingReportEvidenceKind,
): readonly string[] {
  return kind === UBER_ACCOUNTING_REPORT_EVIDENCE_KIND.PAYMENT_DETAILS
    ? UBER_PAYMENT_DETAILS_HEADERS
    : UBER_PAYOUT_SUMMARY_HEADERS;
}

function sameHeader(row: string[], expected: readonly string[]): boolean {
  return (
    row.length === expected.length &&
    row.every((cell, index) => normalized(cell) === expected[index])
  );
}

function rawCode(header: string): string {
  return `UBER_REPORT_${header
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')}`;
}

export function parseUberAccountingApiReport(input: UberReportParseInput) {
  const kind = normalizeUberAccountingReportEvidenceKind({
    requestedReportType: input.requestedReportType ?? '',
    providerReportType: input.providerReportType ?? '',
  });
  if (!kind) return null;

  const periodStart = input.periodStart?.trim() ?? '';
  const periodEnd = input.periodEnd?.trim() ?? '';
  const providerDocumentRef = input.providerDocumentRef?.trim() ?? '';
  if (
    !isDateOnly(periodStart) ||
    !isDateOnly(periodEnd) ||
    periodStart > periodEnd ||
    !providerDocumentRef
  ) {
    return null;
  }

  const rows = parseAccountingCsvTable(input.text);
  if (!rows?.length) return null;
  const headers = expectedHeaders(kind);
  const headerIndex = rows.findIndex((row) => sameHeader(row, headers));
  if (headerIndex < 0) return null;

  const dataRows = rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cell.trim()));
  if (
    !dataRows.length ||
    dataRows.some((row) => row.length !== headers.length)
  ) {
    return null;
  }

  const indexByHeader = new Map(
    headers.map((header, index) => [header, index]),
  );
  const storeIndex = indexByHeader.get('Store UUID');
  const currencyIndex = indexByHeader.get('Currency Code');
  const payoutRefIndex = indexByHeader.get('Payout reference ID');
  if (storeIndex == null || currencyIndex == null || payoutRefIndex == null) {
    return null;
  }

  const storeUuids = new Set<string>();
  const currencies = new Set<string>();
  const payoutReferences = new Set<string>();
  const payoutControls = new Map<
    string,
    { payoutReferenceId: string; totalPayoutCents: number; rowCount: number }
  >();
  let unreferencedPayoutRowCount = 0;
  let unreferencedTotalPayoutCents = 0;
  const otherPaymentDescriptions = new Set<string>();
  const columnTotalsCents: Record<string, number> = {};

  const amountHeaders = headers.filter(
    (header) => !NON_AMOUNT_HEADERS.has(header),
  );
  for (const header of amountHeaders) columnTotalsCents[header] = 0;

  for (const row of dataRows) {
    const storeUuid = normalized(row[storeIndex] ?? '');
    const currency = normalized(row[currencyIndex] ?? '');
    if (!storeUuid || !/^[A-Z]{3}$/.test(currency)) return null;
    storeUuids.add(storeUuid);
    currencies.add(currency);

    const payoutReference = normalized(row[payoutRefIndex] ?? '');
    if (payoutReference) payoutReferences.add(payoutReference);

    const descriptionIndex = indexByHeader.get('Other payments description');
    const description =
      descriptionIndex == null ? '' : normalized(row[descriptionIndex] ?? '');
    if (description) otherPaymentDescriptions.add(description);

    const rowAmountsCents: Record<string, number> = {};
    for (const header of amountHeaders) {
      const index = indexByHeader.get(header);
      if (index == null) return null;
      const cents = parseMoneyCents(row[index] ?? '');
      if (cents == null) return null;
      rowAmountsCents[header] = cents;
      columnTotalsCents[header] = (columnTotalsCents[header] ?? 0) + cents;
    }

    const totalPayoutCents = rowAmountsCents['Total payout'];
    if (totalPayoutCents == null) return null;
    if (payoutReference) {
      const current = payoutControls.get(payoutReference);
      payoutControls.set(payoutReference, {
        payoutReferenceId: payoutReference,
        totalPayoutCents: (current?.totalPayoutCents ?? 0) + totalPayoutCents,
        rowCount: (current?.rowCount ?? 0) + 1,
      });
    } else {
      unreferencedPayoutRowCount += 1;
      unreferencedTotalPayoutCents += totalPayoutCents;
    }
  }

  if (currencies.size !== 1) return null;
  const currency = [...currencies][0];
  const lines: UberReportLine[] = LINE_MAPPINGS.map((mapping) => ({
    rawCode: rawCode(mapping.header),
    rawName: mapping.header,
    component: mapping.component,
    postingTreatment: mapping.control
      ? AccountingFinancialPostingTreatment.CONTROL_TOTAL
      : AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
    taxRole: mapping.taxRole ?? AccountingFinancialTaxRole.NONE,
    amountCents: columnTotalsCents[mapping.header] ?? 0,
    rawPayload: {
      evidenceKind: kind,
      aggregatedRowCount: dataRows.length,
      ...(mapping.control ? { controlRole: 'REPORT_TOTAL_PAYOUT' } : {}),
    },
  }));

  return {
    provider: AccountingFinancialProvider.UBER_EATS,
    documentType: AccountingFinancialDocumentType.API_REPORT,
    businessIdentityKey: `uber:api-report:${kind}:${providerDocumentRef}`,
    providerMerchantRef: null,
    providerDocumentRef,
    periodStart,
    periodEnd,
    currency,
    rawMetadata: {
      evidenceKind: kind,
      requestedReportType: input.requestedReportType,
      providerReportType: input.providerReportType,
      headerRowIndex: headerIndex,
      rowCount: dataRows.length,
      storeUuids: [...storeUuids].sort(),
      payoutReferenceCount: payoutReferences.size,
      payoutReferences: [...payoutReferences].sort(),
      payoutControls: [...payoutControls.values()].sort((left, right) =>
        left.payoutReferenceId.localeCompare(right.payoutReferenceId),
      ),
      unreferencedPayoutRowCount,
      unreferencedTotalPayoutCents,
      columnTotalsCents,
      otherPaymentDescriptions: [...otherPaymentDescriptions]
        .sort()
        .slice(0, 100),
      otherPaymentDescriptionsTruncated: otherPaymentDescriptions.size > 100,
      allPostingEvidenceReconciliationOnly: true,
    },
    lines,
  };
}
