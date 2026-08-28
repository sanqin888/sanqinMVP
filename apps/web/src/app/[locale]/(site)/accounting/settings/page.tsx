'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';

type CategoryType = 'INCOME' | 'EXPENSE' | 'ADJUSTMENT' | 'TRANSFER';
type Category = {
  categoryStableId: string;
  name: string;
  type: CategoryType;
  parentStableId: string | null;
  isActive: boolean;
  sortOrder: number;
};
type Account = {
  accountStableId: string;
  name: string;
  type: 'CASH' | 'BANK' | 'PLATFORM_WALLET';
  currency: string;
};
type AutomationSettings = {
  timezone: string;
  runHour: number;
  runMinute: number;
  gmailEnabled: boolean;
  uberReportsEnabled: boolean;
  nextRunAt: string | null;
};
type AutomationResult = {
  gmail?: {
    configured: boolean;
    scannedMessages: number;
    importedDocuments: number;
    duplicateDocuments: number;
    failedDocuments: number;
  };
  uber?: Array<unknown>;
};
type PeriodClose = {
  periodType: 'MONTH' | 'YEAR';
  periodKey: string;
  closedAt: string;
};

const pad2 = (value: number) => String(value).padStart(2, '0');

export default function AccountingSettingsPage() {
  const params = useParams<{ locale: string }>();
  const isZh = params?.locale === 'zh';
  const locale = isZh ? 'zh' : 'en';
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [automation, setAutomation] = useState<AutomationSettings | null>(null);
  const [automationTime, setAutomationTime] = useState('02:15');
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<Account['type']>('BANK');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<CategoryType>('EXPENSE');
  const [newCategoryParent, setNewCategoryParent] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [monthClosed, setMonthClosed] = useState(false);
  const [yearLocked, setYearLocked] = useState(false);
  const [automationResult, setAutomationResult] = useState<AutomationResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [cats, accts, automationSettings] = await Promise.all([
        apiFetch<Category[]>('/accounting/categories?includeInactive=true'),
        apiFetch<Account[]>('/accounting/accounts'),
        apiFetch<AutomationSettings>('/accounting/automation/settings'),
      ]);
      setCategories(cats);
      setAccounts(accts);
      setAutomation(automationSettings);
      setAutomationTime(`${pad2(automationSettings.runHour)}:${pad2(automationSettings.runMinute)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const loadPeriodStatus = useCallback(async () => {
    try {
      const [months, years] = await Promise.all([
        apiFetch<PeriodClose[]>(`/accounting/period-close/month?periodKeys=${encodeURIComponent(month)}`),
        apiFetch<PeriodClose[]>(`/accounting/period-close/year?periodKeys=${encodeURIComponent(year)}`),
      ]);
      setMonthClosed(months.some((item) => item.periodKey === month));
      setYearLocked(years.some((item) => item.periodKey === year));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [month, year]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadPeriodStatus();
  }, [loadPeriodStatus]);

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.categoryStableId, category.name])),
    [categories],
  );
  const parentOptions = useMemo(
    () => categories.filter((category) => category.type === newCategoryType && category.isActive),
    [categories, newCategoryType],
  );

  async function initialize() {
    setBusy('initialize'); setError(null); setMessage(null);
    try {
      await apiFetch('/accounting/setup/initialize', { method: 'POST' });
      setMessage(isZh ? '默认分类和基础账户已初始化。' : 'Default categories and accounts initialized.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(null); }
  }

  async function addAccount(event: FormEvent) {
    event.preventDefault();
    if (!accountName.trim()) return;
    setBusy('account'); setError(null);
    try {
      await apiFetch('/accounting/accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: accountName.trim(), type: accountType, currency: 'CAD' }),
      });
      setAccountName(''); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(null); }
  }

  async function addCategory(event: FormEvent) {
    event.preventDefault();
    if (!newCategoryName.trim()) return;
    setBusy('category-new'); setError(null);
    try {
      await apiFetch('/accounting/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCategoryName.trim(), type: newCategoryType,
          parentStableId: newCategoryParent || null,
        }),
      });
      setNewCategoryName(''); setNewCategoryParent(''); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(null); }
  }

  function editCategory(stableId: string, patch: Partial<Category>) {
    setCategories((current) => current.map((category) =>
      category.categoryStableId === stableId ? { ...category, ...patch } : category,
    ));
  }

  async function saveCategory(category: Category) {
    setBusy(`category-${category.categoryStableId}`); setError(null);
    try {
      await apiFetch(`/accounting/categories/${encodeURIComponent(category.categoryStableId)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: category.name,
          parentStableId: category.parentStableId,
          sortOrder: category.sortOrder,
          isActive: category.isActive,
        }),
      });
      await load();
      setMessage(isZh ? '分类已保存。' : 'Category saved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(null); }
  }

  async function saveAutomation() {
    if (!automation) return;
    const [hourRaw, minuteRaw] = automationTime.split(':');
    const runHour = Number(hourRaw); const runMinute = Number(minuteRaw);
    setBusy('automation-settings'); setError(null);
    try {
      const updated = await apiFetch<AutomationSettings>('/accounting/automation/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone: automation.timezone,
          runHour,
          runMinute,
          gmailEnabled: automation.gmailEnabled,
          uberReportsEnabled: automation.uberReportsEnabled,
        }),
      });
      setAutomation(updated);
      setAutomationTime(`${pad2(updated.runHour)}:${pad2(updated.runMinute)}`);
      setMessage(isZh ? '夜间采集时间已保存。' : 'Nightly schedule saved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(null); }
  }

  async function runAutomation() {
    setBusy('automation'); setError(null);
    try {
      const result = await apiFetch<AutomationResult>('/accounting/automation/run', { method: 'POST' });
      setAutomationResult(result);
      setMessage(isZh ? '自动采集已执行。' : 'Accounting intake completed.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(null); }
  }

  async function closeMonth() {
    if (!window.confirm(isZh ? `确认完成 ${month} 月结？之后普通修改会被阻止，但管理员仍可重新打开。` : `Close ${month}? It can still be reopened by an administrator.`)) return;
    setBusy('close-month'); setError(null);
    try {
      await apiFetch(`/accounting/period-close/month/${month}`, { method: 'POST' });
      setMessage(isZh ? `${month} 已完成月结。` : `${month} is closed.`);
      await loadPeriodStatus();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(null); }
  }

  async function reopenMonth() {
    if (!window.confirm(isZh ? `重新打开 ${month}？操作会写入审计记录。` : `Reopen ${month}? This is audited.`)) return;
    setBusy('reopen-month'); setError(null);
    try {
      await apiFetch(`/accounting/period-close/month/${month}`, { method: 'DELETE' });
      setMessage(isZh ? `${month} 已重新打开。` : `${month} reopened.`);
      await loadPeriodStatus();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(null); }
  }

  async function closeYear() {
    if (!window.confirm(isZh ? `确认硬锁 ${year} 财年？年度锁账后不能重新打开月份。` : `Hard-lock fiscal year ${year}? Months cannot be reopened afterward.`)) return;
    setBusy('close-year'); setError(null);
    try {
      await apiFetch(`/accounting/period-close/year/${year}`, { method: 'POST' });
      setMessage(isZh ? `${year} 财年已硬锁。` : `Fiscal year ${year} is locked.`);
      await loadPeriodStatus();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{isZh ? '设置与结账' : 'Settings & close'}</h1>
        <p className="mt-1 text-sm text-slate-500">{isZh ? '管理财务分类、资金账户、夜间采集时间，以及月结/年度锁账。' : 'Manage categories, accounts, nightly intake, month close and annual lock.'}</p>
      </div>
      {message ? <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold">{isZh ? '财务初始化' : 'Accounting setup'}</h2><p className="mt-1 text-sm text-slate-500">{isZh ? '首次使用时创建默认分类；可重复执行。' : 'Create the default category template; safe to repeat.'}</p></div>
          <button onClick={() => void initialize()} disabled={busy !== null} className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">{isZh ? '初始化默认分类' : 'Initialize defaults'}</button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">{isZh ? '财务分类' : 'Categories'}</h2>
        <p className="mt-1 text-sm text-slate-500">{isZh ? '已有账目的分类不删除；不再使用时停用即可。' : 'Categories referenced by history are retained; deactivate unused ones.'}</p>
        <form onSubmit={addCategory} className="mt-4 grid gap-2 md:grid-cols-4">
          <input className="rounded border px-3 py-2 text-sm" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder={isZh ? '新分类名称' : 'New category'} />
          <select className="rounded border px-3 py-2 text-sm" value={newCategoryType} onChange={(event) => { setNewCategoryType(event.target.value as CategoryType); setNewCategoryParent(''); }}>
            <option value="EXPENSE">{isZh ? '支出' : 'Expense'}</option><option value="INCOME">{isZh ? '收入' : 'Income'}</option><option value="ADJUSTMENT">{isZh ? '调整' : 'Adjustment'}</option><option value="TRANSFER">{isZh ? '转账' : 'Transfer'}</option>
          </select>
          <select className="rounded border px-3 py-2 text-sm" value={newCategoryParent} onChange={(event) => setNewCategoryParent(event.target.value)}>
            <option value="">{isZh ? '一级分类' : 'Top level'}</option>
            {parentOptions.map((category) => <option key={category.categoryStableId} value={category.categoryStableId}>{category.name}</option>)}
          </select>
          <button disabled={busy !== null} className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">{isZh ? '新增分类' : 'Add category'}</button>
        </form>
        <div className="mt-4 space-y-2">
          {categories.map((category) => (
            <div key={category.categoryStableId} className={`grid gap-2 rounded-lg border p-3 text-sm md:grid-cols-[1.5fr_1fr_90px_90px_auto] ${category.isActive ? 'bg-white' : 'bg-slate-50 opacity-70'}`}>
              <input className="rounded border px-2 py-1" value={category.name} onChange={(event) => editCategory(category.categoryStableId, { name: event.target.value })} />
              <select className="rounded border px-2 py-1" value={category.parentStableId ?? ''} onChange={(event) => editCategory(category.categoryStableId, { parentStableId: event.target.value || null })}>
                <option value="">{isZh ? '一级分类' : 'Top level'}</option>
                {categories.filter((candidate) => candidate.type === category.type && candidate.isActive && candidate.categoryStableId !== category.categoryStableId).map((candidate) => <option key={candidate.categoryStableId} value={candidate.categoryStableId}>{candidate.parentStableId ? `${categoryNames.get(candidate.parentStableId) ?? ''} › ` : ''}{candidate.name}</option>)}
              </select>
              <input type="number" className="rounded border px-2 py-1" value={category.sortOrder} onChange={(event) => editCategory(category.categoryStableId, { sortOrder: Number(event.target.value) })} />
              <label className="flex items-center gap-2"><input type="checkbox" checked={category.isActive} onChange={(event) => editCategory(category.categoryStableId, { isActive: event.target.checked })} />{isZh ? '启用' : 'Active'}</label>
              <button type="button" onClick={() => void saveCategory(category)} disabled={busy !== null} className="rounded border px-3 py-1 disabled:opacity-50">{isZh ? '保存' : 'Save'}</button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">{isZh ? '资金账户' : 'Cash accounts'}</h2>
        <div className="mt-3 divide-y text-sm">{accounts.map((account) => <div key={account.accountStableId} className="flex justify-between py-2"><span>{account.name}</span><span className="text-slate-500">{account.type} · {account.currency}</span></div>)}</div>
        <form onSubmit={addAccount} className="mt-4 flex flex-wrap gap-2 border-t pt-4">
          <input className="min-w-64 flex-1 rounded border px-3 py-2 text-sm" placeholder={isZh ? '例如 TD Business' : 'e.g. TD Business'} value={accountName} onChange={(event) => setAccountName(event.target.value)} />
          <select className="rounded border px-3 py-2 text-sm" value={accountType} onChange={(event) => setAccountType(event.target.value as Account['type'])}><option value="BANK">{isZh ? '银行' : 'Bank'}</option><option value="CASH">{isZh ? '现金' : 'Cash'}</option><option value="PLATFORM_WALLET">{isZh ? '平台待结算' : 'Platform wallet'}</option></select>
          <button disabled={busy !== null} className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">{isZh ? '添加账户' : 'Add account'}</button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">{isZh ? '夜间自动采集' : 'Nightly intake'}</h2>
        <p className="mt-1 text-sm text-slate-500">{isZh ? '账单入口固定为 bills@sanq.ca；这里只调整每日批处理时间和开关。' : 'Bills enter through bills@sanq.ca; configure the daily batch time here.'}</p>
        {automation ? <div className="mt-4 flex flex-wrap items-end gap-4 text-sm">
          <label>{isZh ? '执行时间' : 'Run time'}<input type="time" className="mt-1 block rounded border px-3 py-2" value={automationTime} onChange={(event) => setAutomationTime(event.target.value)} /></label>
          <label>{isZh ? '时区' : 'Timezone'}<input className="mt-1 block w-48 rounded border px-3 py-2" value={automation.timezone} onChange={(event) => setAutomation({ ...automation, timezone: event.target.value })} /></label>
          <label className="flex items-center gap-2 pb-2"><input type="checkbox" checked={automation.gmailEnabled} onChange={(event) => setAutomation({ ...automation, gmailEnabled: event.target.checked })} />Gmail PDF</label>
          <label className="flex items-center gap-2 pb-2"><input type="checkbox" checked={automation.uberReportsEnabled} onChange={(event) => setAutomation({ ...automation, uberReportsEnabled: event.target.checked })} />Uber Reports</label>
          <button onClick={() => void saveAutomation()} disabled={busy !== null} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">{isZh ? '保存计划' : 'Save schedule'}</button>
          <button onClick={() => void runAutomation()} disabled={busy !== null} className="rounded border px-4 py-2 disabled:opacity-50">{isZh ? '现在执行一次' : 'Run now'}</button>
        </div> : null}
        {automation?.nextRunAt ? <p className="mt-3 text-xs text-slate-500">{isZh ? '下次执行' : 'Next run'}: {new Date(automation.nextRunAt).toLocaleString()}</p> : null}
        {automationResult?.gmail ? <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">{isZh ? '扫描邮件' : 'Scanned'}: {automationResult.gmail.scannedMessages} · {isZh ? '新账单' : 'Imported'}: {automationResult.gmail.importedDocuments} · {isZh ? '重复' : 'Duplicates'}: {automationResult.gmail.duplicateDocuments} · {isZh ? '失败' : 'Failed'}: {automationResult.gmail.failedDocuments}</p> : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">{isZh ? '期间结账' : 'Period close'}</h2>
        <p className="mt-1 text-sm text-slate-500">{isZh ? '月结属于可审计的软锁，可重新打开；年度锁账是硬锁，要求全年12个月都已月结。' : 'Month close is an auditable soft lock; annual close is a hard lock after all 12 months are closed.'}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border p-4"><h3 className="font-medium">{isZh ? '月结' : 'Month close'}</h3><div className="mt-3 flex flex-wrap items-center gap-2"><input type="month" className="rounded border px-3 py-2" value={month} onChange={(event) => { setMonth(event.target.value); setYear(event.target.value.slice(0, 4)); }} /><span className={`rounded px-2 py-1 text-xs ${monthClosed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{monthClosed ? (isZh ? '已月结' : 'Closed') : (isZh ? '进行中' : 'Open')}</span>{monthClosed ? <button onClick={() => void reopenMonth()} disabled={busy !== null || yearLocked} className="rounded border px-3 py-2 text-sm disabled:opacity-50">{isZh ? '重新打开' : 'Reopen'}</button> : <button onClick={() => void closeMonth()} disabled={busy !== null || yearLocked} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">{isZh ? '完成月结' : 'Close month'}</button>}</div></div>
          <div className="rounded-lg border p-4"><h3 className="font-medium">{isZh ? '年度硬锁' : 'Annual hard lock'}</h3><div className="mt-3 flex flex-wrap items-center gap-2"><input type="number" min="2000" max="2100" className="w-28 rounded border px-3 py-2" value={year} onChange={(event) => setYear(event.target.value)} /><span className={`rounded px-2 py-1 text-xs ${yearLocked ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{yearLocked ? (isZh ? '已硬锁' : 'Locked') : (isZh ? '未锁' : 'Unlocked')}</span><button onClick={() => void closeYear()} disabled={busy !== null || yearLocked} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">{isZh ? '锁定财年' : 'Lock year'}</button></div></div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">{isZh ? '操作记录' : 'Audit trail'}</h2>
        <Link className="mt-3 inline-flex rounded border px-4 py-2 text-sm text-blue-600" href={`/${locale}/accounting/audit-logs`}>{isZh ? '打开操作记录' : 'Open audit log'}</Link>
      </section>
    </div>
  );
}
