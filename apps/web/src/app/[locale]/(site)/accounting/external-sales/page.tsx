'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';

import { apiFetch, getApiErrorMessage } from '@/lib/api/client';
import type { AccountingAuditLog } from '../contracts/audit';
import type {
  AccountingExternalSaleDetail,
  AccountingExternalSaleFormOptions,
  AccountingExternalSaleListItem,
  AccountingExternalSaleSettlement,
  AccountingExternalSaleSettlementsList,
  AccountingExternalSalesList,
} from '../contracts/external-sales';
import { ExternalSaleCreateForm } from './external-sale-create-form';
import { ExternalSaleDetail } from './external-sale-detail';
import { ExternalSaleSettlementForm } from './external-sale-settlement-form';
import { money } from './external-sales-utils';

type View = 'history' | 'sale' | 'settlement' | 'detail';

export default function ExternalSalesPage() {
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale === 'zh' ? 'zh' : 'en';
  const isZh = locale === 'zh';
  const [view, setView] = useState<View>('history');
  const [sales, setSales] = useState<AccountingExternalSaleListItem[]>([]);
  const [settlements, setSettlements] = useState<
    AccountingExternalSaleSettlement[]
  >([]);
  const [options, setOptions] =
    useState<AccountingExternalSaleFormOptions | null>(null);
  const [selectedDetail, setSelectedDetail] =
    useState<AccountingExternalSaleDetail | null>(null);
  const [auditLogs, setAuditLogs] = useState<AccountingAuditLog[]>([]);
  const [salePrefill, setSalePrefill] =
    useState<AccountingExternalSaleDetail | null>(null);
  const [settlementPrefill, setSettlementPrefill] =
    useState<AccountingExternalSaleSettlement | null>(null);
  const [initialSettlementSaleStableId, setInitialSettlementSaleStableId] =
    useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadBase = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const [saleList, settlementList, formOptions] = await Promise.all([
        apiFetch<AccountingExternalSalesList>(
          '/accounting/external-sales?limit=100',
        ),
        apiFetch<AccountingExternalSaleSettlementsList>(
          '/accounting/external-sales/settlements?limit=100',
        ),
        apiFetch<AccountingExternalSaleFormOptions>(
          '/accounting/external-sales/options',
        ),
      ]);
      setSales(saleList.sales);
      setSettlements(settlementList.settlements);
      setOptions(formOptions);
    } catch (error) {
      setFeedback(
        getApiErrorMessage(
          error,
          isZh ? '加载外部销售失败。' : 'Failed to load external sales.',
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAuditLogs = useCallback(
    async (entityType: string, entityId: string) =>
      apiFetch<AccountingAuditLog[]>(
        `/accounting/audit-logs?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
      ),
    [],
  );

  const loadDetail = useCallback(
    async (externalSaleStableId: string) => {
      setDetailLoading(true);
      setFeedback(null);
      try {
        const detail = await apiFetch<AccountingExternalSaleDetail>(
          `/accounting/external-sales/${encodeURIComponent(externalSaleStableId)}`,
        );
        const auditGroups = await Promise.all([
          loadAuditLogs(
            'ACCOUNTING_EXTERNAL_SALE',
            detail.externalSaleStableId,
          ),
          ...detail.settlements.map((settlement) =>
            loadAuditLogs(
              'ACCOUNTING_EXTERNAL_SALE_SETTLEMENT',
              settlement.settlementStableId,
            ),
          ),
        ]);
        const mergedAudit = auditGroups
          .flat()
          .sort(
            (left, right) =>
              new Date(right.createdAt).getTime() -
              new Date(left.createdAt).getTime(),
          );
        setSelectedDetail(detail);
        setAuditLogs(mergedAudit);
        setView('detail');
      } catch (error) {
        setFeedback(
          getApiErrorMessage(
            error,
            isZh ? '加载销售详情失败。' : 'Failed to load sale detail.',
          ),
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [loadAuditLogs],
  );

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  const refreshSelected = useCallback(async () => {
    await loadBase();
    if (selectedDetail) {
      await loadDetail(selectedDetail.externalSaleStableId);
    }
  }, [loadBase, loadDetail, selectedDetail]);

  const openNewSale = () => {
    setSalePrefill(null);
    setView('sale');
  };

  const openSettlement = (externalSaleStableId?: string) => {
    setSettlementPrefill(null);
    setInitialSettlementSaleStableId(externalSaleStableId ?? null);
    setView('settlement');
  };

  const startSaleCorrection = (detail: AccountingExternalSaleDetail) => {
    setSalePrefill(detail);
    setView('sale');
  };

  const startSettlementCorrection = (
    settlement: AccountingExternalSaleSettlement,
  ) => {
    setSettlementPrefill(settlement);
    setInitialSettlementSaleStableId(
      settlement.allocations[0]?.externalSaleStableId ?? null,
    );
    setView('settlement');
  };

  const handleSaleSaved = async (externalSaleStableId: string) => {
    setSalePrefill(null);
    await loadBase();
    await loadDetail(externalSaleStableId);
  };

  const handleSettlementSaved = async () => {
    const returnSaleStableId =
      initialSettlementSaleStableId ??
      settlementPrefill?.allocations[0]?.externalSaleStableId ??
      null;
    setSettlementPrefill(null);
    setInitialSettlementSaleStableId(null);
    await loadBase();
    if (returnSaleStableId) {
      await loadDetail(returnSaleStableId);
    } else {
      setView('history');
    }
  };

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div>
          <p className="text-sm font-medium text-[#87362E]">
            {isZh ? 'Accounting · External Sales' : 'Accounting · External Sales'}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950 sm:text-3xl">
            {isZh ? '外部销售与应收' : 'External sales & receivables'}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {isZh
              ? '用于超市供货、团购、企业/B2B 等不经过 SanQ Order/POS 的真实销售。金额、应收、账户资格、冲销和 Journal 都由 Accounting 后端权威校验。'
              : 'For wholesale, group-buy, corporate/B2B and other real sales that do not originate from SanQ Order/POS. Amounts, receivables, account eligibility, reversals and Journals remain Accounting-owned.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="navigation">
          <ViewButton
            active={view === 'history' || view === 'detail'}
            onClick={() => setView('history')}
          >
            {isZh ? '历史与应收' : 'History & AR'}
          </ViewButton>
          <ViewButton active={view === 'sale'} onClick={openNewSale}>
            {isZh ? '新建销售' : 'New sale'}
          </ViewButton>
          <ViewButton
            active={view === 'settlement'}
            onClick={() => openSettlement()}
          >
            {isZh ? '登记回款/扣费' : 'Record settlement'}
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
          {isZh ? '正在读取外部销售权威数据…' : 'Loading External Sales authority…'}
        </p>
      ) : null}

      {view === 'history' ? (
        <HistoryPanel
          sales={sales}
          settlements={settlements}
          isZh={isZh}
          detailLoading={detailLoading}
          onSelectSale={(id) => void loadDetail(id)}
          onCreateSettlement={openSettlement}
        />
      ) : null}

      {view === 'detail' && selectedDetail ? (
        <ExternalSaleDetail
          detail={selectedDetail}
          auditLogs={auditLogs}
          isZh={isZh}
          onRefresh={refreshSelected}
          onCreateSettlement={openSettlement}
          onCorrectSale={startSaleCorrection}
          onCorrectSettlement={startSettlementCorrection}
        />
      ) : null}

      {view === 'sale' && options ? (
        <ExternalSaleCreateForm
          key={salePrefill?.externalSaleStableId ?? 'new-sale'}
          options={options}
          prefill={salePrefill}
          isZh={isZh}
          onSaved={(id) => void handleSaleSaved(id)}
          onCancelPrefill={() => setSalePrefill(null)}
        />
      ) : null}

      {view === 'settlement' && options ? (
        <ExternalSaleSettlementForm
          key={
            settlementPrefill?.settlementStableId ??
            initialSettlementSaleStableId ??
            'new-settlement'
          }
          options={options}
          sales={sales}
          prefill={settlementPrefill}
          initialSaleStableId={initialSettlementSaleStableId}
          isZh={isZh}
          onSaved={() => void handleSettlementSaved()}
          onCancelPrefill={() => {
            setSettlementPrefill(null);
            setInitialSettlementSaleStableId(null);
          }}
        />
      ) : null}
    </div>
  );
}

function HistoryPanel({
  sales,
  settlements,
  isZh,
  detailLoading,
  onSelectSale,
  onCreateSettlement,
}: {
  sales: AccountingExternalSaleListItem[];
  settlements: AccountingExternalSaleSettlement[];
  isZh: boolean;
  detailLoading: boolean;
  onSelectSale: (externalSaleStableId: string) => void;
  onCreateSettlement: (externalSaleStableId: string) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">
              {isZh ? '销售 / 应收历史' : 'Sales / receivable history'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isZh
                ? '未结余额来自 canonical Journal AR 与有效结算，不由页面重算。'
                : 'Outstanding balances come from canonical Journal AR and live settlements, not browser accounting.'}
            </p>
          </div>
          {detailLoading ? (
            <span className="text-xs text-slate-500">
              {isZh ? '正在读取详情…' : 'Loading detail…'}
            </span>
          ) : null}
        </div>
        <div className="mt-4 space-y-3">
          {sales.map((sale) => (
            <article
              key={sale.externalSaleStableId}
              className="rounded-xl border border-slate-200 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{sale.counterpartyName}</p>
                    <SaleStatus status={sale.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {sale.occurredOn} · {sale.classificationStableId}
                  </p>
                  <p className="mt-1 break-all font-mono text-[11px] text-slate-400">
                    {sale.externalSaleStableId}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">
                    {isZh ? '未结应收' : 'Outstanding'}
                  </p>
                  <p className="text-lg font-semibold">
                    {money(sale.outstandingCents)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onSelectSale(sale.externalSaleStableId)}
                  className="min-h-10 rounded-xl border px-3 py-2 text-sm font-semibold"
                >
                  {isZh ? '详情 / 审计' : 'Detail / audit'}
                </button>
                {sale.status !== 'REVERSED' && sale.outstandingCents > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      onCreateSettlement(sale.externalSaleStableId)
                    }
                    className="min-h-10 rounded-xl border border-[#87362E]/30 px-3 py-2 text-sm font-semibold text-[#762f28]"
                  >
                    {isZh ? '登记回款' : 'Record settlement'}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
          {sales.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3 py-5 text-sm text-slate-500">
              {isZh ? '还没有外部销售记录。' : 'No external sales yet.'}
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold">
          {isZh ? '最近结算' : 'Recent settlements'}
        </h2>
        <div className="mt-4 space-y-3">
          {settlements.map((settlement) => (
            <div
              key={settlement.settlementStableId}
              className="rounded-xl border border-slate-200 p-3"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-medium">{settlement.counterpartyName}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {settlement.settlementOn}
                  </p>
                </div>
                <p className="font-semibold">
                  {money(settlement.appliedReceivableCents)}
                </p>
              </div>
              <p className="mt-2 break-all font-mono text-[11px] text-slate-400">
                {settlement.settlementStableId}
              </p>
              <span
                className={
                  settlement.reversedAt
                    ? 'mt-2 inline-flex rounded-full bg-slate-200 px-2 py-1 text-xs text-slate-700'
                    : 'mt-2 inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-800'
                }
              >
                {settlement.reversedAt ? 'REVERSED' : 'POSTED'}
              </span>
            </div>
          ))}
          {settlements.length === 0 ? (
            <p className="text-sm text-slate-500">
              {isZh ? '还没有结算记录。' : 'No settlements yet.'}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function SaleStatus({ status }: { status: AccountingExternalSaleListItem['status'] }) {
  const className =
    status === 'OPEN'
      ? 'bg-amber-100 text-amber-900'
      : status === 'PARTIALLY_SETTLED'
        ? 'bg-blue-100 text-blue-900'
        : status === 'SETTLED'
          ? 'bg-emerald-100 text-emerald-900'
          : 'bg-slate-200 text-slate-700';
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${className}`}>
      {status}
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
