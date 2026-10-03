import { Prisma } from '@prisma/client';

export const ACCOUNTING_EXTERNAL_SALE_QUERY_SELECT = {
  externalSaleStableId: true,
  storeStableId: true,
  classificationStableId: true,
  granularity: true,
  occurredOn: true,
  periodStartOn: true,
  periodEndOn: true,
  counterpartyName: true,
  reference: true,
  currency: true,
  journalEntryStableId: true,
  reversalStableId: true,
  reversalFactHash: true,
  reversalJournalEntryStableId: true,
  reversedAt: true,
  reversedByActorRef: true,
  note: true,
  createdByActorRef: true,
  createdAt: true,
  replacementForExternalSale: {
    select: { externalSaleStableId: true },
  },
  replacedByExternalSale: {
    select: { externalSaleStableId: true },
  },
  lines: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      lineStableId: true,
      description: true,
      productReference: true,
      quantity: true,
      unit: true,
      unitPriceCents: true,
      lineAmountCents: true,
      sortOrder: true,
      revenueAccount: {
        select: { accountStableId: true },
      },
    },
  },
  adjustments: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      adjustmentStableId: true,
      label: true,
      amountCents: true,
      sortOrder: true,
      revenueAccount: {
        select: { accountStableId: true },
      },
    },
  },
  taxes: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      taxStableId: true,
      taxCode: true,
      label: true,
      rateBasisPoints: true,
      amountCents: true,
      sortOrder: true,
      liabilityAccount: {
        select: { accountStableId: true },
      },
    },
  },
  settlementAllocations: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      settlement: {
        select: {
          settlementStableId: true,
          storeStableId: true,
          settlementOn: true,
          counterpartyName: true,
          reference: true,
          currency: true,
          note: true,
          journalEntryStableId: true,
          reversalStableId: true,
          reversalFactHash: true,
          reversalJournalEntryStableId: true,
          reversedAt: true,
          reversedByActorRef: true,
          replacementForSettlement: {
            select: { settlementStableId: true },
          },
          replacedBySettlement: {
            select: { settlementStableId: true },
          },
          allocations: {
            orderBy: { sortOrder: 'asc' as const },
            select: {
              amountCents: true,
              externalSale: {
                select: { externalSaleStableId: true },
              },
            },
          },
          components: {
            orderBy: { sortOrder: 'asc' as const },
            select: {
              amountCents: true,
              label: true,
              account: {
                select: {
                  accountStableId: true,
                  accountClass: true,
                  type: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.AccountingExternalSaleSelect;

export type AccountingExternalSaleQueryRow =
  Prisma.AccountingExternalSaleGetPayload<{
    select: typeof ACCOUNTING_EXTERNAL_SALE_QUERY_SELECT;
  }>;

export const ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_QUERY_SELECT = {
  settlementStableId: true,
  storeStableId: true,
  settlementOn: true,
  counterpartyName: true,
  reference: true,
  currency: true,
  note: true,
  journalEntryStableId: true,
  reversalStableId: true,
  reversalFactHash: true,
  reversalJournalEntryStableId: true,
  reversedAt: true,
  reversedByActorRef: true,
  replacementForSettlement: {
    select: { settlementStableId: true },
  },
  replacedBySettlement: {
    select: { settlementStableId: true },
  },
  allocations: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      amountCents: true,
      externalSale: {
        select: { externalSaleStableId: true },
      },
    },
  },
  components: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      amountCents: true,
      label: true,
      account: {
        select: {
          accountStableId: true,
          accountClass: true,
          type: true,
        },
      },
    },
  },
} satisfies Prisma.AccountingExternalSaleSettlementSelect;

export type AccountingExternalSaleSettlementQueryRow =
  Prisma.AccountingExternalSaleSettlementGetPayload<{
    select: typeof ACCOUNTING_EXTERNAL_SALE_SETTLEMENT_QUERY_SELECT;
  }>;
