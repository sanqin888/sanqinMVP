'use client';

import { Layers3, PackageOpen, ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import type { Locale } from '@/lib/i18n/locales';
import {
  channelLabel,
  formatCount,
  formatMoneyFromCents,
  formatPercent,
  fulfillmentLabel,
} from './formatters';
import type {
  BusinessOperationsReportView,
  BusinessReportDimensionRow,
} from './types';

export function ChangeExplanation({
  report,
  locale,
}: {
  report: BusinessOperationsReportView;
  locale: Locale;
}) {
  const isZh = locale === 'zh';

  return (
    <section
      id="why-change"
      className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]"
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          {isZh ? '波动归因' : 'Why did it change?'}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-slate-950">
          {isZh ? '订单总额变化拆解' : 'Order-total movement decomposition'}
        </h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {isZh
            ? 'C1 使用对称分解：订单量效应 + 平均订单额效应精确回收到订单总额变化。'
            : 'C1 uses a symmetric decomposition: volume effect + average-order effect reconciles exactly to the Order-total movement.'}
        </p>

        <div className="mt-5 space-y-3">
          <EffectRow
            label={isZh ? '订单量效应' : 'Order count effect'}
            value={report.decomposition.volumeEffectCents}
            total={report.decomposition.orderTotalChangeCents}
            locale={locale}
          />
          <EffectRow
            label={isZh ? '平均订单额效应' : 'Average-order effect'}
            value={report.decomposition.averageOrderEffectCents}
            total={report.decomposition.orderTotalChangeCents}
            locale={locale}
          />
        </div>

        <div className="mt-4 rounded-xl bg-slate-950 px-4 py-3 text-white">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-300">
              {isZh ? '订单总额总变化' : 'Total Order-total change'}
            </span>
            <strong className="text-base">
              {formatMoneyFromCents(
                report.decomposition.orderTotalChangeCents,
                locale,
                { signed: true },
              )}
            </strong>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-2">
          <Layers3 className="size-5 text-[#87362E]" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              {isZh ? '渠道与履约定位' : 'Channel & fulfillment attribution'}
            </h2>
            <p className="text-xs text-slate-500">
              {isZh
                ? '即使总量接近预期，也保留单一渠道/履约方式的 current vs expected 证据。'
                : 'Dimension-level current vs expected remains visible even when the aggregate looks normal.'}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <DimensionMiniList
            title={isZh ? '渠道' : 'Channel'}
            rows={report.byChannel}
            locale={locale}
            labelFor={(key) => channelLabel(key, locale)}
          />
          <DimensionMiniList
            title={isZh ? '履约方式' : 'Fulfillment'}
            rows={report.byFulfillment}
            locale={locale}
            labelFor={(key) => fulfillmentLabel(key, locale)}
          />
        </div>
      </div>
    </section>
  );
}

