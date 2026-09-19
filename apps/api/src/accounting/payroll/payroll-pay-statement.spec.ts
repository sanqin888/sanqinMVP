import {
  renderPayrollPayStatementPdf,
  type PayrollPayStatementSnapshot,
} from './payroll-pay-statement';

const snapshot = (
  overrides: Partial<PayrollPayStatementSnapshot> = {},
): PayrollPayStatementSnapshot => ({
  statementNumber: 'PS-run_stable_1',
  templateVersion: 'PAY_STATEMENT_V1',
  employerName: 'SanQ Roujiamo',
  employeeName: 'Employee One',
  runStableId: 'run_stable_1',
  payFrequency: 'BIWEEKLY',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-14',
  payDate: '2026-09-18',
  approvedAt: new Date('2026-09-18T12:00:00.000Z'),
  regularMinutes: 4_800,
  regularHourlyRateCents: 2_000,
  overtimeMinutes: 0,
  overtimeHourlyRateCents: 0,
  regularPayCents: 160_000,
  overtimePayCents: 0,
  vacationPayPaidCents: 0,
  vacationPayAccruedCents: 6_400,
  grossPayCents: 160_000,
  incomeTaxCents: 20_000,
  employeeCppCents: 8_000,
  employeeCpp2Cents: 0,
  employeeEiCents: 2_000,
  totalEmployeeDeductionsCents: 30_000,
  netPayCents: 130_000,
  ytd: {
    grossEarningsYtdCents: 160_000,
    netPayYtdCents: 130_000,
    pensionableEarningsYtdCents: 160_000,
    employeeCppYtdCents: 8_000,
    employeeCpp2YtdCents: 0,
    insurableEarningsYtdCents: 160_000,
    employeeEiYtdCents: 2_000,
    incomeTaxYtdCents: 20_000,
    vacationPayPaidYtdCents: 0,
    vacationPayAccruedYtdCents: 6_400,
  },
  ...overrides,
});

describe('Payroll pay-statement PDF', () => {
  const previousRegular = process.env.SANQ_PDF_FONT_REGULAR;
  const previousBold = process.env.SANQ_PDF_FONT_BOLD;

  afterEach(() => {
    if (previousRegular === undefined) delete process.env.SANQ_PDF_FONT_REGULAR;
    else process.env.SANQ_PDF_FONT_REGULAR = previousRegular;

    if (previousBold === undefined) delete process.env.SANQ_PDF_FONT_BOLD;
    else process.env.SANQ_PDF_FONT_BOLD = previousBold;
  });

  it('renders a complete finalized statement with ASCII fallback fonts', async () => {
    process.env.SANQ_PDF_FONT_REGULAR = '/definitely/missing-regular.ttf';
    process.env.SANQ_PDF_FONT_BOLD = '/definitely/missing-bold.ttf';

    const buffer = await renderPayrollPayStatementPdf(snapshot());

    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.toString('ascii').trimEnd().endsWith('%%EOF')).toBe(true);
    expect(buffer.length).toBeGreaterThan(1_000);
  });

  it('fails closed for Unicode names when the CJK runtime font is missing', async () => {
    process.env.SANQ_PDF_FONT_REGULAR = '/definitely/missing-regular.ttf';
    process.env.SANQ_PDF_FONT_BOLD = '/definitely/missing-bold.ttf';

    await expect(
      renderPayrollPayStatementPdf(snapshot({ employeeName: '张三' })),
    ).rejects.toThrow('Unicode PDF rendering requires Noto Sans CJK fonts');
  });
});
