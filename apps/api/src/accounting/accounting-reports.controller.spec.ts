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
  const statementDrillThrough = {
    read: jest.fn().mockResolvedValue({
      version: 1,
      scope: 'WHOLE_LEDGER',
      phase: 'PERIOD',
      entries: [],
    }),
  };
  const statementExport = {
    exportTrialBalanceCsv: jest.fn().mockResolvedValue('trial,csv'),
    exportTrialBalancePdf: jest
      .fn()
      .mockResolvedValue(Buffer.from('%PDF-trial')),
    exportBalanceMovementCsv: jest.fn().mockResolvedValue('balance,csv'),
    exportBalanceMovementPdf: jest
      .fn()
      .mockResolvedValue(Buffer.from('%PDF-balance')),
  };
  const cloverPreSyncAuthority = {
    shadow: jest.fn().mockResolvedValue({
      version: 1,
      mutationMode: 'READ_ONLY_SHADOW',
      projections: [],
    }),
  };
  const cloverAuthorityReplacement = {
    preview: jest.fn().mockResolvedValue({
      version: 1,
      mode: 'READ_ONLY_PREVIEW',
      status: 'BLOCKED',
      planHash: 'hash',
      periods: [],
    }),
  };

  return {
    controller: new AccountingReportsController(
      {} as never,
      {} as never,
      balanceMovement as never,
      trialBalance as never,
      statementDrillThrough as never,
      statementExport as never,
      cloverPreSyncAuthority as never,
      cloverAuthorityReplacement as never,
    ),
    balanceMovement,
    trialBalance,
    statementDrillThrough,
    statementExport,
    cloverPreSyncAuthority,
    cloverAuthorityReplacement,
  };
};

describe('AccountingReportsController Clover pre-sync authority shadow transport', () => {
  it('passes store and optional statement identity to the read-only shadow service', async () => {
    const { controller, cloverPreSyncAuthority } = makeController();

    await controller.cloverPreSyncAuthorityShadow(
      '4750_Yonge_Street',
      'acctfindoc_july',
    );

    expect(cloverPreSyncAuthority.shadow).toHaveBeenCalledWith({
      storeStableId: '4750_Yonge_Street',
      statementDocumentStableId: 'acctfindoc_july',
    });
  });
});

describe('AccountingReportsController Clover authority replacement preview transport', () => {
  it('passes the store identity to the read-only historical replacement preview', async () => {
    const { controller, cloverAuthorityReplacement } = makeController();

    await controller.cloverAuthorityReplacementPreview('4750_Yonge_Street');

    expect(cloverAuthorityReplacement.preview).toHaveBeenCalledWith({
      storeStableId: '4750_Yonge_Street',
    });
  });
});

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

describe('AccountingReportsController statement drill-through', () => {
  it('delegates account/phase/range/pagination unchanged to the Accounting drill-through service', async () => {
    const { controller, statementDrillThrough } = makeController();

    await controller.statementJournals(
      'account_primary_bank',
      'PERIOD',
      '2026-06-01',
      '2026-06-30',
      'cad',
      '25',
      '50',
    );

    expect(statementDrillThrough.read).toHaveBeenCalledWith({
      accountStableId: 'account_primary_bank',
      phase: 'PERIOD',
      from: '2026-06-01',
      to: '2026-06-30',
      currency: 'cad',
      limit: 25,
      offset: 50,
    });
  });
});

describe('AccountingReportsController statement exports', () => {
  const makeResponse = () => {
    const response = {
      setHeader: jest.fn(),
      send: jest.fn((value: unknown) => value),
    };
    return response;
  };

  it('delegates Trial Balance CSV/PDF exports without re-projecting in the controller', async () => {
    const { controller, statementExport, trialBalance } = makeController();
    const req = { user: { userStableId: 'user_admin' } } as never;
    const csvResponse = makeResponse();

    const csv = await controller.exportTrialBalanceCsv(
      ' 2026-06-01 ',
      '2026-06-30',
      'cad',
      req,
      csvResponse as never,
    );

    expect(statementExport.exportTrialBalanceCsv).toHaveBeenCalledWith(
      {
        from: ' 2026-06-01 ',
        to: '2026-06-30',
        currency: 'cad',
      },
      'user_admin',
    );
    expect(trialBalance.project).not.toHaveBeenCalled();
    expect(csvResponse.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/csv; charset=utf-8',
    );
    expect(csv).toBe('trial,csv');

    const pdfResponse = makeResponse();
    const pdf = await controller.exportTrialBalancePdf(
      undefined,
      undefined,
      undefined,
      req,
      pdfResponse as never,
    );
    expect(statementExport.exportTrialBalancePdf).toHaveBeenCalledWith(
      { from: undefined, to: undefined, currency: undefined },
      'user_admin',
    );
    expect(pdfResponse.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(Buffer.isBuffer(pdf)).toBe(true);
  });

  it('delegates Balance Movement CSV/PDF exports to the statement export service', async () => {
    const { controller, statementExport, balanceMovement } = makeController();
    const req = { user: { userStableId: 'user_accountant' } } as never;

    const csvResponse = makeResponse();
    await controller.exportBalanceMovementCsv(
      '2026-07-01',
      '2026-07-31',
      'CAD',
      req,
      csvResponse as never,
    );
    expect(statementExport.exportBalanceMovementCsv).toHaveBeenCalledWith(
      {
        from: '2026-07-01',
        to: '2026-07-31',
        currency: 'CAD',
      },
      'user_accountant',
    );
    expect(balanceMovement.project).not.toHaveBeenCalled();

    const pdfResponse = makeResponse();
    const pdf = await controller.exportBalanceMovementPdf(
      '2026-07-01',
      '2026-07-31',
      'CAD',
      req,
      pdfResponse as never,
    );
    expect(statementExport.exportBalanceMovementPdf).toHaveBeenCalledWith(
      {
        from: '2026-07-01',
        to: '2026-07-31',
        currency: 'CAD',
      },
      'user_accountant',
    );
    expect(pdfResponse.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(Buffer.isBuffer(pdf)).toBe(true);
  });
});
