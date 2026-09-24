'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { Locale } from '@/lib/i18n/locales';
import {
  anomalyHeadline,
  anomalyMetricLabel,
  contributorKeyLabel,
  formatCount,
  formatMetricValue,
  formatMinutes,
  formatMoneyFromCents,
  formatPercent,
} from './formatters';
import {
  ConfidenceBadge,
  SmallFact,
} from './BusinessReportPrimitives';
import type {
  BusinessOperationsReportView,
  BusinessReportConfidence,
} from './types';

export function AttentionSummary({
  report,
  locale,
}: {
  report: BusinessOperationsReportView;
  locale: Locale;
}) {
  const isZh = locale === 'zh';

  if (report.anomalies.length === 0) {
    const lowSample = report.comparison.confidence === 'LOW_SAMPLE';
    return (
      <section
        id="attention"
        className={
          lowSample
            ? 'rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5'
            : 'rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5'
        }
      >
        <div className="flex items-start gap-3">
          {lowSample ? (
            <Info
              className="mt-0.5 size-5 shrink-0 text-amber-700"
              aria-hidden="true"
            />
          ) : (
            <CheckCircle2
              className="mt-0.5 size-5 shrink-0 text-emerald-700"
              aria-hidden="true"
            />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-950">
                {lowSample
                  ? isZh
                    ? '暂时没有足够历史样本判断异常'
                    : 'Not enough history to judge anomalies yet'
                  : isZh
                    ? '当前没有触发 C1 异常阈值的波动'
                    : 'No movement currently crosses the C1 anomaly thresholds'}
              </h2>
              {lowSample ? (
                <ConfidenceBadge
                  confidence={report.comparison.confidence}
                  locale={locale}
                />
              ) : null}
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {lowSample
                ? isZh
                  ? `当前只有 ${report.comparison.comparablePeriods} 个可比历史区间；页面仍展示实际经营数据，但不会把不足样本包装成可靠预期。`
                  : `Only ${report.comparison.comparablePeriods} comparable historical periods are available. Current operating facts are still shown, but the UI will not present weak history as a reliable expectation.`
                : isZh
                  ? '这不代表所有指标“正常”，只表示当前变化没有同时通过样本、绝对/相对幅度和 MAD 波动门槛。'
                  : 'This does not mean every metric is “normal”; it means no movement clears the sample, materiality, and MAD gates together.'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="attention" className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-5 text-amber-600" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            {isZh
              ? '需要关注 / What needs attention'
              : 'What needs attention / 需要关注'}
          </h2>
          <p className="text-xs text-slate-500">
            {isZh
              ? '仅展示已通过 C1 异常策略门槛的经营波动。'
              : 'Only movements that clear the C1 anomaly policy are surfaced here.'}
          </p>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {report.anomalies.map((anomaly) => {
          const isAbove = anomaly.direction === 'ABOVE_EXPECTED';
          const DirectionIcon = isAbove ? TrendingUp : TrendingDown;

          return (
            <article
              key={anomaly.metric}
              className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm sm:p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">
                    {anomalyMetricLabel(anomaly.metric, locale)}
                  </p>
                  <h3 className="mt-1 flex items-center gap-2 text-base font-semibold text-slate-950">
                    <DirectionIcon
                      className={`size-4 ${isAbove ? 'text-rose-600' : 'text-sky-600'}`}
                      aria-hidden="true"
                    />
                    {anomalyHeadline(
                      anomaly.metric,
                      anomaly.direction,
                      locale,
                    )}
                  </h3>
                </div>
                {anomaly.confidence === 'LOW_SAMPLE' ? (
                  <ConfidenceBadge
                    confidence={anomaly.confidence}
                    locale={locale}
                  />
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SmallFact
                  label={isZh ? '当前' : 'Current'}
                  value={formatMetricValue(
                    anomaly.metric,
                    anomaly.current,
                    locale,
                  )}
                />
                <SmallFact
                  label={isZh ? '历史预期' : 'Expected'}
                  value={formatMetricValue(
                    anomaly.metric,
                    anomaly.expected,
                    locale,
                  )}
                />
                <SmallFact
                  label={isZh ? '变化' : 'Delta'}
                  value={formatMetricValue(
                    anomaly.metric,
                    anomaly.absoluteDelta,
                    locale,
                    true,
                  )}
                />
                <SmallFact
                  label={isZh ? '变化幅度' : 'Change'}
                  value={formatPercent(anomaly.percentageDelta, locale, {
                    signed: true,
                  })}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>
                  {isZh ? '可比样本' : 'Comparable samples'}:{' '}
                  {anomaly.comparableSamples}
                </span>
                <span>
                  {isZh ? '触发门槛' : 'Materiality floor'}:{' '}
                  {formatMetricValue(
                    anomaly.metric,
                    anomaly.materialityFloor,
                    locale,
                  )}
                </span>
                <span>
                  MAD:{' '}
                  {anomaly.mad === null
                    ? '—'
                    : formatMetricValue(
                        anomaly.metric,
                        anomaly.mad,
                        locale,
                      )}
                </span>
              </div>

              {anomaly.contributors.length > 0 ? (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold text-slate-700">
                    {isZh
                      ? '主要变化贡献'
                      : 'Largest descriptive contributors'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {anomaly.contributors.map((contributor, index) => (
                      <span
                        key={`${contributor.dimension}-${contributor.key}-${index}`}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700"
                      >
                        {contributor.dimension === 'CHANNEL'
                          ? isZh
                            ? '渠道'
                            : 'Channel'
                          : contributor.dimension === 'FULFILLMENT'
                            ? isZh
                              ? '履约'
                              : 'Fulfillment'
                            : isZh
                              ? '时段'
                              : 'Hour'}
                        {' · '}
                        {contributorKeyLabel(
                          contributor.dimension,
                          contributor.key,
                          locale,
                        )}{' '}
                        <strong className="font-semibold">
                          {formatMetricValue(
                            anomaly.metric,
                            contributor.delta,
                            locale,
                            true,
                          )}
                        </strong>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  expected,
  delta,
  confidence,
  locale,
  note,
}: {
  label: string;
  value: string;
  expected: string;
  delta: string;
  confidence: BusinessReportConfidence;
  locale: Locale;
  note?: string;
}) {
  const isZh = locale === 'zh';

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
        {value}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-slate-400">{isZh ? '历史预期' : 'Expected'}</p>
          <p className="mt-0.5 font-semibold text-slate-700">{expected}</p>
        </div>
        <div>
          <p className="text-slate-400">{isZh ? '变化' : 'Delta'}</p>
          <p className="mt-0.5 font-semibold text-slate-700">{delta}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {confidence === 'LOW_SAMPLE' ? (
          <ConfidenceBadge confidence={confidence} locale={locale} />
        ) : null}
        {note ? (
          <span className="text-[11px] text-slate-400">{note}</span>
        ) : null}
      </div>
    </article>
  );
}

export function CoreMetrics({
  report,
  locale,
}: {
  report: BusinessOperationsReportView;
  locale: Locale;
}) {
  const isZh = locale === 'zh';
  const prep = report.operations.prep;
  const confidence = report.comparison.confidence;
  const p50Delta =
    prep.p50Minutes !== null && prep.expectedP50Minutes !== null
      ? prep.p50Minutes - prep.expectedP50Minutes
      : null;
  const p90Delta =
    prep.p90Minutes !== null && prep.expectedP90Minutes !== null
      ? prep.p90Minutes - prep.expectedP90Minutes
      : null;

  return (
    <section id="core-metrics">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-slate-950">
          {isZh ? '核心经营指标' : 'Core operating metrics'}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {isZh
            ? 'Order total 是订单经营口径，不是 Accounting Revenue / 营业收入。'
            : 'Order total is an operating Order measure, not Accounting Revenue.'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label={isZh ? '订单总额 / Order total' : 'Order total / 订单总额'}
          value={formatMoneyFromCents(report.summary.orderTotalCents, locale)}
          expected={formatMoneyFromCents(
            report.comparison.expected.orderTotalCents,
            locale,
          )}
          delta={formatMoneyFromCents(
            report.comparison.delta.orderTotalCents,
            locale,
            { signed: true },
          )}
          confidence={confidence}
          locale={locale}
        />
        <MetricCard
          label={isZh ? '订单量 / Order count' : 'Order count / 订单量'}
          value={formatCount(report.summary.orderCount, locale)}
          expected={formatCount(
            report.comparison.expected.orderCount,
            locale,
          )}
          delta={formatCount(report.comparison.delta.orderCount, locale, {
            signed: true,
          })}
          confidence={confidence}
          locale={locale}
        />
        <MetricCard
          label={
            isZh
              ? '平均订单额 / Average order total'
              : 'Average order total / 平均订单额'
          }
          value={formatMoneyFromCents(
            report.summary.averageOrderTotalCents,
            locale,
          )}
          expected={formatMoneyFromCents(
            report.comparison.expected.averageOrderTotalCents,
            locale,
          )}
          delta={formatMoneyFromCents(
            report.comparison.delta.averageOrderTotalCents,
            locale,
            { signed: true },
          )}
          confidence={confidence}
          locale={locale}
        />
        <MetricCard
          label="Prep p50"
          value={formatMinutes(prep.p50Minutes, locale)}
          expected={formatMinutes(prep.expectedP50Minutes, locale)}
          delta={formatMinutes(p50Delta, locale, { signed: true })}
          confidence={confidence}
          locale={locale}
          note={`${isZh ? '样本' : 'samples'} ${prep.sampleCount}`}
        />
        <MetricCard
          label="Prep p90"
          value={formatMinutes(prep.p90Minutes, locale)}
          expected={formatMinutes(prep.expectedP90Minutes, locale)}
          delta={formatMinutes(p90Delta, locale, { signed: true })}
          confidence={confidence}
          locale={locale}
          note={`${isZh ? '样本' : 'samples'} ${prep.sampleCount}`}
        />
      </div>

    </section>
  );
}
