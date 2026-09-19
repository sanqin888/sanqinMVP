import {
  containsNonAscii,
  renderAccountingPdf,
  type AccountingPdfDocument,
  type AccountingPdfFonts,
} from '../accounting-pdf';
import type { PayrollCalculationYtdOutput } from './payroll-calculator.contracts';

export type PayrollPayStatementYtd = Pick<
  PayrollCalculationYtdOutput,
  | 'grossEarningsYtdCents'
  | 'netPayYtdCents'
  | 'pensionableEarningsYtdCents'
  | 'employeeCppYtdCents'
  | 'employeeCpp2YtdCents'
  | 'insurableEarningsYtdCents'
  | 'employeeEiYtdCents'
  | 'incomeTaxYtdCents'
  | 'vacationPayPaidYtdCents'
  | 'vacationPayAccruedYtdCents'
>;

export type PayrollPayStatementSnapshot = {
  statementNumber: string;
  templateVersion: string;
  employerName: string;
  employeeName: string;
  runStableId: string;
  payFrequency: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  approvedAt: Date;
  regularMinutes: number;
  regularHourlyRateCents: number;
  overtimeMinutes: number;
  overtimeHourlyRateCents: number;
  regularPayCents: number;
  overtimePayCents: number;
  vacationPayPaidCents: number;
  vacationPayAccruedCents: number;
  grossPayCents: number;
  incomeTaxCents: number;
  employeeCppCents: number;
  employeeCpp2Cents: number;
  employeeEiCents: number;
  totalEmployeeDeductionsCents: number;
  netPayCents: number;
  ytd: PayrollPayStatementYtd;
};

const LEFT = 54;
const RIGHT = 54;
const BOTTOM = 54;

const money = (cents: number) => '$' + (cents / 100).toFixed(2);
const hours = (minutes: number) => (minutes / 60).toFixed(2);

const ensureSpace = (doc: AccountingPdfDocument, height: number) => {
  if (doc.y + height <= doc.page.height - BOTTOM) return;
  doc.addPage();
  doc.y = 54;
};

const drawSectionTitle = (
  doc: AccountingPdfDocument,
  fonts: AccountingPdfFonts,
  title: string,
) => {
  ensureSpace(doc, 34);
  doc.font(fonts.bold).fontSize(11).fillColor('#0f172a').text(title);
  doc.moveDown(0.35);
};

const drawKeyValue = (
  doc: AccountingPdfDocument,
  fonts: AccountingPdfFonts,
  label: string,
  value: string,
) => {
  ensureSpace(doc, 22);
  const y = doc.y;
  doc
    .font(fonts.regular)
    .fontSize(8.5)
    .fillColor('#64748b')
    .text(label, LEFT, y, { width: 210 });
  doc
    .font(fonts.bold)
    .fontSize(9.5)
    .fillColor('#0f172a')
    .text(value, LEFT + 220, y, {
      width: doc.page.width - LEFT - RIGHT - 220,
      align: 'right',
    });
  doc.y = y + 19;
};

const drawMoneyRow = (
  doc: AccountingPdfDocument,
  fonts: AccountingPdfFonts,
  label: string,
  valueCents: number,
  detail?: string,
) => {
  ensureSpace(doc, 24);
  const y = doc.y;
  doc
    .font(fonts.regular)
    .fontSize(9)
    .fillColor('#0f172a')
    .text(label, LEFT, y, { width: 250 });
  if (detail) {
    doc
      .font(fonts.regular)
      .fontSize(7.5)
      .fillColor('#64748b')
      .text(detail, LEFT + 255, y + 1, {
        width: 120,
        align: 'right',
      });
  }
  doc
    .font(fonts.bold)
    .fontSize(9.5)
    .fillColor('#0f172a')
    .text(money(valueCents), LEFT + 385, y, {
      width: 105,
      align: 'right',
    });
  doc
    .moveTo(LEFT, y + 17)
    .lineTo(doc.page.width - RIGHT, y + 17)
    .lineWidth(0.4)
    .strokeColor('#e2e8f0')
    .stroke();
  doc.y = y + 21;
};

type YtdItem = {
  label: string;
  valueCents: number;
};

const drawYtdGrid = (
  doc: AccountingPdfDocument,
  fonts: AccountingPdfFonts,
  items: readonly YtdItem[],
) => {
  const gap = 18;
  const availableWidth = doc.page.width - LEFT - RIGHT;
  const columnWidth = (availableWidth - gap) / 2;
  const valueWidth = 78;
  const labelWidth = columnWidth - valueWidth - 8;

  for (let index = 0; index < items.length; index += 2) {
    ensureSpace(doc, 22);
    const y = doc.y;

    for (let column = 0; column < 2; column += 1) {
      const item = items[index + column];
      if (!item) continue;

      const x = LEFT + column * (columnWidth + gap);
      doc
        .font(fonts.regular)
        .fontSize(8)
        .fillColor('#64748b')
        .text(item.label, x, y, {
          width: labelWidth,
          lineBreak: false,
          ellipsis: true,
        });
      doc
        .font(fonts.bold)
        .fontSize(9)
        .fillColor('#0f172a')
        .text(money(item.valueCents), x + columnWidth - valueWidth, y, {
          width: valueWidth,
          align: 'right',
          lineBreak: false,
        });
    }

    doc
      .moveTo(LEFT, y + 17)
      .lineTo(doc.page.width - RIGHT, y + 17)
      .lineWidth(0.4)
      .strokeColor('#e2e8f0')
      .stroke();
    doc.y = y + 21;
  }
};

