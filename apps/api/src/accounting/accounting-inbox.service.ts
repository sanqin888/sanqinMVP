import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AccountingFinancialProvider,
  AccountingInboxClassification,
  AccountingInboxStatus,
} from './accounting-contracts';
import { runSerializableAccountingWrite } from './accounting-atomic-write';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import {
  applyAccountingSenderPolicy,
  confirmAccountingProviderFinancialInboxItem,
  ensureAccountingProviderFinancialCoverage,
  recordAccountingInboxParseRun,
  recordAccountingProviderFinancialDocument,
  registerAccountingInboxArtifact,
  setAccountingInboxClassification,
  suggestAccountingInboxClassification,
} from './accounting-inbox-core.orchestrator';
import {
  AccountingInboxPolicyError,
  type AccountingInboxArtifactInput,
  type AccountingInboxClassificationSelectionInput,
  type AccountingParseRunInput,
  type AccountingProviderFinancialDocumentInput,
  type AccountingSenderPolicyInput,
} from './accounting-inbox-core.policy';
import {
  AccountingInboxWriterConflictError,
  AccountingInboxWriterNotFoundError,
  purgeDuplicateEmailArtifactsInTx,
} from './accounting-inbox-core.writer';
import {
  confirmOtherGmailInboxItemsInTx,
  confirmOtherInboxItemInTx,
} from './accounting-inbox-classification.writer';
import { discardInboxItemInTx } from './accounting-inbox-expense.writer';
import {
  linkExpenseEvidenceSourceInTx,
  unlinkExpenseEvidenceSourceInTx,
} from './accounting-expense-evidence.writer';
import {
  beginAccountingImageOriginalPurgeInTx,
  discardAccountingImageRetentionCandidateInTx,
  finalizeAccountingImageOriginalPurgeInTx,
  stageAccountingImageRetentionCandidateInTx,
  type AccountingImageRetentionCandidateInput,
} from './accounting-image-retention.writer';
import {
  getAccountingSenderPolicyDecision,
  listAccountingImageRetentionQueue,
  listAccountingManualUploadLibrary,
  listAccountingSenderPolicies,
  listAccountingUnifiedInboxItems,
  readAccountingArtifactContentContext,
  readAccountingGmailMessageInboxMembers,
  readAccountingImageRetentionContext,
  readAccountingInboxProviderReviewContext,
} from './accounting-inbox-query';
import { permanentlyDeleteManualUploadInTx } from './accounting-upload-library.writer';
import {
  accountingGmailGroupRequiresSeparateReview,
  accountingGmailMessageId,
  groupAccountingInboxByGmailMessage,
} from './accounting-inbox-gmail-grouping.policy';
import { updateAccountingProviderRecognitionRule } from './accounting-provider-recognition.orchestrator';
import {
  AccountingProviderRecognitionPolicyError,
  type AccountingProviderRecognitionRuleUpdate,
} from './accounting-provider-recognition.policy';
import { listAccountingProviderRecognitionRules } from './accounting-provider-recognition.query';

@Injectable()
export class AccountingInboxService {
  constructor(@Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb) {}

  async registerInboxArtifact(input: AccountingInboxArtifactInput) {
    return this.runInboxCore(() =>
      registerAccountingInboxArtifact(this.prisma, input),
    );
  }

  senderPolicyDecision(email: string) {
    return getAccountingSenderPolicyDecision(this.prisma, email);
  }

  listSenderPolicies() {
    return listAccountingSenderPolicies(this.prisma);
  }

  listProviderRecognitionRules() {
    return listAccountingProviderRecognitionRules(this.prisma);
  }

  async updateProviderRecognitionRule(
    ruleStableId: string,
    input: AccountingProviderRecognitionRuleUpdate,
    operatorUserStableId: string,
  ) {
    return this.runInboxCore(() =>
      updateAccountingProviderRecognitionRule(
        this.prisma,
        ruleStableId,
        input,
        operatorUserStableId,
      ),
    );
  }

  listUnifiedInboxItems(params: {
    status?: AccountingInboxStatus;
    classification?: AccountingInboxClassification;
    limit?: number;
    materializedEntityStableId?: string;
  }) {
    return listAccountingUnifiedInboxItems(this.prisma, {
      ...params,
      materializedEntityStableId:
        params.materializedEntityStableId?.trim() || undefined,
    });
  }

  listManualUploadLibrary(limit?: number) {
    return listAccountingManualUploadLibrary(this.prisma, limit);
  }

