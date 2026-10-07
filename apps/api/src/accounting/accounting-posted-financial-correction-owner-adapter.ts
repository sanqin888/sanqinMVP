import type { Prisma } from '@prisma/client';

import type { AccountingDb } from './accounting-db';
import type { AccountingJournalCreateInput } from './accounting-journal-policy';
import type {
  AccountingPostedCorrectionPostedJournalAnchorV1,
  AccountingPostedCorrectionPreviewPlanV1,
  AccountingPostedCorrectionReasonCode,
  AccountingPostedCorrectionStrategy,
  AccountingPostedCorrectionTargetKind,
} from './accounting-posted-financial-correction.contract';

export type AccountingPostedCorrectionOwnerDbClient =
  | AccountingDb
  | Prisma.TransactionClient;

export type AccountingPostedCorrectionOwnerRevisionTargetV1 = {
  version: 1;
  targetKind: AccountingPostedCorrectionTargetKind;
  targetStableId: string;
  targetVersion: number;
  targetAuthoritySchema: string;
  targetAuthorityHash: string;
  targetJson: Prisma.InputJsonValue;
};

export type AccountingPostedCorrectionOwnerReadyTargetV1 =
  AccountingPostedCorrectionOwnerRevisionTargetV1 & {
    strategy: AccountingPostedCorrectionStrategy;
    baseAuthoritySchema: string;
    baseAuthorityHash: string;
    currency: string;
    originalJournals: AccountingPostedCorrectionPostedJournalAnchorV1[];
    targetJournals: AccountingJournalCreateInput[];
  };

export type AccountingPostedCorrectionOwnerTargetInputV1 = {
  targetStableId: string;
  targetVersion: number;
  reasonCode: AccountingPostedCorrectionReasonCode;
  targetJson: unknown;
};

export type AccountingPostedCorrectionOwnerActivationInputV1 = {
  correctionStableId: string;
  correctionRevisionStableId: string;
  correctionRevision: number;
  targetStableId: string;
  targetVersion: number;
  targetAuthoritySchema: string;
  targetAuthorityHash: string;
  targetJson: Prisma.JsonValue;
  plan: AccountingPostedCorrectionPreviewPlanV1;
};

export interface AccountingPostedFinancialCorrectionOwnerAdapter {
  readonly targetKind: AccountingPostedCorrectionTargetKind;

  normalizeRevisionTarget(
    input: AccountingPostedCorrectionOwnerTargetInputV1,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<AccountingPostedCorrectionOwnerRevisionTargetV1>;

  resolveReadyTarget(
    input: AccountingPostedCorrectionOwnerTargetInputV1,
    db: AccountingPostedCorrectionOwnerDbClient,
  ): Promise<AccountingPostedCorrectionOwnerReadyTargetV1>;

  /**
   * Persist only Accounting-owned corrected authority through the supplied transaction.
   * Implementations must not perform external I/O or side effects outside this transaction.
   */
  activateTargetInTx(
    input: AccountingPostedCorrectionOwnerActivationInputV1,
    tx: Prisma.TransactionClient,
  ): Promise<void>;
}
