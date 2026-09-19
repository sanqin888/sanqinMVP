import type {
  PayrollCalculationYtdInput,
  PayrollNonPeriodicTaxEvidenceYtd,
} from './payroll-calculator.contracts';
import {
  PayrollRunStatus,
  type PayrollRunStatus as PayrollRunStatusType,
} from './payroll-contracts';

export type PayrollYtdOpeningRecord = {
  grossEarningsYtdCents: number;
  netPayYtdCents: number;
  periodicEarningsYtdCents: number;
  nonPeriodicEarningsYtdCents: number;
  pensionableEarningsYtdCents: number;
  employeeCppYtdCents: number;
  employeeCpp2YtdCents: number;
  insurableEarningsYtdCents: number;
  employeeEiYtdCents: number;
  incomeTaxYtdCents: number;
  vacationPayPaidYtdCents: number;
  vacationPayAccruedYtdCents: number;
  nonPeriodicCppBaseContributionYtdCents: number;
  nonPeriodicCppAdditionalDeductionYtdCents: number;
  nonPeriodicEiPremiumYtdCents: number;
};

export type PayrollFinalizedRunYtdRecord = {
  runStableId: string;
  status: PayrollRunStatusType;
  reversalJournalEntryStableId: string | null;
  reversedAt: Date | null;
  grossPayCents: number | null;
  netPayCents: number | null;
  periodicTaxableEarningsCents: number | null;
  nonPeriodicTaxableEarningsCents: number | null;
  pensionableEarningsCents: number | null;
  employeeCppCents: number | null;
  employeeCpp2Cents: number | null;
  insurableEarningsCents: number | null;
  employeeEiCents: number | null;
  incomeTaxCents: number | null;
  vacationPayPaidCents: number | null;
  vacationPayAccruedCents: number | null;
  calculationOutputJson: unknown;
};

const requireAmount = (
  value: number | null,
  field: string,
  runStableId: string,
): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`finalized PayrollRun ${runStableId} has invalid ${field}`);
  }
  return value as number;
};

const readNonPeriodicEvidence = (
  row: PayrollFinalizedRunYtdRecord,
): PayrollNonPeriodicTaxEvidenceYtd => {
  const output = row.calculationOutputJson;
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    throw new Error(
      `finalized PayrollRun ${row.runStableId} is missing calculation output evidence`,
    );
  }
  const contributionEvidence = (output as Record<string, unknown>)
    .contributionEvidence;
  if (
    !contributionEvidence ||
    typeof contributionEvidence !== 'object' ||
    Array.isArray(contributionEvidence)
  ) {
    throw new Error(
      `finalized PayrollRun ${row.runStableId} is missing contribution evidence`,
    );
  }
  const evidence = contributionEvidence as Record<string, unknown>;
  const read = (field: string): number => {
    const value = evidence[field];
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
      throw new Error(
        `finalized PayrollRun ${row.runStableId} has invalid ${field}`,
      );
    }
    return value as number;
  };

  return {
    cppBaseContributionCents: read('employeeCppBaseNonPeriodicCents'),
    cppAdditionalDeductionCents: read('cppTaxDeductionNonPeriodicCents'),
    eiPremiumCents: read('employeeEiNonPeriodicCents'),
  };
};

const safeApply = (
  field: string,
  left: number,
  amount: number,
  direction: 1 | -1,
): number => {
  const result = left + amount * direction;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`payroll YTD effect is invalid in ${field}`);
  }
  return result;
};

export const emptyPayrollYtd = (): PayrollCalculationYtdInput => ({
  grossEarningsYtdCents: 0,
  netPayYtdCents: 0,
  periodicEarningsYtdCents: 0,
  nonPeriodicEarningsYtdCents: 0,
  pensionableEarningsYtdCents: 0,
  employeeCppYtdCents: 0,
  employeeCpp2YtdCents: 0,
  insurableEarningsYtdCents: 0,
  employeeEiYtdCents: 0,
  incomeTaxYtdCents: 0,
  vacationPayPaidYtdCents: 0,
  vacationPayAccruedYtdCents: 0,
  nonPeriodicTaxEvidenceYtd: null,
});