  async linkExpenseEvidenceSource(
    notificationInboxItemStableId: string,
    sourceArtifactStableId: string,
    operatorUserStableId: string,
  ) {
    return this.runInboxCore(() =>
      runSerializableAccountingWrite(this.prisma, (tx) =>
        linkExpenseEvidenceSourceInTx(
          tx,
          notificationInboxItemStableId,
          sourceArtifactStableId,
          operatorUserStableId,
        ),
      ),
    );
  }

  async unlinkExpenseEvidenceSource(
    notificationInboxItemStableId: string,
    operatorUserStableId: string,
  ) {
    return this.runInboxCore(() =>
      runSerializableAccountingWrite(this.prisma, (tx) =>
        unlinkExpenseEvidenceSourceInTx(
          tx,
          notificationInboxItemStableId,
          operatorUserStableId,
        ),
      ),
    );
  }

  async permanentlyDeleteManualUpload(inboxItemStableId: string) {
    return this.runInboxCore(() =>
      runSerializableAccountingWrite(this.prisma, (tx) =>
        permanentlyDeleteManualUploadInTx(tx, inboxItemStableId),
      ),
    );
  }

  async purgeDuplicateEmailArtifacts(contentHash: string) {
    return this.runInboxCore(() =>
      runSerializableAccountingWrite(this.prisma, (tx) =>
        purgeDuplicateEmailArtifactsInTx(tx, contentHash),
      ),
    );
  }

  listImageRetentionQueue(limit?: number) {
    return listAccountingImageRetentionQueue(this.prisma, limit);
  }

  readUnifiedInboxProviderReviewContext(inboxItemStableId: string) {
    return readAccountingInboxProviderReviewContext(
      this.prisma,
      inboxItemStableId,
    );
  }

  readImageRetentionContext(inboxItemStableId: string) {
    return readAccountingImageRetentionContext(this.prisma, inboxItemStableId);
  }

  readArtifactContentContext(artifactStableId: string) {
    return readAccountingArtifactContentContext(this.prisma, artifactStableId);
  }

  async stageImageRetentionCandidate(
    input: AccountingImageRetentionCandidateInput,
  ) {
    return this.runInboxCore(() =>
      runSerializableAccountingWrite(this.prisma, (tx) =>
        stageAccountingImageRetentionCandidateInTx(tx, input),
      ),
    );
  }

  async discardImageRetentionCandidate(
    inboxItemStableId: string,
    operatorUserStableId: string,
  ) {
    return this.runInboxCore(() =>
      runSerializableAccountingWrite(this.prisma, (tx) =>
        discardAccountingImageRetentionCandidateInTx(
          tx,
          inboxItemStableId,
          operatorUserStableId,
        ),
      ),
    );
  }

  async beginImageOriginalPurge(
    inboxItemStableId: string,
    operatorUserStableId: string,
    compressionPolicyVersion: number,
  ) {
    return this.runInboxCore(() =>
      runSerializableAccountingWrite(this.prisma, (tx) =>
        beginAccountingImageOriginalPurgeInTx(
          tx,
          inboxItemStableId,
          operatorUserStableId,
          compressionPolicyVersion,
        ),
      ),
    );
  }

  async finalizeImageOriginalPurge(
    inboxItemStableId: string,
    operatorUserStableId: string,
  ) {
    return this.runInboxCore(() =>
      runSerializableAccountingWrite(this.prisma, (tx) =>
        finalizeAccountingImageOriginalPurgeInTx(
          tx,
          inboxItemStableId,
          operatorUserStableId,
        ),
      ),
    );
  }

  async suggestUnifiedInboxClassification(
    artifactStableId: string,
    input: AccountingInboxClassificationSelectionInput,
  ) {
    return this.runInboxCore(() =>
      suggestAccountingInboxClassification(
        this.prisma,
        artifactStableId,
        input,
      ),
    );
  }

  async setUnifiedInboxClassification(
    inboxItemStableId: string,
    input: AccountingInboxClassificationSelectionInput,
    operatorUserStableId: string,
  ) {
    return this.runInboxCore(() =>
      setAccountingInboxClassification(
        this.prisma,
        inboxItemStableId,
        input,
        operatorUserStableId,
      ),
    );
  }

