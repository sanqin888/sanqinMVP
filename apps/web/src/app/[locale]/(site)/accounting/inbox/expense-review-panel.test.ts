import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Accounting Inbox expense review UX guard', () => {
  it('keeps Aggregate categories clickable so the existing CAD guard can explain why aggregation is blocked', () => {
    const source = readFileSync(
      resolve(__dirname, 'expense-review-panel.tsx'),
      'utf8',
    );

    expect(source).toContain('if (!canAggregateRecognizedQuickRows)');
    const clickIndex = source.indexOf('onClick={aggregateQuickRows}');
    expect(clickIndex).toBeGreaterThan(-1);
    const buttonSlice = source.slice(clickIndex - 160, clickIndex + 220);
    expect(buttonSlice).not.toContain('disabled={!canAggregateRecognizedQuickRows}');
  });

  it('always defaults the editable currency to CAD and prefills any recognized total as an entry aid', () => {
    const source = readFileSync(
      resolve(__dirname, 'expense-review-panel.tsx'),
      'utf8',
    );

    expect(source).toContain("setSourceCurrency('CAD')");
    expect(source).toContain('extraction.totalCents != null');
    expect(source).toContain('toDollars(extraction.totalCents)');
    expect(source).toContain('recognizedForeignCurrencyCode(extraction)');
    expect(source).toContain('text-xs text-red-600');
  });

  it('keeps source currency before expense date and payment allocations immediately before memo', () => {
    const source = readFileSync(
      resolve(__dirname, 'expense-review-panel.tsx'),
      'utf8',
    );

    const sourceCurrencyIndex = source.indexOf('value={sourceCurrency}');
    const expenseDateIndex = source.indexOf('type="date"');
    const paymentEditorIndex = source.indexOf('<ExpensePaymentAllocationsEditor');
    const memoIndex = source.indexOf("{isZh ? '备注' : 'Memo'}");

    expect(sourceCurrencyIndex).toBeGreaterThan(-1);
    expect(sourceCurrencyIndex).toBeLessThan(expenseDateIndex);
    expect(paymentEditorIndex).toBeGreaterThan(expenseDateIndex);
    expect(paymentEditorIndex).toBeLessThan(memoIndex);
  });
});