export const payrollYtdFromOpening = (
  opening: PayrollYtdOpeningRecord | null,
): PayrollCalculationYtdInput => {
  if (!opening) return emptyPayrollYtd();

  return {
    grossEarningsYtdCents: opening.grossEarningsYtdCents,
    netPayYtdCents: opening.netPayYtdCents,
    periodicEarningsYtdCents: opening.periodicEarningsYtdCents,
    nonPeriodicEarningsYtdCents: opening.nonPeriodicEarningsYtdCents,
    pensionableEarningsYtdCents: opening.pensionableEarningsYtdCents,
    employeeCppYtdCents: opening.employeeCppYtdCents,
    employeeCpp2YtdCents: opening.employeeCpp2YtdCents,
    insurableEarningsYtdCents: opening.insurableEarningsYtdCents,
    employeeEiYtdCents: opening.employeeEiYtdCents,
    incomeTaxYtdCents: opening.incomeTaxYtdCents,
    vacationPayPaidYtdCents: opening.vacationPayPaidYtdCents,
    vacationPayAccruedYtdCents: opening.vacationPayAccruedYtdCents,
    nonPeriodicTaxEvidenceYtd:
      opening.nonPeriodicEarningsYtdCents === 0
        ? null
        : {
            cppBaseContributionCents:
              opening.nonPeriodicCppBaseContributionYtdCents,
            cppAdditionalDeductionCents:
              opening.nonPeriodicCppAdditionalDeductionYtdCents,
            eiPremiumCents: opening.nonPeriodicEiPremiumYtdCents,
          },
  };
};

