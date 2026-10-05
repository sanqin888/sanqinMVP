import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { runSerializableAccountingWrite } from './accounting-atomic-write';
import { writeAccountingAuditLog } from './accounting-audit-writer';
import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  ACCOUNTING_OPENING_RECEIVABLE_AR_ACCOUNT_STABLE_ID,
  ACCOUNTING_OPENING_RECEIVABLE_SOURCE_FACT_TYPE,
  type AccountingOpeningReceivableFactV1,
} from './accounting-opening-receivable.contract';
import {
  ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_SOURCE_FACT_TYPE,
  type AccountingOpeningReceivableSettlementFactV1,
  type AccountingOpeningReceivableSettlementViewV1,
  type CreateAccountingOpeningReceivableSettlementInputV1,
} from './accounting-opening-receivable-settlement.contract';
import {
  buildAccountingOpeningReceivableSettlementWritePlan,
  calculateOpeningReceivableCanonicalAmountCents,
  calculateOpeningReceivableSettlementAppliedCents,
  type AccountingOpeningReceivableSettlementAccountFactV1,
  type AccountingOpeningReceivableSettlementReceivableSnapshotV1,
} from './accounting-opening-receivable-settlement-journal-authority';
import {
  hashAccountingOpeningReceivableSettlementFact,
  normalizeAccountingOpeningReceivableSettlement,
} from './accounting-opening-receivable-settlement.policy';
import { hashAccountingOpeningReceivableFact } from './accounting-opening-receivable.policy';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingJournalPolicyError } from './accounting-journal-policy';
import { AccountingPeriodService } from './accounting-period.service';

const SETTLEMENT_ATTEMPTS = 2;

const OPENING_TARGET_SELECT = {
  id: true,
  openingReceivableStableId: true,
  idempotencyKey: true,
  storeStableId: true,
  openingDate: true,
  counterpartyName: true,
  reference: true,
  amountCents: true,
  currency: true,
  factHash: true,
  journalEntryStableId: true,
  note: true,
} satisfies Prisma.AccountingOpeningReceivableSelect;

const SETTLEMENT_VIEW_SELECT = {
  settlementStableId: true,
  idempotencyKey: true,
  openingReceivable: {
    select: { openingReceivableStableId: true },
  },
  storeStableId: true,
  settlementOn: true,
  counterpartyName: true,
  amountCents: true,
  currency: true,
  collectionAccount: {
    select: { accountStableId: true },
  },
  reference: true,
  factHash: true,
  journalEntryStableId: true,
  note: true,
  createdByActorRef: true,
  createdAt: true,
} satisfies Prisma.AccountingOpeningReceivableSettlementSelect;

type OpeningTargetRow = Prisma.AccountingOpeningReceivableGetPayload<{
  select: typeof OPENING_TARGET_SELECT;
}>;

type SettlementViewRow =
  Prisma.AccountingOpeningReceivableSettlementGetPayload<{
    select: typeof SETTLEMENT_VIEW_SELECT;
  }>;

type CanonicalJournalRow = {
  entryStableId: string;
  kind: string;
  source: string;
  sourceFactType: string | null;
  sourceFactStableId: string | null;
  sourceFactVersion: number | null;
  storeStableId: string | null;
  currency: string;
  deletedAt: Date | null;
  lines: Array<{
    debitCents: number;
    creditCents: number;
    account: { accountStableId: string };
  }>;
};

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 'P2002';

const dateForDb = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);

const safeAdd = (left: number, right: number, field: string): number => {
  const total = left + right;
  if (!Number.isSafeInteger(total)) {
    throw new ConflictException(`${field} exceeds safe integer range`);
  }
  return total;
};

