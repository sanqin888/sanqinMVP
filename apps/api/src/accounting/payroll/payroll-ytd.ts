import type {
  PayrollCalculationYtdInput,
  PayrollNonPeriodicTaxEvidenceYtd,
} from './payroll-calculator.contracts';

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
    throw new Error(
      `finalized PayrollRun ${runStableId} has invalid ${field}`,
    );
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
  const contributionEvidence = (
    output as Record<string, unknown>
  ).contributionEvidence;
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
    cppAdditionalDeductionCents: read(
      'cppTaxDeductionNonPeriodicCents',
    ),
    eiPremiumCents: read('employeeEiNonPeriodicCents'),
  };
};

const safeAdd = (field: string, left: number, right: number): number => {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`payroll YTD overflow in ${field}`);
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

  for (const row of finalizedRuns) {
    ytd.grossEarningsYtdCents = safeAdd(
      'grossEarningsYtdCents',
      ytd.grossEarningsYtdCents,
      requireAmount(row.grossPayCents, 'grossPayCents', row.runStableId),
    );
    ytd.netPayYtdCents = safeAdd(
      'netPayYtdCents',
      ytd.netPayYtdCents,
      requireAmount(row.netPayCents, 'netPayCents', row.runStableId),
    );
    ytd.periodicEarningsYtdCents = safeAdd(
      'periodicEarningsYtdCents',
      ytd.periodicEarningsYtdCents,
      requireAmount(
        row.periodicTaxableEarningsCents,
        'periodicTaxableEarningsCents',
        row.runStableId,
      ),
    );
    const nonPeriodic = requireAmount(
      row.nonPeriodicTaxableEarningsCents,
      'nonPeriodicTaxableEarningsCents',
      row.runStableId,
    );
    ytd.nonPeriodicEarningsYtdCents = safeAdd(
      'nonPeriodicEarningsYtdCents',
      ytd.nonPeriodicEarningsYtdCents,
      nonPeriodic,
    );
    ytd.pensionableEarningsYtdCents = safeAdd(
      'pensionableEarningsYtdCents',
      ytd.pensionableEarningsYtdCents,
      requireAmount(
        row.pensionableEarningsCents,
        'pensionableEarningsCents',
        row.runStableId,
      ),
    );
    ytd.employeeCppYtdCents = safeAdd(
      'employeeCppYtdCents',
      ytd.employeeCppYtdCents,
      requireAmount(row.employeeCppCents, 'employeeCppCents', row.runStableId),
    );
    ytd.employeeCpp2YtdCents = safeAdd(
      'employeeCpp2YtdCents',
      ytd.employeeCpp2YtdCents,
      requireAmount(
        row.employeeCpp2Cents,
        'employeeCpp2Cents',
        row.runStableId,
      ),
    );
    ytd.insurableEarningsYtdCents = safeAdd(
      'insurableEarningsYtdCents',
      ytd.insurableEarningsYtdCents,
      requireAmount(
        row.insurableEarningsCents,
        'insurableEarningsCents',
        row.runStableId,
      ),
    );
    ytd.employeeEiYtdCents = safeAdd(
      'employeeEiYtdCents',
      ytd.employeeEiYtdCents,
      requireAmount(row.employeeEiCents, 'employeeEiCents', row.runStableId),
    );
    ytd.incomeTaxYtdCents = safeAdd(
      'incomeTaxYtdCents',
      ytd.incomeTaxYtdCents,
      requireAmount(row.incomeTaxCents, 'incomeTaxCents', row.runStableId),
    );
    ytd.vacationPayPaidYtdCents = safeAdd(
      'vacationPayPaidYtdCents',
      ytd.vacationPayPaidYtdCents,
      requireAmount(
        row.vacationPayPaidCents,
        'vacationPayPaidCents',
        row.runStableId,
      ),
    );
    ytd.vacationPayAccruedYtdCents = safeAdd(
      'vacationPayAccruedYtdCents',
      ytd.vacationPayAccruedYtdCents,
      requireAmount(
        row.vacationPayAccruedCents,
        'vacationPayAccruedCents',
        row.runStableId,
      ),
    );

    if (nonPeriodic > 0) {
      const evidence = readNonPeriodicEvidence(row);
      nonPeriodicEvidence = {
        cppBaseContributionCents: safeAdd(
          'nonPeriodicTaxEvidence.cppBaseContributionCents',
          nonPeriodicEvidence.cppBaseContributionCents,
          evidence.cppBaseContributionCents,
        ),
        cppAdditionalDeductionCents: safeAdd(
          'nonPeriodicTaxEvidence.cppAdditionalDeductionCents',
          nonPeriodicEvidence.cppAdditionalDeductionCents,
          evidence.cppAdditionalDeductionCents,
        ),
        eiPremiumCents: safeAdd(
          'nonPeriodicTaxEvidence.eiPremiumCents',
          nonPeriodicEvidence.eiPremiumCents,
          evidence.eiPremiumCents,
        ),
      };
    }
  }

  ytd.nonPeriodicTaxEvidenceYtd =
    ytd.nonPeriodicEarningsYtdCents === 0 ? null : nonPeriodicEvidence;
  return ytd;
};
