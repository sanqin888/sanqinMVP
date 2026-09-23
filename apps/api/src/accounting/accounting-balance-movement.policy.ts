import { AccountingAccountClass } from './accounting-contracts';
import type {
  AccountingBalanceMovementAccountRowV1,
  AccountingBalanceMovementAmountsV1,
  AccountingBalanceMovementBridgeSnapshotV1,
  AccountingBalanceMovementReportV1,
  AccountingBalanceMovementSectionV1,
} from './accounting-balance-movement.contract';
import type {
  AccountingTrialBalanceAccountRowV1,
  AccountingTrialBalanceReportV1,
} from './accounting-trial-balance.contract';

const assertSignedMinorUnits = (value: number, field: string): void => {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${field} must be a safe integer`);
  }
};

const assertUnsignedMinorUnits = (value: number, field: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
};

const safeAdd = (left: number, right: number, field: string): number => {
  const value = left + right;
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${field} exceeds safe integer range`);
  }
  return value;
};

const safeSubtract = (left: number, right: number, field: string): number =>
  safeAdd(left, -right, field);

const emptyAmounts = (): AccountingBalanceMovementAmountsV1 => ({
  openingCumulativeCents: 0,
  periodMovementCents: 0,
  closingCumulativeCents: 0,
});

const addAmounts = (
  target: AccountingBalanceMovementAmountsV1,
  source: AccountingBalanceMovementAmountsV1,
  field: string,
): void => {
  target.openingCumulativeCents = safeAdd(
    target.openingCumulativeCents,
    source.openingCumulativeCents,
    `${field} opening cumulative`,
  );
  target.periodMovementCents = safeAdd(
    target.periodMovementCents,
    source.periodMovementCents,
    `${field} period movement`,
  );
  target.closingCumulativeCents = safeAdd(
    target.closingCumulativeCents,
    source.closingCumulativeCents,
    `${field} closing cumulative`,
  );
};

const rowAmounts = (
  row: AccountingTrialBalanceAccountRowV1,
): AccountingBalanceMovementAmountsV1 => ({
  openingCumulativeCents: row.openingNormalBalanceCents,
  periodMovementCents: row.periodNormalMovementCents,
  closingCumulativeCents: row.closingNormalBalanceCents,
});

const toMovementRow = (
  row: AccountingTrialBalanceAccountRowV1,
): AccountingBalanceMovementAccountRowV1 => ({
  accountStableId: row.accountStableId,
  accountName: row.accountName,
  accountType: row.accountType,
  isActive: row.isActive,
  ...rowAmounts(row),
});

const emptySection = (): AccountingBalanceMovementSectionV1 => ({
  ...emptyAmounts(),
  accounts: [],
});

const addSectionRow = (
  section: AccountingBalanceMovementSectionV1,
  row: AccountingTrialBalanceAccountRowV1,
  field: string,
): void => {
  const movementRow = toMovementRow(row);
  section.accounts.push(movementRow);
  addAmounts(section, movementRow, field);
};

const bridgeSnapshot = (params: {
  assetsCents: number;
  liabilitiesCents: number;
  directEquityCents: number;
  recordedEarningsCents: number;
  field: string;
}): AccountingBalanceMovementBridgeSnapshotV1 => {
  const totalEquityCents = safeAdd(
    params.directEquityCents,
    params.recordedEarningsCents,
    `${params.field} total equity`,
  );
  const reconciliationCents = safeSubtract(
    safeSubtract(
      safeSubtract(
        params.assetsCents,
        params.liabilitiesCents,
        `${params.field} assets less liabilities`,
      ),
      params.directEquityCents,
      `${params.field} less direct equity`,
    ),
    params.recordedEarningsCents,
    `${params.field} less recorded earnings`,
  );

  return {
    assetsCents: params.assetsCents,
    liabilitiesCents: params.liabilitiesCents,
    directEquityCents: params.directEquityCents,
    recordedEarningsCents: params.recordedEarningsCents,
    totalEquityCents,
    reconciliationCents,
  };
};

const assertTrialBalanceRow = (
  row: AccountingTrialBalanceAccountRowV1,
  currency: string,
): void => {
  if (row.currency !== currency) {
    throw new Error(
      `Balance Movement account currency mismatch: ${row.accountStableId}`,
    );
  }

  for (const [field, value] of [
    ['openingNormalBalanceCents', row.openingNormalBalanceCents],
    ['periodNormalMovementCents', row.periodNormalMovementCents],
    ['closingNormalBalanceCents', row.closingNormalBalanceCents],
  ] as const) {
    assertSignedMinorUnits(value, `${row.accountStableId} ${field}`);
  }

  const expectedClosing = safeAdd(
    row.openingNormalBalanceCents,
    row.periodNormalMovementCents,
    `${row.accountStableId} closing movement`,
  );
  if (expectedClosing !== row.closingNormalBalanceCents) {
    throw new Error(
      `Balance Movement account roll-forward mismatch: ${row.accountStableId}`,
    );
  }
};

