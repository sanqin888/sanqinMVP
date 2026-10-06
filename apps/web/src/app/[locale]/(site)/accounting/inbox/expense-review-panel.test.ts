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

  it('keeps recognition in Inbox and shows only editable values to be posted during expense review', () => {
    const source = readFileSync(
      resolve(__dirname, 'expense-review-panel.tsx'),
      'utf8',
    );

    expect(source).toContain('将要入账的值（可编辑）');
    expect(source).toContain('审核阶段只显示并编辑本次将写入费用记录的最终值');
    expect(source).not.toContain('机器识别结果');
    expect(source).not.toContain('查看识别原文');
    expect(source).not.toContain('bookingCorrectedFields');
    expect(source).toContain('value={row.amount}');
    expect(source).toContain('value={row.tax}');
    expect(source).not.toContain('/expense/review-revisions');
    expect(source).not.toContain('保存人工复核草稿');
    expect(source).not.toContain('确认人工复核');
  });

  it('allows missing funding attribution while requiring vertical amount reconciliation', () => {
    const source = readFileSync(
      resolve(__dirname, 'expense-review-panel.tsx'),
      'utf8',
    );

    expect(source).toContain('纵向核算');
    expect(source).toContain('expenseBalanced');
    expect(source).toContain('付款账户未知或尚未付款时可以留空');
    expect(source).toContain('这不会阻止费用事实确认');
    expect(source).toContain('disabled={saving || !date || !expenseBalanced}');
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
