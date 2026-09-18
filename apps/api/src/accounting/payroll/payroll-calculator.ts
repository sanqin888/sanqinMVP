import {
  PayrollCppTreatment,
  PayrollEiTreatment,
  PayrollVacationTreatment,
} from './payroll-contracts';
import {
  PayrollCalculationFailureCode,
  type OntarioHourlyPayrollCalculationInput,
  type PayrollCalculationResult,
} from './payroll-calculator.contracts';
import {
  payrollCalculationFailure,
  resolvePriorNonPeriodicTaxEvidence,
  validateOntarioHourlyPayrollInput,
  validateOntarioPayrollYtdAgainstPolicy,
} from './payroll-calculator-validation';
import { calculatePayrollIncomeTax } from './payroll-income-tax-calculator';
import {
  calculateEmployeeCpp2Cents,
  calculateEmployeeCppCents,
  calculateEmployeeEiCents,
  multiplyRatioCents,
  roundHalfUpRatio,
  splitCppForTax,
  sumMoney,
} from './payroll-statutory-math';
import { selectOntarioPayrollStatutoryPolicy } from './payroll-statutory-policy';

export const calculateOntarioHourlyPayroll = (
  input: OntarioHourlyPayrollCalculationInput,
): PayrollCalculationResult => {
  const validation = validateOntarioHourlyPayrollInput(input);
  if (validation) {
    return validation;
  }

  const policy = selectOntarioPayrollStatutoryPolicy(input.payDate);
  if (!policy) {
    return payrollCalculationFailure(
      PayrollCalculationFailureCode.UNSUPPORTED_PAY_DATE,
      'ON_HOURLY_SIMPLE_V1 currently supports pay dates in calendar year 2026 only',
      'payDate',
    );
  }

  const ytdValidation = validateOntarioPayrollYtdAgainstPolicy(input, policy);
  if (ytdValidation) {
    return ytdValidation;
  }

  const priorNonPeriodicEvidence = resolvePriorNonPeriodicTaxEvidence(input);
  if ('ok' in priorNonPeriodicEvidence) {
    return priorNonPeriodicEvidence;
  }

  try {
    const regularPayCents = roundHalfUpRatio(
      BigInt(input.regularMinutes) * BigInt(input.regularHourlyRateCents),
      60n,
      'regularPayCents',
    );
    const overtimePayCents = roundHalfUpRatio(
      BigInt(input.overtimeMinutes) * BigInt(input.overtimeHourlyRateCents),
      60n,
      'overtimePayCents',
    );
    const periodicTaxableEarningsCents = sumMoney(
      'periodicTaxableEarningsCents',
      regularPayCents,
      overtimePayCents,
    );

    const earnedVacationCents = multiplyRatioCents(
      periodicTaxableEarningsCents,
      input.vacationRateBasisPoints,
      10_000,
      'earnedVacationCents',
    );
    const vacationEntitlementCents = sumMoney(
      'vacationEntitlementCents',
      earnedVacationCents,
      input.vacationTopUpCents,
    );
    const vacationPayPaidCents =
      input.vacationTreatment === PayrollVacationTreatment.PAID_EACH_RUN
        ? vacationEntitlementCents
        : 0;
    const vacationPayAccruedCents =
      input.vacationTreatment === PayrollVacationTreatment.ACCRUED
        ? vacationEntitlementCents
        : 0;
    const nonPeriodicTaxableEarningsCents = vacationPayPaidCents;

    if (
      nonPeriodicTaxableEarningsCents > 0 &&
      periodicTaxableEarningsCents === 0
    ) {
      return payrollCalculationFailure(
        PayrollCalculationFailureCode.NON_PERIODIC_WITHOUT_PERIODIC_BASE,
        'T4127 regular-bonus method requires a current or most-recent periodic remuneration base; ON_HOURLY_SIMPLE_V1 does not infer one',
        'nonPeriodicTaxableEarningsCents',
      );
    }

    const grossPayCents = sumMoney(
      'grossPayCents',
      periodicTaxableEarningsCents,
      nonPeriodicTaxableEarningsCents,
    );
    const pensionableEarningsCents = grossPayCents;
    const insurableEarningsCents = grossPayCents;

    const employeeCppRegularCents =
      input.cppTreatment === PayrollCppTreatment.STANDARD
        ? calculateEmployeeCppCents({
            pensionableEarningsCents: periodicTaxableEarningsCents,
            employeeCppYtdCents: input.ytd.employeeCppYtdCents,
            payPeriodsPerYear: input.payPeriodsPerYear,
            policy,
          })
        : 0;
    const employeeCppCents =
      input.cppTreatment === PayrollCppTreatment.STANDARD
        ? calculateEmployeeCppCents({
            pensionableEarningsCents,
            employeeCppYtdCents: input.ytd.employeeCppYtdCents,
            payPeriodsPerYear: input.payPeriodsPerYear,
            policy,
          })
        : 0;
    const employeeCppNonPeriodicCents = Math.max(
      0,
      employeeCppCents - employeeCppRegularCents,
    );

    const employeeCpp2RegularCents =
      input.cppTreatment === PayrollCppTreatment.STANDARD
        ? calculateEmployeeCpp2Cents({
            pensionableEarningsCents: periodicTaxableEarningsCents,
            pensionableEarningsYtdCents: input.ytd.pensionableEarningsYtdCents,
            employeeCpp2YtdCents: input.ytd.employeeCpp2YtdCents,
            policy,
          })
        : 0;
    const employeeCpp2Cents =
      input.cppTreatment === PayrollCppTreatment.STANDARD
        ? calculateEmployeeCpp2Cents({
            pensionableEarningsCents,
            pensionableEarningsYtdCents: input.ytd.pensionableEarningsYtdCents,
            employeeCpp2YtdCents: input.ytd.employeeCpp2YtdCents,
            policy,
          })
        : 0;
    const employeeCpp2NonPeriodicCents = Math.max(
      0,
      employeeCpp2Cents - employeeCpp2RegularCents,
    );

    const cppTaxSplit = splitCppForTax({
      totalCppCents: employeeCppCents,
      regularCppCents: employeeCppRegularCents,
      totalCpp2Cents: employeeCpp2Cents,
      periodicPensionableEarningsCents: periodicTaxableEarningsCents,
      totalPensionableEarningsCents: pensionableEarningsCents,
      policy,
    });

    const employeeEiRegularCents =
      input.eiTreatment === PayrollEiTreatment.INSURABLE
        ? calculateEmployeeEiCents({
            insurableEarningsCents: periodicTaxableEarningsCents,
            employeeEiYtdCents: input.ytd.employeeEiYtdCents,
            policy,
          })
        : 0;
    const employeeEiCents =
      input.eiTreatment === PayrollEiTreatment.INSURABLE
        ? calculateEmployeeEiCents({
            insurableEarningsCents,
            employeeEiYtdCents: input.ytd.employeeEiYtdCents,
            policy,
          })
        : 0;
    const employeeEiNonPeriodicCents = Math.max(
      0,
      employeeEiCents - employeeEiRegularCents,
    );

    const { incomeTaxCents, taxEvidence } = calculatePayrollIncomeTax({
      input,
      policy,
      priorNonPeriodicEvidence,
      periodicTaxableEarningsCents,
      nonPeriodicTaxableEarningsCents,
      cppTaxDeductionRegularCents: cppTaxSplit.cppTaxDeductionRegularCents,
      cppTaxDeductionNonPeriodicCents:
        cppTaxSplit.cppTaxDeductionNonPeriodicCents,
      regularCppCents: employeeCppRegularCents,
      nonPeriodicCppCents: employeeCppNonPeriodicCents,
      regularEiCents: employeeEiRegularCents,
      nonPeriodicEiCents: employeeEiNonPeriodicCents,
    });

    const employerCppCents = employeeCppCents;
    const employerCpp2Cents = employeeCpp2Cents;
    const employerEiCents = multiplyRatioCents(
      employeeEiCents,
      input.eiEmployerMultiplierMicros,
      1_000_000,
      'employerEiCents',
    );
    const totalEmployeeDeductionsCents = sumMoney(
      'totalEmployeeDeductionsCents',
      incomeTaxCents,
      employeeCppCents,
      employeeCpp2Cents,
      employeeEiCents,
    );

    if (totalEmployeeDeductionsCents > grossPayCents) {
      return payrollCalculationFailure(
        PayrollCalculationFailureCode.DEDUCTIONS_EXCEED_GROSS,
        'employee deductions exceed current gross pay',
      );
    }

    const netPayCents = grossPayCents - totalEmployeeDeductionsCents;
    const craRemittanceCents = sumMoney(
      'craRemittanceCents',
      incomeTaxCents,
      employeeCppCents,
      employerCppCents,
      employeeCpp2Cents,
      employerCpp2Cents,
      employeeEiCents,
      employerEiCents,
    );
    const compensationExpenseCents = sumMoney(
      'compensationExpenseCents',
      periodicTaxableEarningsCents,
      vacationPayPaidCents,
      vacationPayAccruedCents,
    );
    const supportedEmployerPayrollCostCents = sumMoney(
      'supportedEmployerPayrollCostCents',
      compensationExpenseCents,
      employerCppCents,
      employerCpp2Cents,
      employerEiCents,
    );

    const updatedNonPeriodicEvidence = {
      cppBaseContributionCents: sumMoney(
        'nonPeriodicCppBaseContributionYtdCents',
        priorNonPeriodicEvidence.cppBaseContributionCents,
        cppTaxSplit.nonPeriodicBaseCppCents,
      ),
      cppAdditionalDeductionCents: sumMoney(
        'nonPeriodicCppAdditionalDeductionYtdCents',
        priorNonPeriodicEvidence.cppAdditionalDeductionCents,
        cppTaxSplit.cppTaxDeductionNonPeriodicCents,
      ),
      eiPremiumCents: sumMoney(
        'nonPeriodicEiPremiumYtdCents',
        priorNonPeriodicEvidence.eiPremiumCents,
        employeeEiNonPeriodicCents,
      ),
    };

    return {
      ok: true,
      output: {
        statutoryPolicyVersion: policy.version,
        calculationProfileVersion: input.calculationProfileVersion,
        payPeriodsPerYear: input.payPeriodsPerYear,
        regularPayCents,
        overtimePayCents,
        vacationPayPaidCents,
        vacationPayAccruedCents,
        grossPayCents,
        periodicTaxableEarningsCents,
        nonPeriodicTaxableEarningsCents,
        pensionableEarningsCents,
        insurableEarningsCents,
        incomeTaxCents,
        employeeCppCents,
        employeeCpp2Cents,
        employeeEiCents,
        employerCppCents,
        employerCpp2Cents,
        employerEiCents,
        totalEmployeeDeductionsCents,
        netPayCents,
        craRemittanceCents,
        compensationExpenseCents,
        supportedEmployerPayrollCostCents,
        contributionEvidence: {
          cppContributionMonths: 12,
          employeeCppRegularCents,
          employeeCppNonPeriodicCents,
          employeeCppBaseRegularCents: cppTaxSplit.regularBaseCppCents,
          employeeCppBaseNonPeriodicCents: cppTaxSplit.nonPeriodicBaseCppCents,
          cppTaxDeductionRegularCents: cppTaxSplit.cppTaxDeductionRegularCents,
          cppTaxDeductionNonPeriodicCents:
            cppTaxSplit.cppTaxDeductionNonPeriodicCents,
          employeeCpp2RegularCents,
          employeeCpp2NonPeriodicCents,
          employeeEiRegularCents,
          employeeEiNonPeriodicCents,
        },
        taxEvidence,
        ytdAfter: {
          grossEarningsYtdCents: sumMoney(
            'grossEarningsYtdCents',
            input.ytd.grossEarningsYtdCents,
            grossPayCents,
          ),
          netPayYtdCents: sumMoney(
            'netPayYtdCents',
            input.ytd.netPayYtdCents,
            netPayCents,
          ),
          periodicEarningsYtdCents: sumMoney(
            'periodicEarningsYtdCents',
            input.ytd.periodicEarningsYtdCents,
            periodicTaxableEarningsCents,
          ),
          nonPeriodicEarningsYtdCents: sumMoney(
            'nonPeriodicEarningsYtdCents',
            input.ytd.nonPeriodicEarningsYtdCents,
            nonPeriodicTaxableEarningsCents,
          ),
          pensionableEarningsYtdCents: sumMoney(
            'pensionableEarningsYtdCents',
            input.ytd.pensionableEarningsYtdCents,
            pensionableEarningsCents,
          ),
          employeeCppYtdCents: sumMoney(
            'employeeCppYtdCents',
            input.ytd.employeeCppYtdCents,
            employeeCppCents,
          ),
          employeeCpp2YtdCents: sumMoney(
            'employeeCpp2YtdCents',
            input.ytd.employeeCpp2YtdCents,
            employeeCpp2Cents,
          ),
          insurableEarningsYtdCents: sumMoney(
            'insurableEarningsYtdCents',
            input.ytd.insurableEarningsYtdCents,
            insurableEarningsCents,
          ),
          employeeEiYtdCents: sumMoney(
            'employeeEiYtdCents',
            input.ytd.employeeEiYtdCents,
            employeeEiCents,
          ),
          incomeTaxYtdCents: sumMoney(
            'incomeTaxYtdCents',
            input.ytd.incomeTaxYtdCents,
            incomeTaxCents,
          ),
          vacationPayPaidYtdCents: sumMoney(
            'vacationPayPaidYtdCents',
            input.ytd.vacationPayPaidYtdCents,
            vacationPayPaidCents,
          ),
          vacationPayAccruedYtdCents: sumMoney(
            'vacationPayAccruedYtdCents',
            input.ytd.vacationPayAccruedYtdCents,
            vacationPayAccruedCents,
          ),
          nonPeriodicTaxEvidenceYtd: updatedNonPeriodicEvidence,
        },
      },
    };
  } catch (error) {
    return payrollCalculationFailure(
      PayrollCalculationFailureCode.INVALID_INPUT,
      error instanceof Error
        ? error.message
        : 'invalid payroll calculation input',
    );
  }
};
