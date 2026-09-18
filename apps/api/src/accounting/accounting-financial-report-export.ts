import type { AccountingFinancialReportFact } from './accounting-financial-report-policy';
import {
  containsNonAscii,
  renderAccountingPdf,
  type AccountingPdfDocument,
  type AccountingPdfFonts,
} from './accounting-pdf';

export type AccountingPnlExportReport = {
  summary: {
    incomeCents: number;
    expenseCents: number;
    adjustmentCents: number;
    netProfitCents: number;
  };
  periods: Array<{
    period: string;
    incomeCents: number;
    expenseCents: number;
    adjustmentCents: number;
    netProfitCents: number;
    isClosed: boolean;
  }>;
  byCategoryTree: Array<{
    categoryName: string;
    type: string;
    amountCents: number;
  }>;
  trends: {
    currentMonthNetCents: number;
    lastMonthNetCents: number;
    quarterToDateNetCents: number;
  };
};

const escapeCsv = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const formatMoney = (cents: number) => (cents / 100).toFixed(2);

export function renderAccountingFinancialFactsCsv(
  facts: AccountingFinancialReportFact[],
): string {
  const header = [
    'txStableId',
    'type',
    'source',
    'amountCents',
    'currency',
    'occurredAt',
    'category',
    'account',
    'toAccount',
    'counterparty',
    'memo',
    'createdAt',
    'updatedAt',
  ];
  const lines = facts.map((fact) =>
    [
      fact.stableId,
      fact.type,
      fact.source,
      fact.amountCents,
      fact.currency,
      fact.occurredAt.toISOString(),
      fact.categoryName,
      fact.accountName ?? '',
      '',
      '',
      fact.memo,
      fact.createdAt.toISOString(),
      fact.updatedAt.toISOString(),
    ]
      .map((value) => escapeCsv(value))
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

export function renderAccountingPnlCsv(
  template: 'MANAGEMENT' | 'BOSS',
  report: AccountingPnlExportReport,
): string {
  const lines: string[] = [];
  if (template === 'MANAGEMENT') {
    lines.push(
      [
        'period',
        'income',
        'expense',
        'adjustment',
        'netProfit',
        'isClosed',
      ].join(','),
    );
    for (const row of report.periods) {
      lines.push(
        [
          row.period,
          formatMoney(row.incomeCents),
          formatMoney(row.expenseCents),
          formatMoney(row.adjustmentCents),
          formatMoney(row.netProfitCents),
          row.isClosed ? 'CLOSED' : 'OPEN',
        ]
          .map(escapeCsv)
          .join(','),
      );
    }
    lines.push('');
    lines.push(['category', 'type', 'amount'].join(','));
    for (const row of report.byCategoryTree) {
      lines.push(
        [row.categoryName, row.type, formatMoney(row.amountCents)]
          .map(escapeCsv)
          .join(','),
      );
    }
  } else {
    lines.push(['metric', 'amount'].join(','));
    lines.push(
      ['收入', formatMoney(report.summary.incomeCents)]
        .map(escapeCsv)
        .join(','),
    );
    lines.push(
      ['费用', formatMoney(report.summary.expenseCents)]
        .map(escapeCsv)
        .join(','),
    );
    lines.push(
      ['调整', formatMoney(report.summary.adjustmentCents)]
        .map(escapeCsv)
        .join(','),
    );
    lines.push(
      ['净利润', formatMoney(report.summary.netProfitCents)]
        .map(escapeCsv)
        .join(','),
    );
    lines.push(
      ['本月净利润', formatMoney(report.trends.currentMonthNetCents)]
        .map(escapeCsv)
        .join(','),
    );
    lines.push(
      ['上月净利润', formatMoney(report.trends.lastMonthNetCents)]
        .map(escapeCsv)
        .join(','),
    );
    lines.push(
      ['季度累计净利润', formatMoney(report.trends.quarterToDateNetCents)]
        .map(escapeCsv)
        .join(','),
    );
  }
  return lines.join('\n');
}

const PDF_LEFT = 54;
const PDF_RIGHT = 54;
const PDF_BOTTOM = 54;

const ensurePdfSpace = (doc: AccountingPdfDocument, height: number) => {
  if (doc.y + height <= doc.page.height - PDF_BOTTOM) return;
  doc.addPage();
  doc.y = 54;
};

const drawPdfHeading = (
  doc: AccountingPdfDocument,
  fonts: AccountingPdfFonts,
  title: string,
  subtitle: string,
) => {
  doc
    .font(fonts.bold)
    .fontSize(20)
    .text(title, PDF_LEFT, doc.y, {
      width: doc.page.width - PDF_LEFT - PDF_RIGHT,
    });
  doc.moveDown(0.25);
  doc.font(fonts.regular).fontSize(9).fillColor('#64748b').text(subtitle);
  doc.fillColor('#0f172a');
  doc.moveDown(1);
};

const drawPdfMetric = (
  doc: AccountingPdfDocument,
  fonts: AccountingPdfFonts,
  label: string,
  value: string,
) => {
  ensurePdfSpace(doc, 26);
  const y = doc.y;
  doc
    .font(fonts.regular)
    .fontSize(9)
    .fillColor('#64748b')
    .text(label, PDF_LEFT, y, {
      width: 180,
    });
  doc
    .font(fonts.bold)
    .fontSize(11)
    .fillColor('#0f172a')
    .text(value, PDF_LEFT + 190, y, {
      width: doc.page.width - PDF_LEFT - PDF_RIGHT - 190,
      align: 'right',
    });
  doc.y = y + 22;
};

const drawPdfTableHeader = (
  doc: AccountingPdfDocument,
  fonts: AccountingPdfFonts,
  columns: Array<{
    label: string;
    x: number;
    width: number;
    align?: 'left' | 'right';
  }>,
) => {
  ensurePdfSpace(doc, 28);
  const y = doc.y;
  doc
    .rect(PDF_LEFT, y, doc.page.width - PDF_LEFT - PDF_RIGHT, 22)
    .fill('#f1f5f9');
  for (const column of columns) {
    doc
      .font(fonts.bold)
      .fontSize(8)
      .fillColor('#334155')
      .text(column.label, column.x, y + 6, {
        width: column.width,
        align: column.align ?? 'left',
        lineBreak: false,
      });
  }
  doc.fillColor('#0f172a');
  doc.y = y + 26;
};

const drawPdfTableRow = (
  doc: AccountingPdfDocument,
  fonts: AccountingPdfFonts,
  columns: Array<{
    value: string;
    x: number;
    width: number;
    align?: 'left' | 'right';
  }>,
) => {
  ensurePdfSpace(doc, 22);
  const y = doc.y;
  for (const column of columns) {
    doc
      .font(fonts.regular)
      .fontSize(8.5)
      .fillColor('#0f172a')
      .text(column.value, column.x, y, {
        width: column.width,
        align: column.align ?? 'left',
        lineBreak: false,
        ellipsis: true,
      });
  }
  doc
    .moveTo(PDF_LEFT, y + 17)
    .lineTo(doc.page.width - PDF_RIGHT, y + 17)
    .lineWidth(0.5)
    .strokeColor('#e2e8f0')
    .stroke();
  doc.y = y + 21;
};

export function renderAccountingPnlPdf(
  template: 'MANAGEMENT' | 'BOSS',
  report: AccountingPnlExportReport,
): Promise<Buffer> {
  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const requiresUnicode =
    template === 'MANAGEMENT' &&
    report.byCategoryTree.some((row) => containsNonAscii(row.categoryName));

  return renderAccountingPdf(
    {
      title:
        template === 'MANAGEMENT'
          ? 'SanQ Accounting Management Report'
          : 'SanQ Accounting Executive Report',
      subject: 'Accounting profit and loss export',
      requiresUnicode,
    },
    ({ doc, fonts }) => {
      drawPdfHeading(
        doc,
        fonts,
        template === 'MANAGEMENT'
          ? 'SanQ Accounting - Management Report'
          : 'SanQ Accounting - Executive Report',
        'Server-generated accounting report',
      );

      drawPdfMetric(doc, fonts, 'Income', money(report.summary.incomeCents));
      drawPdfMetric(doc, fonts, 'Expense', money(report.summary.expenseCents));
      drawPdfMetric(
        doc,
        fonts,
        'Adjustment',
        money(report.summary.adjustmentCents),
      );
      drawPdfMetric(
        doc,
        fonts,
        'Net profit',
        money(report.summary.netProfitCents),
      );

      if (template === 'BOSS') {
        doc.moveDown(0.5);
        drawPdfMetric(
          doc,
          fonts,
          'Current month net',
          money(report.trends.currentMonthNetCents),
        );
        drawPdfMetric(
          doc,
          fonts,
          'Last month net',
          money(report.trends.lastMonthNetCents),
        );
        drawPdfMetric(
          doc,
          fonts,
          'Quarter-to-date net',
          money(report.trends.quarterToDateNetCents),
        );
        return;
      }

      doc.moveDown(0.75);
      doc.font(fonts.bold).fontSize(12).text('Periods');
      doc.moveDown(0.5);

      const periodColumns = [
        { label: 'Period', x: PDF_LEFT, width: 130 },
        {
          label: 'Income',
          x: PDF_LEFT + 140,
          width: 85,
          align: 'right' as const,
        },
        {
          label: 'Expense',
          x: PDF_LEFT + 235,
          width: 85,
          align: 'right' as const,
        },
        { label: 'Net', x: PDF_LEFT + 330, width: 85, align: 'right' as const },
        {
          label: 'State',
          x: PDF_LEFT + 425,
          width: 62,
          align: 'right' as const,
        },
      ];
      drawPdfTableHeader(doc, fonts, periodColumns);

      for (const row of report.periods) {
        drawPdfTableRow(doc, fonts, [
          { value: row.period, x: PDF_LEFT, width: 130 },
          {
            value: money(row.incomeCents),
            x: PDF_LEFT + 140,
            width: 85,
            align: 'right',
          },
          {
            value: money(row.expenseCents),
            x: PDF_LEFT + 235,
            width: 85,
            align: 'right',
          },
          {
            value: money(row.netProfitCents),
            x: PDF_LEFT + 330,
            width: 85,
            align: 'right',
          },
          {
            value: row.isClosed ? 'CLOSED' : 'OPEN',
            x: PDF_LEFT + 425,
            width: 62,
            align: 'right',
          },
        ]);
      }

      ensurePdfSpace(doc, 60);
      doc.moveDown(0.75);
      doc.font(fonts.bold).fontSize(12).text('Categories');
      doc.moveDown(0.5);

      const categoryColumns = [
        { label: 'Category', x: PDF_LEFT, width: 275 },
        { label: 'Type', x: PDF_LEFT + 285, width: 90 },
        {
          label: 'Amount',
          x: PDF_LEFT + 385,
          width: 102,
          align: 'right' as const,
        },
      ];
      drawPdfTableHeader(doc, fonts, categoryColumns);

      for (const row of report.byCategoryTree) {
        drawPdfTableRow(doc, fonts, [
          { value: row.categoryName, x: PDF_LEFT, width: 275 },
          { value: row.type, x: PDF_LEFT + 285, width: 90 },
          {
            value: money(row.amountCents),
            x: PDF_LEFT + 385,
            width: 102,
            align: 'right',
          },
        ]);
      }
    },
  );
}
