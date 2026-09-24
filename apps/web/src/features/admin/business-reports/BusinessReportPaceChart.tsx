'use client';

import { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Locale } from '@/lib/i18n/locales';
import { formatCount, formatMoneyFromCents } from './formatters';
import type { BusinessOperationsReportView } from './types';

type PaceMetric = 'count' | 'total';

export function BusinessReportPaceChart({
  report,
  locale,
}: {
  report: BusinessOperationsReportView;
  locale: Locale;
}) {
  const [metric, setMetric] = useState<PaceMetric>('count');
  const isZh = locale === 'zh';
  const isSingleDay = report.range.from === report.range.to;
  const useHourlyPace = isSingleDay && report.hourlyPace.length > 0;

  const data = useHourlyPace
    ? report.hourlyPace.map((point) => ({
        label: `${String(point.hour).padStart(2, '0')}:00`,
        current:
          metric === 'count'
            ? point.currentCumulativeOrderCount
            : point.currentCumulativeOrderTotalCents,
        expected:
          metric === 'count'
            ? point.expectedCumulativeOrderCount
            : point.expectedCumulativeOrderTotalCents,
      }))
    : report.timeline.map((point) => ({
        label: point.date.slice(5),
        current:
          metric === 'count'
            ? point.current.orderCount
            : point.current.orderTotalCents,
        expected:
          metric === 'count'
            ? point.expected.orderCount
            : point.expected.orderTotalCents,
      }));

  const formatValue = (value: number) =>
    metric === 'count'
      ? formatCount(value, locale)
      : formatMoneyFromCents(value, locale);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            {useHourlyPace
              ? isZh
                ? '今日速度'
                : "Today's pace"
              : isZh
                ? '区间走势'
                : 'Range trend'}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">
            {useHourlyPace
              ? isZh
                ? '实际进度 vs 同星期历史预期'
                : 'Actual pace vs same-weekday expected'
              : isZh
                ? '实际 vs 历史预期'
                : 'Actual vs historical expected'}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
            {useHourlyPace
              ? isZh
                ? '服务端只比较相同门店本地时间进度；今天尚未经过的时段不会拿完整历史日来压高预期。'
                : 'The server compares the same elapsed store-local time only; future hours today are not compared with complete historical days.'
              : isZh
                ? '多日区间按服务端滚动同星期基准展示每日实际值与预期值。'
                : 'Multi-day ranges use the server-owned rolling same-weekday baseline for daily actual and expected values.'}
          </p>
        </div>

        <div className="flex shrink-0 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMetric('count')}
            className={
              metric === 'count'
                ? 'rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-950 shadow-sm'
                : 'rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-950'
            }
          >
            {isZh ? '累计订单量' : 'Cumulative orders'}
          </button>
          <button
            type="button"
            onClick={() => setMetric('total')}
            className={
              metric === 'total'
                ? 'rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-950 shadow-sm'
                : 'rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-950'
            }
          >
            {isZh ? '累计订单总额' : 'Cumulative order total'}
          </button>
        </div>
      </div>

      <div className="mt-5 h-72 w-full sm:h-80">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
            {isZh ? '当前区间没有可绘制的速度数据。' : 'No pace data is available for this range.'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                fontSize={11}
                stroke="#64748b"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={metric === 'total' ? 68 : 42}
                fontSize={11}
                stroke="#64748b"
                tickFormatter={(value: number) =>
                  metric === 'total'
                    ? `$${Math.round(value / 100)}`
                    : String(Math.round(value))
                }
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
                }}
                formatter={(value: number | string | undefined, name: string | number | undefined) => [
                  formatValue(Number(value ?? 0)),
                  name === 'current'
                    ? isZh
                      ? '实际'
                      : 'Actual'
                    : isZh
                      ? '历史预期'
                      : 'Expected',
                ]}
              />
              <Legend
                formatter={(value: string) =>
                  value === 'current'
                    ? isZh
                      ? '实际'
                      : 'Actual'
                    : isZh
                      ? '历史预期'
                      : 'Expected'
                }
              />
              <Line
                type="monotone"
                dataKey="current"
                stroke="#87362E"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="expected"
                stroke="#64748b"
                strokeWidth={2}
                strokeDasharray="6 5"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
