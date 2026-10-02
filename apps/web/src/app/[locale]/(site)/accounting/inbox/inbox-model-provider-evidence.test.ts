import type { AccountingInboxItem } from '../contracts/inbox';
import {
  isProviderSupportingEvidence,
  providerEvidenceSummaryLines,
  validatedProviderFinancialDocumentType,
} from './inbox-model';

function providerItem(
  documentType: 'BATCH_CONTROL' | 'STATEMENT' | 'API_REPORT' | 'OTHER',
): AccountingInboxItem {
  return {
    inboxItemStableId: 'acctinbox_provider',
    status: 'PENDING_REVIEW',
    classification: 'PROVIDER_FINANCIAL_DOCUMENT',
    selectedProvider: 'CLOVER',
    trustDecision: 'TRUSTED',
    materializedEntityType: 'PROVIDER_FINANCIAL_DOCUMENT',
    materializedEntityStableId: 'acctfindoc_provider',
    expenseEvidenceReadiness: { status: 'READY', reason: 'FILE_SOURCE' },
    expenseEvidenceSource: null,
    createdAt: '2026-09-27T04:00:00.000Z',
    artifact: {
      artifactStableId: 'acctart_provider',
      acquisitionMode: 'EMAIL',
      kind: 'PDF',
      originalFilename: 'provider.pdf',
      storedUrl: '/api/v1/accounting/files/inbox/provider.pdf',
      bodyText: null,
      senderEmail: 'provider@example.com',
      emailSubject: 'Provider evidence',
      parseRuns: [],
      financialDocument: {
        documentStableId: 'acctfindoc_provider',
        provider: 'CLOVER',
        documentType,
        revision: 1,
        storeStableId: '4750_Yonge_Street',
        providerMerchantRef: 'merchant-1',
        providerDocumentRef: 'document-1',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-01',
        settledAt: null,
        payoutAt: null,
        currency: 'CAD',
        parserName: 'accounting-provider-financial',
        parserVersion: '11',
        lines: [
          {
            lineStableId: 'line_other',
            lineNo: 1,
            rawName: 'Other',
            component: 'OTHER',
            postingTreatment: 'RECONCILIATION_ONLY',
            taxRole: 'NONE',
            amountCents: 100,
            occurredAt: null,
          },
          {
            lineStableId: 'line_commission',
            lineNo: 2,
            rawName: 'Commission',
            component: 'COMMISSION',
            postingTreatment: 'RECONCILIATION_ONLY',
            taxRole: 'NONE',
            amountCents: -200,
            occurredAt: null,
          },
          {
            lineStableId: 'line_tip',
            lineNo: 3,
            rawName: 'Tips',
            component: 'TIP',
            postingTreatment: 'RECONCILIATION_ONLY',
            taxRole: 'NONE',
            amountCents: 300,
            occurredAt: null,
          },
          {
            lineStableId: 'line_tax',
            lineNo: 4,
            rawName: 'Tax',
            component: 'SALES_TAX',
            postingTreatment: 'RECONCILIATION_ONLY',
            taxRole: 'SALES_TAX',
            amountCents: 400,
            occurredAt: null,
          },
          {
            lineStableId: 'line_refund',
            lineNo: 5,
            rawName: 'Refunds',
            component: 'REFUND',
            postingTreatment: 'RECONCILIATION_ONLY',
            taxRole: 'NONE',
            amountCents: 0,
            occurredAt: null,
          },
          {
            lineStableId: 'line_sales',
            lineNo: 6,
            rawName: 'Sales',
            component: 'SALES',
            postingTreatment: 'RECONCILIATION_ONLY',
            taxRole: 'NONE',
            amountCents: 1_000,
            occurredAt: null,
          },
          {
            lineStableId: 'line_payout',
            lineNo: 7,
            rawName: 'Total payout',
            component: 'PAYOUT',
            postingTreatment: 'CONTROL_TOTAL',
            taxRole: 'NONE',
            amountCents: 1_500,
            occurredAt: null,
          },
        ],
      },
    },
  };
}

describe('Accounting Inbox provider supporting-evidence model', () => {
  it('treats every validated non-statement provider document as supporting evidence', () => {
    expect(isProviderSupportingEvidence('BATCH_CONTROL')).toBe(true);
    expect(isProviderSupportingEvidence('API_REPORT')).toBe(true);
    expect(isProviderSupportingEvidence('OTHER')).toBe(true);
    expect(isProviderSupportingEvidence('STATEMENT')).toBe(false);
    expect(isProviderSupportingEvidence(null)).toBe(false);
  });

  it('uses the materialized provider document type as the validated UX authority', () => {
    const item = providerItem('BATCH_CONTROL');
    expect(validatedProviderFinancialDocumentType(item, {})).toBe(
      'BATCH_CONTROL',
    );
  });

  it('prioritizes key control and economic lines when a supporting document has many lines', () => {
    const item = providerItem('API_REPORT');
    const lines = providerEvidenceSummaryLines(item, {}, 3);
    expect(lines.map((line) => line.component)).toEqual([
      'PAYOUT',
      'SALES',
      'SALES_TAX',
    ]);
  });
});
