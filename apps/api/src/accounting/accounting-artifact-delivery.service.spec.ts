import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  AccountingArtifactBinaryRetentionState,
  AccountingArtifactKind,
} from './accounting-contracts';
import {
  AccountingArtifactDeliveryService,
  accountingArtifactContentDisposition,
  accountingArtifactContentUrl,
  accountingArtifactDownloadUrl,
} from './accounting-artifact-delivery.service';

describe('AccountingArtifactDeliveryService', () => {
  const previousUploadRoot = process.env.UPLOAD_ROOT;
  let uploadRoot: string;

  beforeEach(() => {
    uploadRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sanq-accounting-artifact-delivery-'),
    );
    process.env.UPLOAD_ROOT = uploadRoot;
    fs.mkdirSync(path.join(uploadRoot, 'accounting', 'inbox'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(uploadRoot, 'accounting', 'image-retention'), {
      recursive: true,
    });
  });

  afterEach(() => {
    fs.rmSync(uploadRoot, { recursive: true, force: true });
    if (previousUploadRoot === undefined) delete process.env.UPLOAD_ROOT;
    else process.env.UPLOAD_ROOT = previousUploadRoot;
  });

  it('resolves a stored PDF through the artifact stable-id boundary', async () => {
    const pdfPath = path.join(
      uploadRoot,
      'accounting',
      'inbox',
      'statement.pdf',
    );
    fs.writeFileSync(pdfPath, Buffer.from('%PDF-1.7\n'));

    const inbox = {
      readArtifactContentContext: jest.fn().mockResolvedValue({
        artifactStableId: 'acctart_pdf_1',
        kind: AccountingArtifactKind.PDF,
        mimeType: 'application/pdf',
        originalFilename: 'Uber July 2026.pdf',
        storedUrl: '/api/v1/accounting/files/inbox/statement.pdf',
        binaryRetention: null,
      }),
    };
    const service = new AccountingArtifactDeliveryService(inbox as never);

    await expect(
      service.resolveArtifactContent('acctart_pdf_1'),
    ).resolves.toEqual({
      filePath: pdfPath,
      mimeType: 'application/pdf',
      filename: 'Uber July 2026.pdf',
      retainedDerivative: false,
    });
    expect(inbox.readArtifactContentContext).toHaveBeenCalledWith(
      'acctart_pdf_1',
    );
  });

  it('serves the accepted retained image instead of a purged original', async () => {
    const retainedPath = path.join(
      uploadRoot,
      'accounting',
      'image-retention',
      'accepted.webp',
    );
    fs.writeFileSync(retainedPath, Buffer.from('retained-image'));

    const inbox = {
      readArtifactContentContext: jest.fn().mockResolvedValue({
        artifactStableId: 'acctart_image_1',
        kind: AccountingArtifactKind.IMAGE,
        mimeType: 'image/jpeg',
        originalFilename: 'receipt.jpg',
        storedUrl: '/api/v1/accounting/files/inbox/original.jpg',
        binaryRetention: {
          state: AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY,
          retainedStoredUrl:
            '/api/v1/accounting/files/image-retention/accepted.webp',
          retainedMimeType: 'image/webp',
        },
      }),
    };
    const service = new AccountingArtifactDeliveryService(inbox as never);

    await expect(
      service.resolveArtifactContent('acctart_image_1'),
    ).resolves.toEqual({
      filePath: retainedPath,
      mimeType: 'image/webp',
      filename: 'receipt-retained.webp',
      retainedDerivative: true,
    });
  });

  it('rejects a stored URL outside the Accounting artifact directories', async () => {
    const inbox = {
      readArtifactContentContext: jest.fn().mockResolvedValue({
        artifactStableId: 'acctart_bad_1',
        kind: AccountingArtifactKind.PDF,
        mimeType: 'application/pdf',
        originalFilename: 'statement.pdf',
        storedUrl: '/api/v1/accounting/files/bills/statement.pdf',
        binaryRetention: null,
      }),
    };
    const service = new AccountingArtifactDeliveryService(inbox as never);

    await expect(
      service.resolveArtifactContent('acctart_bad_1'),
    ).rejects.toThrow('accounting evidence path is invalid');
  });

  it('builds stable content/download URLs and safe content-disposition headers', () => {
    expect(accountingArtifactContentUrl('acctart/a b')).toBe(
      '/api/v1/accounting/inbox/artifacts/acctart%2Fa%20b/content',
    );
    expect(accountingArtifactDownloadUrl('acctart/a b')).toBe(
      '/api/v1/accounting/inbox/artifacts/acctart%2Fa%20b/download',
    );

    const header = accountingArtifactContentDisposition(
      'attachment',
      '饭团"\r\nJuly.xlsx',
    );
    expect(header).toContain('attachment;');
    expect(header).not.toContain('\r');
    expect(header).not.toContain('\n');
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain('%E9%A5%AD%E5%9B%A2');
  });
});
