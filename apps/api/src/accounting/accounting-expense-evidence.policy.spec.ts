import {
  AccountingArtifactAcquisitionMode,
  AccountingArtifactKind,
  AccountingInboxClassification,
  AccountingInboxStatus,
} from './accounting-contracts';
import {
  assessAccountingExpenseEvidenceReadiness,
  isAccountingBillNotificationOnlyText,
} from './accounting-expense-evidence.policy';

describe('accounting expense evidence readiness', () => {
  it('recognizes the observed Metergy e-bill notification as source-document incomplete', () => {
    const bodyText = [
      'Your monthly bill is now ready to view',
      'Total Balance Due:',
      'Date Due:',
      '$247.57',
      '2026-10-13',
      'Thank you for pre-authorizing your payment.',
    ].join('\n');

    expect(
      isAccountingBillNotificationOnlyText({
        subject: 'Metergy Solutions - Your e-bill is ready',
        bodyText,
      }),
    ).toBe(true);

    expect(
      assessAccountingExpenseEvidenceReadiness({
        artifact: {
          acquisitionMode: AccountingArtifactAcquisitionMode.EMAIL,
          kind: AccountingArtifactKind.EMAIL_BODY,
          storedUrl: null,
          bodyText,
          emailSubject: 'Metergy Solutions - Your e-bill is ready',
        },
        extraction: {
          date: '2026-10-13',
          totalCents: 24757,
          financialConsistency: 'INSUFFICIENT',
          reviewDisposition: 'LIKELY_BILL',
        },
      }),
    ).toEqual({
      status: 'SUPPLEMENT_REQUIRED',
      reason: 'EMAIL_BILL_NOTIFICATION_ONLY',
    });
  });

  it('keeps a complete body-only invoice eligible when its accounting amounts reconcile', () => {
    expect(
      assessAccountingExpenseEvidenceReadiness({
        artifact: {
          acquisitionMode: AccountingArtifactAcquisitionMode.EMAIL,
          kind: AccountingArtifactKind.EMAIL_BODY,
          storedUrl: null,
          bodyText:
            'Invoice Date: 2026-08-15 Internet service Subtotal $100.00 HST $13.00 Total $113.00',
          emailSubject: 'August invoice',
        },
        extraction: {
          date: '2026-08-15',
          totalCents: 11300,
          financialConsistency: 'MATCHED',
          reviewDisposition: 'LIKELY_BILL',
        },
      }),
    ).toEqual({
      status: 'READY',
      reason: 'STANDALONE_EMAIL_DOCUMENT',
    });
  });

  it('does not require a supplemental file when an email contains a complete reconciled invoice despite notification wording', () => {
    expect(
      assessAccountingExpenseEvidenceReadiness({
        artifact: {
          acquisitionMode: AccountingArtifactAcquisitionMode.EMAIL,
          kind: AccountingArtifactKind.EMAIL_BODY,
          storedUrl: null,
          bodyText:
            'Your invoice is now available below. Invoice Date: 2026-08-15 Subtotal $100.00 HST $13.00 Total $113.00',
          emailSubject: 'Your invoice is available',
        },
        extraction: {
          date: '2026-08-15',
          totalCents: 11300,
          financialConsistency: 'MATCHED',
          reviewDisposition: 'LIKELY_BILL',
        },
      }),
    ).toEqual({
      status: 'READY',
      reason: 'STANDALONE_EMAIL_DOCUMENT',
    });
  });

  it('uses a linked retained file as the expense authority for an incomplete notification email', () => {
    expect(
      assessAccountingExpenseEvidenceReadiness({
        artifact: {
          acquisitionMode: AccountingArtifactAcquisitionMode.EMAIL,
          kind: AccountingArtifactKind.EMAIL_BODY,
          storedUrl: null,
          bodyText: 'Your bill is ready. View your bill online.',
          emailSubject: 'Your bill is ready',
        },
        extraction: {
          totalCents: 24757,
          financialConsistency: 'INSUFFICIENT',
          reviewDisposition: 'LIKELY_BILL',
        },
        linkedSource: {
          status: AccountingInboxStatus.PENDING_REVIEW,
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          selectedProvider: null,
          materializedEntityType: null,
          materializedEntityStableId: null,
          artifact: {
            acquisitionMode: AccountingArtifactAcquisitionMode.MANUAL_UPLOAD,
            kind: AccountingArtifactKind.PDF,
            storedUrl: '/api/v1/accounting/files/inbox/metergy.pdf',
          },
          extraction: {
            requiresBatchExpenseImport: false,
          },
        },
      }),
    ).toEqual({
      status: 'READY',
      reason: 'LINKED_SOURCE_DOCUMENT',
    });
  });

  it('keeps ordinary retained PDF evidence reviewable even when machine extraction is insufficient', () => {
    expect(
      assessAccountingExpenseEvidenceReadiness({
        artifact: {
          acquisitionMode: AccountingArtifactAcquisitionMode.MANUAL_UPLOAD,
          kind: AccountingArtifactKind.PDF,
          storedUrl: '/api/v1/accounting/files/inbox/invoice.pdf',
        },
        extraction: {
          financialConsistency: 'INSUFFICIENT',
          reviewDisposition: 'UNRECOGNIZED',
        },
      }),
    ).toEqual({ status: 'READY', reason: 'FILE_SOURCE' });
  });
});
