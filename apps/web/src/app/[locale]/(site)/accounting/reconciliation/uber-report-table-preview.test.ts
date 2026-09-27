import {
  accountingUberReportPreviewUrl,
  splitUberReportPreviewRows,
} from './uber-report-table-preview';

describe('Uber report table preview helpers', () => {
  it('encodes the report identity and owned artifact URL', () => {
    expect(
      accountingUberReportPreviewUrl(
        'uberreport_1',
        '/api/v1/accounting/files/uber-reports/report 1.csv',
      ),
    ).toBe(
      '/accounting/automation/uber-reports/uberreport_1/tabular-preview?artifactUrl=%2Fapi%2Fv1%2Faccounting%2Ffiles%2Fuber-reports%2Freport%201.csv',
    );
  });

  it('uses the second Payment Details row as the machine header', () => {
    expect(
      splitUberReportPreviewRows('PAYMENT_DETAILS_REPORT', [
        ['Uber field description', 'Payout description'],
        ['Store Name', 'Total payout'],
        ['SanQ', '12.34'],
      ]),
    ).toEqual({
      hasPaymentDetailsDescriptionRow: true,
      descriptions: ['Uber field description', 'Payout description'],
      header: ['Store Name', 'Total payout'],
      bodyRows: [['SanQ', '12.34']],
    });
  });

  it('uses the first Finance Summary row as the header', () => {
    expect(
      splitUberReportPreviewRows('FINANCE_SUMMARY_REPORT', [
        ['Store Name', 'Total payout'],
        ['SanQ', '12.34'],
      ]),
    ).toEqual({
      hasPaymentDetailsDescriptionRow: false,
      descriptions: [],
      header: ['Store Name', 'Total payout'],
      bodyRows: [['SanQ', '12.34']],
    });
  });
});
