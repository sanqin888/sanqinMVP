export type PayrollTaxBracket = {
  thresholdCents: number;
  rateBasisPoints: number;
  constantCents: number;
};

export type OntarioPayrollStatutoryPolicy = {
  version: 'CA-ON-2026-01' | 'CA-ON-2026-07';
  sourceEdition: 'T4127-122' | 'T4127-123';
  effectiveFrom: string;
  effectiveThrough: string;
  taxYear: 2026;

  federal: {
    brackets: readonly PayrollTaxBracket[];
    lowestRateBasisPoints: 1_400;
    canadaEmploymentAmountCents: 150_100;
    basicPersonalAmount: {
      maximumCents: 1_645_200;
      minimumCents: 1_482_900;
      phaseoutStartCents: 18_144_000;
      phaseoutEndCents: 25_848_200;
      phaseoutReductionNumerator: 1_623;
      phaseoutReductionDenominator: 77_042;
    };
  };

  ontario: {
    brackets: readonly PayrollTaxBracket[];
    lowestRateBasisPoints: 505;
    basicPersonalAmountCents: 1_298_900;
    surtax: {
      firstThresholdCents: 581_800;
      secondThresholdCents: 744_600;
      firstRateBasisPoints: 2_000;
      secondRateBasisPoints: 3_600;
    };
    taxReductionBaseCents: 30_000;
  };

  cpp: {
    yearlyBasicExemptionCents: 350_000;
    ympeCents: 7_460_000;
    yampeCents: 8_500_000;
    totalRateBasisPoints: 595;
    baseRateBasisPoints: 495;
    firstAdditionalRateBasisPoints: 100;
    maximumTotalContributionCents: 423_045;
    maximumBaseContributionCents: 351_945;
    cpp2RateBasisPoints: 400;
    maximumCpp2ContributionCents: 41_600;
  };

  ei: {
    maximumInsurableEarningsCents: 6_890_000;
    employeeRateBasisPoints: 163;
    maximumEmployeePremiumCents: 112_307;
    standardEmployerMultiplierMicros: 1_400_000;
  };
};

const FEDERAL_2026_BRACKETS = [
  { thresholdCents: 0, rateBasisPoints: 1_400, constantCents: 0 },
  {
    thresholdCents: 5_852_300,
    rateBasisPoints: 2_050,
    constantCents: 380_400,
  },
  {
    thresholdCents: 11_704_500,
    rateBasisPoints: 2_600,
    constantCents: 1_024_100,
  },
  {
    thresholdCents: 18_144_000,
    rateBasisPoints: 2_900,
    constantCents: 1_568_500,
  },
  {
    thresholdCents: 25_848_200,
    rateBasisPoints: 3_300,
    constantCents: 2_602_400,
  },
] as const satisfies readonly PayrollTaxBracket[];

const ONTARIO_2026_BRACKETS = [
  { thresholdCents: 0, rateBasisPoints: 505, constantCents: 0 },
  {
    thresholdCents: 5_389_100,
    rateBasisPoints: 915,
    constantCents: 221_000,
  },
  {
    thresholdCents: 10_778_500,
    rateBasisPoints: 1_116,
    constantCents: 437_600,
  },
  {
    thresholdCents: 15_000_000,
    rateBasisPoints: 1_216,
    constantCents: 587_600,
  },
  {
    thresholdCents: 22_000_000,
    rateBasisPoints: 1_316,
    constantCents: 807_600,
  },
] as const satisfies readonly PayrollTaxBracket[];

const COMMON_2026_POLICY = {
  taxYear: 2026,
  federal: {
    brackets: FEDERAL_2026_BRACKETS,
    lowestRateBasisPoints: 1_400,
    canadaEmploymentAmountCents: 150_100,
    basicPersonalAmount: {
      maximumCents: 1_645_200,
      minimumCents: 1_482_900,
      phaseoutStartCents: 18_144_000,
      phaseoutEndCents: 25_848_200,
      phaseoutReductionNumerator: 1_623,
      phaseoutReductionDenominator: 77_042,
    },
  },
  ontario: {
    brackets: ONTARIO_2026_BRACKETS,
    lowestRateBasisPoints: 505,
    basicPersonalAmountCents: 1_298_900,
    surtax: {
      firstThresholdCents: 581_800,
      secondThresholdCents: 744_600,
      firstRateBasisPoints: 2_000,
      secondRateBasisPoints: 3_600,
    },
    taxReductionBaseCents: 30_000,
  },
  cpp: {
    yearlyBasicExemptionCents: 350_000,
    ympeCents: 7_460_000,
    yampeCents: 8_500_000,
    totalRateBasisPoints: 595,
    baseRateBasisPoints: 495,
    firstAdditionalRateBasisPoints: 100,
    maximumTotalContributionCents: 423_045,
    maximumBaseContributionCents: 351_945,
    cpp2RateBasisPoints: 400,
    maximumCpp2ContributionCents: 41_600,
  },
  ei: {
    maximumInsurableEarningsCents: 6_890_000,
    employeeRateBasisPoints: 163,
    maximumEmployeePremiumCents: 112_307,
    standardEmployerMultiplierMicros: 1_400_000,
  },
} as const;

export const PAYROLL_STATUTORY_POLICY_CA_ON_2026_01 = {
  ...COMMON_2026_POLICY,
  version: 'CA-ON-2026-01',
  sourceEdition: 'T4127-122',
  effectiveFrom: '2026-01-01',
  effectiveThrough: '2026-06-30',
} as const satisfies OntarioPayrollStatutoryPolicy;

export const PAYROLL_STATUTORY_POLICY_CA_ON_2026_07 = {
  ...COMMON_2026_POLICY,
  version: 'CA-ON-2026-07',
  sourceEdition: 'T4127-123',
  effectiveFrom: '2026-07-01',
  effectiveThrough: '2026-12-31',
} as const satisfies OntarioPayrollStatutoryPolicy;

export const ONTARIO_PAYROLL_STATUTORY_POLICIES = [
  PAYROLL_STATUTORY_POLICY_CA_ON_2026_01,
  PAYROLL_STATUTORY_POLICY_CA_ON_2026_07,
] as const;

const toDateKey = (date: Date): string | null => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
};

export const selectOntarioPayrollStatutoryPolicy = (
  payDate: Date,
): OntarioPayrollStatutoryPolicy | null => {
  const dateKey = toDateKey(payDate);
  if (!dateKey) {
    return null;
  }

  return (
    ONTARIO_PAYROLL_STATUTORY_POLICIES.find(
      (policy) =>
        dateKey >= policy.effectiveFrom && dateKey <= policy.effectiveThrough,
    ) ?? null
  );
};
