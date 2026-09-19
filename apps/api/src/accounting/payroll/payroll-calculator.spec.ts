import {
  PAYROLL_CALCULATION_PROFILE_VERSION,
  PayrollCppTreatment,
  PayrollEiTreatment,
  PayrollIncomeTaxTreatment,
  PayrollPayFrequency,
  PayrollTd1Mode,
  PayrollVacationTreatment,
} from './payroll-contracts';
import {
  PayrollCalculationFailureCode,
  type OntarioHourlyPayrollCalculationInput,
} from './payroll-calculator.contracts';
import { calculateOntarioHourlyPayroll } from './payroll-calculator';

const emptyYtd = (): OntarioHourlyPayrollCalculationInput['ytd'] => ({
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

const input = (
  overrides: Partial<OntarioHourlyPayrollCalculationInput> = {},
): OntarioHourlyPayrollCalculationInput => ({
  provinceOfEmployment: 'ON',
  calculationProfileVersion: PAYROLL_CALCULATION_PROFILE_VERSION,
  payDate: new Date('2026-06-30T12:00:00.000Z'),
  payFrequency: PayrollPayFrequency.WEEKLY,
  payPeriodsPerYear: 52,
  regularMinutes: 60,
  regularHourlyRateCents: 61_500,
  overtimeMinutes: 0,
  overtimeHourlyRateCents: 0,
  vacationTopUpCents: 0,
  federalTd1Mode: PayrollTd1Mode.FILED_TOTAL_CLAIM,
  federalTd1TotalClaimCents: 1_645_200,
  ontarioTd1Mode: PayrollTd1Mode.FILED_TOTAL_CLAIM,
  ontarioTd1TotalClaimCents: 1_298_900,
  incomeTaxTreatment: PayrollIncomeTaxTreatment.STANDARD,
  additionalTaxPerPayCents: 0,
  cppTreatment: PayrollCppTreatment.STANDARD,
  eiTreatment: PayrollEiTreatment.INSURABLE,
  eiEmployerMultiplierMicros: 1_400_000,
  vacationTreatment: PayrollVacationTreatment.ACCRUED,
  vacationRateBasisPoints: 0,
  ytd: emptyYtd(),
  ...overrides,
});

const expectSuccess = (
  result: ReturnType<typeof calculateOntarioHourlyPayroll>,
) => {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.reason.message);
  }
  return result.output;
};

