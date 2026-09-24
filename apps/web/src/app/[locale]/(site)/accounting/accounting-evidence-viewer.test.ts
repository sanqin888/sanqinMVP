import {
  accountingEvidenceBrowserPreviewMode,
  accountingEvidenceCanPermanentDelete,
  accountingEvidenceContentUrl,
  accountingEvidenceDownloadUrl,
  accountingEvidencePermanentDeleteUrl,
  type AccountingEvidenceSource,
} from './accounting-evidence-viewer';

const baseEvidence: AccountingEvidenceSource = {
  artifactStableId: 'acctart_1',
  filename: 'statement.pdf',
  kind: 'PDF',
};

describe('AccountingEvidenceViewer capability helpers', () => {
  it('uses a dedicated image preview path instead of the PDF iframe path', () => {
    expect(accountingEvidenceBrowserPreviewMode('IMAGE')).toBe('IMAGE');
    expect(accountingEvidenceBrowserPreviewMode('PDF')).toBe('PDF');
    expect(accountingEvidenceBrowserPreviewMode('CSV')).toBeNull();
  });

  it('keeps delete disabled without an explicit permanent-delete capability', () => {
    expect(accountingEvidenceCanPermanentDelete(baseEvidence)).toBe(false);
    expect(
      accountingEvidenceCanPermanentDelete({
        ...baseEvidence,
        deletion: {
          inboxItemStableId: 'acctinbox_1',
          canPermanentDelete: false,
        },
      }),
    ).toBe(false);
  });

  it('enables delete only for an explicit deletable inbox item', () => {
    expect(
      accountingEvidenceCanPermanentDelete({
        ...baseEvidence,
        deletion: {
          inboxItemStableId: 'acctinbox_1',
          canPermanentDelete: true,
        },
      }),
    ).toBe(true);
  });

  it('encodes stable identifiers in viewer delivery and delete URLs', () => {
    expect(accountingEvidenceContentUrl('acctart/a b')).toBe(
      '/api/v1/accounting/inbox/artifacts/acctart%2Fa%20b/content',
    );
    expect(accountingEvidenceDownloadUrl('acctart/a b')).toBe(
      '/api/v1/accounting/inbox/artifacts/acctart%2Fa%20b/download',
    );
    expect(accountingEvidencePermanentDeleteUrl('acctinbox/a b')).toBe(
      '/accounting/inbox/manual-uploads/acctinbox%2Fa%20b/permanent',
    );
  });
});