export const renderPayrollPayStatementPdf = (
  snapshot: PayrollPayStatementSnapshot,
): Promise<Buffer> => {
  const requiresUnicode =
    containsNonAscii(snapshot.employerName) ||
    containsNonAscii(snapshot.employeeName);

  return renderAccountingPdf(
    {
      title: 'SanQ Pay Statement ' + snapshot.statementNumber,
      subject: 'PayrollRun ' + snapshot.runStableId,
      creationDate: snapshot.approvedAt,
      requiresUnicode,
    },
    ({ doc, fonts }) => {
      doc
        .font(fonts.bold)
        .fontSize(20)
        .fillColor('#0f172a')
        .text('PAY STATEMENT', LEFT, doc.y, {
          width: doc.page.width - LEFT - RIGHT,
        });
      doc.moveDown(0.2);
      doc
        .font(fonts.regular)
        .fontSize(8)
        .fillColor('#64748b')
        .text(snapshot.statementNumber + ' | ' + snapshot.templateVersion);
      doc.moveDown(1);

      drawKeyValue(doc, fonts, 'Employer', snapshot.employerName);
      drawKeyValue(doc, fonts, 'Employee', snapshot.employeeName);
      drawKeyValue(
        doc,
        fonts,
        'Pay period',
        snapshot.periodStart + ' to ' + snapshot.periodEnd,
      );
      drawKeyValue(doc, fonts, 'Pay date', snapshot.payDate);
      drawKeyValue(doc, fonts, 'Pay frequency', snapshot.payFrequency);

      doc.moveDown(0.7);
      drawSectionTitle(doc, fonts, 'Earnings');
      drawMoneyRow(
        doc,
        fonts,
        'Regular pay',
        snapshot.regularPayCents,
        hours(snapshot.regularMinutes) +
          ' h @ ' +
          money(snapshot.regularHourlyRateCents) +
          '/h',
      );
      if (snapshot.overtimeMinutes > 0 || snapshot.overtimePayCents > 0) {
        drawMoneyRow(
          doc,
          fonts,
          'Overtime pay',
          snapshot.overtimePayCents,
          hours(snapshot.overtimeMinutes) +
            ' h @ ' +
            money(snapshot.overtimeHourlyRateCents) +
            '/h',
        );
      }
      if (snapshot.vacationPayPaidCents > 0) {
        drawMoneyRow(
          doc,
          fonts,
          'Vacation pay paid',
          snapshot.vacationPayPaidCents,
        );
      }
      if (snapshot.vacationPayAccruedCents > 0) {
        drawMoneyRow(
          doc,
          fonts,
          'Vacation pay accrued',
          snapshot.vacationPayAccruedCents,
        );
      }
      drawMoneyRow(doc, fonts, 'Gross pay', snapshot.grossPayCents);

      doc.moveDown(0.7);
      drawSectionTitle(doc, fonts, 'Employee deductions');
      drawMoneyRow(doc, fonts, 'Income tax', snapshot.incomeTaxCents);
      drawMoneyRow(doc, fonts, 'CPP', snapshot.employeeCppCents);
      drawMoneyRow(doc, fonts, 'CPP2', snapshot.employeeCpp2Cents);
      drawMoneyRow(doc, fonts, 'EI', snapshot.employeeEiCents);
      drawMoneyRow(
        doc,
        fonts,
        'Total deductions',
        snapshot.totalEmployeeDeductionsCents,
      );

      doc.moveDown(0.6);
      ensureSpace(doc, 58);
      const netY = doc.y;
      doc.rect(LEFT, netY, doc.page.width - LEFT - RIGHT, 46).fill('#f8fafc');
      doc
        .font(fonts.bold)
        .fontSize(12)
        .fillColor('#0f172a')
        .text('NET PAY', LEFT + 12, netY + 14, { width: 180 });
      doc
        .font(fonts.bold)
        .fontSize(17)
        .text(money(snapshot.netPayCents), LEFT + 210, netY + 10, {
          width: doc.page.width - LEFT - RIGHT - 222,
          align: 'right',
        });
      doc.y = netY + 60;

      drawSectionTitle(doc, fonts, 'Year to date');
      drawYtdGrid(doc, fonts, [
        {
          label: 'Gross earnings YTD',
          valueCents: snapshot.ytd.grossEarningsYtdCents,
        },
        {
          label: 'Net pay YTD',
          valueCents: snapshot.ytd.netPayYtdCents,
        },
        {
          label: 'Income tax YTD',
          valueCents: snapshot.ytd.incomeTaxYtdCents,
        },
        {
          label: 'CPP YTD',
          valueCents: snapshot.ytd.employeeCppYtdCents,
        },
        {
          label: 'CPP2 YTD',
          valueCents: snapshot.ytd.employeeCpp2YtdCents,
        },
        {
          label: 'EI YTD',
          valueCents: snapshot.ytd.employeeEiYtdCents,
        },
        {
          label: 'Pensionable earnings YTD',
          valueCents: snapshot.ytd.pensionableEarningsYtdCents,
        },
        {
          label: 'Insurable earnings YTD',
          valueCents: snapshot.ytd.insurableEarningsYtdCents,
        },
        {
          label: 'Vacation paid YTD',
          valueCents: snapshot.ytd.vacationPayPaidYtdCents,
        },
        {
          label: 'Vacation accrued YTD',
          valueCents: snapshot.ytd.vacationPayAccruedYtdCents,
        },
      ]);

      doc.moveDown(0.6);
      doc
        .font(fonts.regular)
        .fontSize(7.5)
        .fillColor('#64748b')
        .text(
          'PayrollRun ' +
            snapshot.runStableId +
            '. This pay statement represents approved payroll facts and is not an editable accounting source.',
          LEFT,
          doc.y,
          {
            width: doc.page.width - LEFT - RIGHT,
            align: 'center',
          },
        );
    },
  );
};
