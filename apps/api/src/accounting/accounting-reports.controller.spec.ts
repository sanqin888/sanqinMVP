import { BadRequestException, ConflictException } from '@nestjs/common';

import type { AccountingBalanceMovementReportV1 } from './accounting-balance-movement.contract';
import { AccountingReportsController } from './accounting-reports.controller';
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
    periodDebitCents: 1000,
    periodCreditCents: 1000,
    closingDebitBalanceCents: 1000,
    closingCreditBalanceCents: 1000,
  },
  accounts: [],
  closeStatus: {
    months: [{ periodKey: '2026-06', isClosed: false }],
    years: [{ periodKey: '2026', isClosed: false }],
    allMonthsClosed: false,
  },
};

const balanceMovementReport: AccountingBalanceMovementReportV1 = {
  version: 1,
  statement: 'BALANCE_MOVEMENT',
  scope: 'WHOLE_LEDGER',
  currency: 'CAD',
  timezone: 'America/Toronto',
  accountingStartDate: '2026-06-01',
  requestedFrom: '2026-06-01',
  requestedTo: '2026-06-30',
  effectiveFrom: '2026-06-01',
  effectiveTo: '2026-06-30',
  openingBasis: {
    kind: 'ZERO_MANAGEMENT_OPENING',
    explicitOpeningJournalEntryCount: 0,
    zeroOpeningDisclaimerRequired: true,
    absoluteBalanceClaim: false,
  },
  openingBalanceJournal: {
    entryCount: 0,
    debitCents: 0,
    creditCents: 0,
  },
  assets: {
    openingCumulativeCents: 0,
    periodMovementCents: 0,
    closingCumulativeCents: 0,
    accounts: [],
  },
  liabilities: {
    openingCumulativeCents: 0,
    periodMovementCents: 0,
    closingCumulativeCents: 0,
    accounts: [],
  },
  directEquity: {
    openingCumulativeCents: 0,
    periodMovementCents: 0,
    closingCumulativeCents: 0,
    accounts: [],
  },
  earningsBridge: {
    revenue: {
      openingCumulativeCents: 0,
      periodMovementCents: 0,
      closingCumulativeCents: 0,
    },
    expense: {
      openingCumulativeCents: 0,
      periodMovementCents: 0,
      closingCumulativeCents: 0,
    },
    recordedEarnings: {
      openingCumulativeCents: 0,
      periodMovementCents: 0,
      closingCumulativeCents: 0,
    },
  },
  bridge: {
    opening: {
      assetsCents: 0,
      liabilitiesCents: 0,
      directEquityCents: 0,
      recordedEarningsCents: 0,
      totalEquityCents: 0,
      reconciliationCents: 0,
    },
    period: {
      assetsCents: 0,
      liabilitiesCents: 0,
      directEquityCents: 0,
      recordedEarningsCents: 0,
      totalEquityCents: 0,
      reconciliationCents: 0,
    },
    closing: {
      assetsCents: 0,
      liabilitiesCents: 0,
      directEquityCents: 0,
      recordedEarningsCents: 0,
      totalEquityCents: 0,
      reconciliationCents: 0,
    },
  },
  closeStatus: trialBalanceReport.closeStatus,
};

const makeController = () => {
  const balanceMovement = {
    project: jest.fn().mockResolvedValue(balanceMovementReport),
  };
  const trialBalance = {
    project: jest.fn().mockResolvedValue(trialBalanceReport),
  };

  return {
    controller: new AccountingReportsController(
      {} as never,
      {} as never,
      balanceMovement as never,
      trialBalance as never,
    ),
    balanceMovement,
    trialBalance,
  };
};

describe('AccountingReportsController Trial Balance transport', () => {
  it('passes date and currency query values unchanged to the canonical projection', async () => {
    const { controller, trialBalance } = makeController();

    const result = await controller.trialBalanceReport(
      ' 2026-06-01 ',
      '2026-06-30',
      'cad',
    );

    expect(trialBalance.project).toHaveBeenCalledTimes(1);
    expect(trialBalance.project).toHaveBeenCalledWith({
      from: ' 2026-06-01 ',
      to: '2026-06-30',
      currency: 'cad',
    });
    expect(result).toBe(trialBalanceReport);
  });

  it('passes omitted query values through so B3-A owns defaults such as CAD', async () => {
    const { controller, trialBalance } = makeController();

    await controller.trialBalanceReport(undefined, undefined, undefined);

    expect(trialBalance.project).toHaveBeenCalledWith({
      from: undefined,
      to: undefined,
      currency: undefined,
    });
  });

  it('preserves B3-A BadRequest and Conflict failures without transport translation', async () => {
    const { controller, trialBalance } = makeController();
    const badRequest = new BadRequestException('invalid trial balance query');
    const conflict = new ConflictException('trial balance invariant failed');

    trialBalance.project.mockRejectedValueOnce(badRequest);
    await expect(
      controller.trialBalanceReport('bad', undefined, undefined),
    ).rejects.toBe(badRequest);

    trialBalance.project.mockRejectedValueOnce(conflict);
    await expect(
      controller.trialBalanceReport(undefined, undefined, undefined),
    ).rejects.toBe(conflict);
  });
});

describe('AccountingReportsController Balance Movement transport', () => {
  it('passes date and currency query values unchanged to B3-C', async () => {
    const { controller, balanceMovement } = makeController();

    const result = await controller.balanceMovementReport(
      ' 2026-06-01 ',
      '2026-06-30',
      'cad',
    );

    expect(balanceMovement.project).toHaveBeenCalledTimes(1);
    expect(balanceMovement.project).toHaveBeenCalledWith({
      from: ' 2026-06-01 ',
      to: '2026-06-30',
      currency: 'cad',
    });
    expect(result).toBe(balanceMovementReport);
  });

  it('preserves B3-C failures without transport translation', async () => {
    const { controller, balanceMovement } = makeController();
    const conflict = new ConflictException('balance movement invariant failed');
    balanceMovement.project.mockRejectedValueOnce(conflict);

    await expect(
      controller.balanceMovementReport(undefined, undefined, undefined),
    ).rejects.toBe(conflict);
  });
});
