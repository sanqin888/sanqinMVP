import { Inject, Injectable } from '@nestjs/common';
import {
  AccountingFinancialProvider,
  AccountingParseStatus,
} from '@prisma/client';
import {
  BRAND_STORE_CONFIG_READER,
  type BrandStoreConfigReaderPort,
} from '../store/public-api';
import { AccountingOperationsService } from './accounting-operations.service';
import {
  hashAccountingJson,
  PROVIDER_FINANCIAL_HISTORY_START_DATE,
} from './accounting-inbox-core.policy';
import {
  ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME,
  ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION,
  parseProviderFinancialEvidence,
  type ProviderFinancialParseInput,
} from './accounting-provider-financial.parser';

export type AccountingProviderFinancialParseContext = Omit<
  ProviderFinancialParseInput,
  'text'
> & {
  artifactStableId: string;
  text: string;
};

export class AccountingProviderFinancialProcessingError extends Error {}

@Injectable()
export class AccountingProviderFinancialService {
  constructor(
    private readonly operations: AccountingOperationsService,
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly storeConfig: BrandStoreConfigReaderPort,
  ) {}

  async parseAndMaterialize(input: AccountingProviderFinancialParseContext) {
    const parsed = parseProviderFinancialEvidence(input);
    if (!parsed) return { matched: false as const };

    if (
      parsed.periodEnd &&
      parsed.periodEnd < PROVIDER_FINANCIAL_HISTORY_START_DATE
    ) {
      await this.operations.recordInboxParseRun({
        artifactStableId: input.artifactStableId,
        parserName: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME,
        parserVersion: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION,
        status: AccountingParseStatus.SKIPPED,
        resultJson: {
          providerFinancial: true,
          provider: parsed.provider,
          documentType: parsed.documentType,
          periodStart: parsed.periodStart,
          periodEnd: parsed.periodEnd,
          excludedBeforeFinancialHistory: true,
          financialHistoryRequiredFrom:
            PROVIDER_FINANCIAL_HISTORY_START_DATE,
        },
      });
      return {
        matched: true as const,
        materialized: false as const,
        excludedBeforeFinancialHistory: true as const,
        provider: parsed.provider,
        documentType: parsed.documentType,
      };
    }

    const parseResult = {
      providerFinancial: true,
      provider: parsed.provider,
      documentType: parsed.documentType,
      providerDocumentRef: parsed.providerDocumentRef,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      currency: parsed.currency,
      lineCount: parsed.lines.length,
      lines: parsed.lines,
      rawMetadata: parsed.rawMetadata,
    };

    try {
      const store = await this.storeConfig.getConfiguredStoreSnapshot();
      const document = await this.operations.recordProviderFinancialDocument({
        artifactStableId: input.artifactStableId,
        provider: parsed.provider,
        documentType: parsed.documentType,
        businessIdentityKey: parsed.businessIdentityKey,
        storeStableId: store.storeStableId,
        providerMerchantRef: parsed.providerMerchantRef,
        providerDocumentRef: parsed.providerDocumentRef,
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
        currency: parsed.currency,
        parserName: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME,
        parserVersion: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION,
        rawMetadata: parsed.rawMetadata,
        lines: parsed.lines,
      });

      await this.operations.ensureProviderFinancialCoverage(
        parsed.provider,
        store.storeStableId,
      );
      await this.operations.recordInboxParseRun({
        artifactStableId: input.artifactStableId,
        parserName: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME,
        parserVersion: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION,
        status: AccountingParseStatus.SUCCESS,
        resultHash: hashAccountingJson(parseResult),
        resultJson: parseResult,
      });

      return {
        matched: true as const,
        materialized: true as const,
        documentStableId: document.documentStableId,
        provider: parsed.provider,
        documentType: parsed.documentType,
        revision: document.revision,
        replayed: document.replayed,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown provider financial processing error';
      try {
        await this.operations.recordInboxParseRun({
          artifactStableId: input.artifactStableId,
          parserName: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME,
          parserVersion: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION,
          status: AccountingParseStatus.ERROR,
          resultJson: {
            ...parseResult,
            processingError: true,
          },
          errorMessage: message.slice(0, 1000),
        });
      } catch {
        // Preserve the original provider-processing failure; retries remain idempotent.
      }
      throw new AccountingProviderFinancialProcessingError(message);
    }
  }

  async recordUnsupportedUberApiParse(input: {
    artifactStableId: string;
    reportType: string;
  }) {
    if (input.reportType === 'ORDERS_AND_ITEMS_REPORT') return;
    await this.operations.recordInboxParseRun({
      artifactStableId: input.artifactStableId,
      parserName: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME,
      parserVersion: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION,
      status: AccountingParseStatus.SKIPPED,
      resultJson: {
        providerFinancial: true,
        provider: AccountingFinancialProvider.UBER_EATS,
        reportType: input.reportType,
        providerParserPending: true,
      },
    });
  }
}
