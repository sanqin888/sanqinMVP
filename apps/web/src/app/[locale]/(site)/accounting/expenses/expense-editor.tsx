'use client';

import type { AccountingAccount, AccountingCategory } from '../contracts/chart';
import type { AccountingExpenseDocument } from '../contracts/expenses';
import { ExpenseCreateForm } from './expense-create-form';
import { ExpensePaymentCompletionForm } from './expense-payment-completion-form';

type Props = {
  locale: string;
  isZh: boolean;
  categories: AccountingCategory[];
  accounts: AccountingAccount[];
  editingDocument: AccountingExpenseDocument | null;
  onSaved: () => Promise<void> | void;
  onCancelEdit: () => void;
};

export function ExpenseEditor({
  locale,
  isZh,
  categories,
  accounts,
  editingDocument,
  onSaved,
  onCancelEdit,
}: Props) {
  return (
    <>
      <ExpenseCreateForm
        locale={locale}
        isZh={isZh}
        categories={categories}
        accounts={accounts}
        hidden={Boolean(editingDocument)}
        onSaved={onSaved}
      />
      {editingDocument ? (
        <ExpensePaymentCompletionForm
          isZh={isZh}
          accounts={accounts}
          document={editingDocument}
          onSaved={onSaved}
          onCancel={onCancelEdit}
        />
      ) : null}
    </>
  );
}
