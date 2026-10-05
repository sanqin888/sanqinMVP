import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';

import {
  BRAND_STORE_CONFIG_READER,
  type BrandStoreConfigReaderPort,
} from '../store/public-api';
import { ACCOUNTING_DB, type AccountingDb } from './accounting-db';
import type {
  AccountingExternalSaleReconstructionExecuteInputV1,
  AccountingExternalSaleReconstructionExecutionV1,
  AccountingExternalSaleReconstructionPreviewInputV1,
  AccountingExternalSaleReconstructionPreviewV1,
} from './accounting-external-sales-reconstruction.contract';
import {
  AccountingExternalSaleReconstructionPolicyError,
  accountingExternalSaleReconstructionPlanHash,
  buildAccountingExternalSaleReconstructionInput,
  parseAccountingExternalSaleCustomerStatement,
  type AccountingExternalSaleCustomerStatement,
} from './accounting-external-sales-reconstruction.policy';
import type { CreateAccountingExternalSaleInputV1 } from './accounting-external-sales.contract';
import { AccountingExternalSalesService } from './accounting-external-sales.service';
import { AccountingPeriodService } from './accounting-period.service';
import { AccountingTabularPreviewService } from './accounting-tabular-preview.service';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

@Injectable()
export class AccountingExternalSalesReconstructionService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly period: AccountingPeriodService,
    private readonly tabularPreview: AccountingTabularPreviewService,
    private readonly externalSales: AccountingExternalSalesService,
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly storeConfig: BrandStoreConfigReaderPort,
  ) {}

  async preview(
    input: AccountingExternalSaleReconstructionPreviewInputV1,
  ): Promise<AccountingExternalSaleReconstructionPreviewV1> {
    return this.buildPlan(input);
  }

  async execute(
    input: AccountingExternalSaleReconstructionExecuteInputV1,
    actorRef: string,
  ): Promise<AccountingExternalSaleReconstructionExecutionV1> {
    const expectedPlanHash = input.expectedPlanHash?.trim().toLowerCase() ?? '';
    if (!SHA256_PATTERN.test(expectedPlanHash)) {
      throw new BadRequestException(
        'expectedPlanHash must be a lowercase SHA-256 hex value',
      );
    }

    const plan = await this.buildPlan(input);
    if (plan.planHash !== expectedPlanHash) {
      throw new ConflictException(
        'External Sale reconstruction plan changed after preview',
      );
    }
    if (plan.status !== 'READY') {
      throw new ConflictException(
        'Blocked External Sale reconstruction cannot be executed',
      );
    }

    const sale = await this.externalSales.createSaleFromEvidence(
      plan.proposedSale,
      actorRef,
      {
        artifactStableId: plan.evidence.artifactStableId,
        contentHash: plan.evidence.contentHash,
      },
    );

    return {
      ...plan,
      execution: {
        externalSaleStableId: sale.externalSaleStableId,
        journalEntryStableId: sale.journalEntryStableId,
      },
    };
  }

  private async buildPlan(
    input: AccountingExternalSaleReconstructionPreviewInputV1,
  ): Promise<AccountingExternalSaleReconstructionPreviewV1> {
    const artifactStableId = input?.artifactStableId?.trim();
    if (!artifactStableId) {
      throw new BadRequestException('artifactStableId is required');
    }

    const [artifact, store, accountingStartAt] = await Promise.all([
      this.prisma.accountingSourceArtifact.findUnique({
        where: { artifactStableId },
        select: {
          artifactStableId: true,
          contentHash: true,
          mimeType: true,
          originalFilename: true,
          storedUrl: true,
          inboxItem: {
            select: {
              status: true,
              classification: true,
              selectedProvider: true,
              materializedEntityType: true,
              materializedEntityStableId: true,
            },
          },
        },
      }),
      this.storeConfig.getConfiguredStoreSnapshot(),
      this.period.requireCanonicalFinancialPostingStartAt(),
    ]);

    if (!artifact) {
      throw new NotFoundException('Accounting evidence not found');
    }
    if (
      artifact.inboxItem?.status !== 'CONFIRMED' ||
      artifact.inboxItem.classification !== 'OTHER_DOCUMENT' ||
      artifact.inboxItem.selectedProvider !== null ||
      artifact.inboxItem.materializedEntityType !== null ||
      artifact.inboxItem.materializedEntityStableId !== null
    ) {
      throw new ConflictException(
        'External Sale reconstruction requires confirmed OTHER_DOCUMENT evidence that is not materialized elsewhere',
      );
    }
    const originalFilename = artifact.originalFilename?.trim() ?? '';
    if (
      !originalFilename.toLowerCase().endsWith('.xlsx') ||
      !artifact.storedUrl ||
      !artifact.mimeType
    ) {
      throw new ConflictException(
        'External Sale reconstruction currently requires retained XLSX evidence',
      );
    }

    const preview = await this.tabularPreview.previewArtifact(artifactStableId);
    if (preview.format !== 'XLSX') {
      throw new ConflictException(
        'External Sale reconstruction currently requires XLSX evidence',
      );
    }
    if (preview.sheetNames.length !== 1 || preview.sheetNamesTruncated) {
      throw new ConflictException(
        'External Sale Customer Statement reconstruction requires exactly one worksheet',
      );
    }
    if (
      preview.truncatedRows ||
      preview.truncatedColumns ||
      preview.truncatedCells
    ) {
      throw new ConflictException(
        'External Sale Customer Statement exceeds safe reconstruction preview limits',
      );
    }

    let statement: AccountingExternalSaleCustomerStatement;
    try {
      statement = parseAccountingExternalSaleCustomerStatement(preview.rows);
    } catch (error) {
      if (error instanceof AccountingExternalSaleReconstructionPolicyError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const timezone = store.timezone.trim() || 'America/Toronto';
    const accountingStartDate = DateTime.fromJSDate(accountingStartAt, {
      zone: timezone,
    }).toISODate();
    if (!accountingStartDate) {
      throw new ConflictException('Unable to resolve Accounting start date');
    }

    let proposedSale: CreateAccountingExternalSaleInputV1;
    try {
      proposedSale = buildAccountingExternalSaleReconstructionInput({
        artifactStableId: artifact.artifactStableId,
        contentHash: artifact.contentHash,
        originalFilename,
        classificationStableId: input.classificationStableId,
        storeStableId: store.storeStableId,
        statement,
      });
    } catch (error) {
      if (error instanceof AccountingExternalSaleReconstructionPolicyError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const preStart = statement.periodStartOn < accountingStartDate;
    const hasRecordedPayment = statement.paidAmountCents > 0;
    const blockCode = preStart
      ? 'PRE_START_OPENING_BALANCE_REQUIRED'
      : hasRecordedPayment
        ? 'PAID_AMOUNT_REQUIRES_SETTLEMENT_EVIDENCE'
        : null;
    const warnings: string[] = [];
    if (preStart) {
      warnings.push(
        `Source period begins before Accounting start ${accountingStartDate}; keep it out of post-start revenue reconstruction and handle any opening receivable in Slice G.`,
      );
    }
    if (hasRecordedPayment) {
      warnings.push(
        'Source statement records a paid amount but does not establish settlement bank/account timing; add settlement evidence before reconstruction.',
      );
    }

    const planHash = accountingExternalSaleReconstructionPlanHash({
      accountingStartDate,
      artifactStableId: artifact.artifactStableId,
      contentHash: artifact.contentHash,
      proposedSale,
      source: statement,
    });

    return {
      version: 1,
      planHash,
      status: blockCode ? 'BLOCKED' : 'READY',
      blockCode,
      accountingStartDate,
      evidence: {
        artifactStableId: artifact.artifactStableId,
        contentHash: artifact.contentHash,
        originalFilename,
      },
      source: {
        statementType: 'CUSTOMER_STATEMENT',
        counterpartyName: statement.counterpartyName,
        periodStartOn: statement.periodStartOn,
        periodEndOn: statement.periodEndOn,
        sourceRowCount: statement.sourceRowCount,
        sourceQuantity: statement.sourceQuantity,
        lineSubtotalCents: statement.lineSubtotalCents,
        taxTotalCents: statement.taxTotalCents,
        totalReceivableCents: statement.totalReceivableCents,
        paidAmountCents: statement.paidAmountCents,
        balanceDueCents: statement.balanceDueCents,
      },
      proposedSale,
      warnings,
    };
  }
}
