"use client";
import { useState } from 'react';
import { uberApiFetch } from '../api/uberAdminApi';
import type { RunAction } from '../hooks/useUberMutationState';
import type { OAuthConnectionResponse, OAuthConnectUrlResponse, UberStore } from '../types';

function safeTime(input?: string | null) { return input ? new Date(input).toLocaleString() : '-'; }
export function AuthPanel({ connectUrl, connection, stores, retry, actionLoading, setActionError, runAction }: { connectUrl: OAuthConnectUrlResponse | null; connection: OAuthConnectionResponse | null; stores: UberStore[]; retry: () => Promise<void>; actionLoading: Record<string, boolean>; setActionError: (message: string | null) => void; runAction: RunAction }) {
  const [integratorStoreId, setIntegratorStoreId] = useState('');
  const [posStoreIdDrafts, setPosStoreIdDrafts] = useState<Record<string, string>>({});
  const [provisionPayload, setProvisionPayload] = useState('{\n  "is_order_manager": true\n}');
  return <section aria-label="oauth-connection" className="space-y-4">
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">A. 环境配置</h3>
              <p className="break-all whitespace-pre-wrap text-sm text-slate-600">Authorize URL: {connectUrl?.authorizeUrl ?? '-'}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">B. 商户授权</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => connectUrl?.authorizeUrl && navigator.clipboard.writeText(connectUrl.authorizeUrl)}>复制 Connect URL</button>
                <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => window.open('/api/v1/integrations/ubereats/oauth/start', '_blank', 'noopener,noreferrer')}>打开 Uber OAuth</button>
                <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void retry()}>刷新授权状态</button>
              </div>
              <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                <p className="break-all whitespace-pre-wrap">merchantUberUserId：{connection?.merchantUberUserId ?? '-'}</p>
                <p className="break-all whitespace-pre-wrap">scope：{connection?.scope ?? '-'}</p>
                <p className="break-all whitespace-pre-wrap">tokenType：{connection?.tokenType ?? '-'}</p>
                <p>expiresAt：{safeTime(connection?.expiresAt)}</p>
                <p>connectedAt：{safeTime(connection?.connectedAt)}</p>
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-lg font-semibold">C. 商户门店发现 + D. Provision</h3>
              <p className="mt-1 text-xs text-slate-500">本地打印房间 Store ID 只用于将 Uber 订单路由到打印机，不会修改 Uber 门店的 External Store ID 或 Provision 配置。</p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <input className="rounded border px-3 py-2" placeholder="SANQ Store ID（integrator_store_id）" value={integratorStoreId} onChange={(e) => setIntegratorStoreId(e.target.value)} />
                <textarea rows={5} className="rounded border px-3 py-2 font-mono text-xs" value={provisionPayload} onChange={(e) => setProvisionPayload(e.target.value)} />
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b text-left text-slate-500"><th className="px-2 py-2">Uber Store ID</th><th className="px-2 py-2">Store Name</th><th className="px-2 py-2">Location</th><th className="px-2 py-2">Provision</th><th className="px-2 py-2">本地打印房间 Store ID</th><th className="px-2 py-2">操作</th></tr></thead>
                  <tbody>
                    {stores.map((s) => (
                      <tr key={s.storeId} className="border-b last:border-0">
                        <td className="break-all whitespace-pre-wrap px-2 py-2 font-mono text-xs">{s.storeId}</td>
                        <td className="px-2 py-2">{s.storeName ?? '-'}</td>
                        <td className="break-all whitespace-pre-wrap px-2 py-2">{s.locationSummary ?? '-'}</td>
                        <td className="px-2 py-2">{s.isProvisioned ? '已 provision' : '未 provision'}</td>
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
                              void runAction(`provision-${s.storeId}`, () => uberApiFetch('/integrations/ubereats/oauth/provision', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchantUberUserId: connection?.merchantUberUserId, storeId: s.storeId, payload: { ...payload, integrator_store_id: integratorStoreId || undefined } }),
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
  </section>;
}
