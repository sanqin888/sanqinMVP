import type { OAuthConnectionResponse, UberStore } from '../types';
function safeTime(input?: string | null) { return input ? new Date(input).toLocaleString() : '-'; }
export function DashboardPanel({ connection, stores }: { connection: OAuthConnectionResponse | null; stores: UberStore[] }) {
  const provisionedCount = stores.filter((store) => store.isProvisioned).length;
  return <section className="space-y-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
    <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">连接状态</p><p className="mt-2 text-xl font-semibold">{connection?.connectionId ? '已授权' : '未授权'}</p><p className="text-xs text-slate-500">expiresAt: {safeTime(connection?.expiresAt)}</p></div>
    <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">门店绑定状态</p><p className="mt-2 text-xl font-semibold">已发现 {stores.length} / 已 provision {provisionedCount}</p></div>
    <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">Webhook 状态</p><p className="mt-2 text-xl font-semibold">200 ACK + 去重处理</p></div>
    <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">菜单状态</p><p className="mt-2 text-xl font-semibold">进入对账模块查看</p></div>
    <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">运营异常</p><p className="mt-2 text-xl font-semibold">进入工单模块查看</p></div>
  </div></section>;
}
