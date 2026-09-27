import {
  normalizeUberAccountingReportEvidenceKind,
  UBER_ACCOUNTING_REPORT_EVIDENCE_KIND,
  UBER_ACCOUNTING_REPORT_PROVIDER_TYPE,
  UBER_ACCOUNTING_REPORT_REQUEST_TYPE,
  UBER_PAYMENT_DETAILS_DESCRIPTION_HEADER_SENTINEL,
  UBER_PAYMENT_DETAILS_HEADERS,
  UBER_PAYMENT_DETAILS_IDENTITY_HEADERS,
  UBER_PAYOUT_CONTROL_HEADERS,
  UBER_PAYOUT_SUMMARY_HEADERS,
  UBER_PAYOUT_SUMMARY_IDENTITY_HEADERS,
} from './accounting-uber-reporting.contract';

describe('Uber financial Reporting CSV contract', () => {
  it('normalizes the observed request/provider report-type pairs and fails closed on mismatches', () => {
    expect(
      normalizeUberAccountingReportEvidenceKind({
        requestedReportType:
          UBER_ACCOUNTING_REPORT_REQUEST_TYPE.PAYMENT_DETAILS,
        providerReportType:
          UBER_ACCOUNTING_REPORT_PROVIDER_TYPE.PAYMENT_DETAILS,
      }),
    ).toBe(UBER_ACCOUNTING_REPORT_EVIDENCE_KIND.PAYMENT_DETAILS);

    expect(
      normalizeUberAccountingReportEvidenceKind({
        requestedReportType:
          UBER_ACCOUNTING_REPORT_REQUEST_TYPE.FINANCE_SUMMARY,
        providerReportType: UBER_ACCOUNTING_REPORT_PROVIDER_TYPE.PAYOUT_SUMMARY,
      }),
    ).toBe(UBER_ACCOUNTING_REPORT_EVIDENCE_KIND.PAYOUT_SUMMARY);

    expect(
      normalizeUberAccountingReportEvidenceKind({
        requestedReportType:
          UBER_ACCOUNTING_REPORT_REQUEST_TYPE.FINANCE_SUMMARY,
        providerReportType:
          UBER_ACCOUNTING_REPORT_PROVIDER_TYPE.PAYMENT_DETAILS,
      }),
    ).toBeNull();
  });

  it('freezes the observed Payment Details machine-header identity and payout controls', () => {
    expect(new Set(UBER_PAYMENT_DETAILS_HEADERS).size).toBe(
      UBER_PAYMENT_DETAILS_HEADERS.length,
    );
    expect(UBER_PAYMENT_DETAILS_HEADERS.slice(0, 5)).toEqual([
      'Store Name',
      'External Store ID',
      'Store UUID',
      'Order ID',
      'Workflow ID',
    ]);
    expect(UBER_PAYMENT_DETAILS_HEADERS).toEqual(
      expect.arrayContaining([
        ...UBER_PAYMENT_DETAILS_IDENTITY_HEADERS,
        ...UBER_PAYOUT_CONTROL_HEADERS,
        'Other payments description',
        'Marketplace Facilitator Tax',
        'Chargeback Amount',
      ]),
    );
    expect(UBER_PAYMENT_DETAILS_HEADERS.at(-1)).toBe('Payout reference ID');
  });

  it('keeps the provider description row distinct from the Payment Details machine header', () => {
    expect(UBER_PAYMENT_DETAILS_DESCRIPTION_HEADER_SENTINEL).toEqual([
      'Store name as per Uber Eats manager',
      'External store ID as per Uber Eats manager',
      'Store UUID',
      'Order ID as per Uber Eats manager',
      'Unique ID to identify the order ',
    ]);
    expect(UBER_PAYMENT_DETAILS_DESCRIPTION_HEADER_SENTINEL).not.toEqual(
      UBER_PAYMENT_DETAILS_HEADERS.slice(0, 5),
    );
  });

  it('freezes the observed Payout Summary identity and control-total spine', () => {
    expect(new Set(UBER_PAYOUT_SUMMARY_HEADERS).size).toBe(
      UBER_PAYOUT_SUMMARY_HEADERS.length,
    );
    expect(UBER_PAYOUT_SUMMARY_HEADERS.slice(0, 6)).toEqual([
      'Store Name',
      'External Store ID',
      'Store UUID',
      'Order Count',
      'Count of Misc payment',
      'Currency Code',
    ]);
    expect(UBER_PAYOUT_SUMMARY_HEADERS).toEqual(
      expect.arrayContaining([
        ...UBER_PAYOUT_SUMMARY_IDENTITY_HEADERS,
        ...UBER_PAYOUT_CONTROL_HEADERS,
        'Marketplace Fee',
        'Marketplace fee discount',
        'Marketplace Facilitator Tax',
      ]),
    );
    expect(UBER_PAYOUT_SUMMARY_HEADERS.at(-1)).toBe('Payout reference ID');
  });
});
