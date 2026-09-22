import { resolve } from 'node:path';

import {
  importSpecifiers,
  scanTypeScript,
} from '../test/architecture-test.utils';

const API_SRC_ROOT = resolve(__dirname, '..');
const ACCOUNTING_ROOT = resolve(API_SRC_ROOT, 'accounting');
const ORDERS_ROOT = resolve(API_SRC_ROOT, 'orders');

const file = (root: string, suffix: string) =>
  scanTypeScript(root).find(({ path }) => path.endsWith(suffix));

describe('B2 canonical sales analytics boundary', () => {
  it('publishes Orders sales attribution as a narrow non-monetary public contract', () => {
    const contract = file(
      ORDERS_ROOT,
      'order-sales-attribution.contract.ts',
    )?.source;
    const publicApi = file(ORDERS_ROOT, 'public-api.ts')?.source ?? '';

    expect(contract).toBeDefined();
    if (!contract) return;

    expect(importSpecifiers(contract)).toEqual([]);
    expect(contract).toContain('sourceFactStableId: string');
    expect(contract).toContain('orderStableId: string');
    expect(contract).toContain('storeStableId: string | null');
    expect(contract).toContain('occurredAt: Date');
    expect(contract).toContain('channel: OrderSalesAttributionChannelV1');
    expect(contract).toContain(
      'primaryPaymentMethod: OrderSalesAttributionPrimaryPaymentMethodV1',
    );
    expect(contract).toContain(
      'sourceEvidence: OrderSalesAttributionSourceEvidenceV1',
    );
    expect(contract).toContain(
      'primaryPaymentMethodEvidence: OrderSalesPrimaryPaymentMethodEvidenceV1',
    );
    expect(contract).not.toMatch(/\b\w*Cents\b/);
    expect(contract).not.toContain('amountCents');
    expect(contract).not.toContain('paymentBreakdown');
    expect(contract).not.toContain('@prisma/client');

    expect(publicApi).toContain('ORDER_SALES_ATTRIBUTION_READER');
    expect(publicApi).toContain('OrderSalesAttributionModule');
    expect(publicApi).not.toContain('OrderSalesAttributionReaderService');
  });

  it('keeps attribution persistence inside Orders and prefers immutable sale evidence', () => {
    const service =
      file(ORDERS_ROOT, 'order-sales-attribution.service.ts')?.source ?? '';
    const module =
      file(ORDERS_ROOT, 'order-sales-attribution.module.ts')?.source ?? '';

    expect(service).toContain("from './orders-prisma'");
    expect(service).toContain("from './order-financial-sale-fact'");
    expect(service).toContain("from './order-financial-change-fact'");
    expect(service).toContain('ORDER_FINANCIAL_SALE_FACT_SOURCE');
    expect(service).toContain('ORDER_FINANCIAL_SALE_FACT_EVENT');
    expect(service).toContain('ORDER_FINANCIAL_CHANGE_FACT_SOURCE');
    expect(service).toContain('ORDER_FINANCIAL_ADJUSTMENT_FACT_EVENT');
    expect(service).toContain('ORDER_FINANCIAL_REVERSAL_FACT_EVENT');
    expect(service).toContain("'IMMUTABLE_SALE_SNAPSHOT'");
    expect(service).toContain("'IMMUTABLE_CHANGE_SNAPSHOT'");
    expect(service).toContain("'LEGACY_CURRENT_ORDER'");
    expect(service).toContain('originalSale.primaryPaymentMethod');
    expect(service).toContain('originalSale.primaryPaymentMethodEvidence');
    expect(service).not.toContain("from '../accounting");
    expect(service).not.toContain('totalCents');
    expect(service).not.toContain('subtotalCents');
    expect(service).not.toContain('taxCents');
    expect(service).not.toContain('paymentBreakdownJson');

    expect(module).toContain('PrismaModule');
    expect(module).toContain('ORDER_SALES_ATTRIBUTION_READER');
    expect(module).not.toContain('OrdersModule');
  });

  it('keeps Accounting sales amounts Journal-owned and coverage fail-visible', () => {
    const policy =
      file(ACCOUNTING_ROOT, 'accounting-sales-analytics.policy.ts')?.source ??
      '';

    for (const accountStableId of [
      'account_sales_revenue',
      'account_sales_discounts',
      'account_delivery_revenue',
      'account_card_surcharge_revenue',
      'account_hst_payable',
      'account_tip_revenue',
      'account_other_operating_revenue',
      'account_platform_commission_expense',
      'account_payment_processing_fee_expense',
      'account_platform_promotion_expense',
      'account_advertising_expense',
      'account_chargeback_adjustment_expense',
      'account_general_operating_expense',
    ]) {
      expect(policy).toContain(accountStableId);
    }

    expect(policy).toContain("'order.financial_sale.v1'");
    expect(policy).toContain("'order.financial_adjustment.v1'");
    expect(policy).toContain("'order.financial_reversal.v1'");
    expect(policy).toContain("'accounting.provider_financial_document.v1'");
    expect(policy).toContain("'accounting.uber_pre_cutover_order_reversal.v1'");
    expect(policy).toContain("'STORE_CASH_EQUIVALENT'");
    expect(policy).toContain("'UNKNOWN'");
    expect(policy).toContain("'INCOMPLETE'");
    expect(policy).toContain("'COMPLETE'");
    expect(policy).toContain("'NOT_APPLICABLE'");
    expect(policy).not.toContain('Order.totalCents');
    expect(policy).not.toContain('readPaidTotalDimensionsForRange');
    expect(policy).not.toContain('paymentBreakdownJson');
    expect(policy).toContain("from '../orders/public-api'");
    expect(policy).not.toContain("from '../orders/order-");
    expect(policy).not.toContain('../prisma/');
  });
});
