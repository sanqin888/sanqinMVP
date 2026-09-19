'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { apiFetch } from '@/lib/api/client';
import type { AccountingAccount } from '../contracts/chart';
import type {
  PayrollCraRemittance,
  PayrollCraRemittancePreview,
} from '../contracts/payroll';
import { payrollLocalDateToday, payrollMoney } from './payroll-ui';

const latestIncludedPayDate = (
  preview: PayrollCraRemittancePreview | null,
): string =>
  preview?.includedRuns.reduce(
    (latest, run) => (run.payDate > latest ? run.payDate : latest),
    preview.includedRuns[0]?.payDate ?? '',
  ) ?? '';

export function PayrollCraRemittancePanel({
  isZh,
  employerStableId,
}: {
  isZh: boolean;
  employerStableId: string;
}) {
  const [anchorDate, setAnchorDate] = useState(payrollLocalDateToday());
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [preview, setPreview] = useState<PayrollCraRemittancePreview | null>(
    null,
  );
  const [remittances, setRemittances] = useState<PayrollCraRemittance[]>([]);
  const [paymentAccountStableId, setPaymentAccountStableId] = useState('');
  const [paymentDate, setPaymentDate] = useState(payrollLocalDateToday());
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const eligibleBanks = useMemo(
    () =>
      accounts.filter(
        (account) => account.currency === 'CAD' && account.type === 'BANK',
      ),
    [accounts],
  );

  const load = useCallback(async () => {
    if (!employerStableId || !anchorDate) {
      setPreview(null);
      setRemittances([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const encodedEmployer = encodeURIComponent(employerStableId);
      const encodedAnchor = encodeURIComponent(anchorDate);
      const [nextAccounts, nextPreview, nextRemittances] = await Promise.all([
        apiFetch<AccountingAccount[]>('/accounting/accounts'),
        apiFetch<PayrollCraRemittancePreview>(
          '/accounting/payroll/employers/' +
            encodedEmployer +
            '/cra-remittances/preview?anchorDate=' +
            encodedAnchor,
        ),
        apiFetch<PayrollCraRemittance[]>(
          '/accounting/payroll/employers/' +
            encodedEmployer +
            '/cra-remittances?anchorDate=' +
            encodedAnchor,
        ),
      ]);
      setAccounts(nextAccounts);
      setPreview(nextPreview);
      setRemittances(nextRemittances);

      const banks = nextAccounts.filter(
        (account) => account.currency === 'CAD' && account.type === 'BANK',
      );
      setPaymentAccountStableId((current) =>
        banks.some((account) => account.accountStableId === current)
          ? current
          : banks[0]?.accountStableId ?? '',
      );
      const latestPayDate = latestIncludedPayDate(nextPreview);
      const today = payrollLocalDateToday();
      setPaymentDate(latestPayDate > today ? latestPayDate : today);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [anchorDate, employerStableId]);

  useEffect(() => {
    setPreview(null);
    setRemittances([]);
    setReference('');
    setMessage(null);
    setError(null);
    void load();
  }, [load]);

  if (!employerStableId) return null;

  const cppCents = preview
    ? preview.employeeCppCents +
      preview.employeeCpp2Cents +
      preview.employerCppCents +
      preview.employerCpp2Cents
    : 0;
  const eiCents = preview
    ? preview.employeeEiCents + preview.employerEiCents
    : 0;
  const minPaymentDate = latestIncludedPayDate(preview);
  const hasPayablePreview =
    Boolean(preview?.includedRuns.length) && (preview?.totalAmountCents ?? 0) > 0;

  async function settle(event: FormEvent) {
    event.preventDefault();
    if (!preview || !hasPayablePreview) return;
    if (!paymentAccountStableId) {
      setError(isZh ? '请选择银行付款账户。' : 'Select a BANK payment account.');
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiFetch<PayrollCraRemittance>(
        '/accounting/payroll/employers/' +
          encodeURIComponent(employerStableId) +
          '/cra-remittances',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            anchorDate,
            expectedEvidenceHash: preview.evidenceHash,
            paymentAccountStableId,
            paymentDate,
            reference: reference.trim() || null,
          }),
        },
      );
      setMessage(
        isZh
          ? 'CRA 工资代扣/供款汇款已记账。Journal：' +
              (result.journalEntryStableId ?? '—')
          : 'CRA payroll remittance posted. Journal: ' +
              (result.journalEntryStableId ?? '—'),
      );
      setReference('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold">
          {isZh ? 'CRA 工资汇款' : 'CRA payroll remittance'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? '按工资发薪日归入 CRA remittance period。金额由已入账 PayrollRun 的冻结税款、CPP/CPP2 和 EI 证据汇总，不能手填。'
            : 'The CRA remittance period is derived from payroll pay dates. Amounts are frozen from posted PayrollRun tax, CPP/CPP2 and EI evidence and cannot be edited.'}
        </p>
      </div>

      <label className="block max-w-xs text-xs text-slate-500">
        {isZh ? '目标汇款周期锚点日期' : 'Remittance-period anchor date'}
        <input
          type="date"
          value={anchorDate}
          onChange={(event) => setAnchorDate(event.target.value)}
          className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
        />
        <span className="mt-1 block">
          {isZh
            ? '选择该 CRA 周期内任意一个发薪日期。'
            : 'Choose any payroll pay date inside the target CRA period.'}
        </span>
      </label>

      {loading ? (
        <p className="text-sm text-slate-500">
          {isZh ? '正在读取 CRA 汇款状态…' : 'Loading CRA remittance status…'}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}

      {preview ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span>
              {isZh ? '周期' : 'Period'}: {preview.periodStart} →{' '}
              {preview.periodEnd}
            </span>
            <span>
              {isZh ? '到期日' : 'Due'}: {preview.dueDate}
            </span>
            <span>Remitter: {preview.remitterType}</span>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-lg bg-white px-3 py-2">
              <p className="text-xs text-slate-500">
                {isZh ? '所得税' : 'Income tax'}
              </p>
              <p className="font-semibold">
                {payrollMoney(preview.incomeTaxCents)}
              </p>
            </div>
            <div className="rounded-lg bg-white px-3 py-2">
              <p className="text-xs text-slate-500">CPP / CPP2</p>
              <p className="font-semibold">{payrollMoney(cppCents)}</p>
            </div>
            <div className="rounded-lg bg-white px-3 py-2">
              <p className="text-xs text-slate-500">EI</p>
              <p className="font-semibold">{payrollMoney(eiCents)}</p>
            </div>
            <div className="rounded-lg bg-white px-3 py-2">
              <p className="text-xs text-slate-500">
                {isZh ? '待汇总额' : 'Unremitted total'}
              </p>
              <p className="font-semibold">
                {payrollMoney(preview.totalAmountCents)}
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            {isZh ? '包含工资' : 'Included runs'}:{' '}
            {preview.includedRuns.length
              ? preview.includedRuns
                  .map((run) => run.runStableId + ' · ' + run.payDate)
                  .join(' / ')
              : isZh
                ? '本周期没有尚未汇款的已入账工资。'
                : 'No unremitted posted Payroll runs in this period.'}
          </p>
        </div>
      ) : null}

      {remittances.length ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">
            {isZh ? '本周期已完成汇款' : 'Completed remittances in this period'}
          </h3>
          {remittances.map((item) => {
            const accountName =
              accounts.find(
                (account) =>
                  account.accountStableId === item.paymentAccountStableId,
              )?.name ??
              item.paymentAccountStableId ??
              '—';
            return (
              <div
                key={item.remittanceStableId}
                className="grid gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm sm:grid-cols-2"
              >
                <span>
                  {payrollMoney(item.totalAmountCents)} ·{' '}
                  {item.paymentDate ?? '—'}
                </span>
                <span>
                  {isZh ? '银行账户' : 'Bank'}: {accountName}
                </span>
                <span>
                  {isZh ? '工资数' : 'Runs'}: {item.includedRuns.length}
                </span>
                <span className="break-all">
                  Journal: {item.journalEntryStableId ?? '—'}
                </span>
                {item.reference ? (
                  <span className="sm:col-span-2">
                    {isZh ? '参考号' : 'Reference'}: {item.reference}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {preview && !loading ? (
        hasPayablePreview ? (
          <form
            className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"
            onSubmit={(event) => void settle(event)}
          >
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs text-slate-500">
                {isZh ? '本次汇款金额' : 'Settlement amount'}
              </p>
              <p className="mt-1 font-semibold">
                {payrollMoney(preview.totalAmountCents)}
              </p>
            </div>
            <label className="text-xs text-slate-500">
              {isZh ? '付款银行账户' : 'Payment BANK account'}
              <select
                value={paymentAccountStableId}
                onChange={(event) =>
                  setPaymentAccountStableId(event.target.value)
                }
                className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="">
                  {isZh ? '选择 CAD BANK 账户' : 'Select CAD BANK account'}
                </option>
                {eligibleBanks.map((account) => (
                  <option
                    key={account.accountStableId}
                    value={account.accountStableId}
                  >
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              {isZh ? '实际付款日期' : 'Actual payment date'}
              <input
                type="date"
                min={minPaymentDate || undefined}
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
              />
            </label>
            <label className="text-xs text-slate-500">
              {isZh ? 'CRA 参考号（可选）' : 'CRA reference (optional)'}
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
                placeholder={isZh ? '例如付款确认号' : 'e.g. payment confirmation'}
              />
            </label>
            {paymentDate > preview.dueDate ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:col-span-2">
                {isZh
                  ? '付款日期晚于 CRA 到期日。系统仍会记录真实付款事实，不会把日期改回到期日。'
                  : 'The payment date is after the CRA due date. Payroll will record the real payment fact rather than rewriting it to the due date.'}
              </p>
            ) : null}
            {!eligibleBanks.length ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:col-span-2">
                {isZh
                  ? '没有可用的 active CAD BANK 会计账户，请先在 Accounting 账户中建立银行账户。'
                  : 'No active CAD BANK Accounting account is available. Create a bank account first.'}
              </p>
            ) : null}
            <div className="sm:col-span-2">
              <button
                disabled={
                  busy ||
                  !paymentAccountStableId ||
                  !paymentDate ||
                  !eligibleBanks.length
                }
                className="rounded-lg bg-[#87362E] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy
                  ? isZh
                    ? '正在记账…'
                    : 'Posting…'
                  : isZh
                    ? '确认 CRA 汇款'
                    : 'Post CRA remittance'}
              </button>
            </div>
          </form>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {isZh
              ? '当前 CRA 周期没有尚未汇款的已入账工资负债。'
              : 'This CRA period has no unremitted posted Payroll liability.'}
          </p>
        )
      ) : null}
    </section>
  );
}
