import { ResourceStatus } from '../dashboard/ResourceStatus';
import type { PendingOrder, ResourceState } from '../types';

function safeTime(input: string) {
  return new Date(input).toLocaleString();
}

function formatMoney(totalCents: number) {
  return Number.isFinite(totalCents) ? `$${(totalCents / 100).toFixed(2)}` : '—';
}

export function OrdersPanel({
  orders,
  resource,
  retry,
}: {
  orders: PendingOrder[];
  resource: ResourceState;
  retry: () => void;
}) {
  return (
    <section aria-label="pending-orders" className="rounded-xl border bg-white p-4">
      <h3 className="text-lg font-semibold">订单与运营</h3>
      <ResourceStatus state={resource} retry={retry} />
      <table className="mt-3 min-w-full text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="px-2 py-2">Uber订单ID</th>
            <th className="px-2 py-2">SanQ订单ID</th>
            <th className="px-2 py-2">取餐码</th>
            <th className="px-2 py-2">状态</th>
            <th className="px-2 py-2">金额</th>
            <th className="px-2 py-2">创建时间</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.externalOrderId} className="border-b">
              <td
                className="max-w-64 truncate px-2 py-2 font-mono text-xs"
                title={order.externalOrderId}
              >
                {order.externalOrderId}
              </td>
              <td
                className="max-w-48 truncate px-2 py-2 font-mono text-xs"
                title={order.orderStableId ?? undefined}
              >
                {order.orderStableId ?? '—'}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-base font-semibold">
                {order.pickupCode ?? '—'}
              </td>
              <td className="px-2 py-2">{order.status}</td>
              <td className="px-2 py-2">{formatMoney(order.totalCents)}</td>
              <td className="whitespace-nowrap px-2 py-2">{safeTime(order.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