  async confirmUnifiedInboxOther(
    inboxItemStableId: string,
    operatorUserStableId: string,
  ) {
    return this.runInboxCore(() =>
      runSerializableAccountingWrite(this.prisma, async (tx) => {
        const anchor = await tx.accountingInboxItem.findUnique({
          where: { inboxItemStableId },
          select: {
            artifact: {
              select: {
                acquisitionMode: true,
                metadataJson: true,
              },
            },
          },
        });
        if (!anchor) {
          throw new AccountingInboxWriterNotFoundError(
            'accounting inbox item not found',
          );
        }
        const gmailMessageId =
          anchor.artifact.acquisitionMode === 'EMAIL'
            ? accountingGmailMessageId(anchor.artifact.metadataJson)
            : null;
        if (gmailMessageId) {
          const members = (
            await readAccountingGmailMessageInboxMembers(tx, gmailMessageId)
          ).filter((member) => member.status === 'PENDING_REVIEW');
          const group = groupAccountingInboxByGmailMessage(members)[0] ?? null;
          if (
            group &&
            group.members.length > 1 &&
            !accountingGmailGroupRequiresSeparateReview(group)
          ) {
            return confirmOtherGmailInboxItemsInTx(tx, {
              primaryInboxItemStableId: inboxItemStableId,
              inboxItemStableIds: group.members.map(
                (member) => member.inboxItemStableId,
              ),
              operatorUserStableId,
            });
          }
        }
        return confirmOtherInboxItemInTx(
          tx,
          inboxItemStableId,
          operatorUserStableId,
        );
      }),
    );
  }

  async discardUnifiedInboxItem(
    inboxItemStableId: string,
    operatorUserStableId: string,
  ) {
    return this.runInboxCore(() =>
      runSerializableAccountingWrite(this.prisma, async (tx) => {
        const anchor = await tx.accountingInboxItem.findUnique({
          where: { inboxItemStableId },
          select: {
            artifact: {
              select: {
                acquisitionMode: true,
                metadataJson: true,
              },
            },
          },
        });
        if (!anchor) {
          throw new AccountingInboxWriterNotFoundError(
            'accounting inbox item not found',
          );
        }
        const gmailMessageId =
          anchor.artifact.acquisitionMode === 'EMAIL'
            ? accountingGmailMessageId(anchor.artifact.metadataJson)
            : null;
        if (gmailMessageId) {
          const members = (
            await readAccountingGmailMessageInboxMembers(tx, gmailMessageId)
          ).filter(
            (member) =>
              member.status === 'PENDING_REVIEW' ||
              member.status === 'QUARANTINED',
          );
          const group = groupAccountingInboxByGmailMessage(members)[0] ?? null;
          if (
            group &&
            group.members.length > 1 &&
            !accountingGmailGroupRequiresSeparateReview(group)
          ) {
            const results = [];
            for (const member of group.members) {
              results.push(
                await discardInboxItemInTx(
                  tx,
                  member.inboxItemStableId,
                  operatorUserStableId,
                ),
              );
            }
            return {
              inboxItemStableId,
              discarded: true,
              replayed: results.every((result) => result.replayed),
              groupedInboxItemStableIds: group.members.map(
                (member) => member.inboxItemStableId,
              ),
            };
          }
        }
        return discardInboxItemInTx(
          tx,
          inboxItemStableId,
          operatorUserStableId,
        );
      }),
    );
  }

  async recordInboxParseRun(input: AccountingParseRunInput) {
    return this.runInboxCore(() =>
      recordAccountingInboxParseRun(this.prisma, input),
    );
  }

  async applySenderPolicy(
    input: AccountingSenderPolicyInput,
    operatorUserStableId: string,
  ) {
    return this.runInboxCore(() =>
      applyAccountingSenderPolicy(this.prisma, input, operatorUserStableId),
    );
  }

  async recordProviderFinancialDocument(
    input: AccountingProviderFinancialDocumentInput,
  ) {
    return this.runInboxCore(() =>
      recordAccountingProviderFinancialDocument(this.prisma, input),
    );
  }

  async confirmProviderFinancialInboxItem(
    inboxItemStableId: string,
    operatorUserStableId: string,
  ) {
    return this.runInboxCore(() =>
      confirmAccountingProviderFinancialInboxItem(
        this.prisma,
        inboxItemStableId,
        operatorUserStableId,
      ),
    );
  }

  async ensureProviderFinancialCoverage(
    provider: AccountingFinancialProvider,
    storeStableId: string,
    operatorUserStableId?: string,
  ) {
    return this.runInboxCore(() =>
      ensureAccountingProviderFinancialCoverage(
        this.prisma,
        provider,
        storeStableId,
        operatorUserStableId,
      ),
    );
  }

  private async runInboxCore<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (
        error instanceof AccountingInboxPolicyError ||
        error instanceof AccountingProviderRecognitionPolicyError
      ) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof AccountingInboxWriterNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof AccountingInboxWriterConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
