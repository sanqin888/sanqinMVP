import {
  AccountingFinancialDocumentType,
  AccountingFinancialProvider,
  AccountingProviderRecognitionMatchMode,
} from './accounting-contracts';

export const ACCOUNTING_PROVIDER_RECOGNITION_PARSER_NAME =
  'accounting-provider-recognition';

const MAX_KEYWORDS_PER_GROUP = 20;
const MAX_KEYWORD_LENGTH = 120;
const MAX_PRIORITY = 10_000;

export type AccountingProviderRecognitionRule = {
  ruleStableId: string;
  provider: AccountingFinancialProvider;
  documentType: AccountingFinancialDocumentType;
  requiredKeywords: string[];
  optionalKeywords: string[];
  optionalMatchMode: AccountingProviderRecognitionMatchMode;
  priority: number;
  isActive: boolean;
  version: number;
  updatedByUserStableId: string | null;
  persisted: boolean;
};

export type AccountingProviderRecognitionRuleUpdate = {
  requiredKeywords: string[];
  optionalKeywords: string[];
  optionalMatchMode: AccountingProviderRecognitionMatchMode;
  priority: number;
  isActive: boolean;
};

export class AccountingProviderRecognitionPolicyError extends Error {}

export const DEFAULT_ACCOUNTING_PROVIDER_RECOGNITION_RULES: ReadonlyArray<AccountingProviderRecognitionRule> =
  [
    {
      ruleStableId: 'acct_recognition_clover_closeout',
      provider: AccountingFinancialProvider.CLOVER,
      documentType: AccountingFinancialDocumentType.BATCH_CONTROL,
      requiredKeywords: ['Closeout Batch Report', 'Batch Totals', 'Batch ID:'],
      optionalKeywords: [],
      optionalMatchMode: AccountingProviderRecognitionMatchMode.ANY,
      priority: 100,
      isActive: true,
      version: 1,
      updatedByUserStableId: null,
      persisted: false,
    },
    {
      ruleStableId: 'acct_recognition_clover_statement',
      provider: AccountingFinancialProvider.CLOVER,
      documentType: AccountingFinancialDocumentType.STATEMENT,
      requiredKeywords: [
        'MERCHANT CARD PROCESSING STATEMENT LOCATION RECAP',
        'StatementPeriod',
        'Total Amount Funded',
      ],
      optionalKeywords: [],
      optionalMatchMode: AccountingProviderRecognitionMatchMode.ANY,
      priority: 110,
      isActive: true,
      version: 1,
      updatedByUserStableId: null,
      persisted: false,
    },
    {
      ruleStableId: 'acct_recognition_uber_monthly_statement',
      provider: AccountingFinancialProvider.UBER_EATS,
      documentType: AccountingFinancialDocumentType.STATEMENT,
      requiredKeywords: ['Monthly Statement', 'Consolidated Monthly Summary'],
      optionalKeywords: ['Marketplace Fees', 'Net Total'],
      optionalMatchMode: AccountingProviderRecognitionMatchMode.ALL,
      priority: 200,
      isActive: true,
      version: 1,
      updatedByUserStableId: null,
      persisted: false,
    },
    {
      ruleStableId: 'acct_recognition_fantuan_statement',
      provider: AccountingFinancialProvider.FANTUAN,
      documentType: AccountingFinancialDocumentType.STATEMENT,
      requiredKeywords: ['Total Transfer Amount'],
      optionalKeywords: [
        'Fantuan Subsidy for Promotion events',
        'Commission GST/HST',
      ],
      optionalMatchMode: AccountingProviderRecognitionMatchMode.ALL,
      priority: 300,
      isActive: true,
      version: 1,
      updatedByUserStableId: null,
      persisted: false,
    },
  ];

export function getDefaultAccountingProviderRecognitionRule(
  ruleStableId: string,
): AccountingProviderRecognitionRule {
  const rule = DEFAULT_ACCOUNTING_PROVIDER_RECOGNITION_RULES.find(
    (candidate) => candidate.ruleStableId === ruleStableId,
  );
  if (!rule) {
    throw new AccountingProviderRecognitionPolicyError(
      'unknown provider recognition rule',
    );
  }
  return rule;
}

export function mergeAccountingProviderRecognitionRules(
  persistedRules: ReadonlyArray<
    Omit<AccountingProviderRecognitionRule, 'persisted'>
  >,
): AccountingProviderRecognitionRule[] {
  const persistedByStableId = new Map(
    persistedRules.map((rule) => [rule.ruleStableId, rule]),
  );
  return DEFAULT_ACCOUNTING_PROVIDER_RECOGNITION_RULES.map((defaultRule) => {
    const persisted = persistedByStableId.get(defaultRule.ruleStableId);
    if (persisted) {
      if (
        persisted.provider !== defaultRule.provider ||
        persisted.documentType !== defaultRule.documentType
      ) {
        throw new AccountingProviderRecognitionPolicyError(
          `provider recognition identity mismatch for ${defaultRule.ruleStableId}`,
        );
      }
      return { ...persisted, persisted: true };
    }
    return {
      ...defaultRule,
      requiredKeywords: [...defaultRule.requiredKeywords],
      optionalKeywords: [...defaultRule.optionalKeywords],
    };
  }).sort(compareRecognitionRules);
}

