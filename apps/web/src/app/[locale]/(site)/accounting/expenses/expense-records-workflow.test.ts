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

  it('uses split-level funding for v2 completion while retaining the historical v1 allocation path', () => {
    expect(completionFormSource).toContain('/split-funding');
    expect(completionFormSource).toContain('/payment-allocations');
    expect(completionFormSource).toContain("method: 'PUT'");
    expect(completionFormSource).toContain(
      'paidFromAccountStableId: splitFunding[split.splitStableId]',
    );
    expect(completionFormSource).toContain(
      'paymentAllocations: prepared.paymentAllocations',
    );
    expect(completionFormSource).toContain(
      'document.fundingAttributionVersion === 2',
    );
    expect(completionFormSource).toContain(
      '日期、金额、费用分类和凭证不可在此修改',
    );
    expect(completionFormSource).toContain('allowUnknown={false}');
    expect(paymentEditorSource).toContain(
      '请把 CAD 记账总额完整分配到一个或多个付款账户。',
    );
  });

  it('puts v2 payment-account selection inside expense split rows instead of a separate create card', () => {
    expect(createFormSource).toContain('<ExpenseSplitEditor');
    expect(createFormSource).toContain('accounts={accounts}');
    expect(createFormSource).toContain(
      'paidFromAccountStableId:',
    );
    expect(createFormSource).not.toContain(
      '<ExpensePaymentAllocationsEditor',
    );
    expect(createFormSource).not.toContain('paymentAllocations:');

    const dateIndex = createFormSource.indexOf("{isZh ? '日期' : 'Date'}");
    const totalIndex = createFormSource.indexOf(
      "{isZh ? 'CAD 记账总额' : 'CAD booking total'}",
    );
    const splitIndex = createFormSource.indexOf('<ExpenseSplitEditor');
    const evidenceIndex = createFormSource.indexOf(
      "{isZh ? '凭证文件' : 'Evidence files'}",
    );
    expect(dateIndex).toBeGreaterThan(-1);
    expect(totalIndex).toBeGreaterThan(dateIndex);
    expect(splitIndex).toBeGreaterThan(totalIndex);
    expect(evidenceIndex).toBeGreaterThan(splitIndex);
  });
});
