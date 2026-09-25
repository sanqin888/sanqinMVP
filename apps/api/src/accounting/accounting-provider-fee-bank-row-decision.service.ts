import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { runSerializableAccountingWrite } from './accounting-atomic-write';
import { writeAccountingAuditLog } from './accounting-audit-writer';
import { AccountingArtifactDeliveryService } from './accounting-artifact-delivery.service';
import { parseAccountingBankCsv } from './accounting-bank-csv';
import {
  AccountingAccountType,
  AccountingArtifactKind,
  AccountingFinancialProvider,
  AccountingInboxClassification,
  AccountingInboxStatus,
  AccountingJournalSource,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import { AccountingJournalPolicyError } from './accounting-journal-policy';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingPeriodService } from './accounting-period.service';
import type {
  AccountingProviderFeeBankRowDecisionView,
  AccountingProviderFeeBankRowScopeView,
  AccountingProviderFeeBankWithdrawalPreview,
  ConfirmAccountingProviderFeeBankRowScopeInput,
} from './accounting-provider-fee-bank-row-decision.contract';
import {
  AccountingProviderFeeBankRowDecisionPolicyError,
  buildProviderFeeBankRowDecisionDrafts,
  providerFeeBankRowFingerprint,
} from './accounting-provider-fee-bank-row-decision.policy';
import {
  buildProviderFeeBankWithdrawalWritePlan,
  PROVIDER_FEE_BANK_WITHDRAWAL_SOURCE_FACT_TYPE,
} from './accounting-provider-fee-bank-withdrawal-journal-authority';
import { CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID } from './accounting-provider-fee-clearing.contract';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

type DecisionRecord = {
  decisionStableId: string;
  rowNumber: number;
  rowFingerprint: string;
  occurredOn: Date;
  amountCents: number;
  description: string | null;
  providerHint: string | null;
  decision: string;
  journalEntryStableId: string | null;
  confirmedByActorRef: string;
  confirmedAt: Date;
};

const normalizeRequired = (value: string, field: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new BadRequestException(`${field} is required`);
  return normalized;
};

const toView = (
  row: DecisionRecord,
): AccountingProviderFeeBankRowDecisionView => ({
  decisionStableId: row.decisionStableId,
  rowNumber: row.rowNumber,
  rowFingerprint: row.rowFingerprint,
  occurredOn: row.occurredOn.toISOString().slice(0, 10),
  amountCents: row.amountCents,
  description: row.description,
  providerHint:
    row.providerHint as AccountingProviderFeeBankRowDecisionView['providerHint'],
  decision:
    row.decision as AccountingProviderFeeBankRowDecisionView['decision'],
  journalEntryStableId: row.journalEntryStableId,
  confirmedByActorRef: row.confirmedByActorRef,
  confirmedAt: row.confirmedAt.toISOString(),
});

