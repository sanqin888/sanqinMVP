export const PROMOTION_RULE_MANAGEMENT = Symbol('PROMOTION_RULE_MANAGEMENT');

export type PromotionRuleType =
  | 'PERCENTAGE_OFF'
  | 'FIXED_AMOUNT_OFF'
  | 'BUY_X_GET_Y'
  | 'FREE_ITEM'
  | 'LOYALTY_MULTIPLIER';

export type PromotionRuleStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';

export type PromotionRuleStackingPolicy = 'EXCLUSIVE' | 'STACKABLE';

export type PromotionRuleChannel = 'web' | 'in_store' | 'ubereats';

export type PromotionRuleManagementInput = {
  stableId?: string;
  titleZh: string;
  titleEn?: string | null;
  description?: string | null;
  type: PromotionRuleType;
  status?: PromotionRuleStatus;
  priority?: number;
  stackingPolicy?: PromotionRuleStackingPolicy;
  excludesCoupons?: boolean;
  excludesItemPromotions?: boolean;
  channels?: PromotionRuleChannel[];
  validFrom?: string | null;
  validTo?: string | null;
  weekdays?: number[];
  startMinutes?: number | null;
  endMinutes?: number | null;
  config: unknown;
};

export type PromotionRuleManagementDto = {
  stableId: string;
  titleZh: string;
  titleEn: string | null;
  description: string | null;
  type: PromotionRuleType;
  status: PromotionRuleStatus;
  priority: number;
  stackingPolicy: PromotionRuleStackingPolicy;
  excludesCoupons: boolean;
  excludesItemPromotions: boolean;
  channels: PromotionRuleChannel[];
  validFrom: string | null;
  validTo: string | null;
  weekdays: number[];
  startMinutes: number | null;
  endMinutes: number | null;
  config: unknown;
};

export type PromotionRuleJsonValue =
  | string
  | number
  | boolean
  | PromotionRuleJsonObject
  | PromotionRuleJsonValue[];

export type PromotionRuleJsonObject = {
  [key: string]: PromotionRuleJsonValue;
};

export type PromotionRuleWriteModel = {
  titleZh: string;
  titleEn: string | null;
  description: string | null;
  type: PromotionRuleType;
  status: PromotionRuleStatus;
  priority: number;
  stackingPolicy: PromotionRuleStackingPolicy;
  excludesCoupons: boolean;
  excludesItemPromotions: boolean;
  channels: PromotionRuleChannel[];
  validFrom: Date | null;
  validTo: Date | null;
  weekdays: number[];
  startMinutes: number | null;
  endMinutes: number | null;
  config: PromotionRuleJsonObject;
};

export interface PromotionRuleManagementPort {
  listRules(): Promise<PromotionRuleManagementDto[]>;
  getRule(stableId: string): Promise<PromotionRuleManagementDto>;
  createRule(
    input: PromotionRuleManagementInput,
  ): Promise<PromotionRuleManagementDto>;
  updateRule(
    stableId: string,
    input: PromotionRuleManagementInput,
  ): Promise<PromotionRuleManagementDto>;
  deleteRule(stableId: string): Promise<PromotionRuleManagementDto>;
}
