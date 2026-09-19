import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCOUNTING_ROOT = resolve(__dirname, '..');
const PAYROLL_ROOT = resolve(ACCOUNTING_ROOT, 'payroll');

const payrollContractSource = readFileSync(
  resolve(__dirname, 'payroll.ts'),
  'utf8',
);
const payrollUiSource = readFileSync(
  resolve(PAYROLL_ROOT, 'payroll-ui.ts'),
  'utf8',
);
const yearOpeningSource = readFileSync(
  resolve(PAYROLL_ROOT, 'payroll-year-opening-panel.tsx'),
  'utf8',
);
const employeePaymentSource = readFileSync(
  resolve(PAYROLL_ROOT, 'payroll-employee-payment-panel.tsx'),
  'utf8',
);
const craRemittanceSource = readFileSync(
  resolve(PAYROLL_ROOT, 'payroll-cra-remittance-panel.tsx'),
  'utf8',
);
const configFormsSource = readFileSync(
  resolve(PAYROLL_ROOT, 'payroll-config-forms.tsx'),
  'utf8',
);

describe('Phase 9 Slice 8B-D Payroll Web contracts', () => {
  it('owns Payroll wire DTOs in the Accounting contract surface', () => {
    for (const wireType of [
      'PayrollEmployer',
      'PayrollEmployee',
      'PayrollEmployerConfig',
      'PayrollEmployeeConfig',
      'PayrollRun',
      'PayrollEmployeeYtdResponse',
      'PayrollYearOpening',
      'PayrollEmployeePayment',
      'PayrollCraRemittancePreview',
      'PayrollCraRemittance',
    ]) {
      expect(payrollContractSource).toContain(`export type ${wireType}`);
    }

    expect(payrollContractSource).toContain(
      'nonPeriodicTaxEvidenceYtd: PayrollNonPeriodicTaxEvidenceYtd | null',
    );
    expect(payrollContractSource).toContain('createdAt: string');
    expect(payrollContractSource).toContain('updatedAt: string');
  });

  it('keeps browser-only Payroll parsing and formatting out of wire contracts', () => {
    expect(payrollUiSource).toContain('export const payrollLocalDateToday');
    expect(payrollUiSource).toContain('export const payrollMoney');
    expect(payrollUiSource).toContain('export const payrollHours');
    expect(payrollUiSource).toContain('export const parseMoneyToCents');
    expect(payrollUiSource).toContain('export const parseHoursToMinutes');

    expect(payrollContractSource).not.toContain('parseMoneyToCents');
    expect(payrollContractSource).not.toContain('payrollLocalDateToday');
    expect(payrollUiSource).not.toContain('export type PayrollRun');
    expect(
      existsSync(resolve(PAYROLL_ROOT, 'payroll-types.ts')),
    ).toBe(false);
  });

  it('moves Year Opening and payment account wire ownership out of Payroll UI files', () => {
    expect(yearOpeningSource).toContain("from '../contracts/payroll'");
    expect(yearOpeningSource).not.toContain('type Opening =');

    for (const source of [employeePaymentSource, craRemittanceSource]) {
      expect(source).toContain("from '../contracts/chart'");
      expect(source).toContain("from '../contracts/payroll'");
      expect(source).not.toContain('PayrollPaymentAccount');
    }
  });

  it('derives statutory form enum state from server-owned Payroll contracts', () => {
    expect(configFormsSource).toContain(
      "PayrollEmployerConfig['remitterType']",
    );
    expect(configFormsSource).toContain(
      "PayrollEmployeeConfig['payFrequency']",
    );
    expect(configFormsSource).toContain(
      "PayrollEmployeeConfig['incomeTaxTreatment']",
    );
    expect(configFormsSource).toContain(
      "PayrollEmployeeConfig['cppTreatment']",
    );
    expect(configFormsSource).toContain(
      "PayrollEmployeeConfig['eiTreatment']",
    );
    expect(configFormsSource).toContain(
      "PayrollEmployeeConfig['vacationTreatment']",
    );
  });
});
