import type { PropsWithChildren } from 'react';
import type { ResourceState } from './types';

type ModuleSectionProps = PropsWithChildren<{
  label: string;
  className?: string;
}>;

function ModuleSection({ children, label, className = 'space-y-4' }: ModuleSectionProps) {
  return <section aria-label={label} data-ubereats-module={label} className={className}>{children}</section>;
}

export function ResourceStatus({ state, retry }: { state: ResourceState; retry: () => void }) {
  return <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
    <span>{state.loading ? '加载中…' : `最后更新：${state.lastUpdated ? new Date(state.lastUpdated).toLocaleString() : '尚未加载'}`}</span>
    {state.error ? <><span className="text-red-700">{state.error}</span><button type="button" className="rounded border px-2 py-0.5" onClick={retry}>重试</button></> : null}
  </div>;
}

export function OAuthConnectionPanel({ children }: PropsWithChildren) {
  return <ModuleSection label="oauth-connection">{children}</ModuleSection>;
}
export function StoreMappingPanel({ children }: PropsWithChildren) {
  return <ModuleSection label="store-mapping-and-menu">{children}</ModuleSection>;
}
export function MenuDraftPanel({ children }: PropsWithChildren) {
  return <ModuleSection label="menu-draft">{children}</ModuleSection>;
}
export function PublishHistoryPanel({ children }: PropsWithChildren) {
  return <ModuleSection label="publish-history">{children}</ModuleSection>;
}
export function OrdersPanel({ children }: PropsWithChildren) {
  return <ModuleSection label="pending-orders" className="rounded-xl border bg-white p-4">{children}</ModuleSection>;
}
export function ReconciliationPanel({ children }: PropsWithChildren) {
  return <ModuleSection label="reconciliation-reports">{children}</ModuleSection>;
}
export function OperationsTicketsPanel({ children }: PropsWithChildren) {
  return <ModuleSection label="operations-tickets">{children}</ModuleSection>;
}
