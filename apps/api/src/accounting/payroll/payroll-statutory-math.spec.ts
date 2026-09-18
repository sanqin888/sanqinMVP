import { PayrollTd1Mode } from './payroll-contracts';
import {
  calculateAnnualOntarioTax,
  calculateEmployeeCpp2Cents,
  calculateEmployeeCppCents,
  calculateEmployeeEiCents,
  calculateFederalBasicPersonalAmountCents,
  calculateOntarioHealthPremiumCents,
  splitCppForTax,
} from './payroll-statutory-math';
import { PAYROLL_STATUTORY_POLICY_CA_ON_2026_01 } from './payroll-statutory-policy';

const policy = PAYROLL_STATUTORY_POLICY_CA_ON_2026_01;

describe('Ontario Payroll 2026 statutory math', () => {
  it('matches the CRA regular-bonus CPP/F5 example split', () => {
    const regularCppCents = calculateEmployeeCppCents({
      pensionableEarningsCents: 100_000,
      employeeCppYtdCents: 0,
      payPeriodsPerYear: 52,
      policy,
    });
    const totalCppCents = calculateEmployeeCppCents({
      pensionableEarningsCents: 350_000,
      employeeCppYtdCents: 0,
      payPeriodsPerYear: 52,
      policy,
    });

    expect(regularCppCents).toBe(5_550);
    expect(totalCppCents).toBe(20_425);

    const split = splitCppForTax({
      totalCppCents,
      regularCppCents,
      totalCpp2Cents: 0,
      periodicPensionableEarningsCents: 100_000,
      totalPensionableEarningsCents: 350_000,
      policy,
    });

    // CRA T4127 2026 regular-bonus example: F5=$34.33,
    // F5A=$9.81 and F5B=$24.52.
    expect(split.totalFirstAdditionalCppCents).toBe(3_433);
    expect(split.cppTaxDeductionRegularCents).toBe(981);
    expect(split.cppTaxDeductionNonPeriodicCents).toBe(2_452);
  });

  it('applies the 2026 EI rate and annual maximum', () => {
    expect(
      calculateEmployeeEiCents({
        insurableEarningsCents: 100_000,
        employeeEiYtdCents: 0,
        policy,
      }),
    ).toBe(1_630);

    expect(
      calculateEmployeeEiCents({
        insurableEarningsCents: 100_000,
        employeeEiYtdCents: policy.ei.maximumEmployeePremiumCents,
        policy,
      }),
    ).toBe(0);
  });

  it('starts CPP2 only above the 2026 YMPE and respects its maximum', () => {
    expect(
      calculateEmployeeCpp2Cents({
        pensionableEarningsCents: 100_000,
        pensionableEarningsYtdCents: 7_400_000,
        employeeCpp2YtdCents: 0,
        policy,
      }),
    ).toBe(1_600);

    expect(
      calculateEmployeeCpp2Cents({
        pensionableEarningsCents: 100_000,
        pensionableEarningsYtdCents: 8_500_000,
        employeeCpp2YtdCents: policy.cpp.maximumCpp2ContributionCents,
        policy,
      }),
    ).toBe(0);
  });

  it('pins the federal no-TD1 BPAF phaseout boundaries', () => {
    expect(
      calculateFederalBasicPersonalAmountCents(18_144_000, policy),
    ).toBe(1_645_200);
    expect(
      calculateFederalBasicPersonalAmountCents(25_848_200, policy),
    ).toBe(1_482_900);
  });

  it('matches Ontario Health Premium breakpoints', () => {
    expect(calculateOntarioHealthPremiumCents(2_000_000)).toBe(0);
    expect(calculateOntarioHealthPremiumCents(2_500_000)).toBe(30_000);
    expect(calculateOntarioHealthPremiumCents(3_600_000)).toBe(30_000);
    expect(calculateOntarioHealthPremiumCents(4_800_000)).toBe(45_000);
    expect(calculateOntarioHealthPremiumCents(7_200_000)).toBe(60_000);
    expect(calculateOntarioHealthPremiumCents(20_000_000)).toBe(75_000);
    expect(calculateOntarioHealthPremiumCents(20_600_000)).toBe(90_000);
  });

  it('reproduces the exact Option 1 tax behind the published weekly table case', () => {
    const tax = calculateAnnualOntarioTax({
      annualTaxableIncomeCents: 3_169_504,
      annualGrossEmploymentIncomeCents: 3_198_000,
      federalTd1Mode: PayrollTd1Mode.FILED_TOTAL_CLAIM,
      federalTd1TotalClaimCents: 1_645_200,
      ontarioTd1Mode: PayrollTd1Mode.FILED_TOTAL_CLAIM,
      ontarioTd1TotalClaimCents: 1_298_900,
      annualBaseCppCreditCents: 140_986,
      annualEiCreditCents: 52_104,
      policy,
    });

    expect(tax.federalAnnualTaxCents).toBe(165_356);
    expect(tax.ontarioAnnualTaxCents).toBe(114_715);
  });
});
