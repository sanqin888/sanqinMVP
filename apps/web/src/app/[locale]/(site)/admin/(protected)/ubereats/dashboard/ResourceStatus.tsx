import type { ResourceState } from '../types';
export function ResourceStatus({ state, retry }: { state: ResourceState; retry: () => void }) {
  return <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>{state.loading ? '加载中…' : `最后更新：${state.lastUpdated ? new Date(state.lastUpdated).toLocaleString() : '尚未加载'}`}</span>{state.error ? <><span className="text-red-700">{state.error}</span><button type="button" className="rounded border px-2 py-0.5" onClick={retry}>重试</button></> : null}</div>;
}
