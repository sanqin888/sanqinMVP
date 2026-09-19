import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');
const setupSource = readFileSync(
  resolve(__dirname, 'payroll-setup-panel.tsx'),
  'utf8',
);
const openingSource = readFileSync(
  resolve(__dirname, 'payroll-year-opening-panel.tsx'),
  'utf8',
);

describe('Payroll workflow navigation', () => {
  it('defaults to the high-frequency Runs workspace and keeps context sticky', () => {
    expect(pageSource).toContain(
      "const [activeView, setActiveView] = useState<PayrollView>('runs')",
    );
    expect(pageSource).toContain('data-payroll-context');
    expect(pageSource).toContain('sticky top-0');
    expect(pageSource).toContain('data-payroll-view={view.key}');
  });

  it('separates Runs, Employees setup and employer-level CRA workspaces', () => {
    expect(pageSource).toContain("activeView === 'runs'");
    expect(pageSource).toContain('data-payroll-workspace="runs"');
    expect(pageSource).toContain("activeView === 'employees'");
    expect(pageSource).toContain('data-payroll-workspace="employees"');
    expect(pageSource).toContain("activeView === 'cra'");
    expect(pageSource).toContain('data-payroll-workspace="cra"');

    const runsIndex = pageSource.indexOf('data-payroll-workspace="runs"');
    const setupIndex = pageSource.indexOf('data-payroll-workspace="employees"');
    const craIndex = pageSource.indexOf('data-payroll-workspace="cra"');

    expect(runsIndex).toBeGreaterThanOrEqual(0);
    expect(setupIndex).toBeGreaterThan(runsIndex);
    expect(craIndex).toBeGreaterThan(setupIndex);
  });

  it('keeps low-frequency statutory and opening editors intentionally collapsed', () => {
    expect(setupSource).toContain('新增雇主法定配置版本');
    expect(setupSource).toContain('新增员工法定配置版本');
    expect(setupSource).not.toContain('onEmployerSelect');
    expect(openingSource).toContain('<details');
    expect(openingSource).toContain('新增 Year Opening');
  });
});
