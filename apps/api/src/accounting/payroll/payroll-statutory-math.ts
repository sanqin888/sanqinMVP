import { PayrollTd1Mode } from './payroll-contracts';
import type { OntarioPayrollStatutoryPolicy } from './payroll-statutory-policy';

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

const toSafeNumber = (value: bigint, field: string): number => {
  if (value > MAX_SAFE_BIGINT || value < -MAX_SAFE_BIGINT) {
    throw new Error(`${field} exceeds Number.MAX_SAFE_INTEGER`);
  }
  return Number(value);
};

export const roundHalfUpRatio = (
  numerator: bigint,
  denominator: bigint,
  field = 'ratio',
): number => {
  if (denominator <= 0n) {
    throw new Error(`${field} denominator must be positive`);
  }

  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const rounded = (absolute * 2n + denominator) / (2n * denominator);
  return toSafeNumber(sign * rounded, field);
};

export const multiplyRatioCents = (
  valueCents: number,
  numerator: number,
  denominator: number,
  field = 'money',
): number =>
  roundHalfUpRatio(
    BigInt(valueCents) * BigInt(numerator),
    BigInt(denominator),
    field,
  );

export const multiplyMoney = (
  valueCents: number,
  multiplier: number,
  field = 'money',
): number => toSafeNumber(BigInt(valueCents) * BigInt(multiplier), field);

export const sumMoney = (field: string, ...values: number[]): number =>
  toSafeNumber(
    values.reduce((sum, value) => sum + BigInt(value), 0n),
    field,
  );

export const calculateEmployeeCppCents = ({
  pensionableEarningsCents,
  employeeCppYtdCents,
  payPeriodsPerYear,
  policy,
}: {
  pensionableEarningsCents: number;
  employeeCppYtdCents: number;
  payPeriodsPerYear: number;
  policy: OntarioPayrollStatutoryPolicy;
}): number => {
  const remainingMaximum = Math.max(
    0,
    policy.cpp.maximumTotalContributionCents - employeeCppYtdCents,
  );
  if (remainingMaximum === 0 || pensionableEarningsCents === 0) {
    return 0;
  }

  const afterExemption =
    BigInt(pensionableEarningsCents) * BigInt(payPeriodsPerYear) -
    BigInt(policy.cpp.yearlyBasicExemptionCents);
  if (afterExemption <= 0n) {
    return 0;
  }

  const formulaAmount = roundHalfUpRatio(
    afterExemption * BigInt(policy.cpp.totalRateBasisPoints),
    BigInt(payPeriodsPerYear) * 10_000n,
    'employeeCppCents',
  );

  return Math.min(remainingMaximum, Math.max(0, formulaAmount));
};

export const calculateEmployeeCpp2Cents = ({
  pensionableEarningsCents,
  pensionableEarningsYtdCents,
  employeeCpp2YtdCents,
  policy,
}: {
  pensionableEarningsCents: number;
  pensionableEarningsYtdCents: number;
  employeeCpp2YtdCents: number;
  policy: OntarioPayrollStatutoryPolicy;
}): number => {
  const remainingMaximum = Math.max(
    0,
    policy.cpp.maximumCpp2ContributionCents - employeeCpp2YtdCents,
  );
  if (remainingMaximum === 0 || pensionableEarningsCents === 0) {
    return 0;
  }

  const threshold = Math.max(pensionableEarningsYtdCents, policy.cpp.ympeCents);
  const contributionEarnings = Math.max(
    0,
    pensionableEarningsYtdCents + pensionableEarningsCents - threshold,
  );
  const formulaAmount = multiplyRatioCents(
    contributionEarnings,
    policy.cpp.cpp2RateBasisPoints,
    10_000,
    'employeeCpp2Cents',
  );

  return Math.min(remainingMaximum, formulaAmount);
};

export const calculateEmployeeEiCents = ({
  insurableEarningsCents,
  employeeEiYtdCents,
  policy,
}: {
  insurableEarningsCents: number;
  employeeEiYtdCents: number;
  policy: OntarioPayrollStatutoryPolicy;
}): number => {
  const remainingMaximum = Math.max(
    0,
    policy.ei.maximumEmployeePremiumCents - employeeEiYtdCents,
  );
  if (remainingMaximum === 0 || insurableEarningsCents === 0) {
    return 0;
  }

  return Math.min(
    remainingMaximum,
    multiplyRatioCents(
      insurableEarningsCents,
      policy.ei.employeeRateBasisPoints,
      10_000,
      'employeeEiCents',
    ),
  );
};

