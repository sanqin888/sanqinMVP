export const UBER_ACCOUNTING_REPORT_EVIDENCE_KIND = {
  PAYMENT_DETAILS: 'UBER_PAYMENT_DETAILS_REPORT',
  PAYOUT_SUMMARY: 'UBER_PAYOUT_SUMMARY_REPORT',
} as const;

export const UBER_ACCOUNTING_REPORT_REQUEST_TYPE = {
  PAYMENT_DETAILS: 'PAYMENT_DETAILS_REPORT',
  FINANCE_SUMMARY: 'FINANCE_SUMMARY_REPORT',
} as const;

export const UBER_ACCOUNTING_REPORT_PROVIDER_TYPE = {
  PAYMENT_DETAILS: 'PAYMENT_DETAILS_REPORT',
  PAYOUT_SUMMARY: 'PAYOUT_SUMMARY_REPORT',
} as const;

export type UberAccountingReportEvidenceKind =
  (typeof UBER_ACCOUNTING_REPORT_EVIDENCE_KIND)[keyof typeof UBER_ACCOUNTING_REPORT_EVIDENCE_KIND];

export function normalizeUberAccountingReportEvidenceKind(input: {
  requestedReportType: string;
  providerReportType: string;
}): UberAccountingReportEvidenceKind | null {
  if (
    input.requestedReportType ===
      UBER_ACCOUNTING_REPORT_REQUEST_TYPE.PAYMENT_DETAILS &&
    input.providerReportType ===
      UBER_ACCOUNTING_REPORT_PROVIDER_TYPE.PAYMENT_DETAILS
  ) {
    return UBER_ACCOUNTING_REPORT_EVIDENCE_KIND.PAYMENT_DETAILS;
  }

  if (
    input.requestedReportType ===
      UBER_ACCOUNTING_REPORT_REQUEST_TYPE.FINANCE_SUMMARY &&
    input.providerReportType ===
      UBER_ACCOUNTING_REPORT_PROVIDER_TYPE.PAYOUT_SUMMARY
  ) {
    return UBER_ACCOUNTING_REPORT_EVIDENCE_KIND.PAYOUT_SUMMARY;
  }

  return null;
}

export const UBER_PAYMENT_DETAILS_HEADERS = [
  'Store Name',
  'External Store ID',
  'Store UUID',
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
  'Sales (excl. tax)',
  'Tax on Sales',
  'Chargeback Amount',
  'Tax on Chargeback Amount',
  'Price adjustments (excl. tax)',
  'Tax on Price Adjustments',
  'GST/HST on Sales',
  'PST on Sales',
  'QST on Sales',
  'RST on Sales',
  'Offers on items',
  'Tax On Offers on items',
  'Delivery Offer Redemptions (incl. tax)',
  'Tax On Delivery Offer Redemptions',
  'Offer Redemption Fee',
  'Tax on Offer Redemption Fee',
  'Marketing Adjustment',
  'Markup Amount',
  'GST/HST on Markup',
  'QST on Markup',
  'PST on Markup',
  'Sub-total',
  'Delivery Fee',
  'Tax On Delivery Fee',
  'GST / HST on Delivery Fee',
  'PST on Delivery Fee',
  'QST on Delivery Fee',
  'RST on Delivery Fee',
  'Bag Fee',
  'Total Order (incl. tax)',
  'Cost of Delivery (excl. tax)',
  'Tax on Cost of Delivery',
  'GST / HST on Cost of Delivery',
  'PST on Cost of Delivery',
  'QST on Cost of Delivery',
  'RST on Cost of Delivery',
  'Total Cost of Delivery (incl. tax)',
  'Marketplace Fee',
  'Marketplace fee discount',
  'Tax on Marketplace fee',
  'GST / HST on Marketplace fee',
  'PST on Marketplace fee',
  'QST on Marketplace fee',
  'RST on Marketplace fee',
  'Service fee (Markup)',
  'GST/HST on Service Fee (Markup)',
  'QST on Service Fee (Markup)',
  'PST on Service Fee (Markup)',
  'GST / HST on Ads Spend',
  'QST on Ads Spend',
  'PST on Ads Spend',
  'GST / HST on Ads Credit',
  'QST on Ads Credit',
  'PST on Ads Credit',
  'Profit on Delivery fee',
  'Tips',
  'Container Deposit Fee',
  'Capital Payments',
  'Other payments description',
  'Other payments',
  'Marketplace Facilitator Tax',
  'Garnishment',
  'Total payout',
  'Payout Date',
  'Payout Status',
  'Invoice link U2R',
  'Invoice link C2R',
  'Invoice link R2E',
  'Retailer Loyalty ID',
  'Payout reference ID',
] as const;

