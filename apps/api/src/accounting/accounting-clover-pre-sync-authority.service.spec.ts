import {
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialTaxRole,
} from './accounting-contracts';
import { CLOVER_CLOSEOUT_RAW_CODES } from './accounting-clover-closeout.contract';
import { AccountingCloverPreSyncAuthorityService } from './accounting-clover-pre-sync-authority.service';
import { CLOVER_STATEMENT_RAW_CODES } from './accounting-clover-statement.contract';

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const distribute = (total: number, index: number, count: number) => {
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return base + (index < remainder ? 1 : 0);
};

const baseLine = (params: {
  stableId: string;
  lineNo: number;
  rawCode: string | null;
  rawName: string;
  amountCents: number;
  rawPayload?: Record<string, unknown> | null;
}) => ({
  lineStableId: params.stableId,
  lineNo: params.lineNo,
  rawCode: params.rawCode,
  rawName: params.rawName,
  component: AccountingFinancialComponent.OTHER,
  postingTreatment: AccountingFinancialPostingTreatment.RECONCILIATION_ONLY,
  taxRole: AccountingFinancialTaxRole.NONE,
  amountCents: params.amountCents,
  rawPayload: params.rawPayload ?? null,
});

const closeoutRows = (params: {
  from: string;
  days: number;
  salesCents: number;
  salesCount: number;
  tipsCents: number;
  tipsCount: number;
}) =>
  Array.from({ length: params.days }, (_, index) => {
    const businessDate = addDays(params.from, index);
    const salesCents = distribute(params.salesCents, index, params.days);
    const salesCount = distribute(params.salesCount, index, params.days);
    const tipsCents = distribute(params.tipsCents, index, params.days);
    const tipsCount = distribute(params.tipsCount, index, params.days);
    const batchId = `batch_${businessDate}`;
    return {
      documentStableId: `acctfindoc_${batchId}`,
      documentType: AccountingFinancialDocumentType.BATCH_CONTROL,
      businessIdentityKey: `clover:batch:${batchId}`,
      revision: 1,
      providerMerchantRef: '29351880018',
      providerDocumentRef: batchId,
      periodStart: new Date(`${businessDate}T00:00:00.000Z`),
      periodEnd: new Date(`${businessDate}T00:00:00.000Z`),
      rawMetadata: { evidenceKind: 'CLOVER_CLOSEOUT' },
      lines: [
        baseLine({
          stableId: `${batchId}_sales`,
          lineNo: 1,
          rawCode: CLOVER_CLOSEOUT_RAW_CODES.SALES,
          rawName: 'Sales',
          amountCents: salesCents,
          rawPayload: { transactionCount: salesCount },
        }),
        baseLine({
          stableId: `${batchId}_refunds`,
          lineNo: 2,
          rawCode: CLOVER_CLOSEOUT_RAW_CODES.REFUNDS,
          rawName: 'Refunds',
          amountCents: 0,
          rawPayload: { transactionCount: 0 },
        }),
        baseLine({
          stableId: `${batchId}_net`,
          lineNo: 3,
          rawCode: CLOVER_CLOSEOUT_RAW_CODES.NET,
          rawName: 'Net',
          amountCents: salesCents,
          rawPayload: { transactionCount: salesCount },
        }),
        baseLine({
          stableId: `${batchId}_tax`,
          lineNo: 4,
          rawCode: CLOVER_CLOSEOUT_RAW_CODES.TAX,
          rawName: 'Tax',
          amountCents: 0,
          rawPayload: { transactionCount: salesCount },
        }),
        baseLine({
          stableId: `${batchId}_tips`,
          lineNo: 5,
          rawCode: CLOVER_CLOSEOUT_RAW_CODES.TIPS,
          rawName: 'Tips',
          amountCents: tipsCents,
          rawPayload: { transactionCount: tipsCount },
        }),
      ],
      reviewRevisions: [],
      artifact: { parseRuns: [] },
    };
  });

const julyAuthorityExtraction = () => {
  let lineNo = 0;
  const line = (
    page: number,
    text: string,
    left: number,
    top: number,
    width = 0.06,
  ) => ({
    lineId: `p${page}-l${++lineNo}`,
    page,
    text,
    confidence: null,
    geometry: { left, top, width, height: 0.012 },
  });
  return {
    version: 1 as const,
    inputKind: 'PDF' as const,
    engine: 'POPPLER' as const,
    layoutMode: 'GEOMETRY' as const,
    truncated: false,
    lines: [
      line(2, 'Card Processing and Fee Summary', 0.068, 0.125, 0.31),
      line(2, 'Items', 0.35, 0.182),
      line(2, 'Amount', 0.398, 0.182),
      line(2, 'Items', 0.458, 0.182),
      line(2, 'Amount', 0.503, 0.182),
      line(2, 'Total', 0.063, 0.305),
      line(2, '230', 0.363, 0.305, 0.019),
      line(2, '$3,501.32', 0.395, 0.305, 0.05),
      line(2, '0', 0.484, 0.305, 0.019),
      line(2, '$0.00', 0.522, 0.305, 0.04),
      line(3, 'Surcharge Collected', 0.795, 0.402, 0.119),
      line(3, 'Card Type', 0.063, 0.413),
      line(3, 'Total', 0.063, 0.538),
      line(3, '$55.51', 0.903, 0.538, 0.034),
    ],
  };
};