@Injectable()
export class AccountingProviderFeeBankRowDecisionService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly artifactDelivery: AccountingArtifactDeliveryService,
    private readonly journal: AccountingJournalService,
    private readonly period: AccountingPeriodService,
  ) {}

  async preview(input: {
    artifactStableId: string;
    storeStableId: string;
    bankAccountStableId: string;
  }): Promise<AccountingProviderFeeBankWithdrawalPreview> {
    const normalized = this.normalizeScope(input);
    const source = await this.loadSource(normalized);
    return source.preview;
  }

  async getScope(input: {
    artifactStableId: string;
    storeStableId: string;
    bankAccountStableId: string;
  }): Promise<AccountingProviderFeeBankRowScopeView> {
    const normalized = this.normalizeScope(input);
    const source = await this.loadSource(normalized);
    const rows =
      await this.prisma.accountingProviderFeeBankRowDecision.findMany({
        where: {
          artifactId: source.artifactId,
          storeStableId: normalized.storeStableId,
          bankAccountStableId: normalized.bankAccountStableId,
        },
        orderBy: [{ rowNumber: 'asc' }],
      });

    const currentByRow = new Map(
      source.preview.withdrawals.map((withdrawal) => [
        withdrawal.rowNumber,
        providerFeeBankRowFingerprint(withdrawal),
      ]),
    );
    const currentRows = rows.filter(
      (row) =>
        currentByRow.get(row.rowNumber) !== undefined &&
        currentByRow.get(row.rowNumber) === row.rowFingerprint,
    );
    const byRow = new Map(currentRows.map((row) => [row.rowNumber, row]));
    const confirmed =
      source.preview.withdrawals.length > 0 &&
      source.preview.withdrawals.every((withdrawal) => {
        const row = byRow.get(withdrawal.rowNumber);
        if (!row) return false;
        if (row.decision === 'CLEARED') {
          return Boolean(row.journalEntryStableId);
        }
        return (
          row.decision === 'EXCLUDED' || row.decision === 'READY_FOR_CLEARING'
        );
      });

    return this.scopeView({
      ...normalized,
      confirmed,
      decisions: currentRows.map((row) => toView(row as DecisionRecord)),
    });
  }

  async confirmScope(
    input: ConfirmAccountingProviderFeeBankRowScopeInput,
    actorRefRaw: string,
  ): Promise<AccountingProviderFeeBankRowScopeView> {
    const normalized = this.normalizeScope(input);
    const actorRef = normalizeRequired(actorRefRaw, 'actorRef');
    if (!Array.isArray(input.includedRowNumbers)) {
      throw new BadRequestException('includedRowNumbers must be an array');
    }
    const source = await this.loadSource(normalized);

    let drafts: ReturnType<typeof buildProviderFeeBankRowDecisionDrafts>;
    try {
      drafts = buildProviderFeeBankRowDecisionDrafts({
        ...normalized,
        withdrawals: source.preview.withdrawals,
        includedRowNumbers: input.includedRowNumbers,
      });
    } catch (error) {
      if (error instanceof AccountingProviderFeeBankRowDecisionPolicyError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }

    const confirmedAt = new Date();
    const decisions = await runSerializableAccountingWrite(
      this.prisma,
      async (tx) => {
        const result: AccountingProviderFeeBankRowDecisionView[] = [];
        for (const draft of drafts) {
          const before =
            await tx.accountingProviderFeeBankRowDecision.findUnique({
              where: { decisionStableId: draft.decisionStableId },
            });

          if (
            before &&
            (before.artifactId !== source.artifactId ||
              before.rowNumber !== draft.rowNumber ||
              before.storeStableId !== normalized.storeStableId ||
              before.bankAccountStableId !== normalized.bankAccountStableId)
          ) {
            throw new ConflictException(
              'Clover fee bank row decision stable ID is already bound to a different scope',
            );
          }

          if (before?.decision === 'CLEARED') {
            if (
              before.rowFingerprint !== draft.rowFingerprint ||
              draft.decision !== 'READY_FOR_CLEARING' ||
              !before.journalEntryStableId
            ) {
              throw new ConflictException(
                `Cleared Clover fee bank row ${draft.rowNumber} cannot be changed or excluded`,
              );
            }
            result.push(toView(before as DecisionRecord));
            continue;
          }

          const data = {
            artifactId: source.artifactId,
            rowNumber: draft.rowNumber,
            rowFingerprint: draft.rowFingerprint,
            storeStableId: normalized.storeStableId,
            bankAccountStableId: normalized.bankAccountStableId,
            occurredOn: new Date(`${draft.occurredOn}T00:00:00.000Z`),
            amountCents: draft.amountCents,
            description: draft.description,
            providerHint: draft.providerHint,
            decision: draft.decision,
            journalEntryStableId: null,
            confirmedByActorRef: actorRef,
            confirmedAt,
          } as const;

          const saved = before
            ? await tx.accountingProviderFeeBankRowDecision.update({
                where: { id: before.id },
                data,
              })
            : await tx.accountingProviderFeeBankRowDecision.create({
                data: {
                  decisionStableId: draft.decisionStableId,
                  ...data,
                },
              });
          const beforeView = before ? toView(before as DecisionRecord) : null;
          const afterView = toView(saved as DecisionRecord);
          await writeAccountingAuditLog(tx, {
            action: 'PROVIDER_FEE_BANK_ROW_DECISION_CONFIRM',
            entityType: 'ACCOUNTING_PROVIDER_FEE_BANK_ROW_DECISION',
            entityId: draft.decisionStableId,
            operatorActorRef: actorRef,
            beforeJson: beforeView
              ? (beforeView as unknown as Prisma.InputJsonValue)
              : null,
            afterJson: afterView as unknown as Prisma.InputJsonValue,
          });
          result.push(afterView);
        }
        return result;
      },
    );

    return this.scopeView({
      ...normalized,
      confirmed:
        source.preview.withdrawals.length > 0 &&
        decisions.length === source.preview.withdrawals.length,
      decisions,
    });
  }

  async clearDecision(decisionStableIdRaw: string, actorRefRaw: string) {
    const decisionStableId = normalizeRequired(
      decisionStableIdRaw,
      'decisionStableId',
    );
    const actorRef = normalizeRequired(actorRefRaw, 'actorRef');

    const persisted =
      await this.prisma.accountingProviderFeeBankRowDecision.findUnique({
        where: { decisionStableId },
        include: {
          artifact: { select: { artifactStableId: true } },
        },
      });
    if (!persisted) {
      throw new ConflictException(
        'Clover fee bank row decision does not exist',
      );
    }
    if (persisted.decision === 'CLEARED') {
      await this.assertExistingJournalAnchor(
        decisionStableId,
        persisted.journalEntryStableId,
      );
      return toView(persisted as DecisionRecord);
    }
    if (
      persisted.decision !== 'READY_FOR_CLEARING' ||
      persisted.providerHint !== AccountingFinancialProvider.CLOVER
    ) {
      throw new ConflictException(
        'Clover fee bank row decision is not ready for clearing',
      );
    }

    const scope = await this.getScope({
      artifactStableId: persisted.artifact.artifactStableId,
      storeStableId: persisted.storeStableId,
      bankAccountStableId: persisted.bankAccountStableId,
    });
    const current = scope.decisions.find(
      (decision) => decision.decisionStableId === decisionStableId,
    );
    if (
      !scope.confirmed ||
      !current ||
      current.decision !== 'READY_FOR_CLEARING'
    ) {
      throw new ConflictException(
        'Clover fee bank row decision is no longer current; reconfirm the withdrawal scope',
      );
    }

    const businessTimezone = await this.period.getBusinessTimezone();
    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const decision =
        await tx.accountingProviderFeeBankRowDecision.findUnique({
          where: { decisionStableId },
        });
      if (!decision) {
        throw new ConflictException(
          'Clover fee bank row decision disappeared before clearing',
        );
      }
      if (decision.decision === 'CLEARED') {
        if (!decision.journalEntryStableId) {
          throw new ConflictException(
            'Cleared Clover fee bank row is missing its Journal anchor',
          );
        }
        return toView(decision as DecisionRecord);
      }
      if (
        decision.decision !== 'READY_FOR_CLEARING' ||
        decision.providerHint !== AccountingFinancialProvider.CLOVER ||
        decision.journalEntryStableId !== null
      ) {
        throw new ConflictException(
          'Clover fee bank row decision changed before clearing',
        );
      }

      const accountRows = await tx.accountingAccount.findMany({
        where: {
          accountStableId: {
            in: [
              CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
              decision.bankAccountStableId,
            ],
          },
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
      const payableAccount = accountRows.find(
        (account) =>
          account.accountStableId === CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
      );
      if (!payableAccount) {
        throw new ConflictException('Clover fee payable account is missing');
      }
      const payableLines = await tx.accountingJournalLine.findMany({
        where: {
          accountId: payableAccount.id,
          entry: { deletedAt: null },
        },
        select: {
          debitCents: true,
          creditCents: true,
        },
      });
      const payableCreditBalanceCents = payableLines.reduce(
        (sum, line) => sum + line.creditCents - line.debitCents,
        0,
      );
      if (payableCreditBalanceCents < decision.amountCents) {
        throw new ConflictException(
          `Clover fee payable balance is insufficient for this withdrawal: available ${payableCreditBalanceCents} cents, requested ${decision.amountCents} cents`,
        );
      }

      let plan: ReturnType<typeof buildProviderFeeBankWithdrawalWritePlan>;
      try {
        plan = buildProviderFeeBankWithdrawalWritePlan({
          fact: {
            decisionStableId: decision.decisionStableId,
            provider: AccountingFinancialProvider.CLOVER,
            storeStableId: decision.storeStableId,
            withdrawalDate: decision.occurredOn.toISOString().slice(0, 10),
            bankAccountStableId: decision.bankAccountStableId,
            amountCents: decision.amountCents,
            currency: 'CAD',
          },
          businessTimezone,
          accountFacts: accountRows.map((account) => ({
            accountStableId: account.accountStableId,
            accountClass: account.accountClass,
            accountType: account.type,
            currency: account.currency,
            isActive: account.isActive,
          })),
        });
      } catch (error) {
        if (error instanceof AccountingJournalPolicyError) {
          throw new ConflictException(error.message);
        }
        throw error;
      }

      const journal =
        await this.journal.createProviderFeeBankWithdrawalJournalInTx(
          plan.journal,
          actorRef,
          plan.authority,
          tx,
        );
      const updated = await tx.accountingProviderFeeBankRowDecision.update({
        where: { id: decision.id },
        data: {
          decision: 'CLEARED',
          journalEntryStableId: journal.entryStableId,
        },
      });
      await writeAccountingAuditLog(tx, {
        action: 'PROVIDER_FEE_BANK_WITHDRAWAL_CLEAR',
        entityType: 'ACCOUNTING_PROVIDER_FEE_BANK_ROW_DECISION',
        entityId: decision.decisionStableId,
        operatorActorRef: actorRef,
        beforeJson: toView(
          decision as DecisionRecord,
        ) as unknown as Prisma.InputJsonValue,
        afterJson: toView(
          updated as DecisionRecord,
        ) as unknown as Prisma.InputJsonValue,
      });
      return toView(updated as DecisionRecord);
    });
  }

  private normalizeScope(input: {
    artifactStableId: string;
    storeStableId: string;
    bankAccountStableId: string;
  }) {
    return {
      artifactStableId: normalizeRequired(
        input.artifactStableId,
        'artifactStableId',
      ),
      storeStableId: normalizeRequired(input.storeStableId, 'storeStableId'),
      bankAccountStableId: normalizeRequired(
        input.bankAccountStableId,
        'bankAccountStableId',
      ),
    };
  }

  private async loadSource(input: {
    artifactStableId: string;
    storeStableId: string;
    bankAccountStableId: string;
  }) {
    const bankAccount = await this.prisma.accountingAccount.findUnique({
      where: { accountStableId: input.bankAccountStableId },
      select: {
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
        'Clover fee bank clearing requires an active CAD BANK Accounting account',
      );
    }

    const artifact = await this.prisma.accountingSourceArtifact.findUnique({
      where: { artifactStableId: input.artifactStableId },
      select: {
        id: true,
        kind: true,
        inboxItem: {
          select: {
            status: true,
            classification: true,
            duplicateOfArtifactId: true,
          },
        },
      },
    });
    if (
      !artifact ||
      artifact.kind !== AccountingArtifactKind.CSV ||
      !artifact.inboxItem ||
      artifact.inboxItem.status !== AccountingInboxStatus.CONFIRMED ||
      artifact.inboxItem.classification !==
        AccountingInboxClassification.OTHER_DOCUMENT ||
      artifact.inboxItem.duplicateOfArtifactId !== null
    ) {
      throw new ConflictException(
        'Clover fee bank clearing requires retained reviewed CSV evidence classified as OTHER_DOCUMENT',
      );
    }

    const resolved = await this.artifactDelivery.resolveArtifactContent(
      input.artifactStableId,
    );
    if (
      path.extname(resolved.filename).toLowerCase() !== '.csv' &&
      !resolved.mimeType.toLowerCase().startsWith('text/csv')
    ) {
      throw new BadRequestException(
        'Clover fee bank clearing requires CSV evidence',
      );
    }
    const stat = await fs.promises.stat(resolved.filePath);
    if (stat.size > MAX_FILE_BYTES) {
      throw new PayloadTooLargeException(
        'bank CSV is too large for Clover fee clearing',
      );
    }
    const text = await fs.promises.readFile(resolved.filePath, 'utf8');
    const parsed = parseAccountingBankCsv(text);
    if (!parsed.matched || parsed.truncated) {
      throw new UnprocessableEntityException(
        'bank CSV cannot be parsed safely for Clover fee clearing',
      );
    }
    const withdrawals = parsed.withdrawalRows.filter(
      (row) => row.providerHint === AccountingFinancialProvider.CLOVER,
    );

    return {
      artifactId: artifact.id,
      preview: {
        version: 1 as const,
        scope: 'PROVIDER_FEE_BANK_WITHDRAWAL_PREVIEW' as const,
        artifactStableId: input.artifactStableId,
        filename: resolved.filename,
        storeStableId: input.storeStableId,
        bankAccountStableId: input.bankAccountStableId,
        currency: 'CAD' as const,
        withdrawals,
        source: {
          withdrawalRowCount: parsed.withdrawalRows.length,
          cloverWithdrawalRowCount: withdrawals.length,
          ignoredWithdrawalRowCount:
            parsed.withdrawalRows.length - withdrawals.length,
          invalidRowCount: parsed.invalidRows.length,
        },
      },
    };
  }

  private scopeView(input: {
    artifactStableId: string;
    storeStableId: string;
    bankAccountStableId: string;
    confirmed: boolean;
    decisions: AccountingProviderFeeBankRowDecisionView[];
  }): AccountingProviderFeeBankRowScopeView {
    return {
      version: 1,
      scope: 'PROVIDER_FEE_BANK_ROW_DECISIONS',
      artifactStableId: input.artifactStableId,
      storeStableId: input.storeStableId,
      bankAccountStableId: input.bankAccountStableId,
      currency: 'CAD',
      confirmed: input.confirmed,
      decisions: input.decisions,
    };
  }

  private async assertExistingJournalAnchor(
    decisionStableId: string,
    journalEntryStableId: string | null,
  ): Promise<void> {
    if (!journalEntryStableId) {
      throw new ConflictException(
        'Cleared Clover fee bank row is missing its Journal anchor',
      );
    }
    const journal = await this.prisma.accountingJournalEntry.findUnique({
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
      journal.sourceFactType !== PROVIDER_FEE_BANK_WITHDRAWAL_SOURCE_FACT_TYPE ||
      journal.sourceFactStableId !== decisionStableId
    ) {
      throw new ConflictException(
        'Clover fee bank withdrawal Journal anchor is missing or inconsistent',
      );
    }
  }
}