describe('Ontario hourly Payroll calculator', () => {
  it('reproduces the exact T4127 result behind the CRA weekly $615 table example', () => {
    const output = expectSuccess(calculateOntarioHourlyPayroll(input()));

    expect(output.statutoryPolicyVersion).toBe('CA-ON-2026-01');
    expect(output.regularPayCents).toBe(61_500);
    expect(output.grossPayCents).toBe(61_500);
    expect(output.employeeCppCents).toBe(3_259);
    expect(output.employeeCpp2Cents).toBe(0);
    expect(output.employeeEiCents).toBe(1_002);

    // T4032's range table shows $54.00. The exact T4127 Option 1 formula
    // for the same $615 weekly facts produces $53.86.
    expect(output.incomeTaxCents).toBe(5_386);
    expect(output.totalEmployeeDeductionsCents).toBe(9_647);
    expect(output.netPayCents).toBe(51_853);

    expect(output.employerCppCents).toBe(3_259);
    expect(output.employerEiCents).toBe(1_403);
    expect(output.craRemittanceCents).toBe(14_309);
    expect(output.supportedEmployerPayrollCostCents).toBe(66_162);
  });

  it('freezes the July 2026 statutory policy identity by pay date', () => {
    const output = expectSuccess(
      calculateOntarioHourlyPayroll(
        input({ payDate: new Date('2026-07-01T12:00:00.000Z') }),
      ),
    );

    expect(output.statutoryPolicyVersion).toBe('CA-ON-2026-07');
  });

  it.each([
    [PayrollPayFrequency.WEEKLY, 53],
    [PayrollPayFrequency.BIWEEKLY, 26],
    [PayrollPayFrequency.BIWEEKLY, 27],
    [PayrollPayFrequency.SEMIMONTHLY, 24],
    [PayrollPayFrequency.MONTHLY, 12],
  ] as const)(
    'supports CRA pay-period count %s/%i',
    (payFrequency, payPeriodsPerYear) => {
      const result = calculateOntarioHourlyPayroll(
        input({ payFrequency, payPeriodsPerYear }),
      );
      expect(result.ok).toBe(true);
    },
  );

  it('fails closed for an invalid frequency/pay-period combination', () => {
    const result = calculateOntarioHourlyPayroll(
      input({
        payFrequency: PayrollPayFrequency.BIWEEKLY,
        payPeriodsPerYear: 52,
      }),
    );

    expect(result).toEqual({
      ok: false,
      reason: {
        code: PayrollCalculationFailureCode.UNSUPPORTED_PAY_PERIOD_COUNT,
        message: 'payPeriodsPerYear=52 is not supported for BIWEEKLY',
        field: 'payPeriodsPerYear',
      },
    });
  });

  it('fails closed outside Ontario and outside the 2026 policy calendar', () => {
    const province = calculateOntarioHourlyPayroll(
      input({ provinceOfEmployment: 'BC' }),
    );
    expect(province.ok).toBe(false);
    if (!province.ok) {
      expect(province.reason.code).toBe(
        PayrollCalculationFailureCode.UNSUPPORTED_PROVINCE,
      );
    }

    const date = calculateOntarioHourlyPayroll(
      input({ payDate: new Date('2027-01-01T12:00:00.000Z') }),
    );
    expect(date.ok).toBe(false);
    if (!date.ok) {
      expect(date.reason.code).toBe(
        PayrollCalculationFailureCode.UNSUPPORTED_PAY_DATE,
      );
    }
  });

  it('separates accrued vacation from paid non-periodic vacation', () => {
    const accrued = expectSuccess(
      calculateOntarioHourlyPayroll(
        input({
          regularHourlyRateCents: 100_000,
          vacationRateBasisPoints: 400,
          vacationTreatment: PayrollVacationTreatment.ACCRUED,
        }),
      ),
    );
    expect(accrued.regularPayCents).toBe(100_000);
    expect(accrued.vacationPayAccruedCents).toBe(4_000);
    expect(accrued.vacationPayPaidCents).toBe(0);
    expect(accrued.grossPayCents).toBe(100_000);
    expect(accrued.compensationExpenseCents).toBe(104_000);

    const paid = expectSuccess(
      calculateOntarioHourlyPayroll(
        input({
          regularHourlyRateCents: 100_000,
          vacationRateBasisPoints: 400,
          vacationTreatment: PayrollVacationTreatment.PAID_EACH_RUN,
        }),
      ),
    );
    expect(paid.vacationPayPaidCents).toBe(4_000);
    expect(paid.vacationPayAccruedCents).toBe(0);
    expect(paid.nonPeriodicTaxableEarningsCents).toBe(4_000);
    expect(paid.grossPayCents).toBe(104_000);
    expect(
      paid.contributionEvidence.cppTaxDeductionNonPeriodicCents,
    ).toBeGreaterThan(0);
    expect(paid.taxEvidence.nonPeriodicIncomeTaxCents).toBeGreaterThan(0);
  });

  it('requires prior non-periodic CPP/EI allocation evidence for exact bonus tax', () => {
    const result = calculateOntarioHourlyPayroll(
      input({
        ytd: {
          ...emptyYtd(),
          grossEarningsYtdCents: 150_000,
          nonPeriodicEarningsYtdCents: 150_000,
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.code).toBe(
        PayrollCalculationFailureCode.PRIOR_NON_PERIODIC_EVIDENCE_REQUIRED,
      );
    }
  });

  it('keeps reviewed CPP/EI exceptions explicit and zero for the current run', () => {
    const output = expectSuccess(
      calculateOntarioHourlyPayroll(
        input({
          cppTreatment: PayrollCppTreatment.EXEMPT_REVIEWED,
          eiTreatment: PayrollEiTreatment.NON_INSURABLE_REVIEWED,
        }),
      ),
    );

    expect(output.pensionableEarningsCents).toBe(0);
    expect(output.insurableEarningsCents).toBe(0);
    expect(output.employeeCppCents).toBe(0);
    expect(output.employeeCpp2Cents).toBe(0);
    expect(output.employeeEiCents).toBe(0);
    expect(output.employerCppCents).toBe(0);
    expect(output.employerCpp2Cents).toBe(0);
    expect(output.employerEiCents).toBe(0);
  });

  it('stops CPP/CPP2/EI at their 2026 YTD maxima', () => {
    const output = expectSuccess(
      calculateOntarioHourlyPayroll(
        input({
          ytd: {
            ...emptyYtd(),
            pensionableEarningsYtdCents: 8_500_000,
            employeeCppYtdCents: 423_045,
            employeeCpp2YtdCents: 41_600,
            insurableEarningsYtdCents: 6_890_000,
            employeeEiYtdCents: 112_307,
          },
        }),
      ),
    );

    expect(output.employeeCppCents).toBe(0);
    expect(output.employeeCpp2Cents).toBe(0);
    expect(output.employeeEiCents).toBe(0);
  });

  it('rejects YTD deductions that exceed the supported statutory maxima', () => {
    const result = calculateOntarioHourlyPayroll(
      input({
        ytd: {
          ...emptyYtd(),
          employeeCppYtdCents: 423_046,
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.code).toBe(
        PayrollCalculationFailureCode.YTD_EXCEEDS_STATUTORY_MAXIMUM,
      );
    }
  });

  it('keeps claim code E separate from ordinary TD1 calculations', () => {
    const output = expectSuccess(
      calculateOntarioHourlyPayroll(
        input({
          incomeTaxTreatment:
            PayrollIncomeTaxTreatment.TD1_CLAIM_CODE_E_REVIEWED,
        }),
      ),
    );

    expect(output.incomeTaxCents).toBe(577);
    expect(output.taxEvidence.federalPeriodicAnnualTaxCents).toBe(0);
    expect(output.taxEvidence.ontarioPeriodicAnnualTaxCents).toBe(30_000);
    expect(output.taxEvidence.ontarioHealthPremiumPeriodicCents).toBe(30_000);

    const unsupported = calculateOntarioHourlyPayroll(
      input({
        incomeTaxTreatment: PayrollIncomeTaxTreatment.TD1_CLAIM_CODE_E_REVIEWED,
        additionalTaxPerPayCents: 100,
      }),
    );
    expect(unsupported.ok).toBe(false);
    if (!unsupported.ok) {
      expect(unsupported.reason.code).toBe(
        PayrollCalculationFailureCode.CLAIM_CODE_E_WITH_ADDITIONAL_TAX_UNSUPPORTED,
      );
    }
  });

  it('never infers weekly overtime from aggregate period hours', () => {
    const output = expectSuccess(
      calculateOntarioHourlyPayroll(
        input({
          regularMinutes: 2_400,
          regularHourlyRateCents: 2_000,
          overtimeMinutes: 60,
          overtimeHourlyRateCents: 3_000,
        }),
      ),
    );

    expect(output.regularPayCents).toBe(80_000);
    expect(output.overtimePayCents).toBe(3_000);
  });
});
