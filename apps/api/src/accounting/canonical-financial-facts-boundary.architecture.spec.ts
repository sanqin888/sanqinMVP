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

const file = (root: string, suffix: string) =>
  scanTypeScript(root).find(({ path }) => path.endsWith(suffix));

describe('Phase 9 canonical financial facts boundary', () => {
  it('publishes Orders, Loyalty, and Payments financial facts only through narrow owner public surfaces', () => {
    const ordersPublic = file(ORDERS_ROOT, 'public-api.ts')?.source ?? '';
    const loyaltyPublic = file(LOYALTY_ROOT, 'public-api.ts')?.source ?? '';
    const paymentsPublic = file(PAYMENTS_ROOT, 'public-api.ts')?.source ?? '';

    expect(ordersPublic).toContain('ORDER_FINANCIAL_FACTS_READER');
    expect(ordersPublic).toContain('OrderFinancialFactsModule');
    expect(loyaltyPublic).toContain('LOYALTY_FINANCIAL_FACTS_READER');
    expect(loyaltyPublic).toContain('LoyaltyFinancialFactsModule');
    expect(paymentsPublic).toContain('PAYMENT_FINANCIAL_FACTS_READER');
    expect(paymentsPublic).toContain('PaymentFinancialFactsModule');

    expect(paymentsPublic).not.toContain('PrismaPaymentFinancialFactsReader');
    expect(paymentsPublic).not.toContain('PaymentsModule');
  });

  it('keeps canonical financial fact contracts framework-, Prisma-, and provider-implementation-neutral', () => {
    const contracts = [
      file(ORDERS_ROOT, 'order-financial-facts-reader.contract.ts'),
      file(LOYALTY_ROOT, 'loyalty-financial-facts-reader.contract.ts'),
      file(
        resolve(PAYMENTS_ROOT, 'application'),
        'payment-financial-facts-reader.contract.ts',
      ),
    ];

    expect(contracts).toHaveLength(3);
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

  it('keeps owner fact readers inside their own persistence boundaries', () => {
    const orderReader =
      file(ORDERS_ROOT, 'order-financial-facts-reader.service.ts')?.source ??
      '';
    const loyaltyReader =
      file(LOYALTY_ROOT, 'loyalty-financial-facts-reader.service.ts')?.source ??
      '';
    const paymentReader =
      file(
        resolve(PAYMENTS_ROOT, 'infrastructure', 'prisma'),
        'prisma-payment-transaction.repository.ts',
      )?.source ?? '';

    expect(orderReader).toContain("from './orders-prisma'");
    expect(orderReader).not.toContain("from '../loyalty");
    expect(orderReader).not.toContain("from '../payments");
    expect(loyaltyReader).toContain("from './loyalty-prisma'");
    expect(loyaltyReader).not.toContain("from '../orders");
    expect(loyaltyReader).not.toContain("from '../payments");
    expect(paymentReader).toContain("from '../../../prisma/prisma.service'");
    expect(paymentReader).not.toContain('/orders/');
    expect(paymentReader).not.toContain('/loyalty/');
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
