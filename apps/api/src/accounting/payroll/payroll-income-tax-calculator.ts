import { PayrollIncomeTaxTreatment } from './payroll-contracts';
import type {
  OntarioHourlyPayrollCalculationInput,
  PayrollNonPeriodicTaxEvidenceYtd,
  PayrollTaxEvidence,
} from './payroll-calculator.contracts';
import {
  calculateAnnualOntarioTax,
  multiplyMoney,
  multiplyRatioCents,
  roundHalfUpRatio,
  sumMoney,
} from './payroll-statutory-math';
import type { OntarioPayrollStatutoryPolicy } from './payroll-statutory-policy';

const calculateAnnualCreditInputs = ({
  regularCppCents,
  nonPeriodicCppCents,
  regularEiCents,
  nonPeriodicEiCents,
  priorNonPeriodicEvidence,
  input,
  policy,
  includeCurrentNonPeriodic,
}: {
  regularCppCents: number;
  nonPeriodicCppCents: number;
  regularEiCents: number;
  nonPeriodicEiCents: number;
  priorNonPeriodicEvidence: PayrollNonPeriodicTaxEvidenceYtd;
  input: OntarioHourlyPayrollCalculationInput;
  policy: OntarioPayrollStatutoryPolicy;
  includeCurrentNonPeriodic: boolean;
}) => {
  const ytdBaseCppCents = multiplyRatioCents(
    input.ytd.employeeCppYtdCents,
    policy.cpp.baseRateBasisPoints,
    policy.cpp.totalRateBasisPoints,
    'ytdBaseCppCents',
  );
  const annualizedRegularBaseCppCents = multiplyRatioCents(
    multiplyMoney(
      regularCppCents,
      input.payPeriodsPerYear,
      'annualizedRegularCppCents',
    ),
    policy.cpp.baseRateBasisPoints,
    policy.cpp.totalRateBasisPoints,
    'annualizedRegularBaseCppCents',
  );
  const currentRegularBaseCppCents = multiplyRatioCents(
    regularCppCents,
    policy.cpp.baseRateBasisPoints,
    policy.cpp.totalRateBasisPoints,
    'currentRegularBaseCppCents',
  );
  const currentNonPeriodicBaseCppCents = multiplyRatioCents(
    nonPeriodicCppCents,
    policy.cpp.baseRateBasisPoints,
    policy.cpp.totalRateBasisPoints,
    'currentNonPeriodicBaseCppCents',
  );
  const projectedBaseCppCents = sumMoney(
    'projectedBaseCppCents',
    annualizedRegularBaseCppCents,
    priorNonPeriodicEvidence.cppBaseContributionCents,
    includeCurrentNonPeriodic ? currentNonPeriodicBaseCppCents : 0,
  );
  const currentBaseCppCents =
    currentRegularBaseCppCents +
    (includeCurrentNonPeriodic ? currentNonPeriodicBaseCppCents : 0);
  const annualBaseCppCreditCents = Math.min(
    policy.cpp.maximumBaseContributionCents,
    Math.max(projectedBaseCppCents, ytdBaseCppCents + currentBaseCppCents),
  );

  const projectedEiCents = sumMoney(
    'projectedEiCents',
    multiplyMoney(
      regularEiCents,
      input.payPeriodsPerYear,
      'annualizedRegularEiCents',
    ),
    priorNonPeriodicEvidence.eiPremiumCents,
    includeCurrentNonPeriodic ? nonPeriodicEiCents : 0,
  );
  const annualEiCreditCents = Math.min(
    policy.ei.maximumEmployeePremiumCents,
    Math.max(
      projectedEiCents,
      input.ytd.employeeEiYtdCents +
        regularEiCents +
        (includeCurrentNonPeriodic ? nonPeriodicEiCents : 0),
    ),
  );

  return { annualBaseCppCreditCents, annualEiCreditCents };
};

export type PayrollIncomeTaxCalculationInput = {
  input: OntarioHourlyPayrollCalculationInput;
  policy: OntarioPayrollStatutoryPolicy;
  priorNonPeriodicEvidence: PayrollNonPeriodicTaxEvidenceYtd;
  periodicTaxableEarningsCents: number;
  nonPeriodicTaxableEarningsCents: number;
  cppTaxDeductionRegularCents: number;
  cppTaxDeductionNonPeriodicCents: number;
  regularCppCents: number;
  nonPeriodicCppCents: number;
  regularEiCents: number;
  nonPeriodicEiCents: number;
};

