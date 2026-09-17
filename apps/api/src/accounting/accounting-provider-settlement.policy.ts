import {
  AccountingAccountClass,
  AccountingFinancialComponent,
  AccountingFinancialDocumentType,
  AccountingFinancialPostingTreatment,
  AccountingFinancialProvider,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import { DateTime } from 'luxon';
import type {
  AccountingJournalCreateInput,
  AccountingJournalLineInput,
} from './accounting-journal-policy';

export const PROVIDER_SETTLEMENT_SYSTEM_ACTOR =
  'system:accounting-provider-settlement';
export const PROVIDER_FINANCIAL_SOURCE_FACT_TYPE =
  'accounting.provider_financial_document.v1';
export const UBER_PRE_CUTOVER_REVERSAL_SOURCE_FACT_TYPE =
  'accounting.uber_pre_cutover_order_reversal.v1';

export const PROVIDER_SETTLEMENT_ACCOUNT_IDS = {
  primaryBank: 'account_primary_bank',
  cloverPending: 'account_clover_pending',
  uberPending: 'account_uber_pending',
  fantuanPending: 'account_fantuan_pending',
  hstPayable: 'account_hst_payable',
  hstRecoverable: 'account_hst_recoverable',
  salesRevenue: 'account_sales_revenue',
  tipRevenue: 'account_tip_revenue',
  platformCommissionExpense: 'account_platform_commission_expense',
  platformPromotionExpense: 'account_platform_promotion_expense',
  advertisingExpense: 'account_advertising_expense',
  generalOperatingExpense: 'account_general_operating_expense',
  paymentProcessingFeeExpense: 'account_payment_processing_fee_expense',
  chargebackAdjustmentExpense: 'account_chargeback_adjustment_expense',
} as const;

export const PROVIDER_SETTLEMENT_ACCOUNT_REQUIREMENTS = {
  [PROVIDER_SETTLEMENT_ACCOUNT_IDS.primaryBank]: {
    accountClass: AccountingAccountClass.ASSET,
    currency: 'CAD',
    isActive: true,
  },
  [PROVIDER_SETTLEMENT_ACCOUNT_IDS.cloverPending]: {
    accountClass: AccountingAccountClass.ASSET,
    currency: 'CAD',
    isActive: true,
  },
  [PROVIDER_SETTLEMENT_ACCOUNT_IDS.uberPending]: {
    accountClass: AccountingAccountClass.ASSET,
    currency: 'CAD',
    isActive: true,
  },
  [PROVIDER_SETTLEMENT_ACCOUNT_IDS.fantuanPending]: {
    accountClass: AccountingAccountClass.ASSET,
    currency: 'CAD',
    isActive: true,
  },
  [PROVIDER_SETTLEMENT_ACCOUNT_IDS.hstPayable]: {
    accountClass: AccountingAccountClass.LIABILITY,
    currency: 'CAD',
    isActive: true,
  },
  [PROVIDER_SETTLEMENT_ACCOUNT_IDS.hstRecoverable]: {
    accountClass: AccountingAccountClass.ASSET,
    currency: 'CAD',
    isActive: true,
  },
  [PROVIDER_SETTLEMENT_ACCOUNT_IDS.salesRevenue]: {
    accountClass: AccountingAccountClass.REVENUE,
    currency: 'CAD',
    isActive: true,
  },
  [PROVIDER_SETTLEMENT_ACCOUNT_IDS.tipRevenue]: {
    accountClass: AccountingAccountClass.REVENUE,
    currency: 'CAD',
    isActive: true,
  },
  [PROVIDER_SETTLEMENT_ACCOUNT_IDS.platformCommissionExpense]: {
    accountClass: AccountingAccountClass.EXPENSE,
    currency: 'CAD',
    isActive: true,
  },
  [PROVIDER_SETTLEMENT_ACCOUNT_IDS.platformPromotionExpense]: {
    accountClass: AccountingAccountClass.EXPENSE,
    currency: 'CAD',
    isActive: true,
  },
  [PROVIDER_SETTLEMENT_ACCOUNT_IDS.advertisingExpense]: {
    accountClass: AccountingAccountClass.EXPENSE,
    currency: 'CAD',
    isActive: true,
  },
  [PROVIDER_SETTLEMENT_ACCOUNT_IDS.generalOperatingExpense]: {
    accountClass: AccountingAccountClass.EXPENSE,
    currency: 'CAD',
    isActive: true,
  },
  [PROVIDER_SETTLEMENT_ACCOUNT_IDS.paymentProcessingFeeExpense]: {
    accountClass: AccountingAccountClass.EXPENSE,
    currency: 'CAD',
    isActive: true,
  },
  [PROVIDER_SETTLEMENT_ACCOUNT_IDS.chargebackAdjustmentExpense]: {
    accountClass: AccountingAccountClass.EXPENSE,
    currency: 'CAD',
    isActive: true,
  },
} as const;

export type ProviderSalesAuthority =
  | 'STATEMENT_AUTHORITATIVE'
  | 'ORDER_AUTHORITATIVE'
  | 'SPLIT_PERIOD_BLOCKED'
  | 'RECONCILIATION_ONLY';

export type ProviderSettlementLineDisposition =
  | 'POSTABLE'
  | 'RECONCILIATION_ONLY'
  | 'CONTROL_TOTAL'
  | 'BLOCKED';

export type ProviderSettlementLineDecision = {
  lineStableId: string;
  lineNo: number;
  rawName: string | null;
  component: AccountingFinancialComponent;
  postingTreatment: AccountingFinancialPostingTreatment;
  amountCents: number;
  disposition: ProviderSettlementLineDisposition;
  reason: string;
  targetAccountStableId: string | null;
};

export type ProviderSettlementDocumentInput = {
  documentStableId: string;
  revision: number;
  provider: AccountingFinancialProvider;
  documentType: AccountingFinancialDocumentType;
  storeStableId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  currency: string;
  lines: Array<{
    lineStableId: string;
    lineNo: number;
    rawName: string | null;
    component: AccountingFinancialComponent;
    postingTreatment: AccountingFinancialPostingTreatment;
    amountCents: number;
  }>;
};

export type ProviderSettlementDocumentPlan = {
  salesAuthority: ProviderSalesAuthority;
  status: 'READY' | 'BLOCKED' | 'NOOP';
  blockReasons: string[];
  decisions: ProviderSettlementLineDecision[];
  draftJournal: AccountingJournalCreateInput | null;
  debitCents: number;
  creditCents: number;
  requiredAccountStableIds: string[];
};

const providerPendingAccount = (
  provider: AccountingFinancialProvider,
): string => {
  switch (provider) {
    case AccountingFinancialProvider.CLOVER:
      return PROVIDER_SETTLEMENT_ACCOUNT_IDS.cloverPending;
    case AccountingFinancialProvider.UBER_EATS:
      return PROVIDER_SETTLEMENT_ACCOUNT_IDS.uberPending;
    case AccountingFinancialProvider.FANTUAN:
      return PROVIDER_SETTLEMENT_ACCOUNT_IDS.fantuanPending;
    default:
      throw new Error(`Unsupported financial provider: ${String(provider)}`);
  }
};

export function resolveProviderSalesAuthority(params: {
  provider: AccountingFinancialProvider;
  documentType: AccountingFinancialDocumentType;
  periodStart: string | null;
  periodEnd: string | null;
  liveOrderFactCutoverAt: Date | null;
  timezone: string;
}): ProviderSalesAuthority {
  if (params.provider === AccountingFinancialProvider.CLOVER) {
    return 'RECONCILIATION_ONLY';
  }
  if (!params.liveOrderFactCutoverAt) {
    return 'STATEMENT_AUTHORITATIVE';
  }
  if (!params.periodStart || !params.periodEnd) {
    return 'SPLIT_PERIOD_BLOCKED';
  }

  const cutoverLocal = DateTime.fromJSDate(params.liveOrderFactCutoverAt, {
    zone: params.timezone,
  });
  const cutover = cutoverLocal.toISODate();
  if (!cutover) return 'SPLIT_PERIOD_BLOCKED';
  const exactLocalMidnight =
    cutoverLocal.toMillis() === cutoverLocal.startOf('day').toMillis();

  if (params.periodEnd < cutover) return 'STATEMENT_AUTHORITATIVE';
  if (params.periodStart > cutover) return 'ORDER_AUTHORITATIVE';
  if (params.periodStart === cutover && exactLocalMidnight) {
    return 'ORDER_AUTHORITATIVE';
  }
  return 'SPLIT_PERIOD_BLOCKED';
}

const targetAccountFor = (
  component: AccountingFinancialComponent,
): string | null => {
  switch (component) {
    case AccountingFinancialComponent.SALES:
      return PROVIDER_SETTLEMENT_ACCOUNT_IDS.salesRevenue;
    case AccountingFinancialComponent.SALES_TAX:
      return PROVIDER_SETTLEMENT_ACCOUNT_IDS.hstPayable;
    case AccountingFinancialComponent.TIP:
      return PROVIDER_SETTLEMENT_ACCOUNT_IDS.tipRevenue;
    case AccountingFinancialComponent.COMMISSION:
      return PROVIDER_SETTLEMENT_ACCOUNT_IDS.platformCommissionExpense;
    case AccountingFinancialComponent.COMMISSION_TAX:
      return PROVIDER_SETTLEMENT_ACCOUNT_IDS.hstRecoverable;
    case AccountingFinancialComponent.PROCESSING_FEE:
      return PROVIDER_SETTLEMENT_ACCOUNT_IDS.paymentProcessingFeeExpense;
    case AccountingFinancialComponent.PROCESSING_FEE_TAX:
      return PROVIDER_SETTLEMENT_ACCOUNT_IDS.hstRecoverable;
    case AccountingFinancialComponent.PROMOTION:
    case AccountingFinancialComponent.SUBSIDY:
      return PROVIDER_SETTLEMENT_ACCOUNT_IDS.platformPromotionExpense;
    case AccountingFinancialComponent.ADVERTISING:
    case AccountingFinancialComponent.ADVERTISING_CREDIT:
      return PROVIDER_SETTLEMENT_ACCOUNT_IDS.advertisingExpense;
    case AccountingFinancialComponent.ADVERTISING_TAX:
      return PROVIDER_SETTLEMENT_ACCOUNT_IDS.hstRecoverable;
    case AccountingFinancialComponent.CHARGEBACK:
      return PROVIDER_SETTLEMENT_ACCOUNT_IDS.chargebackAdjustmentExpense;
    case AccountingFinancialComponent.CHARGEBACK_TAX:
      return PROVIDER_SETTLEMENT_ACCOUNT_IDS.hstPayable;
    case AccountingFinancialComponent.PLATFORM_OTHER_FEE:
      return PROVIDER_SETTLEMENT_ACCOUNT_IDS.generalOperatingExpense;
    case AccountingFinancialComponent.PLATFORM_OTHER_FEE_TAX:
      return PROVIDER_SETTLEMENT_ACCOUNT_IDS.hstRecoverable;
    default:
      return null;
  }
};

export function classifyProviderSettlementLine(params: {
  provider: AccountingFinancialProvider;
  salesAuthority: ProviderSalesAuthority;
  line: ProviderSettlementDocumentInput['lines'][number];
}): ProviderSettlementLineDecision {
  const { line } = params;
  if (line.amountCents === 0) {
    return {
      ...line,
      disposition: 'CONTROL_TOTAL',
      reason: 'ZERO_AMOUNT',
      targetAccountStableId: null,
    };
  }
  if (
    line.component === AccountingFinancialComponent.CONTROL_TOTAL ||
    line.component === AccountingFinancialComponent.PAYOUT ||
    line.postingTreatment === AccountingFinancialPostingTreatment.CONTROL_TOTAL
  ) {
    return {
      ...line,
      disposition: 'CONTROL_TOTAL',
      reason: 'CONTROL_EVIDENCE_ONLY',
      targetAccountStableId: null,
    };
  }
  if (
    line.postingTreatment ===
    AccountingFinancialPostingTreatment.RECONCILIATION_ONLY
  ) {
    return {
      ...line,
      disposition: 'RECONCILIATION_ONLY',
      reason: 'PROVIDER_RECONCILIATION_ONLY',
      targetAccountStableId: null,
    };
  }
  if (
    line.postingTreatment === AccountingFinancialPostingTreatment.UNCLASSIFIED
  ) {
    return {
      ...line,
      disposition: 'BLOCKED',
      reason: 'UNCLASSIFIED_PROVIDER_COMPONENT',
      targetAccountStableId: null,
    };
  }
  if (
    line.component === AccountingFinancialComponent.SALES ||
    line.component === AccountingFinancialComponent.SALES_TAX
  ) {
    if (params.salesAuthority === 'SPLIT_PERIOD_BLOCKED') {
      return {
        ...line,
        disposition: 'BLOCKED',
        reason: 'DOCUMENT_CROSSES_LIVE_ORDER_CUTOVER',
        targetAccountStableId: null,
      };
    }
    if (
      params.salesAuthority === 'ORDER_AUTHORITATIVE' ||
      params.salesAuthority === 'RECONCILIATION_ONLY'
    ) {
      return {
        ...line,
        disposition: 'RECONCILIATION_ONLY',
        reason: 'CANONICAL_ORDER_REVENUE_AUTHORITATIVE',
        targetAccountStableId: null,
      };
    }
  }
  if (line.component === AccountingFinancialComponent.REFUND) {
    return {
      ...line,
      disposition: 'RECONCILIATION_ONLY',
      reason: 'REFUND_REQUIRES_CANONICAL_CHANGE_OR_PROVIDER_REVERSAL_EVIDENCE',
      targetAccountStableId: null,
    };
  }

  const targetAccountStableId = targetAccountFor(line.component);
  if (!targetAccountStableId) {
    return {
      ...line,
      disposition: 'BLOCKED',
      reason: 'UNMAPPED_PROVIDER_COMPONENT',
      targetAccountStableId: null,
    };
  }
  return {
    ...line,
    disposition: 'POSTABLE',
    reason:
      line.component === AccountingFinancialComponent.SUBSIDY
        ? 'CONTRA_PROMOTION_EXPENSE'
        : line.component === AccountingFinancialComponent.TIP
          ? 'NON_TAXABLE_STORE_TIP_REVENUE'
          : 'SETTLEMENT_COMPONENT',
    targetAccountStableId,
  };
}

const addNet = (
  target: Map<string, number>,
  account: string,
  value: number,
) => {
  const next = (target.get(account) ?? 0) + value;
  if (!Number.isSafeInteger(next)) {
    throw new Error(
      `Settlement account total exceeds safe integer range: ${account}`,
    );
  }
  target.set(account, next);
};

const toJournalLines = (
  accountNetDebits: Map<string, number>,
  memo: string,
): AccountingJournalLineInput[] =>
  Array.from(accountNetDebits.entries())
    .filter(([, value]) => value !== 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([accountStableId, value]) => ({
      accountStableId,
      debitCents: value > 0 ? value : 0,
      creditCents: value < 0 ? -value : 0,
      memo,
    }));

export function buildProviderSettlementDocumentPlan(params: {
  document: ProviderSettlementDocumentInput;
  salesAuthority: ProviderSalesAuthority;
  occurredAt: Date;
}): ProviderSettlementDocumentPlan {
  const { document } = params;
  if (document.currency !== 'CAD') {
    return {
      salesAuthority: params.salesAuthority,
      status: 'BLOCKED',
      blockReasons: ['UNSUPPORTED_CURRENCY'],
      decisions: [],
      draftJournal: null,
      debitCents: 0,
      creditCents: 0,
      requiredAccountStableIds: [],
    };
  }
  const decisions = document.lines.map((line) =>
    classifyProviderSettlementLine({
      provider: document.provider,
      salesAuthority: params.salesAuthority,
      line,
    }),
  );
  const blocked = decisions.filter((line) => line.disposition === 'BLOCKED');
  const postable = decisions.filter((line) => line.disposition === 'POSTABLE');
  const requiredAccountStableIds = Array.from(
    new Set(
      postable.flatMap((line) =>
        line.targetAccountStableId
          ? [
              providerPendingAccount(document.provider),
              line.targetAccountStableId,
            ]
          : [],
      ),
    ),
  ).sort();

  if (blocked.length > 0) {
    return {
      salesAuthority: params.salesAuthority,
      status: 'BLOCKED',
      blockReasons: Array.from(
        new Set(blocked.map((line) => line.reason)),
      ).sort(),
      decisions,
      draftJournal: null,
      debitCents: 0,
      creditCents: 0,
      requiredAccountStableIds,
    };
  }
  if (postable.length === 0) {
    return {
      salesAuthority: params.salesAuthority,
      status: 'NOOP',
      blockReasons: [],
      decisions,
      draftJournal: null,
      debitCents: 0,
      creditCents: 0,
      requiredAccountStableIds,
    };
  }

  const pendingAccount = providerPendingAccount(document.provider);
  const accountNetDebits = new Map<string, number>();
  for (const line of postable) {
    const target = line.targetAccountStableId;
    if (!target) continue;
    addNet(accountNetDebits, pendingAccount, line.amountCents);
    addNet(accountNetDebits, target, -line.amountCents);
  }
  const memo =
    `${document.provider} settlement ${document.documentStableId} ` +
    `r${document.revision}`;
  const lines = toJournalLines(accountNetDebits, memo);
  const debitCents = lines.reduce(
    (sum, line) => sum + (line.debitCents ?? 0),
    0,
  );
  const creditCents = lines.reduce(
    (sum, line) => sum + (line.creditCents ?? 0),
    0,
  );
  if (debitCents !== creditCents) {
    throw new Error(
      `Settlement draft is unbalanced: ${debitCents} != ${creditCents}`,
    );
  }

  return {
    salesAuthority: params.salesAuthority,
    status: 'READY',
    blockReasons: [],
    decisions,
    draftJournal: {
      idempotencyKey: `provider-settlement:${document.documentStableId}:r${document.revision}:v1`,
      kind: AccountingJournalEntryKind.ADJUSTMENT,
      source: AccountingJournalSource.PLATFORM_STATEMENT,
      sourceFactType: PROVIDER_FINANCIAL_SOURCE_FACT_TYPE,
      sourceFactStableId: document.documentStableId,
      sourceFactVersion: document.revision,
      storeStableId: document.storeStableId,
      occurredAt: params.occurredAt.toISOString(),
      currency: document.currency,
      memo,
      lines,
    },
    debitCents,
    creditCents,
    requiredAccountStableIds,
  };
}

export function buildUberPreCutoverOrderReversalDraft(params: {
  entryStableId: string;
  storeStableId: string | null;
  occurredAt: Date;
  currency: string;
  lines: AccountingJournalLineInput[];
}): AccountingJournalCreateInput {
  return {
    idempotencyKey: `uber-pre-cutover-order-reversal:${params.entryStableId}:v1`,
    kind: AccountingJournalEntryKind.ADJUSTMENT,
    source: AccountingJournalSource.SYSTEM,
    sourceFactType: UBER_PRE_CUTOVER_REVERSAL_SOURCE_FACT_TYPE,
    sourceFactStableId: params.entryStableId,
    sourceFactVersion: 1,
    storeStableId: params.storeStableId,
    occurredAt: params.occurredAt.toISOString(),
    currency: params.currency,
    memo: `Reverse pre-cutover manual Uber SALE ${params.entryStableId}`,
    lines: params.lines.map((line) => ({
      accountStableId: line.accountStableId,
      categoryStableId: line.categoryStableId ?? null,
      debitCents: line.creditCents,
      creditCents: line.debitCents,
      memo: `Reverse pre-cutover manual Uber SALE ${params.entryStableId}`,
    })),
  };
}
