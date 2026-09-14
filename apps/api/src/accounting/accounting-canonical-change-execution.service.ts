import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

import type { CanonicalChangeJournalWriteAuthorityV1 } from './accounting-canonical-change-write-authority';
import type { AccountingJournalCreateInput } from './accounting-journal-policy';
import {
  AccountingCanonicalChangePreviewService,
  type CanonicalChangeShadowEntry,
  type CanonicalChangeShadowPreviewInput,
  type CanonicalChangeShadowPreviewReport,
} from './accounting-canonical-change-preview.service';
import { AccountingService } from './accounting.service';

export const CANONICAL_CHANGE_SYSTEM_ACTOR =
  'system:accounting-canonical-change-posting';

export type CanonicalChangeExecutionInput =
  CanonicalChangeShadowPreviewInput & {
    expectedPlanHash: string;
  };

export type CanonicalChangeExecutionReport =
  CanonicalChangeShadowPreviewReport & {
    execution: {
      postedOrReplayed: number;
      readyNoopNotWritten: number;
      blockedNotWritten: number;
      unmatchedPaymentReversalsNotWritten: number;
    };
  };

type ReadyWrite = {
  journal: AccountingJournalCreateInput;
  authority: CanonicalChangeJournalWriteAuthorityV1;
};

@Injectable()
export class AccountingCanonicalChangeExecutionService {
  constructor(
    private readonly preview: AccountingCanonicalChangePreviewService,
    private readonly accounting: AccountingService,
  ) {}

  async executeRange(
    input: CanonicalChangeExecutionInput,
  ): Promise<CanonicalChangeExecutionReport> {
    const expectedPlanHash =
      typeof input.expectedPlanHash === 'string'
        ? input.expectedPlanHash.trim()
        : '';
    if (!/^[a-f0-9]{64}$/.test(expectedPlanHash)) {
      throw new BadRequestException(
        'expectedPlanHash must be a lowercase SHA-256 hex digest',
      );
    }

    const report = await this.preview.previewRange(input);
    if (report.planHash !== expectedPlanHash) {
      throw new ConflictException(
        'Canonical change plan changed after preview; rerun shadow preview and review the new planHash',
      );
    }
    if (report.amounts.readyDebitCents !== report.amounts.readyCreditCents) {
      throw new ConflictException(
        'Canonical change execution requires balanced READY Journal drafts',
      );
    }

    const readyWrites: ReadyWrite[] = [];
    let readyNoopNotWritten = 0;
    let blockedNotWritten = 0;
    for (const entry of report.entries) {
      if (entry.status === 'BLOCKED') {
        blockedNotWritten += 1;
        continue;
      }
      if (entry.classification === 'READY_NOOP') {
        if (entry.draftJournal !== null || entry.draftHash !== null) {
          throw new ConflictException(
            `READY_NOOP canonical change unexpectedly has a Journal draft: ${entry.changeFactStableId}`,
          );
        }
        readyNoopNotWritten += 1;
        continue;
      }
      if (
        entry.classification !== 'READY' ||
        entry.draftJournal === null ||
        entry.draftHash === null
      ) {
        throw new ConflictException(
          `READY canonical change is missing deterministic Journal evidence: ${entry.changeFactStableId}`,
        );
      }
      readyWrites.push({
        journal: entry.draftJournal,
        authority: this.buildWriteAuthority(entry),
      });
    }

    await this.accounting.assertNoLegacyOrderRevenueAccrual();
    for (const { journal, authority } of readyWrites) {
      await this.accounting.createCanonicalChangeJournalEntry(
        journal,
        CANONICAL_CHANGE_SYSTEM_ACTOR,
        authority,
      );
    }

    return {
      ...report,
      execution: {
        postedOrReplayed: readyWrites.length,
        readyNoopNotWritten,
        blockedNotWritten,
        unmatchedPaymentReversalsNotWritten:
          report.unmatchedPaymentReversals.length,
      },
    };
  }

  private buildWriteAuthority(
    entry: CanonicalChangeShadowEntry,
  ): CanonicalChangeJournalWriteAuthorityV1 {
    if (
      entry.ordersFactReference.factStableId !== entry.changeFactStableId ||
      entry.ordersFactReference.version !== 1
    ) {
      throw new ConflictException(
        `READY canonical change has inconsistent Orders fact identity: ${entry.changeFactStableId}`,
      );
    }
    const originalSaleFactStableId = entry.originalSale.factStableId?.trim();
    const originalSaleJournalEntryStableId =
      entry.originalSale.journalEntryStableId?.trim();
    if (!originalSaleFactStableId || !originalSaleJournalEntryStableId) {
      throw new ConflictException(
        `READY canonical change is missing its original SALE Journal anchor: ${entry.changeFactStableId}`,
      );
    }
    if (entry.cardSettlementEvidenceMode === 'UNRESOLVED') {
      throw new ConflictException(
        `READY canonical change has unresolved CARD settlement authority: ${entry.changeFactStableId}`,
      );
    }

    return {
      version: 1,
      changeFactType: entry.ordersFactReference.factType,
      changeFactStableId: entry.changeFactStableId,
      originalSaleFactStableId,
      originalSaleJournalEntryStableId,
      cardSettlementEvidenceMode: entry.cardSettlementEvidenceMode,
      matchedPaymentReversalFactStableIds:
        entry.matchedPaymentReversalFactStableIds,
      matchedLoyaltyFactStableIds: entry.matchedLoyaltyFactStableIds,
    };
  }
}
