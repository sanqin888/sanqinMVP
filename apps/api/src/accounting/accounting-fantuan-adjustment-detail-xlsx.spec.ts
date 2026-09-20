import * as XLSX from '@keep-lts/xlsx';
import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
} from './accounting-contracts';
import { FANTUAN_ADJUSTMENT_RAW_CODES } from './accounting-fantuan-adjustment-detail.contract';
import { parseFantuanAdjustmentDetailXlsx } from './accounting-fantuan-adjustment-detail-xlsx';

const makeWorkbook = (rows: Array<Record<string, string | number>>): Buffer => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, 'sheet1');
  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer;
};

describe('Fantuan adjustment detail XLSX parser', () => {
  it('classifies Compensation and Deduction from Order type + Fee type', () => {
    const parsed = parseFantuanAdjustmentDetailXlsx({
      originalFilename:
        'Fantuan_Settlement_Details2026-08-01_2026-08-31_en.xlsx',
      buffer: makeWorkbook([
        {
          'Store Name': 'SanQ',
          'Store ID': 'store-fantuan-1',
          'Fee Type': 'Order',
          'Settle Time': '2026-08-08 10:00:00',
          'Order No.': '#normal',
          'Order Type': 'Delivery',
          'Total transfer amount': 15.04,
          remarks: '',
        },
        {
          'Store Name': 'SanQ',
          'Store ID': 'store-fantuan-1',
          'Fee Type': 'Compensation',
          'Settle Time': '2026-08-31 11:02:15',
          'Order No.': '#43339',
          'Order Type': 'Adjustment',
          'Total transfer amount': 33.54,
          remarks: 'text is deliberately not used for classification',
        },
        {
          'Store Name': 'SanQ',
          'Store ID': 'store-fantuan-1',
          'Fee Type': 'Deduction',
          'Settle Time': '2026-08-10 14:20:21',
          'Order No.': '#19675',
          'Order Type': 'Adjustment',
          'Total transfer amount': -6.6,
          remarks: 'another arbitrary note',
        },
      ]),
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        provider: AccountingFinancialProvider.FANTUAN,
        documentType: AccountingFinancialDocumentType.OTHER,
        businessIdentityKey: 'fantuan:adjustment-detail:2026-08-01:2026-08-31',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        rawMetadata: expect.objectContaining({
          evidenceKind: 'FANTUAN_SETTLEMENT_ADJUSTMENT_DETAIL',
          adjustmentRowCount: 2,
          adjustmentNetCents: 2694,
          unknownFeeTypes: [],
        }) as unknown,
      }),
    );
    expect(parsed?.lines).toEqual([
      expect.objectContaining({
        externalRef: '#43339',
        rawCode: FANTUAN_ADJUSTMENT_RAW_CODES.COMPENSATION,
        rawName: 'Compensation',
        component: AccountingFinancialComponent.ADJUSTMENT,
        postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
        amountCents: 3354,
      }),
      expect.objectContaining({
        externalRef: '#19675',
        rawCode: FANTUAN_ADJUSTMENT_RAW_CODES.DEDUCTION,
        rawName: 'Deduction',
        component: AccountingFinancialComponent.ADJUSTMENT,
        postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
        amountCents: -660,
      }),
    ]);
  });

  it('preserves an unknown Adjustment fee type as fail-closed evidence', () => {
    const parsed = parseFantuanAdjustmentDetailXlsx({
      originalFilename:
        'Fantuan_Settlement_Details2026-08-01_2026-08-31_en.xlsx',
      buffer: makeWorkbook([
        {
          'Fee Type': 'Mystery Fee',
          'Settle Time': '2026-08-20 12:00:00',
          'Order No.': '#unknown',
          'Order Type': 'Adjustment',
          'Total transfer amount': 1.23,
          remarks: '',
        },
      ]),
    });

    expect(parsed?.lines[0]).toEqual(
      expect.objectContaining({
        rawCode: FANTUAN_ADJUSTMENT_RAW_CODES.UNKNOWN,
        amountCents: 123,
      }),
    );
    expect(parsed?.rawMetadata).toEqual(
      expect.objectContaining({
        unknownFeeTypes: ['Mystery Fee'],
      }),
    );
  });

  it('rejects Adjustment rows outside the filename period', () => {
    expect(() =>
      parseFantuanAdjustmentDetailXlsx({
        originalFilename:
          'Fantuan_Settlement_Details2026-08-01_2026-08-31_en.xlsx',
        buffer: makeWorkbook([
          {
            'Fee Type': 'Compensation',
            'Settle Time': '2026-07-31 23:55:00',
            'Order No.': '#wrong-period',
            'Order Type': 'Adjustment',
            'Total transfer amount': 10,
          },
        ]),
      }),
    ).toThrow('outside the statement period');
  });
});
