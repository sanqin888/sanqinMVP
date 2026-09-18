import { aggregatePayrollYtd, payrollYtdFromOpening } from './payroll-ytd';

describe('Payroll canonical YTD aggregation', () => {
  const opening = {
    grossEarningsYtdCents: 1_000_000,
    netPayYtdCents: 800_000,
    periodicEarningsYtdCents: 900_000,
    nonPeriodicEarningsYtdCents: 100_000,
    pensionableEarningsYtdCents: 1_000_000,
    employeeCppYtdCents: 50_000,
    employeeCpp2YtdCents: 0,
    insurableEarningsYtdCents: 1_000_000,
    employeeEiYtdCents: 20_000,
    incomeTaxYtdCents: 130_000,
    vacationPayPaidYtdCents: 40_000,
    vacationPayAccruedYtdCents: 0,
    nonPeriodicCppBaseContributionYtdCents: 2_000,
    nonPeriodicCppAdditionalDeductionYtdCents: 500,
    nonPeriodicEiPremiumYtdCents: 600,
  };

  it('preserves opening non-periodic contribution evidence', () => {
    expect(payrollYtdFromOpening(opening).nonPeriodicTaxEvidenceYtd).toEqual({
      cppBaseContributionCents: 2_000,
      cppAdditionalDeductionCents: 500,
      eiPremiumCents: 600,
    });
  });

  it('rebuilds YTD from opening plus finalized run facts', () => {
    const ytd = aggregatePayrollYtd(opening, [
      {
        runStableId: 'run_1',
        grossPayCents: 120_000,
        netPayCents: 90_000,
        periodicTaxableEarningsCents: 110_000,
        nonPeriodicTaxableEarningsCents: 10_000,
        pensionableEarningsCents: 120_000,
        employeeCppCents: 7_000,
        employeeCpp2Cents: 0,
        insurableEarningsCents: 120_000,
        employeeEiCents: 2_000,
        incomeTaxCents: 21_000,
        vacationPayPaidCents: 10_000,
        vacationPayAccruedCents: 0,
        calculationOutputJson: {
          contributionEvidence: {
            employeeCppBaseNonPeriodicCents: 300,
            cppTaxDeductionNonPeriodicCents: 80,
            employeeEiNonPeriodicCents: 120,
          },
        },
      },
    ]);

    expect(ytd).toEqual({
      grossEarningsYtdCents: 1_120_000,
      netPayYtdCents: 890_000,
      periodicEarningsYtdCents: 1_010_000,
      nonPeriodicEarningsYtdCents: 110_000,
      pensionableEarningsYtdCents: 1_120_000,
      employeeCppYtdCents: 57_000,
      employeeCpp2YtdCents: 0,
      insurableEarningsYtdCents: 1_120_000,
      employeeEiYtdCents: 22_000,
      incomeTaxYtdCents: 151_000,
      vacationPayPaidYtdCents: 50_000,
      vacationPayAccruedYtdCents: 0,
      nonPeriodicTaxEvidenceYtd: {
        cppBaseContributionCents: 2_300,
        cppAdditionalDeductionCents: 580,
        eiPremiumCents: 720,
      },
    });
  });

  it('keeps non-periodic evidence null when no non-periodic earnings exist', () => {
    expect(
      payrollYtdFromOpening({
        ...opening,
        nonPeriodicEarningsYtdCents: 0,
        nonPeriodicCppBaseContributionYtdCents: 0,
        nonPeriodicCppAdditionalDeductionYtdCents: 0,
        nonPeriodicEiPremiumYtdCents: 0,
      }).nonPeriodicTaxEvidenceYtd,
    ).toBeNull();
  });
});
