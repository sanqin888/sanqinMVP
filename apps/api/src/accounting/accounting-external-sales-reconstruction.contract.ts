import type { CreateAccountingExternalSaleInputV1 } from './accounting-external-sales.contract';

export const ACCOUNTING_EXTERNAL_SALE_RECONSTRUCTION_VERSION = 1;

export type AccountingExternalSaleReconstructionPreviewInputV1 = {
  artifactStableId: string;
  classificationStableId?: string | null;
};

export type AccountingExternalSaleReconstructionExecuteInputV1 =
  AccountingExternalSaleReconstructionPreviewInputV1 & {
    expectedPlanHash: string;
  };

export type AccountingExternalSaleReconstructionBlockCode =
  | 'PRE_START_OPENING_BALANCE_REQUIRED'
  | 'PAID_AMOUNT_REQUIRES_SETTLEMENT_EVIDENCE';

export type AccountingExternalSaleReconstructionPreviewV1 = {
  version: 1;
  planHash: string;
  status: 'READY' | 'BLOCKED';
  blockCode: AccountingExternalSaleReconstructionBlockCode | null;
  accountingStartDate: string;
  evidence: {
    artifactStableId: string;
    contentHash: string;
    originalFilename: string;
  };
  source: {
    statementType: 'CUSTOMER_STATEMENT';
    counterpartyName: string;
    periodStartOn: string;
    periodEndOn: string;
    sourceRowCount: number;
    sourceQuantity: string;
    lineSubtotalCents: number;
    taxTotalCents: number;
    totalReceivableCents: number;
    paidAmountCents: number;
    balanceDueCents: number;
  };
  proposedSale: CreateAccountingExternalSaleInputV1;
  warnings: string[];
};

export type AccountingExternalSaleReconstructionExecutionV1 =
  AccountingExternalSaleReconstructionPreviewV1 & {
    execution: {
      externalSaleStableId: string;
      journalEntryStableId: string;
    };
  };
