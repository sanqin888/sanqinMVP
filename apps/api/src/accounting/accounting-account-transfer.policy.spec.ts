import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  AccountingAccountTransferPurpose,
  ACCOUNT_TRANSFER_SOURCE_FACT_TYPE,
  buildAccountingAccountTransferJournal,
  normalizeAccountingAccountTransfer,
  type AccountingAccountTransferInput,
} from './accounting-account-transfer.policy';

describe('Accounting account transfer policy', () => {
  const base: AccountingAccountTransferInput = {
    requestId: '7f5720a6-112d-4b70-9e16-6e27db4f3554',
    fromAccountStableId: 'account_cibc',
    toAccountStableId: 'account_primary_bank',
    amountCents: 615_991,
    transferDate: '2026-06-30',
    purpose: AccountingAccountTransferPurpose.ACTUAL_TRANSFER,
    note: 'June operating transfer',
  };

  it('builds a balanced CAD transfer Journal with deterministic identity', () => {
    const normalized = normalizeAccountingAccountTransfer(base);
    const journal = buildAccountingAccountTransferJournal(
      normalized,
      'America/Toronto',
    );

    expect(normalized.transferStableId).toBe(
      'accttransfer_7f5720a6112d4b709e166e27db4f3554',
    );
    expect(journal).toEqual(
      expect.objectContaining({
        idempotencyKey:
          'account-transfer:accttransfer_7f5720a6112d4b709e166e27db4f3554',
        kind: AccountingJournalEntryKind.TRANSFER,
        source: AccountingJournalSource.MANUAL,
        sourceFactType: ACCOUNT_TRANSFER_SOURCE_FACT_TYPE,
        sourceFactStableId:
          'accttransfer_7f5720a6112d4b709e166e27db4f3554',
        sourceFactVersion: 1,
        occurredAt: '2026-06-30T04:00:00.000Z',
        currency: 'CAD',
        memo: 'June operating transfer',
      }),
    );
    expect(journal.lines).toEqual([
      expect.objectContaining({
        accountStableId: 'account_primary_bank',
        debitCents: 615_991,
        creditCents: 0,
      }),
      expect.objectContaining({
        accountStableId: 'account_cibc',
        debitCents: 0,
        creditCents: 615_991,
      }),
    ]);
  });

  it('requires an explanatory note for an attribution correction', () => {
    expect(() =>
      normalizeAccountingAccountTransfer({
        ...base,
        purpose:
          AccountingAccountTransferPurpose.ACCOUNT_ATTRIBUTION_CORRECTION,
        note: '   ',
      }),
    ).toThrow('note is required for account attribution correction');
  });

  it('rejects same-account, invalid amount, and non-UUID requests', () => {
    expect(() =>
      normalizeAccountingAccountTransfer({
        ...base,
        toAccountStableId: base.fromAccountStableId,
      }),
    ).toThrow('must be different');
    expect(() =>
      normalizeAccountingAccountTransfer({ ...base, amountCents: 0 }),
    ).toThrow('amountCents');
    expect(() =>
      normalizeAccountingAccountTransfer({ ...base, requestId: 'retry-1' }),
    ).toThrow('requestId must be a UUID');
  });
});