const juneStatement = {
  documentStableId: 'acctfindoc_june',
  documentType: AccountingFinancialDocumentType.STATEMENT,
  businessIdentityKey: 'clover:statement:29351880018:2026-06-01:2026-06-30',
  revision: 1,
  providerMerchantRef: '29351880018',
  providerDocumentRef: '29351880018:2026-06-01:2026-06-30',
  periodStart: new Date('2026-06-01T00:00:00.000Z'),
  periodEnd: new Date('2026-06-30T00:00:00.000Z'),
  rawMetadata: { evidenceKind: 'CLOVER_MONTHLY_PROCESSING_STATEMENT' },
  lines: [
    baseLine({
      stableId: 'june_base_principal',
      lineNo: 1,
      rawCode: null,
      rawName: 'Total Amount Submitted',
      amountCents: 1,
    }),
    baseLine({
      stableId: 'june_discount_fees',
      lineNo: 2,
      rawCode: CLOVER_STATEMENT_RAW_CODES.SERVICE_CHARGES,
      rawName: 'DISCOUNT FEES',
      amountCents: -5931,
    }),
  ],
  reviewRevisions: [
    {
      effectiveSnapshotParserName: 'accounting-provider-financial',
      effectiveSnapshotParseRun: {
        resultJson: {
          rawMetadata: {
            evidenceKind: 'CLOVER_MONTHLY_PROCESSING_STATEMENT',
          },
        },
      },
      effectiveLines: [
        {
          reviewedLineStableId: 'june_review_principal',
          lineNo: 1,
          rawCode: null,
          rawName: 'Total Amount Submitted',
          component: AccountingFinancialComponent.SALES,
          postingTreatment: AccountingFinancialPostingTreatment.CONTROL_TOTAL,
          taxRole: AccountingFinancialTaxRole.NONE,
          amountCents: 336210,
        },
        {
          reviewedLineStableId: 'june_review_discount_fees',
          lineNo: 2,
          rawCode: CLOVER_STATEMENT_RAW_CODES.SERVICE_CHARGES,
          rawName: 'DISCOUNT FEES',
          component: AccountingFinancialComponent.PROCESSING_FEE,
          postingTreatment: AccountingFinancialPostingTreatment.POSTABLE,
          taxRole: AccountingFinancialTaxRole.NONE,
          amountCents: -5931,
        },
      ],
      corrections: [],
    },
  ],
  artifact: { parseRuns: [] },
};

const julyStatement = {
  documentStableId: 'acctfindoc_july',
  documentType: AccountingFinancialDocumentType.STATEMENT,
  businessIdentityKey: 'clover:statement:29351880018:2026-07-01:2026-07-31',
  revision: 1,
  providerMerchantRef: '29351880018',
  providerDocumentRef: '29351880018:2026-07-01:2026-07-31',
  periodStart: new Date('2026-07-01T00:00:00.000Z'),
  periodEnd: new Date('2026-07-31T00:00:00.000Z'),
  rawMetadata: {
    evidenceKind: 'CLOVER_MONTHLY_PROCESSING_STATEMENT',
    statementLayout: 'MODERN_V1',
  },
  lines: [
    baseLine({
      stableId: 'july_principal',
      lineNo: 1,
      rawCode: CLOVER_STATEMENT_RAW_CODES.ACCOUNT_AMOUNT_SUBMITTED,
      rawName: 'Amount Submitted',
      amountCents: 350132,
    }),
    baseLine({
      stableId: 'july_discount_fees',
      lineNo: 2,
      rawCode: CLOVER_STATEMENT_RAW_CODES.SERVICE_CHARGES,
      rawName: 'DISCOUNT FEES',
      amountCents: -5847,
    }),
  ],
  reviewRevisions: [],
  artifact: {
    parseRuns: [
      {
        parserVersion: '8',
        createdAt: new Date('2026-09-25T20:53:58.454Z'),
        resultJson: { documentExtraction: julyAuthorityExtraction() },
      },
    ],
  },
};

