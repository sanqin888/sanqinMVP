import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  importSpecifiers,
  importViolations,
  scanTypeScript,
} from '../test/architecture-test.utils';

const API_SRC_ROOT = resolve(__dirname, '..');
const ACCOUNTING_ROOT = resolve(API_SRC_ROOT, 'accounting');
const ORDERS_ROOT = resolve(API_SRC_ROOT, 'orders');
const LOYALTY_ROOT = resolve(API_SRC_ROOT, 'loyalty');
const PAYMENTS_ROOT = resolve(API_SRC_ROOT, 'payments');
const PRISMA_SCHEMA = resolve(API_SRC_ROOT, '..', 'prisma', 'schema.prisma');

const file = (root: string, suffix: string) =>
  scanTypeScript(root).find(({ path }) => path.endsWith(suffix));

describe('Phase 9 canonical financial facts boundary', () => {
  it('publishes Orders, Loyalty, and Payments financial facts only through narrow owner public surfaces', () => {
    const ordersPublic = file(ORDERS_ROOT, 'public-api.ts')?.source ?? '';
    const loyaltyPublic = file(LOYALTY_ROOT, 'public-api.ts')?.source ?? '';
    const paymentsPublic = file(PAYMENTS_ROOT, 'public-api.ts')?.source ?? '';
    const paymentsFactsModule =
      file(PAYMENTS_ROOT, 'payment-financial-facts.module.ts')?.source ?? '';

    expect(ordersPublic).toContain('ORDER_FINANCIAL_FACTS_READER');
    expect(ordersPublic).toContain('OrderFinancialFactsModule');
    expect(ordersPublic).toContain('OrderFinancialReplayCandidateV1');
    expect(ordersPublic).toContain('ORDER_FINANCIAL_CHANGE_FACTS_READER');
    expect(ordersPublic).toContain('OrderFinancialChangeFactsModule');
    expect(loyaltyPublic).toContain('LOYALTY_FINANCIAL_FACTS_READER');
    expect(loyaltyPublic).toContain('LoyaltyFinancialFactsModule');
    expect(paymentsPublic).toContain('PAYMENT_FINANCIAL_FACTS_READER');
    expect(paymentsPublic).toContain('PAYMENT_REVERSAL_FINANCIAL_FACTS_READER');
    expect(paymentsPublic).toContain('PaymentFinancialFactsModule');

    expect(paymentsPublic).not.toContain('PrismaPaymentFinancialFactsReader');
    expect(paymentsPublic).not.toContain('PaymentsModule');
    expect(paymentsFactsModule).toContain('PAYMENT_TRANSACTION_REPOSITORY');
    expect(paymentsFactsModule).toContain('PaymentsModule');
    expect(paymentsFactsModule).not.toContain('../prisma/prisma.module');
    expect(paymentsFactsModule).not.toContain(
      'PrismaPaymentTransactionRepository',
    );
  });

  it('keeps canonical financial fact contracts framework-, Prisma-, and provider-implementation-neutral', () => {
    const contracts = [
      file(ORDERS_ROOT, 'order-financial-facts-reader.contract.ts'),
      file(ORDERS_ROOT, 'order-financial-change-facts-reader.contract.ts'),
      file(LOYALTY_ROOT, 'loyalty-financial-facts-reader.contract.ts'),
      file(
        resolve(PAYMENTS_ROOT, 'application'),
        'payment-financial-facts-reader.contract.ts',
      ),
      file(
        resolve(PAYMENTS_ROOT, 'application'),
        'payment-reversal-financial-facts-reader.contract.ts',
      ),
    ];

    expect(contracts).toHaveLength(5);
    for (const contract of contracts) {
      expect(contract).toBeDefined();
      if (!contract) continue;
      expect(importSpecifiers(contract.source)).toEqual([]);
      expect(contract.source).not.toContain('@prisma/client');
      expect(contract.source).not.toContain('Clover');
    }
  });

  it('keeps the Orders sale fact immutable and separate from the preparation acceptance lifecycle', () => {
    const saleFact =
      file(ORDERS_ROOT, 'order-financial-sale-fact.ts')?.source ?? '';
    const ordersService = file(ORDERS_ROOT, 'orders.service.ts')?.source ?? '';
    const ingestion =
      file(ORDERS_ROOT, 'order-ingestion.service.ts')?.source ?? '';
    const lifecycle = file(ORDERS_ROOT, 'order-lifecycle.ts')?.source ?? '';

    expect(saleFact).toContain(
      "ORDER_FINANCIAL_SALE_FACT_SOURCE = 'orders.financial'",
    );
    expect(saleFact).toContain(
      "ORDER_FINANCIAL_SALE_FACT_EVENT = 'order.financial_sale.v1'",
    );
    expect(saleFact).toContain('order-financial-sale:${orderStableId}:v1');
    expect(ordersService).toContain('appendOrderFinancialSaleFact(tx, order)');
    expect(ordersService).toContain(
      'appendOrderFinancialSaleFact(tx, created)',
    );
    expect(ingestion).toContain('ensureOrderFinancialSaleFact(tx, saved.id)');
    expect(lifecycle).toContain(
      "ORDER_ACCEPTED_LIFECYCLE_EVENT = 'order.accepted'",
    );
    expect(lifecycle).not.toContain('order.financial_sale.v1');
  });

  it('freezes post-sale Orders changes as immutable owner facts before Accounting consumes them', () => {
    const changeFact =
      file(ORDERS_ROOT, 'order-financial-change-fact.ts')?.source ?? '';
    const ordersService = file(ORDERS_ROOT, 'orders.service.ts')?.source ?? '';
    const externalCancellation =
      file(ORDERS_ROOT, 'order-external-cancellation.service.ts')?.source ?? '';

    expect(changeFact).toContain("'order.financial_adjustment.v1'");
    expect(changeFact).toContain("'order.financial_reversal.v1'");
    expect(changeFact).toContain('appendOrderFinancialChangeFact');
    expect(ordersService).toContain('buildOrderFinancialAdjustmentFact');
    expect(ordersService).toContain("action: 'FULL_REFUND'");
    expect(ordersService).toContain('appendOrderFinancialChangeFact');
    expect(externalCancellation).toContain("action: 'EXTERNAL_CANCELLATION'");
    expect(externalCancellation).toContain(
      "occurrenceEvidence: 'PROVIDER_EVENT'",
    );
  });

  it('keeps owner fact readers inside their own persistence boundaries', () => {
    const orderReader =
      file(ORDERS_ROOT, 'order-financial-facts-reader.service.ts')?.source ??
      '';
    const orderChangeReader =
      file(ORDERS_ROOT, 'order-financial-change-facts-reader.service.ts')
        ?.source ?? '';
    const loyaltyReader =
      file(LOYALTY_ROOT, 'loyalty-financial-facts-reader.service.ts')?.source ??
      '';
    const paymentReader =
      file(
        resolve(PAYMENTS_ROOT, 'infrastructure', 'prisma'),
        'prisma-payment-transaction.repository.ts',
      )?.source ?? '';

    expect(orderReader).toContain("from './orders-prisma'");
    expect(orderReader).toContain("from '../menu/public-api'");
    expect(orderReader).not.toContain("from '../menu/catalog-admin");
    expect(orderReader).not.toContain("from '../loyalty");
    expect(orderReader).not.toContain("from '../payments");
    expect(orderChangeReader).toContain("from './orders-prisma'");
    expect(orderChangeReader).not.toContain("from '../loyalty");
    expect(orderChangeReader).not.toContain("from '../payments");
    expect(loyaltyReader).toContain("from './loyalty-prisma'");
    expect(loyaltyReader).not.toContain("from '../orders");
    expect(loyaltyReader).not.toContain("from '../payments");
    expect(paymentReader).toContain("from '../../../prisma/prisma.service'");
    expect(paymentReader).not.toContain('/orders/');
    expect(paymentReader).not.toContain('/loyalty/');
  });

  it('wires canonical SALE and change cutovers through owner facts while keeping change preview read-only', () => {
    const postingService =
      file(ACCOUNTING_ROOT, 'accounting-canonical-sale-posting.service.ts')
        ?.source ?? '';
    const postingProcessor =
      file(ACCOUNTING_ROOT, 'accounting-canonical-sale-posting.processor.ts')
        ?.source ?? '';
    const replayService =
      file(ACCOUNTING_ROOT, 'accounting-canonical-sale-replay.service.ts')
        ?.source ?? '';
    const changePreviewService =
      file(ACCOUNTING_ROOT, 'accounting-canonical-change-preview.service.ts')
        ?.source ?? '';
    const changeExecutionService =
      file(ACCOUNTING_ROOT, 'accounting-canonical-change-execution.service.ts')
        ?.source ?? '';
    const providerSettlementPreviewService =
      file(ACCOUNTING_ROOT, 'accounting-provider-settlement-preview.service.ts')
        ?.source ?? '';
    const providerSettlementExecutionService =
      file(
        ACCOUNTING_ROOT,
        'accounting-provider-settlement-execution.service.ts',
      )?.source ?? '';
    const providerPayoutService =
      file(ACCOUNTING_ROOT, 'accounting-provider-payout.service.ts')?.source ??
      '';
    const providerPayoutBankMatchService =
      file(ACCOUNTING_ROOT, 'accounting-provider-payout-bank-match.service.ts')
        ?.source ?? '';
    const providerPayoutBankRowDecisionService =
      file(
        ACCOUNTING_ROOT,
        'accounting-provider-payout-bank-row-decision.service.ts',
      )?.source ?? '';
    const providerPendingReconciliationService =
      file(
        ACCOUNTING_ROOT,
        'accounting-provider-pending-reconciliation.service.ts',
      )?.source ?? '';
    const accountingService =
      file(ACCOUNTING_ROOT, 'accounting.service.ts')?.source ?? '';
    const canonicalSaleController =
      file(ACCOUNTING_ROOT, 'accounting-canonical-sale.controller.ts')
        ?.source ?? '';
    const canonicalChangeController =
      file(ACCOUNTING_ROOT, 'accounting-canonical-change.controller.ts')
        ?.source ?? '';
    const providerSettlementController =
      file(ACCOUNTING_ROOT, 'accounting-provider-settlement.controller.ts')
        ?.source ?? '';
    const canonicalControllerSources = [
      canonicalSaleController,
      canonicalChangeController,
      providerSettlementController,
    ].join('\n');
    const accountingModule =
      file(ACCOUNTING_ROOT, 'accounting.module.ts')?.source ?? '';

    expect(postingService).toContain("from '../orders/public-api'");
    expect(postingService).toContain("from '../loyalty/public-api'");
    expect(postingService).toContain("from './accounting-period.service'");
    expect(postingService).toContain("from './accounting-journal.service'");
    expect(postingService).not.toContain("from './accounting.service'");
    expect(postingService).not.toContain('../prisma/');
    expect(postingProcessor).toContain("from '../orders/public-api'");
    expect(postingProcessor).toContain("from '../store/public-api'");
    expect(postingProcessor).toContain(
      "from './accounting-provider-settlement-query.service'",
    );
    expect(postingProcessor).toContain('IMMUTABLE_SALE_SNAPSHOT');
    expect(postingProcessor).toContain('uberLiveOrderFactCutoverAt');
    expect(postingProcessor).not.toContain('../prisma/');
    expect(postingProcessor).not.toContain('orders-prisma');
    expect(replayService).toContain("from '../orders/public-api'");
    expect(replayService).toContain("from '../loyalty/public-api'");
    expect(replayService).toContain("from '../store/public-api'");
    expect(replayService).not.toContain('../prisma/');
    expect(replayService).toContain('executeRange(');
    expect(replayService).toContain('expectedPlanHash');
    expect(replayService).not.toContain('assertNoLegacyOrderRevenueAccrual');
    expect(changePreviewService).toContain("from '../orders/public-api'");
    expect(changePreviewService).toContain("from '../payments/public-api'");
    expect(changePreviewService).toContain("from '../loyalty/public-api'");
    expect(changePreviewService).toContain("from '../store/public-api'");
    expect(changePreviewService).not.toContain("from '../pos/");
    expect(changePreviewService).not.toContain('../prisma/');
    expect(changePreviewService).not.toContain('createJournalEntry');
    expect(changePreviewService).toContain('readFactsByOrderStableIds');
    expect(changePreviewService).toContain('readReversalFactsByOrderStableIds');
    expect(changePreviewService).toContain(
      'buildCanonicalChangeJournalPreview',
    );
    expect(changeExecutionService).toContain(
      "from './accounting-canonical-change-preview.service'",
    );
    expect(changeExecutionService).toContain('expectedPlanHash');
    expect(changeExecutionService).not.toContain(
      'assertNoLegacyOrderRevenueAccrual',
    );
    expect(changeExecutionService).toContain(
      'createCanonicalChangeJournalEntry',
    );
    expect(changeExecutionService).not.toContain('createJournalEntry(');
    expect(changeExecutionService).not.toContain('../prisma/');
    expect(changeExecutionService).not.toContain("from '../orders/");
    expect(changeExecutionService).not.toContain("from '../payments/");
    expect(changeExecutionService).not.toContain("from '../loyalty/");
    expect(providerSettlementPreviewService).toContain(
      "from '../orders/public-api'",
    );
    expect(providerSettlementPreviewService).not.toContain('../prisma/');
    expect(providerSettlementPreviewService).not.toContain(
      'createProviderSettlementReplacementGroup',
    );
    expect(providerSettlementExecutionService).toContain(
      "from './accounting-provider-settlement-preview.service'",
    );
    expect(providerSettlementExecutionService).toContain('expectedPlanHash');
    expect(providerSettlementExecutionService).not.toContain(
      'assertNoLegacyOrderRevenueAccrual',
    );
    expect(providerSettlementExecutionService).toContain(
      'createProviderSettlementReplacementGroup',
    );
    expect(providerSettlementExecutionService).not.toContain('../prisma/');
    expect(providerSettlementExecutionService).not.toContain(
      "from '../orders/",
    );
    expect(providerSettlementExecutionService).not.toContain(
      'accountingJournalEntry.',
    );
    expect(providerPayoutService).toContain("from './accounting-db'");
    expect(providerPayoutService).toContain(
      "from './accounting-journal.service'",
    );
    expect(providerPayoutService).toContain(
      "from './accounting-period.service'",
    );
    expect(providerPayoutService).not.toContain("from '../payments/");
    expect(providerPayoutService).not.toContain("from '../orders/");
    expect(providerPayoutService).not.toContain("from '../integrations/");
    expect(providerPayoutBankMatchService).toContain("from './accounting-db'");
    expect(providerPayoutBankMatchService).toContain(
      "from './accounting-artifact-delivery.service'",
    );
    expect(providerPayoutBankMatchService).not.toContain("from '../payments/");
    expect(providerPayoutBankMatchService).not.toContain("from '../orders/");
    expect(providerPayoutBankMatchService).not.toContain(
      "from '../integrations/",
    );
    expect(providerPayoutBankMatchService).not.toContain('createJournalEntry');
    expect(providerPayoutBankMatchService).not.toContain(
      'createProviderPayoutJournalInTx',
    );
    expect(providerPayoutBankMatchService).not.toContain(
      'accountingProviderPayout.create',
    );
    expect(providerPayoutBankRowDecisionService).toContain(
      "from './accounting-db'",
    );
    expect(providerPayoutBankRowDecisionService).toContain(
      "from './accounting-provider-payout-bank-match.service'",
    );
    expect(providerPayoutBankRowDecisionService).not.toContain(
      "from '../payments/",
    );
    expect(providerPayoutBankRowDecisionService).not.toContain(
      "from '../orders/",
    );
    expect(providerPayoutBankRowDecisionService).not.toContain(
      "from '../integrations/",
    );
    expect(providerPayoutBankRowDecisionService).not.toContain(
      'createProviderPayoutJournalInTx',
    );
    expect(providerPayoutBankRowDecisionService).not.toContain(
      'accountingProviderPayout.create',
    );
    expect(providerPendingReconciliationService).toContain(
      "from './accounting-db'",
    );
    expect(providerPendingReconciliationService).toContain(
      "from './accounting-period.service'",
    );
    expect(providerPendingReconciliationService).toContain(
      "from './accounting-provider-settlement-query.service'",
    );
    expect(providerPendingReconciliationService).not.toContain(
      "from '../payments/",
    );
    expect(providerPendingReconciliationService).not.toContain(
      "from '../orders/",
    );
    expect(providerPendingReconciliationService).not.toContain(
      "from '../integrations/",
    );
    expect(providerPendingReconciliationService).not.toContain(
      'createJournalEntry',
    );
    expect(providerPendingReconciliationService).not.toContain(
      'createProviderPayoutJournalInTx',
    );
    expect(canonicalSaleController).toContain(
      "@Post('journal/canonical-sales/replay')",
    );
    expect(canonicalChangeController).toContain(
      "@Get('journal/canonical-changes/shadow-preview')",
    );
    expect(canonicalChangeController).toContain(
      "@Post('journal/canonical-changes/replay')",
    );
    expect(providerSettlementController).toContain(
      "@Get('journal/provider-settlement/shadow-preview')",
    );
    expect(providerSettlementController).toContain(
      "@Post('journal/provider-settlement/replay')",
    );
    expect(canonicalControllerSources).not.toContain(
      'automation/order-accrual',
    );
    expect(accountingService).not.toContain('autoAccrueOrderRevenue');
    expect(accountingModule).toContain('OrderFinancialFactsModule');
    expect(accountingModule).toContain('OrderFinancialChangeFactsModule');
    expect(accountingModule).toContain('PaymentFinancialFactsModule');
    expect(accountingModule).toContain('LoyaltyFinancialFactsModule');
    expect(accountingModule).toContain('AccountingCanonicalSaleReplayService');
    expect(accountingModule).toContain(
      'AccountingCanonicalSalePostingProcessor',
    );
    expect(accountingModule).toContain(
      'AccountingCanonicalChangePreviewService',
    );
    expect(accountingModule).toContain(
      'AccountingCanonicalChangeExecutionService',
    );
    expect(accountingModule).toContain(
      'AccountingProviderSettlementPreviewService',
    );
    expect(accountingModule).toContain(
      'AccountingProviderSettlementExecutionService',
    );
    expect(accountingModule).toContain('AccountingProviderPayoutService');
    expect(accountingModule).toContain(
      'AccountingProviderPayoutBankMatchService',
    );
    expect(accountingModule).toContain(
      'AccountingProviderPendingReconciliationService',
    );

    const canonicalSalePostingCallers = scanTypeScript(ACCOUNTING_ROOT, {
      productionOnly: true,
    })
      .filter(
        ({ path, source }) =>
          !path.endsWith('accounting-canonical-sale-posting.service.ts') &&
          source.includes('postCanonicalSale('),
      )
      .map(({ path }) =>
        path.slice(API_SRC_ROOT.length + 1).replaceAll('\\', '/'),
      )
      .sort();
    expect(canonicalSalePostingCallers).toEqual([
      'accounting/accounting-canonical-sale-posting.processor.ts',
    ]);

    const canonicalChangeWriterCallers = scanTypeScript(ACCOUNTING_ROOT, {
      productionOnly: true,
    })
      .filter(
        ({ path, source }) =>
          !path.endsWith('accounting.service.ts') &&
          !path.endsWith('accounting-journal.service.ts') &&
          source.includes('createCanonicalChangeJournalEntry('),
      )
      .map(({ path }) =>
        path.slice(API_SRC_ROOT.length + 1).replaceAll('\\', '/'),
      )
      .sort();
    expect(canonicalChangeWriterCallers).toEqual([
      'accounting/accounting-canonical-change-execution.service.ts',
    ]);

    const providerSettlementWriterCallers = scanTypeScript(ACCOUNTING_ROOT, {
      productionOnly: true,
    })
      .filter(
        ({ path, source }) =>
          !path.endsWith('accounting.service.ts') &&
          !path.endsWith('accounting-journal.service.ts') &&
          source.includes('createProviderSettlementReplacementGroup('),
      )
      .map(({ path }) =>
        path.slice(API_SRC_ROOT.length + 1).replaceAll('\\', '/'),
      )
      .sort();
    expect(providerSettlementWriterCallers).toEqual([
      'accounting/accounting-provider-settlement-execution.service.ts',
    ]);

    const providerPayoutWriterCallers = scanTypeScript(ACCOUNTING_ROOT, {
      productionOnly: true,
    })
      .filter(
        ({ path, source }) =>
          !path.endsWith('accounting-journal.service.ts') &&
          source.includes('createProviderPayoutJournalInTx('),
      )
      .map(({ path }) =>
        path.slice(API_SRC_ROOT.length + 1).replaceAll('\\', '/'),
      )
      .sort();
    expect(providerPayoutWriterCallers).toEqual([
      'accounting/accounting-provider-payout.service.ts',
    ]);

    const payoutControllerCallers = scanTypeScript(ACCOUNTING_ROOT, {
      productionOnly: true,
    })
      .filter(
        ({ path, source }) =>
          path.endsWith('.controller.ts') &&
          (source.includes('AccountingProviderPayoutService') ||
            source.includes('provider-payout')),
      )
      .map(({ path }) =>
        path.slice(API_SRC_ROOT.length + 1).replaceAll('\\', '/'),
      )
      .sort();
    expect(payoutControllerCallers).toEqual([
      'accounting/accounting-provider-payout.controller.ts',
    ]);
  });

  it('keeps generic single-entry AccountingTransaction persistence fully contracted', () => {
    const schema = readFileSync(PRISMA_SCHEMA, 'utf8');
    const accountingContracts =
      file(ACCOUNTING_ROOT, 'accounting-contracts.ts')?.source ?? '';
    const accountingService =
      file(ACCOUNTING_ROOT, 'accounting.service.ts')?.source ?? '';
    const accountingJournalService =
      file(ACCOUNTING_ROOT, 'accounting-journal.service.ts')?.source ?? '';
    const accountingControllerSources = scanTypeScript(ACCOUNTING_ROOT, {
      productionOnly: true,
    })
      .filter(({ path }) => path.endsWith('.controller.ts'))
      .map(({ source }) => source)
      .join('\n');
    const accountingReportsController =
      file(ACCOUNTING_ROOT, 'accounting-reports.controller.ts')?.source ?? '';
    const accountingExpenseService =
      file(ACCOUNTING_ROOT, 'accounting-expense.service.ts')?.source ?? '';
    const accountingExpenseSplitWriter =
      file(ACCOUNTING_ROOT, 'accounting-expense-split.writer.ts')?.source ?? '';
    const accountingFinancialReportsService =
      file(ACCOUNTING_ROOT, 'accounting-financial-reports.service.ts')
        ?.source ?? '';

    expect(schema).not.toMatch(/\bmodel AccountingTransaction\s*{/);
    expect(schema).not.toMatch(/\benum AccountingSourceType\s*{/);
    expect(accountingContracts).not.toContain('AccountingSourceType');
    expect(accountingService).not.toContain('orderId: normalized.orderId');
    expect(accountingControllerSources).not.toContain(
      'orderId?: string | null;',
    );
    expect(accountingControllerSources).not.toContain("@Post('tx')");
    expect(accountingControllerSources).not.toContain("@Get('tx')");
    expect(accountingControllerSources).not.toContain("@Put('tx/:txStableId')");
    expect(accountingControllerSources).not.toContain(
      "@Delete('tx/:txStableId')",
    );
    expect(accountingControllerSources).not.toContain('type TxBody');
    expect(accountingReportsController).toContain("@Get('export/tx.csv')");
    expect(accountingService).not.toContain('async createTx(');
    expect(accountingService).not.toContain('async listTx(');
    expect(accountingService).not.toContain('async updateTx(');
    expect(accountingService).not.toContain('async deleteTx(');
    expect(accountingService).not.toContain('type UpsertTxDto');
    expect(accountingService).not.toContain('ACCOUNTING_TX_PUBLIC_SELECT');
    for (const method of [
      'pnlReport',
      'exportTxCsv',
      'exportPnlTemplate',
      'exportPnlPdf',
      'accountBalanceReport',
      'annualReport',
      'cashflowOverview',
    ]) {
      expect(accountingService).not.toContain(`async ${method}(`);
      expect(accountingFinancialReportsService).toContain(`async ${method}(`);
    }
    expect(accountingFinancialReportsService).toContain(
      'accountingJournalEntry.findMany',
    );
    expect(accountingFinancialReportsService).not.toContain(
      'accountingTransaction.findMany',
    );
    expect(accountingFinancialReportsService).not.toContain(
      'accountingExpensePaymentAllocation.findMany',
    );
    expect(accountingService).not.toContain('async dimensionSlice(');
    expect(accountingJournalService).not.toContain(
      'assertNoLegacyOrderRevenueAccrual',
    );
    expect(accountingExpenseService).not.toContain(
      'accountingTransaction.createMany',
    );
    expect(accountingExpenseSplitWriter).toContain(
      'accountingExpenseSplit.createMany',
    );
    expect(accountingExpenseSplitWriter).not.toContain(
      'accountingTransaction.createMany',
    );

    const transactionMutationCallers = scanTypeScript(ACCOUNTING_ROOT, {
      productionOnly: true,
    })
      .filter(({ source }) =>
        /accountingTransaction\.(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/.test(
          source,
        ),
      )
      .map(({ path }) =>
        path.slice(API_SRC_ROOT.length + 1).replaceAll('\\', '/'),
      )
      .sort();

    expect(transactionMutationCallers).toEqual([]);

    const expenseSplitMutationCallers = scanTypeScript(ACCOUNTING_ROOT, {
      productionOnly: true,
    })
      .filter(({ source }) =>
        /accountingExpenseSplit\.(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/.test(
          source,
        ),
      )
      .map(({ path }) =>
        path.slice(API_SRC_ROOT.length + 1).replaceAll('\\', '/'),
      )
      .sort();

    expect(expenseSplitMutationCallers).toEqual([
      'accounting/accounting-expense-split.writer.ts',
    ]);

    const canonicalExpenseJournalCallers = scanTypeScript(ACCOUNTING_ROOT, {
      productionOnly: true,
    })
      .filter(
        ({ source, path }) =>
          !path.endsWith('accounting-journal.service.ts') &&
          source.includes('.createCanonicalExpenseJournalEntryInTx('),
      )
      .map(({ path }) =>
        path.slice(API_SRC_ROOT.length + 1).replaceAll('\\', '/'),
      )
      .sort();

    expect(canonicalExpenseJournalCallers).toEqual([
      'accounting/accounting-expense-journal-posting.service.ts',
    ]);
  });

  it('prevents Accounting from consuming owner internals before or after the later posting cutover', () => {
    const accountingFiles = scanTypeScript(ACCOUNTING_ROOT, {
      productionOnly: true,
    });

    expect(
      importViolations(accountingFiles, API_SRC_ROOT, (specifier) => {
        const ownerMatch = specifier.match(
          /\.\.\/(orders|loyalty|payments)\/(.+)$/,
        );
        if (!ownerMatch) return false;
        return ownerMatch[2] !== 'public-api';
      }),
    ).toEqual([]);
  });
});
