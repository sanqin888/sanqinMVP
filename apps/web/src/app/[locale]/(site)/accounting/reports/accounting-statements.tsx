'use client';

import type { ReactNode } from 'react';
import type {
  AccountingBalanceMovementAccountRow,
  AccountingBalanceMovementAmounts,
  AccountingBalanceMovementReport,
  AccountingBalanceMovementSection,
  AccountingTrialBalanceCloseStatus,
  AccountingTrialBalanceReport,
} from '../contracts/reports';

const money = (cents: number) =>
  `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;

function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  const toneClass =
    tone === 'good'
      ? 'bg-emerald-50 text-emerald-700'
      : tone === 'warn'
        ? 'bg-amber-50 text-amber-800'
        : 'bg-slate-100 text-slate-600';
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      {children}
    </span>
  );
}

function closeLabel(
  closeStatus: AccountingTrialBalanceCloseStatus,
  isZh: boolean,
) {
  return closeStatus.allMonthsClosed
    ? isZh
      ? '区间月份已全部月结'
      : 'All months closed'
    : isZh
      ? '区间包含未月结月份'
      : 'Includes open months';
}

function StatementMeta({
  report,
  isZh,
}: {
  report: Pick<
    AccountingTrialBalanceReport,
    | 'scope'
    | 'currency'
    | 'timezone'
    | 'accountingStartDate'
    | 'requestedFrom'
    | 'requestedTo'
    | 'effectiveFrom'
    | 'effectiveTo'
    | 'closeStatus'
  >;
  isZh: boolean;
}) {
  const clamped =
    report.requestedFrom !== report.effectiveFrom ||
    report.requestedTo !== report.effectiveTo;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap gap-2">
        <StatusBadge>{report.scope}</StatusBadge>
        <StatusBadge>{report.currency}</StatusBadge>
        <StatusBadge>{report.timezone}</StatusBadge>
        <StatusBadge tone={report.closeStatus.allMonthsClosed ? 'good' : 'warn'}>
          {closeLabel(report.closeStatus, isZh)}
        </StatusBadge>
      </div>
      <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
        <span>
          {isZh ? '请求区间' : 'Requested'}: {report.requestedFrom} —{' '}
          {report.requestedTo}
        </span>
        <span>
          {isZh ? '有效区间' : 'Effective'}: {report.effectiveFrom} —{' '}
          {report.effectiveTo}
        </span>
        <span>
          {isZh ? '财务起始日' : 'Accounting start'}:{' '}
          {report.accountingStartDate}
        </span>
        <span>
          {isZh ? '覆盖月份' : 'Months'}: {report.closeStatus.months.length}
        </span>
      </div>
      {clamped ? (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
          {isZh
            ? `请求区间已按财务边界调整为 ${report.effectiveFrom} — ${report.effectiveTo}；报表金额只使用有效区间。`
            : `The requested range was clamped to ${report.effectiveFrom} — ${report.effectiveTo}; statement amounts use the effective range only.`}
        </p>
      ) : null}
    </div>
  );
}

export function TrialBalanceStatement({
  report,
  isZh,
}: {
  report: AccountingTrialBalanceReport;
  isZh: boolean;
}) {
  const balanced =
    report.totals.openingDebitBalanceCents ===
      report.totals.openingCreditBalanceCents &&
    report.totals.periodDebitCents === report.totals.periodCreditCents &&
    report.totals.closingDebitBalanceCents ===
      report.totals.closingCreditBalanceCents;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              {isZh ? '试算平衡表' : 'Trial Balance'}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              {isZh
                ? '全部金额直接来自 canonical Journal；Management 报表过滤不会影响这里。'
                : 'All amounts come directly from the canonical Journal; Management-report filtering does not apply here.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={balanced ? 'good' : 'warn'}>
              {balanced
                ? isZh
                  ? '借贷平衡'
                  : 'Debits = credits'
                : isZh
                  ? '借贷不平'
                  : 'Out of balance'}
            </StatusBadge>
            <StatusBadge>
              {isZh ? '显式期初分录' : 'Explicit opening journals'}:{' '}
              {report.openingBalanceJournal.entryCount}
            </StatusBadge>
          </div>
        </div>
        <div className="mt-4">
          <StatementMeta report={report} isZh={isZh} />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <BalanceTotalCard
          label={isZh ? '期初余额' : 'Opening balance'}
          debit={report.totals.openingDebitBalanceCents}
          credit={report.totals.openingCreditBalanceCents}
          isZh={isZh}
        />
        <BalanceTotalCard
          label={isZh ? '本期发生' : 'Period activity'}
          debit={report.totals.periodDebitCents}
          credit={report.totals.periodCreditCents}
          isZh={isZh}
        />
        <BalanceTotalCard
          label={isZh ? '期末余额' : 'Closing balance'}
          debit={report.totals.closingDebitBalanceCents}
          credit={report.totals.closingCreditBalanceCents}
          isZh={isZh}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold">{isZh ? '账户明细' : 'Account detail'}</h3>
          <p className="mt-1 text-xs text-slate-500">
            {isZh
              ? `共 ${report.accounts.length} 个有 Journal 历史的账户；停用历史账户仍保留。`
              : `${report.accounts.length} accounts with Journal history; inactive historical accounts remain visible.`}
          </p>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {report.accounts.map((row) => (
            <div
              key={row.accountStableId}
              className="rounded-xl border border-slate-200 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{row.accountName}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.accountClass}
                    {row.accountType ? ` · ${row.accountType}` : ''}
                    {' · '}
                    {row.normalSide}
                  </p>
                </div>
                {!row.isActive ? (
                  <StatusBadge tone="warn">
                    {isZh ? '已停用' : 'Inactive'}
                  </StatusBadge>
                ) : null}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <MiniAmount
                  label={isZh ? '期初' : 'Opening'}
                  cents={row.openingNormalBalanceCents}
                />
                <MiniAmount
                  label={isZh ? '本期' : 'Period'}
                  cents={row.periodNormalMovementCents}
                />
                <MiniAmount
                  label={isZh ? '期末' : 'Closing'}
                  cents={row.closingNormalBalanceCents}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span>
                  {isZh ? '本期借方' : 'Period debit'}:{' '}
                  {money(row.periodDebitCents)}
                </span>
                <span className="text-right">
                  {isZh ? '本期贷方' : 'Period credit'}:{' '}
                  {money(row.periodCreditCents)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[1040px] w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">
                  {isZh ? '账户' : 'Account'}
                </th>
                <th className="px-3 py-3 text-right">
                  {isZh ? '期初借' : 'Opening Dr'}
                </th>
                <th className="px-3 py-3 text-right">
                  {isZh ? '期初贷' : 'Opening Cr'}
                </th>
                <th className="px-3 py-3 text-right">
                  {isZh ? '本期借' : 'Period Dr'}
                </th>
                <th className="px-3 py-3 text-right">
                  {isZh ? '本期贷' : 'Period Cr'}
                </th>
                <th className="px-3 py-3 text-right">
                  {isZh ? '期末借' : 'Closing Dr'}
                </th>
                <th className="px-4 py-3 text-right">
                  {isZh ? '期末贷' : 'Closing Cr'}
                </th>
              </tr>
            </thead>
            <tbody>
              {report.accounts.map((row) => (
                <tr
                  key={row.accountStableId}
                  className="border-t border-slate-100"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.accountName}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {row.accountClass}
                      {row.accountType ? ` · ${row.accountType}` : ''}
                      {!row.isActive
                        ? isZh
                          ? ' · 已停用'
                          : ' · Inactive'
                        : ''}
                    </div>
                  </td>
                  <MoneyCell cents={row.openingDebitBalanceCents} />
                  <MoneyCell cents={row.openingCreditBalanceCents} />
                  <MoneyCell cents={row.periodDebitCents} />
                  <MoneyCell cents={row.periodCreditCents} />
                  <MoneyCell cents={row.closingDebitBalanceCents} />
                  <MoneyCell cents={row.closingCreditBalanceCents} last />
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                <td className="px-4 py-3">{isZh ? '合计' : 'Total'}</td>
                <MoneyCell cents={report.totals.openingDebitBalanceCents} />
                <MoneyCell cents={report.totals.openingCreditBalanceCents} />
                <MoneyCell cents={report.totals.periodDebitCents} />
                <MoneyCell cents={report.totals.periodCreditCents} />
                <MoneyCell cents={report.totals.closingDebitBalanceCents} />
                <MoneyCell cents={report.totals.closingCreditBalanceCents} last />
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function BalanceMovementStatement({
  report,
  isZh,
}: {
  report: AccountingBalanceMovementReport;
  isZh: boolean;
}) {
  const allBridgesReconciled =
    report.bridge.opening.reconciliationCents === 0 &&
    report.bridge.period.reconciliationCents === 0 &&
    report.bridge.closing.reconciliationCents === 0;
  const openingCopy = report.openingBasis.zeroOpeningDisclaimerRequired
    ? isZh
      ? `从 ${report.accountingStartDate} 起按 $0 期初计算，仅表示 SanQ 已记录交易产生的累计变动；不代表现实银行、现金或其他账户的绝对余额。`
      : `Calculated from a $0 opening at ${report.accountingStartDate}. This shows cumulative movement created by recorded SanQ transactions and does not represent absolute real-world bank, cash, or other account balances.`
    : isZh
      ? '期初来自已记录的 OPENING_BALANCE Journal；当前报表仍不声明现实账户绝对余额，因此不是正式资产负债表。'
      : 'Opening values come from recorded OPENING_BALANCE Journals. The current statement still does not claim absolute real-world balances and is not a formal Balance Sheet.';

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              {isZh ? '资产负债变动表' : 'Balance Movement Statement'}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              {isZh
                ? '基于 canonical Trial Balance 的累计变动视图；当前不作为正式资产负债表。'
                : 'A cumulative movement view derived from canonical Trial Balance; it is not presented as a formal Balance Sheet.'}
            </p>
          </div>
          <StatusBadge tone={allBridgesReconciled ? 'good' : 'warn'}>
            {allBridgesReconciled
              ? isZh
                ? '三段桥接均平衡'
                : 'All bridges reconciled'
              : isZh
                ? '桥接未平衡'
                : 'Bridge out of balance'}
          </StatusBadge>
        </div>
        <div className="mt-4">
          <StatementMeta report={report} isZh={isZh} />
        </div>
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {openingCopy}
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <MovementSectionCard
          title={isZh ? '资产变动' : 'Assets movement'}
          section={report.assets}
          isZh={isZh}
        />
        <MovementSectionCard
          title={isZh ? '负债变动' : 'Liabilities movement'}
          section={report.liabilities}
          isZh={isZh}
        />
        <MovementSectionCard
          title={isZh ? '直接权益变动' : 'Direct equity movement'}
          section={report.directEquity}
          isZh={isZh}
        />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold">
          {isZh ? '累计留存收益桥接' : 'Recorded earnings bridge'}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          {isZh
            ? 'Recorded Earnings = Revenue - Expense；收入与费用不会伪装成资产负债账户。'
            : 'Recorded Earnings = Revenue - Expense; revenue and expense are not presented as balance-sheet accounts.'}
        </p>
        <div className="mt-4 space-y-3">
          <MovementRow
            label={isZh ? '收入' : 'Revenue'}
            amounts={report.earningsBridge.revenue}
            isZh={isZh}
          />
          <MovementRow
            label={isZh ? '费用' : 'Expense'}
            amounts={report.earningsBridge.expense}
            isZh={isZh}
          />
          <MovementRow
            label={isZh ? '累计留存收益' : 'Recorded earnings'}
            amounts={report.earningsBridge.recordedEarnings}
            isZh={isZh}
            strong
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold">
          {isZh ? '平衡校验' : 'Reconciliation'}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          {isZh
            ? 'Assets - Liabilities - Direct Equity - Recorded Earnings = 0'
            : 'Assets - Liabilities - Direct Equity - Recorded Earnings = 0'}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <ReconciliationCard
            label={isZh ? '期初' : 'Opening'}
            cents={report.bridge.opening.reconciliationCents}
            isZh={isZh}
          />
          <ReconciliationCard
            label={isZh ? '本期' : 'Period'}
            cents={report.bridge.period.reconciliationCents}
            isZh={isZh}
          />
          <ReconciliationCard
            label={isZh ? '期末' : 'Closing'}
            cents={report.bridge.closing.reconciliationCents}
            isZh={isZh}
          />
        </div>
      </section>
    </div>
  );
}

function BalanceTotalCard({
  label,
  debit,
  credit,
  isZh,
}: {
  label: string;
  debit: number;
  credit: number;
  isZh: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <MiniAmount label={isZh ? '借方' : 'Debit'} cents={debit} />
        <MiniAmount label={isZh ? '贷方' : 'Credit'} cents={credit} />
      </div>
    </div>
  );
}

function MiniAmount({ label, cents }: { label: string; cents: number }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{money(cents)}</p>
    </div>
  );
}

function MoneyCell({ cents, last = false }: { cents: number; last?: boolean }) {
  return (
    <td className={`${last ? 'px-4' : 'px-3'} py-3 text-right tabular-nums`}>
      {cents === 0 ? '—' : money(cents)}
    </td>
  );
}

function MovementSectionCard({
  title,
  section,
  isZh,
}: {
  title: string;
  section: AccountingBalanceMovementSection;
  isZh: boolean;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3">
        <MiniAmount
          label={isZh ? '期初' : 'Opening'}
          cents={section.openingCumulativeCents}
        />
        <MiniAmount
          label={isZh ? '本期' : 'Period'}
          cents={section.periodMovementCents}
        />
        <MiniAmount
          label={isZh ? '期末' : 'Closing'}
          cents={section.closingCumulativeCents}
        />
      </div>
      <div className="mt-4 space-y-3">
        {section.accounts.map((row) => (
          <MovementAccountRow key={row.accountStableId} row={row} isZh={isZh} />
        ))}
        {!section.accounts.length ? (
          <p className="text-sm text-slate-500">
            {isZh ? '当前区间没有账户变动。' : 'No account movement in this range.'}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function MovementAccountRow({
  row,
  isZh,
}: {
  row: AccountingBalanceMovementAccountRow;
  isZh: boolean;
}) {
  return (
    <div className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{row.accountName}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {row.accountType ?? (isZh ? '分类账户' : 'Class account')}
            {!row.isActive ? (isZh ? ' · 已停用' : ' · Inactive') : ''}
          </p>
        </div>
        <span className="text-sm font-semibold tabular-nums">
          {money(row.closingCumulativeCents)}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {isZh ? '本期' : 'Period'} {money(row.periodMovementCents)}
      </p>
    </div>
  );
}

function MovementRow({
  label,
  amounts,
  isZh,
  strong = false,
}: {
  label: string;
  amounts: AccountingBalanceMovementAmounts;
  isZh: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={`border-b border-slate-100 pb-3 text-sm last:border-0 ${strong ? 'font-semibold' : ''}`}
    >
      <p>{label}</p>
      <div className="mt-2 grid grid-cols-3 gap-3">
        <MiniAmount
          label={isZh ? '期初' : 'Opening'}
          cents={amounts.openingCumulativeCents}
        />
        <MiniAmount
          label={isZh ? '本期' : 'Period'}
          cents={amounts.periodMovementCents}
        />
        <MiniAmount
          label={isZh ? '期末' : 'Closing'}
          cents={amounts.closingCumulativeCents}
        />
      </div>
    </div>
  );
}

function ReconciliationCard({
  label,
  cents,
  isZh,
}: {
  label: string;
  cents: number;
  isZh: boolean;
}) {
  const reconciled = cents === 0;
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{money(cents)}</p>
      <p
        className={`mt-1 text-xs ${reconciled ? 'text-emerald-700' : 'text-red-700'}`}
      >
        {reconciled
          ? isZh
            ? '已平衡'
            : 'Reconciled'
          : isZh
            ? '未平衡'
            : 'Out of balance'}
      </p>
    </div>
  );
}
