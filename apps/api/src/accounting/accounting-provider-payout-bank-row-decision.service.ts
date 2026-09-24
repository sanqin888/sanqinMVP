import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { runSerializableAccountingWrite } from './accounting-atomic-write';
import { writeAccountingAuditLog } from './accounting-audit-writer';
import {
  AccountingArtifactKind,
  AccountingInboxClassification,
  AccountingInboxStatus,
  type AccountingFinancialProvider,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import type {
  AccountingProviderPayoutBankRowDecisionView,
  AccountingProviderPayoutBankRowScopeView,
  ConfirmAccountingProviderPayoutBankRowScopeInput,
} from './accounting-provider-payout-bank-row-decision.contract';
import {
  AccountingProviderPayoutBankRowDecisionPolicyError,
  buildProviderPayoutBankRowDecisionDrafts,
  providerPayoutBankRowFingerprint,
} from './accounting-provider-payout-bank-row-decision.policy';
import { AccountingProviderPayoutBankMatchService } from './accounting-provider-payout-bank-match.service';

type DecisionRecord = {
  decisionStableId: string;
  rowNumber: number;
  rowFingerprint: string;
  occurredOn: Date;
  amountCents: number;
  description: string | null;
  providerHint: string | null;
  decision: string;
  matchedPayoutStableId: string | null;
  confirmedByActorRef: string;
  confirmedAt: Date;
};

const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);

const toView = (
  row: DecisionRecord,
): AccountingProviderPayoutBankRowDecisionView => ({
  decisionStableId: row.decisionStableId,
  rowNumber: row.rowNumber,
  rowFingerprint: row.rowFingerprint,
  occurredOn: dateOnly(row.occurredOn),
  amountCents: row.amountCents,
  description: row.description,
  providerHint: row.providerHint as AccountingFinancialProvider | null,
  decision:
    row.decision as AccountingProviderPayoutBankRowDecisionView['decision'],
  matchedPayoutStableId: row.matchedPayoutStableId,
  confirmedByActorRef: row.confirmedByActorRef,
  confirmedAt: row.confirmedAt.toISOString(),
});

const normalizeRequired = (value: string, field: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new BadRequestException(`${field} is required`);
  return normalized;
};

