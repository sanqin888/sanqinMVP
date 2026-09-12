import { AccountingAccountClass, AccountingAccountType } from '@prisma/client';

export type AccountingDefaultAccount = {
  accountStableId: string;
  name: string;
  type: AccountingAccountType | null;
  accountClass: AccountingAccountClass;
};

export const DEFAULT_ACCOUNTING_ACCOUNTS: readonly AccountingDefaultAccount[] =
  [
    {
      accountStableId: 'account_store_cash',
      name: '门店现金',
      type: AccountingAccountType.CASH,
      accountClass: AccountingAccountClass.ASSET,
    },
    {
      accountStableId: 'account_primary_bank',
      name: '主要银行账户',
      type: AccountingAccountType.BANK,
      accountClass: AccountingAccountClass.ASSET,
    },
    {
      accountStableId: 'account_clover_pending',
      name: 'Clover 待结算',
      type: AccountingAccountType.PLATFORM_WALLET,
      accountClass: AccountingAccountClass.ASSET,
    },
    {
      accountStableId: 'account_uber_pending',
      name: 'Uber Eats 待结算',
      type: AccountingAccountType.PLATFORM_WALLET,
      accountClass: AccountingAccountClass.ASSET,
    },
    {
      accountStableId: 'account_fantuan_pending',
      name: 'Fantuan 待结算',
      type: AccountingAccountType.PLATFORM_WALLET,
      accountClass: AccountingAccountClass.ASSET,
    },
    {
      accountStableId: 'account_hst_recoverable',
      name: 'HST/GST 待抵扣',
      type: null,
      accountClass: AccountingAccountClass.ASSET,
    },
    {
      accountStableId: 'account_hst_payable',
      name: 'HST/GST 应缴',
      type: null,
      accountClass: AccountingAccountClass.LIABILITY,
    },
    {
      accountStableId: 'account_opening_balance_equity',
      name: '期初余额权益',
      type: null,
      accountClass: AccountingAccountClass.EQUITY,
    },
    {
      accountStableId: 'account_sales_revenue',
      name: '餐品销售收入',
      type: null,
      accountClass: AccountingAccountClass.REVENUE,
    },
    {
      accountStableId: 'account_delivery_revenue',
      name: '配送收入',
      type: null,
      accountClass: AccountingAccountClass.REVENUE,
    },
    {
      accountStableId: 'account_card_surcharge_revenue',
      name: '刷卡附加费收入',
      type: null,
      accountClass: AccountingAccountClass.REVENUE,
    },
    {
      accountStableId: 'account_sales_discounts',
      name: '销售折扣',
      type: null,
      accountClass: AccountingAccountClass.REVENUE,
    },
    {
      accountStableId: 'account_other_operating_revenue',
      name: '其他经营收入',
      type: null,
      accountClass: AccountingAccountClass.REVENUE,
    },
    {
      accountStableId: 'account_general_operating_expense',
      name: '一般经营费用',
      type: null,
      accountClass: AccountingAccountClass.EXPENSE,
    },
    {
      accountStableId: 'account_platform_commission_expense',
      name: '平台佣金',
      type: null,
      accountClass: AccountingAccountClass.EXPENSE,
    },
    {
      accountStableId: 'account_platform_promotion_expense',
      name: '平台促销费用',
      type: null,
      accountClass: AccountingAccountClass.EXPENSE,
    },
    {
      accountStableId: 'account_advertising_expense',
      name: '广告费用',
      type: null,
      accountClass: AccountingAccountClass.EXPENSE,
    },
    {
      accountStableId: 'account_payment_processing_fee_expense',
      name: '支付处理费',
      type: null,
      accountClass: AccountingAccountClass.EXPENSE,
    },
    {
      accountStableId: 'account_chargeback_adjustment_expense',
      name: '拒付及平台调整',
      type: null,
      accountClass: AccountingAccountClass.EXPENSE,
    },
  ];
