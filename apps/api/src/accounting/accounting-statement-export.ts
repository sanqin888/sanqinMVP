import type { AccountingBalanceMovementReportV1 } from './accounting-balance-movement.contract';
import {
  containsNonAscii,
  renderAccountingPdf,
  type AccountingPdfDocument,
  type AccountingPdfFonts,
} from './accounting-pdf';
import type { AccountingTrialBalanceReportV1 } from './accounting-trial-balance.contract';

const escapeCsv = (value: string | number | boolean | null | undefined) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const money = (cents: number) => (cents / 100).toFixed(2);
const pdfMoney = (cents: number) =>
  `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;

type StatementMetadata = {
  scope: string;
  currency: string;
  timezone: string;
  accountingStartDate: string;
  requestedFrom: string;
  requestedTo: string;
  effectiveFrom: string;
  effectiveTo: string;
  allMonthsClosed: boolean;
  monthCloseStates: string;
  yearCloseStates: string;
  openingJournalEntryCount: number;
  openingJournalDebitCents: number;
  openingJournalCreditCents: number;
};

const metadata = (
  report: Pick<
    AccountingTrialBalanceReportV1,
    | 'scope'
    | 'currency'
    | 'timezone'
    | 'accountingStartDate'
    | 'requestedFrom'
    | 'requestedTo'
    | 'effectiveFrom'
    | 'effectiveTo'
    | 'closeStatus'
    | 'openingBalanceJournal'
  >,
): StatementMetadata => ({
  scope: report.scope,
  currency: report.currency,
  timezone: report.timezone,
  accountingStartDate: report.accountingStartDate,
  requestedFrom: report.requestedFrom,
  requestedTo: report.requestedTo,
  effectiveFrom: report.effectiveFrom,
  effectiveTo: report.effectiveTo,
  allMonthsClosed: report.closeStatus.allMonthsClosed,
  monthCloseStates: report.closeStatus.months
    .map((row) => `${row.periodKey}:${row.isClosed ? 'CLOSED' : 'OPEN'}`)
    .join('|'),
  yearCloseStates: report.closeStatus.years
    .map((row) => `${row.periodKey}:${row.isClosed ? 'CLOSED' : 'OPEN'}`)
    .join('|'),
  openingJournalEntryCount: report.openingBalanceJournal.entryCount,
  openingJournalDebitCents: report.openingBalanceJournal.debitCents,
  openingJournalCreditCents: report.openingBalanceJournal.creditCents,
});

const withMetadata = (
  meta: StatementMetadata,
  cells: Array<string | number | boolean>,
) =>
  [
    meta.scope,
    meta.currency,
    meta.timezone,
    meta.accountingStartDate,
    meta.requestedFrom,
    meta.requestedTo,
    meta.effectiveFrom,
    meta.effectiveTo,
    meta.allMonthsClosed ? 'CLOSED' : 'OPEN',
    meta.monthCloseStates,
    meta.yearCloseStates,
    meta.openingJournalEntryCount,
    meta.openingJournalDebitCents,
    meta.openingJournalCreditCents,
    ...cells,
  ]
    .map(escapeCsv)
    .join(',');

const commonCsvHeader = [
  'scope',
  'currency',
  'timezone',
  'accountingStartDate',
  'requestedFrom',
  'requestedTo',
  'effectiveFrom',
  'effectiveTo',
  'periodCloseState',
  'monthCloseStates',
  'yearCloseStates',
  'openingJournalEntryCount',
  'openingJournalDebitCents',
  'openingJournalCreditCents',
];

export function renderAccountingTrialBalanceCsv(
  report: AccountingTrialBalanceReportV1,
): string {
  const meta = metadata(report);
  const header = [
    ...commonCsvHeader,
    'rowType',
    'accountStableId',
    'accountName',
    'accountClass',
    'accountType',
    'isActive',
    'normalSide',
    'openingDebit',
    'openingCredit',
    'openingNormal',
    'periodDebit',
    'periodCredit',
    'periodNormalMovement',
    'closingDebit',
    'closingCredit',
    'closingNormal',
  ];

  const rows = report.accounts.map((row) =>
    withMetadata(meta, [
      'ACCOUNT',
      row.accountStableId,
      row.accountName,
      row.accountClass,
      row.accountType ?? '',
      row.isActive,
      row.normalSide,
      money(row.openingDebitBalanceCents),
      money(row.openingCreditBalanceCents),
      money(row.openingNormalBalanceCents),
      money(row.periodDebitCents),
      money(row.periodCreditCents),
      money(row.periodNormalMovementCents),
      money(row.closingDebitBalanceCents),
      money(row.closingCreditBalanceCents),
      money(row.closingNormalBalanceCents),
    ]),
  );

  rows.push(
    withMetadata(meta, [
      'TOTAL',
      '',
      'TOTAL',
      '',
      '',
      '',
      '',
      money(report.totals.openingDebitBalanceCents),
      money(report.totals.openingCreditBalanceCents),
      '',
      money(report.totals.periodDebitCents),
      money(report.totals.periodCreditCents),
      '',
      money(report.totals.closingDebitBalanceCents),
      money(report.totals.closingCreditBalanceCents),
      '',
    ]),
  );

  return [header.join(','), ...rows].join('\n');
}

export function renderAccountingBalanceMovementCsv(
  report: AccountingBalanceMovementReportV1,
): string {
  const meta = metadata(report);
  const header = [
    ...commonCsvHeader,
    'rowType',
    'section',
    'accountStableId',
    'accountName',
    'accountType',
    'isActive',
    'openingCumulative',
    'periodMovement',
    'closingCumulative',
    'reconciliation',
    'openingBasis',
    'absoluteBalanceClaim',
  ];
  const rows: string[] = [];

  const addAccountSection = (
    section: string,
    source: AccountingBalanceMovementReportV1['assets'],
  ) => {
    for (const row of source.accounts) {
      rows.push(
        withMetadata(meta, [
          'ACCOUNT',
          section,
          row.accountStableId,
          row.accountName,
          row.accountType ?? '',
          row.isActive,
          money(row.openingCumulativeCents),
          money(row.periodMovementCents),
          money(row.closingCumulativeCents),
          '',
          report.openingBasis.kind,
          report.openingBasis.absoluteBalanceClaim,
        ]),
      );
    }
    rows.push(
      withMetadata(meta, [
        'SECTION_TOTAL',
        section,
        '',
        `${section} TOTAL`,
        '',
        '',
        money(source.openingCumulativeCents),
        money(source.periodMovementCents),
        money(source.closingCumulativeCents),
        '',
        report.openingBasis.kind,
        report.openingBasis.absoluteBalanceClaim,
      ]),
    );
  };

  addAccountSection('ASSET', report.assets);
  addAccountSection('LIABILITY', report.liabilities);
  addAccountSection('DIRECT_EQUITY', report.directEquity);

  for (const [section, amounts] of [
    ['REVENUE', report.earningsBridge.revenue],
    ['EXPENSE', report.earningsBridge.expense],
    ['RECORDED_EARNINGS', report.earningsBridge.recordedEarnings],
  ] as const) {
    rows.push(
      withMetadata(meta, [
        'EARNINGS_BRIDGE',
        section,
        '',
        section,
        '',
        '',
        money(amounts.openingCumulativeCents),
        money(amounts.periodMovementCents),
        money(amounts.closingCumulativeCents),
        '',
        report.openingBasis.kind,
        report.openingBasis.absoluteBalanceClaim,
      ]),
    );
  }

  for (const [phase, bridge] of [
    ['OPENING', report.bridge.opening],
    ['PERIOD', report.bridge.period],
    ['CLOSING', report.bridge.closing],
  ] as const) {
    rows.push(
      withMetadata(meta, [
        'RECONCILIATION',
        phase,
        '',
        phase,
        '',
        '',
        '',
        '',
        '',
        money(bridge.reconciliationCents),
        report.openingBasis.kind,
        report.openingBasis.absoluteBalanceClaim,
      ]),
    );
  }

  return [header.join(','), ...rows].join('\n');
}

const PDF_LEFT = 42;
const PDF_RIGHT = 42;
const PDF_BOTTOM = 48;

const ensureSpace = (doc: AccountingPdfDocument, height: number) => {
  if (doc.y + height <= doc.page.height - PDF_BOTTOM) return;
  doc.addPage();
  doc.y = 48;
};

const drawHeading = (
  doc: AccountingPdfDocument,
  fonts: AccountingPdfFonts,
  title: string,
  subtitle: string,
) => {
  doc
    .font(fonts.bold)
    .fontSize(18)
    .fillColor('#0f172a')
    .text(title, PDF_LEFT, doc.y, {
      width: doc.page.width - PDF_LEFT - PDF_RIGHT,
    });
  doc.moveDown(0.25);
  doc.font(fonts.regular).fontSize(8.5).fillColor('#64748b').text(subtitle);
  doc.fillColor('#0f172a');
  doc.moveDown(0.75);
};

const drawStatementMetadata = (
  doc: AccountingPdfDocument,
  fonts: AccountingPdfFonts,
  report: Pick<
    AccountingTrialBalanceReportV1,
    | 'scope'
    | 'currency'
    | 'timezone'
    | 'accountingStartDate'
    | 'requestedFrom'
    | 'requestedTo'
    | 'effectiveFrom'
    | 'effectiveTo'
    | 'closeStatus'
    | 'openingBalanceJournal'
  >,
) => {
  const lines = [
    `Scope: ${report.scope} · Currency: ${report.currency} · Timezone: ${report.timezone}`,
    `Requested: ${report.requestedFrom} to ${report.requestedTo} · Effective: ${report.effectiveFrom} to ${report.effectiveTo}`,
    `Accounting start: ${report.accountingStartDate} · Period close: ${
      report.closeStatus.allMonthsClosed ? 'CLOSED' : 'OPEN'
    }`,
  ];
  for (const line of lines) {
    doc
      .font(fonts.regular)
      .fontSize(8)
      .fillColor('#475569')
      .text(line, PDF_LEFT, doc.y, {
        width: doc.page.width - PDF_LEFT - PDF_RIGHT,
      });
    doc.moveDown(0.15);
  }
  doc.fillColor('#0f172a');
  doc.moveDown(0.4);
};

const drawSmallTableHeader = (
  doc: AccountingPdfDocument,
  fonts: AccountingPdfFonts,
  labels: Array<{
    label: string;
    x: number;
    width: number;
    align?: 'left' | 'right';
  }>,
) => {
  ensureSpace(doc, 24);
  const y = doc.y;
  doc
    .rect(PDF_LEFT, y, doc.page.width - PDF_LEFT - PDF_RIGHT, 19)
    .fill('#f1f5f9');
  for (const item of labels) {
    doc
      .font(fonts.bold)
      .fontSize(6.5)
      .fillColor('#334155')
      .text(item.label, item.x, y + 5, {
        width: item.width,
        align: item.align ?? 'left',
        lineBreak: false,
      });
  }
  doc.fillColor('#0f172a');
  doc.y = y + 23;
};

const drawSmallTableRow = (
  doc: AccountingPdfDocument,
  fonts: AccountingPdfFonts,
  values: Array<{
    value: string;
    x: number;
    width: number;
    align?: 'left' | 'right';
    bold?: boolean;
  }>,
) => {
  ensureSpace(doc, 19);
  const y = doc.y;
  for (const item of values) {
    doc
      .font(item.bold ? fonts.bold : fonts.regular)
      .fontSize(6.5)
      .fillColor('#0f172a')
      .text(item.value, item.x, y, {
        width: item.width,
        align: item.align ?? 'left',
        lineBreak: false,
        ellipsis: true,
      });
  }
  doc
    .moveTo(PDF_LEFT, y + 14)
    .lineTo(doc.page.width - PDF_RIGHT, y + 14)
    .lineWidth(0.4)
    .strokeColor('#e2e8f0')
    .stroke();
  doc.y = y + 18;
};

export function renderAccountingTrialBalancePdf(
  report: AccountingTrialBalanceReportV1,
): Promise<Buffer> {
  const requiresUnicode = report.accounts.some((row) =>
    containsNonAscii(row.accountName),
  );

  return renderAccountingPdf(
    {
      title: 'SanQ Accounting Trial Balance',
      subject: 'Canonical Trial Balance export',
      requiresUnicode,
    },
    ({ doc, fonts }) => {
      drawHeading(
        doc,
        fonts,
        'SanQ Accounting - Trial Balance',
        'Canonical Journal statement projection',
      );
      drawStatementMetadata(doc, fonts, report);

      const columns = [
        { label: 'Account', x: PDF_LEFT, width: 122 },
        {
          label: 'Open Dr',
          x: PDF_LEFT + 126,
          width: 54,
          align: 'right' as const,
        },
        {
          label: 'Open Cr',
          x: PDF_LEFT + 184,
          width: 54,
          align: 'right' as const,
        },
        {
          label: 'Period Dr',
          x: PDF_LEFT + 242,
          width: 54,
          align: 'right' as const,
        },
        {
          label: 'Period Cr',
          x: PDF_LEFT + 300,
          width: 54,
          align: 'right' as const,
        },
        {
          label: 'Close Dr',
          x: PDF_LEFT + 358,
          width: 54,
          align: 'right' as const,
        },
        {
          label: 'Close Cr',
          x: PDF_LEFT + 416,
          width: 54,
          align: 'right' as const,
        },
      ];
      drawSmallTableHeader(doc, fonts, columns);

      for (const row of report.accounts) {
        drawSmallTableRow(doc, fonts, [
          {
            value: `${row.accountName} [${row.accountClass}${
              row.isActive ? '' : ', inactive'
            }]`,
            x: PDF_LEFT,
            width: 122,
          },
          {
            value: pdfMoney(row.openingDebitBalanceCents),
            x: PDF_LEFT + 126,
            width: 54,
            align: 'right',
          },
          {
            value: pdfMoney(row.openingCreditBalanceCents),
            x: PDF_LEFT + 184,
            width: 54,
            align: 'right',
          },
          {
            value: pdfMoney(row.periodDebitCents),
            x: PDF_LEFT + 242,
            width: 54,
            align: 'right',
          },
          {
            value: pdfMoney(row.periodCreditCents),
            x: PDF_LEFT + 300,
            width: 54,
            align: 'right',
          },
          {
            value: pdfMoney(row.closingDebitBalanceCents),
            x: PDF_LEFT + 358,
            width: 54,
            align: 'right',
          },
          {
            value: pdfMoney(row.closingCreditBalanceCents),
            x: PDF_LEFT + 416,
            width: 54,
            align: 'right',
          },
        ]);
      }

      drawSmallTableRow(doc, fonts, [
        { value: 'TOTAL', x: PDF_LEFT, width: 122, bold: true },
        {
          value: pdfMoney(report.totals.openingDebitBalanceCents),
          x: PDF_LEFT + 126,
          width: 54,
          align: 'right',
          bold: true,
        },
        {
          value: pdfMoney(report.totals.openingCreditBalanceCents),
          x: PDF_LEFT + 184,
          width: 54,
          align: 'right',
          bold: true,
        },
        {
          value: pdfMoney(report.totals.periodDebitCents),
          x: PDF_LEFT + 242,
          width: 54,
          align: 'right',
          bold: true,
        },
        {
          value: pdfMoney(report.totals.periodCreditCents),
          x: PDF_LEFT + 300,
          width: 54,
          align: 'right',
          bold: true,
        },
        {
          value: pdfMoney(report.totals.closingDebitBalanceCents),
          x: PDF_LEFT + 358,
          width: 54,
          align: 'right',
          bold: true,
        },
        {
          value: pdfMoney(report.totals.closingCreditBalanceCents),
          x: PDF_LEFT + 416,
          width: 54,
          align: 'right',
          bold: true,
        },
      ]);
    },
  );
}

export function renderAccountingBalanceMovementPdf(
  report: AccountingBalanceMovementReportV1,
): Promise<Buffer> {
  const allAccountNames = [
    ...report.assets.accounts,
    ...report.liabilities.accounts,
    ...report.directEquity.accounts,
  ].map((row) => row.accountName);
  const requiresUnicode = allAccountNames.some(containsNonAscii);

  return renderAccountingPdf(
    {
      title: 'SanQ Accounting Balance Movement Statement',
      subject: 'Canonical Balance Movement Statement export',
      requiresUnicode,
    },
    ({ doc, fonts }) => {
      drawHeading(
        doc,
        fonts,
        'SanQ Accounting - Balance Movement Statement',
        'Canonical movement statement; not a formal Balance Sheet',
      );
      drawStatementMetadata(doc, fonts, report);

      const disclaimer = report.openingBasis.zeroOpeningDisclaimerRequired
        ? `Calculated from a $0 opening at ${report.accountingStartDate}. This shows cumulative recorded SanQ transaction movement and does not represent absolute real-world bank, cash, or other account balances.`
        : 'Opening values include explicit OPENING_BALANCE Journals. This statement still does not claim absolute real-world balances and is not a formal Balance Sheet.';
      doc
        .font(fonts.regular)
        .fontSize(8)
        .fillColor('#92400e')
        .text(disclaimer, PDF_LEFT, doc.y, {
          width: doc.page.width - PDF_LEFT - PDF_RIGHT,
        });
      doc.fillColor('#0f172a');
      doc.moveDown(0.75);

      const columns = [
        { label: 'Section / Account', x: PDF_LEFT, width: 240 },
        {
          label: 'Opening',
          x: PDF_LEFT + 250,
          width: 72,
          align: 'right' as const,
        },
        {
          label: 'Period',
          x: PDF_LEFT + 332,
          width: 72,
          align: 'right' as const,
        },
        {
          label: 'Closing',
          x: PDF_LEFT + 414,
          width: 72,
          align: 'right' as const,
        },
      ];
      drawSmallTableHeader(doc, fonts, columns);

      const drawSection = (
        sectionName: string,
        section: AccountingBalanceMovementReportV1['assets'],
      ) => {
        for (const row of section.accounts) {
          drawSmallTableRow(doc, fonts, [
            {
              value: `${sectionName} · ${row.accountName}${
                row.isActive ? '' : ' [inactive]'
              }`,
              x: PDF_LEFT,
              width: 240,
            },
            {
              value: pdfMoney(row.openingCumulativeCents),
              x: PDF_LEFT + 250,
              width: 72,
              align: 'right',
            },
            {
              value: pdfMoney(row.periodMovementCents),
              x: PDF_LEFT + 332,
              width: 72,
              align: 'right',
            },
            {
              value: pdfMoney(row.closingCumulativeCents),
              x: PDF_LEFT + 414,
              width: 72,
              align: 'right',
            },
          ]);
        }
        drawSmallTableRow(doc, fonts, [
          {
            value: `${sectionName} TOTAL`,
            x: PDF_LEFT,
            width: 240,
            bold: true,
          },
          {
            value: pdfMoney(section.openingCumulativeCents),
            x: PDF_LEFT + 250,
            width: 72,
            align: 'right',
            bold: true,
          },
          {
            value: pdfMoney(section.periodMovementCents),
            x: PDF_LEFT + 332,
            width: 72,
            align: 'right',
            bold: true,
          },
          {
            value: pdfMoney(section.closingCumulativeCents),
            x: PDF_LEFT + 414,
            width: 72,
            align: 'right',
            bold: true,
          },
        ]);
      };

      drawSection('ASSET', report.assets);
      drawSection('LIABILITY', report.liabilities);
      drawSection('DIRECT EQUITY', report.directEquity);

      for (const [label, amounts] of [
        ['Revenue', report.earningsBridge.revenue],
        ['Expense', report.earningsBridge.expense],
        ['Recorded earnings', report.earningsBridge.recordedEarnings],
      ] as const) {
        drawSmallTableRow(doc, fonts, [
          {
            value: label,
            x: PDF_LEFT,
            width: 240,
            bold: label === 'Recorded earnings',
          },
          {
            value: pdfMoney(amounts.openingCumulativeCents),
            x: PDF_LEFT + 250,
            width: 72,
            align: 'right',
            bold: label === 'Recorded earnings',
          },
          {
            value: pdfMoney(amounts.periodMovementCents),
            x: PDF_LEFT + 332,
            width: 72,
            align: 'right',
            bold: label === 'Recorded earnings',
          },
          {
            value: pdfMoney(amounts.closingCumulativeCents),
            x: PDF_LEFT + 414,
            width: 72,
            align: 'right',
            bold: label === 'Recorded earnings',
          },
        ]);
      }

      ensureSpace(doc, 72);
      doc.moveDown(0.75);
      doc.font(fonts.bold).fontSize(10).text('Reconciliation');
      doc.moveDown(0.35);
      for (const [label, value] of [
        ['Opening', report.bridge.opening.reconciliationCents],
        ['Period', report.bridge.period.reconciliationCents],
        ['Closing', report.bridge.closing.reconciliationCents],
      ] as const) {
        doc
          .font(fonts.regular)
          .fontSize(8)
          .text(`${label}: ${pdfMoney(value)}`);
      }
    },
  );
}
