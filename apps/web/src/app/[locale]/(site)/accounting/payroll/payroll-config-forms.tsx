'use client';

import { FormEvent, type ReactNode, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import {
  parseMoneyToCents,
  payrollLocalDateToday,
} from './payroll-types';
const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900';

type SharedProps = {
  isZh: boolean;
  onChanged: () => Promise<void>;
};

export function PayrollEmployerConfigForm({
  isZh,
  employerStableId,
  onChanged,
}: SharedProps & { employerStableId: string }) {
  const [effectiveFrom, setEffectiveFrom] = useState(payrollLocalDateToday());
  const [remitterType, setRemitterType] = useState<
    'QUARTERLY' | 'REGULAR' | 'ACCELERATED_THRESHOLD_1' | 'ACCELERATED_THRESHOLD_2'
  >('REGULAR');
  const [eiMultiplier, setEiMultiplier] = useState('1.4');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const multiplier = Number(eiMultiplier);
    const eiEmployerMultiplierMicros = Math.round(multiplier * 1_000_000);
    if (
      !Number.isFinite(multiplier) ||
      multiplier <= 0 ||
      !Number.isSafeInteger(eiEmployerMultiplierMicros)
    ) {
      setError(isZh ? 'EI employer multiplier 无效。' : 'EI employer multiplier is invalid.');
      return;
    }

    setBusy(true);
    setError(null);
    void apiFetch(
      '/accounting/payroll/employers/' +
        encodeURIComponent(employerStableId) +
        '/configs',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          effectiveFrom,
          remitterType,
          eiEmployerMultiplierMicros,
        }),
      },
    )
      .then(onChanged)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setBusy(false));
  }

  return (
    <form className="space-y-3 rounded-lg border border-slate-200 p-3" onSubmit={submit}>
      <p className="text-sm font-medium">
        {isZh ? '新增雇主法定配置' : 'Add employer statutory config'}
      </p>
      {error ? <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p> : null}
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-slate-500">
          {isZh ? '生效日' : 'Effective date'}
          <input
            type="date"
            className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm text-slate-900"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
        </label>
        <label className="text-xs text-slate-500">
          {isZh ? 'CRA remitter 类型' : 'CRA remitter type'}
          <select
            className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm text-slate-900"
            value={remitterType}
            onChange={(event) => setRemitterType(event.target.value as typeof remitterType)}
          >
            <option value="QUARTERLY">QUARTERLY</option>
            <option value="REGULAR">REGULAR</option>
            <option value="ACCELERATED_THRESHOLD_1">ACCELERATED_THRESHOLD_1</option>
            <option value="ACCELERATED_THRESHOLD_2">ACCELERATED_THRESHOLD_2</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          EI employer multiplier
          <input
            inputMode="decimal"
            className="mt-1 block w-full rounded-lg border px-2 py-2 text-sm text-slate-900"
            value={eiMultiplier}
            onChange={(event) => setEiMultiplier(event.target.value)}
          />
        </label>
      </div>
      <button
        disabled={busy}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        {busy
          ? isZh
            ? '保存中…'
            : 'Saving…'
          : isZh
            ? '添加雇主配置'
            : 'Add employer config'}
      </button>
    </form>
  );
}

