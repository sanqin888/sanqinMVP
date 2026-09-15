import {
  AccountingFinancialDocumentType,
  AccountingFinancialProvider,
  AccountingProviderRecognitionMatchMode,
} from '@prisma/client';
import {
  DEFAULT_ACCOUNTING_PROVIDER_RECOGNITION_RULES,
  matchAccountingProviderRecognitionRule,
  mergeAccountingProviderRecognitionRules,
  normalizeAccountingProviderRecognitionRuleUpdate,
} from './accounting-provider-recognition.policy';

describe('Accounting provider recognition policy', () => {
  it('preserves the current Uber recognition behavior through the default editable rule', () => {
    const matched = matchAccountingProviderRecognitionRule(
      `
Monthly
Statement
Consolidated Monthly Summary
Marketplace Fees -$619.12
Net Total $1,222.85
`,
      DEFAULT_ACCOUNTING_PROVIDER_RECOGNITION_RULES,
    );

    expect(matched.rule).toEqual(
      expect.objectContaining({
        ruleStableId: 'acct_recognition_uber_monthly_statement',
        provider: AccountingFinancialProvider.UBER_EATS,
        documentType: AccountingFinancialDocumentType.STATEMENT,
      }) as unknown,
    );
    expect(matched.matchedRequiredKeywords).toEqual([
      'Monthly Statement',
      'Consolidated Monthly Summary',
    ]);
    expect(matched.matchedOptionalKeywords).toEqual([
      'Marketplace Fees',
      'Net Total',
    ]);
  });

  it('supports operator-edited optional ANY matching without changing provider ownership', () => {
    const rules = mergeAccountingProviderRecognitionRules([
      {
        ruleStableId: 'acct_recognition_uber_monthly_statement',
        provider: AccountingFinancialProvider.UBER_EATS,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        requiredKeywords: ['Monthly Statement'],
        optionalKeywords: ['Marketplace Fees', 'Net Total'],
        optionalMatchMode: AccountingProviderRecognitionMatchMode.ANY,
        priority: 25,
        isActive: true,
        version: 4,
        updatedByUserStableId: 'user_1',
      },
    ]);

    const matched = matchAccountingProviderRecognitionRule(
      'Monthly Statement\nMarketplace Fees -$10.00',
      rules,
    );
    expect(matched.rule).toEqual(
      expect.objectContaining({
        provider: AccountingFinancialProvider.UBER_EATS,
        documentType: AccountingFinancialDocumentType.STATEMENT,
        version: 4,
        priority: 25,
      }) as unknown,
    );
  });

  it('fails closed when two active rules match at the same top priority', () => {
    const rules = DEFAULT_ACCOUNTING_PROVIDER_RECOGNITION_RULES.map((rule) => ({
      ...rule,
      requiredKeywords: ['Shared Marker'],
      optionalKeywords: [],
      priority: 10,
    }));
    const matched = matchAccountingProviderRecognitionRule(
      'Shared Marker',
      rules,
    );

    expect(matched.rule).toBeNull();
    expect(matched.ambiguousRuleStableIds).toHaveLength(rules.length);
  });

  it('normalizes keyword configuration and rejects active empty rules', () => {
    expect(
      normalizeAccountingProviderRecognitionRuleUpdate(
        'acct_recognition_fantuan_statement',
        {
          requiredKeywords: [
            ' Total Transfer Amount ',
            'total transfer amount',
          ],
          optionalKeywords: [' Commission GST/HST '],
          optionalMatchMode: AccountingProviderRecognitionMatchMode.ANY,
          priority: 300,
          isActive: true,
        },
      ),
    ).toEqual({
      requiredKeywords: ['Total Transfer Amount'],
      optionalKeywords: ['Commission GST/HST'],
      optionalMatchMode: AccountingProviderRecognitionMatchMode.ANY,
      priority: 300,
      isActive: true,
    });

    expect(() =>
      normalizeAccountingProviderRecognitionRuleUpdate(
        'acct_recognition_fantuan_statement',
        {
          requiredKeywords: [],
          optionalKeywords: [],
          optionalMatchMode: AccountingProviderRecognitionMatchMode.ANY,
          priority: 300,
          isActive: true,
        },
      ),
    ).toThrow('an active recognition rule requires at least one keyword');
  });
});
