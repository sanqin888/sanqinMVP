'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import {
  payrollLocalDateToday,
  payrollMoney,
  type PayrollEmployeePayment,
  type PayrollPaymentAccount,
  type PayrollRun,
} from './payroll-types';

export function PayrollEmployeePaymentPanel({
  isZh,
  run,
}: {
  isZh: boolean;
  run: PayrollRun;
}) {
  const [accounts, setAccounts] = useState<PayrollPaymentAccount[]>([]);
  const [payment, setPayment] = useState<PayrollEmployeePayment | null>(null);
  const [paymentAccountStableId, setPaymentAccountStableId] = useState('');
  const [paymentDate, setPaymentDate] = useState(
    run.payDate > payrollLocalDateToday() ? run.payDate : payrollLocalDateToday(),
  );
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(run.status === 'POSTED');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const eligibleAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.currency === 'CAD' &&
          (account.type === 'BANK' || account.type === 'CASH'),
      ),
    [accounts],
  );

  useEffect(() => {
    setAccounts([]);
    setPayment(null);
    setPaymentAccountStableId('');
    setPaymentDate(
      run.payDate > payrollLocalDateToday() ? run.payDate : payrollLocalDateToday(),
    );
    setReference('');
    setError(null);
    setMessage(null);

    if (run.status !== 'POSTED') {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void Promise.all([
      apiFetch<PayrollPaymentAccount[]>('/accounting/accounts'),
      apiFetch<PayrollEmployeePayment | null>(
        '/accounting/payroll/runs/' +
          encodeURIComponent(run.runStableId) +
          '/employee-payment',
      ),
    ])
      .then(([nextAccounts, nextPayment]) => {
        if (cancelled) return;
        setAccounts(nextAccounts);
        setPayment(nextPayment);
        const eligible = nextAccounts.filter(
          (account) =>
            account.currency === 'CAD' &&
            (account.type === 'BANK' || account.type === 'CASH'),
        );
        setPaymentAccountStableId((current) =>
          eligible.some((account) => account.accountStableId === current)
            ? current
            : (eligible.find((account) => account.type === 'BANK') ??
                eligible[0])?.accountStableId ?? '',
        );
        setPaymentDate(
          run.payDate > payrollLocalDateToday()
            ? run.payDate
            : payrollLocalDateToday(),
        );
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [run.payDate, run.runStableId, run.status]);

  if (run.status !== 'POSTED') return null;

  const accountName = payment
    ? (accounts.find(
        (account) =>
          account.accountStableId === payment.paymentAccountStableId,
      )?.name ?? payment.paymentAccountStableId)
    : null;

  async function settle(event: FormEvent) {
    event.preventDefault();
    if (!paymentAccountStableId) {
      setError(isZh ? '请选择付款账户。' : 'Select a payment account.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const next = await apiFetch<PayrollEmployeePayment>(
        '/accounting/payroll/runs/' +
          encodeURIComponent(run.runStableId) +
          '/employee-payment',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentAccountStableId,
            paymentDate,
            reference: reference.trim() || null,
          }),
        },
      );
      setPayment(next);
      setMessage(
        isZh
          ? '员工净工资付款已记账。'
          : 'Employee net-pay settlement posted.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <h4 className="font-semibold">
          {isZh ? '员工净工资付款' : 'Employee net-pay settlement'}
        </h4>
        <p className="mt-1 text-xs text-slate-500">
          {isZh
            ? '仅清除应付员工净工资；付款金额固定使用这张已入账工资的 Net Pay，不可手填。'
            : 'This clears only employee net-pay payable. The amount is the frozen Net Pay from this posted run and cannot be edited.'}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">
          {isZh ? '正在读取付款状态…' : 'Loading settlement status…'}
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

      {payment ? (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <span>
            {isZh ? '金额' : 'Amount'}: {payrollMoney(payment.amountCents)}
          </span>
          <span>
            {isZh ? '付款日期' : 'Payment date'}: {payment.paymentDate}
          </span>
          <span>
            {isZh ? '付款账户' : 'Payment account'}: {accountName}
          </span>
          <span className="break-all">
            Journal: {payment.journalEntryStableId ?? '—'}
          </span>
          <span className="break-all sm:col-span-2">
            Payment ID: {payment.paymentStableId}
          </span>
          {payment.reference ? (
            <span className="sm:col-span-2">
              {isZh ? '参考号' : 'Reference'}: {payment.reference}
            </span>
          ) : null}
        </div>
      ) : !loading ? (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => void settle(event)}
        >
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-xs text-slate-500">
              {isZh ? '本次付款金额' : 'Settlement amount'}
            </p>
            <p className="mt-1 font-semibold">{payrollMoney(run.netPayCents)}</p>
          </div>
          <label className="text-xs text-slate-500">
            {isZh ? '付款账户' : 'Payment account'}
            <select
              className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
              value={paymentAccountStableId}
              onChange={(event) =>
                setPaymentAccountStableId(event.target.value)
              }
            >
              <option value="">
                {isZh ? '选择 BANK / CASH 账户' : 'Select BANK / CASH account'}
              </option>
              {eligibleAccounts.map((account) => (
                <option
                  key={account.accountStableId}
                  value={account.accountStableId}
                >
                  {account.name} · {account.type}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            {isZh ? '付款日期' : 'Payment date'}
            <input
              type="date"
              min={run.payDate}
              className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
            />
          </label>
          <label className="text-xs text-slate-500">
            {isZh ? '参考号（可选）' : 'Reference (optional)'}
            <input
              className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder={isZh ? '例如 EFT / 支票号' : 'e.g. EFT / cheque number'}
            />
          </label>
          {!eligibleAccounts.length ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:col-span-2">
              {isZh
                ? '没有可用的 active CAD BANK/CASH 会计账户，请先在 Accounting 账户中建立付款账户。'
                : 'No active CAD BANK/CASH Accounting account is available. Create a payment account first.'}
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <button
              disabled={
                busy ||
                !paymentAccountStableId ||
                !paymentDate ||
                (run.netPayCents ?? 0) <= 0
              }
              className="rounded-lg bg-[#87362E] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy
                ? isZh
                  ? '正在记账…'
                  : 'Posting…'
                : isZh
                  ? '确认员工付款'
                  : 'Post employee payment'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
