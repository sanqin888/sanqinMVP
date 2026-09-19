'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import type { PayrollYearOpening } from '../contracts/payroll';
import {
  parseMoneyToCents,
  payrollLocalDateToday,
  payrollMoney,
} from './payroll-ui';

type Props = {
  isZh: boolean;
  employeeStableId: string;
};

const MONEY_FIELDS = [
  ['grossEarningsYtdCents', 'Gross earnings YTD', '历史工资总额'],
  ['netPayYtdCents', 'Net pay YTD', '历史净工资'],
  ['periodicEarningsYtdCents', 'Periodic earnings YTD', '历史周期性收入'],
  ['nonPeriodicEarningsYtdCents', 'Non-periodic earnings YTD', '历史非周期性收入'],
  ['pensionableEarningsYtdCents', 'Pensionable earnings YTD', 'CPP pensionable 收入'],
  ['employeeCppYtdCents', 'CPP YTD', 'CPP 已扣'],
  ['employeeCpp2YtdCents', 'CPP2 YTD', 'CPP2 已扣'],
  ['insurableEarningsYtdCents', 'Insurable earnings YTD', 'EI insurable 收入'],
  ['employeeEiYtdCents', 'EI YTD', 'EI 已扣'],
  ['incomeTaxYtdCents', 'Income tax YTD', '所得税已扣'],
  [
    'nonPeriodicCppBaseContributionYtdCents',
    'Non-periodic base CPP credit YTD',
    '非周期收入 base CPP credit',
  ],
  [
    'nonPeriodicCppAdditionalDeductionYtdCents',
    'Non-periodic additional CPP deduction YTD',
    '非周期收入 additional CPP/CPP2 deduction',
  ],
  [
    'nonPeriodicEiPremiumYtdCents',
    'Non-periodic EI premium YTD',
    '非周期收入 EI premium',
  ],
  ['vacationPayPaidYtdCents', 'Vacation paid YTD', 'Vacation 已支付'],
  ['vacationPayAccruedYtdCents', 'Vacation accrued YTD', 'Vacation 已累积'],
] as const;

type MoneyField = (typeof MONEY_FIELDS)[number][0];

const emptyValues = (): Record<MoneyField, string> =>
  Object.fromEntries(MONEY_FIELDS.map(([field]) => [field, '0.00'])) as Record<
    MoneyField,
    string
  >;

const centsToInput = (cents: number) => (cents / 100).toFixed(2);

export function PayrollYearOpeningPanel({ isZh, employeeStableId }: Props) {
  const currentYear = new Date().getFullYear();
  const [taxYear, setTaxYear] = useState(currentYear);
  const [asOfDate, setAsOfDate] = useState(payrollLocalDateToday());
  const [sourceNote, setSourceNote] = useState('Same-employer prior payroll before SanQ');
  const [values, setValues] = useState<Record<MoneyField, string>>(emptyValues);
  const [opening, setOpening] = useState<PayrollYearOpening | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const endpoint = useMemo(
    () =>
      employeeStableId
        ? '/accounting/payroll/employees/' +
          encodeURIComponent(employeeStableId) +
          '/openings/' +
          taxYear
        : '',
    [employeeStableId, taxYear],
  );

  useEffect(() => {
    if (!endpoint) {
      setOpening(null);
      setValues(emptyValues());
      return;
    }
    setLoading(true);
    setError(null);
    void apiFetch<PayrollYearOpening | null>(endpoint)
      .then((next) => {
        setOpening(next);
        if (!next) {
          setValues(emptyValues());
          return;
        }
        setAsOfDate(next.asOfDate);
        setSourceNote(next.sourceNote);
        setValues(
          Object.fromEntries(
            MONEY_FIELDS.map(([field]) => [field, centsToInput(next[field])]),
          ) as Record<MoneyField, string>,
        );
      })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setLoading(false));
  }, [endpoint]);

  function save(event: FormEvent) {
    event.preventDefault();
    if (!endpoint) return;

    const amounts = {} as Record<MoneyField, number>;
    try {
      for (const [field, en, zh] of MONEY_FIELDS) {
        amounts[field] = parseMoneyToCents(values[field], isZh ? zh : en);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    void apiFetch<PayrollYearOpening>(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asOfDate,
        ...amounts,
        sourceNote,
      }),
    })
      .then((next) => {
        setOpening(next);
        setMessage(isZh ? 'Year Opening 已保存。' : 'Year Opening saved.');
      })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setSaving(false));
  }

  if (!employeeStableId) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {isZh ? 'Year Opening（年中接入）' : 'Year Opening (mid-year start)'}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            {isZh
              ? '只有同一雇主在 SanQ 第一次 APPROVED 工资前的历史 YTD 才填这里。没有历史工资就全部保持 0。'
              : 'Enter only same-employer YTD facts from before the first SanQ APPROVED run. Leave all values at zero when there is no prior payroll.'}
          </p>
        </div>
        <label className="text-xs text-slate-500">
          {isZh ? '税年' : 'Tax year'}
          <input
            type="number"
            className="ml-2 w-24 rounded-lg border px-2 py-1.5 text-sm text-slate-900"
            value={taxYear}
            onChange={(event) => setTaxYear(Number(event.target.value))}
          />
        </label>
      </div>

      {loading ? <p className="text-sm text-slate-500">{isZh ? '加载中…' : 'Loading…'}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

      {opening ? (
        <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-600">
          <p className="font-medium text-slate-800">
            {isZh ? '当前 Opening' : 'Current opening'} v{opening.version}
          </p>
          <p className="mt-1 text-xs">
            {isZh ? '截至' : 'As of'} {opening.asOfDate} · Gross YTD{' '}
            {payrollMoney(opening.grossEarningsYtdCents)}
          </p>
        </div>
      ) : (
        <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-600">
          {isZh
            ? '当前员工没有 Year Opening。只有接入 SanQ 前已经存在同雇主 YTD 时才需要填写。'
            : 'This employee has no Year Opening. Add one only when same-employer YTD existed before SanQ payroll started.'}
        </p>
      )}

      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {opening
            ? isZh
              ? '更新 Year Opening'
              : 'Update Year Opening'
            : isZh
              ? '新增 Year Opening'
              : 'Add Year Opening'}
        </summary>

        <form className="mt-4 space-y-4" onSubmit={save}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-500">
              {isZh ? '截至日期' : 'As-of date'}
              <input
                type="date"
                className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-slate-900"
                value={asOfDate}
                onChange={(event) => setAsOfDate(event.target.value)}
                required
              />
            </label>
            <label className="text-xs text-slate-500">
              {isZh ? '证据说明' : 'Evidence note'}
              <input
                className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-slate-900"
                value={sourceNote}
                onChange={(event) => setSourceNote(event.target.value)}
                required
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {MONEY_FIELDS.map(([field, en, zh]) => (
              <label key={field} className="text-xs text-slate-500">
                {isZh ? zh : en}
                <input
                  inputMode="decimal"
                  className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-slate-900"
                  value={values[field]}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>

          <button
            disabled={saving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving
              ? isZh
                ? '保存中…'
                : 'Saving…'
              : opening
                ? isZh
                  ? '更新 Year Opening'
                  : 'Update Year Opening'
                : isZh
                  ? '保存 Year Opening'
                  : 'Save Year Opening'}
          </button>
        </form>
      </details>
    </section>
  );
}
