'use client';

import { Clock3, Info, Printer, Store } from 'lucide-react';
import type { Locale } from '@/lib/i18n/locales';
import {
  channelLabel,
  confidenceLabel,
  formatDateTimeInZone,
  formatMinutes,
} from './formatters';
import {
  CoverageCard,
  SmallFact,
} from './BusinessReportPrimitives';
import type { BusinessOperationsReportView } from './types';

export function ExecutionHealth({
  report,
  locale,
}: {
  report: BusinessOperationsReportView;
  locale: Locale;
}) {
  const isZh = locale === 'zh';
  const prep = report.operations.prep;
  const queue = report.operations.recentQueue;

  return (
    <section id="execution" className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-2">
          <Clock3 className="size-5 text-[#87362E]" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              {isZh ? '执行健康 · 备餐' : 'Execution health · Prep'}
            </h2>
            <p className="text-xs text-slate-500">
              {isZh
                ? '基于 makingAt → readyAt；不是客户端估算。'
                : 'Based on makingAt → readyAt; not a browser-side estimate.'}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <SmallFact
            label={isZh ? '样本量' : 'Samples'}
            value={String(prep.sampleCount)}
          />
          <SmallFact label="p50" value={formatMinutes(prep.p50Minutes, locale)} />
          <SmallFact label="p90" value={formatMinutes(prep.p90Minutes, locale)} />
        </div>

        <div className="mt-4 overflow-x-auto">
          {prep.byChannel.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
              {isZh ? '暂无渠道级备餐样本。' : 'No channel-level prep samples.'}
            </p>
          ) : (
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-semibold">
                    {isZh ? '渠道' : 'Channel'}
                  </th>
                  <th className="px-2 py-2 text-right font-semibold">
                    {isZh ? '样本' : 'Samples'}
                  </th>
                  <th className="px-2 py-2 text-right font-semibold">p50</th>
                  <th className="px-2 py-2 text-right font-semibold">p90</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {prep.byChannel.map((row) => (
                  <tr key={row.channel}>
                    <td className="px-2 py-2.5 font-medium text-slate-800">
                      {channelLabel(row.channel, locale)}
                    </td>
                    <td className="px-2 py-2.5 text-right text-slate-600">
                      {row.sampleCount}
                    </td>
                    <td className="px-2 py-2.5 text-right text-slate-600">
                      {formatMinutes(row.p50Minutes, locale)}
                    </td>
                    <td className="px-2 py-2.5 text-right text-slate-600">
                      {formatMinutes(row.p90Minutes, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-2">
          <Store className="size-5 text-[#87362E]" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              {isZh ? 'Today-only 最近队列' : 'Today-only recent queue'}
            </h2>
            <p className="text-xs text-slate-500">
              {queue.available
                ? isZh
                  ? `严格使用 C1 最近 ${queue.windowHours} 小时 bounded queue；不会把历史 stale making/ready 重新算入。`
                  : `Uses C1's bounded ${queue.windowHours}-hour queue only; historical stale making/ready rows are not re-counted.`
                : isZh
                  ? '该队列只在所选区间恰好为门店 Today 时可用。'
                  : 'This queue is available only when the selected range is exactly the store-local Today.'}
            </p>
          </div>
        </div>

        {queue.available ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <SmallFact
                label={isZh ? '制作中 / making' : 'Making'}
                value={String(queue.makingCount)}
              />
              <SmallFact
                label={isZh ? '待取 / ready' : 'Ready'}
                value={String(queue.readyCount)}
              />
            </div>
            <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              <div className="flex items-center justify-between gap-3">
                <span>
                  {isZh ? '最早 making 创建时间' : 'Oldest making created'}
                </span>
                <strong className="font-semibold text-slate-800">
                  {formatDateTimeInZone(
                    queue.oldestMakingCreatedAt,
                    report.timezone,
                    locale,
                  )}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>
                  {isZh ? '最早 ready 创建时间' : 'Oldest ready created'}
                </span>
                <strong className="font-semibold text-slate-800">
                  {formatDateTimeInZone(
                    queue.oldestReadyCreatedAt,
                    report.timezone,
                    locale,
                  )}
                </strong>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            {isZh
              ? '非 Today 区间不展示当前队列。'
              : 'Current queue is hidden outside Today.'}
          </div>
        )}
      </div>
    </section>
  );
}

export function CoverageAndLimitations({
  report,
  locale,
}: {
  report: BusinessOperationsReportView;
  locale: Locale;
}) {
  const isZh = locale === 'zh';
  const currentStatus = report.storeContext.currentStatus;

  return (
    <section
      id="coverage"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex items-center gap-2">
        <Info className="size-5 text-slate-500" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            {isZh ? 'Coverage / 局限' : 'Coverage / limitations'}
          </h2>
          <p className="text-xs text-slate-500">
            {isZh
              ? '把“已知事实”和“当前没有 authority 的指标”分开显示。'
              : 'Separates available owner facts from metrics that currently have no reliable authority.'}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CoverageCard
          title={isZh ? '比较置信度' : 'Comparison confidence'}
          value={confidenceLabel(report.comparison.confidence, locale)}
          detail={
            isZh
              ? `${report.comparison.comparablePeriods} 个可比历史区间`
              : `${report.comparison.comparablePeriods} comparable periods`
          }
        />
        <CoverageCard
          title={isZh ? '门店营业上下文' : 'Store operating context'}
          value={report.coverage.storeOperatingContext}
          detail={
            isZh
              ? '当前营业时间/暂停状态只能描述现在，不能当作历史日期事实。'
              : 'Current hours/pause status describe now only, not historical dates.'
          }
        />
        <CoverageCard
          title={isZh ? '打印健康' : 'Print health'}
          value={report.coverage.printHealth}
          detail={
            isZh
              ? 'C2 不建立 Reporting → POS/Print 新依赖。'
              : 'C2 does not create a Reporting → POS/Print dependency.'
          }
          icon={<Printer className="size-4" aria-hidden="true" />}
        />
        <CoverageCard
          title={isZh ? '订单 / 备餐事实' : 'Orders / prep facts'}
          value={`${report.coverage.orders} / ${report.coverage.prepTiming}`}
          detail={
            isZh
              ? `首个覆盖探测订单：${report.coverage.firstObservedOrderInProbe ?? '未观察到'}`
              : `First observed Order in probe: ${report.coverage.firstObservedOrderInProbe ?? 'none observed'}`
          }
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          <p className="font-semibold text-slate-800">
            {isZh
              ? '当前门店状态（仅当前）'
              : 'Current store status (current only)'}
          </p>
          <p className="mt-1">
            {isZh ? '门店启用' : 'Store active'}:{' '}
            {report.storeContext.isActive ? 'Yes' : 'No'} ·{' '}
            {isZh ? '按当前排班开放' : 'Open by current schedule'}:{' '}
            {currentStatus.isOpenBySchedule ? 'Yes' : 'No'} ·{' '}
            {isZh ? '当前临时暂停' : 'Temporarily closed now'}:{' '}
            {currentStatus.isTemporarilyClosed ? 'Yes' : 'No'}
          </p>
          <p className="mt-1 font-mono text-[10px] text-slate-400">
            {report.storeStableId} · {report.timezone}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          <p className="font-semibold text-slate-800">
            {isZh ? '本页明确不提供' : 'Explicitly not provided here'}
          </p>
          <p className="mt-1">
            {isZh
              ? 'Gross Sales、Net Revenue、Tax、Tips、Provider fees、Settlement、Tender mix、P&L、账户余额，以及没有可靠 authority 的支付拒付率、Web 转化率、配送效率、历史分类销售、Promotion ROI、退款发生趋势。'
              : 'Gross Sales, Net Revenue, Tax, Tips, Provider fees, Settlement, Tender mix, P&L, account balances, or unsupported payment-decline, Web-conversion, delivery-efficiency, historical-category, promotion-ROI, and refund-occurrence trends.'}
          </p>
        </div>
      </div>
    </section>
  );
}
