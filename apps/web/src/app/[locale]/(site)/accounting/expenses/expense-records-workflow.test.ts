import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');
const recordsSource = readFileSync(
  resolve(__dirname, 'expense-records-panel.tsx'),
  'utf8',
);
const editorSource = readFileSync(
  resolve(__dirname, 'expense-editor.tsx'),
  'utf8',
);
const createFormSource = readFileSync(
  resolve(__dirname, 'expense-create-form.tsx'),
  'utf8',
);
const completionFormSource = readFileSync(
  resolve(__dirname, 'expense-payment-completion-form.tsx'),
  'utf8',
);
const paymentEditorSource = readFileSync(
  resolve(__dirname, '..', 'expense-payment-allocations.tsx'),
  'utf8',
);

describe('Accounting Expense records and payment completion UX', () => {
  it('puts the filtered paginated Expense records panel before the editor', () => {
    expect(pageSource.indexOf('<ExpenseRecordsPanel')).toBeGreaterThan(-1);
    expect(pageSource.indexOf('<ExpenseEditor')).toBeGreaterThan(-1);
    expect(pageSource.indexOf('<ExpenseRecordsPanel')).toBeLessThan(
      pageSource.indexOf('<ExpenseEditor'),
    );
    expect(pageSource).toContain('/accounting/expenses/records?');
    expect(recordsSource).toContain('支出记录');
    expect(recordsSource).toContain('每页');
    expect(recordsSource).toContain('UNASSIGNED_PAYMENT_FILTER');
    expect(recordsSource).toContain('最低金额 ≥');
    expect(recordsSource).toContain('共 ${total} 条');
  });

  it('keeps create and payment completion as separate cohesive form components', () => {
    expect(editorSource).toContain('<ExpenseCreateForm');
    expect(editorSource).toContain('<ExpensePaymentCompletionForm');
    expect(editorSource).not.toContain("method: 'PUT'");
    expect(editorSource).not.toContain("method: 'POST'");
  });

  it('only sends payment allocations when completing a confirmed Expense', () => {
    expect(completionFormSource).toContain('/payment-allocations');
    expect(completionFormSource).toContain("method: 'PUT'");
    expect(completionFormSource).toContain(
      'paymentAllocations: prepared.paymentAllocations',
    );
    expect(completionFormSource).toContain(
      '日期、金额、费用分类和凭证不可在此修改',
    );
    expect(completionFormSource).toContain('disabled');
    expect(completionFormSource).toContain('readOnly');
    expect(completionFormSource).toContain('allowUnknown={false}');
    expect(paymentEditorSource).toContain(
      '请把 CAD 记账总额完整分配到一个或多个付款账户。',
    );
  });

  it('orders create and completion forms as date, total, category, payment, then evidence', () => {
    for (const source of [createFormSource, completionFormSource]) {
      const dateIndex = source.indexOf("{isZh ? '日期' : 'Date'}");
      const totalIndex = source.indexOf(
        "{isZh ? 'CAD 记账总额' : 'CAD booking total'}",
      );
      const categoryIndex =
        source === createFormSource
          ? source.indexOf('<ExpenseSplitEditor')
          : source.indexOf("{isZh ? '费用分类' : 'Expense splits'}");
      const paymentIndex = source.indexOf(
        '<ExpensePaymentAllocationsEditor',
      );
      const evidenceIndex = source.indexOf(
        "{isZh ? '凭证文件' : 'Evidence files'}",
      );

      expect(dateIndex).toBeGreaterThan(-1);
      expect(totalIndex).toBeGreaterThan(dateIndex);
      expect(categoryIndex).toBeGreaterThan(totalIndex);
      expect(paymentIndex).toBeGreaterThan(categoryIndex);
      expect(evidenceIndex).toBeGreaterThan(paymentIndex);
    }
  });
});
