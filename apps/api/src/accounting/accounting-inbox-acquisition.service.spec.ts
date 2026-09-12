import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  AccountingArtifactKind,
  AccountingInboxClassification,
  AccountingInboxStatus,
  AccountingInboxTrustDecision,
  AccountingParseStatus,
} from '@prisma/client';
import { AccountingInboxAcquisitionService } from './accounting-inbox-acquisition.service';

function registeredArtifact(kind: AccountingArtifactKind, contentHash: string) {
  return {
    artifactStableId: `acctart_${kind.toLowerCase()}`,
    contentHash,
    kind,
    storedUrl: null,
    inboxItem: {
      inboxItemStableId: 'acctinbox_1',
      status: AccountingInboxStatus.PENDING_REVIEW,
      classification: AccountingInboxClassification.UNKNOWN,
      trustDecision: AccountingInboxTrustDecision.NOT_APPLICABLE,
      materializedEntityType: null,
      materializedEntityStableId: null,
      duplicateOfArtifact: null,
    },
    duplicateOfArtifactStableId: null,
    replayed: false,
  };
}

describe('AccountingInboxAcquisitionService', () => {
  const originalUploadRoot = process.env.UPLOAD_ROOT;
  let uploadRoot: string;

  beforeEach(() => {
    uploadRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'sanq-accounting-inbox-'),
    );
    process.env.UPLOAD_ROOT = uploadRoot;
  });

  afterEach(() => {
    fs.rmSync(uploadRoot, { recursive: true, force: true });
    if (originalUploadRoot === undefined) delete process.env.UPLOAD_ROOT;
    else process.env.UPLOAD_ROOT = originalUploadRoot;
  });

  function makeService() {
    const operations = {
      registerInboxArtifact: jest
        .fn()
        .mockImplementation(
          (input: { kind: AccountingArtifactKind; contentHash: string }) =>
            Promise.resolve(registeredArtifact(input.kind, input.contentHash)),
        ),
      recordInboxParseRun: jest.fn().mockResolvedValue({}),
    };
    return {
      service: new AccountingInboxAcquisitionService(operations as never),
      operations,
    };
  }

  it('sends manual PDF evidence through SourceArtifact and the generic parser', async () => {
    const { service, operations } = makeService();
    const result = await service.acquireManualFile({
      originalname: 'invoice.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%%EOF', 'ascii'),
    });

    expect(result.kind).toBe(AccountingArtifactKind.PDF);
    expect(operations.registerInboxArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: AccountingArtifactKind.PDF,
        trustDecision: AccountingInboxTrustDecision.NOT_APPLICABLE,
        storedUrl: expect.stringMatching(
          /^\/api\/v1\/accounting\/files\/inbox\//,
        ) as unknown,
      }),
    );
    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactStableId: 'acctart_pdf',
      }),
    );
  });

  it('preserves CSV evidence but leaves it for provider-specific parsing', async () => {
    const { service, operations } = makeService();
    await service.acquireManualFile({
      originalname: 'statement.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from('date,total\n2026-06-01,12.34\n', 'utf8'),
    });

    expect(operations.recordInboxParseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactStableId: 'acctart_csv',
        status: AccountingParseStatus.SKIPPED,
        resultJson: {
          inputKind: 'CSV',
          providerParserPending: true,
        },
      }),
    );
  });

  it('quarantines untrusted email evidence without parsing it', async () => {
    const operations = {
      registerInboxArtifact: jest.fn().mockResolvedValue({
        ...registeredArtifact(
          AccountingArtifactKind.EMAIL_BODY,
          'a'.repeat(64),
        ),
        inboxItem: {
          ...registeredArtifact(
            AccountingArtifactKind.EMAIL_BODY,
            'a'.repeat(64),
          ).inboxItem,
          status: AccountingInboxStatus.QUARANTINED,
          trustDecision: AccountingInboxTrustDecision.UNTRUSTED,
        },
      }),
      recordInboxParseRun: jest.fn(),
    };
    const service = new AccountingInboxAcquisitionService(operations as never);

    await service.acquireEmailBody(
      {
        messageId: 'gmail-message-1',
        senderEmail: 'unknown@example.com',
        subject: 'Invoice',
        receivedAt: '2026-09-12T12:00:00.000Z',
      },
      'Invoice total $12.34',
      AccountingInboxTrustDecision.UNTRUSTED,
    );

    expect(operations.recordInboxParseRun).not.toHaveBeenCalled();
  });

  it('returns the original stored URL when the same email attachment transport is replayed', async () => {
    const originalStoredUrl = '/api/v1/accounting/files/inbox/original.pdf';
    const operations = {
      registerInboxArtifact: jest.fn().mockResolvedValue({
        ...registeredArtifact(AccountingArtifactKind.PDF, 'a'.repeat(64)),
        storedUrl: originalStoredUrl,
        replayed: true,
      }),
      recordInboxParseRun: jest.fn(),
    };
    const service = new AccountingInboxAcquisitionService(operations as never);

    const result = await service.acquireEmailAttachment(
      {
        messageId: 'gmail-message-1',
        senderEmail: 'trusted@example.com',
        subject: 'Statement',
        receivedAt: '2026-09-12T12:00:00.000Z',
      },
      'attachment-1',
      {
        originalname: 'statement.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4\n%%EOF', 'ascii'),
      },
      AccountingInboxTrustDecision.TRUSTED,
    );

    expect(result.storedUrl).toBe(originalStoredUrl);
    const inboxDir = path.join(uploadRoot, 'accounting', 'inbox');
    expect(fs.existsSync(inboxDir) ? fs.readdirSync(inboxDir) : []).toEqual([]);
    expect(operations.recordInboxParseRun).toHaveBeenCalled();
  });

  it('uses normalized body content, not Gmail message id, as content identity', async () => {
    const { service, operations } = makeService();
    await service.acquireEmailBody(
      {
        messageId: 'gmail-message-1',
        senderEmail: 'trusted@example.com',
        subject: 'Invoice',
        receivedAt: '2026-09-12T12:00:00.000Z',
      },
      'Invoice total $12.34\r\n',
      AccountingInboxTrustDecision.TRUSTED,
    );
    await service.acquireEmailBody(
      {
        messageId: 'gmail-message-2',
        senderEmail: 'trusted@example.com',
        subject: 'Invoice copy',
        receivedAt: '2026-09-12T12:05:00.000Z',
      },
      'Invoice total $12.34\n',
      AccountingInboxTrustDecision.TRUSTED,
    );

    const calls = operations.registerInboxArtifact.mock.calls as Array<
      [{ contentHash: string; transportIdentity: string }]
    >;
    expect(calls[0][0].transportIdentity).not.toBe(
      calls[1][0].transportIdentity,
    );
    expect(calls[0][0].contentHash).toBe(calls[1][0].contentHash);
  });
});