export function projectAccountingBalanceMovement(
  trialBalance: AccountingTrialBalanceReportV1,
): AccountingBalanceMovementReportV1 {
  if (trialBalance.scope !== 'WHOLE_LEDGER') {
    throw new Error(
      'Balance Movement requires WHOLE_LEDGER Trial Balance scope',
    );
  }
  if (!/^[A-Z]{3}$/.test(trialBalance.currency)) {
    throw new Error('Balance Movement currency must be a 3-letter code');
  }

  const { totals, openingBalanceJournal } = trialBalance;
  for (const [field, value] of [
    ['openingDebitBalanceCents', totals.openingDebitBalanceCents],
    ['openingCreditBalanceCents', totals.openingCreditBalanceCents],
    ['periodDebitCents', totals.periodDebitCents],
    ['periodCreditCents', totals.periodCreditCents],
    ['closingDebitBalanceCents', totals.closingDebitBalanceCents],
    ['closingCreditBalanceCents', totals.closingCreditBalanceCents],
    ['openingJournalDebitCents', openingBalanceJournal.debitCents],
    ['openingJournalCreditCents', openingBalanceJournal.creditCents],
  ] as const) {
    assertUnsignedMinorUnits(value, field);
  }
  assertUnsignedMinorUnits(
    openingBalanceJournal.entryCount,
    'openingBalanceJournal.entryCount',
  );

  if (
    totals.openingDebitBalanceCents !== totals.openingCreditBalanceCents ||
    totals.periodDebitCents !== totals.periodCreditCents ||
    totals.closingDebitBalanceCents !== totals.closingCreditBalanceCents ||
    openingBalanceJournal.debitCents !== openingBalanceJournal.creditCents
  ) {
    throw new Error('Balance Movement source Trial Balance is not balanced');
  }

  const assets = emptySection();
  const liabilities = emptySection();
  const directEquity = emptySection();
  const revenue = emptyAmounts();
  const expense = emptyAmounts();
  const accountStableIds = new Set<string>();

  for (const row of trialBalance.accounts) {
    if (accountStableIds.has(row.accountStableId)) {
      throw new Error(
        `Balance Movement duplicate account: ${row.accountStableId}`,
      );
    }
    accountStableIds.add(row.accountStableId);
    assertTrialBalanceRow(row, trialBalance.currency);

    switch (row.accountClass) {
      case AccountingAccountClass.ASSET:
        addSectionRow(assets, row, 'Assets');
        break;
      case AccountingAccountClass.LIABILITY:
        addSectionRow(liabilities, row, 'Liabilities');
        break;
      case AccountingAccountClass.EQUITY:
        addSectionRow(directEquity, row, 'Direct equity');
        break;
      case AccountingAccountClass.REVENUE:
        addAmounts(revenue, rowAmounts(row), 'Revenue');
        break;
      case AccountingAccountClass.EXPENSE:
        addAmounts(expense, rowAmounts(row), 'Expense');
        break;
      default: {
        const exhaustive: never = row.accountClass;
        throw new Error(
          `Unsupported Balance Movement account class: ${exhaustive}`,
        );
      }
    }
  }

  const recordedEarnings: AccountingBalanceMovementAmountsV1 = {
    openingCumulativeCents: safeSubtract(
      revenue.openingCumulativeCents,
      expense.openingCumulativeCents,
      'Opening recorded earnings',
    ),
    periodMovementCents: safeSubtract(
      revenue.periodMovementCents,
      expense.periodMovementCents,
      'Period recorded earnings',
    ),
    closingCumulativeCents: safeSubtract(
      revenue.closingCumulativeCents,
      expense.closingCumulativeCents,
      'Closing recorded earnings',
    ),
  };

  const bridge = {
    opening: bridgeSnapshot({
      assetsCents: assets.openingCumulativeCents,
      liabilitiesCents: liabilities.openingCumulativeCents,
      directEquityCents: directEquity.openingCumulativeCents,
      recordedEarningsCents: recordedEarnings.openingCumulativeCents,
      field: 'Opening bridge',
    }),
    period: bridgeSnapshot({
      assetsCents: assets.periodMovementCents,
      liabilitiesCents: liabilities.periodMovementCents,
      directEquityCents: directEquity.periodMovementCents,
      recordedEarningsCents: recordedEarnings.periodMovementCents,
      field: 'Period bridge',
    }),
    closing: bridgeSnapshot({
      assetsCents: assets.closingCumulativeCents,
      liabilitiesCents: liabilities.closingCumulativeCents,
      directEquityCents: directEquity.closingCumulativeCents,
      recordedEarningsCents: recordedEarnings.closingCumulativeCents,
      field: 'Closing bridge',
    }),
  };

  const bridgeSnapshots = [
    ['opening', bridge.opening],
    ['period', bridge.period],
    ['closing', bridge.closing],
  ] as const;
  for (const [name, snapshot] of bridgeSnapshots) {
    if (snapshot.reconciliationCents !== 0) {
      throw new Error(
        `Balance Movement ${name} bridge does not reconcile: ${snapshot.reconciliationCents}`,
      );
    }
  }

  return {
    version: 1,
    statement: 'BALANCE_MOVEMENT',
    scope: 'WHOLE_LEDGER',
    currency: trialBalance.currency,
    timezone: trialBalance.timezone,
    accountingStartDate: trialBalance.accountingStartDate,
    requestedFrom: trialBalance.requestedFrom,
    requestedTo: trialBalance.requestedTo,
    effectiveFrom: trialBalance.effectiveFrom,
    effectiveTo: trialBalance.effectiveTo,
    openingBasis: {
      kind:
        openingBalanceJournal.entryCount === 0
          ? 'ZERO_MANAGEMENT_OPENING'
          : 'EXPLICIT_OPENING_JOURNAL',
      explicitOpeningJournalEntryCount: openingBalanceJournal.entryCount,
      zeroOpeningDisclaimerRequired: openingBalanceJournal.entryCount === 0,
      absoluteBalanceClaim: false,
    },
    openingBalanceJournal: { ...openingBalanceJournal },
    assets,
    liabilities,
    directEquity,
    earningsBridge: {
      revenue,
      expense,
      recordedEarnings,
    },
    bridge,
    closeStatus: trialBalance.closeStatus,
  };
}
