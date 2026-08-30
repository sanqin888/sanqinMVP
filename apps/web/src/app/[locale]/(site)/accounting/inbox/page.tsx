'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';

type Category = {
  categoryStableId: string;
  name: string;
  type: 'INCOME' | 'EXPENSE' | 'ADJUSTMENT' | 'TRANSFER';
  parentStableId: string | null;
};

type Account = {
  accountStableId: string;
  name: string;
};

type Extraction = {
  date?: string | null;
  subtotalCents?: number | null;
  taxCents?: number | null;
  totalCents?: number | null;
  suggestedCategoryStableId?: string | null;
  suggestedCategoryName?: string | null;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  requiresSplit?: boolean;
};

type InboxDocument = {
  documentStableId: string;
  source: 'GMAIL' | 'MANUAL';
  status: 'PENDING_REVIEW' | 'CONFIRMED' | 'DUPLICATE' | 'ERROR';
  occurredAt: string | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  currency: string;
  emailSubject: string | null;
  attachmentUrls: string[];
  extractedText: string | null;
  extraction: Extraction | null;
  createdAt: string;
};

type ReviewRow = {
  key: string;
  categoryStableId: string;
  amount: string;
  tax: string;
};

const money = (cents: number | null | undefined) => `$${((cents ?? 0) / 100).toFixed(2)}`;
const toCents = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};
const toDollars = (cents: number | null | undefined) => ((cents ?? 0) / 100).toFixed(2);
const key = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function AccountingInboxPage() {
  const params = useParams<{ locale: string }>();
  const isZh = params?.locale === 'zh';
  const [documents, setDocuments] = useState<InboxDocument[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [reviewing, setReviewing] = useState<InboxDocument | null>(null);
  const [date, setDate] = useState('');
  const [total, setTotal] = useState('');
  const [accountStableId, setAccountStableId] = useState('');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [docs, cats, accts] = await Promise.all([
        apiFetch<InboxDocument[]>('/accounting/inbox?limit=100'),
        apiFetch<Category[]>('/accounting/categories'),
        apiFetch<Account[]>('/accounting/accounts'),
      ]);
      setDocuments(docs);
      setCategories(cats);
      setAccounts(accts);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const expenseCategories = useMemo(() => {
    const parentStableIds = new Set(
      categories
        .map((category) => category.parentStableId)
        .filter((value): value is string => Boolean(value)),
    );
    return categories.filter(
      (category) =>
        category.type === 'EXPENSE' &&
        !parentStableIds.has(category.categoryStableId),
    );
  }, [categories]);
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.categoryStableId, category.name])),
    [categories],
  );
  const calculated = useMemo(() => {
    const subtotalCents = rows.reduce((sum, row) => sum + toCents(row.amount), 0);
    const taxCents = rows.reduce((sum, row) => sum + toCents(row.tax), 0);
    const totalCents = toCents(total);
    return { subtotalCents, taxCents, totalCents, differenceCents: totalCents - subtotalCents - taxCents };
  }, [rows, total]);

  function startReview(document: InboxDocument) {
    const extraction = document.extraction ?? {};
    const suggested = extraction.suggestedCategoryStableId;
    const defaultCategory =
      (suggested && expenseCategories.some((category) => category.categoryStableId === suggested) ? suggested : null) ??
      expenseCategories[0]?.categoryStableId ?? '';
    const subtotalCents = document.subtotalCents ?? extraction.subtotalCents ?? document.totalCents ?? 0;
    const taxCents = document.taxCents ?? extraction.taxCents ?? 0;
    setReviewing(document);
    setDate(
      extraction.date ??
        (document.occurredAt ? document.occurredAt.slice(0, 10) : new Date().toISOString().slice(0, 10)),
    );
    setTotal(toDollars(document.totalCents ?? extraction.totalCents ?? subtotalCents + taxCents));
    setAccountStableId(accounts[0]?.accountStableId ?? '');
    setRows([
      {
        key: key(),
        categoryStableId: defaultCategory,
        amount: toDollars(subtotalCents),
        tax: toDollars(taxCents),
      },
    ]);
    setError(null);
  }

  async function confirm() {
    if (!reviewing) return;
    if (calculated.totalCents <= 0 || calculated.differenceCents !== 0) {
      setError(
        isZh
          ? `账单未对平，当前差额 ${money(calculated.differenceCents)}。`
          : `The bill is not balanced. Difference: ${money(calculated.differenceCents)}.`,
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/accounting/inbox/${reviewing.documentStableId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          occurredAt: date,
          totalCents: calculated.totalCents,
          accountStableId: accountStableId || null,
          attachmentUrls: [],
          splits: rows
            .filter((row) => toCents(row.amount) > 0 || toCents(row.tax) > 0)
            .map((row) => ({
              categoryStableId: row.categoryStableId,
              amountCents: toCents(row.amount),
              taxCents: toCents(row.tax),
            })),
        }),
      });
      setReviewing(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    setRunning(true);
    setError(null);
    try {
      await apiFetch('/accounting/automation/run', { method: 'POST' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{isZh ? '财务收件箱' : 'Accounting inbox'}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isZh
              ? '发往 bills@sanq.ca 或带 SanQ-Bills 标签的 Gmail 账单会先进入这里，支持 PDF 和邮件正文；确认后才正式入账。'
              : 'Gmail bills sent to bills@sanq.ca or labeled SanQ-Bills enter review here, including PDF and body-only bills, before posting.'}
          </p>
        </div>
        <button onClick={() => void runNow()} disabled={running} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50">
          {running ? (isZh ? '拉取中…' : 'Running…') : (isZh ? '立即拉取一次' : 'Run intake now')}
        </button>
      </div>

      {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {reviewing ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{isZh ? '确认账单' : 'Review bill'}</h2>
              <p className="mt-1 text-sm text-slate-600">{reviewing.emailSubject || reviewing.documentStableId}</p>
            </div>
            <button className="text-sm text-slate-600" onClick={() => setReviewing(null)}>{isZh ? '关闭' : 'Close'}</button>
          </div>
          {reviewing.extractedText ? <details className="mt-4 rounded-lg border bg-white p-3 text-sm"><summary className="cursor-pointer font-medium">{isZh ? '查看识别原文' : 'View extracted text'}</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-xs text-slate-600">{reviewing.extractedText}</pre></details> : null}
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="text-sm"><span className="mb-1 block text-slate-500">{isZh ? '日期' : 'Date'}</span><input className="w-full rounded border bg-white px-3 py-2" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <label className="text-sm"><span className="mb-1 block text-slate-500">{isZh ? '账单总额' : 'Bill total'}</span><div className="flex rounded border bg-white px-3 py-2"><span>$</span><input className="ml-1 min-w-0 flex-1 outline-none" value={total} inputMode="decimal" onChange={(event) => setTotal(event.target.value)} /></div></label>
            <label className="text-sm"><span className="mb-1 block text-slate-500">{isZh ? '付款账户' : 'Paid from'}</span><select className="w-full rounded border bg-white px-3 py-2" value={accountStableId} onChange={(event) => setAccountStableId(event.target.value)}><option value="">{isZh ? '暂不指定' : 'Not specified'}</option>{accounts.map((account) => <option key={account.accountStableId} value={account.accountStableId}>{account.name}</option>)}</select></label>
          </div>

          <div className="mt-4 space-y-2">
            {rows.map((row) => (
              <div key={row.key} className="grid gap-2 md:grid-cols-[1.6fr_140px_140px_70px] md:items-end">
                <label className="text-sm"><span className="mb-1 block text-slate-500">{isZh ? '类别' : 'Category'}</span><select className="w-full rounded border bg-white px-3 py-2" value={row.categoryStableId} onChange={(event) => setRows((current) => current.map((item) => item.key === row.key ? { ...item, categoryStableId: event.target.value } : item))}>{expenseCategories.map((category) => <option key={category.categoryStableId} value={category.categoryStableId}>{categoryNames.get(category.parentStableId ?? '') ? `${categoryNames.get(category.parentStableId ?? '')} › ` : ''}{category.name}</option>)}</select></label>
                <label className="text-sm"><span className="mb-1 block text-slate-500">{isZh ? '税前金额' : 'Before tax'}</span><input className="w-full rounded border bg-white px-3 py-2" value={row.amount} inputMode="decimal" onChange={(event) => setRows((current) => current.map((item) => item.key === row.key ? { ...item, amount: event.target.value } : item))} /></label>
                <label className="text-sm"><span className="mb-1 block text-slate-500">HST</span><input className="w-full rounded border bg-white px-3 py-2" value={row.tax} inputMode="decimal" onChange={(event) => setRows((current) => current.map((item) => item.key === row.key ? { ...item, tax: event.target.value } : item))} /></label>
                <button type="button" disabled={rows.length <= 1} className="pb-2 text-sm text-red-600 disabled:text-slate-300" onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>{isZh ? '删除' : 'Remove'}</button>
              </div>
            ))}
          </div>
          <button type="button" className="mt-2 rounded border bg-white px-3 py-1.5 text-sm" onClick={() => setRows((current) => [...current, { key: key(), categoryStableId: current.at(-1)?.categoryStableId || expenseCategories[0]?.categoryStableId || '', amount: '', tax: '' }])}>+ {isZh ? '增加类别' : 'Add category'}</button>

          <div className="mt-4 grid gap-3 rounded-lg bg-white p-3 text-sm sm:grid-cols-4">
            <div><span className="text-slate-500">{isZh ? '税前' : 'Subtotal'}</span><strong className="ml-2">{money(calculated.subtotalCents)}</strong></div>
            <div><span className="text-slate-500">HST</span><strong className="ml-2">{money(calculated.taxCents)}</strong></div>
            <div><span className="text-slate-500">{isZh ? '总额' : 'Total'}</span><strong className="ml-2">{money(calculated.totalCents)}</strong></div>
            <div><span className="text-slate-500">{isZh ? '差额' : 'Difference'}</span><strong className={`ml-2 ${calculated.differenceCents === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{money(calculated.differenceCents)}</strong></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => void confirm()} disabled={saving || calculated.differenceCents !== 0 || calculated.totalCents <= 0} className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? (isZh ? '入账中…' : 'Posting…') : (isZh ? '确认入账' : 'Confirm & post')}</button>
            {reviewing.attachmentUrls[0] ? <a className="rounded border bg-white px-4 py-2 text-sm text-blue-600" href={reviewing.attachmentUrls[0]} target="_blank" rel="noreferrer">{isZh ? '打开原始 PDF' : 'Open original PDF'}</a> : null}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isZh ? `待处理 ${documents.length}` : `${documents.length} pending`}</h2>
        </div>
        {loading ? <p className="text-sm text-slate-500">{isZh ? '加载中…' : 'Loading…'}</p> : null}
        {!loading && !documents.length ? <p className="py-5 text-sm text-slate-500">{isZh ? '当前没有待确认账单。' : 'Nothing needs review.'}</p> : null}
        <div className="divide-y">
          {documents.map((document) => {
            const extraction = document.extraction ?? {};
            return (
              <div key={document.documentStableId} className="grid gap-3 py-4 lg:grid-cols-[1.4fr_110px_120px_1fr_110px] lg:items-center">
                <div>
                  <p className="font-medium">{document.emailSubject || (isZh ? 'PDF 账单' : 'PDF bill')}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(document.createdAt).toLocaleString()}</p>
                </div>
                <div><p className="text-xs text-slate-500">{isZh ? '识别总额' : 'Detected total'}</p><p className="font-semibold">{money(document.totalCents ?? extraction.totalCents)}</p></div>
                <div><p className="text-xs text-slate-500">HST</p><p>{money(document.taxCents ?? extraction.taxCents)}</p></div>
                <div>
                  <p className="text-sm">{extraction.suggestedCategoryName || (extraction.requiresSplit ? (isZh ? '建议拆分类别' : 'Likely multi-category') : (isZh ? '需要确认类别' : 'Category needs review'))}</p>
                  <p className="mt-1 text-xs text-slate-500">{isZh ? '识别可信度' : 'Confidence'}: {extraction.confidence ?? 'LOW'}</p>
                </div>
                <button onClick={() => startReview(document)} className="rounded bg-slate-900 px-3 py-2 text-sm text-white">{isZh ? '处理' : 'Review'}</button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
