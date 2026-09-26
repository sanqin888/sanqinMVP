import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import type { AccountingJournalCreateInput } from './accounting-journal-policy';

export const CLOVER_PRE_SYNC_AUTHORITY_ADJUSTMENT_SOURCE_FACT_TYPE =
  'accounting.clover_pre_sync_authority_adjustment.v1';

export type CloverAuthorityReplacementBlockReason =
  | 'PROVIDER_REFUNDS_PRESENT'
  | 'PROVIDER_SURCHARGE_UNKNOWN'
  | 'ORDER_TIP_REVENUE_EXCEEDS_PROVIDER_TIPS'
  | 'ORDER_SURCHARGE_REVENUE_EXCEEDS_PROVIDER_SURCHARGE'
  | 'STORE_CASH_RECLASSIFICATION_EXCEEDS_ORDER_EVIDENCE'
  | 'UNEXPECTED_ORDER_PENDING_SOURCE_FACT_TYPE'
  | 'INVALID_AMOUNT';

export type CloverAuthorityReplacementPolicyInput = {
  statementDocumentStableId: string;
  authorityFrom: string;
  authorityTo: string;
  occurredAt: string;
  storeStableId: string;
  providerPrincipalCents: number;
  providerTipsCents: number;
  providerSurchargeCents: number | null;
  providerRefundCount: number;
  providerRefundCents: number;
  orderPendingMovementCents: number;
  orderStoreCashMovementCents: number;
  orderTipRevenueCents: number;
  orderSurchargeRevenueCents: number;
  unexpectedOrderPendingSourceFactTypes: string[];
};

export type CloverAuthorityReplacementPolicyResult = {
  status: 'READY' | 'BLOCKED';
  blockReasons: CloverAuthorityReplacementBlockReason[];
  providerPrincipalCents: number;
  orderPendingMovementCents: number;
  pendingAuthorityDeltaCents: number;
  missingTipRevenueCents: number | null;
  missingSurchargeRevenueCents: number | null;
  storeCashReclassificationCents: number | null;
  draftJournal: AccountingJournalCreateInput | null;
};

const CLOVER_PENDING_ACCOUNT_STABLE_ID = 'account_clover_pending';
const STORE_CASH_ACCOUNT_STABLE_ID = 'account_store_cash';
const TIP_REVENUE_ACCOUNT_STABLE_ID = 'account_tip_revenue';
const SURCHARGE_REVENUE_ACCOUNT_STABLE_ID = 'account_card_surcharge_revenue';

const isSafeNonNegative = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;

const isSafeSigned = (value: number): boolean => Number.isSafeInteger(value);

const signedLine = (
  accountStableId: string,
  signedAmountCents: number,
  memo: string,
) => {
  if (signedAmountCents === 0) return null;
  return signedAmountCents > 0
    ? {
        accountStableId,
        debitCents: signedAmountCents,
        creditCents: 0,
        memo,
      }
    : {
        accountStableId,
        debitCents: 0,
        creditCents: -signedAmountCents,
        memo,
      };
};

