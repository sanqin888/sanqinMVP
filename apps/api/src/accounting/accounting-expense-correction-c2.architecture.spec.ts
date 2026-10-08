import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const serviceSource = readFileSync(
  resolve(__dirname, 'accounting-expense-correction.service.ts'),
  'utf8',
);
const controllerSource = readFileSync(
  resolve(__dirname, 'accounting-expense.controller.ts'),
  'utf8',
);
const querySource = readFileSync(
  resolve(__dirname, 'accounting-expense.query.ts'),
  'utf8',
);
const adapterSource = readFileSync(
  resolve(__dirname, 'accounting-expense-correction.adapter.ts'),
  'utf8',
);

describe('Expense posted correction C2 architecture', () => {
  it('keeps the HTTP workflow Expense-specific while delegating lifecycle and owner authority', () => {
    expect(serviceSource).toContain(
      'AccountingPostedFinancialCorrectionService',
    );
    expect(serviceSource).toContain('AccountingExpenseCorrectionAdapter');
    expect(serviceSource).toContain('.createDraft(');
    expect(serviceSource).toContain('.reviseDraft(');
    expect(serviceSource).toContain('.previewCase(');
    expect(serviceSource).toContain('.markReady(');
    expect(serviceSource).toContain('.executeCase(');
    expect(serviceSource).toContain('.cancelCase(');
    expect(controllerSource).toContain('AccountingExpenseCorrectionService');
    expect(controllerSource).not.toContain(
      'AccountingExpenseCorrectionAdapter',
    );
  });

  it('uses dedicated journal/expense routes and never creates a generic manual-Journal endpoint', () => {
    expect(controllerSource).toContain(
      'journal/expense/:documentStableId/correction',
    );
    expect(controllerSource).toContain(
      'journal/expense/:documentStableId/corrections',
    );
    expect(controllerSource).not.toContain('journal/manual');
    expect(controllerSource).not.toContain('manual-journal');
  });

  it('requires canonical posted Expense authority before correction and keeps original source/Journals immutable', () => {
    expect(serviceSource).toContain(
      'Expense correction requires an already-posted canonical Expense Journal',
    );
    expect(serviceSource).toContain('originalPersisted');
    expect(serviceSource).toContain('originalJournals');
    expect(serviceSource).toContain('currentEffective');
    expect(adapterSource).not.toContain(
      '.createCanonicalExpenseJournalEntryInTx(',
    );
    for (const forbidden of [
      'accountingExpenseDocument.update(',
      'accountingExpenseSplit.update(',
      'accountingExpensePaymentAllocation.update(',
    ]) {
      expect(serviceSource).not.toContain(forbidden);
    }
  });

  it('keeps revision concurrency bound to the true current-effective base authority', () => {
    expect(serviceSource).toContain(
      'expectedBaseAuthorityHash: target.basedOnAuthorityHash',
    );
    expect(serviceSource).toContain(
      'record.currentEffective.targetAuthorityHash',
    );
  });

  it('adds posted/correction list state through batched reads rather than per-row correction requests', () => {
    expect(querySource).toContain(
      'sourceFactStableId: { in: documentStableIds }',
    );
    expect(querySource).toContain(
      'readAccountingPostedCorrectionProjections(db, refs)',
    );
    expect(querySource).toContain('canonicalPosted');
    expect(querySource).toContain('expectedFundingGroups');
    expect(querySource).not.toContain('readCurrentEffectiveTarget(');
  });

  it('keeps C2 DELTA-only and refuses duplicate-posting policy expansion', () => {
    expect(serviceSource).toContain(
      'Expense correction does not support DUPLICATE_POSTING in C2',
    );
    expect(adapterSource).toContain(
      'does not support DUPLICATE_POSTING; use a future REVERSAL_ONLY flow',
    );
  });
});