export const aggregatePayrollYtd = (
  opening: PayrollYtdOpeningRecord | null,
  finalizedRuns: readonly PayrollFinalizedRunYtdRecord[],
): PayrollCalculationYtdInput => {
  const ytd = payrollYtdFromOpening(opening);
  let nonPeriodicEvidence: PayrollNonPeriodicTaxEvidenceYtd =
    ytd.nonPeriodicTaxEvidenceYtd ?? {
      cppBaseContributionCents: 0,
      cppAdditionalDeductionCents: 0,
      eiPremiumCents: 0,
    };

  const applyRunEffect = (
    row: PayrollFinalizedRunYtdRecord,
    direction: 1 | -1,
  ): void => {
    ytd.grossEarningsYtdCents = safeApply(
      'grossEarningsYtdCents',
      ytd.grossEarningsYtdCents,
      requireAmount(row.grossPayCents, 'grossPayCents', row.runStableId),
      direction,
    );
    ytd.netPayYtdCents = safeApply(
      'netPayYtdCents',
      ytd.netPayYtdCents,
      requireAmount(row.netPayCents, 'netPayCents', row.runStableId),
      direction,
    );
    ytd.periodicEarningsYtdCents = safeApply(
      'periodicEarningsYtdCents',
      ytd.periodicEarningsYtdCents,
      requireAmount(
        row.periodicTaxableEarningsCents,
        'periodicTaxableEarningsCents',
        row.runStableId,
      ),
      direction,
    );
    const nonPeriodic = requireAmount(
      row.nonPeriodicTaxableEarningsCents,
      'nonPeriodicTaxableEarningsCents',
      row.runStableId,
    );
    ytd.nonPeriodicEarningsYtdCents = safeApply(
      'nonPeriodicEarningsYtdCents',
      ytd.nonPeriodicEarningsYtdCents,
      nonPeriodic,
      direction,
    );
    ytd.pensionableEarningsYtdCents = safeApply(
      'pensionableEarningsYtdCents',
      ytd.pensionableEarningsYtdCents,
      requireAmount(
        row.pensionableEarningsCents,
        'pensionableEarningsCents',
        row.runStableId,
      ),
      direction,
    );
    ytd.employeeCppYtdCents = safeApply(
      'employeeCppYtdCents',
      ytd.employeeCppYtdCents,
      requireAmount(row.employeeCppCents, 'employeeCppCents', row.runStableId),
      direction,
    );
    ytd.employeeCpp2YtdCents = safeApply(
      'employeeCpp2YtdCents',
      ytd.employeeCpp2YtdCents,
      requireAmount(
        row.employeeCpp2Cents,
        'employeeCpp2Cents',
        row.runStableId,
      ),
      direction,
    );
    ytd.insurableEarningsYtdCents = safeApply(
      'insurableEarningsYtdCents',
      ytd.insurableEarningsYtdCents,
      requireAmount(
        row.insurableEarningsCents,
        'insurableEarningsCents',
        row.runStableId,
      ),
      direction,
    );
    ytd.employeeEiYtdCents = safeApply(
      'employeeEiYtdCents',
      ytd.employeeEiYtdCents,
      requireAmount(row.employeeEiCents, 'employeeEiCents', row.runStableId),
      direction,
    );
    ytd.incomeTaxYtdCents = safeApply(
      'incomeTaxYtdCents',
      ytd.incomeTaxYtdCents,
      requireAmount(row.incomeTaxCents, 'incomeTaxCents', row.runStableId),
      direction,
    );
    ytd.vacationPayPaidYtdCents = safeApply(
      'vacationPayPaidYtdCents',
      ytd.vacationPayPaidYtdCents,
      requireAmount(
        row.vacationPayPaidCents,
        'vacationPayPaidCents',
        row.runStableId,
      ),
      direction,
    );
    ytd.vacationPayAccruedYtdCents = safeApply(
      'vacationPayAccruedYtdCents',
      ytd.vacationPayAccruedYtdCents,
      requireAmount(
        row.vacationPayAccruedCents,
        'vacationPayAccruedCents',
        row.runStableId,
      ),
      direction,
    );

    if (nonPeriodic > 0) {
      const evidence = readNonPeriodicEvidence(row);
      nonPeriodicEvidence = {
        cppBaseContributionCents: safeApply(
          'nonPeriodicTaxEvidence.cppBaseContributionCents',
          nonPeriodicEvidence.cppBaseContributionCents,
          evidence.cppBaseContributionCents,
          direction,
        ),
        cppAdditionalDeductionCents: safeApply(
          'nonPeriodicTaxEvidence.cppAdditionalDeductionCents',
          nonPeriodicEvidence.cppAdditionalDeductionCents,
          evidence.cppAdditionalDeductionCents,
          direction,
        ),
        eiPremiumCents: safeApply(
          'nonPeriodicTaxEvidence.eiPremiumCents',
          nonPeriodicEvidence.eiPremiumCents,
          evidence.eiPremiumCents,
          direction,
        ),
      };
    }
  };

  for (const row of finalizedRuns) {
    if (
      row.status !== PayrollRunStatus.APPROVED &&
      row.status !== PayrollRunStatus.POSTED &&
      row.status !== PayrollRunStatus.REVERSED
    ) {
      throw new Error(
        `PayrollRun ${row.runStableId} has non-finalized YTD status ${row.status}`,
      );
    }

    if (
      row.status === PayrollRunStatus.REVERSED &&
      (!row.reversalJournalEntryStableId || !row.reversedAt)
    ) {
      throw new Error(
        `REVERSED PayrollRun ${row.runStableId} is missing reversal evidence`,
      );
    }

    applyRunEffect(row, 1);
    if (row.status === PayrollRunStatus.REVERSED) {
      applyRunEffect(row, -1);
    }
  }

  ytd.nonPeriodicTaxEvidenceYtd =
    ytd.nonPeriodicEarningsYtdCents === 0 ? null : nonPeriodicEvidence;
  return ytd;
};
