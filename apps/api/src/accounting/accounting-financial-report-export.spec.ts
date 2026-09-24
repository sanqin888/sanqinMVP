import {
  renderAccountingPnlCsv,
  renderAccountingPnlPdf,
} from './accounting-financial-report-export';

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
      adjustmentBreakdown: [
        {
          source: 'ORDER',
          sourceFactType: 'order.financial_reversal.v1',
          journalCount: 2,
          revenueNetCents: -2_000,
          expenseNetCents: 0,
          netProfitEffectCents: -2_000,
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

  it('includes adjustment decomposition in the Management CSV', () => {
    const csv = renderAccountingPnlCsv('MANAGEMENT', {
      summary: {
        incomeCents: 10_000,
        expenseCents: 2_000,
        adjustmentCents: -500,
        netProfitCents: 7_500,
      },
      periods: [],
      byCategoryTree: [],
      adjustmentBreakdown: [
        {
          source: 'ORDER',
          sourceFactType: 'order.financial_reversal.v1',
          journalCount: 1,
          revenueNetCents: -500,
          expenseNetCents: 0,
          netProfitEffectCents: -500,
        },
      ],
      trends: {
        currentMonthNetCents: 7_500,
        lastMonthNetCents: 0,
        quarterToDateNetCents: 7_500,
      },
    });

    expect(csv).toContain(
      'adjustmentSource,sourceFactType,journalCount,revenueNet,expenseNet,netProfitEffect',
    );
    expect(csv).toContain(
      'ORDER,order.financial_reversal.v1,1,-5.00,0.00,-5.00',
    );
  });
});
