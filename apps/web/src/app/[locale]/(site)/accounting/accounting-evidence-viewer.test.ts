import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  accountingEvidenceBrowserPreviewMode,
  accountingEvidenceCanPermanentDelete,
  accountingEvidenceContentUrl,
  accountingEvidenceDownloadUrl,
  accountingEvidencePermanentDeleteUrl,
  type AccountingEvidenceSource,
} from './accounting-evidence-viewer';

const viewerSource = readFileSync(
  resolve(__dirname, 'accounting-evidence-viewer.tsx'),
  'utf8',
);
const previewSurfaceSource = readFileSync(
  resolve(__dirname, 'accounting-evidence-preview-surface.tsx'),
  'utf8',
);

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

  it('reuses the shared preview surface and renders protected images through the stable same-origin route', () => {
    expect(viewerSource).toContain('AccountingEvidencePreviewSurface');
    expect(previewSurfaceSource).toContain('src={url}');
    expect(previewSurfaceSource).toContain('onError={() => setFailed(true)}');
    expect(previewSurfaceSource).not.toContain('URL.createObjectURL');
    expect(previewSurfaceSource).not.toContain('response.blob()');
    expect(previewSurfaceSource).not.toContain("from 'next/image'");
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
