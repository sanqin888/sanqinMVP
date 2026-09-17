import type { AccountingFinancialReportFact } from './accounting-financial-report-policy';

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

export function renderAccountingPnlPdf(
  template: 'MANAGEMENT' | 'BOSS',
  report: AccountingPnlExportReport,
): Buffer {
  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const textLines =
    template === 'MANAGEMENT'
      ? [
          `模板: 管理版（明细）`,
          `收入: ${money(report.summary.incomeCents)}`,
          `费用: ${money(report.summary.expenseCents)}`,
          `调整: ${money(report.summary.adjustmentCents)}`,
          `净利润: ${money(report.summary.netProfitCents)}`,
          ...report.periods
            .slice(0, 12)
            .map(
              (item) =>
                `${item.period} | ${money(item.netProfitCents)} | ${item.isClosed ? '已锁账' : '未锁账'}`,
            ),
        ]
      : [
          `模板: 老板版（摘要）`,
          `净利润: ${money(report.summary.netProfitCents)}`,
          `本月: ${money(report.trends.currentMonthNetCents)}`,
          `上月: ${money(report.trends.lastMonthNetCents)}`,
          `季度累计: ${money(report.trends.quarterToDateNetCents)}`,
        ];

  const objects: string[] = [];
  const escapedText = textLines
    .map(
      (line, index) =>
        `${50} ${780 - index * 22} Td (${line.replace(/[()\\]/g, '\\$&')}) Tj`,
    )
    .join(' T* ');
  const contentStream = `BT /F1 12 Tf ${escapedText} ET`;
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push('2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj');
  objects.push(
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
  );
  objects.push(
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  );
  objects.push(
    `5 0 obj << /Length ${contentStream.length} >> stream\n${contentStream}\nendstream endobj`,
  );

  let pdf = '%PDF-1.4\n';
  const xref: number[] = [0];
  for (const object of objects) {
    xref.push(pdf.length);
    pdf += `${object}\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${xref.length}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index < xref.length; index += 1) {
    pdf += `${String(xref[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}
