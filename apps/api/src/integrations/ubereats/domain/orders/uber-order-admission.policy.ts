import type { UberOrderPayloadParseResult } from './uber-order-payload.parser';

type InvalidOrderReason = Extract<
  UberOrderPayloadParseResult,
  { kind: 'invalid' }
>['reason'];

export type UberOrderAdmissionDenial = {
  reasonCode:
    | 'INVALID_ORDER'
    | 'ITEM_UNAVAILABLE'
    | 'PRICE_MISMATCH'
    | 'POS_OFFLINE'
    | 'SPECIAL_INSTRUCTIONS';
  reasonDetail: string;
};

export type UberOrderAdmissionDecision =
  | { kind: 'ACCEPT' }
  | { kind: 'DENY'; denial: UberOrderAdmissionDenial };

export type UberOrderAdmissionFacts = {
  missingItemReference: string | null;
  hasPriceMismatch: boolean;
  hasMaterialAmountVariance: boolean;
  connectivity: {
    status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
    lastHeartbeatAt: Date | null;
  };
};

/** Pure business policy for deciding whether an incoming Uber order is admissible. */
export class UberOrderAdmissionPolicy {
  invalidDetail(reason: InvalidOrderReason): UberOrderAdmissionDecision {
    if (reason === 'UNRELAYABLE_CUSTOMER_REQUEST') {
      return {
        kind: 'DENY',
        denial: {
          reasonCode: 'SPECIAL_INSTRUCTIONS',
          reasonDetail: 'Uber customer request cannot be fully relayed to POS',
        },
      };
    }

    const reasonDetail =
      reason === 'EMPTY_ITEMS'
        ? '订单不包含可导入商品'
        : reason === 'MISSING_ORDER_ID'
          ? '订单缺少 Uber order id'
          : reason === 'MISSING_TOTAL'
            ? '订单缺少订单金额'
            : '订单详情无法解析';
    return {
      kind: 'DENY',
      denial: { reasonCode: 'INVALID_ORDER', reasonDetail },
    };
  }

  evaluateAllergyRequest(facts: {
    hasRequest: boolean;
    allergens: string[];
    policy: {
      mode: 'RELAY_ALL' | 'DENY_LIST' | 'DENY_ALL';
      unsupportedAllergens: string[];
    };
  }): UberOrderAdmissionDecision {
    if (!facts.hasRequest || facts.policy.mode === 'RELAY_ALL') {
      return { kind: 'ACCEPT' };
    }

    const requested = [
      ...new Set(
        facts.allergens
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean),
      ),
    ];
    const unsupported = new Set(
      facts.policy.unsupportedAllergens
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
    );
    const blocked = requested.filter((value) => unsupported.has(value));
    if (facts.policy.mode === 'DENY_LIST' && blocked.length === 0) {
      return { kind: 'ACCEPT' };
    }

    const reasonDetail =
      facts.policy.mode === 'DENY_ALL'
        ? requested.length > 0
          ? `Store cannot safely accommodate allergy request: ${requested.join(', ')}`
          : 'Store cannot safely accommodate allergy request'
        : `Store cannot safely accommodate requested allergen(s): ${blocked.join(', ')}`;
    return {
      kind: 'DENY',
      denial: {
        reasonCode: 'SPECIAL_INSTRUCTIONS',
        reasonDetail,
      },
    };
  }

  evaluate(facts: UberOrderAdmissionFacts): UberOrderAdmissionDecision {
    if (facts.missingItemReference) {
      return {
        kind: 'DENY',
        denial: {
          reasonCode: 'ITEM_UNAVAILABLE',
          reasonDetail:
            facts.missingItemReference === 'MISSING_EXTERNAL_ITEM_ID'
              ? '订单商品缺少 Uber item id'
              : `缺失菜单映射: ${facts.missingItemReference}`,
        },
      };
    }
    if (facts.hasPriceMismatch || facts.hasMaterialAmountVariance) {
      return {
        kind: 'DENY',
        denial: {
          reasonCode: 'PRICE_MISMATCH',
          reasonDetail: '订单金额与已发布菜单不一致',
        },
      };
    }
    if (facts.connectivity.status === 'OFFLINE') {
      return {
        kind: 'DENY',
        denial: {
          reasonCode: 'POS_OFFLINE',
          reasonDetail: facts.connectivity.lastHeartbeatAt
            ? `POS connectivity offline; last heartbeat ${facts.connectivity.lastHeartbeatAt.toISOString()}`
            : 'POS connectivity offline; no recent heartbeat',
        },
      };
    }
    return { kind: 'ACCEPT' };
  }
}
