import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { runSerializableAccountingWrite } from './accounting-atomic-write';
import {
  AccountingJournalSource,
  type AccountingFinancialProvider,
} from './accounting-contracts';
import { writeAccountingAuditLog } from './accounting-audit-writer';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingJournalPolicyError } from './accounting-journal-policy';
import { providerPendingAccountStableId } from './accounting-provider-accounts';
import type { CreateAccountingProviderPayoutInput } from './accounting-provider-payout.contracts';
import {
  buildProviderPayoutWritePlan,
  normalizeProviderPayoutFact,
  PROVIDER_PAYOUT_SOURCE_FACT_TYPE,
  type ProviderPayoutAccountFact,
  type ProviderPayoutFactV1,
} from './accounting-provider-payout-journal-authority';
import {
  accountingProviderPayoutDto,
  type AccountingProviderPayoutViewRecord,
} from './accounting-provider-payout.presenter';
import { AccountingPeriodService } from './accounting-period.service';

const PAYOUT_ATTEMPTS = 2;

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 'P2002';

const payoutDateForDb = (value: string): Date =>
  new Date(`${value}T00:00:00.000Z`);

const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);

@Injectable()
export class AccountingProviderPayoutService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly journal: AccountingJournalService,
    private readonly period: AccountingPeriodService,
  ) {}

  async listPayouts(input: {
    provider?: AccountingFinancialProvider;
    storeStableId?: string;
    limit?: number;
  }) {
    const limit = input.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestException('limit must be between 1 and 200');
    }

    const rows = await this.prisma.accountingProviderPayout.findMany({
      where: {
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.storeStableId
          ? { storeStableId: input.storeStableId.trim() }
          : {}),
      },
      orderBy: [{ payoutDate: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
    return rows.map((row) =>
      accountingProviderPayoutDto(row as AccountingProviderPayoutViewRecord),
    );
  }

  async recordPayout(
    input: CreateAccountingProviderPayoutInput,
    actorRef: string,
  ) {
    const fact = this.normalizeInput(input);
    let lastError: unknown;

    for (let attempt = 0; attempt < PAYOUT_ATTEMPTS; attempt += 1) {
      try {
        return await this.recordPayoutOnce(fact, actorRef);
      } catch (error) {
        lastError = error;
        if (!isUniqueConstraintError(error)) throw error;
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new ConflictException('Provider payout retry exhausted');
  }

  private async recordPayoutOnce(fact: ProviderPayoutFactV1, actorRef: string) {
    const businessTimezone = await this.period.getBusinessTimezone();

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const existing = await tx.accountingProviderPayout.findUnique({
        where: { payoutStableId: fact.payoutStableId },
      });
      if (existing) {
        this.assertEquivalentPayout(existing, fact);
        if (existing.journalEntryStableId) {
          await this.assertExistingJournalAnchor(
            fact.payoutStableId,
            existing.journalEntryStableId,
            tx,
          );
          return accountingProviderPayoutDto(
            existing as AccountingProviderPayoutViewRecord,
          );
        }
      }

      const payout =
        existing ??
        (await tx.accountingProviderPayout.create({
          data: {
            payoutStableId: fact.payoutStableId,
            provider: fact.provider,
            storeStableId: fact.storeStableId,
            payoutDate: payoutDateForDb(fact.payoutDate),
            destinationBankAccountStableId: fact.destinationBankAccountStableId,
            amountCents: fact.amountCents,
            currency: fact.currency,
            providerReference: fact.providerReference,
            createdByActorRef: actorRef,
          },
        }));

      const pendingAccountStableId = providerPendingAccountStableId(
        fact.provider,
      );
      const accountRows = await tx.accountingAccount.findMany({
        where: {
          accountStableId: {
            in: [pendingAccountStableId, fact.destinationBankAccountStableId],
          },
        },
        select: {
          accountStableId: true,
          accountClass: true,
          type: true,
          currency: true,
          isActive: true,
        },
      });
      const accountFacts: ProviderPayoutAccountFact[] = accountRows.map(
        (account) => ({
          accountStableId: account.accountStableId,
          accountClass: account.accountClass,
          accountType: account.type,
          currency: account.currency,
          isActive: account.isActive,
        }),
      );

      let plan: ReturnType<typeof buildProviderPayoutWritePlan>;
      try {
        plan = buildProviderPayoutWritePlan({
          fact,
          businessTimezone,
          accountFacts,
        });
      } catch (error) {
        if (error instanceof AccountingJournalPolicyError) {
          throw new ConflictException(error.message);
        }
        throw error;
      }

      const journal = await this.journal.createProviderPayoutJournalInTx(
        plan.journal,
        actorRef,
        plan.authority,
        tx,
      );

      const updated = await tx.accountingProviderPayout.update({
        where: { id: payout.id },
        data: { journalEntryStableId: journal.entryStableId },
      });
      const after = accountingProviderPayoutDto(
        updated as AccountingProviderPayoutViewRecord,
      );
      await writeAccountingAuditLog(tx, {
        action: 'PROVIDER_PAYOUT_POST',
        entityType: 'ACCOUNTING_PROVIDER_PAYOUT',
        entityId: fact.payoutStableId,
        operatorActorRef: actorRef,
        beforeJson: null,
        afterJson: after as unknown as Prisma.InputJsonValue,
      });
      return after;
    });
  }

  private normalizeInput(
    input: CreateAccountingProviderPayoutInput,
  ): ProviderPayoutFactV1 {
    try {
      return normalizeProviderPayoutFact({
        payoutStableId: input.payoutStableId,
        provider: input.provider,
        storeStableId: input.storeStableId,
        payoutDate: input.payoutDate,
        destinationBankAccountStableId: input.destinationBankAccountStableId,
        amountCents: input.amountCents,
        currency: input.currency ?? 'CAD',
        providerReference: input.providerReference ?? null,
      });
    } catch (error) {
      if (error instanceof AccountingJournalPolicyError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private assertEquivalentPayout(
    existing: {
      provider: string;
      storeStableId: string;
      payoutDate: Date;
      destinationBankAccountStableId: string;
      amountCents: number;
      currency: string;
      providerReference: string | null;
    },
    fact: ProviderPayoutFactV1,
  ): void {
    if (
      existing.provider !== fact.provider ||
      existing.storeStableId !== fact.storeStableId ||
      dateOnly(existing.payoutDate) !== fact.payoutDate ||
      existing.destinationBankAccountStableId !==
        fact.destinationBankAccountStableId ||
      existing.amountCents !== fact.amountCents ||
      existing.currency !== fact.currency ||
      existing.providerReference !== fact.providerReference
    ) {
      throw new ConflictException(
        'Provider payout stable ID already exists with different facts',
      );
    }
  }

  private async assertExistingJournalAnchor(
    payoutStableId: string,
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
      journal.source !== AccountingJournalSource.PAYMENT ||
      journal.sourceFactType !== PROVIDER_PAYOUT_SOURCE_FACT_TYPE ||
      journal.sourceFactStableId !== payoutStableId
    ) {
      throw new ConflictException(
        'Provider payout Journal anchor is missing or inconsistent',
      );
    }
  }
}
