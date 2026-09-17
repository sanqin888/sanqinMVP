import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingFinancialProvider,
  AccountingInboxClassification,
  AccountingInboxMaterializedEntityType,
  AccountingInboxStatus,
  AccountingParseStatus,
} from './accounting-contracts';
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
  type ParsedProviderFinancialDocument,
  type ProviderFinancialParseInput,
} from './accounting-provider-financial.parser';
import {
  ACCOUNTING_PROVIDER_RECOGNITION_PARSER_NAME,
  matchAccountingProviderRecognitionRule,
  providerRecognitionParserVersion,
} from './accounting-provider-recognition.policy';

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

  async parseForInboxSuggestion(
    input: AccountingProviderFinancialParseContext,
  ) {
    try {
      const recognition = matchAccountingProviderRecognitionRule(
        input.text,
        await this.operations.listProviderRecognitionRules(),
      );
      if (!recognition.rule) {
        return {
          matched: false as const,
          ambiguousRuleStableIds: recognition.ambiguousRuleStableIds,
        };
      }

      const recognitionResult = {
        providerRecognition: true,
        provider: recognition.rule.provider,
        documentType: recognition.rule.documentType,
        recognitionRuleStableId: recognition.rule.ruleStableId,
        recognitionRuleVersion: recognition.rule.version,
        matchedRequiredKeywords: recognition.matchedRequiredKeywords,
        matchedOptionalKeywords: recognition.matchedOptionalKeywords,
        extractedText: input.text.slice(0, 100_000),
      };
      await this.operations.recordInboxParseRun({
        artifactStableId: input.artifactStableId,
        parserName: ACCOUNTING_PROVIDER_RECOGNITION_PARSER_NAME,
        parserVersion: providerRecognitionParserVersion(recognition.rule),
        status: AccountingParseStatus.SUCCESS,
        resultHash: hashAccountingJson(recognitionResult),
        resultJson: recognitionResult,
      });
      await this.operations.suggestUnifiedInboxClassification(
        input.artifactStableId,
        {
          classification:
            AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT,
          selectedProvider: recognition.rule.provider,
        },
      );

      const parsed = parseProviderFinancialEvidence({
        ...input,
        providerHint: recognition.rule.provider,
        documentTypeHint: recognition.rule.documentType,
      });
      if (!parsed) {
        return {
          matched: true as const,
          materialized: false as const,
          parserValidated: false as const,
          provider: recognition.rule.provider,
          documentType: recognition.rule.documentType,
        };
      }

      const parseResult = this.buildParseResult(parsed, input.text);
      const excludedBeforeFinancialHistory = Boolean(
        parsed.periodEnd &&
        parsed.periodEnd < PROVIDER_FINANCIAL_HISTORY_START_DATE,
      );
      await this.operations.recordInboxParseRun({
        artifactStableId: input.artifactStableId,
        parserName: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_NAME,
        parserVersion: ACCOUNTING_PROVIDER_FINANCIAL_PARSER_VERSION,
        status: excludedBeforeFinancialHistory
          ? AccountingParseStatus.SKIPPED
          : AccountingParseStatus.SUCCESS,
        ...(excludedBeforeFinancialHistory
          ? {}
          : { resultHash: hashAccountingJson(parseResult) }),
        resultJson: excludedBeforeFinancialHistory
          ? {
              ...parseResult,
              excludedBeforeFinancialHistory: true,
              financialHistoryRequiredFrom:
                PROVIDER_FINANCIAL_HISTORY_START_DATE,
            }
          : parseResult,
      });
      return {
        matched: true as const,
        materialized: false as const,
        parserValidated: true as const,
        excludedBeforeFinancialHistory,
        provider: parsed.provider,
        documentType: parsed.documentType,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown provider financial suggestion error';
      throw new AccountingProviderFinancialProcessingError(message);
    }
  }

  async parseAndMaterialize(input: AccountingProviderFinancialParseContext) {
    const parsed = parseProviderFinancialEvidence(input);
    if (!parsed) return { matched: false as const };

    const parseResult = this.buildParseResult(parsed, input.text);
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
          ...parseResult,
          excludedBeforeFinancialHistory: true,
          financialHistoryRequiredFrom: PROVIDER_FINANCIAL_HISTORY_START_DATE,
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

    try {
      const document = await this.materializeParsed(
        input.artifactStableId,
        parsed,
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

  async confirmSelectedInboxFinancialEvidence(
    inboxItemStableId: string,
    operatorUserStableId: string,
  ) {
    const inbox =
      await this.operations.readUnifiedInboxProviderReviewContext(
        inboxItemStableId,
      );
    if (!inbox) throw new NotFoundException('accounting inbox item not found');
    if (inbox.status !== AccountingInboxStatus.PENDING_REVIEW) {
      throw new ConflictException(
        'only pending provider financial evidence can be confirmed',
      );
    }
    if (
      inbox.classification !==
        AccountingInboxClassification.PROVIDER_FINANCIAL_DOCUMENT ||
      !inbox.selectedProvider
    ) {
      throw new ConflictException(
        'select a provider financial classification and provider before confirmation',
      );
    }

    if (inbox.materializedEntityType || inbox.materializedEntityStableId) {
      if (
        inbox.materializedEntityType !==
          AccountingInboxMaterializedEntityType.PROVIDER_FINANCIAL_DOCUMENT ||
        !inbox.materializedEntityStableId ||
        inbox.artifact.financialDocument?.documentStableId !==
          inbox.materializedEntityStableId ||
        inbox.artifact.financialDocument?.provider !== inbox.selectedProvider
      ) {
        throw new ConflictException(
          'materialized provider evidence does not match the selected provider',
        );
      }
      const store = await this.storeConfig.getConfiguredStoreSnapshot();
      await this.operations.ensureProviderFinancialCoverage(
        inbox.selectedProvider,
        store.storeStableId,
      );
      return this.operations.confirmProviderFinancialInboxItem(
        inboxItemStableId,
        operatorUserStableId,
      );
    }

    const extractedText = inbox.artifact.parseRuns
      .map((run) => jsonRecord(run.resultJson).extractedText)
      .find(
        (value): value is string =>
          typeof value === 'string' && Boolean(value.trim()),
      );
    const text = extractedText?.trim() || inbox.artifact.bodyText?.trim() || '';
    if (!text) {
      throw new ConflictException(
        'provider financial evidence has no readable extracted text',
      );
    }

    const parsed = parseProviderFinancialEvidence({
      text,
      emailSubject: inbox.artifact.emailSubject,
      providerHint: inbox.selectedProvider,
    });
    if (!parsed || parsed.provider !== inbox.selectedProvider) {
      throw new ConflictException(
        'the selected provider parser could not validate this evidence',
      );
    }
    if (
      parsed.periodEnd &&
      parsed.periodEnd < PROVIDER_FINANCIAL_HISTORY_START_DATE
    ) {
      throw new ConflictException(
        `provider financial evidence is before the ${PROVIDER_FINANCIAL_HISTORY_START_DATE} financial-history boundary`,
      );
    }

    await this.materializeParsed(inbox.artifact.artifactStableId, parsed);
    return this.operations.confirmProviderFinancialInboxItem(
      inboxItemStableId,
      operatorUserStableId,
    );
  }

  private buildParseResult(
    parsed: ParsedProviderFinancialDocument,
    text: string,
  ) {
    return {
      providerFinancial: true,
      provider: parsed.provider,
      documentType: parsed.documentType,
      businessIdentityKey: parsed.businessIdentityKey,
      providerMerchantRef: parsed.providerMerchantRef,
      providerDocumentRef: parsed.providerDocumentRef,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      currency: parsed.currency,
      lineCount: parsed.lines.length,
      lines: parsed.lines,
      rawMetadata: parsed.rawMetadata,
      extractedText: text.slice(0, 100_000),
    };
  }

  private async materializeParsed(
    artifactStableId: string,
    parsed: ParsedProviderFinancialDocument,
  ) {
    const store = await this.storeConfig.getConfiguredStoreSnapshot();
    const document = await this.operations.recordProviderFinancialDocument({
      artifactStableId,
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
    return document;
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

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
