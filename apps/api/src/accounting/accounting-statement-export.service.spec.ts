import type { AccountingBalanceMovementReportV1 } from './accounting-balance-movement.contract';
import { AccountingStatementExportService } from './accounting-statement-export.service';
import type { AccountingTrialBalanceReportV1 } from './accounting-trial-balance.contract';

const trialBalanceReport = {
  version: 1,
  scope: 'WHOLE_LEDGER',
  currency: 'CAD',
  timezone: 'America/Toronto',
  accountingStartDate: '2026-06-01',
  requestedFrom: '2026-07-01',
  requestedTo: '2026-07-31',
  effectiveFrom: '2026-07-01',
  effectiveTo: '2026-07-31',
  openingBalanceJournal: { entryCount: 0, debitCents: 0, creditCents: 0 },
  totals: {
    openingDebitBalanceCents: 0,
    openingCreditBalanceCents: 0,
    periodDebitCents: 100,
    periodCreditCents: 100,
    closingDebitBalanceCents: 100,
    closingCreditBalanceCents: 100,
  },
  accounts: [],
  closeStatus: {
    months: [{ periodKey: '2026-07', isClosed: false }],
    years: [{ periodKey: '2026', isClosed: false }],
    allMonthsClosed: false,
  },
} satisfies AccountingTrialBalanceReportV1;

const balanceMovementReport = {
  version: 1,
  statement: 'BALANCE_MOVEMENT',
  scope: 'WHOLE_LEDGER',
  currency: 'CAD',
  timezone: 'America/Toronto',
  accountingStartDate: '2026-06-01',
  requestedFrom: '2026-07-01',
  requestedTo: '2026-07-31',
  effectiveFrom: '2026-07-01',
  effectiveTo: '2026-07-31',
  openingBasis: {
    kind: 'ZERO_MANAGEMENT_OPENING',
    explicitOpeningJournalEntryCount: 0,
    zeroOpeningDisclaimerRequired: true,
    absoluteBalanceClaim: false,
  },
  openingBalanceJournal: { entryCount: 0, debitCents: 0, creditCents: 0 },
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
} satisfies AccountingBalanceMovementReportV1;

describe('AccountingStatementExportService', () => {
  const makeService = () => {
    const db = {
      accountingAuditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const trialBalance = {
      project: jest.fn().mockResolvedValue(trialBalanceReport),
    };
    const balanceMovement = {
      project: jest.fn().mockResolvedValue(balanceMovementReport),
    };

    return {
      service: new AccountingStatementExportService(
        db as never,
        trialBalance as never,
        balanceMovement as never,
      ),
      db,
      trialBalance,
      balanceMovement,
    };
  };

  it('exports Trial Balance from exactly one canonical projection and audits the effective range', async () => {
    const { service, db, trialBalance, balanceMovement } = makeService();

    const csv = await service.exportTrialBalanceCsv(
      { from: '2026-07-01', to: '2026-07-31', currency: 'cad' },
      'user_admin',
    );

    expect(trialBalance.project).toHaveBeenCalledTimes(1);
    expect(trialBalance.project).toHaveBeenCalledWith({
      from: '2026-07-01',
      to: '2026-07-31',
      currency: 'cad',
    });
    expect(balanceMovement.project).not.toHaveBeenCalled();
    expect(csv).toContain('rowType');
    expect(db.accountingAuditLog.create).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify(db.accountingAuditLog.create.mock.calls[0]),
    ).toContain('"action":"EXPORT_STATEMENT"');
    expect(
      JSON.stringify(db.accountingAuditLog.create.mock.calls[0]),
    ).toContain('"entityId":"TRIAL_BALANCE"');
    expect(
      JSON.stringify(db.accountingAuditLog.create.mock.calls[0]),
    ).toContain('"operatorActorRef":"user_admin"');
  });

  it('exports Balance Movement from exactly one B3-C projection', async () => {
    const { service, trialBalance, balanceMovement } = makeService();

    const csv = await service.exportBalanceMovementCsv(
      { from: undefined, to: undefined, currency: undefined },
      'user_accountant',
    );

    expect(balanceMovement.project).toHaveBeenCalledTimes(1);
    expect(balanceMovement.project).toHaveBeenCalledWith({
      from: undefined,
      to: undefined,
      currency: undefined,
    });
    expect(trialBalance.project).not.toHaveBeenCalled();
    expect(csv).toContain('ZERO_MANAGEMENT_OPENING');
  });
});