export function buildCloverAuthorityReplacementPreview(
  input: CloverAuthorityReplacementPolicyInput,
): CloverAuthorityReplacementPolicyResult {
  const blockReasons: CloverAuthorityReplacementBlockReason[] = [];
  const safeValues = [
    input.providerPrincipalCents,
    input.providerTipsCents,
    input.providerRefundCount,
    input.providerRefundCents,
    input.orderStoreCashMovementCents,
    input.orderTipRevenueCents,
    input.orderSurchargeRevenueCents,
  ];
  if (
    safeValues.some((value) => !isSafeNonNegative(value)) ||
    !isSafeSigned(input.orderPendingMovementCents) ||
    (input.providerSurchargeCents !== null &&
      !isSafeNonNegative(input.providerSurchargeCents))
  ) {
    blockReasons.push('INVALID_AMOUNT');
  }
  if (input.providerRefundCount !== 0 || input.providerRefundCents !== 0) {
    blockReasons.push('PROVIDER_REFUNDS_PRESENT');
  }
  if (input.providerSurchargeCents === null) {
    blockReasons.push('PROVIDER_SURCHARGE_UNKNOWN');
  }
  if (input.orderTipRevenueCents > input.providerTipsCents) {
    blockReasons.push('ORDER_TIP_REVENUE_EXCEEDS_PROVIDER_TIPS');
  }
  if (
    input.providerSurchargeCents !== null &&
    input.orderSurchargeRevenueCents > input.providerSurchargeCents
  ) {
    blockReasons.push('ORDER_SURCHARGE_REVENUE_EXCEEDS_PROVIDER_SURCHARGE');
  }
  if (input.unexpectedOrderPendingSourceFactTypes.length > 0) {
    blockReasons.push('UNEXPECTED_ORDER_PENDING_SOURCE_FACT_TYPE');
  }

  const pendingAuthorityDeltaCents =
    input.providerPrincipalCents - input.orderPendingMovementCents;
  if (!Number.isSafeInteger(pendingAuthorityDeltaCents)) {
    blockReasons.push('INVALID_AMOUNT');
  }
  const missingTipRevenueCents =
    input.orderTipRevenueCents <= input.providerTipsCents
      ? input.providerTipsCents - input.orderTipRevenueCents
      : null;
  const missingSurchargeRevenueCents =
    input.providerSurchargeCents !== null &&
    input.orderSurchargeRevenueCents <= input.providerSurchargeCents
      ? input.providerSurchargeCents - input.orderSurchargeRevenueCents
      : null;

  if (
    blockReasons.length > 0 ||
    missingTipRevenueCents === null ||
    missingSurchargeRevenueCents === null
  ) {
    return {
      status: 'BLOCKED',
      blockReasons: [...new Set(blockReasons)],
      providerPrincipalCents: input.providerPrincipalCents,
      orderPendingMovementCents: input.orderPendingMovementCents,
      pendingAuthorityDeltaCents,
      missingTipRevenueCents,
      missingSurchargeRevenueCents,
      storeCashReclassificationCents: null,
      draftJournal: null,
    };
  }

  const storeCashReclassificationCents =
    pendingAuthorityDeltaCents -
    missingTipRevenueCents -
    missingSurchargeRevenueCents;
  if (
    !Number.isSafeInteger(storeCashReclassificationCents) ||
    (storeCashReclassificationCents > 0 &&
      storeCashReclassificationCents > input.orderStoreCashMovementCents)
  ) {
    return {
      status: 'BLOCKED',
      blockReasons: [
        Number.isSafeInteger(storeCashReclassificationCents)
          ? 'STORE_CASH_RECLASSIFICATION_EXCEEDS_ORDER_EVIDENCE'
          : 'INVALID_AMOUNT',
      ],
      providerPrincipalCents: input.providerPrincipalCents,
      orderPendingMovementCents: input.orderPendingMovementCents,
      pendingAuthorityDeltaCents,
      missingTipRevenueCents,
      missingSurchargeRevenueCents,
      storeCashReclassificationCents: null,
      draftJournal: null,
    };
  }

  const lines = [
    signedLine(
      CLOVER_PENDING_ACCOUNT_STABLE_ID,
      pendingAuthorityDeltaCents,
      'Replace Order-declared Clover Pending with provider authority',
    ),
    signedLine(
      STORE_CASH_ACCOUNT_STABLE_ID,
      -storeCashReclassificationCents,
      'Aggregate tender reclassification required by provider authority',
    ),
    signedLine(
      TIP_REVENUE_ACCOUNT_STABLE_ID,
      -missingTipRevenueCents,
      'Provider-proven Clover tips not represented in Order economics',
    ),
    signedLine(
      SURCHARGE_REVENUE_ACCOUNT_STABLE_ID,
      -missingSurchargeRevenueCents,
      'Provider-proven Clover surcharge not represented in Order economics',
    ),
  ].filter((line): line is NonNullable<typeof line> => line !== null);

  const signedTotal = lines.reduce(
    (sum, line) => sum + line.debitCents - line.creditCents,
    0,
  );
  if (signedTotal !== 0) {
    return {
      status: 'BLOCKED',
      blockReasons: ['INVALID_AMOUNT'],
      providerPrincipalCents: input.providerPrincipalCents,
      orderPendingMovementCents: input.orderPendingMovementCents,
      pendingAuthorityDeltaCents,
      missingTipRevenueCents,
      missingSurchargeRevenueCents,
      storeCashReclassificationCents,
      draftJournal: null,
    };
  }

  const sourceFactStableId = [
    input.statementDocumentStableId,
    input.authorityFrom,
    input.authorityTo,
  ].join(':');

  return {
    status: 'READY',
    blockReasons: [],
    providerPrincipalCents: input.providerPrincipalCents,
    orderPendingMovementCents: input.orderPendingMovementCents,
    pendingAuthorityDeltaCents,
    missingTipRevenueCents,
    missingSurchargeRevenueCents,
    storeCashReclassificationCents,
    draftJournal:
      lines.length === 0
        ? null
        : {
            idempotencyKey: `clover-pre-sync-authority-adjustment:${sourceFactStableId}:v1`,
            kind: AccountingJournalEntryKind.ADJUSTMENT,
            source: AccountingJournalSource.PLATFORM_STATEMENT,
            sourceFactType:
              CLOVER_PRE_SYNC_AUTHORITY_ADJUSTMENT_SOURCE_FACT_TYPE,
            sourceFactStableId,
            sourceFactVersion: 1,
            storeStableId: input.storeStableId,
            occurredAt: input.occurredAt,
            currency: 'CAD',
            memo: `Clover pre-sync authority replacement ${input.authorityFrom}..${input.authorityTo}`,
            lines,
          },
  };
}
