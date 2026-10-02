import { BadRequestException } from '@nestjs/common';

import {
  AccountingAccountClass,
  AccountingAccountType,
} from './accounting-contracts';
import {
  AccountingAccountTransferPurpose,
  type AccountingAccountTransferInput,
} from './accounting-account-transfer.policy';
import { AccountingAccountTransferService } from './accounting-account-transfer.service';

describe('AccountingAccountTransferService', () => {
  const baseInput: AccountingAccountTransferInput = {
    requestId: '7f5720a6-112d-4b70-9e16-6e27db4f3554',
    fromAccountStableId: 'account_cibc',
    toAccountStableId: 'account_primary_bank',
    amountCents: 350_132,
    transferDate: '2026-07-31',
    purpose: AccountingAccountTransferPurpose.ACCOUNT_ATTRIBUTION_CORRECTION,
    note: 'Correct July provider payout bank attribution',
  };

  const eligibleAccounts = [
    {
      accountStableId: 'account_cibc',
      type: AccountingAccountType.BANK,
      accountClass: AccountingAccountClass.ASSET,
      currency: 'CAD',
    },
    {
      accountStableId: 'account_primary_bank',
      type: AccountingAccountType.BANK,
      accountClass: AccountingAccountClass.ASSET,
      currency: 'CAD',
    },
  ];

  const createdJournal = {
    entryStableId: 'journal_transfer_1',
    sourceFactType: 'accounting.account_transfer.v1',
    sourceFactStableId: 'accttransfer_7f5720a6112d4b709e166e27db4f3554',
    occurredAt: new Date('2026-07-31T04:00:00.000Z'),
    currency: 'CAD',
    memo: baseInput.note,
    createdByActorRef: 'user_accountant',
    createdAt: new Date('2026-08-01T01:00:00.000Z'),
    lines: [
      {
        debitCents: 350_132,
        creditCents: 0,
        memo: 'Account attribution correction in',
        account: {
          accountStableId: 'account_primary_bank',
          name: '主要银行账户',
          type: AccountingAccountType.BANK,
          accountClass: AccountingAccountClass.ASSET,
          currency: 'CAD',
        },
      },
      {
        debitCents: 0,
        creditCents: 350_132,
        memo: 'Account attribution correction out',
        account: {
          accountStableId: 'account_cibc',
          name: 'CIBC',
          type: AccountingAccountType.BANK,
          accountClass: AccountingAccountClass.ASSET,
          currency: 'CAD',
        },
      },
    ],
  };

  function makeService(accountRows = eligibleAccounts) {
    const prisma = {
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue(accountRows),
      },
      accountingJournalEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const period = {
      getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
    };
    const journal = {
      createJournalEntry: jest.fn().mockResolvedValue(createdJournal),
    };
    return {
      service: new AccountingAccountTransferService(
        prisma as never,
        period as never,
        journal as never,
      ),
      prisma,
      journal,
    };
  }

  it('posts a correction through the existing Journal writer', async () => {
    const { service, journal } = makeService();

    const result = await service.createTransfer(baseInput, 'user_accountant');
    expect(result).toEqual(
      expect.objectContaining({
        transferDate: '2026-07-31',
        purpose:
          AccountingAccountTransferPurpose.ACCOUNT_ATTRIBUTION_CORRECTION,
        amountCents: 350_132,
      }),
    );
    expect(result.fromAccount.name).toBe('CIBC');
    expect(result.toAccount.name).toBe('主要银行账户');

    expect(journal.createJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'TRANSFER',
        source: 'MANUAL',
        sourceFactType: 'accounting.account_transfer.v1',
        lines: [
          expect.objectContaining({
            accountStableId: 'account_primary_bank',
            debitCents: 350_132,
          }),
          expect.objectContaining({
            accountStableId: 'account_cibc',
            creditCents: 350_132,
          }),
        ],
      }),
      'user_accountant',
    );
  });

  it('rejects platform-wallet or non-CAD transfer endpoints', async () => {
    const { service } = makeService([
      eligibleAccounts[0],
      {
        ...eligibleAccounts[1],
        type: AccountingAccountType.PLATFORM_WALLET,
      },
    ]);

    await expect(
      service.createTransfer(baseInput, 'user_accountant'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