export const splitCppForTax = ({
  totalCppCents,
  regularCppCents,
  totalCpp2Cents,
  periodicPensionableEarningsCents,
  totalPensionableEarningsCents,
  policy,
}: {
  totalCppCents: number;
  regularCppCents: number;
  totalCpp2Cents: number;
  periodicPensionableEarningsCents: number;
  totalPensionableEarningsCents: number;
  policy: OntarioPayrollStatutoryPolicy;
}) => {
  const totalFirstAdditionalCppCents = multiplyRatioCents(
    totalCppCents,
    policy.cpp.firstAdditionalRateBasisPoints,
    policy.cpp.totalRateBasisPoints,
    'totalFirstAdditionalCppCents',
  );
  const nonPeriodicCppCents = Math.max(0, totalCppCents - regularCppCents);
  const regularBaseCppCents = multiplyRatioCents(
    regularCppCents,
    policy.cpp.baseRateBasisPoints,
    policy.cpp.totalRateBasisPoints,
    'regularBaseCppCents',
  );
  const nonPeriodicBaseCppCents = multiplyRatioCents(
    nonPeriodicCppCents,
    policy.cpp.baseRateBasisPoints,
    policy.cpp.totalRateBasisPoints,
    'nonPeriodicBaseCppCents',
  );
  const totalBaseCppCents = regularBaseCppCents + nonPeriodicBaseCppCents;

  const totalTaxDeductionCents = totalFirstAdditionalCppCents + totalCpp2Cents;
  const cppTaxDeductionRegularCents =
    totalPensionableEarningsCents === 0
      ? 0
      : multiplyRatioCents(
          totalTaxDeductionCents,
          periodicPensionableEarningsCents,
          totalPensionableEarningsCents,
          'cppTaxDeductionRegularCents',
        );
  const cppTaxDeductionNonPeriodicCents = Math.max(
    0,
    totalTaxDeductionCents - cppTaxDeductionRegularCents,
  );

  return {
    totalFirstAdditionalCppCents,
    totalBaseCppCents,
    regularBaseCppCents,
    nonPeriodicBaseCppCents,
    cppTaxDeductionRegularCents,
    cppTaxDeductionNonPeriodicCents,
  };
};

const taxBracket = (
  annualTaxableIncomeCents: number,
  brackets: OntarioPayrollStatutoryPolicy['federal']['brackets'],
) => {
  let selected = brackets[0];
  for (const bracket of brackets) {
    if (annualTaxableIncomeCents >= bracket.thresholdCents) {
      selected = bracket;
    }
  }
  return selected;
};

export const calculateFederalBasicPersonalAmountCents = (
  annualNetIncomeCents: number,
  policy: OntarioPayrollStatutoryPolicy,
): number => {
  const basic = policy.federal.basicPersonalAmount;
  if (annualNetIncomeCents <= basic.phaseoutStartCents) {
    return basic.maximumCents;
  }
  if (annualNetIncomeCents >= basic.phaseoutEndCents) {
    return basic.minimumCents;
  }

  const reduction = multiplyRatioCents(
    annualNetIncomeCents - basic.phaseoutStartCents,
    basic.phaseoutReductionNumerator,
    basic.phaseoutReductionDenominator,
    'federalBasicPersonalAmountReductionCents',
  );

  return Math.max(basic.minimumCents, basic.maximumCents - reduction);
};

export const calculateOntarioHealthPremiumCents = (
  annualTaxableIncomeCents: number,
): number => {
  if (annualTaxableIncomeCents <= 2_000_000) {
    return 0;
  }
  if (annualTaxableIncomeCents <= 3_600_000) {
    return Math.min(
      30_000,
      multiplyRatioCents(
        annualTaxableIncomeCents - 2_000_000,
        600,
        10_000,
        'ontarioHealthPremiumCents',
      ),
    );
  }
  if (annualTaxableIncomeCents <= 4_800_000) {
    return Math.min(
      45_000,
      30_000 +
        multiplyRatioCents(
          annualTaxableIncomeCents - 3_600_000,
          600,
          10_000,
          'ontarioHealthPremiumCents',
        ),
    );
  }
  if (annualTaxableIncomeCents <= 7_200_000) {
    return Math.min(
      60_000,
      45_000 +
        multiplyRatioCents(
          annualTaxableIncomeCents - 4_800_000,
          2_500,
          10_000,
          'ontarioHealthPremiumCents',
        ),
    );
  }
  if (annualTaxableIncomeCents <= 20_000_000) {
    return Math.min(
      75_000,
      60_000 +
        multiplyRatioCents(
          annualTaxableIncomeCents - 7_200_000,
          2_500,
          10_000,
          'ontarioHealthPremiumCents',
        ),
    );
  }

  return Math.min(
    90_000,
    75_000 +
      multiplyRatioCents(
        annualTaxableIncomeCents - 20_000_000,
        2_500,
        10_000,
        'ontarioHealthPremiumCents',
      ),
  );
};

const calculateOntarioSurtaxCents = (
  basicOntarioTaxCents: number,
  policy: OntarioPayrollStatutoryPolicy,
): number => {
  const { firstThresholdCents, secondThresholdCents } = policy.ontario.surtax;

  if (basicOntarioTaxCents <= firstThresholdCents) {
    return 0;
  }
  if (basicOntarioTaxCents <= secondThresholdCents) {
    return multiplyRatioCents(
      basicOntarioTaxCents - firstThresholdCents,
      policy.ontario.surtax.firstRateBasisPoints,
      10_000,
      'ontarioSurtaxCents',
    );
  }

  return (
    multiplyRatioCents(
      basicOntarioTaxCents - firstThresholdCents,
      policy.ontario.surtax.firstRateBasisPoints,
      10_000,
      'ontarioFirstSurtaxCents',
    ) +
    multiplyRatioCents(
      basicOntarioTaxCents - secondThresholdCents,
      policy.ontario.surtax.secondRateBasisPoints,
      10_000,
      'ontarioSecondSurtaxCents',
    )
  );
};

