'use client';

import {
  payrollHours,
  payrollMoney,
  type PayrollRun,
} from './payroll-types';

const editableStatuses = new Set<PayrollRun['status']>(['DRAFT', 'CALCULATED']);
const statementStatuses = new Set<PayrollRun['status']>([
  'APPROVED',
  'POSTED',
  'REVERSED',
]);

export function PayrollRunReview({
  isZh,
  run,
  busy,
  calculate,
  approve,
  postRun,
  reverseRun,
  createCorrection,
  voidRun,
}: {
  isZh: boolean;
  run: PayrollRun;
  busy: boolean;
  calculate: (runStableId: string) => void;
  approve: (runStableId: string) => void;
  postRun: (runStableId: string) => void;
  reverseRun: (runStableId: string) => void;
  createCorrection: (runStableId: string) => void;
  voidRun: (runStableId: string) => void;
}) {
  const ytd = run.ytdAfter;

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {isZh ? '工资审核' : 'Payroll review'} · {run.payDate}
          </h3>
          <p className="mt-1 break-all text-xs text-slate-500">
            {run.runStableId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editableStatuses.has(run.status) ? (
            <button
              disabled={busy}
              onClick={() => calculate(run.runStableId)}
              className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {run.status === 'CALCULATED'
                ? isZh
                  ? '重新计算'
                  : 'Recalculate'
                : isZh
                  ? '计算'
                  : 'Calculate'}
            </button>
          ) : null}
          {run.status === 'CALCULATED' ? (
            <button
              disabled={busy}
              onClick={() => approve(run.runStableId)}
              className="rounded-lg bg-[#87362E] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isZh ? '批准并冻结' : 'Approve & freeze'}
            </button>
          ) : null}
          {run.status === 'APPROVED' ? (
            <>
              <button
                disabled={busy}
                onClick={() => postRun(run.runStableId)}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isZh ? '记账工资应计' : 'Post payroll accrual'}
              </button>
              <button
                disabled={busy}
                onClick={() => voidRun(run.runStableId)}
                className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
              >
                {isZh ? '作废' : 'Void'}
              </button>
            </>
          ) : null}
          {run.status === 'POSTED' ? (
            <button
              disabled={busy}
              onClick={() => reverseRun(run.runStableId)}
              className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
            >
              {isZh ? '冲销' : 'Reverse'}
            </button>
          ) : null}
          {run.status === 'REVERSED' ? (
            <button
              disabled={busy}
              onClick={() => createCorrection(run.runStableId)}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 disabled:opacity-50"
            >
              {isZh ? '创建更正草稿' : 'Create correction'}
            </button>
          ) : null}
          {statementStatuses.has(run.status) ? (
            <a
              href={
                '/api/v1/accounting/payroll/runs/' +
                encodeURIComponent(run.runStableId) +
                '/pay-statement.pdf'
              }
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"
            >
              {isZh ? '工资单 PDF' : 'Pay statement PDF'}
            </a>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric
          label={isZh ? '正常工资' : 'Regular pay'}
          value={payrollMoney(run.regularPayCents)}
        />
        <Metric
          label={isZh ? '加班工资' : 'Overtime pay'}
          value={payrollMoney(run.overtimePayCents)}
        />
        <Metric label="Gross" value={payrollMoney(run.grossPayCents)} strong />
        <Metric
          label={isZh ? '所得税' : 'Income tax'}
          value={payrollMoney(run.incomeTaxCents)}
        />
        <Metric
          label="CPP / CPP2"
          value={payrollMoney(
            (run.employeeCppCents ?? 0) + (run.employeeCpp2Cents ?? 0),
          )}
        />
        <Metric label="EI" value={payrollMoney(run.employeeEiCents)} />
        <Metric
          label={isZh ? '总扣款' : 'Total deductions'}
          value={payrollMoney(run.totalEmployeeDeductionsCents)}
        />
        <Metric
          label={isZh ? '净工资' : 'Net pay'}
          value={payrollMoney(run.netPayCents)}
          strong
        />
        <Metric
          label={isZh ? 'CRA 本期汇缴' : 'CRA remittance'}
          value={payrollMoney(run.craRemittanceCents)}
        />
      </div>

      <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
        <div className="grid gap-2 sm:grid-cols-2">
          <span>
            {isZh ? '正常工时' : 'Regular hours'}: {payrollHours(run.regularMinutes)}
          </span>
          <span>
            {isZh ? '加班工时' : 'Overtime hours'}: {payrollHours(run.overtimeMinutes)}
          </span>
          <span>
            {isZh ? '更正序列' : 'Correction sequence'}:{' '}
            {run.correctionSequence > 0
              ? `#${run.correctionSequence}`
              : isZh
                ? '原始记录'
                : 'Original'}
          </span>
          <span className="break-all">
            {isZh ? '上一条记录' : 'Predecessor'}:{' '}
            {run.correctionOfRunStableId ?? '—'}
          </span>
          <span>Policy: {run.statutoryPolicyVersion ?? '—'}</span>
          <span>P: {run.payPeriodsPerYear ?? '—'}</span>
          <span>Profile: {run.calculationProfileVersion ?? '—'}</span>
          <span>Statement: {run.payStatementTemplateVersion ?? '—'}</span>
          <span>
            Journal: {run.postedJournalEntryStableId ?? '—'}
          </span>
          <span>
            {isZh ? '入账时间' : 'Posted at'}: {run.postedAt ?? '—'}
          </span>
          {run.reversedAt ? (
            <>
              <span className="break-all">
                {isZh ? '冲销 Journal' : 'Reversal Journal'}:{' '}
                {run.reversalJournalEntryStableId ?? '—'}
              </span>
              <span>
                {isZh ? '冲销时间' : 'Reversed at'}: {run.reversedAt}
              </span>
              <span className="break-all">
                {isZh ? '冲销原因' : 'Reversal reason'}:{' '}
                {run.reversalReason ?? '—'}
              </span>
              <span className="break-all">
                {isZh ? '冲销操作人' : 'Reversed by'}:{' '}
                {run.reversedByActorRef ?? '—'}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {ytd ? (
        <div>
          <h4 className="mb-2 font-semibold">
            {isZh ? 'YTD 审核' : 'YTD review'}
          </h4>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Metric
              label="Gross YTD"
              value={payrollMoney(ytd.grossEarningsYtdCents)}
            />
            <Metric
              label="Net YTD"
              value={payrollMoney(ytd.netPayYtdCents)}
            />
            <Metric
              label="Tax YTD"
              value={payrollMoney(ytd.incomeTaxYtdCents)}
            />
            <Metric
              label="CPP YTD"
              value={payrollMoney(ytd.employeeCppYtdCents)}
            />
            <Metric
              label="CPP2 YTD"
              value={payrollMoney(ytd.employeeCpp2YtdCents)}
            />
            <Metric
              label="EI YTD"
              value={payrollMoney(ytd.employeeEiYtdCents)}
            />
            <Metric
              label="Pensionable YTD"
              value={payrollMoney(ytd.pensionableEarningsYtdCents)}
            />
            <Metric
              label="Insurable YTD"
              value={payrollMoney(ytd.insurableEarningsYtdCents)}
            />
            <Metric
              label={isZh ? 'Vacation 累积 YTD' : 'Vacation accrued YTD'}
              value={payrollMoney(ytd.vacationPayAccruedYtdCents)}
            />
          </div>
        </div>
      ) : (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {isZh
            ? '这张记录还没有冻结的 YTD 结果；先执行计算。'
            : 'This run has no frozen YTD result yet; calculate it first.'}
        </p>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={strong ? 'mt-1 text-lg font-semibold' : 'mt-1 font-medium'}>
        {value}
      </p>
    </div>
  );
}
