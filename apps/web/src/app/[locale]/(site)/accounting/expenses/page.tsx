'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import type { AccountingAccount, AccountingCategory } from '../contracts/chart';
import type {
  AccountingExpenseDocument,
  AccountingExpenseRecordsPage,
} from '../contracts/expenses';
import { ExpenseEditor } from './expense-editor';
import {
  EMPTY_EXPENSE_RECORD_FILTERS,
  ExpenseRecordsPanel,
  UNASSIGNED_PAYMENT_FILTER,
  type ExpenseRecordFilters,
} from './expense-records-panel';

const EMPTY_RECORDS_PAGE: AccountingExpenseRecordsPage = {
  items: [],
  total: 0,
  limit: 10,
  offset: 0,
};

export default function AccountingExpensesPage() {
  const params = useParams<{ locale: string }>();
  const locale = params?.locale === 'zh' ? 'zh' : 'en';
  const isZh = locale === 'zh';
  const [categories, setCategories] = useState<AccountingCategory[]>([]);
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [recordsPage, setRecordsPage] =
    useState<AccountingExpenseRecordsPage>(EMPTY_RECORDS_PAGE);
  const [filters, setFilters] = useState<ExpenseRecordFilters>(
    EMPTY_EXPENSE_RECORD_FILTERS,
  );
  const [pageSize, setPageSize] = useState(10);
  const [offset, setOffset] = useState(0);
  const [editingDocument, setEditingDocument] =
    useState<AccountingExpenseDocument | null>(null);
  const [loadingReference, setLoadingReference] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadReferenceData() {
      setLoadingReference(true);
      setError(null);
      try {
        const [cats, accts] = await Promise.all([
          apiFetch<AccountingCategory[]>('/accounting/categories'),
          apiFetch<AccountingAccount[]>('/accounting/accounts'),
        ]);
        if (!active) return;
        setCategories(cats);
        setAccounts(accts);
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        if (active) setLoadingReference(false);
      }
    }
    void loadReferenceData();
    return () => {
      active = false;
    };
  }, []);

  const loadRecords = useCallback(async () => {
    setLoadingRecords(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
      });
      if (filters.from) query.set('from', filters.from);
      if (filters.to) query.set('to', filters.to);
      if (filters.minAmount.trim()) {
        const minAmount = Number(filters.minAmount);
        if (!Number.isFinite(minAmount) || minAmount < 0) {
          throw new Error(
            isZh
              ? '最低金额必须是大于或等于 0 的数字。'
              : 'Minimum amount must be a number greater than or equal to 0.',
          );
        }
        query.set('minTotalCents', String(Math.round(minAmount * 100)));
      }
      if (filters.paymentFilter === UNASSIGNED_PAYMENT_FILTER) {
        query.set('paymentState', 'UNASSIGNED');
      } else if (filters.paymentFilter) {
        query.set('paymentAccountStableId', filters.paymentFilter);
      }

      const page = await apiFetch<AccountingExpenseRecordsPage>(
        `/accounting/expenses/records?${query.toString()}`,
      );
      setRecordsPage(page);
      if (page.total > 0 && page.offset >= page.total) {
        setOffset(
          Math.max(
            Math.floor((page.total - 1) / page.limit) * page.limit,
            0,
          ),
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoadingRecords(false);
    }
  }, [filters, isZh, offset, pageSize]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const parentCategoryStableIds = new Set(
    categories
      .map((category) => category.parentStableId)
      .filter((value): value is string => Boolean(value)),
  );
  const hasExpenseCategory = categories.some(
    (category) =>
      category.type === 'EXPENSE' &&
      !parentCategoryStableIds.has(category.categoryStableId),
  );

  async function handleSaved() {
    setEditingDocument(null);
    if (offset === 0) {
      await loadRecords();
    } else {
      setOffset(0);
    }
  }

  function startPaymentCompletion(document: AccountingExpenseDocument) {
    setEditingDocument(document);
    window.requestAnimationFrame(() => {
      window.document
        .getElementById('expense-editor')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  if (loadingReference) {
    return (
      <p className="text-sm text-slate-500">
        {isZh ? '加载中…' : 'Loading…'}
      </p>
    );
  }

  if (!hasExpenseCategory) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h1 className="text-xl font-semibold">
          {isZh ? '尚未初始化财务分类' : 'Accounting is not initialized'}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {isZh
            ? '请先到“设置与月结”完成一次初始化。'
            : 'Open Settings & close and initialize accounting first.'}
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{isZh ? '支出' : 'Expenses'}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? '先查看和筛选已确认的支出记录；未指定付款账户的记录可在本页补充付款事实。'
            : 'Review and filter confirmed expense records first. Missing payment facts can be completed on this page.'}
        </p>
      </div>

      {error ? (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <ExpenseRecordsPanel
        documents={recordsPage.items}
        total={recordsPage.total}
        limit={pageSize}
        offset={offset}
        accounts={accounts}
        loading={loadingRecords}
        isZh={isZh}
        onApplyFilters={(nextFilters) => {
          setFilters(nextFilters);
          setOffset(0);
        }}
        onPageChange={setOffset}
        onPageSizeChange={(nextLimit) => {
          setPageSize(nextLimit);
          setOffset(0);
        }}
        onCompletePayment={startPaymentCompletion}
      />

      <ExpenseEditor
        locale={locale}
        isZh={isZh}
        categories={categories}
        accounts={accounts}
        editingDocument={editingDocument}
        onSaved={handleSaved}
        onCancelEdit={() => setEditingDocument(null)}
      />
    </div>
  );
}