export type AnnualOntarioTaxInput = {
  annualTaxableIncomeCents: number;
  annualGrossEmploymentIncomeCents: number;
  federalTd1Mode: PayrollTd1Mode;
  federalTd1TotalClaimCents: number | null;
  ontarioTd1Mode: PayrollTd1Mode;
  ontarioTd1TotalClaimCents: number | null;
  annualBaseCppCreditCents: number;
  annualEiCreditCents: number;
  policy: OntarioPayrollStatutoryPolicy;
};

export const calculateAnnualOntarioTax = (input: AnnualOntarioTaxInput) => {
  const { policy } = input;
  const federalClaimCents =
    input.federalTd1Mode === PayrollTd1Mode.NO_FORM_DEFAULT
      ? calculateFederalBasicPersonalAmountCents(
          input.annualTaxableIncomeCents,
          policy,
        )
      : (input.federalTd1TotalClaimCents ?? 0);
  const ontarioClaimCents =
    input.ontarioTd1Mode === PayrollTd1Mode.NO_FORM_DEFAULT
      ? policy.ontario.basicPersonalAmountCents
      : (input.ontarioTd1TotalClaimCents ?? 0);

  const federalBracket = taxBracket(
    input.annualTaxableIncomeCents,
    policy.federal.brackets,
  );
  const federalGrossTaxCents =
    multiplyRatioCents(
      input.annualTaxableIncomeCents,
      federalBracket.rateBasisPoints,
      10_000,
      'federalGrossTaxCents',
    ) - federalBracket.constantCents;
  const federalPersonalCreditCents = multiplyRatioCents(
    federalClaimCents,
    policy.federal.lowestRateBasisPoints,
    10_000,
    'federalPersonalCreditCents',
  );
  const federalCppEiCreditCents = multiplyRatioCents(
    input.annualBaseCppCreditCents + input.annualEiCreditCents,
    policy.federal.lowestRateBasisPoints,
    10_000,
    'federalCppEiCreditCents',
  );
  const federalEmploymentCreditCents = Math.min(
    multiplyRatioCents(
      input.annualGrossEmploymentIncomeCents,
      policy.federal.lowestRateBasisPoints,
      10_000,
      'federalEmploymentCreditIncomeCents',
    ),
    multiplyRatioCents(
      policy.federal.canadaEmploymentAmountCents,
      policy.federal.lowestRateBasisPoints,
      10_000,
      'federalEmploymentCreditMaximumCents',
    ),
  );
  const federalAnnualTaxCents = Math.max(
    0,
    federalGrossTaxCents -
      federalPersonalCreditCents -
      federalCppEiCreditCents -
      federalEmploymentCreditCents,
  );

  const ontarioBracket = taxBracket(
    input.annualTaxableIncomeCents,
    policy.ontario.brackets,
  );
  const ontarioGrossTaxCents =
    multiplyRatioCents(
      input.annualTaxableIncomeCents,
      ontarioBracket.rateBasisPoints,
      10_000,
      'ontarioGrossTaxCents',
    ) - ontarioBracket.constantCents;
  const ontarioPersonalCreditCents = multiplyRatioCents(
    ontarioClaimCents,
    policy.ontario.lowestRateBasisPoints,
    10_000,
    'ontarioPersonalCreditCents',
  );
  const ontarioCppEiCreditCents = multiplyRatioCents(
    input.annualBaseCppCreditCents + input.annualEiCreditCents,
    policy.ontario.lowestRateBasisPoints,
    10_000,
    'ontarioCppEiCreditCents',
  );
  const basicOntarioTaxCents = Math.max(
    0,
    ontarioGrossTaxCents - ontarioPersonalCreditCents - ontarioCppEiCreditCents,
  );
  const ontarioSurtaxCents = calculateOntarioSurtaxCents(
    basicOntarioTaxCents,
    policy,
  );
  const ontarioHealthPremiumCents = calculateOntarioHealthPremiumCents(
    input.annualTaxableIncomeCents,
  );

  // ON_HOURLY_SIMPLE_V1 deliberately uses Y=0. T4127 explicitly permits
  // omitting Y; any over-deduction is reconciled on the employee's return.
  const taxBeforeReduction = basicOntarioTaxCents + ontarioSurtaxCents;
  const taxReductionCandidate =
    2 * policy.ontario.taxReductionBaseCents - taxBeforeReduction;
  const ontarioTaxReductionCents = Math.max(
    0,
    Math.min(taxBeforeReduction, taxReductionCandidate),
  );
  const ontarioAnnualTaxCents = Math.max(
    0,
    taxBeforeReduction + ontarioHealthPremiumCents - ontarioTaxReductionCents,
  );

  return {
    federalAnnualTaxCents,
    ontarioAnnualTaxCents,
    ontarioHealthPremiumCents,
  };
};
