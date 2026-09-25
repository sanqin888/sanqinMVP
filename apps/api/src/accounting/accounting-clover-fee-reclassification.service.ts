import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingFinancialDocumentType,
  AccountingFinancialProvider,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import { hashAccountingJson } from './accounting-inbox-core.policy';
import { AccountingJournalService } from './accounting-journal.service';
import {
  CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
  CLOVER_FEE_RECLASSIFICATION_SOURCE_FACT_TYPE,
} from './accounting-provider-fee-clearing.contract';
import { ACCOUNTING_PROVIDER_PENDING_ACCOUNT_IDS } from './accounting-provider-accounts';
import {
  PROVIDER_FINANCIAL_SOURCE_FACT_TYPE,
  PROVIDER_SETTLEMENT_ACCOUNT_IDS,
} from './accounting-provider-settlement.policy';

export type CloverFeeReclassificationPreview = {
  documentStableId: string;
  revision: number;
  status: 'READY' | 'BLOCKED' | 'ALREADY_RECLASSIFIED' | 'NOOP';
  blockReasons: string[];
  originalJournalEntryStableId: string | null;
  existingCorrectionJournalEntryStableId: string | null;
  amountCents: number;
  planHash: string;
};

const CLOVER_PENDING_ACCOUNT_STABLE_ID =
  ACCOUNTING_PROVIDER_PENDING_ACCOUNT_IDS[AccountingFinancialProvider.CLOVER];

const LEGACY_CLOVER_FEE_DEBIT_ACCOUNT_STABLE_IDS = new Set<string>([
  PROVIDER_SETTLEMENT_ACCOUNT_IDS.paymentProcessingFeeExpense,
  PROVIDER_SETTLEMENT_ACCOUNT_IDS.generalOperatingExpense,
  PROVIDER_SETTLEMENT_ACCOUNT_IDS.hstRecoverable,
]);

