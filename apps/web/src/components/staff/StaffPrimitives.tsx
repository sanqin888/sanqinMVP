import clsx from 'clsx';
import type {
  HTMLAttributes,
  ReactNode,
} from 'react';

type ClassNameProps = {
  className?: string;
};

export function StaffPage({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('space-y-6', className)} {...props} />;
}

export function StaffPageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
} & ClassNameProps) {
  return (
    <header
      className={clsx(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}

export function StaffSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
} & ClassNameProps) {
  return (
    <section className={clsx('space-y-3', className)}>
      {title || description || actions ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {title ? (
              <h2 className="text-base font-semibold text-slate-950 sm:text-lg">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StaffPanel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-950/5',
        className,
      )}
      {...props}
    />
  );
}

export function StaffToolbar({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-950/5 sm:flex-row sm:items-center sm:justify-between sm:p-4',
        className,
      )}
      {...props}
    />
  );
}

export function StaffStat({
  label,
  value,
  detail,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
} & ClassNameProps) {
  return (
    <StaffPanel className={clsx('p-4 sm:p-5', className)}>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
        {value}
      </div>
      {detail ? <div className="mt-2 text-xs text-slate-500">{detail}</div> : null}
    </StaffPanel>
  );
}

type FeedbackTone = 'neutral' | 'success' | 'warning' | 'danger';

const feedbackToneClasses: Record<FeedbackTone, string> = {
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-red-200 bg-red-50 text-red-800',
};

export function StaffFeedback({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: FeedbackTone;
  children: ReactNode;
} & ClassNameProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={clsx(
        'rounded-xl border px-4 py-3 text-sm leading-6',
        feedbackToneClasses[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StaffEmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
} & ClassNameProps) {
  return (
    <div
      className={clsx(
        'flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">{description}</p>
      ) : null}
      {actions ? <div className="mt-5">{actions}</div> : null}
    </div>
  );
}
