import {
  ACCOUNTING_JSON_NULL,
  type AccountingJsonValue,
} from '../accounting-db';
import { canonicalPayrollJson } from './payroll-calculation-evidence';

export const PAYROLL_RUN_INCLUDE = {
  employee: { select: { employeeStableId: true } },
  employer: { select: { employerStableId: true } },
} as const;

export const payrollJsonValue = (value: unknown): AccountingJsonValue =>
  JSON.parse(canonicalPayrollJson(value)) as AccountingJsonValue;

export const PAYROLL_CALCULATION_RESET_DATA = {
  employeeConfigStableId: null,
  employerConfigStableId: null,
  statutoryPolicyVersion: null,
  payPeriodsPerYear: null,
  calculationProfileVersion: null,
  regularPayCents: null,
  overtimePayCents: null,
  vacationPayPaidCents: null,
  vacationPayAccruedCents: null,
  grossPayCents: null,
  periodicTaxableEarningsCents: null,
  nonPeriodicTaxableEarningsCents: null,
  pensionableEarningsCents: null,
  insurableEarningsCents: null,
  incomeTaxCents: null,
  employeeCppCents: null,
  employeeCpp2Cents: null,
  employeeEiCents: null,
  employerCppCents: null,
  employerCpp2Cents: null,
  employerEiCents: null,
  totalEmployeeDeductionsCents: null,
  netPayCents: null,
  craRemittanceCents: null,
  compensationExpenseCents: null,
  supportedEmployerPayrollCostCents: null,
  calculationEvidenceVersion: null,
  calculationInputJson: ACCOUNTING_JSON_NULL,
  calculationOutputJson: ACCOUNTING_JSON_NULL,
  calculationHash: null,
  ytdBeforeJson: ACCOUNTING_JSON_NULL,
  ytdAfterJson: ACCOUNTING_JSON_NULL,
  payStatementTemplateVersion: null,
} as const;