describe('AccountingCloverPreSyncAuthorityService', () => {
  it('projects June and July from provider evidence while keeping Order CARD diagnostic-only', async () => {
    const findMany = jest.fn().mockResolvedValue([
      ...closeoutRows({
        from: '2026-05-29',
        days: 31,
        salesCents: 336210,
        salesCount: 180,
        tipsCents: 9896,
        tipsCount: 47,
      }),
      juneStatement,
      ...closeoutRows({
        from: '2026-06-30',
        days: 31,
        salesCents: 350132,
        salesCount: 230,
        tipsCents: 7207,
        tipsCount: 43,
      }),
      julyStatement,
    ]);
    const prisma = {
      accountingProviderFinancialDocument: { findMany },
    };
    const readFactsForRange = jest
      .fn()
      .mockResolvedValueOnce([
        {
          paymentMethod: 'CARD',
          paymentTotalCents: 300000,
          sourceEvidence: 'LEGACY_CURRENT_ORDER',
        },
        {
          paymentMethod: 'CASH',
          paymentTotalCents: 5000,
          sourceEvidence: 'LEGACY_CURRENT_ORDER',
        },
      ])
      .mockResolvedValueOnce([
        {
          paymentMethod: 'CARD',
          paymentTotalCents: 349000,
          sourceEvidence: 'LEGACY_CURRENT_ORDER',
        },
      ]);
    const service = new AccountingCloverPreSyncAuthorityService(
      prisma as never,
      { readFactsForRange } as never,
      {
        getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
      } as never,
    );

    const result = await service.shadow({
      storeStableId: '4750_Yonge_Street',
    });

    expect(result.mutationMode).toBe('READ_ONLY_SHADOW');
    expect(result.projections).toHaveLength(2);

    expect(result.projections[0]).toMatchObject({
      statementDocumentStableId: 'acctfindoc_june',
      statementPrincipalCents: 336210,
      coverage: {
        status: 'CLOSED',
        coveredCloseoutRange: {
          from: '2026-05-29',
          to: '2026-06-28',
          batchCount: 31,
        },
        closeout: {
          salesCount: 180,
          salesCents: 336210,
          refundCount: 0,
          refundCents: 0,
          tipsCents: 9896,
        },
        surcharge: { status: 'UNKNOWN', amountCents: null },
      },
      composition: {
        rule: 'SUBMITTED_INCLUDES_TIPS_AND_SURCHARGE',
        tipsAuthority: 'CLOVER_CLOSEOUT_PROVIDER_EVIDENCE',
        surchargeAuthority: 'UNKNOWN',
      },
      orderCardDiagnostic: {
        authority: 'NON_AUTHORITATIVE',
        count: 1,
        amountCents: 300000,
        deltaToStatementPrincipalCents: -36210,
      },
    });

    expect(result.projections[1]).toMatchObject({
      statementDocumentStableId: 'acctfindoc_july',
      statementPrincipalCents: 350132,
      coverage: {
        status: 'CLOSED',
        coveredCloseoutRange: {
          from: '2026-06-30',
          to: '2026-07-30',
          batchCount: 31,
        },
        closeout: {
          salesCount: 230,
          salesCents: 350132,
          refundCount: 0,
          refundCents: 0,
          tipsCents: 7207,
        },
        surcharge: {
          status: 'EXPLICIT_PROVIDER_EVIDENCE',
          amountCents: 5551,
        },
        controls: {
          principalDeltaCents: 0,
          transactionCountDelta: 0,
          refundCountDelta: 0,
          refundAmountDeltaCents: 0,
        },
      },
      composition: {
        rule: 'SUBMITTED_INCLUDES_TIPS_AND_SURCHARGE',
        tipsAuthority: 'CLOVER_CLOSEOUT_PROVIDER_EVIDENCE',
        surchargeAuthority: 'CLOVER_STATEMENT_EXPLICIT_PROVIDER_EVIDENCE',
      },
      orderCardDiagnostic: {
        authority: 'NON_AUTHORITATIVE',
        count: 1,
        amountCents: 349000,
        deltaToStatementPrincipalCents: -1132,
      },
    });
    expect(result.projections.every((projection) => projection.authority)).toBe(
      true,
    );

    const authorityPeriods = await service.readAuthorityPeriods({
      storeStableId: '4750_Yonge_Street',
    });
    expect(authorityPeriods).toHaveLength(2);
    expect(authorityPeriods[0]).toMatchObject({
      status: 'CLOSED',
      statement: { documentStableId: 'acctfindoc_june' },
    });
    expect(authorityPeriods[0]?.status).toBe('CLOSED');
    if (authorityPeriods[0]?.status === 'CLOSED') {
      expect(authorityPeriods[0].selectedCloseoutBatches[0]).toMatchObject({
        businessDate: '2026-05-29',
      });
    }
    expect(authorityPeriods[1]).toMatchObject({
      status: 'CLOSED',
      statement: { documentStableId: 'acctfindoc_july' },
    });

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(readFactsForRange).toHaveBeenCalledTimes(2);
  });
});
