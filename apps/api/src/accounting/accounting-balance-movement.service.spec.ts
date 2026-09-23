import { BadRequestException, ConflictException } from '@nestjs/common';

import { AccountingBalanceMovementService } from './accounting-balance-movement.service';
import type { AccountingTrialBalanceReportV1 } from './accounting-trial-balance.contract';

const trialBalanceReport: AccountingTrialBalanceReportV1 = {
  version: 1,
  scope: 'WHOLE_LEDGER',
  currency: 'CAD',
  timezone: 'America/Toronto',
  accountingStartDate: '2026-06-01',
  requestedFrom: '2026-06-01',
  requestedTo: '2026-06-30',
  effectiveFrom: '2026-06-01',
  effectiveTo: '2026-06-30',
  openingBalanceJournal: {
    entryCount: 0,
    debitCents: 0,
    creditCents: 0,
  },
  totals: {
    openingDebitBalanceCents: 0,
    openingCreditBalanceCents: 0,
    periodDebitCents: 0,
    periodCreditCents: 0,
    closingDebitBalanceCents: 0,
    closingCreditBalanceCents: 0,
  },
  accounts: [],
  closeStatus: {
    months: [{ periodKey: '2026-06', isClosed: false }],
    years: [{ periodKey: '2026', isClosed: false }],
    allMonthsClosed: false,
  },
};

const makeService = (report = trialBalanceReport) => {
  const trialBalance = {
    project: jest.fn().mockResolvedValue(report),
  };

  return {
    service: new AccountingBalanceMovementService(trialBalance as never),
    trialBalance,
  };
};

describe('AccountingBalanceMovementService B3-C', () => {
  it('delegates range and currency ownership to B3-A unchanged', async () => {
    const { service, trialBalance } = makeService();

    const result = await service.project({
      from: ' 2026-06-01 ',
      to: '2026-06-30',
      currency: 'cad',
    });

    expect(trialBalance.project).toHaveBeenCalledWith({
      from: ' 2026-06-01 ',
      to: '2026-06-30',
      currency: 'cad',
    });
    expect(result).toMatchObject({
      version: 1,
      statement: 'BALANCE_MOVEMENT',
      currency: 'CAD',
      openingBasis: {
        kind: 'ZERO_MANAGEMENT_OPENING',
        zeroOpeningDisclaimerRequired: true,
        absoluteBalanceClaim: false,
      },
    });
  });

  it('preserves B3-A transport/query failures without translating them', async () => {
    const { service, trialBalance } = makeService();
    const badRequest = new BadRequestException('invalid trial balance query');
    trialBalance.project.mockRejectedValueOnce(badRequest);

    await expect(
      service.project({ from: 'bad', to: undefined, currency: undefined }),
    ).rejects.toBe(badRequest);
  });

  it('translates Balance Movement invariant failures to Conflict', async () => {
    const invalid = {
      ...trialBalanceReport,
      totals: {
        ...trialBalanceReport.totals,
        closingDebitBalanceCents: 1,
      },
    };
    const { service } = makeService(invalid);

    await expect(
      service.project({ from: undefined, to: undefined, currency: undefined }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
