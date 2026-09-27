import {
  ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME,
  ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION,
} from './accounting-provider-financial.parser';
import { AccountingUberReportingReconciliationService } from './accounting-uber-reporting-reconciliation.service';

const reportMetadata = (input: {
  evidenceKind: string;
  totalPayoutCents: number;
  payoutReferenceId: string;
}) => ({
  evidenceKind: input.evidenceKind,
  columnTotalsCents: { 'Total payout': input.totalPayoutCents },
  payoutControls: [
    {
      payoutReferenceId: input.payoutReferenceId,
      totalPayoutCents: input.totalPayoutCents,
      rowCount: 1,
    },
  ],
  unreferencedPayoutRowCount: 0,
  unreferencedTotalPayoutCents: 0,
});

const row = (input: {
  documentStableId: string;
  evidenceKind: string;
  totalPayoutCents: number;
  payoutReferenceId: string;
  parserVersion?: string;
  rawMetadata?: unknown;
  currentParseMetadata?: unknown;
}) => ({
  documentStableId: input.documentStableId,
  periodStart: new Date('2026-09-01T00:00:00.000Z'),
  periodEnd: new Date('2026-09-25T00:00:00.000Z'),
  currency: 'CAD',
  parserName: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME,
  parserVersion:
    input.parserVersion ?? ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION,
  rawMetadata:
    input.rawMetadata ??
    reportMetadata({
      evidenceKind: input.evidenceKind,
      totalPayoutCents: input.totalPayoutCents,
      payoutReferenceId: input.payoutReferenceId,
    }),
  artifact: {
    parseRuns:
      input.currentParseMetadata === undefined
        ? []
        : [
            {
              resultJson: {
                rawMetadata: input.currentParseMetadata,
              },
            },
          ],
  },
});

