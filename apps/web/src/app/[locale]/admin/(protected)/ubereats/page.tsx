'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

type ModuleKey = 'dashboard' | 'auth' | 'testing' | 'store-menu' | 'orders-ops' | 'reconciliation-tickets';

type ScopeResult = {
  scope: string;
  tokenIssued: boolean;
  apiValidated?: boolean;
  apiSkipped?: boolean;
  status?: number;
  detail?: string;
  reason?: string;
};

type ScopesVerifyResponse = { ok: boolean; results: ScopeResult[] };
type DebugTokenResponse = {
  requestedScope: string | null;
  normalizedScope: string;
  tokenPrefix: string;
  tokenLength: number;
  usedDefaultScopes: boolean;
  forceRefreshed: boolean;
};
type OAuthConnectUrlResponse = { authorizeUrl: string; state: string };
type OAuthConnectionResponse = {
  merchantUberUserId: string;
  scope?: string | null;
  tokenType?: string | null;
  expiresAt?: string | null;
  connectedAt?: string | null;
};
type OAuthStoresResponse = {
  merchantUberUserId?: string;
  stores: Array<{
    storeId: string;
    storeName?: string;
    locationSummary?: string;
    isProvisioned?: boolean;
    provisionedAt?: string | null;
    posExternalStoreId?: string | null;
  }>;
};

type PendingOrder = {
  externalOrderId: string;
  orderStableId: string;
  status: string;
  totalCents: number;
  createdAt: string;
  sourceEventType?: string | null;
};

type PendingOrdersResponse = { items?: PendingOrder[] };
type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
type TicketsResponse = {
  items: Array<{
    ticketStableId: string;
    type: string;
    title: string;
    priority: string;
    status: TicketStatus;
    retryCount: number;
    lastError?: string | null;
    createdAt: string;
  }>;
};

type ReconciliationResponse = {
  items: Array<{
    reportStableId: string;
    totalOrders: number;
    totalAmountCents: number;
    syncedOrders: number;
    pendingOrders: number;
    failedSyncEvents: number;
    discrepancyOrders: number;
    createdAt: string;
  }>;
};

type PriceBookItem = {
  menuItemStableId: string;
  priceCents: number;
  isAvailable: boolean;
  updatedAt: string;
};

type PriceBookResponse = { items: PriceBookItem[] };

type CreatedOrdersResponse = {
  storeId: string;
  orderCount: number;
  requestUrl: string;
  tokenPrefix: string;
  tokenLength: number;
  orders: Array<{ id: string; currentState: string; placedAt: string }>;
};

const MODULES: Array<{ key: ModuleKey; label: string }> = [
  { key: 'dashboard', label: '总览 Dashboard' },
  { key: 'auth', label: '接入与授权' },
  { key: 'testing', label: '测试中心' },
  { key: 'store-menu', label: '门店与菜单' },
  { key: 'orders-ops', label: '订单与运营' },
  { key: 'reconciliation-tickets', label: '对账与工单' },
];

const DEFAULT_SCOPES = ['eats.store', 'eats.order', 'eats.report', 'eats.store.orders.read', 'eats.store.status.write'];

function safeTime(input?: string | null): string {
  if (!input) return '-';
  return new Date(input).toLocaleString();
}

