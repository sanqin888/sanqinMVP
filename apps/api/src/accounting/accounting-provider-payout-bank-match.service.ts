import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AccountingAccountType,
  AccountingJournalEntryKind,
  AccountingJournalSource,
  type AccountingFinancialProvider,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import { AccountingArtifactDeliveryService } from './accounting-artifact-delivery.service';
import { parseAccountingBankCsv } from './accounting-bank-csv';
import type { AccountingProviderPayoutBankMatchPreview } from './accounting-provider-payout-bank-match.contract';
import {
  projectProviderPayoutBankMatches,
  type ExistingProviderPayoutForBankMatch,
} from './accounting-provider-payout-bank-match.policy';

const BANK_MATCH_MAX_FILE_BYTES = 10 * 1024 * 1024;
const MATCH_WINDOW_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AccountingProviderPayoutBankMatchService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly artifactDelivery: AccountingArtifactDeliveryService,
  ) {}

  async preview(input: {
    artifactStableId: string;
    storeStableId: string;
    destinationBankAccountStableId: string;
  }): Promise<AccountingProviderPayoutBankMatchPreview> {
    const artifactStableId = input.artifactStableId.trim();
    const storeStableId = input.storeStableId.trim();
    const destinationBankAccountStableId =
      input.destinationBankAccountStableId.trim();
    if (!artifactStableId) {
      throw new BadRequestException('artifactStableId is required');
    }
    if (!storeStableId) {
      throw new BadRequestException('storeStableId is required');
    }
    if (!destinationBankAccountStableId) {
      throw new BadRequestException(
        'destinationBankAccountStableId is required',
      );
    }

    const bankAccount = await this.prisma.accountingAccount.findUnique({
      where: { accountStableId: destinationBankAccountStableId },
      select: {
        accountStableId: true,
        type: true,
        currency: true,
        isActive: true,
      },
    });
    if (
      !bankAccount ||
      bankAccount.type !== AccountingAccountType.BANK ||
      bankAccount.currency !== 'CAD' ||
      !bankAccount.isActive
    ) {
      throw new ConflictException(
        'bank match preview requires an active CAD BANK Accounting account',
      );
    }

    const resolved =
      await this.artifactDelivery.resolveArtifactContent(artifactStableId);
    if (
      path.extname(resolved.filename).toLowerCase() !== '.csv' &&
      !resolved.mimeType.toLowerCase().startsWith('text/csv')
    ) {
      throw new BadRequestException('bank match preview requires CSV evidence');
    }
    const stat = await fs.promises.stat(resolved.filePath);
    if (stat.size > BANK_MATCH_MAX_FILE_BYTES) {
      throw new PayloadTooLargeException(
        'bank CSV is too large for payout match preview',
      );
    }
    const text = await fs.promises.readFile(resolved.filePath, 'utf8');
    const bankCsv = parseAccountingBankCsv(text);
    if (!bankCsv.matched) {
      throw new UnprocessableEntityException(
        'CSV does not have a supported strong bank transaction signature',
      );
    }
    if (bankCsv.truncated) {
      throw new UnprocessableEntityException(
        'bank CSV exceeds the bounded parser limits and cannot be matched safely',
      );
    }

    const existingPayouts = await this.readExistingPayouts({
      storeStableId,
      destinationBankAccountStableId,
      dates: bankCsv.depositRows.map((row) => row.occurredOn),
    });
    const deposits = projectProviderPayoutBankMatches({
      deposits: bankCsv.depositRows,
      existingPayouts,
    });
    const countStatus = (status: (typeof deposits)[number]['status']) =>
      deposits.filter((deposit) => deposit.status === status).length;

    return {
      version: 1,
      scope: 'PROVIDER_PAYOUT_BANK_MATCH_PREVIEW',
      artifactStableId,
      filename: resolved.filename,
      storeStableId,
      destinationBankAccountStableId,
      currency: 'CAD',
      deposits,
      source: {
        depositRowCount: bankCsv.depositRows.length,
        withdrawalRowCount: bankCsv.withdrawalRowCount,
        invalidRowCount: bankCsv.invalidRows.length,
        invalidRows: bankCsv.invalidRows,
      },
      counts: {
        exactExisting: countStatus('EXACT_EXISTING_PAYOUT'),
        ambiguousExisting: countStatus('AMBIGUOUS_EXISTING_PAYOUT'),
        possibleExisting: countStatus('POSSIBLE_EXISTING_PAYOUT'),
        unmatched: countStatus('UNMATCHED'),
      },
    };
  }

  private async readExistingPayouts(input: {
    storeStableId: string;
    destinationBankAccountStableId: string;
    dates: string[];
  }): Promise<ExistingProviderPayoutForBankMatch[]> {
    if (input.dates.length === 0) return [];
    const timestamps = input.dates.map((date) =>
      Date.parse(`${date}T00:00:00.000Z`),
    );
    if (timestamps.some((value) => !Number.isFinite(value))) {
      throw new UnprocessableEntityException(
        'bank CSV contains an invalid deposit date',
      );
    }
    const from = new Date(Math.min(...timestamps) - MATCH_WINDOW_DAYS * DAY_MS);
    const to = new Date(Math.max(...timestamps) + MATCH_WINDOW_DAYS * DAY_MS);

    const rows = await this.prisma.accountingProviderPayout.findMany({
      where: {
        storeStableId: input.storeStableId,
        destinationBankAccountStableId: input.destinationBankAccountStableId,
        currency: 'CAD',
        journalEntryStableId: { not: null },
        payoutDate: { gte: from, lte: to },
      },
      select: {
        payoutStableId: true,
        provider: true,
        payoutDate: true,
        amountCents: true,
        providerReference: true,
        journalEntryStableId: true,
      },
      orderBy: [{ payoutDate: 'asc' }, { payoutStableId: 'asc' }],
    });
    const journalStableIds = rows.flatMap((row) =>
      row.journalEntryStableId ? [row.journalEntryStableId] : [],
    );
    if (journalStableIds.length === 0) return [];

    const journals = await this.prisma.accountingJournalEntry.findMany({
      where: {
        entryStableId: { in: journalStableIds },
        deletedAt: null,
        kind: AccountingJournalEntryKind.TRANSFER,
        source: AccountingJournalSource.PAYMENT,
        sourceFactType: 'accounting.provider_payout.v1',
        sourceFactVersion: 1,
        storeStableId: input.storeStableId,
        currency: 'CAD',
      },
      select: {
        entryStableId: true,
        sourceFactStableId: true,
      },
    });
    const payoutByActiveJournal = new Map(
      journals.map((journal) => [
        journal.entryStableId,
        journal.sourceFactStableId,
      ]),
    );

    return rows
      .filter(
        (row) =>
          row.journalEntryStableId !== null &&
          payoutByActiveJournal.get(row.journalEntryStableId) ===
            row.payoutStableId,
      )
      .map((row) => ({
        payoutStableId: row.payoutStableId,
        provider: row.provider as AccountingFinancialProvider,
        payoutDate: row.payoutDate.toISOString().slice(0, 10),
        amountCents: row.amountCents,
        providerReference: row.providerReference,
        journalEntryStableId: row.journalEntryStableId,
      }));
  }
}
