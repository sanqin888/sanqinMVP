import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { runSerializableAccountingWrite } from './accounting-atomic-write';
import { writeAccountingAuditLog } from './accounting-audit-writer';
import { AccountingJournalSource } from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
  ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_TYPE,
  type AccountingExternalSaleFactV1,
  type AccountingExternalSaleGranularity as AccountingExternalSaleGranularityValue,
  type CreateAccountingExternalSaleInputV1,
} from './accounting-external-sales.contract';
import {
  buildExternalSaleWritePlan,
  type ExternalSaleAccountFactV1,
} from './accounting-external-sales-journal-authority';
import {
  hashAccountingExternalSaleFact,
  normalizeAccountingExternalSale,
  summarizeAccountingExternalSale,
} from './accounting-external-sales.policy';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingJournalPolicyError } from './accounting-journal-policy';
import { AccountingPeriodService } from './accounting-period.service';

const EXTERNAL_SALE_ATTEMPTS = 2;

const EXTERNAL_SALE_VIEW_SELECT = {
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
  idempotencyKey: true,
  factHash: true,
  journalEntryStableId: true,
  reversalStableId: true,
  reversalJournalEntryStableId: true,
  reversedAt: true,
  note: true,
  createdByActorRef: true,
  createdAt: true,
  replacementForExternalSale: {
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
} satisfies Prisma.AccountingExternalSaleSelect;

type ExternalSaleViewRow = Prisma.AccountingExternalSaleGetPayload<{
  select: typeof EXTERNAL_SALE_VIEW_SELECT;
}>;

export type AccountingExternalSaleViewV1 = {
  version: 1;
  externalSaleStableId: string;
  storeStableId: string;
  classificationStableId: string;
  granularity: AccountingExternalSaleGranularityValue;
  occurredOn: string;
  periodStartOn: string | null;
  periodEndOn: string | null;
  counterpartyName: string;
  reference: string | null;
  currency: 'CAD';
  factHash: string;
  journalEntryStableId: string;
  replacementForExternalSaleStableId: string | null;
  reversalStableId: string | null;
  reversalJournalEntryStableId: string | null;
  reversedAt: string | null;
  note: string | null;
  createdByActorRef: string;
  createdAt: string;
  totals: {
    lineSubtotalCents: number;
    adjustmentTotalCents: number;
    taxTotalCents: number;
    totalReceivableCents: number;
  };
  lines: Array<{
    lineStableId: string;
    description: string;
    productReference: string | null;
    quantity: string;
    unit: string;
    unitPriceCents: number;
    lineAmountCents: number;
    revenueAccountStableId: string;
    sortOrder: number;
  }>;
  adjustments: Array<{
    adjustmentStableId: string;
    label: string;
    amountCents: number;
    revenueAccountStableId: string;
    sortOrder: number;
  }>;
  taxes: Array<{
    taxStableId: string;
    taxCode: string;
    label: string;
    rateBasisPoints: number | null;
    amountCents: number;
    liabilityAccountStableId: string;
    sortOrder: number;
  }>;
};

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 'P2002';

const dateForDb = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const dateOnly = (value: Date | null): string | null =>
  value?.toISOString().slice(0, 10) ?? null;

const requiredAccountStableIds = (
  fact: AccountingExternalSaleFactV1,
): string[] =>
  [
    ...new Set([
      ACCOUNTING_EXTERNAL_SALE_AR_ACCOUNT_STABLE_ID,
      ...fact.lines.map((line) => line.revenueAccountStableId),
      ...fact.adjustments.map(
        (adjustment) => adjustment.revenueAccountStableId,
      ),
      ...fact.taxes.map((tax) => tax.liabilityAccountStableId),
    ]),
  ].sort();

@Injectable()
export class AccountingExternalSalesService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly journal: AccountingJournalService,
    private readonly period: AccountingPeriodService,
  ) {}

  async createSale(
    input: CreateAccountingExternalSaleInputV1,
    actorRef: string,
  ): Promise<AccountingExternalSaleViewV1> {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('External Sale request body is required');
    }
    let fact: AccountingExternalSaleFactV1;
    try {
      fact = normalizeAccountingExternalSale(input);
    } catch (error) {
      if (error instanceof AccountingJournalPolicyError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    if (fact.replacementForExternalSaleStableId !== null) {
      throw new ConflictException(
        'External Sale replacement is not enabled until C3 reversal/correction authority',
      );
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < EXTERNAL_SALE_ATTEMPTS; attempt += 1) {
      try {
        return await this.createSaleOnce(fact, actorRef);
      } catch (error) {
        lastError = error;
        if (!isUniqueConstraintError(error)) throw error;
      }
    }
    if (lastError instanceof Error) throw lastError;
    throw new ConflictException('External Sale retry exhausted');
  }

  private async createSaleOnce(
    fact: AccountingExternalSaleFactV1,
    actorRef: string,
  ): Promise<AccountingExternalSaleViewV1> {
    const businessTimezone = await this.period.getBusinessTimezone();
    const factHash = hashAccountingExternalSaleFact(fact);

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const existing = await tx.accountingExternalSale.findUnique({
        where: { externalSaleStableId: fact.externalSaleStableId },
        select: EXTERNAL_SALE_VIEW_SELECT,
      });
      if (existing) {
        if (
          existing.idempotencyKey !==
          `external-sale:${fact.externalSaleStableId}:v1`
        ) {
          throw new ConflictException(
            'External Sale source-fact idempotency key is inconsistent',
          );
        }
        if (existing.factHash !== factHash) {
          throw new ConflictException(
            'External Sale stable ID is already bound to different facts',
          );
        }
        if (
          existing.reversedAt ||
          existing.reversalStableId ||
          existing.reversalJournalEntryStableId
        ) {
          throw new ConflictException(
            'External Sale has been reversed and cannot be replayed as an active sale',
          );
        }
        if (existing.journalEntryStableId) {
          await this.assertExistingJournalAnchor(
            existing.externalSaleStableId,
            existing.journalEntryStableId,
            tx,
          );
          return this.toView(existing);
        }
      }

      const accountRows = await tx.accountingAccount.findMany({
        where: {
          accountStableId: { in: requiredAccountStableIds(fact) },
        },
        select: {
          id: true,
          accountStableId: true,
          accountClass: true,
          type: true,
          currency: true,
          isActive: true,
        },
      });
      const accountFacts: ExternalSaleAccountFactV1[] = accountRows.map(
        (account) => ({
          accountStableId: account.accountStableId,
          accountClass: account.accountClass,
          accountType: account.type,
          currency: account.currency,
          isActive: account.isActive,
        }),
      );

      let plan: ReturnType<typeof buildExternalSaleWritePlan>;
      try {
        plan = buildExternalSaleWritePlan({
          fact,
          businessTimezone,
          accountFacts,
        });
      } catch (error) {
        if (error instanceof AccountingJournalPolicyError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }

      const accountDbIdByStableId = new Map(
        accountRows.map((account) => [account.accountStableId, account.id]),
      );
      const accountDbId = (accountStableId: string): string => {
        const id = accountDbIdByStableId.get(accountStableId);
        if (!id) {
          throw new ConflictException(
            `External Sale account disappeared before persistence: ${accountStableId}`,
          );
        }
        return id;
      };

      const sale =
        existing ??
        (await tx.accountingExternalSale.create({
          data: {
            externalSaleStableId: fact.externalSaleStableId,
            idempotencyKey: `external-sale:${fact.externalSaleStableId}:v1`,
            storeStableId: fact.storeStableId,
            classificationStableId: fact.classificationStableId,
            granularity: fact.granularity,
            occurredOn: dateForDb(fact.occurredOn),
            periodStartOn: fact.periodStartOn
              ? dateForDb(fact.periodStartOn)
              : null,
            periodEndOn: fact.periodEndOn ? dateForDb(fact.periodEndOn) : null,
            counterpartyName: fact.counterpartyName,
            reference: fact.reference,
            currency: fact.currency,
            factHash,
            note: fact.note,
            createdByActorRef: actorRef,
            lines: {
              create: fact.lines.map((line) => ({
                lineStableId: line.lineStableId,
                description: line.description,
                productReference: line.productReference,
                quantity: line.quantity,
                unit: line.unit,
                unitPriceCents: line.unitPriceCents,
                lineAmountCents: line.lineAmountCents,
                revenueAccount: {
                  connect: {
                    id: accountDbId(line.revenueAccountStableId),
                  },
                },
                sortOrder: line.sortOrder,
              })),
            },
            adjustments: {
              create: fact.adjustments.map((adjustment) => ({
                adjustmentStableId: adjustment.adjustmentStableId,
                label: adjustment.label,
                amountCents: adjustment.amountCents,
                revenueAccount: {
                  connect: {
                    id: accountDbId(adjustment.revenueAccountStableId),
                  },
                },
                sortOrder: adjustment.sortOrder,
              })),
            },
            taxes: {
              create: fact.taxes.map((tax) => ({
                taxStableId: tax.taxStableId,
                taxCode: tax.taxCode,
                label: tax.label,
                rateBasisPoints: tax.rateBasisPoints,
                amountCents: tax.amountCents,
                liabilityAccount: {
                  connect: {
                    id: accountDbId(tax.liabilityAccountStableId),
                  },
                },
                sortOrder: tax.sortOrder,
              })),
            },
          },
          select: EXTERNAL_SALE_VIEW_SELECT,
        }));

      const journal = await this.journal.createExternalSaleJournalInTx(
        plan.journal,
        actorRef,
        plan.authority,
        tx,
      );

      const anchored = await tx.accountingExternalSale.update({
        where: { externalSaleStableId: sale.externalSaleStableId },
        data: { journalEntryStableId: journal.entryStableId },
        select: EXTERNAL_SALE_VIEW_SELECT,
      });
      const after = this.toView(anchored);

      await writeAccountingAuditLog(tx, {
        action: 'EXTERNAL_SALE_POST',
        entityType: 'ACCOUNTING_EXTERNAL_SALE',
        entityId: anchored.externalSaleStableId,
        operatorActorRef: actorRef,
        beforeJson: null,
        afterJson: after as unknown as Prisma.InputJsonValue,
      });
      return after;
    });
  }

  private async assertExistingJournalAnchor(
    externalSaleStableId: string,
    journalEntryStableId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const journal = await tx.accountingJournalEntry.findUnique({
      where: { entryStableId: journalEntryStableId },
      select: {
        source: true,
        sourceFactType: true,
        sourceFactStableId: true,
        deletedAt: true,
      },
    });
    if (
      !journal ||
      journal.deletedAt ||
      journal.source !== AccountingJournalSource.EXTERNAL_SALE ||
      journal.sourceFactType !== ACCOUNTING_EXTERNAL_SALE_SOURCE_FACT_TYPE ||
      journal.sourceFactStableId !== externalSaleStableId
    ) {
      throw new ConflictException(
        'External Sale Journal anchor is missing or inconsistent',
      );
    }
  }

  private toView(row: ExternalSaleViewRow): AccountingExternalSaleViewV1 {
    if (row.currency !== 'CAD') {
      throw new ConflictException(
        'Persisted External Sale currency is not supported by v1',
      );
    }
    if (!row.journalEntryStableId) {
      throw new ConflictException(
        'External Sale is not anchored to a canonical Journal',
      );
    }

    const fact: AccountingExternalSaleFactV1 = {
      version: 1,
      externalSaleStableId: row.externalSaleStableId,
      storeStableId: row.storeStableId,
      classificationStableId: row.classificationStableId,
      granularity: row.granularity,
      occurredOn: dateOnly(row.occurredOn) ?? '',
      periodStartOn: dateOnly(row.periodStartOn),
      periodEndOn: dateOnly(row.periodEndOn),
      counterpartyName: row.counterpartyName,
      reference: row.reference,
      currency: 'CAD',
      replacementForExternalSaleStableId:
        row.replacementForExternalSale?.externalSaleStableId ?? null,
      lines: row.lines.map((line) => ({
        lineStableId: line.lineStableId,
        description: line.description,
        productReference: line.productReference,
        quantity: line.quantity.toString(),
        unit: line.unit,
        unitPriceCents: line.unitPriceCents,
        lineAmountCents: line.lineAmountCents,
        revenueAccountStableId: line.revenueAccount.accountStableId,
        sortOrder: line.sortOrder,
      })),
      adjustments: row.adjustments.map((adjustment) => ({
        adjustmentStableId: adjustment.adjustmentStableId,
        label: adjustment.label,
        amountCents: adjustment.amountCents,
        revenueAccountStableId: adjustment.revenueAccount.accountStableId,
        sortOrder: adjustment.sortOrder,
      })),
      taxes: row.taxes.map((tax) => ({
        taxStableId: tax.taxStableId,
        taxCode: tax.taxCode,
        label: tax.label,
        rateBasisPoints: tax.rateBasisPoints,
        amountCents: tax.amountCents,
        liabilityAccountStableId: tax.liabilityAccount.accountStableId,
        sortOrder: tax.sortOrder,
      })),
      note: row.note,
    };

    if (hashAccountingExternalSaleFact(fact) !== row.factHash) {
      throw new ConflictException(
        'Persisted External Sale facts do not match the frozen factHash',
      );
    }

    return {
      ...fact,
      factHash: row.factHash,
      journalEntryStableId: row.journalEntryStableId,
      reversalStableId: row.reversalStableId,
      reversalJournalEntryStableId: row.reversalJournalEntryStableId,
      reversedAt: row.reversedAt?.toISOString() ?? null,
      createdByActorRef: row.createdByActorRef,
      createdAt: row.createdAt.toISOString(),
      totals: summarizeAccountingExternalSale(fact),
    };
  }
}
