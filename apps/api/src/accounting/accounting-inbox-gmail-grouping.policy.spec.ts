import {
  AccountingArtifactAcquisitionMode,
  AccountingArtifactKind,
  AccountingInboxClassification,
  AccountingInboxStatus,
} from '@prisma/client';
import {
  accountingGmailGroupRequiresSeparateReview,
  accountingGmailMessageId,
  groupAccountingInboxByGmailMessage,
  selectAccountingGmailPrimaryExpenseSource,
} from './accounting-inbox-gmail-grouping.policy';

function row(input: {
  inboxItemStableId: string;
  gmailMessageId?: string | null;
  kind: AccountingArtifactKind;
  classification?: AccountingInboxClassification;
  storedUrl?: string | null;
  resultJson?: Record<string, unknown>;
}) {
  return {
    inboxItemStableId: input.inboxItemStableId,
    status: AccountingInboxStatus.PENDING_REVIEW,
    classification:
      input.classification ?? AccountingInboxClassification.UNKNOWN,
    selectedProvider: null,
    materializedEntityType: null,
    materializedEntityStableId: null,
    artifact: {
      acquisitionMode: AccountingArtifactAcquisitionMode.EMAIL,
      kind: input.kind,
      storedUrl: input.storedUrl ?? null,
      metadataJson: {
        gmailMessageId: input.gmailMessageId ?? null,
      },
      parseRuns: [{ resultJson: input.resultJson ?? {} }],
    },
  };
}

describe('Accounting Gmail Inbox grouping', () => {
  it('groups one email body and one PDF into one Inbox work item and prefers the PDF as expense source', () => {
    const body = row({
      inboxItemStableId: 'acctinbox_body',
      gmailMessageId: 'gmail-grease-september',
      kind: AccountingArtifactKind.EMAIL_BODY,
    });
    const pdf = row({
      inboxItemStableId: 'acctinbox_pdf',
      gmailMessageId: 'gmail-grease-september',
      kind: AccountingArtifactKind.PDF,
      storedUrl: '/api/v1/accounting/files/inbox/grease.pdf',
      resultJson: {
        reviewDisposition: 'UNRECOGNIZED',
        financialConsistency: 'INSUFFICIENT',
        date: '2026-09-30',
      },
    });

    const groups = groupAccountingInboxByGmailMessage([body, pdf]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(
      expect.objectContaining({
        gmailMessageId: 'gmail-grease-september',
        representative: pdf,
        members: [body, pdf],
        primaryExpenseSource: pdf,
        primaryExpenseSourceAmbiguous: false,
      }),
    );
  });

  it('keeps an already classified Expense body as representative while using its PDF attachment as primary evidence', () => {
    const body = row({
      inboxItemStableId: 'acctinbox_body',
      gmailMessageId: 'gmail-grease-august',
      kind: AccountingArtifactKind.EMAIL_BODY,
      classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
    });
    const pdf = row({
      inboxItemStableId: 'acctinbox_pdf',
      gmailMessageId: 'gmail-grease-august',
      kind: AccountingArtifactKind.PDF,
      storedUrl: '/api/v1/accounting/files/inbox/grease-august.pdf',
    });

    const [group] = groupAccountingInboxByGmailMessage([body, pdf]);

    expect(group?.representative).toBe(body);
    expect(group?.primaryExpenseSource).toBe(pdf);
    expect(group?.primaryExpenseSourceAmbiguous).toBe(false);
  });

  it('does not merge unrelated Gmail messages', () => {
    const groups = groupAccountingInboxByGmailMessage([
      row({
        inboxItemStableId: 'acctinbox_1',
        gmailMessageId: 'gmail-1',
        kind: AccountingArtifactKind.EMAIL_BODY,
      }),
      row({
        inboxItemStableId: 'acctinbox_2',
        gmailMessageId: 'gmail-2',
        kind: AccountingArtifactKind.PDF,
        storedUrl: '/api/v1/accounting/files/inbox/2.pdf',
      }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it('fails closed when multiple attachments have equal expense-source evidence strength', () => {
    const first = row({
      inboxItemStableId: 'acctinbox_pdf_1',
      gmailMessageId: 'gmail-multi',
      kind: AccountingArtifactKind.PDF,
      storedUrl: '/api/v1/accounting/files/inbox/1.pdf',
    });
    const second = row({
      inboxItemStableId: 'acctinbox_pdf_2',
      gmailMessageId: 'gmail-multi',
      kind: AccountingArtifactKind.PDF,
      storedUrl: '/api/v1/accounting/files/inbox/2.pdf',
    });

    expect(selectAccountingGmailPrimaryExpenseSource([first, second])).toEqual({
      source: null,
      ambiguous: true,
    });
  });

  it('keeps Provider Financial evidence on the existing independent review path', () => {
    const body = row({
      inboxItemStableId: 'acctinbox_provider_body',
      gmailMessageId: 'gmail-provider',
      kind: AccountingArtifactKind.EMAIL_BODY,
      classification:
        AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
    });
    const pdf = row({
      inboxItemStableId: 'acctinbox_provider_pdf',
      gmailMessageId: 'gmail-provider',
      kind: AccountingArtifactKind.PDF,
      storedUrl: '/api/v1/accounting/files/inbox/provider.pdf',
    });
    const [group] = groupAccountingInboxByGmailMessage([body, pdf]);

    expect(group).toBeDefined();
    expect(accountingGmailGroupRequiresSeparateReview(group!)).toBe(true);
  });

  it('reads gmailMessageId only from object metadata', () => {
    expect(accountingGmailMessageId({ gmailMessageId: ' message-1 ' })).toBe(
      'message-1',
    );
    expect(accountingGmailMessageId(null)).toBeNull();
    expect(accountingGmailMessageId([])).toBeNull();
    expect(accountingGmailMessageId({ gmailMessageId: 123 })).toBeNull();
  });
});
