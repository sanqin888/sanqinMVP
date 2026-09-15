import {
  AccountingArtifactAcquisitionMode,
  AccountingFinancialProvider,
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
} from '@prisma/client';
import { normalizeAccountingInboxClassificationSelection } from './accounting-inbox-core.policy';
import {
  ACCOUNTING_INBOX_CLASSIFIER_ACTOR,
  confirmOtherInboxItemInTx,
  setInboxClassificationInTx,
  suggestInboxClassificationInTx,
} from './accounting-inbox-classification.writer';

describe('Accounting Inbox classification writer', () => {
  const makeTx = () => ({
    accountingSourceArtifact: {
      findUnique: jest.fn(),
    },
    accountingInboxItem: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    accountingAuditLog: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
  });

  it('stores a system provider suggestion without materializing evidence', async () => {
    const tx = makeTx();
    tx.accountingSourceArtifact.findUnique.mockResolvedValue({
      inboxItem: {
        id: 'inbox-db-id',
        inboxItemStableId: 'acctinbox_1',
        status: AccountingInboxStatus.PENDING_REVIEW,
        classification: AccountingInboxClassification.UNKNOWN,
        selectedProvider: null,
        materializedEntityType: null,
        materializedEntityStableId: null,
      },
    });

    await expect(
      suggestInboxClassificationInTx(
        tx as never,
        'acctart_1',
        normalizeAccountingInboxClassificationSelection({
          classification:
            AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
          selectedProvider: AccountingFinancialProvider.UBER_EATS,
        }),
      ),
    ).resolves.toEqual({
      inboxItemStableId: 'acctinbox_1',
      classification: AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
      selectedProvider: AccountingFinancialProvider.UBER_EATS,
      applied: true,
    });
    expect(tx.accountingInboxItem.update).toHaveBeenCalledWith({
      where: { id: 'inbox-db-id' },
      data: {
        classification:
          AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
        selectedProvider: AccountingFinancialProvider.UBER_EATS,
        version: { increment: 1 },
      },
    });
    expect(tx.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'SUGGEST_CLASSIFICATION',
        operatorUserId: ACCOUNTING_INBOX_CLASSIFIER_ACTOR,
      }) as unknown,
    });
  });

  it('does not reapply a machine suggestion after an operator explicitly reset the item to unknown', async () => {
    const tx = makeTx();
    tx.accountingSourceArtifact.findUnique.mockResolvedValue({
      inboxItem: {
        id: 'inbox-db-id',
        inboxItemStableId: 'acctinbox_1',
        status: AccountingInboxStatus.PENDING_REVIEW,
        classification: AccountingInboxClassification.UNKNOWN,
        selectedProvider: null,
        materializedEntityType: null,
        materializedEntityStableId: null,
      },
    });
    tx.accountingAuditLog.findFirst.mockResolvedValue({ id: 'audit-db-id' });

    await expect(
      suggestInboxClassificationInTx(
        tx as never,
        'acctart_1',
        normalizeAccountingInboxClassificationSelection({
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
        }),
      ),
    ).resolves.toEqual({
      inboxItemStableId: 'acctinbox_1',
      classification: AccountingInboxClassification.UNKNOWN,
      selectedProvider: null,
      applied: false,
    });
    expect(tx.accountingInboxItem.update).not.toHaveBeenCalled();
  });

  it('lets an operator override a machine provider suggestion before materialization', async () => {
    const tx = makeTx();
    tx.accountingInboxItem.findUnique.mockResolvedValue({
      id: 'inbox-db-id',
      status: AccountingInboxStatus.PENDING_REVIEW,
      classification: AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
      selectedProvider: AccountingFinancialProvider.UBER_EATS,
      materializedEntityType: null,
      materializedEntityStableId: null,
      artifact: {
        acquisitionMode: AccountingArtifactAcquisitionMode.MANUAL_UPLOAD,
      },
    });

    await expect(
      setInboxClassificationInTx(
        tx as never,
        'acctinbox_1',
        normalizeAccountingInboxClassificationSelection({
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
        }),
        'user_operator_1',
      ),
    ).resolves.toEqual({
      inboxItemStableId: 'acctinbox_1',
      classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
      selectedProvider: null,
      changed: true,
    });
    expect(tx.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CLASSIFY',
        beforeJson: {
          classification:
            AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
          selectedProvider: AccountingFinancialProvider.UBER_EATS,
        },
        afterJson: {
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
          selectedProvider: null,
        },
        operatorUserId: 'user_operator_1',
      }) as unknown,
    });
  });

  it('does not allow operator reclassification after evidence is materialized', async () => {
    const tx = makeTx();
    tx.accountingInboxItem.findUnique.mockResolvedValue({
      id: 'inbox-db-id',
      status: AccountingInboxStatus.PENDING_REVIEW,
      classification: AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
      selectedProvider: AccountingFinancialProvider.CLOVER,
      materializedEntityType:
        AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT,
      materializedEntityStableId: 'acctfindoc_1',
      artifact: {
        acquisitionMode: AccountingArtifactAcquisitionMode.MANUAL_UPLOAD,
      },
    });

    await expect(
      setInboxClassificationInTx(
        tx as never,
        'acctinbox_1',
        normalizeAccountingInboxClassificationSelection({
          classification: AccountingInboxClassification.EXPENSE_DOCUMENT,
        }),
        'user_operator_1',
      ),
    ).rejects.toThrow('materialized inbox evidence cannot be reclassified');
    expect(tx.accountingInboxItem.update).not.toHaveBeenCalled();
  });

  it('can close explicitly reviewed other evidence without creating a materialized entity', async () => {
    const tx = makeTx();
    tx.accountingInboxItem.findUnique.mockResolvedValue({
      id: 'inbox-db-id',
      status: AccountingInboxStatus.PENDING_REVIEW,
      classification: AccountingInboxClassification.OTHER_DOCUMENT,
      selectedProvider: null,
      materializedEntityType: null,
      materializedEntityStableId: null,
      artifact: {
        acquisitionMode: AccountingArtifactAcquisitionMode.MANUAL_UPLOAD,
      },
    });

    await expect(
      confirmOtherInboxItemInTx(tx as never, 'acctinbox_1', 'user_operator_1'),
    ).resolves.toEqual({
      inboxItemStableId: 'acctinbox_1',
      confirmed: true,
      replayed: false,
    });
    expect(tx.accountingInboxItem.update).toHaveBeenCalledWith({
      where: { id: 'inbox-db-id' },
      data: {
        status: AccountingInboxStatus.CONFIRMED,
        reviewedAt: expect.any(Date) as unknown,
        reviewedByUserStableId: 'user_operator_1',
        version: { increment: 1 },
      },
    });
  });
});
