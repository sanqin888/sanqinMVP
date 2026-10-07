import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
} from './accounting-contracts';
import {
  FANTUAN_ADJUSTMENT_DETAIL_EVIDENCE_KIND,
  FANTUAN_ADJUSTMENT_RAW_CODES,
} from './accounting-fantuan-adjustment-detail.contract';
import { resolveFantuanAdjustmentDetailLines } from './accounting-fantuan-adjustment-detail.policy';

type TestLine = {
  lineStableId: string;
  lineNo: number;
  rawCode: string | null;
  component: AccountingFinancialComponent;
  postingTreatment: AccountingFinancialPostingTreatment;
  amountCents: number;
};

const line = (
  lineStableId: string,
  lineNo: number,
  amountCents: number,
  component = AccountingFinancialComponent.ADJUSTMENT,
  postingTreatment = AccountingFinancialPostingTreatment.POSTABLE,
  rawCode: string | null = null,
): TestLine => ({
  lineStableId,
  lineNo,
  rawCode,
  component,
  postingTreatment,
  amountCents,
});

describe('Fantuan adjustment detail policy', () => {
  it('reuses a confirmed adjustment-detail document and promotes only its detail lines to posting', () => {
    const summary = line('summary-adjustment', 1, -500);
    const detail = line(
      'detail-deduction',
      1,
      -500,
      AccountingFinancialComponent.ADJUSTMENT,
      AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      FANTUAN_ADJUSTMENT_RAW_CODES.DEDUCTION,
    );

    const result = resolveFantuanAdjustmentDetailLines({
      statement: {
        documentStableId: 'fantuan_statement_1',
        provider: AccountingFinancialProvider.FANTUAN,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        evidenceKind: null,
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        isConfirmed: true,
        lines: [summary],
      },
      candidateDocuments: [
        {
          documentStableId: 'fantuan_adjustment_detail_1',
          provider: AccountingFinancialProvider.FANTUAN,
          documentType: AccountingFinancialDocumentType.OTHER,
          evidenceKind: FANTUAN_ADJUSTMENT_DETAIL_EVIDENCE_KIND,
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
          isConfirmed: true,
          lines: [detail],
        },
      ],
    });

    expect(result.blockReasons).toEqual([]);
    expect(result.selectedDetailDocumentStableId).toBe(
      'fantuan_adjustment_detail_1',
    );
    expect(result.lines).toEqual([
      expect.objectContaining({
        lineStableId: 'summary-adjustment',
        postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
      }),
      expect.objectContaining({
        lineStableId: 'detail-deduction',
        lineNo: 2,
        postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
      }),
    ]);
  });

  it('fails closed when the frozen detail no longer reconciles to the summary adjustment', () => {
    const result = resolveFantuanAdjustmentDetailLines({
      statement: {
        documentStableId: 'fantuan_statement_1',
        provider: AccountingFinancialProvider.FANTUAN,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        evidenceKind: null,
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        isConfirmed: true,
        lines: [line('summary-adjustment', 1, -500)],
      },
      candidateDocuments: [
        {
          documentStableId: 'fantuan_adjustment_detail_1',
          provider: AccountingFinancialProvider.FANTUAN,
          documentType: AccountingFinancialDocumentType.OTHER,
          evidenceKind: FANTUAN_ADJUSTMENT_DETAIL_EVIDENCE_KIND,
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
          isConfirmed: true,
          lines: [
            line(
              'detail-deduction',
              1,
              -400,
              AccountingFinancialComponent.ADJUSTMENT,
              AccountingFinancialPostingTreatment.CONTROL_TOTAL,
              FANTUAN_ADJUSTMENT_RAW_CODES.DEDUCTION,
            ),
          ],
        },
      ],
    });

    expect(result.blockReasons).toEqual([
      'FANTUAN_ADJUSTMENT_DETAIL_NET_MISMATCH',
    ]);
    expect(result.selectedDetailDocumentStableId).toBeNull();
  });

  it('leaves non-Fantuan statements unchanged', () => {
    const sales = line(
      'sales',
      1,
      1_000,
      AccountingFinancialComponent.SALES,
      AccountingFinancialPostingTreatment.POSTABLE,
    );
    const result = resolveFantuanAdjustmentDetailLines({
      statement: {
        documentStableId: 'uber_statement_1',
        provider: AccountingFinancialProvider.UBER_EATS,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        evidenceKind: null,
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        isConfirmed: true,
        lines: [sales],
      },
      candidateDocuments: [],
    });

    expect(result).toEqual({
      lines: [sales],
      blockReasons: [],
      selectedDetailDocumentStableId: null,
    });
  });
});