export const calculatePayrollIncomeTax = ({
  input,
  policy,
  priorNonPeriodicEvidence,
  periodicTaxableEarningsCents,
  nonPeriodicTaxableEarningsCents,
  cppTaxDeductionRegularCents,
  cppTaxDeductionNonPeriodicCents,
  regularCppCents,
  nonPeriodicCppCents,
  regularEiCents,
  nonPeriodicEiCents,
}: PayrollIncomeTaxCalculationInput): {
  incomeTaxCents: number;
  taxEvidence: PayrollTaxEvidence;
} => {
  const periodicAnnualTaxableIncomeCents = multiplyMoney(
    Math.max(0, periodicTaxableEarningsCents - cppTaxDeductionRegularCents),
    input.payPeriodsPerYear,
    'periodicAnnualTaxableIncomeCents',
  );
  const priorNonPeriodicNetCents = Math.max(
    0,
    input.ytd.nonPeriodicEarningsYtdCents -
      priorNonPeriodicEvidence.cppAdditionalDeductionCents,
  );
  const currentNonPeriodicNetCents = Math.max(
    0,
    nonPeriodicTaxableEarningsCents - cppTaxDeductionNonPeriodicCents,
  );
  const annualTaxableIncomeBeforeCurrentNonPeriodicCents = sumMoney(
    'annualTaxableIncomeBeforeCurrentNonPeriodicCents',
    periodicAnnualTaxableIncomeCents,
    priorNonPeriodicNetCents,
  );
  const annualTaxableIncomeWithNonPeriodicCents = sumMoney(
    'annualTaxableIncomeWithNonPeriodicCents',
    annualTaxableIncomeBeforeCurrentNonPeriodicCents,
    currentNonPeriodicNetCents,
  );

  const periodicCredits = calculateAnnualCreditInputs({
    regularCppCents,
    nonPeriodicCppCents,
    regularEiCents,
    nonPeriodicEiCents,
    priorNonPeriodicEvidence: {
      cppBaseContributionCents: 0,
      cppAdditionalDeductionCents: 0,
      eiPremiumCents: 0,
    },
    input,
    policy,
    includeCurrentNonPeriodic: false,
  });
  const beforeCurrentCredits = calculateAnnualCreditInputs({
    regularCppCents,
    nonPeriodicCppCents,
    regularEiCents,
    nonPeriodicEiCents,
    priorNonPeriodicEvidence,
    input,
    policy,
    includeCurrentNonPeriodic: false,
  });
  const withCurrentCredits = calculateAnnualCreditInputs({
    regularCppCents,
    nonPeriodicCppCents,
    regularEiCents,
    nonPeriodicEiCents,
    priorNonPeriodicEvidence,
    input,
    policy,
    includeCurrentNonPeriodic: true,
  });

  const annualRegularGrossCents = multiplyMoney(
    periodicTaxableEarningsCents,
    input.payPeriodsPerYear,
    'annualRegularGrossCents',
  );
  const annualGrossBeforeCurrentNonPeriodicCents = sumMoney(
    'annualGrossBeforeCurrentNonPeriodicCents',
    annualRegularGrossCents,
    input.ytd.nonPeriodicEarningsYtdCents,
  );
  const annualGrossWithCurrentNonPeriodicCents = sumMoney(
    'annualGrossWithCurrentNonPeriodicCents',
    annualGrossBeforeCurrentNonPeriodicCents,
    nonPeriodicTaxableEarningsCents,
  );

  const periodicAnnualTax = calculateAnnualOntarioTax({
    annualTaxableIncomeCents: periodicAnnualTaxableIncomeCents,
    annualGrossEmploymentIncomeCents: annualRegularGrossCents,
    federalTd1Mode: input.federalTd1Mode,
    federalTd1TotalClaimCents: input.federalTd1TotalClaimCents,
    ontarioTd1Mode: input.ontarioTd1Mode,
    ontarioTd1TotalClaimCents: input.ontarioTd1TotalClaimCents,
    ...periodicCredits,
    policy,
  });
  const beforeCurrentAnnualTax = calculateAnnualOntarioTax({
    annualTaxableIncomeCents: annualTaxableIncomeBeforeCurrentNonPeriodicCents,
    annualGrossEmploymentIncomeCents: annualGrossBeforeCurrentNonPeriodicCents,
    federalTd1Mode: input.federalTd1Mode,
    federalTd1TotalClaimCents: input.federalTd1TotalClaimCents,
    ontarioTd1Mode: input.ontarioTd1Mode,
    ontarioTd1TotalClaimCents: input.ontarioTd1TotalClaimCents,
    ...beforeCurrentCredits,
    policy,
  });
  const withCurrentAnnualTax = calculateAnnualOntarioTax({
    annualTaxableIncomeCents: annualTaxableIncomeWithNonPeriodicCents,
    annualGrossEmploymentIncomeCents: annualGrossWithCurrentNonPeriodicCents,
    federalTd1Mode: input.federalTd1Mode,
    federalTd1TotalClaimCents: input.federalTd1TotalClaimCents,
    ontarioTd1Mode: input.ontarioTd1Mode,
    ontarioTd1TotalClaimCents: input.ontarioTd1TotalClaimCents,
    ...withCurrentCredits,
    policy,
  });

  let periodicIncomeTaxCents: number;
  let nonPeriodicIncomeTaxCents: number;

  if (
    input.incomeTaxTreatment ===
    PayrollIncomeTaxTreatment.TD1_CLAIM_CODE_E_REVIEWED
  ) {
    periodicIncomeTaxCents = roundHalfUpRatio(
      BigInt(periodicAnnualTax.ontarioHealthPremiumCents),
      BigInt(input.payPeriodsPerYear),
      'periodicClaimEHealthPremiumCents',
    );
    nonPeriodicIncomeTaxCents =
      nonPeriodicTaxableEarningsCents === 0
        ? 0
        : Math.max(
            0,
            withCurrentAnnualTax.ontarioHealthPremiumCents -
              beforeCurrentAnnualTax.ontarioHealthPremiumCents,
          );
  } else {
    periodicIncomeTaxCents =
      roundHalfUpRatio(
        BigInt(
          periodicAnnualTax.federalAnnualTaxCents +
            periodicAnnualTax.ontarioAnnualTaxCents,
        ),
        BigInt(input.payPeriodsPerYear),
        'periodicIncomeTaxCents',
      ) + input.additionalTaxPerPayCents;

    if (nonPeriodicTaxableEarningsCents === 0) {
      nonPeriodicIncomeTaxCents = 0;
    } else if (annualTaxableIncomeWithNonPeriodicCents <= 500_000) {
      nonPeriodicIncomeTaxCents = multiplyRatioCents(
        nonPeriodicTaxableEarningsCents,
        1_500,
        10_000,
        'lowIncomeNonPeriodicTaxCents',
      );
    } else {
      nonPeriodicIncomeTaxCents = Math.max(
        0,
        withCurrentAnnualTax.federalAnnualTaxCents +
          withCurrentAnnualTax.ontarioAnnualTaxCents -
          beforeCurrentAnnualTax.federalAnnualTaxCents -
          beforeCurrentAnnualTax.ontarioAnnualTaxCents,
      );
    }
  }

  const claimCodeE =
    input.incomeTaxTreatment ===
    PayrollIncomeTaxTreatment.TD1_CLAIM_CODE_E_REVIEWED;

  return {
    incomeTaxCents: sumMoney(
      'incomeTaxCents',
      periodicIncomeTaxCents,
      nonPeriodicIncomeTaxCents,
    ),
    taxEvidence: {
      periodicAnnualTaxableIncomeCents,
      annualTaxableIncomeWithNonPeriodicCents,
      periodicIncomeTaxCents,
      nonPeriodicIncomeTaxCents,
      federalPeriodicAnnualTaxCents: claimCodeE
        ? 0
        : periodicAnnualTax.federalAnnualTaxCents,
      ontarioPeriodicAnnualTaxCents: claimCodeE
        ? periodicAnnualTax.ontarioHealthPremiumCents
        : periodicAnnualTax.ontarioAnnualTaxCents,
      federalAnnualTaxBeforeCurrentNonPeriodicCents: claimCodeE
        ? 0
        : beforeCurrentAnnualTax.federalAnnualTaxCents,
      ontarioAnnualTaxBeforeCurrentNonPeriodicCents: claimCodeE
        ? beforeCurrentAnnualTax.ontarioHealthPremiumCents
        : beforeCurrentAnnualTax.ontarioAnnualTaxCents,
      federalAnnualTaxWithCurrentNonPeriodicCents: claimCodeE
        ? 0
        : withCurrentAnnualTax.federalAnnualTaxCents,
      ontarioAnnualTaxWithCurrentNonPeriodicCents: claimCodeE
        ? withCurrentAnnualTax.ontarioHealthPremiumCents
        : withCurrentAnnualTax.ontarioAnnualTaxCents,
      ontarioHealthPremiumPeriodicCents:
        periodicAnnualTax.ontarioHealthPremiumCents,
      ontarioHealthPremiumBeforeCurrentNonPeriodicCents:
        beforeCurrentAnnualTax.ontarioHealthPremiumCents,
      ontarioHealthPremiumWithCurrentNonPeriodicCents:
        withCurrentAnnualTax.ontarioHealthPremiumCents,
      ontarioTaxReductionDependentFactorCents: 0,
    },
  };
};