@Injectable()
export class AccountingOpeningReceivableSettlementService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly journal: AccountingJournalService,
    private readonly period: AccountingPeriodService,
  ) {}

  async create(
    input: CreateAccountingOpeningReceivableSettlementInputV1,
    actorRef: string,
  ): Promise<AccountingOpeningReceivableSettlementViewV1> {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException(
        'Opening Receivable settlement request body is required',
      );
    }
    const openingReceivableStableId = input.openingReceivableStableId?.trim();
    if (!openingReceivableStableId) {
      throw new BadRequestException('openingReceivableStableId is required');
    }

    const [businessTimezone, accountingStartDate] = await Promise.all([
      this.period.getBusinessTimezone(),
      this.period.getAccountingStartDate(),
    ]);
    if (!accountingStartDate) {
      throw new ConflictException(
        'accountingStartDate must be configured before Opening Receivable settlement',
      );
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < SETTLEMENT_ATTEMPTS; attempt += 1) {
      try {
        return await this.createOnce(
          { ...input, openingReceivableStableId },
          actorRef,
          businessTimezone,
          accountingStartDate,
        );
      } catch (error) {
        lastError = error;
        if (!isUniqueConstraintError(error)) throw error;
      }
    }
    if (lastError instanceof Error) throw lastError;
    throw new ConflictException('Opening Receivable settlement retry exhausted');
  }

  private async createOnce(
    input: CreateAccountingOpeningReceivableSettlementInputV1,
    actorRef: string,
    businessTimezone: string,
    accountingStartDate: string,
  ): Promise<AccountingOpeningReceivableSettlementViewV1> {
    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const opening = await tx.accountingOpeningReceivable.findUnique({
        where: {
          openingReceivableStableId: input.openingReceivableStableId,
        },
        select: OPENING_TARGET_SELECT,
      });
      if (!opening) {
        throw new NotFoundException('Opening Receivable not found');
      }

      let fact: AccountingOpeningReceivableSettlementFactV1;
      try {
        fact = normalizeAccountingOpeningReceivableSettlement(input, {
          storeStableId: opening.storeStableId,
          counterpartyName: opening.counterpartyName,
        });
      } catch (error) {
        if (error instanceof AccountingJournalPolicyError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }
      const factHash = hashAccountingOpeningReceivableSettlementFact(fact);

      const existing =
        await tx.accountingOpeningReceivableSettlement.findUnique({
          where: { settlementStableId: fact.settlementStableId },
          select: SETTLEMENT_VIEW_SELECT,
        });
      if (existing) {
        this.assertPersistedSettlementFact(existing, fact, factHash);
        if (!existing.journalEntryStableId) {
          throw new ConflictException(
            'Opening Receivable settlement exists without a canonical Journal anchor; review is required',
          );
        }
        await this.assertExistingSettlementJournal(existing, tx);
        return this.toView(existing);
      }

      const receivableSnapshot = await this.readReceivableSnapshot(
        opening,
        accountingStartDate,
        tx,
      );

      const requiredAccountStableIds = [
        ACCOUNTING_OPENING_RECEIVABLE_AR_ACCOUNT_STABLE_ID,
        fact.collectionAccountStableId,
      ];
      const accountRows = await tx.accountingAccount.findMany({
        where: { accountStableId: { in: requiredAccountStableIds } },
        select: {
          id: true,
          accountStableId: true,
          accountClass: true,
          type: true,
          currency: true,
          isActive: true,
        },
      });
      const accountFacts: AccountingOpeningReceivableSettlementAccountFactV1[] =
        accountRows.map((account) => ({
          accountStableId: account.accountStableId,
          accountClass: account.accountClass,
          accountType: account.type,
          currency: account.currency,
          isActive: account.isActive,
        }));

      let plan: ReturnType<
        typeof buildAccountingOpeningReceivableSettlementWritePlan
      >;
      try {
        plan = buildAccountingOpeningReceivableSettlementWritePlan({
          fact,
          businessTimezone,
          accountFacts,
          receivableSnapshot,
        });
      } catch (error) {
        if (error instanceof AccountingJournalPolicyError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }

      const collectionAccount = accountRows.find(
        (account) =>
          account.accountStableId === fact.collectionAccountStableId,
      );
      if (!collectionAccount) {
        throw new ConflictException(
          'Opening Receivable settlement collection account disappeared before persistence',
        );
      }

      const settlement =
        await tx.accountingOpeningReceivableSettlement.create({
          data: {
            settlementStableId: fact.settlementStableId,
            idempotencyKey: `opening-receivable-settlement:${fact.settlementStableId}:v1`,
            openingReceivable: { connect: { id: opening.id } },
            storeStableId: fact.storeStableId,
            settlementOn: dateForDb(fact.settlementOn),
            counterpartyName: fact.counterpartyName,
            amountCents: fact.amountCents,
            currency: fact.currency,
            collectionAccount: { connect: { id: collectionAccount.id } },
            reference: fact.reference,
            factHash,
            note: fact.note,
            createdByActorRef: actorRef,
          },
          select: SETTLEMENT_VIEW_SELECT,
        });

      const journal =
        await this.journal.createOpeningReceivableSettlementJournalInTx(
          plan.journal,
          actorRef,
          plan.authority,
          tx,
        );

      const anchored =
        await tx.accountingOpeningReceivableSettlement.update({
          where: { settlementStableId: settlement.settlementStableId },
          data: { journalEntryStableId: journal.entryStableId },
          select: SETTLEMENT_VIEW_SELECT,
        });
      const after = this.toView(anchored);

      await writeAccountingAuditLog(tx, {
        action: 'OPENING_RECEIVABLE_SETTLEMENT_POST',
        entityType: 'ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT',
        entityId: anchored.settlementStableId,
        operatorActorRef: actorRef,
        afterJson: after as unknown as Prisma.InputJsonValue,
      });
      return after;
    });
  }

  private async readReceivableSnapshot(
    opening: OpeningTargetRow,
    accountingStartDate: string,
    tx: Prisma.TransactionClient,
  ): Promise<AccountingOpeningReceivableSettlementReceivableSnapshotV1> {
    const openingDate = dateOnly(opening.openingDate);
    const openingFact: AccountingOpeningReceivableFactV1 = {
      version: 1,
      openingReceivableStableId: opening.openingReceivableStableId,
      storeStableId: opening.storeStableId,
      openingDate,
      counterpartyName: opening.counterpartyName,
      reference: opening.reference,
      amountCents: opening.amountCents,
      currency: 'CAD',
      note: opening.note,
    };
    if (
      opening.currency !== 'CAD' ||
      opening.idempotencyKey !==
        `opening-receivable:${opening.openingReceivableStableId}:v1` ||
      hashAccountingOpeningReceivableFact(openingFact) !== opening.factHash ||
      !opening.journalEntryStableId
    ) {
      throw new ConflictException(
        'Opening Receivable source fact is malformed or not canonically anchored',
      );
    }

    const openingJournal = await this.readJournal(
      opening.journalEntryStableId,
      tx,
    );
    const openingAmountCents = this.assertOpeningJournal(
      opening,
      openingJournal,
    );
    if (openingAmountCents !== opening.amountCents) {
      throw new ConflictException(
        'Opening Receivable persistence amount disagrees with its canonical Journal',
      );
    }

    const priorSettlements =
      await tx.accountingOpeningReceivableSettlement.findMany({
        where: { openingReceivableId: opening.id },
        orderBy: [{ settlementOn: 'asc' }, { createdAt: 'asc' }],
        select: SETTLEMENT_VIEW_SELECT,
      });
    const journalStableIds = priorSettlements.map((settlement) => {
      if (!settlement.journalEntryStableId) {
        throw new ConflictException(
          'Opening Receivable has an unanchored prior settlement',
        );
      }
      return settlement.journalEntryStableId;
    });
    const priorJournals =
      journalStableIds.length === 0
        ? []
        : await tx.accountingJournalEntry.findMany({
            where: { entryStableId: { in: journalStableIds } },
            select: {
              entryStableId: true,
              kind: true,
              source: true,
              sourceFactType: true,
              sourceFactStableId: true,
              sourceFactVersion: true,
              storeStableId: true,
              currency: true,
              deletedAt: true,
              lines: {
                orderBy: { lineNo: 'asc' },
                select: {
                  debitCents: true,
                  creditCents: true,
                  account: { select: { accountStableId: true } },
                },
              },
            },
          });
    const journalByStableId = new Map(
      priorJournals.map((journal) => [journal.entryStableId, journal] as const),
    );

    let settledBeforeCents = 0;
    for (const settlement of priorSettlements) {
      const fact = this.factFromRow(settlement);
      const factHash =
        hashAccountingOpeningReceivableSettlementFact(fact);
      this.assertPersistedSettlementFact(settlement, fact, factHash);
      const journal = settlement.journalEntryStableId
        ? journalByStableId.get(settlement.journalEntryStableId)
        : undefined;
      if (!journal) {
        throw new ConflictException(
          `Opening Receivable prior settlement Journal is missing: ${settlement.settlementStableId}`,
        );
      }
      const appliedCents = this.assertSettlementJournal(settlement, journal);
      if (appliedCents !== settlement.amountCents) {
        throw new ConflictException(
          `Opening Receivable prior settlement amount disagrees with its canonical Journal: ${settlement.settlementStableId}`,
        );
      }
      settledBeforeCents = safeAdd(
        settledBeforeCents,
        appliedCents,
        'settledBeforeCents',
      );
    }
    if (settledBeforeCents > openingAmountCents) {
      throw new ConflictException(
        'Opening Receivable settled amount exceeds canonical opening AR',
      );
    }

    return {
      openingReceivableStableId: opening.openingReceivableStableId,
      openingDate,
      accountingStartDate,
      storeStableId: opening.storeStableId,
      counterpartyName: opening.counterpartyName,
      currency: 'CAD',
      openingFactHash: opening.factHash,
      openingJournalEntryStableId: opening.journalEntryStableId,
      openingAmountCents,
      settledBeforeCents,
      outstandingBeforeCents: openingAmountCents - settledBeforeCents,
    };
  }

  private async assertExistingSettlementJournal(
    settlement: SettlementViewRow,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (!settlement.journalEntryStableId) {
      throw new ConflictException(
        'Opening Receivable settlement is missing its canonical Journal anchor',
      );
    }
    const journal = await this.readJournal(settlement.journalEntryStableId, tx);
    const appliedCents = this.assertSettlementJournal(settlement, journal);
    if (appliedCents !== settlement.amountCents) {
      throw new ConflictException(
        'Opening Receivable settlement amount disagrees with its canonical Journal',
      );
    }
  }

  private async readJournal(
    entryStableId: string,
    tx: Prisma.TransactionClient,
  ): Promise<CanonicalJournalRow> {
    const journal = await tx.accountingJournalEntry.findUnique({
      where: { entryStableId },
      select: {
        entryStableId: true,
        kind: true,
        source: true,
        sourceFactType: true,
        sourceFactStableId: true,
        sourceFactVersion: true,
        storeStableId: true,
        currency: true,
        deletedAt: true,
        lines: {
          orderBy: { lineNo: 'asc' },
          select: {
            debitCents: true,
            creditCents: true,
            account: { select: { accountStableId: true } },
          },
        },
      },
    });
    if (!journal) {
      throw new ConflictException(
        `Canonical Journal is missing: ${entryStableId}`,
      );
    }
    return journal;
  }

  private assertOpeningJournal(
    opening: OpeningTargetRow,
    journal: CanonicalJournalRow,
  ): number {
    if (
      journal.deletedAt ||
      journal.kind !== AccountingJournalEntryKind.OPENING_BALANCE ||
      journal.source !== AccountingJournalSource.MANUAL ||
      journal.sourceFactType !== ACCOUNTING_OPENING_RECEIVABLE_SOURCE_FACT_TYPE ||
      journal.sourceFactStableId !== opening.openingReceivableStableId ||
      journal.sourceFactVersion !== 1 ||
      journal.storeStableId !== opening.storeStableId ||
      journal.currency !== 'CAD'
    ) {
      throw new ConflictException(
        'Opening Receivable canonical Journal anchor is malformed',
      );
    }
    try {
      return calculateOpeningReceivableCanonicalAmountCents(
        journal.lines.map((line) => ({
          accountStableId: line.account.accountStableId,
          debitCents: line.debitCents,
          creditCents: line.creditCents,
        })),
      );
    } catch (error) {
      if (error instanceof AccountingJournalPolicyError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private assertSettlementJournal(
    settlement: SettlementViewRow,
    journal: CanonicalJournalRow,
  ): number {
    if (
      journal.deletedAt ||
      journal.kind !== AccountingJournalEntryKind.STANDARD ||
      journal.source !== AccountingJournalSource.MANUAL ||
      journal.sourceFactType !==
        ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT_SOURCE_FACT_TYPE ||
      journal.sourceFactStableId !== settlement.settlementStableId ||
      journal.sourceFactVersion !== 1 ||
      journal.storeStableId !== settlement.storeStableId ||
      journal.currency !== 'CAD'
    ) {
      throw new ConflictException(
        `Opening Receivable settlement canonical Journal is malformed: ${settlement.settlementStableId}`,
      );
    }
    try {
      return calculateOpeningReceivableSettlementAppliedCents(
        journal.lines.map((line) => ({
          accountStableId: line.account.accountStableId,
          debitCents: line.debitCents,
          creditCents: line.creditCents,
        })),
        settlement.collectionAccount.accountStableId,
      );
    } catch (error) {
      if (error instanceof AccountingJournalPolicyError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private factFromRow(
    row: SettlementViewRow,
  ): AccountingOpeningReceivableSettlementFactV1 {
    if (row.currency !== 'CAD') {
      throw new ConflictException(
        'Persisted Opening Receivable settlement currency is not supported by v1',
      );
    }
    return {
      version: 1,
      settlementStableId: row.settlementStableId,
      openingReceivableStableId:
        row.openingReceivable.openingReceivableStableId,
      storeStableId: row.storeStableId,
      settlementOn: dateOnly(row.settlementOn),
      counterpartyName: row.counterpartyName,
      amountCents: row.amountCents,
      currency: 'CAD',
      collectionAccountStableId: row.collectionAccount.accountStableId,
      reference: row.reference,
      note: row.note,
    };
  }

  private assertPersistedSettlementFact(
    row: SettlementViewRow,
    fact: AccountingOpeningReceivableSettlementFactV1,
    factHash: string,
  ): void {
    const persistedFact = this.factFromRow(row);
    if (
      row.idempotencyKey !==
        `opening-receivable-settlement:${row.settlementStableId}:v1` ||
      row.factHash !== factHash ||
      JSON.stringify(persistedFact) !== JSON.stringify(fact)
    ) {
      throw new ConflictException(
        'Opening Receivable settlement stable ID is already bound to different or malformed facts',
      );
    }
  }

  private toView(
    row: SettlementViewRow,
  ): AccountingOpeningReceivableSettlementViewV1 {
    const fact = this.factFromRow(row);
    if (
      !row.journalEntryStableId ||
      row.idempotencyKey !==
        `opening-receivable-settlement:${row.settlementStableId}:v1` ||
      hashAccountingOpeningReceivableSettlementFact(fact) !== row.factHash
    ) {
      throw new ConflictException(
        `Malformed Opening Receivable settlement: ${row.settlementStableId}`,
      );
    }
    return {
      ...fact,
      factHash: row.factHash,
      journalEntryStableId: row.journalEntryStableId,
      createdByActorRef: row.createdByActorRef,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
