'use client';

import { useCallback, useState } from 'react';
import { AuthPanel } from './auth/AuthPanel';
import { DashboardPanel } from './dashboard/DashboardPanel';
import { useUberMutationState } from './hooks/useUberMutationState';
import { useUberConnectionStores, useUberOperations, useUberOrders, useUberReports } from './hooks/useUberResources';
import { MenuWorkspace } from './menu/MenuWorkspace';
import { OperationsTicketsPanel } from './operations/OperationsTicketsPanel';
import { OrdersPanel } from './orders/OrdersPanel';
import { ReconciliationPanel } from './reconciliation/ReconciliationPanel';
import type { ModuleKey, TicketStatus } from './types';

const MODULES: Array<{ key: ModuleKey; label: string }> = [
  { key: 'dashboard', label: '总览 Dashboard' },
  { key: 'auth', label: '接入与授权' },
  { key: 'store-menu', label: '门店与菜单' },
  { key: 'orders-ops', label: '订单与运营' },
  { key: 'reconciliation-tickets', label: '对账与工单' },
];
const PHASE_LABELS = { QUEUED: '已排队', PROCESSING: '正在处理', WAITING_WEBHOOK: '等待 Uber webhook', RETRYABLE_FAILED: '可重试失败', MANUAL_REVIEW: '需要人工处理', COMPLETED: '完成' } as const;

export function UberEatsConsole() {
  const [active, setActive] = useState<ModuleKey>('dashboard');
  const [ticketStoreFilter, setTicketStoreFilter] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<TicketStatus | ''>('');
  const connectionData = useUberConnectionStores(active === 'dashboard' || active === 'auth' || active === 'store-menu');
  const ordersData = useUberOrders(active === 'orders-ops');
  const operationsData = useUberOperations(active === 'reconciliation-tickets', ticketStoreFilter, ticketStatusFilter);
  const reportsData = useUberReports(active === 'reconciliation-tickets');
  const refreshVisible = useCallback(async () => {
    await Promise.all([connectionData.retry(), ordersData.retry(), operationsData.retry(), reportsData.retry()]);
  }, [connectionData, operationsData, ordersData, reportsData]);
  const mutation = useUberMutationState(refreshVisible);
  const { connectUrl, connection, stores } = connectionData.data;

  return <div className="flex gap-6">
    <aside className="w-64 shrink-0 rounded-xl border border-slate-200 bg-white p-4"><h2 className="mb-3 text-base font-semibold">UberEats 接入台</h2><div className="space-y-2 text-sm">{MODULES.map((item) => <button type="button" key={item.key} onClick={() => setActive(item.key)} className={`w-full rounded-md px-3 py-2 text-left ${active === item.key ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}>{item.label}</button>)}</div></aside>
    <main className="min-w-0 flex-1 space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><h1 className="text-2xl font-bold">UberEats 集成控制台</h1><button type="button" onClick={() => void refreshVisible()} className="rounded-md border px-3 py-1 text-sm hover:bg-slate-100">刷新当前模块</button></div>{mutation.actionMessage ? <p className="mt-1 text-sm text-emerald-700">{mutation.actionMessage}</p> : null}{mutation.actionError ? <p className="mt-1 text-sm text-red-700">{mutation.actionError}</p> : null}{Object.entries(mutation.operations).map(([key, phase]) => <p key={key} className="mt-1 text-xs text-slate-600">{key}：{PHASE_LABELS[phase]}</p>)}</div>
      {active === 'dashboard' ? <DashboardPanel connection={connection} stores={stores} /> : null}
      {active === 'auth' ? <AuthPanel connectUrl={connectUrl} connection={connection} stores={stores} retry={connectionData.retry} actionLoading={mutation.actionLoading} setActionError={mutation.setActionError} runAction={mutation.runAction} /> : null}
      {active === 'store-menu' ? <MenuWorkspace stores={stores} runAction={mutation.runAction} /> : null}
      {active === 'orders-ops' ? <OrdersPanel orders={ordersData.data} resource={ordersData} retry={() => void ordersData.retry()} /> : null}
      {active === 'reconciliation-tickets' ? <section className="grid gap-4 lg:grid-cols-2"><ReconciliationPanel reports={reportsData.data} resource={reportsData} retry={() => void reportsData.retry()} runAction={mutation.runAction} /><OperationsTicketsPanel tickets={operationsData.data} resource={operationsData} retry={() => void operationsData.retry()} storeFilter={ticketStoreFilter} statusFilter={ticketStatusFilter} onStoreFilterChange={setTicketStoreFilter} onStatusFilterChange={setTicketStatusFilter} runAction={mutation.runAction} /></section> : null}
    </main>
  </div>;
}
