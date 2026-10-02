import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';

import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  AccountingJournalPolicyError,
  type AccountingJournalCreateInput,
} from './accounting-journal-policy';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingPeriodService } from './accounting-period.service';
import {
  AccountingAccountTransferPurpose,
  ACCOUNT_TRANSFER_SOURCE_FACT_TYPE,
  ACCOUNT_TRANSFER_SOURCE_FACT_VERSION,
  buildAccountingAccountTransferJournal,
  normalizeAccountingAccountTransfer,
  type AccountingAccountTransferInput,
  type AccountingAccountTransferPurpose as AccountingAccountTransferPurposeValue,
  type NormalizedAccountingAccountTransfer,
} from './accounting-account-transfer.policy';

const ACCOUNT_TRANSFER_JOURNAL_SELECT = {
  entryStableId: true,
  sourceFactStableId: true,
  occurredAt: true,
  currency: true,
  memo: true,
  createdByActorRef: true,
  createdAt: true,
  lines: {
    orderBy: { lineNo: 'asc' as const },
    select: {
      debitCents: true,
      creditCents: true,
      memo: true,
      account: {
        select: {
          accountStableId: true,
          name: true,
          type: true,
          accountClass: true,
          currency: true,
        },
      },
    },
  },
} satisfies Prisma.AccountingJournalEntrySelect;

type AccountTransferJournalRow = Prisma.AccountingJournalEntryGetPayload<{
  select: typeof ACCOUNT_TRANSFER_JOURNAL_SELECT;
}>;

export type AccountingAccountTransferView = {
  transferStableId: string;
  journalEntryStableId: string;
  transferDate: string;
  purpose: AccountingAccountTransferPurposeValue;
  amountCents: number;
  currency: 'CAD';
  note: string | null;
  fromAccount: {
    accountStableId: string;
    name: string;
    type: 'BANK' | 'CASH';
  };
  toAccount: {
    accountStableId: string;
    name: string;
    type: 'BANK' | 'CASH';
  };
  createdByActorRef: string;
  createdAt: string;
};

@Injectable()
export class AccountingAccountTransferService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly period: AccountingPeriodService,
    private readonly journal: AccountingJournalService,
  ) {}

  async listTransfers(
    limit = 100,
    transferStableId?: string,
  ): Promise<AccountingAccountTransferView[]> {
    const take = Math.min(200, Math.max(1, Math.trunc(limit) || 100));
    const exactTransferStableId = transferStableId?.trim() || null;
    const timezone = await this.period.getBusinessTimezone();
    const rows = await this.prisma.accountingJournalEntry.findMany({
      where: {
        deletedAt: null,
        kind: AccountingJournalEntryKind.TRANSFER,
        source: AccountingJournalSource.MANUAL,
        sourceFactType: ACCOUNT_TRANSFER_SOURCE_FACT_TYPE,
        sourceFactVersion: ACCOUNT_TRANSFER_SOURCE_FACT_VERSION,
        ...(exactTransferStableId
          ? { sourceFactStableId: exactTransferStableId }
          : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take,
      select: ACCOUNT_TRANSFER_JOURNAL_SELECT,
    });
    return rows.map((row) => this.toView(row, timezone));
  }

  async createTransfer(
    input: AccountingAccountTransferInput,
    operatorActorRef: string,
  ): Promise<AccountingAccountTransferView> {
    let normalized: NormalizedAccountingAccountTransfer;
    try {
      normalized = normalizeAccountingAccountTransfer(input);
    } catch (cause) {
      if (cause instanceof AccountingJournalPolicyError) {
        throw new BadRequestException(cause.message);
      }
      throw cause;
    }

    const accounts = await this.prisma.accountingAccount.findMany({
      where: {
        accountStableId: {
          in: [normalized.fromAccountStableId, normalized.toAccountStableId],
        },
        isActive: true,
      },
      select: {
        accountStableId: true,
        type: true,
        accountClass: true,
        currency: true,
      },
    });
    const accountByStableId = new Map(
      accounts.map((account) => [account.accountStableId, account] as const),
    );
    for (const accountStableId of [
      normalized.fromAccountStableId,
      normalized.toAccountStableId,
    ]) {
      const account = accountByStableId.get(accountStableId);
      if (!account) {
        throw new BadRequestException(
          `Account is inactive or invalid: ${accountStableId}`,
        );
      }
      if (
        account.accountClass !== AccountingAccountClass.ASSET ||
        (account.type !== AccountingAccountType.BANK &&
          account.type !== AccountingAccountType.CASH) ||
        account.currency !== 'CAD'
      ) {
        throw new BadRequestException(
          `Account transfer requires active CAD BANK/CASH assets: ${accountStableId}`,
        );
      }
    }

    const timezone = await this.period.getBusinessTimezone();
    let journalInput: AccountingJournalCreateInput;
    try {
      journalInput = buildAccountingAccountTransferJournal(
        normalized,
        timezone,
      );
    } catch (cause) {
      if (cause instanceof AccountingJournalPolicyError) {
        throw new BadRequestException(cause.message);
      }
      throw cause;
    }

    const created = await this.journal.createJournalEntry(
      journalInput,
      operatorActorRef,
    );
    if (
      created.sourceFactStableId !== normalized.transferStableId ||
      created.sourceFactType !== ACCOUNT_TRANSFER_SOURCE_FACT_TYPE
    ) {
      throw new ConflictException(
        'Account transfer Journal replay returned unexpected source identity',
      );
    }
    return this.toView(created, timezone);
  }

  private toView(
    row: AccountTransferJournalRow,
    timezone: string,
  ): AccountingAccountTransferView {
    const debit = row.lines.find(
      (line) => line.debitCents > 0 && line.creditCents === 0,
    );
    const credit = row.lines.find(
      (line) => line.creditCents > 0 && line.debitCents === 0,
    );
    if (
      !row.sourceFactStableId ||
      row.currency !== 'CAD' ||
      row.lines.length !== 2 ||
      !debit ||
      !credit ||
      debit.debitCents !== credit.creditCents ||
      debit.account.accountClass !== AccountingAccountClass.ASSET ||
      credit.account.accountClass !== AccountingAccountClass.ASSET ||
      (debit.account.type !== AccountingAccountType.BANK &&
        debit.account.type !== AccountingAccountType.CASH) ||
      (credit.account.type !== AccountingAccountType.BANK &&
        credit.account.type !== AccountingAccountType.CASH)
    ) {
      throw new ConflictException(
        `Malformed Accounting account transfer Journal: ${row.entryStableId}`,
      );
    }

    const transferDate = DateTime.fromJSDate(row.occurredAt, {
      zone: timezone,
    }).toISODate();
    if (!transferDate) {
      throw new ConflictException(
        `Unable to resolve transfer date: ${row.entryStableId}`,
      );
    }

    const purpose = debit.memo?.startsWith('Account attribution correction')
      ? AccountingAccountTransferPurpose.ACCOUNT_ATTRIBUTION_CORRECTION
      : AccountingAccountTransferPurpose.ACTUAL_TRANSFER;

    return {
      transferStableId: row.sourceFactStableId,
      journalEntryStableId: row.entryStableId,
      transferDate,
      purpose,
      amountCents: debit.debitCents,
      currency: 'CAD',
      note: row.memo,
      fromAccount: {
        accountStableId: credit.account.accountStableId,
        name: credit.account.name,
        type: credit.account.type,
      },
      toAccount: {
        accountStableId: debit.account.accountStableId,
        name: debit.account.name,
        type: debit.account.type,
      },
      createdByActorRef: row.createdByActorRef,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
