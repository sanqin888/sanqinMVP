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
import { FANTUAN_ADJUSTMENT_RAW_CODES } from './accounting-fantuan-adjustment-detail.contract';
import { CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID } from './accounting-provider-fee-clearing.contract';
import {
  CLOVER_MONTHLY_EQUIPMENT_CATEGORY_STABLE_ID,
  CLOVER_STATEMENT_RAW_CODES,
} from './accounting-clover-statement.contract';
import {
  ACCOUNTING_PROVIDER_PENDING_ACCOUNT_IDS,
  providerPendingAccountStableId,
} from './accounting-provider-accounts';

export const PROVIDER_SETTLEMENT_SYSTEM_ACTOR =
  'system:accounting-provider-settlement';
export const PROVIDER_FINANCIAL_SOURCE_FACT_TYPE =
  'accounting.provider_financial_document.v1';
export const UBER_PRE_CUTOVER_REVERSAL_SOURCE_FACT_TYPE =
  'accounting.uber_pre_cutover_order_reversal.v1';

export const PROVIDER_SETTLEMENT_CATEGORY_IDS = {
  cloverMonthlyEquipment: CLOVER_MONTHLY_EQUIPMENT_CATEGORY_STABLE_ID,
} as const;

export const PROVIDER_SETTLEMENT_ACCOUNT_IDS = {
  primaryBank: 'account_primary_bank',
  cloverPending:
    ACCOUNTING_PROVIDER_PENDING_ACCOUNT_IDS[AccountingFinancialProvider.CLOVER],
  cloverFeePayable: CLOVER_FEE_PAYABLE_ACCOUNT_STABLE_ID,
  uberPending:
    ACCOUNTING_PROVIDER_PENDING_ACCOUNT_IDS[
      AccountingFinancialProvider.UBER_EATS
    ],
  fantuanPending:
    ACCOUNTING_PROVIDER_PENDING_ACCOUNT_IDS[
      AccountingFinancialProvider.FANTUAN
    ],
  hstPayable: 'account_hst_payable',
  hstRecoverable: 'account_hst_recoverable',
  salesRevenue: 'account_sales_revenue',
  tipRevenue: 'account_tip_revenue',
  otherOperatingRevenue: 'account_other_operating_revenue',
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
  [PROVIDER_SETTLEMENT_ACCOUNT_IDS.cloverFeePayable]: {
    accountClass: AccountingAccountClass.LIABILITY,
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
  [PROVIDER_SETTLEMENT_ACCOUNT_IDS.otherOperatingRevenue]: {
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
  targetCategoryStableId: string | null;
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
    rawCode?: string | null;
    rawName: string | null;
    component: AccountingFinancialComponent;
    postingTreatment: AccountingFinancialPostingTreatment;
    amountCents: number;
  }>;
};

export type ProviderSettlementControlTotalCheck = {
  key:
    | 'UBER_TOTAL_EARNINGS'
    | 'UBER_TOTAL_FEES'
    | 'UBER_TOTAL_MARKETING'
    | 'UBER_TOTAL_AMENDMENTS'
    | 'UBER_NET_TOTAL'
    | 'CLOVER_FEES_DETAIL';
  status: 'MATCHED' | 'MISMATCH' | 'INCOMPLETE';
  controlRawName: string;
  controlLineStableId: string | null;
  expectedCents: number | null;
  calculatedCents: number | null;
  deltaCents: number | null;
};

export type ProviderSettlementDocumentPlan = {
  salesAuthority: ProviderSalesAuthority;
  status: 'READY' | 'BLOCKED' | 'NOOP';
  blockReasons: string[];
  controlTotalChecks: ProviderSettlementControlTotalCheck[];
  decisions: ProviderSettlementLineDecision[];
  draftJournal: AccountingJournalCreateInput | null;
  debitCents: number;
  creditCents: number;
  requiredAccountStableIds: string[];
};

const providerPendingAccount = providerPendingAccountStableId;

const CLOVER_FEE_COMPONENTS = new Set<AccountingFinancialComponent>([
  AccountingFinancialComponent.PROCESSING_FEE,
  AccountingFinancialComponent.PROCESSING_FEE_TAX,
  AccountingFinancialComponent.PLATFORM_OTHER_FEE,
  AccountingFinancialComponent.PLATFORM_OTHER_FEE_TAX,
]);

const settlementCounterpartyAccountFor = (params: {
  document: ProviderSettlementDocumentInput;
  line: ProviderSettlementLineDecision;
}): string => {
  if (
    params.document.provider === AccountingFinancialProvider.CLOVER &&
    params.document.documentType ===
      AccountingFinancialDocumentType.STATEMENT &&
    CLOVER_FEE_COMPONENTS.has(params.line.component)
  ) {
    return PROVIDER_SETTLEMENT_ACCOUNT_IDS.cloverFeePayable;
  }
  return providerPendingAccount(params.document.provider);
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

const targetAccountFor = (params: {
  provider: AccountingFinancialProvider;
  line: ProviderSettlementDocumentInput['lines'][number];
}): string | null => {
  const { provider, line } = params;
  if (
    provider === AccountingFinancialProvider.FANTUAN &&
    line.component === AccountingFinancialComponent.ADJUSTMENT
  ) {
    if (line.rawCode === FANTUAN_ADJUSTMENT_RAW_CODES.COMPENSATION) {
      return PROVIDER_SETTLEMENT_ACCOUNT_IDS.otherOperatingRevenue;
    }
    if (line.rawCode === FANTUAN_ADJUSTMENT_RAW_CODES.DEDUCTION) {
      return PROVIDER_SETTLEMENT_ACCOUNT_IDS.chargebackAdjustmentExpense;
    }
  }
  switch (line.component) {
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

const targetCategoryFor = (params: {
  provider: AccountingFinancialProvider;
  line: ProviderSettlementDocumentInput['lines'][number];
}): string | null =>
  params.provider === AccountingFinancialProvider.CLOVER &&
  params.line.rawCode === CLOVER_STATEMENT_RAW_CODES.MONTHLY_EQUIPMENT_BILL
    ? PROVIDER_SETTLEMENT_CATEGORY_IDS.cloverMonthlyEquipment
    : null;

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
      targetCategoryStableId: null,
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
      targetCategoryStableId: null,
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
      targetCategoryStableId: null,
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
      targetCategoryStableId: null,
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
        targetCategoryStableId: null,
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
        targetCategoryStableId: null,
      };
    }
  }
  if (line.component === AccountingFinancialComponent.REFUND) {
    return {
      ...line,
      disposition: 'RECONCILIATION_ONLY',
      reason: 'REFUND_REQUIRES_CANONICAL_CHANGE_OR_PROVIDER_REVERSAL_EVIDENCE',
      targetAccountStableId: null,
      targetCategoryStableId: null,
    };
  }

  const targetAccountStableId = targetAccountFor({
    provider: params.provider,
    line,
  });
  if (!targetAccountStableId) {
    return {
      ...line,
      disposition: 'BLOCKED',
      reason: 'UNMAPPED_PROVIDER_COMPONENT',
      targetAccountStableId: null,
      targetCategoryStableId: null,
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
    targetCategoryStableId: targetCategoryFor({
      provider: params.provider,
      line,
    }),
  };
}

type SettlementJournalBucket = {
  accountStableId: string;
  categoryStableId: string | null;
  netDebitCents: number;
};

const settlementJournalBucketKey = (
  accountStableId: string,
  categoryStableId: string | null,
) => `${accountStableId}\u0000${categoryStableId ?? ''}`;

const addNet = (
  target: Map<string, SettlementJournalBucket>,
  accountStableId: string,
  categoryStableId: string | null,
  value: number,
) => {
  const key = settlementJournalBucketKey(accountStableId, categoryStableId);
  const current = target.get(key);
  const next = (current?.netDebitCents ?? 0) + value;
  if (!Number.isSafeInteger(next)) {
    throw new Error(
      `Settlement account total exceeds safe integer range: ${accountStableId}`,
    );
  }
  target.set(key, {
    accountStableId,
    categoryStableId,
    netDebitCents: next,
  });
};

const toJournalLines = (
  accountNetDebits: Map<string, SettlementJournalBucket>,
  memo: string,
): AccountingJournalLineInput[] =>
  Array.from(accountNetDebits.values())
    .filter((bucket) => bucket.netDebitCents !== 0)
    .sort(
      (left, right) =>
        left.accountStableId.localeCompare(right.accountStableId) ||
        (left.categoryStableId ?? '').localeCompare(
          right.categoryStableId ?? '',
        ),
    )
    .map((bucket) => ({
      accountStableId: bucket.accountStableId,
      categoryStableId: bucket.categoryStableId,
      debitCents: bucket.netDebitCents > 0 ? bucket.netDebitCents : 0,
      creditCents: bucket.netDebitCents < 0 ? -bucket.netDebitCents : 0,
      memo,
    }));

type UberControlTotalRule = {
  key: ProviderSettlementControlTotalCheck['key'];
  controlRawName: string;
  componentRawNames: readonly string[];
  requireEveryComponent: boolean;
};

const UBER_CONTROL_TOTAL_RULES: readonly UberControlTotalRule[] = [
  {
    key: 'UBER_TOTAL_EARNINGS',
    controlRawName: 'Total Earnings',
    componentRawNames: [
      'Sales',
      'Tax on Sales',
      'Tips',
      'Container Fees',
      'Tax on Container Fees',
      'Other Earnings',
      'Tax on Other Earnings',
    ],
    requireEveryComponent: false,
  },
  {
    key: 'UBER_TOTAL_FEES',
    controlRawName: 'Total Uber Fees',
    componentRawNames: [
      'Marketplace Fees',
      'Tax on Marketplace Fees',
      'Other Charges',
      'Tax On Other Charges',
    ],
    requireEveryComponent: false,
  },
  {
    key: 'UBER_TOTAL_MARKETING',
    controlRawName: 'Total Marketing Spends',
    componentRawNames: [
      'Offers On Items',
      'Provider Subsidy',
      'Marketing Adjustment',
      'Other Offer Charges',
      'Tax on offer spends',
      'Ad Spends',
      'Ad Credits',
      'Tax on Net Ad Spends',
    ],
    requireEveryComponent: false,
  },
  {
    key: 'UBER_TOTAL_AMENDMENTS',
    controlRawName: 'Total Amendments',
    componentRawNames: [
      'Net Chargeback Amount',
      'Net Tax On Chargeback',
      'Marketplace Facilitator Tax',
      'Adjustments',
      'Tax On Adjustments',
    ],
    requireEveryComponent: false,
  },
  {
    key: 'UBER_NET_TOTAL',
    controlRawName: 'Net Total',
    componentRawNames: [
      'Total Earnings',
      'Total Uber Fees',
      'Total Marketing Spends',
      'Total Amendments',
    ],
    requireEveryComponent: true,
  },
] as const;

const normalizeControlRawName = (rawName: string | null): string =>
  rawName?.trim().toLowerCase() ?? '';

const sumControlAmounts = (
  lines: ProviderSettlementDocumentInput['lines'],
  rawNames: readonly string[],
): number => {
  const accepted = new Set(rawNames.map((name) => name.toLowerCase()));
  let total = 0;
  for (const line of lines) {
    if (!accepted.has(normalizeControlRawName(line.rawName))) continue;
    const next = total + line.amountCents;
    if (!Number.isSafeInteger(next)) {
      throw new Error('Provider control total exceeds safe integer range');
    }
    total = next;
  }
  return total;
};

const CLOVER_FEES_DETAIL_RAW_CODES = new Set<string>([
  CLOVER_STATEMENT_RAW_CODES.MONTHLY_EQUIPMENT_BILL,
  CLOVER_STATEMENT_RAW_CODES.MONTHLY_EQUIPMENT_BILL_HST,
  CLOVER_STATEMENT_RAW_CODES.NETWORK_FEES,
  CLOVER_STATEMENT_RAW_CODES.NETWORK_FEES_HST,
  CLOVER_STATEMENT_RAW_CODES.UNCLASSIFIED_FEES,
]);

const buildCloverFeesControlTotalChecks = (
  document: ProviderSettlementDocumentInput,
): ProviderSettlementControlTotalCheck[] => {
  if (
    document.provider !== AccountingFinancialProvider.CLOVER ||
    document.documentType !== AccountingFinancialDocumentType.STATEMENT
  ) {
    return [];
  }

  const controlLines = document.lines.filter(
    (line) => line.rawCode === CLOVER_STATEMENT_RAW_CODES.FEES_TOTAL,
  );
  if (controlLines.length === 0) return [];

  const detailLines = document.lines.filter(
    (line) =>
      typeof line.rawCode === 'string' &&
      CLOVER_FEES_DETAIL_RAW_CODES.has(line.rawCode),
  );
  let calculatedCents = 0;
  for (const line of detailLines) {
    const next = calculatedCents + line.amountCents;
    if (!Number.isSafeInteger(next)) {
      throw new Error('Clover Fees control total exceeds safe integer range');
    }
    calculatedCents = next;
  }

  const controlLine = controlLines.length === 1 ? controlLines[0] : null;
  const detailsComplete =
    detailLines.length > 0 || controlLine?.amountCents === 0;
  if (!controlLine || !detailsComplete) {
    return [
      {
        key: 'CLOVER_FEES_DETAIL',
        status: 'INCOMPLETE',
        controlRawName: 'Fees',
        controlLineStableId: controlLine?.lineStableId ?? null,
        expectedCents: controlLine?.amountCents ?? null,
        calculatedCents,
        deltaCents: null,
      },
    ];
  }

  const deltaCents = calculatedCents - controlLine.amountCents;
  if (!Number.isSafeInteger(deltaCents)) {
    throw new Error(
      'Clover Fees control total delta exceeds safe integer range',
    );
  }
  return [
    {
      key: 'CLOVER_FEES_DETAIL',
      status: deltaCents === 0 ? 'MATCHED' : 'MISMATCH',
      controlRawName: 'Fees',
      controlLineStableId: controlLine.lineStableId,
      expectedCents: controlLine.amountCents,
      calculatedCents,
      deltaCents,
    },
  ];
};

// Reconcile source controls before posting disposition changes which lines are
// POSTABLE. A balanced draft Journal alone cannot prove extraction integrity.
const buildProviderControlTotalChecks = (
  document: ProviderSettlementDocumentInput,
): ProviderSettlementControlTotalCheck[] => {
  const cloverChecks = buildCloverFeesControlTotalChecks(document);
  if (cloverChecks.length > 0) return cloverChecks;
  if (
    document.provider !== AccountingFinancialProvider.UBER_EATS ||
    document.documentType !== AccountingFinancialDocumentType.STATEMENT
  ) {
    return [];
  }

  return UBER_CONTROL_TOTAL_RULES.map((rule) => {
    const controlLines = document.lines.filter(
      (line) =>
        normalizeControlRawName(line.rawName) ===
        rule.controlRawName.toLowerCase(),
    );
    const componentPresence = rule.componentRawNames.map((rawName) =>
      document.lines.filter(
        (line) =>
          normalizeControlRawName(line.rawName) === rawName.toLowerCase(),
      ),
    );
    const componentsComplete =
      !rule.requireEveryComponent ||
      componentPresence.every((matches) => matches.length === 1);
    const calculatedCents = sumControlAmounts(
      document.lines,
      rule.componentRawNames,
    );

    if (controlLines.length !== 1 || !componentsComplete) {
      return {
        key: rule.key,
        status: 'INCOMPLETE' as const,
        controlRawName: rule.controlRawName,
        controlLineStableId:
          controlLines.length === 1
            ? (controlLines[0]?.lineStableId ?? null)
            : null,
        expectedCents:
          controlLines.length === 1
            ? (controlLines[0]?.amountCents ?? null)
            : null,
        calculatedCents,
        deltaCents: null,
      };
    }

    const controlLine = controlLines[0];
    if (!controlLine) {
      throw new Error('Provider control total line missing after validation');
    }
    const deltaCents = calculatedCents - controlLine.amountCents;
    if (!Number.isSafeInteger(deltaCents)) {
      throw new Error(
        'Provider control total delta exceeds safe integer range',
      );
    }
    return {
      key: rule.key,
      status: deltaCents === 0 ? ('MATCHED' as const) : ('MISMATCH' as const),
      controlRawName: rule.controlRawName,
      controlLineStableId: controlLine.lineStableId,
      expectedCents: controlLine.amountCents,
      calculatedCents,
      deltaCents,
    };
  });
};

export function buildProviderSettlementDocumentPlan(params: {
  document: ProviderSettlementDocumentInput;
  salesAuthority: ProviderSalesAuthority;
  occurredAt: Date;
}): ProviderSettlementDocumentPlan {
  const { document } = params;
  const controlTotalChecks = buildProviderControlTotalChecks(document);
  const controlBlockReasons = [
    ...(controlTotalChecks.some((check) => check.status === 'MISMATCH')
      ? ['PROVIDER_CONTROL_TOTAL_MISMATCH']
      : []),
    ...(controlTotalChecks.some((check) => check.status === 'INCOMPLETE')
      ? ['PROVIDER_CONTROL_TOTAL_INCOMPLETE']
      : []),
  ];
  if (document.currency !== 'CAD') {
    return {
      salesAuthority: params.salesAuthority,
      status: 'BLOCKED',
      blockReasons: ['UNSUPPORTED_CURRENCY', ...controlBlockReasons].sort(),
      controlTotalChecks,
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
              settlementCounterpartyAccountFor({ document, line }),
              line.targetAccountStableId,
            ]
          : [],
      ),
    ),
  ).sort();

  if (blocked.length > 0 || controlBlockReasons.length > 0) {
    return {
      salesAuthority: params.salesAuthority,
      status: 'BLOCKED',
      blockReasons: Array.from(
        new Set([
          ...blocked.map((line) => line.reason),
          ...controlBlockReasons,
        ]),
      ).sort(),
      controlTotalChecks,
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
      controlTotalChecks,
      decisions,
      draftJournal: null,
      debitCents: 0,
      creditCents: 0,
      requiredAccountStableIds,
    };
  }

  const accountNetDebits = new Map<string, SettlementJournalBucket>();
  for (const line of postable) {
    const target = line.targetAccountStableId;
    if (!target) continue;
    const counterparty = settlementCounterpartyAccountFor({ document, line });
    addNet(accountNetDebits, counterparty, null, line.amountCents);
    addNet(
      accountNetDebits,
      target,
      line.targetCategoryStableId,
      -line.amountCents,
    );
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
    controlTotalChecks,
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
