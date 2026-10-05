import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  BRAND_STORE_CONFIG_READER,
  type BrandStoreConfigReaderPort,
} from '../store/public-api';
import { runSerializableAccountingWrite } from './accounting-atomic-write';
import { writeAccountingAuditLog } from './accounting-audit-writer';
import { AccountingJournalSource } from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  ACCOUNTING_OPENING_BALANCE_EQUITY_ACCOUNT_STABLE_ID,
  ACCOUNTING_OPENING_RECEIVABLE_AR_ACCOUNT_STABLE_ID,
  ACCOUNTING_OPENING_RECEIVABLE_SOURCE_FACT_TYPE,
  type AccountingOpeningReceivableFactV1,
  type AccountingOpeningReceivableViewV1,
  type CreateAccountingOpeningReceivableInputV1,
} from './accounting-opening-receivable.contract';
import {
  buildAccountingOpeningReceivableWritePlan,
  type AccountingOpeningReceivableAccountFactV1,
} from './accounting-opening-receivable-journal-authority';
import {
  hashAccountingOpeningReceivableFact,
  normalizeAccountingOpeningReceivable,
} from './accounting-opening-receivable.policy';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingJournalPolicyError } from './accounting-journal-policy';
import { AccountingPeriodService } from './accounting-period.service';

const OPENING_RECEIVABLE_ATTEMPTS = 2;

const OPENING_RECEIVABLE_VIEW_SELECT = {
  openingReceivableStableId: true,
  storeStableId: true,
  openingDate: true,
  counterpartyName: true,
  reference: true,
  amountCents: true,
  currency: true,
  idempotencyKey: true,
  factHash: true,
  journalEntryStableId: true,
  note: true,
  createdByActorRef: true,
  createdAt: true,
} satisfies Prisma.AccountingOpeningReceivableSelect;

type AccountingOpeningReceivableRow =
  Prisma.AccountingOpeningReceivableGetPayload<{
    select: typeof OPENING_RECEIVABLE_VIEW_SELECT;
  }>;

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 'P2002';

const dateForDb = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);