export function normalizeAccountingProviderRecognitionRuleUpdate(
  ruleStableId: string,
  input: AccountingProviderRecognitionRuleUpdate,
): AccountingProviderRecognitionRuleUpdate {
  getDefaultAccountingProviderRecognitionRule(ruleStableId);
  const requiredKeywords = normalizeKeywords(
    input.requiredKeywords,
    'requiredKeywords',
  );
  const optionalKeywords = normalizeKeywords(
    input.optionalKeywords,
    'optionalKeywords',
  );
  if (typeof input.isActive !== 'boolean') {
    throw new AccountingProviderRecognitionPolicyError(
      'isActive must be a boolean',
    );
  }
  if (
    input.isActive &&
    requiredKeywords.length === 0 &&
    optionalKeywords.length === 0
  ) {
    throw new AccountingProviderRecognitionPolicyError(
      'an active recognition rule requires at least one keyword',
    );
  }
  if (
    !Object.values(AccountingProviderRecognitionMatchMode).includes(
      input.optionalMatchMode,
    )
  ) {
    throw new AccountingProviderRecognitionPolicyError(
      'invalid optional keyword match mode',
    );
  }
  if (
    !Number.isInteger(input.priority) ||
    input.priority < 0 ||
    input.priority > MAX_PRIORITY
  ) {
    throw new AccountingProviderRecognitionPolicyError(
      `priority must be an integer between 0 and ${MAX_PRIORITY}`,
    );
  }
  return {
    requiredKeywords,
    optionalKeywords,
    optionalMatchMode: input.optionalMatchMode,
    priority: input.priority,
    isActive: input.isActive,
  };
}

export function matchAccountingProviderRecognitionRule(
  text: string,
  rules: ReadonlyArray<AccountingProviderRecognitionRule>,
): {
  rule: AccountingProviderRecognitionRule | null;
  ambiguousRuleStableIds: string[];
  matchedRequiredKeywords: string[];
  matchedOptionalKeywords: string[];
} {
  const normalizedText = normalizeRecognitionText(text);
  if (!normalizedText) {
    return {
      rule: null,
      ambiguousRuleStableIds: [],
      matchedRequiredKeywords: [],
      matchedOptionalKeywords: [],
    };
  }

  const matched = rules
    .filter((rule) => rule.isActive)
    .map((rule) => {
      const matchedRequiredKeywords = rule.requiredKeywords.filter((keyword) =>
        normalizedText.includes(normalizeRecognitionText(keyword)),
      );
      if (matchedRequiredKeywords.length !== rule.requiredKeywords.length) {
        return null;
      }
      const matchedOptionalKeywords = rule.optionalKeywords.filter((keyword) =>
        normalizedText.includes(normalizeRecognitionText(keyword)),
      );
      if (rule.optionalKeywords.length) {
        const optionalSatisfied =
          rule.optionalMatchMode === AccountingProviderRecognitionMatchMode.ALL
            ? matchedOptionalKeywords.length === rule.optionalKeywords.length
            : matchedOptionalKeywords.length > 0;
        if (!optionalSatisfied) return null;
      }
      return { rule, matchedRequiredKeywords, matchedOptionalKeywords };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> =>
      Boolean(candidate),
    )
    .sort((left, right) => compareRecognitionRules(left.rule, right.rule));

  const first = matched[0];
  if (!first) {
    return {
      rule: null,
      ambiguousRuleStableIds: [],
      matchedRequiredKeywords: [],
      matchedOptionalKeywords: [],
    };
  }
  const topPriorityMatches = matched.filter(
    (candidate) => candidate.rule.priority === first.rule.priority,
  );
  if (topPriorityMatches.length > 1) {
    return {
      rule: null,
      ambiguousRuleStableIds: topPriorityMatches.map(
        (candidate) => candidate.rule.ruleStableId,
      ),
      matchedRequiredKeywords: [],
      matchedOptionalKeywords: [],
    };
  }
  return {
    rule: first.rule,
    ambiguousRuleStableIds: [],
    matchedRequiredKeywords: first.matchedRequiredKeywords,
    matchedOptionalKeywords: first.matchedOptionalKeywords,
  };
}

export function providerRecognitionParserVersion(
  rule: AccountingProviderRecognitionRule,
): string {
  return `${rule.ruleStableId}:v${rule.version}`;
}

function normalizeKeywords(value: string[], fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new AccountingProviderRecognitionPolicyError(
      `${fieldName} must be an array`,
    );
  }
  if (value.length > MAX_KEYWORDS_PER_GROUP) {
    throw new AccountingProviderRecognitionPolicyError(
      `${fieldName} supports at most ${MAX_KEYWORDS_PER_GROUP} keywords`,
    );
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') {
      throw new AccountingProviderRecognitionPolicyError(
        `${fieldName} must contain only strings`,
      );
    }
    const keyword = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (!keyword) continue;
    if (keyword.length > MAX_KEYWORD_LENGTH) {
      throw new AccountingProviderRecognitionPolicyError(
        `${fieldName} keywords must be ${MAX_KEYWORD_LENGTH} characters or fewer`,
      );
    }
    const dedupeKey = keyword.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    normalized.push(keyword);
  }
  return normalized;
}

function normalizeRecognitionText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function compareRecognitionRules(
  left: Pick<AccountingProviderRecognitionRule, 'priority' | 'ruleStableId'>,
  right: Pick<AccountingProviderRecognitionRule, 'priority' | 'ruleStableId'>,
) {
  return (
    left.priority - right.priority ||
    left.ruleStableId.localeCompare(right.ruleStableId)
  );
}
