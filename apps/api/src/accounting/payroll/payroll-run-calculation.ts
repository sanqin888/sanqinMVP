import { ConflictException } from '@nestjs/common';
import type { AccountingTransactionClient } from '../accounting-db';
import {
  PAYROLL_CALCULATION_EVIDENCE_VERSION,
  PayrollCppTreatment,
  PayrollEiTreatment,
  PayrollIncomeTaxTreatment,
  PayrollPayFrequency,
  PayrollTd1Mode,
  PayrollVacationTreatment,
} from './payroll-contracts';
import type {
  OntarioHourlyPayrollCalculationInput,
  OntarioHourlyPayrollCalculationOutput,
  PayrollCalculationFailure,
  PayrollCalculationYtdInput,
} from './payroll-calculator.contracts';
import { calculateOntarioHourlyPayroll } from './payroll-calculator';
import { hashPayrollCalculationEvidence } from './payroll-calculation-evidence';
import { derivePayrollPayPeriodsPerYear } from './payroll-schedule';

type Tx = AccountingTransactionClient;

export type PayrollRunCalculationRecord = {
  id: string;
  runStableId: string;
  employerId: string;
  employeeId: string;
  status: string;
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
  storeStableId: string;
  regularMinutes: number;
  regularHourlyRateCents: number;
  overtimeMinutes: number;
  overtimeHourlyRateCents: number;
  vacationTopUpCents: number;
};

export type BuiltPayrollCalculation = {
  employeeConfigStableId: string;
  employerConfigStableId: string;
  input: OntarioHourlyPayrollCalculationInput;
  output: OntarioHourlyPayrollCalculationOutput;
  calculationHash: string;
};

export type PayrollCalculationBuildResult =
  | { ok: true; calculation: BuiltPayrollCalculation }
  | PayrollCalculationFailure;

export const buildPayrollRunCalculation = async (
  tx: Tx,
  run: PayrollRunCalculationRecord,
  ytd: PayrollCalculationYtdInput,
): Promise<PayrollCalculationBuildResult> => {
  const employeeConfig = await tx.payrollEmployeeConfigVersion.findFirst({
    where: {
      employeeId: run.employeeId,
      effectiveFrom: { lte: run.payDate },
    },
    orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
  });
  if (!employeeConfig) {
    throw new ConflictException(
      'No effective Payroll employee config exists for this payDate',
    );
  }

  const employerConfig = await tx.payrollEmployerConfigVersion.findFirst({
    where: {
      employerId: run.employerId,
      effectiveFrom: { lte: run.payDate },
    },
    orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
  });
  if (!employerConfig) {
    throw new ConflictException(
      'No effective Payroll employer config exists for this payDate',
    );
  }

  const payFrequency = employeeConfig.payFrequency as PayrollPayFrequency;
  const payPeriodsPerYear = derivePayrollPayPeriodsPerYear({
    payFrequency,
    payScheduleAnchorDate: employeeConfig.payScheduleAnchorDate,
    taxYear: run.payDate.getUTCFullYear(),
  });

  const input: OntarioHourlyPayrollCalculationInput = {
    provinceOfEmployment: employeeConfig.provinceOfEmployment,
    calculationProfileVersion: employeeConfig.calculationProfileVersion,
    payDate: run.payDate,
    payFrequency,
    payPeriodsPerYear,
    regularMinutes: run.regularMinutes,
    regularHourlyRateCents: run.regularHourlyRateCents,
    overtimeMinutes: run.overtimeMinutes,
    overtimeHourlyRateCents: run.overtimeHourlyRateCents,
    vacationTopUpCents: run.vacationTopUpCents,
    federalTd1Mode: employeeConfig.federalTd1Mode as PayrollTd1Mode,
    federalTd1TotalClaimCents: employeeConfig.federalTd1TotalClaimCents,
    ontarioTd1Mode: employeeConfig.ontarioTd1Mode as PayrollTd1Mode,
    ontarioTd1TotalClaimCents: employeeConfig.ontarioTd1TotalClaimCents,
    incomeTaxTreatment:
      employeeConfig.incomeTaxTreatment as PayrollIncomeTaxTreatment,
    additionalTaxPerPayCents: employeeConfig.additionalTaxPerPayCents,
    cppTreatment: employeeConfig.cppTreatment as PayrollCppTreatment,
    eiTreatment: employeeConfig.eiTreatment as PayrollEiTreatment,
    eiEmployerMultiplierMicros: employerConfig.eiEmployerMultiplierMicros,
    vacationTreatment:
      employeeConfig.vacationTreatment as PayrollVacationTreatment,
    vacationRateBasisPoints: employeeConfig.vacationRateBasisPoints,
    ytd,
  };

  const result = calculateOntarioHourlyPayroll(input);
  if (!result.ok) return result;

  const calculationHash = hashPayrollCalculationEvidence({
    calculationEvidenceVersion: PAYROLL_CALCULATION_EVIDENCE_VERSION,
    employeeConfigStableId: employeeConfig.configStableId,
    employerConfigStableId: employerConfig.configStableId,
    input,
    output: result.output,
  });

  return {
    ok: true,
    calculation: {
      employeeConfigStableId: employeeConfig.configStableId,
      employerConfigStableId: employerConfig.configStableId,
      input,
      output: result.output,
      calculationHash,
    },
  };
};