export function PayrollEmployeeConfigForm({
  isZh,
  employeeStableId,
  onChanged,
}: SharedProps & { employeeStableId: string }) {
  const [effectiveFrom, setEffectiveFrom] = useState(payrollLocalDateToday());
  const [anchorDate, setAnchorDate] = useState(payrollLocalDateToday());
  const [payFrequency, setPayFrequency] =
    useState<'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY'>('BIWEEKLY');
  const [hourlyRate, setHourlyRate] = useState('17.60');
  const [federalTd1Mode, setFederalTd1Mode] =
    useState<'FILED_TOTAL_CLAIM' | 'NO_FORM_DEFAULT'>('NO_FORM_DEFAULT');
  const [federalClaim, setFederalClaim] = useState('');
  const [ontarioTd1Mode, setOntarioTd1Mode] =
    useState<'FILED_TOTAL_CLAIM' | 'NO_FORM_DEFAULT'>('NO_FORM_DEFAULT');
  const [ontarioClaim, setOntarioClaim] = useState('');
  const [incomeTaxTreatment, setIncomeTaxTreatment] =
    useState<'STANDARD' | 'TD1_CLAIM_CODE_E_REVIEWED'>('STANDARD');
  const [additionalTax, setAdditionalTax] = useState('0.00');
  const [cppTreatment, setCppTreatment] =
    useState<'STANDARD' | 'EXEMPT_REVIEWED'>('STANDARD');
  const [cppExceptionCode, setCppExceptionCode] = useState('');
  const [cppExceptionNote, setCppExceptionNote] = useState('');
  const [eiTreatment, setEiTreatment] =
    useState<'INSURABLE' | 'NON_INSURABLE_REVIEWED'>('INSURABLE');
  const [eiExceptionCode, setEiExceptionCode] = useState('');
  const [eiExceptionNote, setEiExceptionNote] = useState('');
  const [vacationTreatment, setVacationTreatment] =
    useState<'ACCRUED' | 'PAID_EACH_RUN'>('ACCRUED');
  const [vacationRate, setVacationRate] = useState('4');
  const [vacationAgreementNote, setVacationAgreementNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();

    let defaultHourlyRateCents: number;
    let federalTd1TotalClaimCents: number | null = null;
    let ontarioTd1TotalClaimCents: number | null = null;
    let additionalTaxPerPayCents: number;
    const vacationRateNumber = Number(vacationRate);
    try {
      defaultHourlyRateCents = parseMoneyToCents(
        hourlyRate,
        isZh ? '默认时薪' : 'Default hourly rate',
      );
      additionalTaxPerPayCents = parseMoneyToCents(
        additionalTax,
        isZh ? '每期额外扣税' : 'Additional tax per pay',
      );
      if (federalTd1Mode === 'FILED_TOTAL_CLAIM') {
        federalTd1TotalClaimCents = parseMoneyToCents(
          federalClaim,
          isZh ? 'Federal TD1 total claim' : 'Federal TD1 total claim',
        );
      }
      if (ontarioTd1Mode === 'FILED_TOTAL_CLAIM') {
        ontarioTd1TotalClaimCents = parseMoneyToCents(
          ontarioClaim,
          isZh ? 'Ontario TD1 total claim' : 'Ontario TD1 total claim',
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return;
    }

    if (!Number.isFinite(vacationRateNumber) || vacationRateNumber < 0) {
      setError(isZh ? 'Vacation 比例无效。' : 'Vacation rate is invalid.');
      return;
    }

    setBusy(true);
    setError(null);
    void apiFetch(
      '/accounting/payroll/employees/' +
        encodeURIComponent(employeeStableId) +
        '/configs',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          effectiveFrom,
          provinceOfEmployment: 'ON',
          payFrequency,
          payScheduleAnchorDate: anchorDate,
          defaultHourlyRateCents,
          federalTd1Mode,
          federalTd1TotalClaimCents,
          ontarioTd1Mode,
          ontarioTd1TotalClaimCents,
          incomeTaxTreatment,
          additionalTaxPerPayCents,
          cppTreatment,
          cppExceptionCode:
            cppTreatment === 'EXEMPT_REVIEWED' ? cppExceptionCode : null,
          cppExceptionNote:
            cppTreatment === 'EXEMPT_REVIEWED' ? cppExceptionNote : null,
          eiTreatment,
          eiExceptionCode:
            eiTreatment === 'NON_INSURABLE_REVIEWED' ? eiExceptionCode : null,
          eiExceptionNote:
            eiTreatment === 'NON_INSURABLE_REVIEWED' ? eiExceptionNote : null,
          vacationTreatment,
          vacationRateBasisPoints: Math.round(vacationRateNumber * 100),
          vacationAgreementConfirmedAt:
            vacationTreatment === 'PAID_EACH_RUN'
              ? new Date().toISOString()
              : null,
          vacationAgreementNote:
            vacationTreatment === 'PAID_EACH_RUN'
              ? vacationAgreementNote || 'Confirmed by payroll operator'
              : null,
        }),
      },
    )
      .then(onChanged)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setBusy(false));
  }

  return (
    <form className="space-y-4 rounded-lg border border-slate-200 p-3" onSubmit={submit}>
      <div>
        <p className="text-sm font-medium">
          {isZh ? '新增员工法定配置' : 'Add employee statutory config'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {isZh
            ? '把 TD1 / CPP / EI 等经过审核的事实明确保存；浏览器不计算结果。'
            : 'Save reviewed TD1 / CPP / EI facts explicitly; the browser does not calculate deductions.'}
        </p>
      </div>
      {error ? <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p> : null}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <Field label={isZh ? '生效日' : 'Effective date'}>
          <input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className={inputClass} />
        </Field>
        <Field label={isZh ? '工资日锚点' : 'Pay schedule anchor'}>
          <input type="date" value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} className={inputClass} />
        </Field>
        <Field label={isZh ? '发薪频率' : 'Pay frequency'}>
          <select value={payFrequency} onChange={(event) => setPayFrequency(event.target.value as typeof payFrequency)} className={inputClass}>
            <option value="WEEKLY">WEEKLY</option>
            <option value="BIWEEKLY">BIWEEKLY</option>
            <option value="SEMIMONTHLY">SEMIMONTHLY</option>
            <option value="MONTHLY">MONTHLY</option>
          </select>
        </Field>
        <Field label={isZh ? '默认时薪' : 'Default hourly rate'}>
          <input inputMode="decimal" value={hourlyRate} onChange={(event) => setHourlyRate(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Federal TD1">
          <select value={federalTd1Mode} onChange={(event) => setFederalTd1Mode(event.target.value as typeof federalTd1Mode)} className={inputClass}>
            <option value="NO_FORM_DEFAULT">NO_FORM_DEFAULT</option>
            <option value="FILED_TOTAL_CLAIM">FILED_TOTAL_CLAIM</option>
          </select>
        </Field>
        {federalTd1Mode === 'FILED_TOTAL_CLAIM' ? (
          <Field label="Federal TD1 total claim">
            <input inputMode="decimal" value={federalClaim} onChange={(event) => setFederalClaim(event.target.value)} className={inputClass} />
          </Field>
        ) : null}
        <Field label="Ontario TD1">
          <select value={ontarioTd1Mode} onChange={(event) => setOntarioTd1Mode(event.target.value as typeof ontarioTd1Mode)} className={inputClass}>
            <option value="NO_FORM_DEFAULT">NO_FORM_DEFAULT</option>
            <option value="FILED_TOTAL_CLAIM">FILED_TOTAL_CLAIM</option>
          </select>
        </Field>
        {ontarioTd1Mode === 'FILED_TOTAL_CLAIM' ? (
          <Field label="Ontario TD1 total claim">
            <input inputMode="decimal" value={ontarioClaim} onChange={(event) => setOntarioClaim(event.target.value)} className={inputClass} />
          </Field>
        ) : null}
        <Field label={isZh ? '所得税处理' : 'Income-tax treatment'}>
          <select value={incomeTaxTreatment} onChange={(event) => setIncomeTaxTreatment(event.target.value as typeof incomeTaxTreatment)} className={inputClass}>
            <option value="STANDARD">STANDARD</option>
            <option value="TD1_CLAIM_CODE_E_REVIEWED">TD1_CLAIM_CODE_E_REVIEWED</option>
          </select>
        </Field>
        <Field label={isZh ? '每期额外扣税' : 'Additional tax per pay'}>
          <input inputMode="decimal" value={additionalTax} onChange={(event) => setAdditionalTax(event.target.value)} className={inputClass} />
        </Field>
        <Field label="CPP">
          <select value={cppTreatment} onChange={(event) => setCppTreatment(event.target.value as typeof cppTreatment)} className={inputClass}>
            <option value="STANDARD">STANDARD</option>
            <option value="EXEMPT_REVIEWED">EXEMPT_REVIEWED</option>
          </select>
        </Field>
        <Field label="EI">
          <select value={eiTreatment} onChange={(event) => setEiTreatment(event.target.value as typeof eiTreatment)} className={inputClass}>
            <option value="INSURABLE">INSURABLE</option>
            <option value="NON_INSURABLE_REVIEWED">NON_INSURABLE_REVIEWED</option>
          </select>
        </Field>
        <Field label="Vacation">
          <select value={vacationTreatment} onChange={(event) => setVacationTreatment(event.target.value as typeof vacationTreatment)} className={inputClass}>
            <option value="ACCRUED">{isZh ? '累积' : 'Accrued'}</option>
            <option value="PAID_EACH_RUN">{isZh ? '每期支付' : 'Paid each run'}</option>
          </select>
        </Field>
        <Field label="Vacation %">
          <input inputMode="decimal" value={vacationRate} onChange={(event) => setVacationRate(event.target.value)} className={inputClass} />
        </Field>
      </div>

      {cppTreatment === 'EXEMPT_REVIEWED' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label={isZh ? 'CPP exception code' : 'CPP exception code'}>
            <input value={cppExceptionCode} onChange={(event) => setCppExceptionCode(event.target.value)} className={inputClass} />
          </Field>
          <Field label={isZh ? 'CPP 审核说明' : 'CPP review note'}>
            <input value={cppExceptionNote} onChange={(event) => setCppExceptionNote(event.target.value)} className={inputClass} />
          </Field>
        </div>
      ) : null}

      {eiTreatment === 'NON_INSURABLE_REVIEWED' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label={isZh ? 'EI exception code' : 'EI exception code'}>
            <input value={eiExceptionCode} onChange={(event) => setEiExceptionCode(event.target.value)} className={inputClass} />
          </Field>
          <Field label={isZh ? 'EI 审核说明' : 'EI review note'}>
            <input value={eiExceptionNote} onChange={(event) => setEiExceptionNote(event.target.value)} className={inputClass} />
          </Field>
        </div>
      ) : null}

      {vacationTreatment === 'PAID_EACH_RUN' ? (
        <Field label={isZh ? 'Vacation agreement 说明' : 'Vacation agreement note'}>
          <input value={vacationAgreementNote} onChange={(event) => setVacationAgreementNote(event.target.value)} className={inputClass} />
        </Field>
      ) : null}

      <button
        disabled={busy}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        {busy
          ? isZh
            ? '保存中…'
            : 'Saving…'
          : isZh
            ? '添加员工工资配置'
            : 'Add employee payroll config'}
      </button>

    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="text-xs text-slate-500">
      {label}
      {children}
    </label>
  );
}