export default function UberEatsAdminPage() {
  const [active, setActive] = useState<ModuleKey>('dashboard');
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [connectUrl, setConnectUrl] = useState<OAuthConnectUrlResponse | null>(null);
  const [connection, setConnection] = useState<OAuthConnectionResponse | null>(null);
  const [stores, setStores] = useState<OAuthStoresResponse['stores']>([]);
  const [scopes, setScopes] = useState<ScopeResult[]>([]);
  const [tokenDebug, setTokenDebug] = useState<DebugTokenResponse | null>(null);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [tickets, setTickets] = useState<TicketsResponse['items']>([]);
  const [reports, setReports] = useState<ReconciliationResponse['items']>([]);
  const [priceBook, setPriceBook] = useState<PriceBookItem[]>([]);
  const [createdOrders, setCreatedOrders] = useState<CreatedOrdersResponse | null>(null);

  const [scopeInput, setScopeInput] = useState('');
  const [verifyStoreId, setVerifyStoreId] = useState('');
  const [verifyOrderId, setVerifyOrderId] = useState('');
  const [integratorStoreId, setIntegratorStoreId] = useState('');
  const [provisionPayload, setProvisionPayload] = useState('{\n  "is_order_manager": true\n}');
  const [ticketStoreFilter, setTicketStoreFilter] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<TicketStatus | ''>('');
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});

  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const setLoadingByKey = (key: string, value: boolean) => {
    setActionLoading((prev) => ({ ...prev, [key]: value }));
  };

  async function runAction(key: string, fn: () => Promise<void>, successText: string, refresh = true) {
    setActionError(null);
    setActionMessage(null);
    setLoadingByKey(key, true);
    try {
      await fn();
      setActionMessage(successText);
      if (refresh) await loadAll();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setLoadingByKey(key, false);
    }
  }

  const loadAll = useCallback(async () => {
    setLoading(true);
    setGlobalError(null);

    const tasks = await Promise.allSettled([
      apiFetch<OAuthConnectUrlResponse>('/integrations/ubereats/oauth/connect-url'),
      apiFetch<OAuthConnectionResponse>('/integrations/ubereats/oauth/connection'),
      apiFetch<ScopesVerifyResponse>('/integrations/ubereats/debug/scopes/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopes: DEFAULT_SCOPES, forceRefresh: false, storeId: verifyStoreId || undefined, orderId: verifyOrderId || undefined }),
      }),
      apiFetch<TicketsResponse>(`/integrations/ubereats/ops/tickets${ticketStoreFilter || ticketStatusFilter ? `?${new URLSearchParams({ ...(ticketStoreFilter ? { storeId: ticketStoreFilter } : {}), ...(ticketStatusFilter ? { status: ticketStatusFilter } : {}) }).toString()}` : ''}`),
      apiFetch<ReconciliationResponse>('/integrations/ubereats/reports/reconciliation?limit=20'),
      apiFetch<PendingOrdersResponse>('/integrations/ubereats/orders/pending'),
      apiFetch<PriceBookResponse>('/integrations/ubereats/price-book'),
      apiFetch<OAuthStoresResponse>('/integrations/ubereats/oauth/stores'),
      apiFetch<CreatedOrdersResponse>('/integrations/ubereats/debug/created-orders'),
    ]);

    const errors: string[] = [];
    const [connect, conn, verify, ticketRes, reportRes, orderRes, priceRes, storeRes, created] = tasks;

    if (connect.status === 'fulfilled') setConnectUrl(connect.value); else errors.push('connect-url');
    if (conn.status === 'fulfilled') setConnection(conn.value); else setConnection(null);
    if (verify.status === 'fulfilled') setScopes(verify.value.results ?? []); else errors.push('scopes verify');
    if (ticketRes.status === 'fulfilled') setTickets(ticketRes.value.items ?? []); else errors.push('tickets');
    if (reportRes.status === 'fulfilled') setReports(reportRes.value.items ?? []); else errors.push('reports');
    if (orderRes.status === 'fulfilled') setPendingOrders(orderRes.value.items ?? []); else errors.push('orders');
    if (priceRes.status === 'fulfilled') {
      setPriceBook(priceRes.value.items ?? []);
      setPriceEdits(Object.fromEntries((priceRes.value.items ?? []).map((item) => [item.menuItemStableId, String(item.priceCents)])));
    } else errors.push('price-book');
    if (storeRes.status === 'fulfilled') {
      setStores(storeRes.value.stores ?? []);
    } else errors.push('oauth stores');
    if (created.status === 'fulfilled') setCreatedOrders(created.value); else setCreatedOrders(null);

    if (errors.length > 0) {
      setGlobalError(`部分区块加载失败：${errors.join('、')}，其余模块仍可使用。`);
    }

    setLoading(false);
  }, [ticketStatusFilter, ticketStoreFilter, verifyOrderId, verifyStoreId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const openTickets = useMemo(() => tickets.filter((t) => t.status !== 'RESOLVED').length, [tickets]);
  const verifiedCount = scopes.filter((s) => s.apiValidated || s.apiSkipped).length;
  const failedCount = scopes.filter((s) => !s.tokenIssued || s.apiValidated === false).length;
  const provisionedCount = stores.filter((s) => s.isProvisioned).length;

  return (
    <div className="flex gap-6">
      <aside className="w-64 shrink-0 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold">UberEats 接入台</h2>
        <div className="space-y-2 text-sm">
          {MODULES.map((item) => (
            <button type="button" key={item.key} onClick={() => setActive(item.key)} className={`w-full rounded-md px-3 py-2 text-left ${active === item.key ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}>
              {item.label}
            </button>
          ))}
        </div>
      </aside>

      <main className="min-w-0 flex-1 space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">UberEats 集成控制台</h1>
            <button type="button" onClick={() => void loadAll()} className="rounded-md border px-3 py-1 text-sm hover:bg-slate-100">{loading ? '刷新中…' : '刷新数据'}</button>
          </div>
          {globalError ? <p className="mt-2 text-sm text-amber-700">{globalError}</p> : null}
          {actionMessage ? <p className="mt-1 text-sm text-emerald-700">{actionMessage}</p> : null}
          {actionError ? <p className="mt-1 text-sm text-red-700">{actionError}</p> : null}
        </div>

        {active === 'dashboard' && (
          <section className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">连接状态</p><p className="mt-2 text-xl font-semibold">{connection?.merchantUberUserId ? '已授权' : '未授权'}</p><p className="text-xs text-slate-500">expiresAt: {safeTime(connection?.expiresAt)}</p></div>
              <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">App Scopes 状态</p><p className="mt-2 text-xl font-semibold">已验证 {verifiedCount} / 失败 {failedCount}</p></div>
              <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">门店绑定状态</p><p className="mt-2 text-xl font-semibold">已发现 {stores.length} / 已 provision {provisionedCount}</p></div>
              <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">Webhook 状态</p><p className="mt-2 text-xl font-semibold">200 ACK + 去重处理</p></div>
              <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">菜单状态</p><p className="mt-2 text-xl font-semibold">{reports[0] ? '有发布/对账记录' : '暂无发布记录'}</p></div>
              <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">运营异常</p><p className="mt-2 text-xl font-semibold">Open Tickets {openTickets}</p></div>
            </div>
          </section>
        )}

        {active === 'auth' && (
          <section className="space-y-4">
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">A. 环境选择</h3>
              <p className="text-sm text-slate-600">Authorize URL: {connectUrl?.authorizeUrl ?? '-'}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">B. 商户授权</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => connectUrl?.authorizeUrl && navigator.clipboard.writeText(connectUrl.authorizeUrl)}>复制 Connect URL</button>
                <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => window.open('/api/v1/integrations/ubereats/oauth/start', '_blank', 'noopener,noreferrer')}>打开 Uber OAuth</button>
                <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void loadAll()}>刷新授权状态</button>
              </div>
              <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                <p>merchantUberUserId：{connection?.merchantUberUserId ?? '-'}</p>
                <p>scope：{connection?.scope ?? '-'}</p>
                <p>tokenType：{connection?.tokenType ?? '-'}</p>
                <p>expiresAt：{safeTime(connection?.expiresAt)}</p>
                <p>connectedAt：{safeTime(connection?.connectedAt)}</p>
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">C. 商户门店发现 + D. Provision</h3>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <input className="rounded border px-3 py-2" placeholder="SANQ Store ID（integrator_store_id）" value={integratorStoreId} onChange={(e) => setIntegratorStoreId(e.target.value)} />
                <textarea rows={5} className="rounded border px-3 py-2 font-mono text-xs" value={provisionPayload} onChange={(e) => setProvisionPayload(e.target.value)} />
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b text-left text-slate-500"><th className="px-2 py-2">Uber Store ID</th><th className="px-2 py-2">Store Name</th><th className="px-2 py-2">Location</th><th className="px-2 py-2">Provision</th><th className="px-2 py-2">POS External Store ID</th><th className="px-2 py-2">操作</th></tr></thead>
                  <tbody>
                    {stores.map((s) => (
                      <tr key={s.storeId} className="border-b last:border-0">
                        <td className="px-2 py-2 font-mono text-xs">{s.storeId}</td>
                        <td className="px-2 py-2">{s.storeName ?? '-'}</td>
                        <td className="px-2 py-2">{s.locationSummary ?? '-'}</td>
                        <td className="px-2 py-2">{s.isProvisioned ? '已 provision' : '未 provision'}</td>
                        <td className="px-2 py-2">{s.posExternalStoreId ?? '-'}</td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                            onClick={() => {
                              let payload: Record<string, unknown>;
                              try {
                                payload = JSON.parse(provisionPayload) as Record<string, unknown>;
                              } catch {
                                setActionError('Provision payload 不是合法 JSON');
                                return;
                              }
                              void runAction(`provision-${s.storeId}`, () => apiFetch('/integrations/ubereats/oauth/provision', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId: s.storeId, payload: { ...payload, integrator_store_id: integratorStoreId || undefined } }),
                              }).then(() => {}), `已提交 ${s.storeId} 的 Provision`);
                            }}
                          >
                            {actionLoading[`provision-${s.storeId}`] ? '提交中...' : '立即 Provision'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {active === 'testing' && (
          <section className="space-y-4">
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">Scopes 验证</h3>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <input className="rounded border px-3 py-2 text-sm" placeholder="storeId（可选）" value={verifyStoreId} onChange={(e) => setVerifyStoreId(e.target.value)} />
                <input className="rounded border px-3 py-2 text-sm" placeholder="orderId（可选）" value={verifyOrderId} onChange={(e) => setVerifyOrderId(e.target.value)} />
                <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => void runAction('verify-scope', async () => {
                  const res = await apiFetch<ScopesVerifyResponse>('/integrations/ubereats/debug/scopes/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scopes: DEFAULT_SCOPES, forceRefresh: true, storeId: verifyStoreId || undefined, orderId: verifyOrderId || undefined }) });
                  setScopes(res.results ?? []);
                }, 'Scopes 验证完成', false)}>重新验证</button>
              </div>
              <table className="mt-3 min-w-full text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="px-2 py-2">Scope</th><th className="px-2 py-2">Token</th><th className="px-2 py-2">API</th><th className="px-2 py-2">status</th><th className="px-2 py-2">detail</th></tr></thead><tbody>{scopes.map((s) => <tr key={s.scope} className="border-b"><td className="px-2 py-2">{s.scope}</td><td className="px-2 py-2">{s.tokenIssued ? '✅' : '❌'}</td><td className="px-2 py-2">{s.apiValidated ? '✅' : s.apiSkipped ? '⏭️' : '❌'}</td><td className="px-2 py-2">{s.status ?? '-'}</td><td className="px-2 py-2">{s.detail ?? s.reason ?? '-'}</td></tr>)}</tbody></table>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border bg-white p-4">
                <h3 className="text-lg font-semibold">Token 调试</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void runAction('token-default', async () => setTokenDebug(await apiFetch<DebugTokenResponse>('/integrations/ubereats/debug/token')), '默认 Token 获取成功', false)}>获取默认 token</button>
                  <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void runAction('token-refresh', async () => setTokenDebug(await apiFetch<DebugTokenResponse>('/integrations/ubereats/debug/token?forceRefresh=true')), 'Token 强制刷新成功', false)}>Force refresh</button>
                </div>
                <div className="mt-2 flex gap-2"><input className="flex-1 rounded border px-3 py-2 text-sm" placeholder="指定 scope" value={scopeInput} onChange={(e) => setScopeInput(e.target.value)} /><button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => void runAction('token-scope', async () => setTokenDebug(await apiFetch<DebugTokenResponse>(`/integrations/ubereats/debug/token?scope=${encodeURIComponent(scopeInput)}`)), '自定义 scope Token 获取成功', false)}>测试</button></div>
                {tokenDebug ? <div className="mt-2 text-sm"><p>requestedScope: {tokenDebug.requestedScope ?? '-'}</p><p>normalizedScope: {tokenDebug.normalizedScope}</p><p>tokenPrefix: {tokenDebug.tokenPrefix}</p><p>tokenLength: {tokenDebug.tokenLength}</p></div> : null}
              </div>

              <div className="rounded-xl border bg-white p-4">
                <h3 className="text-lg font-semibold">Webhook / 状态联调 / Sandbox 订单</h3>
                <button type="button" className="mt-2 rounded border px-3 py-1 text-sm" onClick={() => void runAction('status-sync', () => apiFetch('/integrations/ubereats/store/status/sync', { method: 'POST' }).then(() => {}), '已完成本地状态同步预览')}>{actionLoading['status-sync'] ? '处理中...' : '本地状态同步预览'}</button>
                <div className="mt-3 text-sm">
                  <p>storeId: {createdOrders?.storeId ?? '-'}</p>
                  <p>requestUrl: {createdOrders?.requestUrl ?? '-'}</p>
                  <p>tokenPrefix/tokenLength: {createdOrders ? `${createdOrders.tokenPrefix} / ${createdOrders.tokenLength}` : '-'}</p>
                  <p>created-orders count: {createdOrders?.orderCount ?? 0}</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {active === 'store-menu' && (
          <section className="space-y-4">
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">门店管理</h3>
              <table className="mt-3 min-w-full text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="px-2 py-2">SANQ Store ID</th><th className="px-2 py-2">Uber Store ID</th><th className="px-2 py-2">Uber 名称/地址</th><th className="px-2 py-2">Provision 状态</th></tr></thead><tbody>{stores.map((s) => <tr key={s.storeId} className="border-b"><td className="px-2 py-2">{integratorStoreId || '-'}</td><td className="px-2 py-2">{s.storeId}</td><td className="px-2 py-2">{s.storeName ?? '-'} / {s.locationSummary ?? '-'}</td><td className="px-2 py-2">{s.isProvisioned ? <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-700">已 provision</span> : <span className="rounded bg-amber-100 px-2 py-1 text-amber-700">未 provision</span>}</td></tr>)}</tbody></table>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">Uber Price Book / Publish</h3>
              <table className="mt-3 min-w-full text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="px-2 py-2">menuItemStableId</th><th className="px-2 py-2">Uber 价(cent)</th><th className="px-2 py-2">availability</th><th className="px-2 py-2">操作</th></tr></thead><tbody>{priceBook.map((item) => <tr key={item.menuItemStableId} className="border-b"><td className="px-2 py-2">{item.menuItemStableId}</td><td className="px-2 py-2"><input className="w-28 rounded border px-2 py-1" value={priceEdits[item.menuItemStableId] ?? ''} onChange={(e) => setPriceEdits((prev) => ({ ...prev, [item.menuItemStableId]: e.target.value }))} /></td><td className="px-2 py-2">{item.isAvailable ? '上架' : '下架'}</td><td className="px-2 py-2 flex gap-2"><button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => void runAction(`price-${item.menuItemStableId}`, () => apiFetch(`/integrations/ubereats/price-book/items/${item.menuItemStableId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priceCents: Number(priceEdits[item.menuItemStableId] || item.priceCents), isAvailable: item.isAvailable }) }).then(() => {}), `${item.menuItemStableId} 价格已保存`)}>保存价格</button><button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => void runAction(`avail-${item.menuItemStableId}`, () => apiFetch(`/integrations/ubereats/menu/items/${item.menuItemStableId}/availability`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isAvailable: !item.isAvailable }) }).then(() => {}), `${item.menuItemStableId} 上下架状态已更新`)}>{item.isAvailable ? '下架' : '上架'}</button></td></tr>)}</tbody></table>
              <div className="mt-3 flex gap-2"><button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void runAction('publish-dry', () => apiFetch('/integrations/ubereats/menu/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dryRun: true }) }).then(() => {}), 'Dry Run Publish 成功')}>Dry Run Publish</button><button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void runAction('publish-formal', () => apiFetch('/integrations/ubereats/menu/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dryRun: false }) }).then(() => {}), '正式 Publish 成功')}>正式 Publish</button></div>
            </div>
          </section>
        )}

        {active === 'orders-ops' && (
          <section className="rounded-xl border bg-white p-4">
            <h3 className="text-lg font-semibold">订单与运营</h3>
            <table className="mt-3 min-w-full text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="px-2 py-2">externalOrderId</th><th className="px-2 py-2">orderStableId</th><th className="px-2 py-2">status</th><th className="px-2 py-2">金额</th><th className="px-2 py-2">createdAt</th></tr></thead><tbody>{pendingOrders.map((o) => <tr key={o.externalOrderId} className="border-b"><td className="px-2 py-2">{o.externalOrderId}</td><td className="px-2 py-2">{o.orderStableId}</td><td className="px-2 py-2">{o.status}</td><td className="px-2 py-2">${(o.totalCents / 100).toFixed(2)}</td><td className="px-2 py-2">{safeTime(o.createdAt)}</td></tr>)}</tbody></table>
          </section>
        )}

        {active === 'reconciliation-tickets' && (
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">Reconciliation Reports</h3>
              <button type="button" className="mt-2 rounded border px-3 py-1 text-sm" onClick={() => void runAction('gen-report', () => apiFetch('/integrations/ubereats/reports/reconciliation/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).then(() => {}), '已生成对账报告')}>生成对账报告</button>
              <div className="mt-3 space-y-2 text-sm">{reports.map((r) => <div key={r.reportStableId} className="rounded border p-2"><p>{r.reportStableId}</p><p>totalOrders: {r.totalOrders} / amount: {r.totalAmountCents}</p></div>)}</div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">Ops Tickets</h3>
              <div className="mt-2 grid grid-cols-2 gap-2"><input className="rounded border px-2 py-1 text-sm" placeholder="按 storeId 过滤" value={ticketStoreFilter} onChange={(e) => setTicketStoreFilter(e.target.value)} /><select className="rounded border px-2 py-1 text-sm" value={ticketStatusFilter} onChange={(e) => setTicketStatusFilter(e.target.value as TicketStatus | '')}><option value="">全部状态</option><option value="OPEN">OPEN</option><option value="IN_PROGRESS">IN_PROGRESS</option><option value="RESOLVED">RESOLVED</option></select></div>
              <div className="mt-3 space-y-2 text-sm">{tickets.map((t) => <div key={t.ticketStableId} className="rounded border p-2"><div className="flex items-center justify-between"><p>{t.ticketStableId}</p><button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => void runAction(`retry-${t.ticketStableId}`, () => apiFetch(`/integrations/ubereats/ops/tickets/${t.ticketStableId}/retry`, { method: 'POST' }).then(() => {}), `${t.ticketStableId} 已触发重试`)}>Retry</button></div><p>{t.type} / {t.priority} / {t.status}</p><p>{t.title}</p></div>)}</div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
