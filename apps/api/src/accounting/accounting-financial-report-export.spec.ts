import { renderAccountingPnlPdf } from './accounting-financial-report-export';

describe('Accounting PDF report export', () => {
  it('renders a complete PDFKit document instead of a hand-built xref stream', async () => {
    const buffer = await renderAccountingPnlPdf('MANAGEMENT', {
      summary: {
        incomeCents: 123_400,
        expenseCents: 45_600,
        adjustmentCents: 0,
        netProfitCents: 77_800,
      },
      periods: [
        {
          period: '2026-09',
          incomeCents: 123_400,
          expenseCents: 45_600,
          adjustmentCents: 0,
          netProfitCents: 77_800,
          isClosed: false,
        },
      ],
      byCategoryTree: [
        {
          categoryName: 'Labour',
          type: 'EXPENSE',
          amountCents: 45_600,
        },
      ],
      trends: {
        currentMonthNetCents: 77_800,
        lastMonthNetCents: 70_000,
        quarterToDateNetCents: 200_000,
      },
    });

    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.toString('ascii').trimEnd().endsWith('%%EOF')).toBe(true);
    expect(buffer.length).toBeGreaterThan(1_000);
  });
});