@Injectable()
export class AccountingOpeningReceivableService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly journal: AccountingJournalService,
    private readonly period: AccountingPeriodService,
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly storeConfig: BrandStoreConfigReaderPort,
  ) {}

  async list(limitRaw?: string): Promise<AccountingOpeningReceivableViewV1[]> {
    const limit = this.parseLimit(limitRaw);
    const rows = await this.prisma.accountingOpeningReceivable.findMany({
      orderBy: [{ openingDate: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: OPENING_RECEIVABLE_VIEW_SELECT,
    });
    return rows.map((row) => this.toView(row));
  }

  async get(
    openingReceivableStableIdRaw: string,
  ): Promise<AccountingOpeningReceivableViewV1> {
    const openingReceivableStableId = openingReceivableStableIdRaw?.trim();
    if (!openingReceivableStableId) {
      throw new BadRequestException('openingReceivableStableId is required');
    }
    const row = await this.prisma.accountingOpeningReceivable.findUnique({
      where: { openingReceivableStableId },
      select: OPENING_RECEIVABLE_VIEW_SELECT,
    });
    if (!row) throw new NotFoundException('Opening Receivable not found');
    return this.toView(row);
  }

  async create(
    input: CreateAccountingOpeningReceivableInputV1,
    actorRef: string,
  ): Promise<AccountingOpeningReceivableViewV1> {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException(
        'Opening Receivable request body is required',
      );
    }

    const [configuredStore, accountingStartDate] = await Promise.all([
      this.storeConfig.getConfiguredStoreSnapshot(),
      this.period.getAccountingStartDate(),
    ]);
    if (!accountingStartDate) {
      throw new ConflictException(
        'accountingStartDate must be configured before Opening Receivable posting',
      );
    }

    let fact: AccountingOpeningReceivableFactV1;
    try {
      fact = normalizeAccountingOpeningReceivable(input, accountingStartDate);
    } catch (error) {
      if (error instanceof AccountingJournalPolicyError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    if (fact.storeStableId !== configuredStore.storeStableId) {
      throw new BadRequestException(
        'Opening Receivable storeStableId must match the configured Accounting store',
      );
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < OPENING_RECEIVABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.createOnce(fact, actorRef);
      } catch (error) {
        lastError = error;
        if (!isUniqueConstraintError(error)) throw error;
      }
    }
    if (lastError instanceof Error) throw lastError;
    throw new ConflictException('Opening Receivable retry exhausted');
  }

  private async createOnce(
    fact: AccountingOpeningReceivableFactV1,
    actorRef: string,
  ): Promise<AccountingOpeningReceivableViewV1> {
    const businessTimezone = await this.period.getBusinessTimezone();
    const factHash = hashAccountingOpeningReceivableFact(fact);

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const existing = await tx.accountingOpeningReceivable.findUnique({
        where: {
          openingReceivableStableId: fact.openingReceivableStableId,
        },
        select: OPENING_RECEIVABLE_VIEW_SELECT,
      });
      if (existing) {
        if (
          existing.idempotencyKey !==
          `opening-receivable:${fact.openingReceivableStableId}:v1`
        ) {
          throw new ConflictException(
            'Opening Receivable source-fact idempotency key is inconsistent',
          );
        }
        if (existing.factHash !== factHash) {
          throw new ConflictException(
            'Opening Receivable stable ID is already bound to different facts',
          );
        }
        if (!existing.journalEntryStableId) {
          throw new ConflictException(
            'Opening Receivable exists without a canonical Journal anchor; review is required',
          );
        }
        await this.assertExistingJournalAnchor(
          existing.openingReceivableStableId,
          existing.journalEntryStableId,
          tx,
        );
        return this.toView(existing);
      }

      const requiredAccountStableIds = [
        ACCOUNTING_OPENING_RECEIVABLE_AR_ACCOUNT_STABLE_ID,
        ACCOUNTING_OPENING_BALANCE_EQUITY_ACCOUNT_STABLE_ID,
      ];
      const accountRows = await tx.accountingAccount.findMany({
        where: { accountStableId: { in: requiredAccountStableIds } },
        select: {
          accountStableId: true,
          accountClass: true,
          type: true,
          currency: true,
          isActive: true,
        },
      });
      const accountFacts: AccountingOpeningReceivableAccountFactV1[] =
        accountRows.map((account) => ({
          accountStableId: account.accountStableId,
          accountClass: account.accountClass,
          accountType: account.type,
          currency: account.currency,
          isActive: account.isActive,
        }));

      let plan: ReturnType<typeof buildAccountingOpeningReceivableWritePlan>;
      try {
        plan = buildAccountingOpeningReceivableWritePlan({
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

      const opening = await tx.accountingOpeningReceivable.create({
        data: {
          openingReceivableStableId: fact.openingReceivableStableId,
          idempotencyKey: `opening-receivable:${fact.openingReceivableStableId}:v1`,
          storeStableId: fact.storeStableId,
          openingDate: dateForDb(fact.openingDate),
          counterpartyName: fact.counterpartyName,
          reference: fact.reference,
          amountCents: fact.amountCents,
          currency: fact.currency,
          factHash,
          note: fact.note,
          createdByActorRef: actorRef,
        },
        select: OPENING_RECEIVABLE_VIEW_SELECT,
      });

      const journal =
        await this.journal.createOpeningReceivableJournalInTx(
          plan.journal,
          actorRef,
          plan.authority,
          tx,
        );

      const anchored = await tx.accountingOpeningReceivable.update({
        where: {
          openingReceivableStableId: opening.openingReceivableStableId,
        },
        data: { journalEntryStableId: journal.entryStableId },
        select: OPENING_RECEIVABLE_VIEW_SELECT,
      });
      const after = this.toView(anchored);

      await writeAccountingAuditLog(tx, {
        action: 'OPENING_RECEIVABLE_POST',
        entityType: 'ACCOUNTING_OPENING_RECEIVABLE',
        entityId: anchored.openingReceivableStableId,
        operatorActorRef: actorRef,
        afterJson: after as unknown as Prisma.InputJsonValue,
      });
      return after;
    });
  }

  private async assertExistingJournalAnchor(
    openingReceivableStableId: string,
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
      journal.source !== AccountingJournalSource.MANUAL ||
      journal.sourceFactType !==
        ACCOUNTING_OPENING_RECEIVABLE_SOURCE_FACT_TYPE ||
      journal.sourceFactStableId !== openingReceivableStableId
    ) {
      throw new ConflictException(
        'Opening Receivable canonical Journal anchor is inconsistent',
      );
    }
  }

  private toView(
    row: AccountingOpeningReceivableRow,
  ): AccountingOpeningReceivableViewV1 {
    if (
      row.currency !== 'CAD' ||
      !row.journalEntryStableId ||
      row.amountCents <= 0
    ) {
      throw new ConflictException(
        `Malformed Opening Receivable: ${row.openingReceivableStableId}`,
      );
    }
    return {
      version: 1,
      openingReceivableStableId: row.openingReceivableStableId,
      storeStableId: row.storeStableId,
      openingDate: dateOnly(row.openingDate),
      counterpartyName: row.counterpartyName,
      reference: row.reference,
      amountCents: row.amountCents,
      currency: 'CAD',
      factHash: row.factHash,
      journalEntryStableId: row.journalEntryStableId,
      note: row.note,
      createdByActorRef: row.createdByActorRef,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private parseLimit(raw?: string): number {
    if (raw == null || raw === '') return 100;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > 200) {
      throw new BadRequestException('limit must be an integer from 1 to 200');
    }
    return value;
  }
}
