import {
  AccountingArtifactAcquisitionMode,
  AccountingArtifactKind,
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingInboxStatus,
  AccountingInboxTrustDecision,
} from '@prisma/client';
import { AccountingOperationsService } from './accounting-operations.service';

const input = {
  artifactStableId: 'acctart_corrected',
  provider: AccountingFinancialProvider.CLOVER,
  documentType: AccountingFinancialDocumentType.STATEMENT,
  businessIdentityKey: 'clover:statement:2026-08',
  storeStableId: '4750_Yonge_Street',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  parserName: 'clover-statement',
  parserVersion: 'v1',
  lines: [
    {
      component: AccountingFinancialComponent.PROCESSING_FEE,
      postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
      amountCents: 1250,
    },
  ],
};

describe('AccountingOperationsService unified Inbox characterization', () => {
  it('retries one corrected-statement revision race after a P2002 conflict', async () => {
    const artifact = {
      id: 'artifact-db-corrected',
      contentHash: 'b'.repeat(64),
      inboxItem: {
        id: 'inbox-db-corrected',
        status: AccountingInboxStatus.PENDING_REVIEW,
      },
    };
    const tx = {
      accountingSourceArtifact: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(artifact)
          .mockResolvedValueOnce({ contentHash: 'b'.repeat(64) })
          .mockResolvedValueOnce(artifact),
      },
      accountingProviderFinancialDocument: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'statement-db-v1',
            documentStableId: 'acctfindoc_v1',
            revision: 1,
            provider: AccountingFinancialProvider.CLOVER,
            documentType: AccountingFinancialDocumentType.STATEMENT,
            artifact: { contentHash: 'a'.repeat(64) },
          })
          .mockResolvedValueOnce({
            documentStableId: 'acctfindoc_competing_v2',
            revision: 2,
            provider: AccountingFinancialProvider.CLOVER,
            documentType: AccountingFinancialDocumentType.STATEMENT,
            artifact: { contentHash: 'c'.repeat(64) },
          })
          .mockResolvedValueOnce({
            id: 'statement-db-v2',
            documentStableId: 'acctfindoc_competing_v2',
            revision: 2,
            provider: AccountingFinancialProvider.CLOVER,
            documentType: AccountingFinancialDocumentType.STATEMENT,
            artifact: { contentHash: 'c'.repeat(64) },
          }),
        create: jest
          .fn()
          .mockRejectedValueOnce({ code: 'P2002' })
          .mockResolvedValueOnce({}),
      },
      accountingInboxItem: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (work: (transactionClient: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    const service = new AccountingOperationsService(
      prisma as never,
      {} as never,
    );

    const result = await service.recordProviderFinancialDocument(input);

    expect(result).toEqual(
      expect.objectContaining({
        provider: AccountingFinancialProvider.CLOVER,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        revision: 3,
        replayed: false,
      }),
    );
    expect(tx.accountingProviderFinancialDocument.create).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('keeps untrusted EMAIL artifacts quarantined before later classification', async () => {
    const tx = {
      accountingSourceArtifact: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'artifact-db-id',
          artifactStableId: 'acctart_new',
        }),
      },
      accountingInboxItem: {
        create: jest.fn().mockResolvedValue({
          inboxItemStableId: 'acctinbox_new',
          status: AccountingInboxStatus.QUARANTINED,
          classification: 'UNKNOWN',
          duplicateOfArtifact: null,
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (work: (transactionClient: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    const service = new AccountingOperationsService(
      prisma as never,
      {} as never,
    );

    await service.registerInboxArtifact({
      acquisitionMode: AccountingArtifactAcquisitionMode.EMAIL,
      kind: AccountingArtifactKind.EMAIL_BODY,
      transportIdentity: 'gmail:message-1:body',
      contentHash: 'd'.repeat(64),
      bodyText: 'Daily Closeout',
      senderEmail: 'unknown@example.com',
      trustDecision: AccountingInboxTrustDecision.UNTRUSTED,
    });

    expect(tx.accountingInboxItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AccountingInboxStatus.QUARANTINED,
        }) as unknown,
      }) as unknown,
    );
  });
});
