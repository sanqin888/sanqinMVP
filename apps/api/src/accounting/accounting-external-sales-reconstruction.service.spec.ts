import { ConflictException } from '@nestjs/common';

import type { AccountingDb } from './accounting-db';
import { AccountingExternalSalesReconstructionService } from './accounting-external-sales-reconstruction.service';
import type { AccountingExternalSalesService } from './accounting-external-sales.service';
import type { AccountingPeriodService } from './accounting-period.service';
import type { AccountingTabularPreviewService } from './accounting-tabular-preview.service';

const statementRows = (month: '04' | '06'): string[][] => [
  ['', '', '', '', '', '', '', '结算日期：', '2026-08-07T00:00:00.000Z'],
  [],
  [],
  [],
  ['', '', 'Customer Statement'],
  ['', '', 'Asia FoodMart'],
  ['', '', '2150 McNicoll Ave'],
  ['', '', 'Date', 'Item', 'Price(CAD)', 'Quantity', 'Amout', 'Tax', 'Subtotal'],
  ['', '', `2026-${month}-01T00:00:00.000Z`, 'SanQin Rice Noodle', '4', '10', '40', '5.20', '45.20'],
  ['', '', `2026-${month}-02T00:00:00.000Z`, 'SanQin Rice Noodle', '4', '5', '20', '2.60', '22.60'],
  ['', '', 'Total', '', '', '15', '60', '7.80', '67.80'],
  ['', '', 'Paid Amount', '', '', '', '', '', '0'],
  ['', '', 'Balance Due', '', '', '', '', '', '67.80'],
];

function makeService(month: '04' | '06') {
  const artifact = {
    artifactStableId: 'acctart_statement',
    contentHash: 'a'.repeat(64),
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    originalFilename: `丰亚结算单26年${month === '04' ? '4' : '6'}月.xlsx`,
    storedUrl: '/api/v1/accounting/files/inbox/statement.xlsx',
    inboxItem: {
      status: 'CONFIRMED',
      classification: 'OTHER_DOCUMENT',
      selectedProvider: null,
      materializedEntityType: null,
      materializedEntityStableId: null,
    },
  };
  const prisma = {
    accountingSourceArtifact: {
      findUnique: jest.fn().mockResolvedValue(artifact),
    },
  } as unknown as AccountingDb;
  const period = {
    requireCanonicalFinancialPostingStartAt: jest
      .fn()
      .mockResolvedValue(new Date('2026-06-01T04:00:00.000Z')),
  } as unknown as AccountingPeriodService;
  const tabularPreview = {
    previewArtifact: jest.fn().mockResolvedValue({
      format: 'XLSX',
      filename: artifact.originalFilename,
      sheetNames: ['对账单'],
      activeSheetIndex: 0,
      activeSheetName: '对账单',
      sheetNamesTruncated: false,
      rows: statementRows(month),
      previewRowCount: 13,
      previewColumnCount: 9,
      truncatedRows: false,
      truncatedColumns: false,
      truncatedCells: false,
      limits: {
        maxFileBytes: 8 * 1024 * 1024,
        maxRows: 200,
        maxColumns: 40,
        maxCellCharacters: 500,
        maxSheets: 20,
      },
    }),
  } as unknown as AccountingTabularPreviewService;
  const externalSales = {
    createSaleFromEvidence: jest.fn().mockResolvedValue({
      externalSaleStableId: 'extsale_reconstructed',
      journalEntryStableId: 'journal_reconstructed',
    }),
  } as unknown as AccountingExternalSalesService;
  const storeConfig = {
    getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
      storeStableId: '4750_Yonge_Street',
      storeName: 'SanQ Roujiamo',
      timezone: 'America/Toronto',
    }),
  };
  return {
    service: new AccountingExternalSalesReconstructionService(
      prisma,
      period,
      tabularPreview,
      externalSales,
      storeConfig as never,
    ),
    externalSales,
  };
}

describe('AccountingExternalSalesReconstructionService', () => {
  it('blocks pre-start statements for Slice G instead of posting old revenue into the new fiscal year', async () => {
    const { service, externalSales } = makeService('04');

    const preview = await service.preview({
      artifactStableId: 'acctart_statement',
      classificationStableId: 'external_supermarket',
    });

    expect(preview).toMatchObject({
      status: 'BLOCKED',
      blockCode: 'PRE_START_OPENING_BALANCE_REQUIRED',
      accountingStartDate: '2026-06-01',
      source: {
        periodStartOn: '2026-04-01',
        periodEndOn: '2026-04-02',
        totalReceivableCents: 6780,
      },
    });
    expect(
      (externalSales as unknown as { createSaleFromEvidence: jest.Mock })
        .createSaleFromEvidence,
    ).not.toHaveBeenCalled();
  });

  it('executes the exact READY plan through C1 evidence-aware write authority', async () => {
    const { service, externalSales } = makeService('06');
    const preview = await service.preview({
      artifactStableId: 'acctart_statement',
      classificationStableId: 'external_supermarket',
    });

    expect(preview.status).toBe('READY');
    expect(preview.blockCode).toBeNull();

    const result = await service.execute(
      {
        artifactStableId: 'acctart_statement',
        classificationStableId: 'external_supermarket',
        expectedPlanHash: preview.planHash,
      },
      'user_accountant',
    );

    expect(result.execution).toEqual({
      externalSaleStableId: 'extsale_reconstructed',
      journalEntryStableId: 'journal_reconstructed',
    });
    expect(
      (externalSales as unknown as { createSaleFromEvidence: jest.Mock })
        .createSaleFromEvidence,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        granularity: 'PERIOD_SUMMARY',
        occurredOn: '2026-06-02',
        periodStartOn: '2026-06-01',
        periodEndOn: '2026-06-02',
        counterpartyName: 'Asia FoodMart',
      }),
      'user_accountant',
      {
        artifactStableId: 'acctart_statement',
        contentHash: 'a'.repeat(64),
      },
    );
  });

  it('refuses execution when the reviewed plan hash no longer matches', async () => {
    const { service } = makeService('06');

    await expect(
      service.execute(
        {
          artifactStableId: 'acctart_statement',
          classificationStableId: 'external_supermarket',
          expectedPlanHash: 'b'.repeat(64),
        },
        'user_accountant',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
