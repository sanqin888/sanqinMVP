import {
  AccountingFinancialDocumentType,
  AccountingFinancialProvider,
  AccountingProviderRecognitionMatchMode,
} from '@prisma/client';
import { upsertAccountingProviderRecognitionRuleInTx } from './accounting-provider-recognition.writer';

describe('Accounting provider recognition writer', () => {
  const makeTx = () => ({
    accountingProviderRecognitionRule: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    accountingAuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  });

  it('creates the first override as version 2 and audits the default-to-override change', async () => {
    const tx = makeTx();
    tx.accountingProviderRecognitionRule.findUnique.mockResolvedValue(null);
    tx.accountingProviderRecognitionRule.upsert.mockResolvedValue({
      ruleStableId: 'acct_recognition_uber_monthly_statement',
      provider: AccountingFinancialProvider.UBER_EATS,
      documentType: AccountingFinancialDocumentType.STATEMENT,
      requiredKeywords: ['Monthly Statement'],
      optionalKeywords: ['Marketplace Fees'],
      optionalMatchMode: AccountingProviderRecognitionMatchMode.ANY,
      priority: 25,
      isActive: true,
      version: 2,
      updatedByUserStableId: 'user_1',
    });

    const result = await upsertAccountingProviderRecognitionRuleInTx(
      tx as never,
      'acct_recognition_uber_monthly_statement',
      {
        requiredKeywords: ['Monthly Statement'],
        optionalKeywords: ['Marketplace Fees'],
        optionalMatchMode: AccountingProviderRecognitionMatchMode.ANY,
        priority: 25,
        isActive: true,
      },
      'user_1',
    );

    expect(result).toEqual(
      expect.objectContaining({
        version: 2,
        persisted: true,
        changed: true,
      }) as unknown,
    );
    expect(tx.accountingProviderRecognitionRule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ruleStableId: 'acct_recognition_uber_monthly_statement' },
        create: expect.objectContaining({
          provider: AccountingFinancialProvider.UBER_EATS,
          documentType: AccountingFinancialDocumentType.STATEMENT,
          version: 2,
        }) as unknown,
      }) as unknown,
    );
    expect(tx.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE_RECOGNITION_RULE',
        entityType: 'ACCOUNTING_PROVIDER_RECOGNITION_RULE',
        entityId: 'acct_recognition_uber_monthly_statement',
        operatorUserId: 'user_1',
      }) as unknown,
    });
  });

  it('does not persist or audit an unchanged effective default', async () => {
    const tx = makeTx();
    tx.accountingProviderRecognitionRule.findUnique.mockResolvedValue(null);

    await expect(
      upsertAccountingProviderRecognitionRuleInTx(
        tx as never,
        'acct_recognition_clover_closeout',
        {
          requiredKeywords: [
            'Closeout Batch Report',
            'Batch Totals',
            'Batch ID:',
          ],
          optionalKeywords: [],
          optionalMatchMode: AccountingProviderRecognitionMatchMode.ANY,
          priority: 100,
          isActive: true,
        },
        'user_1',
      ),
    ).resolves.toEqual(
      expect.objectContaining({ persisted: false, changed: false }) as unknown,
    );
    expect(tx.accountingProviderRecognitionRule.upsert).not.toHaveBeenCalled();
    expect(tx.accountingAuditLog.create).not.toHaveBeenCalled();
  });
});
