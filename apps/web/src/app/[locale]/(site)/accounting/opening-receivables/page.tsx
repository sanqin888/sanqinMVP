'use client';

import {
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useParams } from 'next/navigation';

import { apiFetch, getApiErrorMessage } from '@/lib/api/client';
import type { AccountingAuditLog } from '../contracts/audit';
import type {
  AccountingOpeningReceivable,
  AccountingOpeningReceivableFormOptions,
  AccountingOpeningReceivablesList,
  AccountingOpeningReceivableSettlement,
} from '../contracts/opening-receivables';
import { OpeningReceivableCreateForm } from './opening-receivable-create-form';
import { OpeningReceivableDetail } from './opening-receivable-detail';
import { OpeningReceivableSettlementForm } from './opening-receivable-settlement-form';
import { money } from './opening-receivables-utils';

type View = 'history' | 'opening' | 'settlement' | 'detail';

export default function OpeningReceivablesPage() {
  const params = useParams<{ locale?: string }>();
  const isZh = params?.locale === 'zh';
  const [view, setView] = useState<View>('history');
  const [items, setItems] = useState<AccountingOpeningReceivable[]>([]);
  const [options, setOptions] =
    useState<AccountingOpeningReceivableFormOptions | null>(null);
  const [selected, setSelected] =
    useState<AccountingOpeningReceivable | null>(null);
  const [openingPrefill, setOpeningPrefill] =
    useState<AccountingOpeningReceivable | null>(null);
  const [settlementPrefill, setSettlementPrefill] =
    useState<AccountingOpeningReceivableSettlement | null>(null);
  const [initialSettlementOpeningId, setInitialSettlementOpeningId] =
    useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AccountingAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadBase = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const [openingReceivables, formOptions] = await Promise.all([
        apiFetch<AccountingOpeningReceivablesList>(
          '/accounting/opening-receivables?limit=100',
        ),
        apiFetch<AccountingOpeningReceivableFormOptions>(
          '/accounting/opening-receivables/options',
        ),
      ]);
      setItems(openingReceivables);
      setOptions(formOptions);
    } catch (error) {
      setFeedback(
        getApiErrorMessage(
          error,
          isZh
            ? '加载期初应收失败。'
            : 'Failed to load opening receivables.',
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [isZh]);

  const loadAuditLogs = useCallback(
    async (detail: AccountingOpeningReceivable) => {
      const groups = await Promise.all([
        apiFetch<AccountingAuditLog[]>(
          \`/accounting/audit-logs?entityType=ACCOUNTING_OPENING_RECEIVABLE&entityId=\${encodeURIComponent(detail.openingReceivableStableId)}\`,
        ),
        ...detail.settlements.map((settlement) =>
          apiFetch<AccountingAuditLog[]>(
            \`/accounting/audit-logs?entityType=ACCOUNTING_OPENING_RECEIVABLE_SETTLEMENT&entityId=\${encodeURIComponent(settlement.settlementStableId)}\`,
          ),
        ),
      ]);
      return groups
        .flat()
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime(),
        );
    },
    [],
  );

  const loadDetail = useCallback(
    async (openingReceivableStableId: string) => {
      setFeedback(null);
      try {
        const detail = await apiFetch<AccountingOpeningReceivable>(
          \`/accounting/opening-receivables/\${encodeURIComponent(openingReceivableStableId)}\`,
        );
        setSelected(detail);
        setAuditLogs(await loadAuditLogs(detail));
        setView('detail');
      } catch (error) {
        setFeedback(
          getApiErrorMessage(
            error,
            isZh
              ? '加载期初应收详情失败。'
              : 'Failed to load opening receivable detail.',
          ),
        );
      }
    },
    [isZh, loadAuditLogs],
  );

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  const refreshSelected = useCallback(async () => {
    await loadBase();
    if (selected) {
      await loadDetail(selected.openingReceivableStableId);
    }
  }, [loadBase, loadDetail, selected]);

  const openNewOpeningReceivable = () => {
    setOpeningPrefill(null);
    setView('opening');
  };

  const openSettlement = (openingReceivableStableId?: string) => {
    setSettlementPrefill(null);
    setInitialSettlementOpeningId(openingReceivableStableId ?? null);
    setView('settlement');
  };

  const startOpeningCorrection = (detail: AccountingOpeningReceivable) => {
    setOpeningPrefill(detail);
    setView('opening');
  };

  const startSettlementCorrection = (
    settlement: AccountingOpeningReceivableSettlement,
  ) => {
    setSettlementPrefill(settlement);
    setInitialSettlementOpeningId(settlement.openingReceivableStableId);
    setView('settlement');
  };

  const handleOpeningSaved = async (openingReceivableStableId: string) => {
    setOpeningPrefill(null);
    await loadBase();
    await loadDetail(openingReceivableStableId);
  };

  const handleSettlementSaved = async () => {
    const returnOpeningReceivableStableId =
      initialSettlementOpeningId ??
      settlementPrefill?.openingReceivableStableId ??
      null;
    setSettlementPrefill(null);
    setInitialSettlementOpeningId(null);
    await loadBase();
    if (returnOpeningReceivableStableId) {
      await loadDetail(returnOpeningReceivableStableId);
    } else {
      setView('history');
    }
  };

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div>
          <p className="text-sm font-medium text-[#87362E]">
            Accounting · Opening AR
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950 sm:text-3xl">
            {isZh ? '期初应收' : 'Opening receivables'}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {isZh
              ? '用于会计切换日前已经存在、切换日仍未收回的应收。金额、未结余额、收款账户、冲销和 Journal 均由 Accounting 后端权威校验。'
              : 'For receivables that already existed before the accounting cutover and remained collectible on the opening date. Amounts, outstanding balance, collection account, reversals and Journals remain Accounting-owned.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="navigation">
          <ViewButton
            active={view === 'history' || view === 'detail'}
            onClick={() => setView('history')}
          >
            {isZh ? '历史 / 应收' : 'History / AR'}
          </ViewButton>
          <ViewButton
            active={view === 'opening'}
            onClick={openNewOpeningReceivable}
          >
            {isZh ? '新增期初应收' : 'New opening AR'}
          </ViewButton>
          <ViewButton
            active={view === 'settlement'}
            onClick={() => openSettlement()}
          >
            {isZh ? '登记回款' : 'Record collection'}
          </ViewButton>
        </div>
      </header>

      {feedback ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {feedback}
        </p>
      ) : null}

      {loading && !options ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
          {isZh
            ? '正在读取期初应收权威数据…'
            : 'Loading Opening AR authority…'}
        </p>
      ) : null}

      {view === 'history' ? (
        <HistoryPanel
          items={items}
          isZh={isZh}
          onDetail={(id) => void loadDetail(id)}
          onSettlement={openSettlement}
        />
      ) : null}

      {view === 'opening' && options ? (
        <OpeningReceivableCreateForm
          key={openingPrefill?.openingReceivableStableId ?? 'new-opening'}
          options={options}
          prefill={openingPrefill}
          isZh={isZh}
          onSaved={handleOpeningSaved}
          onCancelPrefill={() => setOpeningPrefill(null)}
        />
      ) : null}

      {view === 'settlement' && options ? (
        <OpeningReceivableSettlementForm
          key={
            settlementPrefill?.settlementStableId ??
            initialSettlementOpeningId ??
            'new-settlement'
          }
          items={items}
          options={options}
          prefill={settlementPrefill}
          initialOpeningReceivableStableId={initialSettlementOpeningId}
          isZh={isZh}
          onSaved={handleSettlementSaved}
          onCancelPrefill={() => setSettlementPrefill(null)}
        />
      ) : null}

      {view === 'detail' && selected ? (
        <OpeningReceivableDetail
          detail={selected}
          auditLogs={auditLogs}
          isZh={isZh}
          onRefresh={refreshSelected}
          onCreateSettlement={openSettlement}
          onCorrectOpeningReceivable={() => startOpeningCorrection(selected)}
          onCorrectSettlement={startSettlementCorrection}
        />
      ) : null}
    </div>
  );
}

function HistoryPanel({
  items,
  isZh,
  onDetail,
  onSettlement,
}: {
  items: AccountingOpeningReceivable[];
  isZh: boolean;
  onDetail: (openingReceivableStableId: string) => void;
  onSettlement: (openingReceivableStableId: string) => void;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold">
          {isZh ? '期初应收历史' : 'Opening AR history'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {isZh
            ? '未结余额来自 canonical Opening Balance Journal 与仍有效的回款 Journal。'
            : 'Outstanding AR comes from the canonical Opening Balance Journal and live collection Journals.'}
        </p>
      </div>

      {items.map((item) => (
        <article
          key={item.openingReceivableStableId}
          className="rounded-xl border border-slate-200 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{item.counterpartyName}</p>
                <Status value={item.status} />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {item.openingDate} · {item.reference ?? '—'}
              </p>
              <p className="mt-1 break-all font-mono text-[11px] text-slate-400">
                {item.openingReceivableStableId}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">
                {isZh ? '未结应收' : 'Outstanding'}
              </p>
              <p className="text-lg font-semibold">
                {money(item.outstandingAmountCents)}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onDetail(item.openingReceivableStableId)}
              className="min-h-10 rounded-xl border px-3 py-2 text-sm font-semibold"
            >
              {isZh ? '详情 / 审计' : 'Detail / audit'}
            </button>
            {item.status !== 'REVERSED' && item.outstandingAmountCents > 0 ? (
              <button
                type="button"
                onClick={() => onSettlement(item.openingReceivableStableId)}
                className="min-h-10 rounded-xl border border-[#87362E]/30 px-3 py-2 text-sm font-semibold text-[#762f28]"
              >
                {isZh ? '登记回款' : 'Record collection'}
              </button>
            ) : null}
          </div>
        </article>
      ))}

      {items.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-3 py-5 text-sm text-slate-500">
          {isZh ? '还没有期初应收记录。' : 'No opening receivables yet.'}
        </p>
      ) : null}
    </section>
  );
}

function Status({ value }: { value: AccountingOpeningReceivable['status'] }) {
  const className =
    value === 'OPEN'
      ? 'bg-amber-100 text-amber-900'
      : value === 'PARTIALLY_SETTLED'
        ? 'bg-blue-100 text-blue-900'
        : value === 'SETTLED'
          ? 'bg-emerald-100 text-emerald-900'
          : 'bg-slate-200 text-slate-700';

  return (
    <span
      className={\`rounded-full px-2 py-1 text-xs font-semibold \${className}\`}
    >
      {value}
    </span>
  );
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'min-h-10 rounded-xl bg-[#87362E] px-3 py-2 text-sm font-semibold text-white'
          : 'min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700'
      }
    >
      {children}
    </button>
  );
}
