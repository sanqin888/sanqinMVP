import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(__dirname, 'payroll-setup-panel.tsx'),
  'utf8',
);

function sourceBetween(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);

  if (startIndex < 0 || endIndex < 0) {
    throw new Error(
      `Unable to locate Payroll setup source boundary: ${start} -> ${end}`,
    );
  }

  return source.slice(startIndex, endIndex);
}

describe('Payroll employee creation UX guard', () => {
  it('selects the newly created employee and clears the reusable name fields', () => {
    const createEmployee = sourceBetween(
      'function createEmployee',
      '  return (',
    );

    expect(createEmployee).toContain('apiFetch<PayrollEmployee>');
    expect(createEmployee).toContain(
      'onEmployeeSelect(created.employeeStableId)',
    );
    expect(createEmployee).toContain("setEmployeeName('')");
    expect(createEmployee).toContain("setEmployeeDisplayName('')");
  });

  it('waits for the shared payroll refresh before returning the created employee result', () => {
    const submit = sourceBetween('async function submit<T>', '  function createEmployer');
    const refreshIndex = submit.indexOf('await onChanged()');
    const returnIndex = submit.indexOf('return result');

    expect(refreshIndex).toBeGreaterThanOrEqual(0);
    expect(returnIndex).toBeGreaterThan(refreshIndex);
  });
});