@Injectable()
export class AccountingProviderPayoutBankRowDecisionService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly bankMatch: AccountingProviderPayoutBankMatchService,
  ) {}

  async getScope(input: {
    artifactStableId: string;
    storeStableId: string;
    destinationBankAccountStableId: string;
  }): Promise<AccountingProviderPayoutBankRowScopeView> {
    const normalized = this.normalizeScope(input);
    const artifact = await this.requireReviewedBankArtifact(
      normalized.artifactStableId,
    );
    const preview = await this.bankMatch.preview(normalized);
    const rows =
      await this.prisma.accountingProviderPayoutBankRowDecision.findMany({
        where: {
          artifactId: artifact.id,
          storeStableId: normalized.storeStableId,
          destinationBankAccountStableId:
            normalized.destinationBankAccountStableId,
        },
        orderBy: [{ rowNumber: 'asc' }],
      });

    const currentByRow = new Map(
      preview.deposits.map((deposit) => [
        deposit.rowNumber,
        providerPayoutBankRowFingerprint(deposit),
      ]),
    );
    const currentRows = rows.filter(
      (row) =>
        currentByRow.get(row.rowNumber) !== undefined &&
        currentByRow.get(row.rowNumber) === row.rowFingerprint,
    );
    const rowByNumber = new Map(currentRows.map((row) => [row.rowNumber, row]));
    const confirmed = preview.deposits.every((deposit) => {
      const row = rowByNumber.get(deposit.rowNumber);
      return row ? this.isDecisionCurrent(row, deposit) : false;
    });

    return this.scopeView({
      ...normalized,
      confirmed,
      decisions: currentRows.map((row) => toView(row as DecisionRecord)),
    });
  }

  async requireCurrentPostingDecision(
    decisionStableIdRaw: string,
  ): Promise<AccountingProviderPayoutBankRowDecisionView> {
    const decisionStableId = normalizeRequired(
      decisionStableIdRaw,
      'decisionStableId',
    );
    const persisted =
      await this.prisma.accountingProviderPayoutBankRowDecision.findUnique({
        where: { decisionStableId },
        include: {
          artifact: {
            select: { artifactStableId: true },
          },
        },
      });
    if (!persisted) {
      throw new ConflictException('Bank row decision does not exist');
    }
    if (persisted.decision === 'MATCH_EXISTING_PAYOUT') {
      return toView(persisted as DecisionRecord);
    }
    if (persisted.decision !== 'READY_FOR_POSTING') {
      throw new ConflictException(
        'Bank row decision is not ready for provider payout posting',
      );
    }

    const scope = await this.getScope({
      artifactStableId: persisted.artifact.artifactStableId,
      storeStableId: persisted.storeStableId,
      destinationBankAccountStableId: persisted.destinationBankAccountStableId,
    });
    const current = scope.decisions.find(
      (decision) => decision.decisionStableId === decisionStableId,
    );
    if (
      !scope.confirmed ||
      !current ||
      current.decision !== 'READY_FOR_POSTING'
    ) {
      throw new ConflictException(
        'Bank row decision is no longer current and ready for posting; reconfirm the settlement scope',
      );
    }
    return current;
  }

  async confirmScope(
    input: ConfirmAccountingProviderPayoutBankRowScopeInput,
    actorRefRaw: string,
  ): Promise<AccountingProviderPayoutBankRowScopeView> {
    const normalized = this.normalizeScope(input);
    const actorRef = normalizeRequired(actorRefRaw, 'actorRef');
    if (!Array.isArray(input.includedRowNumbers)) {
      throw new BadRequestException('includedRowNumbers must be an array');
    }

    const artifact = await this.requireReviewedBankArtifact(
      normalized.artifactStableId,
    );
    const preview = await this.bankMatch.preview(normalized);

    let drafts: ReturnType<typeof buildProviderPayoutBankRowDecisionDrafts>;
    try {
      drafts = buildProviderPayoutBankRowDecisionDrafts({
        ...normalized,
        deposits: preview.deposits,
        includedRowNumbers: input.includedRowNumbers,
      });
    } catch (error) {
      if (error instanceof AccountingProviderPayoutBankRowDecisionPolicyError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }

    const confirmedAt = new Date();
    const decisions = await runSerializableAccountingWrite(
      this.prisma,
      async (tx) => {
        const result: AccountingProviderPayoutBankRowDecisionView[] = [];
        for (const draft of drafts) {
          const before =
            await tx.accountingProviderPayoutBankRowDecision.findUnique({
              where: { decisionStableId: draft.decisionStableId },
            });
          if (
            before &&
            (before.artifactId !== artifact.id ||
              before.rowNumber !== draft.rowNumber ||
              before.storeStableId !== normalized.storeStableId ||
              before.destinationBankAccountStableId !==
                normalized.destinationBankAccountStableId)
          ) {
            throw new ConflictException(
              'Bank row decision stable ID is already bound to a different scope',
            );
          }

          const data = {
            artifactId: artifact.id,
            rowNumber: draft.rowNumber,
            rowFingerprint: draft.rowFingerprint,
            storeStableId: normalized.storeStableId,
            destinationBankAccountStableId:
              normalized.destinationBankAccountStableId,
            occurredOn: new Date(`${draft.occurredOn}T00:00:00.000Z`),
            amountCents: draft.amountCents,
            description: draft.description,
            providerHint: draft.providerHint,
            decision: draft.decision,
            matchedPayoutStableId: draft.matchedPayoutStableId,
            confirmedByActorRef: actorRef,
            confirmedAt,
          } as const;

          const saved = before
            ? await tx.accountingProviderPayoutBankRowDecision.update({
                where: { id: before.id },
                data,
              })
            : await tx.accountingProviderPayoutBankRowDecision.create({
                data: {
                  decisionStableId: draft.decisionStableId,
                  ...data,
                },
              });

          const afterView = toView(saved as DecisionRecord);
          const beforeView = before ? toView(before as DecisionRecord) : null;
          await writeAccountingAuditLog(tx, {
            action: 'PROVIDER_PAYOUT_BANK_ROW_DECISION_CONFIRM',
            entityType: 'ACCOUNTING_PROVIDER_PAYOUT_BANK_ROW_DECISION',
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
      confirmed: decisions.length === preview.deposits.length,
      decisions,
    });
  }

  private isDecisionCurrent(
    row: {
      decision: string;
      matchedPayoutStableId: string | null;
    },
    deposit: {
      status: string;
      providerHint: AccountingFinancialProvider | null;
      candidates: Array<{ payoutStableId: string }>;
    },
  ): boolean {
    if (row.decision === 'EXCLUDED') return true;
    if (row.decision === 'READY_FOR_POSTING') {
      return deposit.status === 'UNMATCHED' && deposit.providerHint !== null;
    }
    if (row.decision === 'MATCH_EXISTING_PAYOUT') {
      return (
        deposit.status === 'EXACT_EXISTING_PAYOUT' &&
        deposit.candidates.length === 1 &&
        deposit.candidates[0]?.payoutStableId === row.matchedPayoutStableId
      );
    }
    return false;
  }

  private normalizeScope(input: {
    artifactStableId: string;
    storeStableId: string;
    destinationBankAccountStableId: string;
  }) {
    return {
      artifactStableId: normalizeRequired(
        input.artifactStableId,
        'artifactStableId',
      ),
      storeStableId: normalizeRequired(input.storeStableId, 'storeStableId'),
      destinationBankAccountStableId: normalizeRequired(
        input.destinationBankAccountStableId,
        'destinationBankAccountStableId',
      ),
    };
  }

  private async requireReviewedBankArtifact(artifactStableId: string) {
    const artifact = await this.prisma.accountingSourceArtifact.findUnique({
      where: { artifactStableId },
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
        'Bank row decisions require retained reviewed CSV evidence classified as OTHER_DOCUMENT',
      );
    }
    return artifact;
  }

  private scopeView(input: {
    artifactStableId: string;
    storeStableId: string;
    destinationBankAccountStableId: string;
    confirmed: boolean;
    decisions: AccountingProviderPayoutBankRowDecisionView[];
  }): AccountingProviderPayoutBankRowScopeView {
    return {
      version: 1,
      scope: 'PROVIDER_PAYOUT_BANK_ROW_DECISIONS',
      artifactStableId: input.artifactStableId,
      storeStableId: input.storeStableId,
      destinationBankAccountStableId: input.destinationBankAccountStableId,
      currency: 'CAD',
      confirmed: input.confirmed,
      decisions: input.decisions,
    };
  }
}
