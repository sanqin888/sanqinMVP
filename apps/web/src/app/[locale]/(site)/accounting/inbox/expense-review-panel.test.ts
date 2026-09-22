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

  it('keeps machine extraction read-only and exposes editable final booking values without a second review workflow', () => {
    const source = readFileSync(
      resolve(__dirname, 'expense-review-panel.tsx'),
      'utf8',
    );

    expect(source).toContain("最终入账值（可编辑）");
    expect(source).toContain('bookingCorrectedFields');
    expect(source).toContain('value={row.amount}');
    expect(source).toContain('value={row.tax}');
    expect(source).not.toContain('/expense/review-revisions');
    expect(source).not.toContain('保存人工复核草稿');
    expect(source).not.toContain('确认人工复核');
  });

  it('warns that final expense confirmation posts the expense and protects the source evidence', () => {
    const source = readFileSync(
      resolve(__dirname, 'expense-review-panel.tsx'),
      'utf8',
    );

    expect(source).toContain('确认后会创建正式费用记录并写入财务账目');
    expect(source).toContain('之后不能再永久删除');
    expect(source).toContain('Confirm and create expense');
  });

  it('keeps source currency before expense date and puts v2 payment accounts on final split rows', () => {
    const source = readFileSync(
      resolve(__dirname, 'expense-review-panel.tsx'),
      'utf8',
    );

    const sourceCurrencyIndex = source.indexOf('value={sourceCurrency}');
    const expenseDateIndex = source.indexOf('type="date"');
    const paymentAccountIndex = source.indexOf(
      "isZh ? '付款账户' : 'Payment account'",
    );
    const memoIndex = source.indexOf("{isZh ? '备注' : 'Memo'}");

    expect(sourceCurrencyIndex).toBeGreaterThan(-1);
    expect(sourceCurrencyIndex).toBeLessThan(expenseDateIndex);
    expect(paymentAccountIndex).toBeGreaterThan(expenseDateIndex);
    expect(paymentAccountIndex).toBeLessThan(memoIndex);
    expect(source).not.toContain('<ExpensePaymentAllocationsEditor');
    expect(source).toContain("isZh ? '税' : 'Tax'");
    expect(source).toContain('HST');
    expect(source).toContain(
      "aria-label={isZh ? '付款账户' : 'Payment account'}",
    );
    expect(source).toContain(
      'inheritFrom?.paidFromAccountStableId ??',
    );
    expect(source).toContain(
      'rows.at(-1)?.paidFromAccountStableId ??',
    );
    expect(source).toContain(
      'row.paidFromAccountStableId,',
    );
    expect(source).toContain(
      'paidFromAccountStableId: value.paidFromAccountStableId',
    );
  });
});
