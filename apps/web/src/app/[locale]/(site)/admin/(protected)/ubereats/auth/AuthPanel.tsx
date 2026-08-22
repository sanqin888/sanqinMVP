"use client";
import { useState } from 'react';
import { uberApiFetch } from '../api/uberAdminApi';
import type { RunAction } from '../hooks/useUberMutationState';
import type { OAuthConnectionResponse, OAuthConnectUrlResponse, UberIntegrationConfigResponse, UberStore, UberStorePrepTimeResponse, UberStoreStatusResponse } from '../types';

function safeTime(input?: string | null) { return input ? new Date(input).toLocaleString() : '-'; }
export function AuthPanel({ connectUrl, connection, stores, retry, actionLoading, setActionError, runAction }: { connectUrl: OAuthConnectUrlResponse | null; connection: OAuthConnectionResponse | null; stores: UberStore[]; retry: () => Promise<void>; actionLoading: Record<string, boolean>; setActionError: (message: string | null) => void; runAction: RunAction }) {
  const [integratorStoreId, setIntegratorStoreId] = useState('');
  const [posStoreIdDrafts, setPosStoreIdDrafts] = useState<Record<string, string>>({});
  const [provisionPayload, setProvisionPayload] = useState('{\n  "is_order_manager": true\n}');
  const [integrationConfigs, setIntegrationConfigs] = useState<Record<string, UberIntegrationConfigResponse>>({});
  const [storeStatuses, setStoreStatuses] = useState<Record<string, UberStoreStatusResponse>>({});
  const [prepTimeDrafts, setPrepTimeDrafts] = useState<Record<string, string>>({});
  const [prepTimes, setPrepTimes] = useState<Record<string, UberStorePrepTimeResponse>>({});
  const connectionId = connection?.connectionId ?? '';
  const integrationPath = (storeId: string) => `/integrations/ubereats/oauth/stores/${encodeURIComponent(storeId)}/integration-config`;
  const storeStatusPath = (storeId: string) => `/integrations/ubereats/oauth/stores/${encodeURIComponent(storeId)}/status`;
  const storePrepTimePath = (storeId: string) => `/integrations/ubereats/oauth/stores/${encodeURIComponent(storeId)}/prep-time`;
  const integrationPayload = () => {
    try {
      const parsed = JSON.parse(provisionPayload) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      return { ...(parsed as Record<string, unknown>), ...(integratorStoreId.trim() ? { integrator_store_id: integratorStoreId.trim() } : {}) };
    } catch {
      setActionError('Integration payload 不是合法 JSON object');
      return null;
    }
  };
  const readIntegration = (store: UberStore) => {
    if (!connectionId) return setActionError('缺少 Uber connectionId');
    void runAction(`integration-get-${store.storeId}`, () => uberApiFetch<UberIntegrationConfigResponse>(`${integrationPath(store.storeId)}?connectionId=${encodeURIComponent(connectionId)}`).then((config) => {
      setIntegrationConfigs((current) => ({ ...current, [store.storeId]: config }));
      return config;
    }), `已读取 ${store.storeName ?? store.storeId} 的 Integration Config`, false);
  };
  const updateIntegration = (store: UberStore) => {
    if (!connectionId) return setActionError('缺少 Uber connectionId');
    const payload = integrationPayload();
    if (!payload) return;
    void runAction(`integration-update-${store.storeId}`, () => uberApiFetch(integrationPath(store.storeId), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectionId, payload }),
    }).then(() => uberApiFetch<UberIntegrationConfigResponse>(`${integrationPath(store.storeId)}?connectionId=${encodeURIComponent(connectionId)}`)).then((config) => {
      setIntegrationConfigs((current) => ({ ...current, [store.storeId]: config }));
      return config;
    }), `已更新并核验 ${store.storeName ?? store.storeId} 的 Integration Config`);
  };
  const removeIntegration = (store: UberStore) => {
    if (!connectionId) return setActionError('缺少 Uber connectionId');
    if (!window.confirm(`确定从 Uber 永久移除「${store.storeName ?? store.storeId}」的 Integration 吗？完成后需要重新 Activate 才能恢复。`)) return;
    void runAction(`integration-remove-${store.storeId}`, () => uberApiFetch(`${integrationPath(store.storeId)}?connectionId=${encodeURIComponent(connectionId)}`, { method: 'DELETE' }).then((result) => {
      setIntegrationConfigs((current) => { const next = { ...current }; delete next[store.storeId]; return next; });
      setStoreStatuses((current) => { const next = { ...current }; delete next[store.storeId]; return next; });
      setPrepTimes((current) => { const next = { ...current }; delete next[store.storeId]; return next; });
      return result;
    }), `已移除 ${store.storeName ?? store.storeId} 的 Uber Integration`);
  };
  const readStoreStatus = (store: UberStore) => {
    if (!connectionId) return setActionError('缺少 Uber connectionId');
    void runAction(`store-status-get-${store.storeId}`, () => uberApiFetch<UberStoreStatusResponse>(`${storeStatusPath(store.storeId)}?connectionId=${encodeURIComponent(connectionId)}`).then((status) => {
      setStoreStatuses((current) => ({ ...current, [store.storeId]: status }));
      return status;
    }), `已读取 ${store.storeName ?? store.storeId} 的 Uber Store Status`, false);
  };
  const updateStorePrepTime = (store: UberStore) => {
    if (!connectionId) return setActionError('缺少 Uber connectionId');
    const seconds = Number(prepTimeDrafts[store.storeId]);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 10800) return setActionError('Prep Time 必须是 1 到 10800 的整数秒数');
    void runAction(`store-prep-time-${store.storeId}`, () => uberApiFetch<UberStorePrepTimeResponse>(storePrepTimePath(store.storeId), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectionId, defaultPrepTimeSeconds: seconds }),
    }).then((prepTime) => {
      setPrepTimes((current) => ({ ...current, [store.storeId]: prepTime }));
      return prepTime;
    }), `已更新 ${store.storeName ?? store.storeId} 的 Uber 默认 Prep Time`);
  };
  return <section aria-label="oauth-connection" className="space-y-4">
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">A. 环境配置</h3>
              <p className="break-all whitespace-pre-wrap text-sm text-slate-600">Authorize URL: {connectUrl?.authorizeUrl ?? '-'}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">B. 商户授权（{connection ? 'OAuth Connected' : '未连接'}）</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => connectUrl?.authorizeUrl && navigator.clipboard.writeText(connectUrl.authorizeUrl)}>复制 Connect URL</button>
                <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => window.open('/api/v1/integrations/ubereats/oauth/start', '_blank', 'noopener,noreferrer')}>打开 Uber OAuth</button>
                <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void retry()}>刷新授权状态</button>
              </div>
              <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                <p className="break-all whitespace-pre-wrap">connectionId：{connection?.connectionId ?? '-'}</p>
                <p className="break-all whitespace-pre-wrap">scope：{connection?.scope ?? '-'}</p>
                <p className="break-all whitespace-pre-wrap">tokenType：{connection?.tokenType ?? '-'}</p>
                <p>expiresAt：{safeTime(connection?.expiresAt)}</p>
                <p>connectedAt：{safeTime(connection?.connectedAt)}</p>
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">C. 商户门店发现 + D. Integration Config + E. Store Management</h3>
              <p className="mt-1 text-xs text-slate-500">本地打印房间 Store ID 只用于将 Uber 订单路由到打印机，不会修改 Uber 门店的 External Store ID 或 Integration Config。</p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <input className="rounded border px-3 py-2" placeholder="SANQ Store ID（integrator_store_id）" value={integratorStoreId} onChange={(e) => setIntegratorStoreId(e.target.value)} />
                <textarea rows={5} className="rounded border px-3 py-2 font-mono text-xs" value={provisionPayload} onChange={(e) => setProvisionPayload(e.target.value)} />
              </div>
              <p className="mt-1 text-xs text-slate-500">上方 JSON 同时用于 Activate 与 PATCH；后端固定保留 scheduled order webhook 和 webhooks_version=1.0.0。</p>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b text-left text-slate-500"><th className="px-2 py-2">Uber Store ID</th><th className="px-2 py-2">Store Name</th><th className="px-2 py-2">Location</th><th className="px-2 py-2">Provision</th><th className="px-2 py-2">本地打印房间 Store ID</th><th className="px-2 py-2">操作</th></tr></thead>
                  <tbody>
                    {stores.map((s) => (
                      <tr key={s.storeId} className="border-b last:border-0">
                        <td className="break-all whitespace-pre-wrap px-2 py-2 font-mono text-xs">{s.storeId}</td>
                        <td className="px-2 py-2">{s.storeName ?? '-'}</td>
                        <td className="break-all whitespace-pre-wrap px-2 py-2">{s.locationSummary ?? '-'}</td>
                        <td className="px-2 py-2">{s.isProvisioned ? 'Provisioned' : s.isMapped ? 'Store Mapped' : '待确认'}</td>
                        <td className="min-w-56 px-2 py-2">
                          <div className="flex gap-2">
                            <input aria-label={`${s.storeName ?? s.storeId} 本地打印房间 Store ID`} className="min-w-0 flex-1 rounded border px-2 py-1 font-mono text-xs" value={posStoreIdDrafts[s.storeId] ?? s.posExternalStoreId ?? ''} placeholder="例如 4750_Yonge_Street" onChange={(event) => setPosStoreIdDrafts((current) => ({ ...current, [s.storeId]: event.target.value }))} />
                            <button
                              type="button"
                              className="rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                              disabled={actionLoading[`pos-store-${s.storeId}`] || !(posStoreIdDrafts[s.storeId] ?? s.posExternalStoreId ?? '').trim() || (posStoreIdDrafts[s.storeId] ?? s.posExternalStoreId ?? '').trim() === (s.posExternalStoreId ?? '')}
                              onClick={() => {
                                const posExternalStoreId = (posStoreIdDrafts[s.storeId] ?? '').trim();
                                void runAction(`pos-store-${s.storeId}`, () => uberApiFetch(`/integrations/ubereats/oauth/stores/${encodeURIComponent(s.storeId)}/pos-external-store-id`, {
                                  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ posExternalStoreId }),
                                }).then(() => {
                                  setPosStoreIdDrafts((current) => { const next = { ...current }; delete next[s.storeId]; return next; });
                                }), `已更新 ${s.storeName ?? s.storeId} 的 POS Store ID`);
                              }}
                            >
                              {actionLoading[`pos-store-${s.storeId}`] ? '保存中...' : '保存'}
                            </button>
                          </div>
                        </td>
                        <td className="min-w-80 px-2 py-2">
                          <div className="flex flex-wrap gap-2">
                            {!s.isMapped && <button
                              type="button"
                              className="rounded border px-2 py-1 text-xs"
                              onClick={() => void runAction(`select-${s.storeId}`, () => uberApiFetch('/integrations/ubereats/oauth/stores/select', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectionId: connection?.connectionId, storeId: s.storeId, storeName: s.storeName, locationSummary: s.locationSummary, reconnectFromConnectionId: s.requiresReconnect ? s.mappedConnectionId : undefined }),
                              }).then(() => retry()), `已选择 ${s.storeName ?? s.storeId}`)}
                            >{s.requiresReconnect ? '确认重新连接' : '选择此门店'}</button>}
                            <button
                              type="button"
                              className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                              disabled={!s.isMapped || actionLoading[`provision-${s.storeId}`]}
                              onClick={() => {
                                const payload = integrationPayload();
                                if (!payload || !connectionId) return;
                                void runAction(`provision-${s.storeId}`, () => uberApiFetch('/integrations/ubereats/oauth/provision', {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectionId, storeId: s.storeId, payload }),
                                }), `已提交 ${s.storeId} 的 Activate`);
                              }}
                            >
                              {actionLoading[`provision-${s.storeId}`] ? '提交中...' : 'Activate'}
                            </button>
                            <button type="button" className="rounded border px-2 py-1 text-xs disabled:opacity-40" disabled={!s.isProvisioned || actionLoading[`integration-get-${s.storeId}`]} onClick={() => readIntegration(s)}>{actionLoading[`integration-get-${s.storeId}`] ? '读取中...' : '读取 Config'}</button>
                            <button type="button" className="rounded border px-2 py-1 text-xs disabled:opacity-40" disabled={!s.isProvisioned || actionLoading[`integration-update-${s.storeId}`]} onClick={() => updateIntegration(s)}>{actionLoading[`integration-update-${s.storeId}`] ? '更新中...' : 'PATCH 更新'}</button>
                            <button type="button" className="rounded border px-2 py-1 text-xs disabled:opacity-40" disabled={!s.isProvisioned || actionLoading[`integration-remove-${s.storeId}`]} onClick={() => removeIntegration(s)}>{actionLoading[`integration-remove-${s.storeId}`] ? '移除中...' : 'Remove'}</button>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
                            <button type="button" className="rounded border px-2 py-1 text-xs disabled:opacity-40" disabled={!s.isProvisioned || actionLoading[`store-status-get-${s.storeId}`]} onClick={() => readStoreStatus(s)}>{actionLoading[`store-status-get-${s.storeId}`] ? '读取中...' : '读取 Store Status'}</button>
                            <input aria-label={`${s.storeName ?? s.storeId} Uber 默认 Prep Time 秒数`} className="w-28 rounded border px-2 py-1 font-mono text-xs" inputMode="numeric" placeholder="秒，例如 900" value={prepTimeDrafts[s.storeId] ?? ''} onChange={(event) => setPrepTimeDrafts((current) => ({ ...current, [s.storeId]: event.target.value }))} />
                            <button type="button" className="rounded border px-2 py-1 text-xs disabled:opacity-40" disabled={!s.isProvisioned || actionLoading[`store-prep-time-${s.storeId}`]} onClick={() => updateStorePrepTime(s)}>{actionLoading[`store-prep-time-${s.storeId}`] ? '更新中...' : '更新 Prep Time'}</button>
                          </div>
                          {storeStatuses[s.storeId] && <p className="mt-2 text-xs text-slate-600">Uber Status：{storeStatuses[s.storeId].status}{storeStatuses[s.storeId].offlineReason ? ` / ${storeStatuses[s.storeId].offlineReason}` : ''}{storeStatuses[s.storeId].isOfflineUntil ? ` / until ${storeStatuses[s.storeId].isOfflineUntil}` : ''}</p>}
                          {prepTimes[s.storeId] && <p className="mt-1 text-xs text-slate-600">Uber 默认 Prep Time：{prepTimes[s.storeId].defaultPrepTimeSeconds} 秒</p>}
                          {integrationConfigs[s.storeId] && <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-50 p-2 text-[11px] leading-4">{JSON.stringify(integrationConfigs[s.storeId], null, 2)}</pre>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
  </section>;
}
