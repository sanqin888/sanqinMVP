import { BadRequestException } from '@nestjs/common';
import { AccountingFinancialProvider } from './accounting-contracts';
import { AccountingProviderPayoutController } from './accounting-provider-payout.controller';
import { AccountingProviderPayoutService } from './accounting-provider-payout.service';
import { AccountingProviderPayoutBankMatchService } from './accounting-provider-payout-bank-match.service';
import { AccountingProviderPayoutBankRowDecisionService } from './accounting-provider-payout-bank-row-decision.service';
import { AccountingProviderPendingReconciliationService } from './accounting-provider-pending-reconciliation.service';

function makeController() {
  const payouts = {
    listPayouts: jest.fn().mockResolvedValue([]),
    recordPayout: jest.fn().mockResolvedValue({ payoutStableId: 'payout_1' }),
  };
  const bankMatch = {
    preview: jest.fn().mockResolvedValue({ deposits: [] }),
  };
  const bankRowDecisions = {
    getScope: jest.fn().mockResolvedValue({ confirmed: false, decisions: [] }),
    confirmScope: jest
      .fn()
      .mockResolvedValue({ confirmed: true, decisions: [] }),
  };
  const pendingReconciliation = {
    reconcile: jest.fn().mockResolvedValue({ providers: [] }),
  };
  const controller = new AccountingProviderPayoutController(
    payouts as unknown as AccountingProviderPayoutService,
    bankMatch as unknown as AccountingProviderPayoutBankMatchService,
    bankRowDecisions as unknown as AccountingProviderPayoutBankRowDecisionService,
    pendingReconciliation as unknown as AccountingProviderPendingReconciliationService,
  );
  return {
    controller,
    payouts,
    bankMatch,
    bankRowDecisions,
    pendingReconciliation,
  };
}

describe('AccountingProviderPayoutController', () => {
  it('delegates bank evidence matching as a read-only payout preview', async () => {
    const { controller, bankMatch } = makeController();

    await controller.previewBankMatches(
      'acctart_bank_1',
      '4750_Yonge_Street',
      'account_primary_bank',
    );

    expect(bankMatch.preview).toHaveBeenCalledWith({
      artifactStableId: 'acctart_bank_1',
      storeStableId: '4750_Yonge_Street',
      destinationBankAccountStableId: 'account_primary_bank',
    });
  });

  it('reads and confirms durable bank row decisions through authenticated Accounting contracts', async () => {
    const { controller, bankRowDecisions } = makeController();

    await controller.getBankRowDecisions(
      'acctart_bank_1',
      '4750_Yonge_Street',
      'account_primary_bank',
    );
    expect(bankRowDecisions.getScope).toHaveBeenCalledWith({
      artifactStableId: 'acctart_bank_1',
      storeStableId: '4750_Yonge_Street',
      destinationBankAccountStableId: 'account_primary_bank',
    });

    await controller.confirmBankRowDecisions(
      {
        artifactStableId: 'acctart_bank_1',
        storeStableId: '4750_Yonge_Street',
        destinationBankAccountStableId: 'account_primary_bank',
        includedRowNumbers: [9, 10],
      },
      { user: { userStableId: 'user_accountant_1' } } as never,
    );
    expect(bankRowDecisions.confirmScope).toHaveBeenCalledWith(
      {
        artifactStableId: 'acctart_bank_1',
        storeStableId: '4750_Yonge_Street',
        destinationBankAccountStableId: 'account_primary_bank',
        includedRowNumbers: [9, 10],
      },
      'user_accountant_1',
    );
  });

  it('delegates Provider Pending reconciliation as a read-only Accounting query', async () => {
    const { controller, pendingReconciliation } = makeController();

    await controller.reconcileProviderPending(
      '4750_Yonge_Street',
      '2026-06-01',
      '2026-09-23',
      'uber_eats',
    );

    expect(pendingReconciliation.reconcile).toHaveBeenCalledWith({
      storeStableId: '4750_Yonge_Street',
      from: '2026-06-01',
      to: '2026-09-23',
      provider: AccountingFinancialProvider.UBER_EATS,
    });
  });

  it('keeps history reads bounded and parses provider filters', async () => {
    const { controller, payouts } = makeController();

    await controller.listPayouts('uber_eats', ' 4750_Yonge_Street ', '50');

    expect(payouts.listPayouts).toHaveBeenCalledWith({
      provider: AccountingFinancialProvider.UBER_EATS,
      storeStableId: '4750_Yonge_Street',
      limit: 50,
    });
  });

  it('passes only the payout contract plus authenticated stable actor to the writer', async () => {
    const { controller, payouts } = makeController();

    await controller.recordPayout(
      {
        payoutStableId: 'payout_1',
        provider: 'CLOVER',
        storeStableId: '4750_Yonge_Street',
        payoutDate: '2026-09-23',
        destinationBankAccountStableId: 'account_primary_bank',
        amountCents: 12345,
        providerReference: 'clover-deposit-1',
      },
      { user: { userStableId: 'user_accountant_1' } } as never,
    );

    expect(payouts.recordPayout).toHaveBeenCalledWith(
      {
        payoutStableId: 'payout_1',
        provider: AccountingFinancialProvider.CLOVER,
        storeStableId: '4750_Yonge_Street',
        payoutDate: '2026-09-23',
        destinationBankAccountStableId: 'account_primary_bank',
        amountCents: 12345,
        currency: 'CAD',
        providerReference: 'clover-deposit-1',
      },
      'user_accountant_1',
    );
  });

  it('rejects a write without a provider before reaching the service', () => {
    const { controller, payouts } = makeController();

    expect(() =>
      controller.recordPayout(
        {
          payoutStableId: 'payout_1',
          storeStableId: '4750_Yonge_Street',
          payoutDate: '2026-09-23',
          destinationBankAccountStableId: 'account_primary_bank',
          amountCents: 12345,
        },
        { user: { userStableId: 'user_accountant_1' } } as never,
      ),
    ).toThrow(BadRequestException);
    expect(payouts.recordPayout).not.toHaveBeenCalled();
  });
});
