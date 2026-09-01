'use client';

import type { ReactNode } from 'react';

export const settingsInputClass =
  'mt-1.5 min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#87362E] focus:ring-2 focus:ring-[#87362E]/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

export const settingsTextareaClass = `${settingsInputClass} min-h-24 resize-y`;

export function SettingsField({
  label,
  description,
  children,
  className = '',
}: {
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm font-medium text-slate-800 ${className}`}>
      <span>{label}</span>
      {description ? (
        <span className="mt-0.5 block text-xs font-normal leading-5 text-slate-500">
          {description}
        </span>
      ) : null}
      {children}
    </label>
  );
}

export function SettingsToggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-12 items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="mt-0.5 size-4 shrink-0 rounded border-slate-300 text-[#87362E] focus:ring-[#87362E]/30"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-5 text-slate-500">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export function ReadonlyValue({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <div className="mt-1 break-words text-sm font-medium text-slate-900">
        {value}
      </div>
    </div>
  );
}

export function SettingsSaveButton({
  saving,
  disabled,
  children,
  form,
}: {
  saving: boolean;
  disabled?: boolean;
  children: ReactNode;
  form?: string;
}) {
  return (
    <button
      type="submit"
      form={form}
      disabled={saving || disabled}
      className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#87362E] px-4 py-2 text-sm font-semibold text-white shadow-sm outline-none transition hover:bg-[#762f28] focus-visible:ring-2 focus-visible:ring-[#87362E]/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}