describe('AccountingUberReportingReconciliationService', () => {
  it('reads only the two report document families and returns a matched control result', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        row({
          documentStableId: 'payment-doc',
          evidenceKind: 'UBER_PAYMENT_DETAILS_REPORT',
          totalPayoutCents: 1234,
          payoutReferenceId: 'payout-1',
        }),
      ])
      .mockResolvedValueOnce([
        row({
          documentStableId: 'summary-doc',
          evidenceKind: 'UBER_PAYOUT_SUMMARY_REPORT',
          totalPayoutCents: 1234,
          payoutReferenceId: 'payout-1',
        }),
      ]);
    const service = new AccountingUberReportingReconciliationService({
      accountingProviderFinancialDocument: { findMany },
    } as never);

    await expect(
      service.reconcileReportPair({
        paymentDetailsReportStableId: 'payment-report',
        payoutSummaryReportStableId: 'summary-report',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-25',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'MATCHED',
        reportTotalDeltaCents: 0,
        issues: [],
      }),
    );

    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          providerDocumentRef: { startsWith: 'payment-report:' },
        }) as unknown,
      }),
    );
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          providerDocumentRef: { startsWith: 'summary-report:' },
        }) as unknown,
      }),
    );
  });

  it('uses the current parser SUCCESS parse-run for an immutable v12 document', async () => {
    const paymentCurrentMetadata = reportMetadata({
      evidenceKind: 'UBER_PAYMENT_DETAILS_REPORT',
      totalPayoutCents: 1234,
      payoutReferenceId: 'payout-1',
    });
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        row({
          documentStableId: 'payment-doc-v12',
          evidenceKind: 'UBER_PAYMENT_DETAILS_REPORT',
          totalPayoutCents: 1234,
          payoutReferenceId: 'payout-1',
          parserVersion: '12',
          rawMetadata: {
            evidenceKind: 'UBER_PAYMENT_DETAILS_REPORT',
            payoutReferences: ['payout-1'],
          },
          currentParseMetadata: paymentCurrentMetadata,
        }),
      ])
      .mockResolvedValueOnce([
        row({
          documentStableId: 'summary-doc-v13',
          evidenceKind: 'UBER_PAYOUT_SUMMARY_REPORT',
          totalPayoutCents: 1234,
          payoutReferenceId: 'payout-1',
        }),
      ]);
    const service = new AccountingUberReportingReconciliationService({
      accountingProviderFinancialDocument: { findMany },
    } as never);

    await expect(
      service.reconcileReportPair({
        paymentDetailsReportStableId: 'payment-report',
        payoutSummaryReportStableId: 'summary-report',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-25',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'MATCHED',
        issues: [],
      }),
    );
  });

  it('fails closed when only stale document metadata exists without a current parse-run', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        row({
          documentStableId: 'payment-doc-v12',
          evidenceKind: 'UBER_PAYMENT_DETAILS_REPORT',
          totalPayoutCents: 1234,
          payoutReferenceId: 'payout-1',
          parserVersion: '12',
          rawMetadata: {
            evidenceKind: 'UBER_PAYMENT_DETAILS_REPORT',
            payoutReferences: ['payout-1'],
          },
        }),
      ])
      .mockResolvedValueOnce([
        row({
          documentStableId: 'summary-doc',
          evidenceKind: 'UBER_PAYOUT_SUMMARY_REPORT',
          totalPayoutCents: 1234,
          payoutReferenceId: 'payout-1',
        }),
      ]);
    const service = new AccountingUberReportingReconciliationService({
      accountingProviderFinancialDocument: { findMany },
    } as never);

    await expect(
      service.reconcileReportPair({
        paymentDetailsReportStableId: 'payment-report',
        payoutSummaryReportStableId: 'summary-report',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-25',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'INCOMPLETE',
        issues: expect.arrayContaining([
          'PAYMENT_DETAILS_EVIDENCE_KIND_MISMATCH',
          'PAYMENT_DETAILS_REPORT_TOTAL_INVALID',
          'PAYMENT_DETAILS_UNREFERENCED_PAYOUT_CONTROL_INVALID',
        ]) as unknown,
      }),
    );
  });

  it('fails closed when persisted parser metadata is incomplete', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        row({
          documentStableId: 'payment-doc',
          evidenceKind: 'UBER_PAYMENT_DETAILS_REPORT',
          totalPayoutCents: 1234,
          payoutReferenceId: 'payout-1',
          rawMetadata: { evidenceKind: 'UBER_PAYMENT_DETAILS_REPORT' },
        }),
      ])
      .mockResolvedValueOnce([
        row({
          documentStableId: 'summary-doc',
          evidenceKind: 'UBER_PAYOUT_SUMMARY_REPORT',
          totalPayoutCents: 1234,
          payoutReferenceId: 'payout-1',
        }),
      ]);
    const service = new AccountingUberReportingReconciliationService({
      accountingProviderFinancialDocument: { findMany },
    } as never);

    await expect(
      service.reconcileReportPair({
        paymentDetailsReportStableId: 'payment-report',
        payoutSummaryReportStableId: 'summary-report',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-25',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'INCOMPLETE',
        issues: expect.arrayContaining([
          'PAYMENT_DETAILS_REPORT_TOTAL_INVALID',
          'PAYMENT_DETAILS_UNREFERENCED_PAYOUT_CONTROL_INVALID',
        ]) as unknown,
      }),
    );
  });

  it('fails closed when persisted report periods do not match the requested pair', async () => {
    const payment = row({
      documentStableId: 'payment-doc',
      evidenceKind: 'UBER_PAYMENT_DETAILS_REPORT',
      totalPayoutCents: 1234,
      payoutReferenceId: 'payout-1',
    });
    const summary = row({
      documentStableId: 'summary-doc',
      evidenceKind: 'UBER_PAYOUT_SUMMARY_REPORT',
      totalPayoutCents: 1234,
      payoutReferenceId: 'payout-1',
    });
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([payment])
      .mockResolvedValueOnce([summary]);
    const service = new AccountingUberReportingReconciliationService({
      accountingProviderFinancialDocument: { findMany },
    } as never);

    await expect(
      service.reconcileReportPair({
        paymentDetailsReportStableId: 'payment-report',
        payoutSummaryReportStableId: 'summary-report',
        periodStart: '2026-09-02',
        periodEnd: '2026-09-25',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'INCOMPLETE',
        issues: ['REQUEST_PERIOD_MISMATCH'],
      }),
    );
  });
});