function EffectRow({
  label,
  value,
  total,
  locale,
}: {
  label: string;
  value: number;
  total: number;
  locale: Locale;
}) {
  const denominator = Math.max(Math.abs(total), Math.abs(value), 1);
  const width = Math.min(100, (Math.abs(value) / denominator) * 100);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <strong className="text-slate-950">
          {formatMoneyFromCents(value, locale, { signed: true })}
        </strong>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-100">
        <div
          className="h-2 rounded-full bg-[#87362E]"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function DimensionMiniList({
  title,
  rows,
  locale,
  labelFor,
}: {
  title: string;
  rows: BusinessReportDimensionRow[];
  locale: Locale;
  labelFor: (key: string) => string;
}) {
  const isZh = locale === 'zh';

  if (rows.length === 0) {
    return (
      <div className="rounded-xl bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="mt-2 text-xs text-slate-500">
          {isZh ? '当前区间暂无数据。' : 'No data in this range.'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-100">
      <div className="border-b border-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-800">
        {title}
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row) => (
          <div key={row.key} className="px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm font-semibold text-slate-800">
                {labelFor(row.key)}
              </span>
              <span className="text-xs font-medium text-slate-500">
                {formatCount(row.current.orderCount, locale)}{' '}
                {isZh ? '单' : 'orders'}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
              <DimensionFact
                label={isZh ? '订单总额' : 'Order total'}
                current={formatMoneyFromCents(
                  row.current.orderTotalCents,
                  locale,
                )}
                expected={formatMoneyFromCents(
                  row.expected.orderTotalCents,
                  locale,
                )}
                delta={formatMoneyFromCents(
                  row.delta.orderTotalCents,
                  locale,
                  { signed: true },
                )}
              />
              <DimensionFact
                label={isZh ? '订单量' : 'Count'}
                current={formatCount(row.current.orderCount, locale)}
                expected={formatCount(row.expected.orderCount, locale)}
                delta={formatCount(row.delta.orderCount, locale, {
                  signed: true,
                })}
              />
              <DimensionFact
                label={isZh ? '平均订单额' : 'AOV'}
                current={formatMoneyFromCents(
                  row.current.averageOrderTotalCents,
                  locale,
                )}
                expected={formatMoneyFromCents(
                  row.expected.averageOrderTotalCents,
                  locale,
                )}
                delta={formatMoneyFromCents(
                  row.delta.averageOrderTotalCents,
                  locale,
                  { signed: true },
                )}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DimensionFact({
  label,
  current,
  expected,
  delta,
}: {
  label: string;
  current: string;
  expected: string;
  delta: string;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-slate-400">{label}</p>
      <p className="mt-0.5 truncate font-semibold text-slate-800">{current}</p>
      <p className="mt-0.5 truncate text-slate-500">
        {expected} · {delta}
      </p>
    </div>
  );
}

export function ItemDemand({
  report,
  locale,
}: {
  report: BusinessOperationsReportView;
  locale: Locale;
}) {
  const [tab, setTab] = useState<'commercial' | 'production'>('commercial');
  const isZh = locale === 'zh';
  const commercial = tab === 'commercial';

  return (
    <section
      id="items"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            {commercial ? (
              <ShoppingBag className="size-5 text-[#87362E]" aria-hidden="true" />
            ) : (
              <PackageOpen className="size-5 text-[#87362E]" aria-hidden="true" />
            )}
            <h2 className="text-lg font-semibold text-slate-950">
              {isZh ? '商品需求' : 'Item demand'}
            </h2>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
            {isZh
              ? '商业商品/套餐与实际制作 component 分开统计；Production items 不分摊套餐收入。'
              : 'Commercial products/packages are separated from component-expanded production demand. No package revenue is allocated to production components.'}
          </p>
        </div>

        <div className="flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setTab('commercial')}
            className={
              commercial
                ? 'rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-950 shadow-sm'
                : 'rounded-lg px-3 py-2 text-xs font-medium text-slate-600'
            }
          >
            {isZh ? '商品/套餐销量' : 'Commercial items'}
          </button>
          <button
            type="button"
            onClick={() => setTab('production')}
            className={
              !commercial
                ? 'rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-950 shadow-sm'
                : 'rounded-lg px-3 py-2 text-xs font-medium text-slate-600'
            }
          >
            {isZh ? '实际制作量' : 'Production items'}
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        {commercial ? (
          report.commercialItems.length === 0 ? (
            <EmptyRows locale={locale} />
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">
                    {isZh ? '商品/套餐' : 'Item / package'}
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {isZh ? '销量' : 'Qty'}
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {isZh ? '历史预期' : 'Expected'}
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {isZh ? '变化' : 'Delta'}
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {isZh ? '涉及订单' : 'Orders'}
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {isZh ? '订单渗透率' : 'Order penetration'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.commercialItems.map((item) => (
                  <tr key={item.productStableId}>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                        {item.productStableId}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">
                      {formatCount(item.quantity, locale)}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatCount(item.expectedQuantity, locale)}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatCount(item.deltaQuantity, locale, {
                        signed: true,
                      })}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatCount(item.orderCount, locale)}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {formatPercent(item.orderPenetrationRate * 100, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : report.productionItems.length === 0 ? (
          <EmptyRows locale={locale} />
        ) : (
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">
                  {isZh ? '制作项' : 'Production item'}
                </th>
                <th className="px-3 py-2 text-right font-semibold">
                  {isZh ? '实际制作量' : 'Quantity'}
                </th>
                <th className="px-3 py-2 text-right font-semibold">
                  {isZh ? '历史预期' : 'Expected'}
                </th>
                <th className="px-3 py-2 text-right font-semibold">
                  {isZh ? '变化' : 'Delta'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.productionItems.map((item) => (
                <tr key={item.productStableId}>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-slate-900">{item.name}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                      {item.productStableId}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-900">
                    {formatCount(item.quantity, locale)}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-600">
                    {formatCount(item.expectedQuantity, locale)}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-600">
                    {formatCount(item.deltaQuantity, locale, {
                      signed: true,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function EmptyRows({ locale }: { locale: Locale }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      {locale === 'zh'
        ? '当前区间暂无商品数据。'
        : 'No item data is available for this range.'}
    </div>
  );
}