@Injectable()
export class AccountingCloverFeeReclassificationService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly journal: AccountingJournalService,
  ) {}

  async preview(
    documentStableIdRaw: string,
  ): Promise<CloverFeeReclassificationPreview> {
    const documentStableId = documentStableIdRaw.trim();
    if (!documentStableId) {
      throw new BadRequestException('documentStableId is required');
    }

    const document =
      await this.prisma.accountingProviderFinancialDocument.findUnique({
        where: { documentStableId },
        select: {
          documentStableId: true,
          revision: true,
          provider: true,
          documentType: true,
          storeStableId: true,
          currency: true,
        },
      });
    if (!document) {
      throw new NotFoundException('provider financial document not found');
    }

    const base = {
      documentStableId: document.documentStableId,
      revision: document.revision,
    };
    const identityBlocks = [
      ...(document.provider !== AccountingFinancialProvider.CLOVER
        ? ['NOT_CLOVER_DOCUMENT']
        : []),
      ...(document.documentType !== AccountingFinancialDocumentType.STATEMENT
        ? ['NOT_CLOVER_STATEMENT']
        : []),
      ...(document.currency !== 'CAD' ? ['UNSUPPORTED_CURRENCY'] : []),
      ...(!document.storeStableId ? ['MISSING_STORE_STABLE_ID'] : []),
    ];
    if (identityBlocks.length > 0) {
      return this.previewResult({
        ...base,
        status: 'BLOCKED',
        blockReasons: identityBlocks,
        originalJournalEntryStableId: null,
        existingCorrectionJournalEntryStableId: null,
        amountCents: 0,
      });
    }

    const [originalJournals, existingCorrection, accounts] = await Promise.all([
      this.prisma.accountingJournalEntry.findMany({
        where: {
          source: AccountingJournalSource.PLATFORM_STATEMENT,
          sourceFactType: PROVIDER_FINANCIAL_SOURCE_FACT_TYPE,
          sourceFactStableId: document.documentStableId,
          sourceFactVersion: document.revision,
          deletedAt: null,
        },
        select: {
          entryStableId: true,
          occurredAt: true,
          currency: true,
          storeStableId: true,
          lines: {
            select: {
              debitCents: true,
              creditCents: true,
              account: {
                select: { accountStableId: true },
              },
            },
            orderBy: { lineNo: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.accountingJournalEntry.findFirst({
        where: {
          source: AccountingJournalSource.PLATFORM_STATEMENT,
          sourceFactType: CLOVER_FEE_RECLASSIFICATION_SOURCE_FACT_TYPE,
          sourceFactStableId: document.documentStableId,
          sourceFactVersion: document.revision,
          deletedAt: null,
        },
        select: { entryStableId: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.accountingAccount.findMany({
        where: {
          accountStableId: {
            in: [
              CLOVER_PENDING_ACCOUNT_STABLE_ID,
              CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
            ],
          },
        },
        select: {
          accountStableId: true,
          accountClass: true,
          type: true,
          currency: true,
          isActive: true,
        },
      }),
    ]);

    if (existingCorrection) {
      return this.previewResult({
        ...base,
        status: 'ALREADY_RECLASSIFIED',
        blockReasons: [],
        originalJournalEntryStableId:
          originalJournals.length === 1
            ? (originalJournals[0]?.entryStableId ?? null)
            : null,
        existingCorrectionJournalEntryStableId:
          existingCorrection.entryStableId,
        amountCents: 0,
      });
    }

    if (originalJournals.length !== 1) {
      return this.previewResult({
        ...base,
        status: 'BLOCKED',
        blockReasons: [
          originalJournals.length === 0
            ? 'ORIGINAL_PROVIDER_SETTLEMENT_JOURNAL_NOT_FOUND'
            : 'MULTIPLE_ACTIVE_PROVIDER_SETTLEMENT_JOURNALS',
        ],
        originalJournalEntryStableId: null,
        existingCorrectionJournalEntryStableId: null,
        amountCents: 0,
      });
    }

    const original = originalJournals[0];
    if (!original) {
      throw new ConflictException(
        'original provider settlement journal disappeared during preview',
      );
    }

    const debitCents = original.lines.reduce(
      (sum, line) => sum + line.debitCents,
      0,
    );
    const creditCents = original.lines.reduce(
      (sum, line) => sum + line.creditCents,
      0,
    );
    const pendingNetCents = original.lines
      .filter(
        (line) =>
          line.account.accountStableId === CLOVER_PENDING_ACCOUNT_STABLE_ID,
      )
      .reduce((sum, line) => sum + line.debitCents - line.creditCents, 0);
    const feePayableTouched = original.lines.some(
      (line) =>
        line.account.accountStableId === CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
    );
    const nonPendingCreditCents = original.lines
      .filter(
        (line) =>
          line.account.accountStableId !== CLOVER_PENDING_ACCOUNT_STABLE_ID,
      )
      .reduce((sum, line) => sum + line.creditCents, 0);
    const hasNonFeeDebit = original.lines.some(
      (line) =>
        line.debitCents > 0 &&
        !LEGACY_CLOVER_FEE_DEBIT_ACCOUNT_STABLE_IDS.has(
          line.account.accountStableId,
        ),
    );
    const amountCents = pendingNetCents < 0 ? -pendingNetCents : 0;

    const accountByStableId = new Map(
      accounts.map((account) => [account.accountStableId, account]),
    );
    const pending = accountByStableId.get(CLOVER_PENDING_ACCOUNT_STABLE_ID);
    const payable = accountByStableId.get(CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID);
    const blockReasons = [
      ...(debitCents !== creditCents ? ['ORIGINAL_JOURNAL_UNBALANCED'] : []),
      ...(amountCents <= 0 ? ['NO_LEGACY_PENDING_CREDIT_TO_RECLASSIFY'] : []),
      ...(nonPendingCreditCents !== 0
        ? ['ORIGINAL_JOURNAL_HAS_NON_PENDING_CREDITS']
        : []),
      ...(hasNonFeeDebit ? ['ORIGINAL_JOURNAL_HAS_NON_FEE_DEBITS'] : []),
      ...(feePayableTouched
        ? ['ORIGINAL_JOURNAL_ALREADY_USES_FEE_PAYABLE']
        : []),
      ...(!pending ? ['CLOVER_PENDING_ACCOUNT_NOT_PROVISIONED'] : []),
      ...(pending &&
      (pending.accountClass !== AccountingAccountClass.ASSET ||
        pending.type !== AccountingAccountType.PLATFORM_WALLET ||
        pending.currency !== 'CAD' ||
        !pending.isActive)
        ? ['CLOVER_PENDING_ACCOUNT_INVALID']
        : []),
      ...(!payable ? ['CLOVER_FEE_PAYABLE_ACCOUNT_NOT_PROVISIONED'] : []),
      ...(payable &&
      (payable.accountClass !== AccountingAccountClass.LIABILITY ||
        payable.type !== null ||
        payable.currency !== 'CAD' ||
        !payable.isActive)
        ? ['CLOVER_FEE_PAYABLE_ACCOUNT_INVALID']
        : []),
      ...(original.currency !== document.currency
        ? ['ORIGINAL_JOURNAL_CURRENCY_MISMATCH']
        : []),
      ...(original.storeStableId !== document.storeStableId
        ? ['ORIGINAL_JOURNAL_STORE_MISMATCH']
        : []),
    ];

    return this.previewResult({
      ...base,
      status:
        blockReasons.length > 0
          ? 'BLOCKED'
          : amountCents === 0
            ? 'NOOP'
            : 'READY',
      blockReasons,
      originalJournalEntryStableId: original.entryStableId,
      existingCorrectionJournalEntryStableId: null,
      amountCents,
    });
  }

  async execute(input: {
    documentStableId: string;
    expectedPlanHash: string;
    operatorActorRef: string;
  }) {
    const expectedPlanHash = input.expectedPlanHash.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expectedPlanHash)) {
      throw new BadRequestException(
        'expectedPlanHash must be a lowercase SHA-256 hex digest',
      );
    }
    const operatorActorRef = input.operatorActorRef.trim();
    if (!operatorActorRef) {
      throw new BadRequestException('operatorActorRef is required');
    }

    const preview = await this.preview(input.documentStableId);
    if (preview.planHash !== expectedPlanHash) {
      throw new ConflictException(
        'Clover fee reclassification plan changed after preview',
      );
    }
    if (preview.status === 'ALREADY_RECLASSIFIED') {
      return preview;
    }
    if (preview.status !== 'READY' || preview.amountCents <= 0) {
      throw new ConflictException(
        `Clover fee reclassification is not READY: ${preview.blockReasons.join(',')}`,
      );
    }

    const original = await this.prisma.accountingJournalEntry.findUnique({
      where: {
        entryStableId: preview.originalJournalEntryStableId ?? '',
      },
      select: {
        occurredAt: true,
        currency: true,
        storeStableId: true,
      },
    });
    if (!original) {
      throw new ConflictException(
        'original provider settlement journal changed after preview',
      );
    }

    const correction = await this.journal.createJournalEntry(
      {
        idempotencyKey: `clover-fee-pending-reclass:${preview.documentStableId}:r${preview.revision}:v1`,
        kind: AccountingJournalEntryKind.ADJUSTMENT,
        source: AccountingJournalSource.PLATFORM_STATEMENT,
        sourceFactType: CLOVER_FEE_RECLASSIFICATION_SOURCE_FACT_TYPE,
        sourceFactStableId: preview.documentStableId,
        sourceFactVersion: preview.revision,
        storeStableId: original.storeStableId,
        occurredAt: original.occurredAt.toISOString(),
        currency: original.currency,
        memo:
          `Reclass legacy Clover statement fees from Pending to fee payable ` +
          `${preview.documentStableId} r${preview.revision}`,
        lines: [
          {
            accountStableId: CLOVER_PENDING_ACCOUNT_STABLE_ID,
            debitCents: preview.amountCents,
            creditCents: 0,
            memo: 'Restore Clover sales Pending',
          },
          {
            accountStableId: CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
            debitCents: 0,
            creditCents: preview.amountCents,
            memo: 'Recognize Clover fee payable',
          },
        ],
      },
      operatorActorRef,
    );

    const fresh = await this.preview(input.documentStableId);
    if (fresh.status !== 'ALREADY_RECLASSIFIED') {
      throw new ConflictException(
        'Clover fee reclassification Journal did not become authoritative',
      );
    }
    return {
      ...fresh,
      existingCorrectionJournalEntryStableId: correction.entryStableId,
    };
  }

  private previewResult(
    input: Omit<CloverFeeReclassificationPreview, 'planHash'>,
  ): CloverFeeReclassificationPreview {
    return {
      ...input,
      planHash: hashAccountingJson({
        version: 1,
        role: 'CLOVER_FEE_PENDING_RECLASSIFICATION',
        documentStableId: input.documentStableId,
        revision: input.revision,
        status: input.status,
        blockReasons: input.blockReasons,
        originalJournalEntryStableId: input.originalJournalEntryStableId,
        existingCorrectionJournalEntryStableId:
          input.existingCorrectionJournalEntryStableId,
        amountCents: input.amountCents,
        pendingAccountStableId: CLOVER_PENDING_ACCOUNT_STABLE_ID,
        feePayableAccountStableId: CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
      }),
    };
  }
}
