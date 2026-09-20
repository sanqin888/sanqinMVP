import type {
  AccountingProviderFinancialDocument,
  AccountingProviderFinancialLine,
} from '../contracts/provider-financial';
import type { ProviderSettlementPostingState } from '../contracts/settlements';
import {
  findSettlementNetLine,
  settlementDocumentBucket,
} from './settlement-summary';

const line = (
  overrides: Partial<AccountingProviderFinancialLine>,
): AccountingProviderFinancialLine => ({
  lineStableId: 'line-1',
  lineNo: 1,
  rawName: null,
  component: 'CONTROL_TOTAL',
  postingTreatment: 'CONTROL_TOTAL',
  taxRole: 'NONE',
  amountCents: 0,
  occurredAt: null,
  ...overrides,
});

const document = (
  overrides: Partial<AccountingProviderFinancialDocument>,
): AccountingProviderFinancialDocument => ({
  documentStableId: 'doc-statement',
  provider: 'FANTUAN',
  documentType: 'STATEMENT',
  revision: 1,
  storeStableId: '4750_Yonge_Street',
  providerMerchantRef: null,
  providerDocumentRef: '2026-06-01:2026-06-30',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  settledAt: null,
  payoutAt: null,
  currency: 'CAD',
  parserName: 'accounting-provider-financial',
  parserVersion: '3',
  lines: [],
  ...overrides,
});

const postingState = (
  state: ProviderSettlementPostingState['postingState'],
): ProviderSettlementPostingState => ({
  documentStableId: 'doc-statement',
  postingState: state,
  existingJournalEntryStableId:
    state === 'POSTED' ? 'journal-statement' : null,
});

describe('provider settlement summary', () => {
  it('uses canonical PAYOUT for Fantuan and Clover-style statements', () => {
    const payout = line({
      rawName: 'Total transfer amount',
      component: 'PAYOUT',
      amountCents: 292539,
    });

    expect(findSettlementNetLine([payout])).toBe(payout);
  });

  it('falls back to Uber Net Total when no canonical PAYOUT line exists', () => {
    const uberNetTotal = line({
      rawName: 'Net Total',
      amountCents: 122285,
    });

    expect(findSettlementNetLine([uberNetTotal])).toBe(uberNetTotal);
  });

  it('prefers canonical PAYOUT over a raw Net Total fallback', () => {
    const uberNetTotal = line({
      rawName: 'Net Total',
      amountCents: 100,
    });
    const payout = line({
      lineStableId: 'line-2',
      lineNo: 2,
      rawName: 'Total Amount Funded',
      component: 'PAYOUT',
      amountCents: 200,
    });

    expect(findSettlementNetLine([uberNetTotal, payout])).toBe(payout);
  });

  it(
    'moves a statement out of the pending bucket once a settlement Journal exists',
    () => {
      const statement = document({});

      expect(
        settlementDocumentBucket(statement, postingState('NOT_POSTED')),
      ).toBe('PENDING');
      expect(settlementDocumentBucket(statement, postingState('POSTED'))).toBe(
        'POSTED',
      );
    },
  );

  it(
    'keeps non-statement provider evidence out of the replay work queue',
    () => {
      const detail = document({
        documentStableId: 'doc-detail',
        documentType: 'OTHER',
        parserName: 'accounting-fantuan-adjustment-detail-xlsx',
        parserVersion: '1',
      });

      expect(settlementDocumentBucket(detail, undefined)).toBe('SUPPORTING');
    },
  );
});