export const UBER_PAYOUT_SUMMARY_HEADERS = [
  'Store Name',
  'External Store ID',
  'Store UUID',
  'Order Count',
  'Count of Misc payment',
  'Currency Code',
  'Sales (excl. tax)',
  'Tax on Sales',
  'Chargeback Amount',
  'Tax on Chargeback Amount',
  'Price adjustments (excl. tax)',
  'Tax on Price Adjustments',
  'GST/HST on Sales',
  'PST on Sales',
  'QST on Sales',
  'RST on Sales',
  'Offers on items',
  'Tax On Offers on items',
  'Delivery Offer Redemptions (incl. tax)',
  'Tax On Delivery Offer Redemptions',
  'Offer Redemption Fee',
  'Tax on Offer Redemption Fee',
  'Marketing Adjustment',
  'Markup Amount',
  'GST/HST on Markup',
  'PST on Markup',
  'QST on Markup',
  'Sub-total',
  'Delivery Fee',
  'Tax On Delivery Fee',
  'GST / HST on Delivery Fee',
  'PST on Delivery Fee',
  'QST on Delivery Fee',
  'RST on Delivery Fee',
  'Bag Fee',
  'Total Order (incl. tax)',
  'Cost of Delivery (excl. tax)',
  'Tax on Cost of Delivery',
  'GST / HST on Cost of Delivery',
  'PST on Cost of Delivery',
  'QST on Cost of Delivery',
  'RST on Cost of Delivery',
  'Total Cost of Delivery (incl. tax)',
  'Marketplace Fee',
  'Marketplace fee discount',
  'Tax on Marketplace fee',
  'GST / HST on Marketplace fee',
  'PST on Marketplace fee',
  'QST on Marketplace fee',
  'RST on Marketplace fee',
  'Service fee (Markup)',
  'GST/HST on Service Fee (Markup)',
  'QST on Service Fee (Markup)',
  'PST on Service Fee (Markup)',
  'Profit on Delivery fee',
  'Tips',
  'Container Deposit Fee',
  'Capital Payments',
  'Other payments',
  'Marketplace Facilitator Tax',
  'Garnishment',
  'Total payout',
  'Payout Date',
  'Payout Status',
  'Payout reference ID',
] as const;

export const UBER_PAYMENT_DETAILS_IDENTITY_HEADERS = [
  'Store UUID',
  'Order ID',
  'Workflow ID',
  'Payout reference ID',
] as const;

export const UBER_PAYOUT_SUMMARY_IDENTITY_HEADERS = [
  'Store UUID',
  'Payout reference ID',
] as const;

export const UBER_PAYOUT_CONTROL_HEADERS = [
  'Currency Code',
  'Total payout',
  'Payout Date',
  'Payout Status',
  'Payout reference ID',
] as const;

export const UBER_PAYMENT_DETAILS_DESCRIPTION_HEADER_SENTINEL = [
  'Store name as per Uber Eats manager',
  'External store ID as per Uber Eats manager',
  'Store UUID',
  'Order ID as per Uber Eats manager',
  'Unique ID to identify the order ',
] as const;
